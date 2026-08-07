using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 로봇 Target 오브젝트를 웨이포인트 순서대로 이동시키는 시퀀서
/// </summary>
public class RobotWaypointSequencer : MonoBehaviour
{
    [System.Serializable]
    public class Waypoint
    {
        public string label;
        public Transform point;
        [Tooltip("이 웨이포인트 도달 시 실행할 동작")]
        public WaypointAction action = WaypointAction.None;
        [Tooltip("다음 웨이포인트로 이동하기 전 대기 시간 (초)")]
        public float holdTime = 0.2f;
    }

    public enum WaypointAction
    {
        None,
        Grip,
        Release
    }

    [Header("References")]
    [Tooltip("TargetFollower가 붙어있는 Target 오브젝트")]
    public Transform robotTarget;
    [Tooltip("GripperEventBridge 컴포넌트")]
    public GripperEventBridge gripperBridge;

    [Header("Settings")]
    [Tooltip("웨이포인트 간 이동 속도 (m/s)")]
    public float moveSpeed = 0.5f;
    [Tooltip("Play 시 자동 시작")]
    public bool autoStart = false;

    [Header("Waypoints")]
    public List<Waypoint> waypoints = new();

    private bool _isRunning = false;

    private void Start()
    {
        if (autoStart) StartSequence();
    }

    [ContextMenu("Start Sequence")]
    public void StartSequence()
    {
        if (_isRunning) return;
        StartCoroutine(RunSequence());
    }

    public void StopSequence()
    {
        StopAllCoroutines();
        _isRunning = false;
    }

    private IEnumerator RunSequence()
    {
        _isRunning = true;

        foreach (var waypoint in waypoints)
        {
            if (waypoint.point == null) continue;

            // 웨이포인트로 이동
            yield return StartCoroutine(MoveToWaypoint(waypoint.point));

            // 대기
            yield return new WaitForSeconds(waypoint.holdTime);

            // 동작 실행
            ExecuteAction(waypoint.action);

            // 동작 후 짧은 대기
            if (waypoint.action != WaypointAction.None)
                yield return new WaitForSeconds(0.5f);
        }

        _isRunning = false;
    }

    private IEnumerator MoveToWaypoint(Transform target)
    {
        while (Vector3.Distance(robotTarget.position, target.position) > 0.001f)
        {
            robotTarget.position = Vector3.MoveTowards(
                robotTarget.position,
                target.position,
                moveSpeed * Time.deltaTime
            );
            robotTarget.rotation = Quaternion.RotateTowards(
                robotTarget.rotation,
                target.rotation,
                moveSpeed * 100f * Time.deltaTime
            );
            yield return null;
        }
        robotTarget.position = target.position;
        robotTarget.rotation = target.rotation;
    }

    private void ExecuteAction(WaypointAction action)
    {
        if (gripperBridge == null) return;
        switch (action)
        {
            case WaypointAction.Grip:
                gripperBridge.Grip();
                break;
            case WaypointAction.Release:
                gripperBridge.Release();
                break;
        }
    }
}
