using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Preliy.Flange;
using Preliy.Flange.Common;
using UnityEngine;

/// <summary>
/// result.json 포맷의 파일을 읽어 로봇을 제어하는 태스크.
///
/// 지원 action 타입:
///   move_cartesian / (그 외 모든 액션) — PTP 또는 LIN 이동 (motion 필드로 구분)
///   grip           — 그리퍼 파지 (볼트 픽)
///   release        — 그리퍼 해제 (볼트 플레이스)
///   wait           — delay 필드(초) 만큼 대기
///
/// result3.json 같이 pick_descend / local_retract / insert_bolt 등 커스텀 액션도
/// motion 필드(PTP/LIN)에 따라 이동으로 처리됩니다.
///
/// JSON 확장 필드 (선택):
///   rx, ry, rz — 도(degree) 단위 오일러 회전. 없으면 DefaultRotationEuler 사용.
/// </summary>
public class JsonDrivenTask : RobotTask
{
    [Header("JSON 파일")]
    [Tooltip("Assets 폴더 기준 상대 경로 또는 절대 경로 (예: result.json)")]
    public string JsonPath = "result.json";
    [Tooltip("programs 배열에서 사용할 id. 비우면 첫 번째 program 사용.")]
    public string ProgramId = "";

    [Header("그리퍼")]
    public Preliy.Flange.Common.Gripper GripperLogic;

    [Header("볼트 자동 공급 (선택)")]
    [Tooltip("grip 액션 시 볼트 워크파츠 자동 스폰. 비우면 그리퍼만 파지.")]
    public GameObject BoltPrefab;
    [Tooltip("그립 이력 없을 때 폴백 스폰 위치")]
    public Transform SpawnPoint;

    [Header("기본값")]
    [Tooltip("JSON에 rx/ry/rz 없을 때 사용할 기본 회전 (도 단위)")]
    public Vector3 DefaultRotationEuler = Vector3.zero;
    [Tooltip("grip / release 후 대기 시간. JSON delay가 0이면 이 값 사용.")]
    public float GripSettleTime = 0.46f;

    // ── 볼트 스폰 상태 ──
    private Vector3    _boltLocalPos;
    private Quaternion _boltLocalRot;
    private bool       _gripPoseRecorded;
    private bool       _hasBolt;

    // ── JSON 역직렬화 구조 (public 필수 — JsonUtility.FromJson은 private 중첩 클래스 역직렬화 불가) ──
    [Serializable]
    public class SequenceStep
    {
        public int    step;
        public string action  = "move_cartesian";
        public float  x, y, z;
        public float  rx, ry, rz;
        public string motion  = "PTP";
        public float  delay   = 0f;
        public string description = "";
    }

    [Serializable]
    public class ProgramData
    {
        public string id;
        public string name;
        public List<SequenceStep> sequence;
    }

    [Serializable]
    public class JsonRoot
    {
        public List<ProgramData> programs;
    }

    // ── 실행 ──
    protected override void Program()
    {
        if (Controller == null)
        {
            if (!IsPreviewBuild)
                Debug.LogError("[JsonDrivenTask] Controller가 비어 있습니다. Inspector에서 연결하세요.", this);
            return;
        }

        _hasBolt          = false;
        _gripPoseRecorded = false;

        var steps = LoadSteps();
        if (steps == null || steps.Count == 0) return;

        this.Message(LogType.Log, text: $"[JsonDrivenTask] 시작 — {steps.Count} 스텝");

        foreach (var step in steps)
        {
            var pos = new Vector3(step.x, step.y, step.z);
            // JSON에 회전값이 있으면 그대로 사용, 없으면(모두 0) DefaultRotationEuler 폴백
            bool hasRot = step.rx != 0f || step.ry != 0f || step.rz != 0f;
            var rot = hasRot
                ? Quaternion.Euler(step.rx, step.ry, step.rz)
                : Quaternion.Euler(DefaultRotationEuler);

            switch (step.action.ToLowerInvariant())
            {
                case "grip":
                    this.Action(Grip);
                    this.Wait(step.delay > 0f ? step.delay : GripSettleTime);
                    break;

                case "release":
                    this.Action(Release);
                    this.Wait(step.delay > 0f ? step.delay : GripSettleTime);
                    break;

                case "wait":
                    this.Wait(step.delay > 0f ? step.delay : 1f);
                    break;

                default:
                    // move_cartesian, pick_descend, local_retract, insert_bolt, insert_ascend 등
                    // grip/release/wait 이외 모든 action은 motion 필드에 따라 이동으로 처리
                    if (step.motion.ToUpperInvariant() == "LIN")
                        this.Move(new LIN(pos, rot));
                    else
                        this.Move(new PTP(pos, rot));

                    if (step.delay > 0f)
                        this.Wait(step.delay);
                    break;
            }
        }

        this.Message(LogType.Log, text: "[JsonDrivenTask] 완료");
    }

