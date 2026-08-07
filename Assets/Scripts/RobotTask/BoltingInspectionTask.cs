using System;
using System.Collections;
using System.Collections.Generic;
using Preliy.Flange;
using Preliy.Flange.Common;
using UnityEngine;

/// <summary>
/// 석션 그리퍼 기반 "볼팅 + 비전 검사 + 재작업" 태스크.
///
/// 동작:
///   1) 홈 위치로 이동
///   2) [한 사이클] 볼트 픽 → 홈에 플레이스(삽입)
///   3) HoleBoltInspector로 홈에 볼트가 들어갔는지 검사
///      - 들어감  → 성공, 다음 작업으로
///      - 안 들어감 → 픽부터 전체 재시도 (최대 MaxAttempts회)
///
/// SuctionGripperTask의 검증된 이동 흐름을 그대로 복사했으며,
/// 정상 작동 중인 SuctionGripperTask는 수정하지 않습니다.
/// 베이스 RobotTask도 수정하지 않고, 복합 인스트럭션(VerifyRetryInstruction)으로 재시도를 구현합니다.
/// </summary>
public class BoltingInspectionTask : RobotTask
{
    [Header("Targets - [0] = 홈(대기) 위치")]
    public List<Target> Targets;

    [Header("Suction Gripper - 볼트를 부착/해제하는 Flange Gripper")]
    public Preliy.Flange.Common.Gripper GripperLogic;

    [Header("픽 / 삽입(홈) 위치")]
    [Tooltip("볼트를 집는 위치")]
    public Target PickFrame;
    [Tooltip("볼트를 삽입할 홈 위치")]
    public Target HoleFrame;

    [Header("비전 검사")]
    [Tooltip("홈에 볼트가 들어갔는지 검사하는 센서. IBoltInspector를 구현하는 컴포넌트만 연결 가능\n" +
             "(HoleBoltInspector = 물리 콜라이더 기반, AiInspector = torque_server AI 모델 기반).")]
    [SerializeField] private MonoBehaviour _inspectorSource;

    /// <summary>_inspectorSource를 IBoltInspector로 노출. 인터페이스는 Unity Inspector에 직접 드래그할 수
    /// 없어 MonoBehaviour로 받고 런타임에 캐스팅합니다. 타입이 안 맞으면 null(검사 없음)로 취급됩니다.</summary>
    public IBoltInspector Inspector => _inspectorSource as IBoltInspector;

    [Header("재작업 설정")]
    [Tooltip("검사 실패 시 픽부터 재시도하는 최대 횟수")]
    public int MaxAttempts = 3;

    [Tooltip("플레이스 후 검사 전 물리 안정화 대기 시간 (초)")]
    public float InspectDelay = 0.5f;

    [Header("동작 옵션")]
    public bool UseHomePosition = true;

    [Tooltip("픽/플레이스 전후 하강·상승 높이 (Unity 단위)")]
    public float ApproachHeight = 0.1f;

    [Tooltip("흡착/해제 후 안정화 대기 시간 (초)")]
    public float GripSettleTime = 0.460f;

    // ── 비전 HUD가 읽는 런타임 상태 (직렬화하지 않음) ──
    public enum VisionPhase { Idle, Working, Scanning, Detected, Failed }
    [System.NonSerialized] public VisionPhase Phase = VisionPhase.Idle;
    [System.NonSerialized] public int CurrentAttempt = 0;

