using System.Collections.Generic;
using System.Reflection;
using Preliy.Flange;
using Preliy.Flange.Common;
using UnityEngine;

public class BoltingFeedTask : RobotTask
{
    [System.Serializable]
    public class HoleEntry
    {
        public Target Frame;
        [Tooltip("홀별 볼트 감지 Inspector (비우면 공용 Inspector 사용)")]
        public HoleBoltInspector Inspector;
        [Tooltip("볼팅 후 플레이스 위치 바로 위로 리트랙트 (로컬 홈)")]
        public bool UseLocalRetract = false;
        [Tooltip("볼팅 후 고정 홈 위치(Targets[0])로 복귀 (ReturnHome 우선)")]
        public bool ReturnHome = true;
        [Tooltip("처음 N번은 볼트를 스폰하지 않음 — 재작업 로직 검증용 (0 = 즉시 스폰)")]
        public int SkipFirstNSpawns = 0;
        [Tooltip("이 스텝 완료 후 다음 스텝까지 대기 시간 (초, 0 = 즉시)")]
        public float StepDelay = 0f;
    }

    [Header("Targets - [0] = 홈(대기) 위치")]
    public List<Target> Targets;

    [Header("Suction Gripper")]
    public Preliy.Flange.Common.Gripper GripperLogic;

    [Header("픽 위치")]
    public Target PickFrame;

    [Header("삽입 홀 목록")]
    public List<HoleEntry> HoleFrames;

    [Header("비전 검사 (공용 Fallback)")]
    public HoleBoltInspector Inspector;

    [Header("재작업 설정")]
    public int MaxAttempts = 3;
    public float InspectDelay = 0.5f;

    [Header("동작 옵션")]
    public bool UseHomePosition = true;
    public float ApproachHeight = 0.1f;
    public float LocalRetractHeight = 0.15f;
    public float GripSettleTime = 0.460f;

    [Header("볼트 자동 공급")]
    [Tooltip("스폰할 볼트 프리팹 (Part 컴포넌트 필수)")]
    public GameObject BoltPrefab;
    [Tooltip("그립 이력 없을 때 폴백 스폰 위치")]
    public Transform SpawnPoint;

    [Header("경로 기록 (선택)")]
    [Tooltip("연결 시 각 스텝의 action/description을 자동으로 기록기에 주입")]
    public TaskPathRecorder PathRecorder;

    // ── VisionHud 호환용 런타임 상태 ──
    public enum VisionPhase { Idle, Working, Scanning, Detected, Failed }
    [System.NonSerialized] public VisionPhase Phase = VisionPhase.Idle;
    [System.NonSerialized] public int CurrentAttempt = 0;
    [System.NonSerialized] public int CurrentHoleIndex = -1;

    // VisionHud가 현재 작업 홀의 Inspector를 동적으로 가져오는 프로퍼티
    public HoleBoltInspector ActiveInspector
    {
        get
        {
            if (CurrentHoleIndex >= 0 && CurrentHoleIndex < HoleFrames.Count)
            {
                var e = HoleFrames[CurrentHoleIndex];
                if (e.Inspector != null) return e.Inspector;
            }
            return Inspector;
        }
    }

    private Vector3 _boltLocalPos;
    private Quaternion _boltLocalRot;
    private bool _gripPoseRecorded;
    private bool _hasBolt;  // SuctionOn/Off/SpawnBolt 상태 추적

