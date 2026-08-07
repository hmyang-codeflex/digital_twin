using System.Collections;
using UnityEngine;

/// <summary>
/// Point-to-Point 모션 인스트럭션
/// 경로에 관계없이 목표 위치로 이동 (관절 보간)
/// </summary>
public class PTP : Instruction
{
    private readonly Transform _targetTransform;
    private readonly Vector3 _position;
    private readonly Quaternion _rotation;
    private readonly bool _hasTransform;

    public PTP(Transform target)
    {
        _targetTransform = target;
        _hasTransform = true;
    }

    /// <summary>Target 컴포넌트로 PTP</summary>
    public PTP(Preliy.Flange.Target target) : this(target.transform) { }

    public PTP(Vector3 position) : this(position, Quaternion.identity) { }

    public PTP(Vector3 position, Quaternion rotation)
    {
        _position = position;
        _rotation = rotation;
        _hasTransform = false;
    }

    public new PTP Frame(Transform frame) { base.Frame(frame); return this; }
    public new PTP Speed(float factor) { base.Speed(factor); return this; }

    public override IEnumerator Execute(RobotTask task)
    {
        Matrix4x4 targetMatrix = _hasTransform
            ? _targetTransform.localToWorldMatrix
            : ToWorldMatrix(_position, _rotation);

        yield return InterpolateTCP(task, targetMatrix, label: GetLabel());
    }

    public override void DrawGizmo(Vector3 fromPos, Quaternion fromRot, GizmoContext ctx, out Vector3 toPos, out Quaternion toRot)
    {
        toPos = _hasTransform && _targetTransform != null ? _targetTransform.position : _position;
        toRot = _hasTransform && _targetTransform != null ? _targetTransform.rotation : _rotation;
        // 선 그리기는 RobotTask.OnDrawGizmos 의 Catmull-Rom 스플라인이 담당
    }

    public override bool TryGetTargetPoint(out Vector3 pos, out Quaternion rot)
    {
        pos = _hasTransform && _targetTransform != null ? _targetTransform.position : _position;
        rot = _hasTransform && _targetTransform != null ? _targetTransform.rotation : _rotation;
        return true;
    }

    public override string GetLabel()
    {
        if (_hasTransform && _targetTransform != null)
            return $"PTP → {_targetTransform.name}";
        return $"PTP → ({_position.x:F0}, {_position.y:F0}, {_position.z:F0})";
    }
}
