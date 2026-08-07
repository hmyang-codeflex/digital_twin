using System.Collections;
using Preliy.Flange;
using UnityEngine;

/// <summary>기즈모 렌더링 설정을 전달하는 컨텍스트</summary>
public struct GizmoContext
{
    public Color LineColor;
    public Color PointColor;
    public float Scale;
    public bool  ShowLabel;
    public bool  ShowFrames;
}

/// <summary>
/// 로봇 인스트럭션 베이스 클래스
/// </summary>
public abstract class Instruction
{
    protected Transform ReferenceFrame;
    protected float SpeedFactor = 1f;

    /// <summary>기준 좌표계 설정 (SceneReferenceFrame의 Transform 전달)</summary>
    public Instruction Frame(Transform frame) { ReferenceFrame = frame; return this; }

    /// <summary>이동 속도 배율 (1 = 기본속도, 0.1 = 10%)</summary>
    public Instruction Speed(float factor) { SpeedFactor = Mathf.Clamp(factor, 0.01f, 10f); return this; }

    public abstract IEnumerator Execute(RobotTask task);
    public abstract string GetLabel();

    /// <summary>Scene 뷰 기즈모 미리보기. fromPos/fromRot 에서 출발해 다음 위치를 toPos/toRot 에 반환.</summary>
    public virtual void DrawGizmo(Vector3 fromPos, Quaternion fromRot, GizmoContext ctx, out Vector3 toPos, out Quaternion toRot)
    {
        toPos = fromPos;
        toRot = fromRot;
    }

    /// <summary>이동 목표 위치 반환 (Gizmo 스플라인용). 이동 인스트럭션만 true 반환.</summary>
    public virtual bool TryGetTargetPoint(out Vector3 pos, out Quaternion rot)
    {
        pos = Vector3.zero;
        rot = Quaternion.identity;
        return false;
    }

    /// <summary>흰 점선 그리기 (PTP 전용)</summary>
    protected static void DrawDashedLine(Vector3 from, Vector3 to, float dashLen = 0.08f)
    {
        float total = Vector3.Distance(from, to);
        if (total < 1e-4f) return;
        Vector3 dir = (to - from) / total;
        float t = 0f;
        bool drawing = true;
        while (t < total)
        {
            float end = Mathf.Min(t + dashLen, total);
            if (drawing) Gizmos.DrawLine(from + dir * t, from + dir * end);
            t = end + dashLen * 0.5f;
            drawing = !drawing;
        }
    }

    /// <summary>좌표 프레임 (XYZ 축) 그리기</summary>
    protected static void DrawFrame(Vector3 pos, Quaternion rot, float size)
    {
        var c = Gizmos.color;
        Gizmos.color = Color.red;   Gizmos.DrawLine(pos, pos + rot * Vector3.right   * size);
        Gizmos.color = Color.green; Gizmos.DrawLine(pos, pos + rot * Vector3.up      * size);
        Gizmos.color = Color.blue;  Gizmos.DrawLine(pos, pos + rot * Vector3.forward * size);
        Gizmos.color = c;
    }

    /// <summary>좌표를 월드 좌표계로 변환</summary>
    protected Matrix4x4 ToWorldMatrix(Vector3 pos, Quaternion rot)
    {
        if (ReferenceFrame != null)
            return ReferenceFrame.localToWorldMatrix * Matrix4x4.TRS(pos, rot, Vector3.one);
        return Matrix4x4.TRS(pos, rot, Vector3.one);
    }

    protected IEnumerator InterpolateTCP(RobotTask task, Matrix4x4 targetMatrix, bool suppressError = false, string label = null)
    {
        var controller = task.Controller;
        var config = task.DefaultConfiguration;
        var extJoints = new ExtJoint(0, 0, 0, 0, 0, 0);

        Matrix4x4 startMatrix = controller.PoseObserver.ToolCenterPointWorld.Value;
        Vector3 startPos = startMatrix.GetPosition();
        Quaternion startRot = startMatrix.rotation;
        Vector3 endPos = targetMatrix.GetPosition();
        Quaternion endRot = targetMatrix.rotation;

        float posDist = Vector3.Distance(startPos, endPos);
        float rotDist = Quaternion.Angle(startRot, endRot) * Mathf.Deg2Rad;
        float speed = task.DefaultSpeed * SpeedFactor;
        float duration = Mathf.Max(posDist / speed, rotDist / (speed + 1f), 0.05f);

        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(elapsed / duration));
            Vector3 pos = Vector3.Lerp(startPos, endPos, t);
            Quaternion rot = Quaternion.Slerp(startRot, endRot, t);
            var stepMatrix = Matrix4x4.TRS(pos, rot, Vector3.one);
            var solution = controller.Solver.ComputeInverse(stepMatrix, controller.Tool.Value, config, extJoints, SolutionIgnoreMask.All);
            controller.Solver.TryApplySolution(solution, false);
            yield return null;
        }

        // 최종 위치로 정확히 이동
        var finalSolution = controller.Solver.ComputeInverse(targetMatrix, controller.Tool.Value, config, extJoints, SolutionIgnoreMask.All);
        controller.Solver.TryApplySolution(finalSolution, !suppressError);

        // 도달 시 위치 + 조인트 값 로그
        if (label != null)
        {
            var tcp = controller.PoseObserver.ToolCenterPointWorld.Value;
            var p = tcp.GetPosition();
            var jt = finalSolution.JointTarget;
            Debug.Log(
                $"[Arrived] {label}\n" +
                $"  Position : ({p.x:F4}, {p.y:F4}, {p.z:F4})\n" +
                $"  Joints   : J1={jt[0]:F2}°  J2={jt[1]:F2}°  J3={jt[2]:F2}°  J4={jt[3]:F2}°  J5={jt[4]:F2}°  J6={jt[5]:F2}°"
            );
        }
    }
}
