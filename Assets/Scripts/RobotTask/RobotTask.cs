using System.Collections;
using System.Collections.Generic;
using Preliy.Flange;
using UnityEngine;

/// <summary>
/// 로봇 태스크 베이스 클래스 (영상의 Task : MonoBehaviour와 동일한 구조)
/// 파생 클래스에서 Program()을 오버라이드하여 동작 시퀀스를 정의합니다.
/// </summary>
public abstract class RobotTask : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Controller _controller;

    [Header("Settings")]
    [SerializeField] private bool _autoStart = false;
    [SerializeField] private bool _loopExecution = false;
    [Tooltip("기본 이동 속도 (Unity 단위/초)")]
    [SerializeField] private float _defaultSpeed = 0.5f;
    [SerializeField] private Configuration _configuration = Configuration.Default;

    [Header("Gizmos Settings")]
    [SerializeField] private bool _showPathGizmo = true;
    [SerializeField] private bool _showLabel = false;
    [SerializeField] private bool _showFrames = false;
    [SerializeField] private float _gizmoScale = 1f;
    [SerializeField] private Color _colorLine = Color.white;
    [SerializeField] private Color _colorPoint = Color.red;

    [Header("Status")]
    [SerializeField, HideInInspector] private string _status = "Idle";

    // Inspector에서 실행 상황을 볼 수 있는 인스트럭션 로그
    [Header("Instructions")]
    [SerializeField] private List<string> _instructionLog = new();

    // 공개 프로퍼티
    public Controller Controller => _controller;
    public float DefaultSpeed => _defaultSpeed * _currentSpeedOverride;
    public Configuration DefaultConfiguration => _configuration;

    // 런타임(빌드) 시각화/선택 UI가 Gizmo와 동일한 경로/스타일 정보를 읽고 일부 값을 조정하기 위한 접근자.
    // 기존 실행/기즈모 로직은 변경하지 않음 — 이미 존재하는 필드를 노출만 함.
    public bool ShowPathGizmo { get => _showPathGizmo; set => _showPathGizmo = value; }
    public bool ShowFrames { get => _showFrames; set => _showFrames = value; }
    public Color LineColor => _colorLine;
    public Color PointColor => _colorPoint;
    public float GizmoScale { get => _gizmoScale; set => _gizmoScale = value; }
    public bool LoopExecution { get => _loopExecution; set => _loopExecution = value; }

    // 런타임 선택 UI용 상태/속도 접근자
    public string Status => _status;
    public int CurrentInstructionIndex => _currentIndex;
    public int InstructionCount => _instructionLog.Count;
    public float SpeedOverride => _currentSpeedOverride;
    public void SetSpeedOverride(float factor) => _currentSpeedOverride = Mathf.Clamp(factor, 0.01f, 10f);

    // DigitalTwinEmitter가 PTP/LIN/WaitInstruction 등을 구분해 MOVJ/MOVL/WAIT를 올바르게 추출하는 데 사용
    public string CurrentInstructionType =>
        (_currentIndex >= 0 && _currentIndex < _instructions.Count)
            ? _instructions[_currentIndex].GetType().Name
            : "";

    // DigitalTwinEmitter가 실행 중인 시퀀스(예: ConfigurableInstruction의 "Cfg:<파일명>")를
    // 트윈 데이터로 함께 발행해, 여러 시퀀스를 바꿔가며 비교 실험할 때 로그 구간을 구분할 수 있도록 함
    public string CurrentInstructionLabel =>
        (_currentIndex >= 0 && _currentIndex < _instructions.Count)
            ? _instructions[_currentIndex].GetLabel()
            : "";

    // 서브클래스가 MarkStep()으로 표시하는 의미 단위 구간(예: "Pick"/"Hold1"/"Place").
    // PTP/LIN/Wait 하나하나가 아니라 픽/경유/플레이스처럼 공정 분석에 쓸모 있는 단위로
    // 사이클타임을 세분화하기 위해 DigitalTwinEmitter가 이 값을 트윈 데이터로 발행함.
    public string CurrentStep { get; private set; } = "";

    /// <summary>Program() 안에서 this.Action(() => MarkStep("Pick")) 형태로 호출해 현재 실행 단계를 표시</summary>
    protected void MarkStep(string stepName) => CurrentStep = stepName;

    // VerifyRetryInstruction처럼 여러 Instruction을 블록으로 묶어 재시도하는 복합 인스트럭션을 쓰면,
    // RobotTask._currentIndex는 그 복합 인스트럭션 하나에서 멈춰있어 내부에서 실제로 실행 중인
    // 하위 인스트럭션이 바뀌어도 값이 갱신되지 않는다. DigitalTwinEmitter/extractStepsFromLog가
    // 재시도 발생과 시도 횟수를 인식할 수 있도록, 복합 인스트럭션이 직접 갱신하는 상태를 별도로 둔다.
    public int    RetryAttempt      { get; private set; } = 0;   // 현재 몇 번째 시도인지 (0 = 재시도 블록 밖)
    public string SubInstructionType  { get; private set; } = ""; // 블록 내부에서 지금 실행 중인 인스트럭션 타입명
    public string SubInstructionLabel { get; private set; } = "";

    /// <summary>복합 인스트럭션(VerifyRetryInstruction 등)이 시도 번호를 갱신할 때 호출. 0 = 재시도 블록 종료.</summary>
    public void SetRetryAttempt(int attempt) => RetryAttempt = attempt;

    /// <summary>복합 인스트럭션이 블록 내부에서 실행 중인 하위 인스트럭션을 갱신할 때 호출.</summary>
    public void SetSubInstruction(Instruction instr)
    {
        SubInstructionType  = instr?.GetType().Name ?? "";
        SubInstructionLabel = instr?.GetLabel() ?? "";
    }

    public readonly struct RuntimeWaypoint
    {
        public readonly Vector3 Position;
        public readonly Quaternion Rotation;
        public readonly Instruction Instruction; // null = 시작점(TCP 현재 위치)
        public RuntimeWaypoint(Vector3 position, Quaternion rotation, Instruction instruction)
        {
            Position = position;
            Rotation = rotation;
            Instruction = instruction;
        }
    }

    public List<RuntimeWaypoint> GetRuntimeWaypoints()
    {
        if (_runCoroutine == null) RebuildGizmoCache();

        var list = new List<RuntimeWaypoint>(_gizmoCache.Count);
        foreach (var wp in _gizmoCache)
            list.Add(new RuntimeWaypoint(wp.Pos, wp.Rot, wp.Instr));
        return list;
    }

    /// <summary>기즈모 경로 미리보기를 위해 Program()을 호출하는 중인지 여부.
    /// true일 때 파생 클래스는 콘솔 로그/검증 메시지를 출력하지 않아야 합니다(에디터 스팸 방지).</summary>
    protected bool IsPreviewBuild => _isPreviewBuild;

    private readonly List<Instruction> _instructions = new();
    private Coroutine _runCoroutine;
    private int _currentIndex = -1;
    private float _currentSpeedOverride = 1f;
    private bool _isPreviewBuild;

    // 경로 기즈모 캐시 (플레이 모드에서도 유지)
    private struct GizmoWaypoint { public Vector3 Pos; public Quaternion Rot; public Instruction Instr; }
    private readonly List<GizmoWaypoint> _gizmoCache = new();

    // ──────────────────────────────────────────────────────────────
    // Unity Lifecycle
    // ──────────────────────────────────────────────────────────────
    private void Start()
    {
        RebuildGizmoCache(); // 플레이 모드 진입 시 경로 캐시 선빌드
        if (_autoStart) Execute();
    }

    private void OnDrawGizmos()
    {
        if (!_showPathGizmo) return;

        // 실행 중이 아닐 때만 캐시 재빌드 (플레이 중에는 이전 캐시 유지)
        if (_runCoroutine == null)
            RebuildGizmoCache();

        if (_gizmoCache.Count < 2) return;

        var ctx = new GizmoContext
        {
            LineColor  = _colorLine,
            PointColor = _colorPoint,
            Scale      = _gizmoScale,
            ShowLabel  = _showLabel,
            ShowFrames = _showFrames
        };

        // 세그먼트 그리기
        for (int i = 1; i < _gizmoCache.Count; i++)
        {
            var prev  = _gizmoCache[i - 1];
            var cur   = _gizmoCache[i];

            Gizmos.color = ctx.LineColor;

            if (cur.Instr is CIRC)
            {
                // CIRC: 원호 그대로 (DrawGizmo가 내부에서 arc 계산)
                cur.Instr.DrawGizmo(prev.Pos, prev.Rot, ctx, out _, out _);
            }
            else if (cur.Instr is LIN)
            {
                // LIN: 실제로 직선 이동 → 직선으로 정확하게 표시
                Gizmos.DrawLine(prev.Pos, cur.Pos);
            }
            else
            {
                // PTP: 관절 공간 이동 → Catmull-Rom으로 부드럽게 근사
                Vector3 p0 = _gizmoCache[Mathf.Max(i - 2, 0)].Pos;
                Vector3 p1 = prev.Pos;
                Vector3 p2 = cur.Pos;
                Vector3 p3 = _gizmoCache[Mathf.Min(i + 1, _gizmoCache.Count - 1)].Pos;
                DrawCatmullRomSegment(p0, p1, p2, p3, 24);
            }

            // 도착점 마커
            Gizmos.color = ctx.PointColor;
            Gizmos.DrawSphere(cur.Pos, 0.018f * _gizmoScale);

            if (ctx.ShowFrames) DrawFrameGizmo(cur.Pos, cur.Rot, 0.06f * _gizmoScale);

#if UNITY_EDITOR
            if (_showLabel)
                UnityEditor.Handles.Label(cur.Pos + Vector3.up * 0.04f * _gizmoScale, cur.Instr.GetLabel());
#endif
        }

        // 시작점 마커
        Gizmos.color = ctx.PointColor;
        Gizmos.DrawSphere(_gizmoCache[0].Pos, 0.022f * _gizmoScale);

        // 루프 실행 시 마지막 → 첫 번째 경로 시각화
        if (_loopExecution && _gizmoCache.Count >= 2)
        {
            var last  = _gizmoCache[_gizmoCache.Count - 1];
            var first = _gizmoCache[1]; // [0]은 TCP 시작위치, [1]이 실제 첫 WP
            Gizmos.color = new Color(ctx.LineColor.r, ctx.LineColor.g, ctx.LineColor.b, ctx.LineColor.a * 0.4f);
            Vector3 p0 = _gizmoCache[Mathf.Max(_gizmoCache.Count - 2, 0)].Pos;
            Vector3 p3 = _gizmoCache[Mathf.Min(2, _gizmoCache.Count - 1)].Pos;
            DrawCatmullRomSegment(p0, last.Pos, first.Pos, p3, 24);
        }
    }

    private void RebuildGizmoCache()
    {
        _gizmoCache.Clear();

        Vector3 startPos = transform.position;
        Quaternion startRot = Quaternion.identity;
        if (_controller != null)
        {
            try
            {
                var tcp = _controller.PoseObserver.ToolCenterPointWorld.Value;
                startPos = tcp.GetPosition();
                startRot = tcp.rotation;
            }
            catch { }
        }
        _gizmoCache.Add(new GizmoWaypoint { Pos = startPos, Rot = startRot, Instr = null });

        var backup = new List<Instruction>(_instructions);
        float backupSpeed = _currentSpeedOverride;
        _instructions.Clear();
        _currentSpeedOverride = 1f;
        _isPreviewBuild = true;
        try { Program(); }
        catch
        {
            _instructions.Clear();
            _instructions.AddRange(backup);
            _currentSpeedOverride = backupSpeed;
            _isPreviewBuild = false;
            return;
        }
        _isPreviewBuild = false;

        foreach (var instr in _instructions)
        {
            if (instr.TryGetTargetPoint(out Vector3 p, out Quaternion r))
                _gizmoCache.Add(new GizmoWaypoint { Pos = p, Rot = r, Instr = instr });
        }

        _instructions.Clear();
        _instructions.AddRange(backup);
        _currentSpeedOverride = backupSpeed;
    }

    private static void DrawCatmullRomSegment(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, int steps)
    {
        Vector3 prev = p1;
        for (int s = 1; s <= steps; s++)
        {
            float t = s / (float)steps;
            float t2 = t * t, t3 = t2 * t;
            Vector3 next = 0.5f * (
                  2f * p1
                + (-p0 + p2) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
            Gizmos.DrawLine(prev, next);
            prev = next;
        }
    }

    private static void DrawFrameGizmo(Vector3 pos, Quaternion rot, float size)
    {
        var c = Gizmos.color;
        Gizmos.color = Color.red;   Gizmos.DrawLine(pos, pos + rot * Vector3.right   * size);
        Gizmos.color = Color.green; Gizmos.DrawLine(pos, pos + rot * Vector3.up      * size);
        Gizmos.color = Color.blue;  Gizmos.DrawLine(pos, pos + rot * Vector3.forward * size);
        Gizmos.color = c;
    }

    // ──────────────────────────────────────────────────────────────
    // 파생 클래스에서 구현할 추상 메서드
    // ──────────────────────────────────────────────────────────────
    protected abstract void Program();

    // ──────────────────────────────────────────────────────────────
    // Program() 안에서 사용하는 인스트럭션 메서드
    // ──────────────────────────────────────────────────────────────

    /// <summary>현재 Program()의 전역 속도 배율 설정 (0.01 ~ 10)</summary>
    protected void Speed(float factor)
    {
        _instructions.Add(new SpeedInstruction(factor, s => _currentSpeedOverride = s));
    }

    /// <summary>Target 컴포넌트로 PTP 이동</summary>
    protected void PTP(Preliy.Flange.Target target)
    {
        _instructions.Add(new PTP(target.transform));
    }

    /// <summary>Target Transform으로 PTP 이동</summary>
    protected void PTP(Transform target)
    {
        _instructions.Add(new PTP(target));
    }

    /// <summary>월드 좌표로 PTP 이동</summary>
    protected void PTP(Vector3 position, Quaternion rotation = default)
    {
        if (rotation == default) rotation = Quaternion.identity;
        _instructions.Add(new PTP(position, rotation));
    }

    /// <summary>Target 컴포넌트로 LIN 이동</summary>
    protected void LIN(Preliy.Flange.Target target)
    {
        _instructions.Add(new LIN(target.transform));
    }

    /// <summary>Transform으로 LIN 이동</summary>
    protected void LIN(Transform target)
    {
        _instructions.Add(new LIN(target));
    }

    /// <summary>월드 좌표로 LIN 이동</summary>
    protected void LIN(Vector3 position, Quaternion rotation = default)
    {
        if (rotation == default) rotation = Quaternion.identity;
        _instructions.Add(new LIN(position, rotation));
    }

    /// <summary>Target 컴포넌트로 CIRC 원호 이동</summary>
    protected void CIRC(Preliy.Flange.Target end, Preliy.Flange.Target wayPoint)
    {
        _instructions.Add(new CIRC(end, wayPoint));
    }

    /// <summary>Transform으로 CIRC 원호 이동</summary>
    protected void CIRC(Transform end, Transform wayPoint)
    {
        _instructions.Add(new CIRC(end, wayPoint));
    }

    /// <summary>빌더 패턴 인스트럭션 실행 (new PTP(...).Frame(...).Speed(...) 형태)</summary>
    protected void Move(Instruction instruction)
    {
        _instructions.Add(instruction);
    }

    /// <summary>그리퍼 Grip 실행</summary>
    protected void Grip(GripperEventBridge bridge)
    {
        _instructions.Add(new GripInstruction(bridge, GripInstruction.GripAction.Grip));
    }

    /// <summary>그리퍼 Release 실행</summary>
    protected void Release(GripperEventBridge bridge)
    {
        _instructions.Add(new GripInstruction(bridge, GripInstruction.GripAction.Release));
    }

    /// <summary>람다 액션 실행 (이미지의 this.Action(() => Gripper.JogPlus = true) 패턴)</summary>
    protected void Action(System.Action callback)
    {
        _instructions.Add(new ActionInstruction(callback));
    }

    /// <summary>대기</summary>
    protected void Wait(float seconds)
    {
        _instructions.Add(new WaitInstruction(seconds));
    }

    /// <summary>콘솔 메시지 출력</summary>
    protected void Message(LogType type, string text)
    {
        _instructions.Add(new MessageInstruction(type, text));
    }

    // ──────────────────────────────────────────────────────────────
    // 실행 제어
    // ──────────────────────────────────────────────────────────────

    [ContextMenu("Execute")]
    public void Execute()
    {
        if (_runCoroutine != null) StopCoroutine(_runCoroutine);
        _runCoroutine = StartCoroutine(RunProgram());
    }

    [ContextMenu("Stop")]
    public void Stop()
    {
        if (_runCoroutine != null)
        {
            StopCoroutine(_runCoroutine);
            _runCoroutine = null;
        }
        _status = "Idle";
        _currentIndex = -1;
        CurrentStep = "";
        RetryAttempt = 0;
        SetSubInstruction(null);
    }

    private IEnumerator RunProgram()
    {
        do
        {
            _instructions.Clear();
            _instructionLog.Clear();
            _currentSpeedOverride = 1f;
            CurrentStep = "";
            RetryAttempt = 0;
            SetSubInstruction(null);
            Program(); // 파생 클래스의 Program() 호출 → _instructions 채움

            // Inspector 로그 생성
            for (int i = 0; i < _instructions.Count; i++)
                _instructionLog.Add($"{i + 1} {_instructions[i].GetLabel()}");

            _status = "Run";
            for (int i = 0; i < _instructions.Count; i++)
            {
                _currentIndex = i;
                yield return _instructions[i].Execute(this);
            }
            _status = _loopExecution ? "Run" : "Idle";
            _currentIndex = -1;

        } while (_loopExecution);
    }
}

