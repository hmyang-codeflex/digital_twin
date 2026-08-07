using Preliy.Flange;
using UnityEngine;

/// <summary>
/// TCP(툴 센터 포인트)에서 아래 방향으로 빨간 선을 그려,
/// 툴이 그대로 하강하면 어떤 지점에 닿는지 시각적으로 보여주는 보조 컴포넌트.
///
/// Flange Controller가 있는 오브젝트(또는 아무 오브젝트)에 추가하고
/// Controller 참조를 연결하면 됩니다. 패키지 원본은 수정하지 않습니다.
///
/// - Scene 뷰: 항상 기즈모로 표시 (에디터에서 확인용)
/// - Game 뷰: ShowInGameView가 켜져 있으면 LineRenderer로도 표시
/// </summary>
[ExecuteAlways]
public class TcpDownPointer : MonoBehaviour
{
    public enum RayDirection
    {
        WorldDown,  // 월드 기준 수직 아래 (중력 방향) — 기존 task의 Vector3.down과 동일
        ToolZ,      // TCP 로컬 +Z (Flange 툴 접근 방향)
        ToolDown    // TCP 로컬 -Y
    }

    [Header("References")]
    [Tooltip("TCP를 읽어올 Flange Controller")]
    public Controller Controller;

    [Header("On / Off")]
    [Tooltip("선 표시 전체 토글")]
    public bool ShowLine = true;

    [Header("방향 / 길이")]
    [Tooltip("선이 향하는 방향 기준")]
    public RayDirection Direction = RayDirection.WorldDown;

    [Tooltip("선의 최대 길이 (Unity 단위)")]
    public float Length = 1.5f;

    [Header("충돌 지점 표시")]
    [Tooltip("켜면 콜라이더에 닿는 지점까지만 선을 그리고 그 지점에 마커를 표시")]
    public bool UseRaycast = true;

    [Tooltip("레이캐스트가 검사할 레이어")]
    public LayerMask RaycastMask = ~0;

    [Header("외형")]
    public Color LineColor = Color.red;
    [Tooltip("충돌 지점 마커 크기")]
    public float HitMarkerSize = 0.02f;

    [Header("Game 뷰 표시")]
    [Tooltip("켜면 플레이 화면(Game 뷰)에도 LineRenderer로 표시")]
    public bool ShowInGameView = false;
    [Tooltip("LineRenderer 두께")]
    public float LineWidth = 0.004f;

    private LineRenderer _lineRenderer;

    // ──────────────────────────────────────────────────────────────
    // TCP에서 시작점/방향 계산
    // ──────────────────────────────────────────────────────────────
    private bool TryGetRay(out Vector3 origin, out Vector3 direction)
    {
        origin = transform.position;
        direction = Vector3.down;

        if (Controller == null) return false;

        Matrix4x4 tcp;
        try { tcp = Controller.PoseObserver.ToolCenterPointWorld.Value; }
        catch { return false; }

        origin = tcp.GetPosition();
        Quaternion rot = tcp.rotation;

        direction = Direction switch
        {
            RayDirection.ToolZ    => rot * Vector3.forward,
            RayDirection.ToolDown => rot * Vector3.down,
            _                     => Vector3.down,
        };
        direction.Normalize();
        return true;
    }

    // 시작점, 끝점, 충돌 여부 계산
    private bool ComputeSegment(out Vector3 origin, out Vector3 end, out bool hit)
    {
        end = origin = Vector3.zero;
        hit = false;

        if (!TryGetRay(out origin, out Vector3 dir)) return false;

        float dist = Length;
        if (UseRaycast && Physics.Raycast(origin, dir, out RaycastHit hitInfo, Length, RaycastMask))
        {
            dist = hitInfo.distance;
            hit = true;
        }

        end = origin + dir * dist;
        return true;
    }

    // ──────────────────────────────────────────────────────────────
    // Scene 뷰 기즈모
    // ──────────────────────────────────────────────────────────────
    private void OnDrawGizmos()
    {
        if (!ShowLine) return;
        if (!ComputeSegment(out Vector3 origin, out Vector3 end, out bool hit)) return;

        Gizmos.color = LineColor;
        Gizmos.DrawLine(origin, end);

        if (hit)
            Gizmos.DrawSphere(end, HitMarkerSize);
    }

    // ──────────────────────────────────────────────────────────────
    // Game 뷰 LineRenderer
    // ──────────────────────────────────────────────────────────────
    private void LateUpdate()
    {
        if (!ShowInGameView || !ShowLine)
        {
            if (_lineRenderer != null) _lineRenderer.enabled = false;
            return;
        }

        if (!ComputeSegment(out Vector3 origin, out Vector3 end, out _))
        {
            if (_lineRenderer != null) _lineRenderer.enabled = false;
            return;
        }

        EnsureLineRenderer();
        _lineRenderer.enabled = true;
        _lineRenderer.startWidth = LineWidth;
        _lineRenderer.endWidth = LineWidth;
        _lineRenderer.startColor = LineColor;
        _lineRenderer.endColor = LineColor;
        _lineRenderer.SetPosition(0, origin);
        _lineRenderer.SetPosition(1, end);
    }

    private void EnsureLineRenderer()
    {
        if (_lineRenderer != null) return;

        _lineRenderer = GetComponent<LineRenderer>();
        if (_lineRenderer == null)
            _lineRenderer = gameObject.AddComponent<LineRenderer>();

        _lineRenderer.positionCount = 2;
        _lineRenderer.useWorldSpace = true;
        _lineRenderer.material = new Material(Shader.Find("Sprites/Default"));
        _lineRenderer.textureMode = LineTextureMode.Stretch;
        _lineRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        _lineRenderer.receiveShadows = false;
    }
}