    protected override void Program()
    {
        if (!ValidateSetup()) return;

        Phase = VisionPhase.Idle;
        CurrentAttempt = 0;
        _hasBolt = false;

        this.Message(LogType.Log, text: "Start Bolting Feed Task");

        if (UseHomePosition)
        {
            this.Action(() => Rec("return_home", "PTP", "홈 대기 위치로 이동"));
            this.PTP(Targets[0]);
        }

        // 첫 번째 픽 (PickFrame에서)
        var pickPos = PickFrame.transform.position;
        var pickRot = PickFrame.transform.rotation;
        this.Action(() => Rec("approach_pick", "PTP", "볼트 픽 위치로 접근"));
        this.Move(new PTP(pickPos, pickRot));
        this.Action(() => Rec("pick_descend", "LIN", "볼트 픽 — 하강"));
        this.Move(new LIN(pickPos + Vector3.down * ApproachHeight, pickRot));
        this.Action(SuctionOn);
        this.Wait(GripSettleTime);
        this.Action(() => Rec("pick_ascend", "LIN", "볼트 픽 완료 — 상승"));
        this.Move(new LIN(pickPos, pickRot));
        if (UseHomePosition)
        {
            this.Action(() => Rec("return_home", "PTP", "홈 위치로 복귀 (볼트 이송)"));
            this.PTP(Targets[0]);
        }

        // 각 홀 볼팅 — SpawnBolt와 재시도 복귀가 retry block 안에 포함됨
        for (int i = 0; i < HoleFrames.Count; i++)
        {
            int idx = i;
            var entry = HoleFrames[i];
            var inspector = entry.Inspector != null ? entry.Inspector : Inspector;

            this.Action(() => CurrentHoleIndex = idx);  // 현재 홀 인덱스 → VisionHud 동기화

            this.Move(new VerifyRetryInstruction(
                block: BuildHoleBlock(entry, idx),
                isSuccess: () => inspector != null && inspector.IsBoltPresent(),
                maxAttempts: Mathf.Max(1, MaxAttempts),
                settleTime: InspectDelay,
                successMessage: "[BoltingFeed] 볼트 삽입 확인",
                retryMessage: "[BoltingFeed] 볼트 미감지 — 홈 복귀 후 재작업",
                failMessage: "[BoltingFeed] 최대 재시도 초과 — 볼팅 실패",
                onAttemptStart: a => { CurrentAttempt = a; Phase = VisionPhase.Working; },
                onScanStart: () => Phase = VisionPhase.Scanning,
                onResult: ok => Phase = ok ? VisionPhase.Detected : VisionPhase.Failed));

            if (entry.StepDelay > 0f)
                this.Wait(entry.StepDelay);
        }

        this.Action(() => CurrentHoleIndex = -1);  // 완료 후 초기화
        this.Message(LogType.Log, text: "End Bolting Feed Task");
    }

    // retry block 구조:
    //   [홈/로컬 리트랙트 이동] → [볼트 공급, 이미 있으면 스킵] → [홀 접근 + 삽입 + 리프트]
    // 첫 시도: 이미 볼트 있으므로 스폰 스킵, 바로 홀로 이동
    // 재시도: 홈으로 복귀 → 볼트 재공급 → 홀 재시도
    private List<Instruction> BuildHoleBlock(HoleEntry entry, int holeIdx)
    {
        var block = new List<Instruction>();
        var pos = entry.Frame.transform.position;
        var rot = entry.Frame.transform.rotation;
        int n = holeIdx + 1;  // 1-based 표시용

        // 복귀 위치 (재시도 시 볼트 재공급 지점)
        if (entry.ReturnHome && UseHomePosition)
        {
            block.Add(new ActionInstruction(() => Rec("return_home", "PTP", $"홀 {n} 작업 후 홈 위치로 복귀")));
            block.Add(new PTP(Targets[0].transform.position, Targets[0].transform.rotation));
        }
        else if (entry.UseLocalRetract)
        {
            block.Add(new ActionInstruction(() => Rec("local_retract", "PTP", $"홀 {n} 위 로컬 리트랙트 위치로 이동")));
            block.Add(new PTP(pos + Vector3.up * LocalRetractHeight, rot));
        }

        // 볼트 공급 — 처음 N번 스킵 후 스폰 (0 = 항상 스폰)
        int skipped = 0;
        block.Add(new ActionInstruction(() =>
        {
            if (_hasBolt) return;
            if (skipped < entry.SkipFirstNSpawns)
            {
                skipped++;
                if (!IsPreviewBuild)
                    Debug.LogWarning($"[BoltingFeed] 볼트 스폰 스킵 ({skipped}/{entry.SkipFirstNSpawns}) — 재작업 검증 모드", this);
                return;
            }
            SpawnBolt();
        }));
        block.Add(new WaitInstruction(GripSettleTime));

        // 홀 접근 + 삽입 + 리프트
        block.Add(new ActionInstruction(() => Rec("approach_hole",  "PTP", $"홀 {n} 위치로 접근")));
        block.Add(new PTP(pos, rot));
        block.Add(new ActionInstruction(() => Rec("insert_bolt",    "LIN", $"홀 {n} 볼트 삽입 — 하강")));
        block.Add(new LIN(pos + Vector3.down * ApproachHeight, rot));
        block.Add(new ActionInstruction(SuctionOff));
        block.Add(new WaitInstruction(GripSettleTime));
        block.Add(new ActionInstruction(() => Rec("insert_ascend",  "LIN", $"홀 {n} 볼트 삽입 완료 — 상승")));
        block.Add(new LIN(pos, rot));

        return block;
    }

