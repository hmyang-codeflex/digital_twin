using System.Collections.Generic;
using Preliy.Flange;
using UnityEngine;

/// <summary>
/// BX200L 로봇 픽앤플레이스 태스크 예시
/// 
/// [씬 설정]
/// 1. 빈 GameObject에 이 스크립트 추가
/// 2. Controller → BX200L의 Controller 컴포넌트 연결
/// 3. _target 리스트에 포인트 Transform들 추가:
///    [0] p_Approach  - 큐브 위 접근 위치
///    [1] p_Pick      - 집는 위치
///    [2] p_Lift      - 들어올린 위치
///    [3] p_Place     - 내려놓는 위치
///    [4] p_Home      - 홈 위치
/// 4. GripperBridge → GripperEventBridge 컴포넌트 연결
/// 5. Auto Start 체크하거나 Inspector 우클릭 → Execute
/// </summary>
public class TaskBX200L : RobotTask
{
    [Header("Targets")]
    [SerializeField] private List<Transform> _target = new();

    [Header("Gripper")]
    [SerializeField] private GripperEventBridge _gripperBridge;

    [Header("Reference Frame (선택)")]
    [SerializeField] private SceneReferenceFrame _referenceFrame;

    protected override void Program()
    {
        if (_target == null || _target.Count == 0) return;

        Message(LogType.Log, "Start Task");
        Speed(0.5f);

        // 등록된 모든 타겟으로 순서대로 PTP
        foreach (var t in _target)
        {
            if (t == null) continue;
            Move(new PTP(t));
        }

        // 역순으로 LIN 복귀
        for (int i = _target.Count - 1; i >= 0; i--)
        {
            if (_target[i] == null) continue;
            Move(new LIN(_target[i]));
        }

        Message(LogType.Log, "End Task");
    }
}