    // ── JSON 로드 ──
    private List<SequenceStep> LoadSteps()
    {
        string fullPath = Path.IsPathRooted(JsonPath)
            ? JsonPath
            : Path.Combine(Application.dataPath, JsonPath);

        if (!File.Exists(fullPath))
        {
            if (!IsPreviewBuild)
                Debug.LogError($"[JsonDrivenTask] 파일을 찾을 수 없습니다: {fullPath}", this);
            return null;
        }

        JsonRoot root;
        try
        {
            root = JsonUtility.FromJson<JsonRoot>(File.ReadAllText(fullPath));
        }
        catch (Exception e)
        {
            if (!IsPreviewBuild)
                Debug.LogError($"[JsonDrivenTask] JSON 파싱 오류: {e.Message}", this);
            return null;
        }

        if (root?.programs == null || root.programs.Count == 0)
        {
            if (!IsPreviewBuild)
                Debug.LogError("[JsonDrivenTask] JSON에 programs가 없습니다.", this);
            return null;
        }

        var program = string.IsNullOrEmpty(ProgramId)
            ? root.programs[0]
            : root.programs.Find(p => p.id == ProgramId);

        if (program == null)
        {
            if (!IsPreviewBuild)
                Debug.LogError($"[JsonDrivenTask] program id '{ProgramId}'를 찾을 수 없습니다.", this);
            return null;
        }

        if (!IsPreviewBuild)
            Debug.Log($"[JsonDrivenTask] '{program.id}' 로드 완료 — {program.sequence?.Count ?? 0} 스텝", this);

        return program.sequence;
    }

    private void Grip()
    {
        if (GripperLogic == null) return;
        if (BoltPrefab != null && !_hasBolt)
            SpawnAndGrip();
        else
        {
            GripperLogic.Grip();
            _hasBolt = true;
            RecordGripPose();
        }
    }

    private void Release()
    {
        if (GripperLogic != null) GripperLogic.Release();
        _hasBolt = false;
    }

    private void SpawnAndGrip()
    {
        Vector3    spawnPos;
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
                Debug.LogWarning("[JsonDrivenTask] 그립 이력 없음, SpawnPoint도 비어 있어 스폰 불가.", this);
            GripperLogic.Grip();
            _hasBolt = true;
            return;
        }

        var bolt = Instantiate(BoltPrefab, spawnPos, spawnRot);
        var part = bolt.GetComponent<Preliy.Flange.Common.Part>();
        if (part != null)
        {
            var field = typeof(Preliy.Flange.Common.Gripper)
                .GetField("_parts", BindingFlags.NonPublic | BindingFlags.Instance);
            (field?.GetValue(GripperLogic) as List<Preliy.Flange.Common.Part>)?.Add(part);
        }

        GripperLogic.Grip();
        _hasBolt = true;
        RecordGripPose();

        if (!IsPreviewBuild)
            Debug.Log("[JsonDrivenTask] 볼트 스폰 및 그리퍼 부착 완료", bolt);
    }

    private void RecordGripPose()
    {
        if (_gripPoseRecorded || GripperLogic == null) return;
        var field = typeof(Preliy.Flange.Common.Gripper)
            .GetField("_parts", BindingFlags.NonPublic | BindingFlags.Instance);
        var parts = field?.GetValue(GripperLogic) as List<Preliy.Flange.Common.Part>;
        if (parts == null || parts.Count == 0) return;
        _boltLocalPos     = parts[0].transform.localPosition;
        _boltLocalRot     = parts[0].transform.localRotation;
        _gripPoseRecorded = true;
    }
}
