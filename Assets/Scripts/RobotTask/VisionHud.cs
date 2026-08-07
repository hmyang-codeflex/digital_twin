using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// "비전으로 인식해서 작업하는 듯한 느낌"을 주는 시각화 HUD.
///
/// 실제 판정은 HoleBoltInspector.IsBoltPresent()가 담당하고, 이 컴포넌트는
/// 그 결과와 BoltingInspectionTask의 진행 단계(Phase)를 읽어서
/// "스캐닝 → 감지/실패" 처럼 보이도록 그려 줍니다.
///
/// 안전 설계(이전 컴파일 오류 재발 방지):
///   - UnityEditor 참조는 모두 #if UNITY_EDITOR 로 감쌌습니다(런타임 빌드 안전).
///   - GUI 호출(GUIStyle 등)은 OnGUI 안에서만 합니다(OnDrawGizmos에서 GUIStyle 금지).
///   - 다른 스크립트의 public 멤버만 읽습니다.
///
/// 사용법:
///   1) 빈 GameObject에 이 컴포넌트를 추가
///   2) Inspector  → HoleBoltInspector 연결
///   3) Task       → BoltingInspectionTask 연결
///   4) VisionCamera → (선택) 카메라 Transform. 비우면 Camera.main 사용
/// </summary>
[ExecuteAlways]
public class VisionHud : MonoBehaviour
{
    [Header("연결")]
    [Tooltip("볼트 감지 센서")]
    public HoleBoltInspector Inspector;

    [Tooltip("진행 단계(Phase)를 읽어올 볼팅 태스크 (BoltingInspectionTask 또는 BoltingFeedTask)")]
    public RobotTask Task;

    [Tooltip("비전 카메라 Transform (비우면 Camera.main 사용)")]
    public Transform VisionCamera;

    [Header("표시 옵션")]
    public bool ShowSceneGizmo = true;
    public bool ShowGameOverlay = true;
    public bool ShowScanLine = true;
    public bool ShowReticle = true;

    [Header("색상")]
    public Color IdleColor     = new Color(0.55f, 0.75f, 1f);
    public Color ScanningColor = new Color(1f, 0.85f, 0.2f);
    public Color DetectedColor = new Color(0.25f, 1f, 0.45f);
    public Color FailedColor   = new Color(1f, 0.35f, 0.35f);

    [Header("스타일")]
    [Range(0.1f, 0.45f)] public float BracketRatio = 0.28f;
    [Range(10, 28)] public int FontSize = 14;

    [Header("비전 카메라 화면(Quad/RenderTexture)에 표시")]
    [Tooltip("켜면 비전 카메라가 비추는 화면 안에 상태 문구를 3D 텍스트로 띄웁니다(Quad에 나타남).")]
    public bool ShowOnVisionScreen = true;
    [Tooltip("화면 가장자리 여백 비율")]
    [Range(0.01f, 0.2f)] public float ScreenMargin = 0.06f;
    [Tooltip("화면 높이 대비 글자 크기 비율")]
    [Range(0.02f, 0.25f)] public float ScreenTextScale = 0.07f;

    // ── GUI 스타일 캐시 (OnGUI에서만 생성) ──
    private GUIStyle _titleStyle;
    private GUIStyle _statusStyle;
    private GUIStyle _smallStyle;
    private Texture2D _px;

    // ── 비전 카메라 화면용 3D 텍스트 ──
    private GameObject _screenTextGO;
    private TextMesh _screenText;

    // ───────────────────────── 상태 헬퍼 ─────────────────────────

    private BoltingInspectionTask.VisionPhase CurrentPhase
    {
        get
        {
            if (Task is BoltingInspectionTask bt) return bt.Phase;
            if (Task is BoltingFeedTask ft) return (BoltingInspectionTask.VisionPhase)(int)ft.Phase;
            return BoltingInspectionTask.VisionPhase.Idle;
        }
    }

    private bool HasTask => Task is BoltingInspectionTask || Task is BoltingFeedTask;
    private int TaskCurrentAttempt => Task is BoltingInspectionTask bt ? bt.CurrentAttempt
                                    : Task is BoltingFeedTask ft ? ft.CurrentAttempt : 0;
    private int TaskMaxAttempts    => Task is BoltingInspectionTask bt ? bt.MaxAttempts
                                    : Task is BoltingFeedTask ft ? ft.MaxAttempts : 1;

