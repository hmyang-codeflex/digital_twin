using System.Collections;
using UnityEngine;

/// <summary>
/// Linear 모션 인스트럭션
/// TCP가 직선 경로를 따라 목표 위치로 이동
/// </summary>
public class LIN : Instruction
{
    private readonly Transform _targetTransform;
    private readonly Vector3 _position;
    private readonly Quaternion _rotation;
    private readonly bool _hasTransform;

    public LIN(Transform target)
    {
        _targetTransform = target;
        _hasTransform = true;
    }

    /// <summary>Target 컴포넌트로 LIN</summary>
    public LIN(Preliy.Flange.Target target) : this(target.transform) { }

    public LIN(Vector3 position) : this(position, Quaternion.identity) { }

    public LIN(Vector3 position, Quaternion rotation)
    {
        _position = position;
        _rotation = rotation;
        _hasTransform = false;
    }

    public new LIN Frame(Transform frame) { base.Frame(frame); return this; }
    public new LIN Speed(float factor) { base.Speed(factor); return this; }

    public override IEnumerator Execute(RobotTask task)
    {
        Matrix4x4 targetMatrix = _hasTransform
            ? _targetTransform.localToWorldMatrix
            : ToWorldMatrix(_position, _rotation);

        // LIN은 직선 경로 보간 (Instruction 베이스와 동일 - Cartesian 보간)
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
            return $"LIN → {_targetTransform.name}";
        return $"LIN → ({_position.x:F0}, {_position.y:F0}, {_position.z:F0})";
    }
}