    // PathRecorder에 컨텍스트 주입 (PathRecorder 없으면 no-op)
    private void Rec(string action, string motion, string desc)
    {
        if (PathRecorder == null) return;
        PathRecorder.SetNextContext(action, desc);
        if (motion == "LIN") PathRecorder.SetNextMotionLIN();
        else PathRecorder.SetNextMotionPTP();
    }

    private void SuctionOn()
    {
        if (GripperLogic == null) return;
        GripperLogic.Grip();
        _hasBolt = true;
        PathRecorder?.RecordAction("grip", "볼트 픽 — 그리퍼 파지");

        if (_gripPoseRecorded) return;
        var field = typeof(Preliy.Flange.Common.Gripper)
            .GetField("_parts", BindingFlags.NonPublic | BindingFlags.Instance);
        var parts = field?.GetValue(GripperLogic) as List<Preliy.Flange.Common.Part>;
        if (parts == null || parts.Count == 0) return;
        _boltLocalPos = parts[0].transform.localPosition;
        _boltLocalRot = parts[0].transform.localRotation;
        _gripPoseRecorded = true;
    }

    private void SuctionOff()
    {
        if (GripperLogic != null) GripperLogic.Release();
        _hasBolt = false;
        PathRecorder?.RecordAction("release", "볼트 플레이스 — 그리퍼 해제");
    }

    private void SpawnBolt()
    {
        if (_hasBolt) return;  // 이미 볼트 있으면 스킵 (첫 시도 시)

        if (BoltPrefab == null || GripperLogic == null)
        {
            if (!IsPreviewBuild)
                Debug.LogWarning("[BoltingFeed] BoltPrefab 또는 GripperLogic이 비어 있습니다.", this);
            return;
        }

        Vector3 spawnPos;
        Quaternion spawnRot;
        if (_gripPoseRecorded)
        {
            spawnPos = GripperLogic.transform.TransformPoint(_boltLocalPos);
            spawnRot = GripperLogic.transform.rotation * _boltLocalRot;
        }
        else if (SpawnPoint != null)
        {
            spawnPos = SpawnPoint.position;
            spawnRot = SpawnPoint.rotation;
        }
        else
        {
            if (!IsPreviewBuild)
                Debug.LogWarning("[BoltingFeed] 그립 이력 없음, SpawnPoint도 비어 있어 스폰 불가.", this);
            return;
        }

        var bolt = Instantiate(BoltPrefab, spawnPos, spawnRot);
        var part = bolt.GetComponent<Preliy.Flange.Common.Part>();
        if (part == null) return;

        // 트리거 내부 Instantiate는 OnTriggerEnter가 발동하지 않으므로 리플렉션으로 직접 등록
        var field = typeof(Preliy.Flange.Common.Gripper)
            .GetField("_parts", BindingFlags.NonPublic | BindingFlags.Instance);
        (field?.GetValue(GripperLogic) as List<Preliy.Flange.Common.Part>)?.Add(part);

        SuctionOn();  // _hasBolt = true, 그리퍼에 부착

        if (!IsPreviewBuild)
            Debug.Log("[BoltingFeed] 새 볼트 스폰 및 그리퍼 부착 완료", bolt);
    }

    private bool ValidateSetup()
    {
        bool ok  = true;
        bool log = !IsPreviewBuild;

        if (Controller == null)
        { if (log) Debug.LogError("[BoltingFeed] Controller가 비어 있습니다.", this); ok = false; }

        if (Targets == null || Targets.Count == 0 || Targets[0] == null)
        { if (log) Debug.LogError("[BoltingFeed] Targets[0](홈 위치)이 설정되지 않았습니다.", this); ok = false; }

        if (PickFrame == null)
        { if (log) Debug.LogError("[BoltingFeed] PickFrame이 비어 있습니다.", this); ok = false; }

        if (HoleFrames == null || HoleFrames.Count == 0)
        { if (log) Debug.LogError("[BoltingFeed] HoleFrames가 비어 있습니다.", this); ok = false; }

        if (BoltPrefab == null && log)
            Debug.LogWarning("[BoltingFeed] BoltPrefab이 비어 있습니다. 볼트가 스폰되지 않습니다.", this);

        return ok;
    }
}