    private Color PhaseColor(BoltingInspectionTask.VisionPhase p)
    {
        switch (p)
        {
            case BoltingInspectionTask.VisionPhase.Scanning: return ScanningColor;
            case BoltingInspectionTask.VisionPhase.Detected: return DetectedColor;
            case BoltingInspectionTask.VisionPhase.Failed:   return FailedColor;
            case BoltingInspectionTask.VisionPhase.Working:  return ScanningColor;
            default:                                         return IdleColor;
        }
    }

    private string PhaseText(BoltingInspectionTask.VisionPhase p)
    {
        switch (p)
        {
            case BoltingInspectionTask.VisionPhase.Working:  return "TRACKING...";
            case BoltingInspectionTask.VisionPhase.Scanning: return "SCANNING...";
            case BoltingInspectionTask.VisionPhase.Detected: return "BOLT DETECTED";
            case BoltingInspectionTask.VisionPhase.Failed:   return "NO BOLT - RETRY";
            default:                                         return "STANDBY";
        }
    }

    // BoltingFeedTask 연결 시 현재 홀의 Inspector를, 아니면 고정 Inspector 사용
    private HoleBoltInspector EffectiveInspector
    {
        get
        {
            if (Task is BoltingFeedTask ft) return ft.ActiveInspector ?? Inspector;
            return Inspector;
        }
    }

    // 검사 박스의 월드 중심/회전/크기 (Inspector의 public 멤버로 계산)
    private bool TryGetBox(out Vector3 center, out Quaternion rot, out Vector3 size)
    {
        center = Vector3.zero; rot = Quaternion.identity; size = Vector3.one;
        var insp = EffectiveInspector;
        if (insp == null) return false;

        Transform t = insp.Hole != null ? insp.Hole : insp.transform;
        if (t == null) return false;

        rot = t.rotation;
        center = t.position + rot * insp.CenterOffset;
        size = insp.DetectionSize;
        return true;
    }

    private Camera ResolveCamera()
    {
        if (VisionCamera != null)
        {
            var c = VisionCamera.GetComponent<Camera>();
            if (c != null) return c;
        }
        return Camera.main;
    }

    // ESC에서 깜빡임 계수 (스캐닝/추적 단계)
    private Color ApplyBlink(Color col, BoltingInspectionTask.VisionPhase phase)
    {
        if (phase == BoltingInspectionTask.VisionPhase.Scanning ||
            phase == BoltingInspectionTask.VisionPhase.Working)
        {
            float blink = 0.5f + 0.5f * Mathf.Sin(Time.realtimeSinceStartup * 8f);
            col.a = Mathf.Lerp(0.4f, 1f, blink);
        }
        return col;
    }

    // ───────────────────────── 비전 카메라 화면(Quad) 3D 텍스트 ─────────────────────────

    private void Update()
    {
        if (ShowOnVisionScreen)
            UpdateScreenText();
        else if (_screenTextGO != null)
            _screenTextGO.SetActive(false);
    }

    private void OnDisable()  { CleanupScreenText(); }
    private void OnDestroy()  { CleanupScreenText(); }

    private void CleanupScreenText()
    {
        if (_screenTextGO == null) return;
        if (Application.isPlaying) Destroy(_screenTextGO);
        else DestroyImmediate(_screenTextGO);
        _screenTextGO = null;
        _screenText = null;
    }

    private void UpdateScreenText()
    {
        var cam = ResolveCamera();
        if (cam == null)
        {
            if (_screenTextGO != null) _screenTextGO.SetActive(false);
            return;
        }

        if (_screenTextGO == null)
        {
            _screenTextGO = new GameObject("VisionHud_ScreenText");
            _screenTextGO.hideFlags = HideFlags.DontSave;
            _screenText = _screenTextGO.AddComponent<TextMesh>();
            _screenText.anchor = TextAnchor.UpperLeft;
            _screenText.alignment = TextAlignment.Left;
            _screenText.fontSize = 90;          // 큰 폰트 + 작은 스케일 = 선명
            _screenText.characterSize = 0.1f;
            _screenText.richText = false;
        }
        _screenTextGO.SetActive(true);

        var t = _screenTextGO.transform;
        t.SetParent(cam.transform, false);

        // 카메라 앞 일정 거리에서의 화면(월드) 크기 계산
        float dist = cam.nearClipPlane + 0.5f;
        float worldH = cam.orthographic
            ? cam.orthographicSize * 2f
            : 2f * dist * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
        float worldW = worldH * cam.aspect;

        float marginX = worldW * ScreenMargin;
        float marginY = worldH * ScreenMargin;

        // 화면 좌상단에 배치
        t.localRotation = Quaternion.identity;
        t.localPosition = new Vector3(-worldW * 0.5f + marginX,
                                       worldH * 0.5f - marginY,
                                       dist);

        // 글자 크기를 화면 높이 비율로 스케일 (characterSize*fontSize/10 = 기본 글자높이)
        float baseCharHeight = _screenText.characterSize * _screenText.fontSize / 10f;
        float scale = worldH * ScreenTextScale / Mathf.Max(0.0001f, baseCharHeight);
        t.localScale = Vector3.one * scale;

        // 내용 / 색
        var phase = CurrentPhase;
        string txt = PhaseText(phase);
        if (HasTask)
            txt += $"\nATTEMPT {Mathf.Max(0, TaskCurrentAttempt)}/{Mathf.Max(1, TaskMaxAttempts)}";
        _screenText.text = txt;
        _screenText.color = ApplyBlink(PhaseColor(phase), phase);
    }