    protected override void Program()
    {
        if (!ValidateSetup()) return;

        Phase = VisionPhase.Idle;
        CurrentAttempt = 0;

        this.Message(LogType.Log, text: "Start Bolting Task");
        this.PTP(Targets[0]);

        // 한 번의 볼팅 시도(픽 → 삽입)를 인스트럭션 블록으로 구성
        List<Instruction> attemptBlock = BuildBoltingBlock();

        // Inspector가 SceneCaptureInspector(씬 캡처 기반)면, 검사 시점마다 캡처+서버전송을
        // 먼저 기다린 뒤 판정하도록 비동기 콜백을 연결. 그 외(물리/폴링 기반)는 기존과 동일하게 동기 처리.
        var captureInspector = _inspectorSource as SceneCaptureInspector;

        // 블록 실행 후 검사, 실패 시 픽부터 재시도(최대 MaxAttempts회)
        this.Move(new VerifyRetryInstruction(
            block: attemptBlock,
            // 판정 직후 ConsumeResult()를 호출해, AiInspector/SceneCaptureInspector처럼 캐시 기반
            // 검사기가 다음 시도에서 같은(낡은) 결과를 재사용하지 않도록 함
            isSuccess: () =>
            {
                if (Inspector == null) return false;
                bool present = Inspector.IsBoltPresent();
                Inspector.ConsumeResult();
                return present;
            },
            maxAttempts: Mathf.Max(1, MaxAttempts),
            settleTime: InspectDelay,
            successMessage: "[Bolting] 볼트 삽입 확인 — 다음 작업 진행",
            retryMessage: "[Bolting] 볼트 미감지 — 픽부터 재작업",
            failMessage: "[Bolting] 최대 재시도 초과 — 볼팅 실패",
            onAttemptStart: a => { CurrentAttempt = a; Phase = VisionPhase.Working; },
            onScanStart: captureInspector == null ? (System.Action)(() => Phase = VisionPhase.Scanning) : null,
            onScanStartAsync: captureInspector == null ? null : () =>
            {
                Phase = VisionPhase.Scanning;
                return captureInspector.CaptureAndSend();
            },
            onResult: ok => Phase = ok ? VisionPhase.Detected : VisionPhase.Failed));

        if (UseHomePosition)
            this.PTP(Targets[0]);

        this.Message(LogType.Log, text: "End Bolting Task");
    }

    /// <summary>볼트 1개 픽 → 홈 삽입 동작을 인스트럭션 리스트로 생성.</summary>
    private List<Instruction> BuildBoltingBlock()
    {
        var block = new List<Instruction>();

        // ── 픽 ──
        var pickPos = PickFrame.transform.position;
        var pickRot = PickFrame.transform.rotation;
        var pickDownPos = pickPos + Vector3.down * ApproachHeight;

        block.Add(new PTP(pickPos, pickRot));
        block.Add(new LIN(pickDownPos, pickRot));
        block.Add(new ActionInstruction(SuctionOn));      // 진공 ON → 볼트 부착
        block.Add(new WaitInstruction(GripSettleTime));
        block.Add(new LIN(pickPos, pickRot));

        if (UseHomePosition)
            block.Add(new PTP(Targets[0].transform.position, Targets[0].transform.rotation));

        // ── 삽입(플레이스) ──
        var holePos = HoleFrame.transform.position;
        var holeRot = HoleFrame.transform.rotation;
        var holeDownPos = holePos + Vector3.down * ApproachHeight;

        block.Add(new PTP(holePos, holeRot));
        block.Add(new LIN(holeDownPos, holeRot));
        block.Add(new ActionInstruction(SuctionOff));     // 진공 OFF → 볼트 삽입
        block.Add(new WaitInstruction(GripSettleTime));
        block.Add(new LIN(holePos, holeRot));

        if (UseHomePosition)
            block.Add(new PTP(Targets[0].transform.position, Targets[0].transform.rotation));

        return block;
    }

    // 진공 ON: 그리퍼 트리거에 닿은 볼트를 부착
    private void SuctionOn()
    {
        if (GripperLogic != null) GripperLogic.Grip();
    }

    // 진공 OFF: 부착된 볼트를 해제(삽입)
    private void SuctionOff()
    {
        if (GripperLogic != null) GripperLogic.Release();
    }

    /// <summary>
    /// 실행 전 필수 참조를 검사합니다.
    /// (기즈모 미리보기 빌드 중에는 콘솔 스팸 방지를 위해 로그를 출력하지 않습니다.)
    /// </summary>
    private bool ValidateSetup()
    {
        bool ok = true;
        bool log = !IsPreviewBuild;

        if (Controller == null)
        {
            if (log) Debug.LogError("[BoltingInspectionTask] Controller가 비어 있습니다.", this);
            ok = false;
        }

        if (Targets == null || Targets.Count == 0 || Targets[0] == null)
        {
            if (log) Debug.LogError("[BoltingInspectionTask] Targets[0](홈 위치)이 설정되지 않았습니다.", this);
            ok = false;
        }

        if (PickFrame == null)
        {
            if (log) Debug.LogError("[BoltingInspectionTask] PickFrame(픽 위치)이 비어 있습니다.", this);
            ok = false;
        }

        if (HoleFrame == null)
        {
            if (log) Debug.LogError("[BoltingInspectionTask] HoleFrame(홈/삽입 위치)이 비어 있습니다.", this);
            ok = false;
        }

        if (Inspector == null && log)
        {
            if (_inspectorSource != null)
                Debug.LogWarning($"[BoltingInspectionTask] _inspectorSource({_inspectorSource.GetType().Name})가 IBoltInspector를 구현하지 않습니다. HoleBoltInspector 또는 AiInspector를 연결하세요.", this);
            else
                Debug.LogWarning("[BoltingInspectionTask] Inspector가 비어 있습니다. 검사가 항상 실패로 처리되어 MaxAttempts까지 재시도 후 종료됩니다.", this);
        }

        if (GripperLogic == null && log)
        {
            Debug.LogWarning("[BoltingInspectionTask] GripperLogic이 비어 있습니다. 로봇은 이동하지만 볼트 흡착/삽입은 동작하지 않습니다.", this);
        }

        return ok;
    }
}

