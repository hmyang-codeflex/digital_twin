using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// RobotTask의 OnDrawGizmos 경로 미리보기를 빌드된 실행 파일에서도 동일하게 보여주기 위한
/// 런타임 시각화 컴포넌트. Gizmos는 에디터 전용이라 빌드에 포함되지 않으므로,
/// 동일한 경로 데이터를 LineRenderer/Primitive로 다시 그린다.
/// RobotTask/Instruction의 실행 로직은 건드리지 않고, 공개된 읽기전용 데이터만 사용한다.
/// </summary>
[RequireComponent(typeof(RobotTask))]
public class RuntimePathVisualizer : MonoBehaviour
{
    [Header("표시 설정")]
    [SerializeField] private float _lineWidth = 0.004f;
    [SerializeField] private float _markerSize = 0.04f;
    [SerializeField] private float _frameSize = 0.06f;
    [SerializeField] private int _curveSteps = 24;

    private RobotTask _task;
    private Material _lineMaterial;
    private Material _markerMaterial;

    private LineRenderer _pathLine;
    private LineRenderer _loopLine;
    private readonly List<Transform> _markers = new();
    private readonly List<LineRenderer[]> _frameAxes = new(); // 각 웨이포인트당 X/Y/Z 3개

    private void Awake()
    {
        _task = GetComponent<RobotTask>();

        // LineRenderer의 시작/끝 컬러(버텍스 컬러)는 Sprites/Default가 가장 안정적으로 반영함
        _lineMaterial = new Material(Shader.Find("Sprites/Default"));

        var markerShader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default");
        _markerMaterial = new Material(markerShader);

        _pathLine = CreateLineRenderer("RuntimePath_Line", _lineMaterial);
        _loopLine = CreateLineRenderer("RuntimePath_LoopLine", _lineMaterial);
    }

