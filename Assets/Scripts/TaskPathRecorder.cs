using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Preliy.Flange;
using UnityEngine;

/// <summary>
/// 플레이 중 TCP Transform 위치를 감지해 result.json 포맷으로 내보내는 경로 기록기.
///
/// 사용법:
///   1) 빈 GameObject에 이 컴포넌트 추가
///   2) TcpTransform → 로봇 툴 끝 Transform 연결
///   3) 플레이 실행 → 자동 기록
///   4) 플레이 종료 시 자동 내보내기 OR 컴포넌트 우클릭 → "JSON 내보내기"
///
/// PTP/LIN 타입 명시가 필요하면 RobotTask의 ActionInstruction에서
///   recorder.SetNextMotionLIN() 을 호출 후 LIN 이동을 실행합니다.
/// </summary>
public class TaskPathRecorder : MonoBehaviour
{
    [Header("로봇 컨트롤러 (권장 — IK와 동일한 TCP 좌표 기록)")]
    [Tooltip("연결 시 Preliy.Flange PoseObserver에서 TCP를 읽음 (툴 오프셋 포함, 가장 정확)")]
    public Controller Controller;

    [Header("TCP Transform (Controller 없을 때 폴백)")]
    [Tooltip("Controller를 연결했으면 비워도 됨")]
    public Transform TcpTransform;

    [Header("자동 감지")]
    [Tooltip("켜면 TCP 위치가 안정될 때마다 자동으로 웨이포인트 기록")]
    public bool AutoDetect = true;
    [Tooltip("이 속도(m/s) 이하로 떨어지면 정지로 판정")]
    public float MoveThreshold = 0.005f;
    [Tooltip("정지 판정에 필요한 연속 안정 시간(초)")]
    public float SettleTime = 0.15f;
    [Tooltip("이전 기록 위치에서 이 거리 이상 이동해야 새 웨이포인트로 인정")]
    public float MinMoveDistance = 0.01f;

    [Header("메타데이터")]
    public string ProgramId      = "recorded_path";
    public string ProgramName    = "RecordedPath";
    public string DisplayName    = "기록된 경로";
    public string Description    = "Unity 플레이 모드에서 기록된 경로";
    public float  DefaultDelay   = 0.5f;

    [Header("출력")]
    [Tooltip("Assets 폴더 기준 상대 경로 (예: result_recorded.json)")]
    public string OutputPath = "result_recorded.json";
    [Tooltip("플레이 종료 시 자동으로 JSON 내보내기")]
    public bool ExportOnQuit = true;

    // ── 직렬화 구조 (result.json 포맷) ──
    [Serializable] private class WaypointEntry
    {
        public string target;
        public float x, y, z;
        public float rx, ry, rz;  // 오일러 회전 (도)
    }

    [Serializable] private class SequenceStep
    {
        public int    step;
        public string action = "move_cartesian";
        public float  x, y, z;
        public float  rx, ry, rz;  // 오일러 회전 (도)
        public string motion;
        public string target;
        public float  delay;
        public string description;
    }

    [Serializable] private class ProgramData
    {
        public string id, name, display_name, description;
        public string coordinate_space = "world";
        public List<WaypointEntry> waypoints;
        public List<SequenceStep>  sequence;
    }

    [Serializable] private class JsonRoot
    {
        public List<ProgramData> programs;
    }

    // ── 런타임 상태 ──
    private readonly List<SequenceStep> _sequence = new();
    private string  _nextMotion      = "PTP";
    private string  _nextAction      = "move_cartesian";
    private string  _nextDescription = "";
    private float   _settleTimer     = 0f;
    private bool    _wasMoving       = false;
    private Vector3 _prevPos;
    private Vector3 _lastRecordedPos;
    private bool    _exported        = false;

    private void Start()
    {
        if (Controller == null && TcpTransform == null)
        {
            Debug.LogWarning("[PathRecorder] Controller와 TcpTransform 중 하나 이상 연결하세요.", this);
            return;
        }
        _prevPos = _lastRecordedPos = GetTcpPosition();
        _sequence.Clear();
        _exported = false;
        Debug.Log(Controller != null
            ? "[PathRecorder] 기록 시작 (Controller PoseObserver 모드)"
            : "[PathRecorder] 기록 시작 (TcpTransform 폴백 모드)");
    }

    private void Update()
    {
        if (!AutoDetect) return;
        if (Controller == null && TcpTransform == null) return;

        Vector3 currentPos = GetTcpPosition();
        float speed = Vector3.Distance(currentPos, _prevPos) / Mathf.Max(Time.deltaTime, 1e-4f);
        _prevPos = currentPos;

        if (speed > MoveThreshold)
        {
            _wasMoving   = true;
            _settleTimer = 0f;
        }
        else if (_wasMoving)
        {
            _settleTimer += Time.deltaTime;
            if (_settleTimer >= SettleTime)
            {
                _wasMoving = false;
                TryRecord(currentPos, GetTcpRotation(), _nextMotion);
                _nextMotion = "PTP";  // 사용 후 기본값 복원
            }
        }
    }

    // Controller가 있으면 PoseObserver에서 읽고, 없으면 TcpTransform 사용
    private Vector3 GetTcpPosition()
    {
        if (Controller != null)
            return Controller.PoseObserver.ToolCenterPointWorld.Value.GetPosition();
        return TcpTransform != null ? TcpTransform.position : Vector3.zero;
    }

    private Quaternion GetTcpRotation()
    {
        if (Controller != null)
            return Controller.PoseObserver.ToolCenterPointWorld.Value.rotation;
        return TcpTransform != null ? TcpTransform.rotation : Quaternion.identity;
    }

    private void OnApplicationQuit()
    {
        if (ExportOnQuit && !_exported && _sequence.Count > 0)
            ExportJson();
    }