    // ───────────────────────── Scene 뷰 그리기 ─────────────────────────

    private void OnDrawGizmos()
    {
        if (!ShowSceneGizmo) return;
        if (!TryGetBox(out var center, out var rot, out var size)) return;

        var phase = CurrentPhase;
        Color col = PhaseColor(phase);

        // 스캐닝/추적 단계에서는 깜빡이게
        if (phase == BoltingInspectionTask.VisionPhase.Scanning ||
            phase == BoltingInspectionTask.VisionPhase.Working)
        {
            float blink = 0.5f + 0.5f * Mathf.Sin(Time.realtimeSinceStartup * 8f);
            col.a = Mathf.Lerp(0.35f, 1f, blink);
        }

        DrawCornerBrackets(center, rot, size, col);

        // 스캔 라인 (카메라 → 검사 박스)
        if (ShowScanLine)
        {
            var cam = ResolveCamera();
            Vector3 from = VisionCamera != null ? VisionCamera.position
                          : (cam != null ? cam.transform.position : center + Vector3.up);
            Gizmos.color = new Color(col.r, col.g, col.b, 0.5f);
            Gizmos.DrawLine(from, center);

            // 라인 위를 흐르는 스캔 포인트
            float t = Mathf.Repeat(Time.realtimeSinceStartup * 0.8f, 1f);
            Vector3 p = Vector3.Lerp(from, center, t);
            Gizmos.color = col;
            Gizmos.DrawSphere(p, size.magnitude * 0.05f);
        }

#if UNITY_EDITOR
        // 검사 박스 위 상태 라벨 (GUIStyle 없이 안전하게)
        Handles.color = col;
        string label = PhaseText(phase);
        if (HasTask && TaskCurrentAttempt > 0)
            label += $"  [{TaskCurrentAttempt}/{Mathf.Max(1, TaskMaxAttempts)}]";
        Handles.Label(center + rot * (Vector3.up * (size.y * 0.5f + 0.03f)), label);
#endif
    }

    // 박스 8모서리에 L자 코너 브래킷을 그려 "타게팅" 느낌을 줌
    private void DrawCornerBrackets(Vector3 center, Quaternion rot, Vector3 size, Color col)
    {
        Gizmos.color = col;
        Vector3 h = size * 0.5f;
        float bx = size.x * BracketRatio;
        float by = size.y * BracketRatio;
        float bz = size.z * BracketRatio;

        // 8개의 코너 (부호 조합)
        for (int sx = -1; sx <= 1; sx += 2)
        for (int sy = -1; sy <= 1; sy += 2)
        for (int sz = -1; sz <= 1; sz += 2)
        {
            Vector3 corner = new Vector3(sx * h.x, sy * h.y, sz * h.z);
            Vector3 wc = center + rot * corner;

            Vector3 ax = rot * (Vector3.right   * (-sx * bx));
            Vector3 ay = rot * (Vector3.up      * (-sy * by));
            Vector3 az = rot * (Vector3.forward * (-sz * bz));

            Gizmos.DrawLine(wc, wc + ax);
            Gizmos.DrawLine(wc, wc + ay);
            Gizmos.DrawLine(wc, wc + az);
        }
    }

    // ───────────────────────── Game 뷰 오버레이 ─────────────────────────

