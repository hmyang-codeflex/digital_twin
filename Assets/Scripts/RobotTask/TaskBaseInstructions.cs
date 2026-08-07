using System.Collections.Generic;
using Preliy.Flange;
using UnityEngine;

public class TaskBaseInstructions : RobotTask
{
    [SerializeField]
    private List<Target> _target;

    private void Awake()
    {
        Debug.Log($"[TaskBaseInstructions] Awake - _target.Count = {(_target == null ? "NULL" : _target.Count.ToString())}");
    }

    override protected void Program()
    {
        if (_target == null || _target.Count == 0) return;

        // 디버그: 리스트 내용 확인
        Debug.Log($"[TaskBaseInstructions] _target.Count = {_target.Count}");
        for (int i = 0; i < _target.Count; i++)
            Debug.Log($"  [{i}] = {(_target[i] == null ? "NULL" : _target[i].name)}");

        this.Message(LogType.Log, "Start Task");
        this.Speed(0.2f);

        // Inspector에 등록된 모든 타겟으로 PTP
        foreach (var t in _target)
        {
            if (t == null) { Debug.LogWarning("[TaskBaseInstructions] null Target 건너뜀"); continue; }
            this.PTP(t);
        }

        // 다시 LIN으로 역순 이동
        for (int i = _target.Count - 1; i >= 0; i--)
        {
            if (_target[i] == null) continue;
            this.LIN(_target[i]);
        }

        this.Message(LogType.Log, "End Task");
    }
}