    private LineRenderer CreateLineRenderer(string name, Material mat)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        var lr = go.AddComponent<LineRenderer>();
        lr.material = mat;
        lr.useWorldSpace = true;
        lr.widthMultiplier = _lineWidth;
        lr.positionCount = 0;
        lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        lr.receiveShadows = false;
        return lr;
    }

    private void LateUpdate()
    {
        if (!_task.ShowPathGizmo)
        {
            _pathLine.positionCount = 0;
            _loopLine.positionCount = 0;
            SetMarkersActive(0);
            return;
        }

        var waypoints = _task.GetRuntimeWaypoints();
        if (waypoints.Count < 2)
        {
            _pathLine.positionCount = 0;
            _loopLine.positionCount = 0;
            SetMarkersActive(0);
            return;
        }

        var points = new List<Vector3> { waypoints[0].Position };

        for (int i = 1; i < waypoints.Count; i++)
        {
            var prev = waypoints[i - 1];
            var cur = waypoints[i];

            if (cur.Instruction is CIRC circ)
            {
                AppendArc(points, prev.Position, circ.GetViaWorldPosition(prev.Position), cur.Position);
            }
            else if (cur.Instruction is LIN)
            {
                points.Add(cur.Position);
            }
            else
            {
                Vector3 p0 = waypoints[Mathf.Max(i - 2, 0)].Position;
                Vector3 p1 = prev.Position;
                Vector3 p2 = cur.Position;
                Vector3 p3 = waypoints[Mathf.Min(i + 1, waypoints.Count - 1)].Position;
                AppendCatmullRom(points, p0, p1, p2, p3, _curveSteps);
            }
        }

        SetLineColor(_pathLine, _task.LineColor);
        _pathLine.positionCount = points.Count;
        _pathLine.SetPositions(points.ToArray());

        if (_task.LoopExecution && waypoints.Count >= 2)
        {
            var loopPoints = new List<Vector3>();
            Vector3 p0 = waypoints[Mathf.Max(waypoints.Count - 2, 0)].Position;
            Vector3 p1 = waypoints[waypoints.Count - 1].Position;
            Vector3 p2 = waypoints[1].Position; // [0]은 시작점
            Vector3 p3 = waypoints[Mathf.Min(2, waypoints.Count - 1)].Position;
            loopPoints.Add(p1);
            AppendCatmullRom(loopPoints, p0, p1, p2, p3, _curveSteps);

            var loopColor = _task.LineColor;
            loopColor.a *= 0.4f;
            SetLineColor(_loopLine, loopColor);
            _loopLine.positionCount = loopPoints.Count;
            _loopLine.SetPositions(loopPoints.ToArray());
        }
        else
        {
            _loopLine.positionCount = 0;
        }

        UpdateMarkers(waypoints);
    }

    private void AppendArc(List<Vector3> points, Vector3 fromPos, Vector3 viaPos, Vector3 toPos)
    {
        if (!TryGetCircumcenter(fromPos, viaPos, toPos, out Vector3 center, out Vector3 normal))
        {
            points.Add(toPos);
            return;
        }

        float radius = Vector3.Distance(center, fromPos);
        Vector3 toStart = (fromPos - center).normalized;
        Vector3 toVia = (viaPos - center).normalized;
        Vector3 toEnd = (toPos - center).normalized;

        float angleToVia = SignedAngle(toStart, toVia, normal);
        float angleToEnd = SignedAngle(toStart, toEnd, normal);
        if (angleToVia < 0) angleToVia += 360f;
        if (angleToEnd < 0) angleToEnd += 360f;
        bool ccw = angleToVia <= angleToEnd;
        float sweep = ccw ? angleToEnd : -(360f - angleToEnd);

        int steps = Mathf.Max(16, Mathf.CeilToInt(Mathf.Abs(sweep) / 5f));
        for (int i = 1; i <= steps; i++)
        {
            float angle = sweep * i / steps;
            points.Add(center + Quaternion.AngleAxis(angle, normal) * (toStart * radius));
        }
    }

    private static void AppendCatmullRom(List<Vector3> points, Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, int steps)
    {
        for (int s = 1; s <= steps; s++)
        {
            float t = s / (float)steps;
            float t2 = t * t, t3 = t2 * t;
            Vector3 next = 0.5f * (
                  2f * p1
                + (-p0 + p2) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
            points.Add(next);
        }
    }

    private static bool TryGetCircumcenter(Vector3 a, Vector3 b, Vector3 c, out Vector3 center, out Vector3 normal)
    {
        Vector3 ab = b - a;
        Vector3 ac = c - a;
        Vector3 cross = Vector3.Cross(ab, ac);

        if (cross.magnitude < 1e-6f)
        {
            center = Vector3.zero;
            normal = Vector3.up;
            return false;
        }

        normal = cross.normalized;
        float denom = 2f * cross.sqrMagnitude;
        Vector3 offset = (Vector3.Cross(cross, ab) * ac.sqrMagnitude
                        + Vector3.Cross(ac, cross) * ab.sqrMagnitude) / denom;
        center = a + offset;
        return true;
    }

    private static float SignedAngle(Vector3 from, Vector3 to, Vector3 axis)
    {
        float angle = Vector3.Angle(from, to);
        Vector3 cross = Vector3.Cross(from, to);
        if (Vector3.Dot(cross, axis) < 0) angle = -angle;
        return angle;
    }

    private void UpdateMarkers(List<RobotTask.RuntimeWaypoint> waypoints)
    {
        EnsureMarkerCount(waypoints.Count);

        for (int i = 0; i < waypoints.Count; i++)
        {
            var marker = _markers[i];
            marker.gameObject.SetActive(true);
            marker.position = waypoints[i].Position;
            float scale = (i == 0 ? _markerSize * 1.2f : _markerSize) * _task.GizmoScale;
            marker.localScale = Vector3.one * scale;

            if (_task.ShowFrames)
            {
                UpdateFrameAxes(i, waypoints[i].Position, waypoints[i].Rotation);
            }
            else
            {
                foreach (var lr in _frameAxes[i]) lr.positionCount = 0;
            }
        }
    }

    private void UpdateFrameAxes(int index, Vector3 pos, Quaternion rot)
    {
        float size = _frameSize * _task.GizmoScale;
        var axes = _frameAxes[index];
        Vector3[] dirs = { rot * Vector3.right, rot * Vector3.up, rot * Vector3.forward };
        Color[] colors = { Color.red, Color.green, Color.blue };

        for (int a = 0; a < 3; a++)
        {
            axes[a].positionCount = 2;
            axes[a].SetPosition(0, pos);
            axes[a].SetPosition(1, pos + dirs[a] * size);
            SetLineColor(axes[a], colors[a]);
        }
    }

    private void EnsureMarkerCount(int count)
    {
        while (_markers.Count < count)
        {
            var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphere.name = "RuntimePath_Marker";
            sphere.transform.SetParent(transform, false);
            var collider = sphere.GetComponent<Collider>();
            if (collider != null) Destroy(collider);
            sphere.GetComponent<MeshRenderer>().sharedMaterial = _markerMaterial;
            _markers.Add(sphere.transform);

            var axisGo = new GameObject("RuntimePath_Frame");
            axisGo.transform.SetParent(transform, false);
            var axes = new[]
            {
                CreateLineRenderer("X", _lineMaterial),
                CreateLineRenderer("Y", _lineMaterial),
                CreateLineRenderer("Z", _lineMaterial)
            };
            foreach (var lr in axes) lr.transform.SetParent(axisGo.transform, false);
            _frameAxes.Add(axes);
        }

        SetLineColor(_pathLine, _task.LineColor);
        _markerMaterial.color = _task.PointColor;

        SetMarkersActive(count);
    }

    private void SetMarkersActive(int activeCount)
    {
        for (int i = 0; i < _markers.Count; i++)
        {
            bool active = i < activeCount;
            _markers[i].gameObject.SetActive(active);
            if (!active)
                foreach (var lr in _frameAxes[i]) lr.positionCount = 0;
        }
    }

    private static void SetLineColor(LineRenderer lr, Color color)
    {
        lr.startColor = color;
        lr.endColor = color;
    }
}