/// <summary>
/// 인스트럭션 블록을 실행한 뒤 성공 조건을 검사하고,
/// 실패 시 블록 전체를 재실행하는 복합 인스트럭션. (최대 maxAttempts회)
/// 베이스 RobotTask를 수정하지 않고 재작업(재시도) 흐름을 제공합니다.
/// </summary>
public class VerifyRetryInstruction : Instruction
{
    private readonly List<Instruction> _block;
    private readonly Func<bool> _isSuccess;
    private readonly int _maxAttempts;
    private readonly float _settleTime;
    private readonly string _successMessage;
    private readonly string _retryMessage;
    private readonly string _failMessage;
    private readonly Action<int> _onAttemptStart;
    private readonly Action _onScanStart;
    private readonly Func<IEnumerator> _onScanStartAsync;
    private readonly Action<bool> _onResult;

    public VerifyRetryInstruction(
        List<Instruction> block,
        Func<bool> isSuccess,
        int maxAttempts,
        float settleTime,
        string successMessage,
        string retryMessage,
        string failMessage,
        Action<int> onAttemptStart = null,
        Action onScanStart = null,
        Action<bool> onResult = null,
        // SceneCaptureInspector처럼 검사 시점에 캡처+서버전송 같은 비동기 작업이 필요한 경우 사용.
        // 지정하면 onScanStart(동기) 대신 이 코루틴을 실행하고 완료를 기다린 뒤 isSuccess를 평가합니다.
        Func<IEnumerator> onScanStartAsync = null)
    {
        _block = block;
        _isSuccess = isSuccess;
        _maxAttempts = Mathf.Max(1, maxAttempts);
        _settleTime = Mathf.Max(0f, settleTime);
        _successMessage = successMessage;
        _retryMessage = retryMessage;
        _failMessage = failMessage;
        _onAttemptStart = onAttemptStart;
        _onScanStart = onScanStart;
        _onScanStartAsync = onScanStartAsync;
        _onResult = onResult;
    }

    public override IEnumerator Execute(RobotTask task)
    {
        for (int attempt = 1; attempt <= _maxAttempts; attempt++)
        {
            task.SetRetryAttempt(attempt);
            _onAttemptStart?.Invoke(attempt);

            // 블록(픽 → 삽입) 실행 — 하위 인스트럭션이 바뀔 때마다 RobotTask에 반영해
            // DigitalTwinEmitter/extractStepsFromLog가 재시도로 반복되는 스텝을 구분할 수 있게 함
            foreach (var instr in _block)
            {
                task.SetSubInstruction(instr);
                yield return instr.Execute(task);
            }

            // 물리 안정화 후 검사
            task.SetSubInstruction(null);
            if (_settleTime > 0f) yield return new WaitForSeconds(_settleTime);

            // 비동기 검사(씬 캡처+서버전송 등)가 지정돼 있으면 그 완료를 기다린 뒤 판정,
            // 아니면 기존처럼 동기 콜백만 호출 (하위 호환)
            if (_onScanStartAsync != null)
                yield return _onScanStartAsync();
            else
                _onScanStart?.Invoke();

            bool success = _isSuccess == null || _isSuccess();
            _onResult?.Invoke(success);
            if (success)
            {
                if (!string.IsNullOrEmpty(_successMessage))
                    Debug.Log($"{_successMessage} (시도 {attempt}/{_maxAttempts})");
                task.SetRetryAttempt(0);
                yield break;
            }

            if (attempt < _maxAttempts)
            {
                if (!string.IsNullOrEmpty(_retryMessage))
                    Debug.LogWarning($"{_retryMessage} (시도 {attempt}/{_maxAttempts})");
            }
            else
            {
                if (!string.IsNullOrEmpty(_failMessage))
                    Debug.LogError($"{_failMessage} (시도 {attempt}/{_maxAttempts})");
            }
        }
        task.SetRetryAttempt(0);
    }

    public override string GetLabel() => $"VerifyRetry (max {_maxAttempts})";
}
