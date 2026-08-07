using System.Collections;
using Preliy.Flange;
using UnityEngine;

/// <summary>
/// CIRC - 원호 모션 인스트럭션
/// 현재 TCP 위치(시작점), viaPoint(경유점), endPoint(도착점)
/// 3점을 지나는 원의 호를 따라 이동합니다.
/// </summary>
public class CIRC : Instruction
{
    private readonly Transform _endTransform;
    private readonly Transform _viaTransform;
    private readonly Vector3? _endPosition;
    private readonly Vector3? _viaPosition;

    /// <summary>Transform 타겟으로 원호 이동</summary>
    public CIRC(Transform end, Transform via)
    {
        _endTransform = end;
        _viaTransform = via;
    }

    /// <summary>Target 컴포넌트로 원호 이동</summary>
    public CIRC(Preliy.Flange.Target end, Preliy.Flange.Target via)
    {
        _endTransform = end.transform;
        _viaTransform = via.transform;
    }

    /// <summary>Vector3 좌표로 원호 이동</summary>
    public CIRC(Vector3 end, Vector3 via)
    {
        _endPosition = end;
        _viaPosition = via;
    }

    public new CIRC Frame(Transform frame) { base.Frame(frame); return this; }
    public new CIRC Speed(float factor) { base.Speed(factor); return this; }

    public override IEnumerator Execute(RobotTask task)
    {
        var controller = task.Controller;
        var config = task.DefaultConfiguration;
        var extJoints = new ExtJoint(0, 0, 0, 0, 0, 0);

        Matrix4x4 startMatrix = controller.PoseObserver.ToolCenterPointWorld.Value;
        Vector3 startPos = startMatrix.GetPosition();
        Quaternion startRot = startMatrix.rotation;

        Vector3 endPos = _endTransform != null ? _endTransform.position
            : ToWorldMatrix(_endPosition ?? Vector3.zero, Quaternion.identity).GetPosition();
        Quaternion endRot = _endTransform != null ? _endTransform.rotation : startRot;

        Vector3 viaPos = _viaTransform != null ? _viaTransform.position
            : ToWorldMatrix(_viaPosition ?? Vector3.zero, Quaternion.identity).GetPosition();

        // 3점 외접원 계산
        if (!TryGetCircumcenter(startPos, viaPos, endPos, out Vector3 center, out Vector3 normal))
        {
            // 직선에 가까운 경우 LIN으로 폴백
            yield return InterpolateTCP(task, Matrix4x4.TRS(endPos, endRot, Vector3.one));
            yield break;
        }

        float radius = Vector3.Distance(center, startPos);

        // 호의 방향 결정 (startPos → viaPos → endPos 방향)
        Vector3 toStart = (startPos - center).normalized;
        Vector3 toVia = (viaPos - center).normalized;
        Vector3 toEnd = (endPos - center).normalized;

        float angleToVia = SignedAngle(toStart, toVia, normal);
        float angleToEnd = SignedAngle(toStart, toEnd, normal);

        // viaPos가 경로 중간에 오도록 방향 결정
        if (angleToVia < 0) angleToVia += 360f;
        if (angleToEnd < 0) angleToEnd += 360f;

        bool ccw = angleToVia <= angleToEnd;
        float sweep = ccw ? angleToEnd : -(360f - angleToEnd);

        float arcLength = Mathf.Abs(sweep * Mathf.Deg2Rad) * radius;
        float speed = task.DefaultSpeed * SpeedFactor;
        float duration = Mathf.Max(arcLength / speed, 0.05f);

        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(elapsed / duration));
            float angle = sweep * t;

            Vector3 pos = center + Quaternion.AngleAxis(angle, normal) * (toStart * radius);
            Quaternion rot = Quaternion.Slerp(startRot, endRot, t);
            var stepMatrix = Matrix4x4.TRS(pos, rot, Vector3.one);
            var solution = controller.Solver.ComputeInverse(stepMatrix, controller.Tool.Value, config, extJoints, SolutionIgnoreMask.All);
            controller.Solver.TryApplySolution(solution, false);
            yield return null;
        }

        // 최종 위치 확정
        var finalSolution = controller.Solver.ComputeInverse(
            Matrix4x4.TRS(endPos, endRot, Vector3.one),
            controller.Tool.Value, config, extJoints, SolutionIgnoreMask.All);
        controller.Solver.TryApplySolution(finalSolution, true);
    }

    public override string GetLabel() => "CIRC";

    public override void DrawGizmo(Vector3 fromPos, Quaternion fromRot, GizmoContext ctx, out Vector3 toPos, out Quaternion toRot)
    {
        toPos = _endTransform != null ? _endTransform.position : (_endPosition ?? fromPos);
        toRot = _endTransform != null ? _endTransform.rotation : fromRot;
        Vector3 viaPos = _viaTransform != null ? _viaTransform.position : (_viaPosition ?? fromPos);

        if (!TryGetCircumcenter(fromPos, viaPos, toPos, out Vector3 center, out Vector3 normal))
        {
            Gizmos.color = ctx.LineColor;
            Gizmos.DrawLine(fromPos, toPos);
            return;
        }

        float radius = Vector3.Distance(center, fromPos);
        Vector3 toStart = (fromPos - center).normalized;
        Vector3 toVia   = (viaPos  - center).normalized;
        Vector3 toEnd   = (toPos   - center).normalized;

        float angleToVia = SignedAngle(toStart, toVia, normal);
        float angleToEnd = SignedAngle(toStart, toEnd, normal);
        if (angleToVia < 0) angleToVia += 360f;
        if (angleToEnd < 0) angleToEnd += 360f;
        bool ccw = angleToVia <= angleToEnd;
        float sweep = ccw ? angleToEnd : -(360f - angleToEnd);

        int steps = Mathf.Max(16, Mathf.CeilToInt(Mathf.Abs(sweep) / 5f));
        Gizmos.color = ctx.LineColor;
        Vector3 prev = fromPos;
        for (int i = 1; i <= steps; i++)
        {
            float angle = sweep * i / steps;
            Vector3 next = center + Quaternion.AngleAxis(angle, normal) * (toStart * radius);
            Gizmos.DrawLine(prev, next);
            prev = next;
        }
        // 구체·프레임은 RobotTask.OnDrawGizmos 에서 일괄 처리
    }

    public override bool TryGetTargetPoint(out Vector3 pos, out Quaternion rot)
    {
        pos = _endTransform != null ? _endTransform.position : (_endPosition ?? Vector3.zero);
        rot = _endTransform != null ? _endTransform.rotation : Quaternion.identity;
        return true;
    }

    /// <summary>런타임 경로 시각화용 경유점 월드 좌표 (Gizmo와 동일한 값)</summary>
    public Vector3 GetViaWorldPosition(Vector3 fallback)
    {
        return _viaTransform != null ? _viaTransform.position : ToWorldMatrix(_viaPosition ?? fallback, Quaternion.identity).GetPosition();
    }

    /// <summary>3점을 지나는 외접원의 중심과 법선 계산</summary>
    private static bool TryGetCircumcenter(Vector3 a, Vector3 b, Vector3 c,
        out Vector3 center, out Vector3 normal)
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
}