    // ── 외부 호출 API (ActionInstruction에서 사용) ──

    /// <summary>다음 도착 지점을 PTP로 태그합니다 (기본값).</summary>
    public void SetNextMotionPTP() => _nextMotion = "PTP";

    /// <summary>다음 도착 지점을 LIN으로 태그합니다.</summary>
    public void SetNextMotionLIN() => _nextMotion = "LIN";

    /// <summary>
    /// 다음 이동 스텝의 action과 description을 지정합니다.
    /// 이동 인스트럭션 바로 전 ActionInstruction에서 호출하세요.
    /// </summary>
    public void SetNextContext(string action, string description = "")
    {
        _nextAction      = action;
        _nextDescription = description;
    }

    /// <summary>현재 TCP 위치를 즉시 기록합니다 (AutoDetect 없이 명시적 호출).</summary>
    public void RecordNow(string motionType = "PTP")
    {
        TryRecord(GetTcpPosition(), GetTcpRotation(), motionType);
    }

    /// <summary>
    /// grip / release 등 비이동 액션을 현재 TCP 위치와 함께 즉시 기록합니다.
    /// BoltingFeedTask의 SuctionOn/SuctionOff 에서 호출하세요.
    /// </summary>
    public void RecordAction(string action, string description = "")
    {
        // 직전 이동이 settle 대기 중이면 즉시 플러시 — 이동이 액션보다 먼저 기록되도록 보장
        if (_wasMoving)
        {
            _wasMoving   = false;
            _settleTimer = 0f;
            var flushPos = GetTcpPosition();
            var flushRot = GetTcpRotation();
            TryRecord(flushPos, flushRot, _nextMotion);
            _nextMotion = "PTP";
        }

        var pos   = GetTcpPosition();
        var euler = GetTcpRotation().eulerAngles;
        string targetName = $"p_{_sequence.Count * 10}";

        _sequence.Add(new SequenceStep
        {
            step        = _sequence.Count + 1,
            action      = action,
            x           = Round(pos.x),
            y           = Round(pos.y),
            z           = Round(pos.z),
            rx          = Round(euler.x),
            ry          = Round(euler.y),
            rz          = Round(euler.z),
            motion      = "PTP",
            target      = targetName,
            delay       = 0f,
            description = description
        });
        // 이동 감지용 _lastRecordedPos는 갱신하지 않음 — 다음 위치 기록에 지장 없도록

        Debug.Log($"[PathRecorder] Action '{action}' Step {_sequence.Count} — {description}");
    }

    // ── 내부 기록 ──
    private void TryRecord(Vector3 pos, Quaternion rot, string motion)
    {
        if (Vector3.Distance(pos, _lastRecordedPos) < MinMoveDistance) return;

        string targetName = $"p_{_sequence.Count * 10}";
        string desc = string.IsNullOrEmpty(_nextDescription)
            ? $"{motion} 모드로 {targetName} 위치로 이동합니다."
            : _nextDescription;

        var euler = rot.eulerAngles;
        _sequence.Add(new SequenceStep
        {
            step        = _sequence.Count + 1,
            action      = _nextAction,
            x           = Round(pos.x),
            y           = Round(pos.y),
            z           = Round(pos.z),
            rx          = Round(euler.x),
            ry          = Round(euler.y),
            rz          = Round(euler.z),
            motion      = motion,
            target      = targetName,
            delay       = DefaultDelay,
            description = desc
        });
        _lastRecordedPos = pos;

        // 컨텍스트 초기화
        _nextAction      = "move_cartesian";
        _nextDescription = "";
        _nextMotion      = "PTP";

        Debug.Log($"[PathRecorder] Step {_sequence.Count} — {targetName}  " +
                  $"({pos.x:F4}, {pos.y:F4}, {pos.z:F4})  [{motion}]  {desc}");
    }

    // ── JSON 내보내기 ──
    [ContextMenu("JSON 내보내기")]
    public void ExportJson()
    {
        if (_sequence.Count == 0)
        {
            Debug.LogWarning("[PathRecorder] 기록된 스텝이 없습니다.", this);
            return;
        }

        // 중복 없는 waypoints 목록 (target명 기준)
        var waypointsMap = new Dictionary<string, WaypointEntry>();
        foreach (var step in _sequence)
        {
            if (!waypointsMap.ContainsKey(step.target))
                waypointsMap[step.target] = new WaypointEntry
                {
                    target = step.target,
                    x = step.x, y = step.y, z = step.z,
                    rx = step.rx, ry = step.ry, rz = step.rz
                };
        }

        var root = new JsonRoot
        {
            programs = new List<ProgramData>
            {
                new ProgramData
                {
                    id           = ProgramId,
                    name         = ProgramName,
                    display_name = DisplayName,
                    description  = Description,
                    waypoints    = waypointsMap.Values.ToList(),
                    sequence     = _sequence
                }
            }
        };

        string json = JsonUtility.ToJson(root, prettyPrint: true);
        string fullPath = Path.Combine(Application.dataPath, OutputPath);
        File.WriteAllText(fullPath, json);
        _exported = true;

#if UNITY_EDITOR
        UnityEditor.AssetDatabase.Refresh();
#endif
        Debug.Log($"[PathRecorder] 내보내기 완료 → {fullPath}  ({_sequence.Count}스텝)");
    }

    [ContextMenu("기록 초기화")]
    public void ClearRecording()
    {
        _sequence.Clear();
        if (TcpTransform != null) _lastRecordedPos = TcpTransform.position;
        _exported = false;
        Debug.Log("[PathRecorder] 기록 초기화");
    }

    private static float Round(float v) => Mathf.Round(v * 10000f) / 10000f;
}