    private void EnsureStyles()
    {
        if (_px == null)
        {
            _px = new Texture2D(1, 1);
            _px.SetPixel(0, 0, Color.white);
            _px.Apply();
            _px.hideFlags = HideFlags.HideAndDontSave;
        }
        if (_titleStyle == null)
        {
            _titleStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = FontSize,
                fontStyle = FontStyle.Bold,
                normal = { textColor = Color.white }
            };
        }
        if (_statusStyle == null)
        {
            _statusStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = FontSize + 2,
                fontStyle = FontStyle.Bold
            };
        }
        if (_smallStyle == null)
        {
            _smallStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.Max(9, FontSize - 3),
                normal = { textColor = new Color(0.8f, 0.85f, 0.9f) }
            };
        }
    }

    private void DrawRect(Rect r, Color c)
    {
        var prev = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, _px);
        GUI.color = prev;
    }

    private void OnGUI()
    {
        if (!ShowGameOverlay) return;
        EnsureStyles();

        var phase = CurrentPhase;
        Color col = PhaseColor(phase);

        // ── 좌상단 정보 패널 ──
        float w = 230f, h = 86f, m = 12f;
        Rect panel = new Rect(m, m, w, h);
        DrawRect(panel, new Color(0f, 0f, 0f, 0.55f));
        DrawRect(new Rect(panel.x, panel.y, panel.width, 3f), col); // 상단 컬러 바

        GUI.Label(new Rect(panel.x + 10, panel.y + 6, w - 20, 22), "VISION SYSTEM", _titleStyle);

        _statusStyle.normal.textColor = col;
        // 스캐닝/추적 중 깜빡임
        if (phase == BoltingInspectionTask.VisionPhase.Scanning ||
            phase == BoltingInspectionTask.VisionPhase.Working)
        {
            float blink = 0.5f + 0.5f * Mathf.Sin(Time.realtimeSinceStartup * 8f);
            _statusStyle.normal.textColor = new Color(col.r, col.g, col.b, Mathf.Lerp(0.4f, 1f, blink));
        }
        GUI.Label(new Rect(panel.x + 10, panel.y + 30, w - 20, 24), PhaseText(phase), _statusStyle);

        string attempt = HasTask
            ? $"ATTEMPT  {Mathf.Max(0, TaskCurrentAttempt)} / {Mathf.Max(1, TaskMaxAttempts)}"
            : "ATTEMPT  - / -";
        GUI.Label(new Rect(panel.x + 10, panel.y + 58, w - 20, 20), attempt, _smallStyle);

        // ── 검사 위치에 조준 레티클 ──
        if (ShowReticle && TryGetBox(out var center, out _, out var size))
        {
            var cam = ResolveCamera();
            if (cam != null)
            {
                Vector3 sp = cam.WorldToScreenPoint(center);
                if (sp.z > 0f)
                {
                    float y = Screen.height - sp.y;
                    DrawReticle(new Vector2(sp.x, y), 26f, col, phase);
                }
            }
        }
    }

    private void DrawReticle(Vector2 p, float r, Color col, BoltingInspectionTask.VisionPhase phase)
    {
        float t = 2f; // 선 두께
        float len = r * 0.5f;

        // 회전 느낌: 스캐닝 중에는 코너가 살짝 커졌다 작아짐
        if (phase == BoltingInspectionTask.VisionPhase.Scanning ||
            phase == BoltingInspectionTask.VisionPhase.Working)
        {
            float pulse = 0.5f + 0.5f * Mathf.Sin(Time.realtimeSinceStartup * 6f);
            r += pulse * 6f;
        }

        // 네 모서리 L자 브래킷 (수평/수직 막대만 사용 → 안전)
        // 좌상
        DrawRect(new Rect(p.x - r,         p.y - r,         len, t), col);
        DrawRect(new Rect(p.x - r,         p.y - r,         t,   len), col);
        // 우상
        DrawRect(new Rect(p.x + r - len,   p.y - r,         len, t), col);
        DrawRect(new Rect(p.x + r - t,     p.y - r,         t,   len), col);
        // 좌하
        DrawRect(new Rect(p.x - r,         p.y + r - t,     len, t), col);
        DrawRect(new Rect(p.x - r,         p.y + r - len,   t,   len), col);
        // 우하
        DrawRect(new Rect(p.x + r - len,   p.y + r - t,     len, t), col);
        DrawRect(new Rect(p.x + r - t,     p.y + r - len,   t,   len), col);

        // 중심점
        DrawRect(new Rect(p.x - 2, p.y - 2, 4, 4), col);
    }
}