// ──────────────────────────────────────────────────────────────────
// 내장 인스트럭션 (Wait / Message / Grip)
// ──────────────────────────────────────────────────────────────────

public class WaitInstruction : Instruction
{
    private readonly float _seconds;
    public WaitInstruction(float seconds) { _seconds = seconds; }
    public override IEnumerator Execute(RobotTask task) { yield return new WaitForSeconds(_seconds); }
    public override string GetLabel() => $"Wait {_seconds:F1}s";
}

public class MessageInstruction : Instruction
{
    private readonly LogType _type;
    private readonly string _text;
    public MessageInstruction(LogType type, string text) { _type = type; _text = text; }
    public override IEnumerator Execute(RobotTask task) { Debug.unityLogger.Log(_type, _text); yield break; }
    public override string GetLabel() => $"Log: {_text}";
}

public class SpeedInstruction : Instruction
{
    private readonly float _factor;
    private readonly System.Action<float> _setter;
    public SpeedInstruction(float factor, System.Action<float> setter) { _factor = factor; _setter = setter; }
    public override IEnumerator Execute(RobotTask task) { _setter(Mathf.Clamp(_factor, 0.01f, 10f)); yield break; }
    public override string GetLabel() => $"Speed {_factor:F2}";
}

public class GripInstruction : Instruction
{
    public enum GripAction { Grip, Release }
    private readonly GripperEventBridge _bridge;
    private readonly GripAction _action;
    public GripInstruction(GripperEventBridge bridge, GripAction action) { _bridge = bridge; _action = action; }
    public override IEnumerator Execute(RobotTask task)
    {
        if (_action == GripAction.Grip) _bridge?.Grip();
        else _bridge?.Release();
        yield return new WaitForSeconds(0.5f);
    }
    public override string GetLabel() => _action.ToString();
}

public class ActionInstruction : Instruction
{
    private readonly System.Action _callback;
    public ActionInstruction(System.Action callback) { _callback = callback; }
    public override IEnumerator Execute(RobotTask task) { _callback?.Invoke(); yield break; }
    public override string GetLabel() => "Action";
}
