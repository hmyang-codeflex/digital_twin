using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public class DigitalTwinEmitter : MonoBehaviour
{
    [Header("발행 설정")]
    [Tooltip("비워두면 HTTP 발행 없이 LatestJson만 갱신")]
    public string PublishUrl      = "http://localhost:5051/api/twin";
    [Tooltip("발행 주기 (초)")]
    public float  PublishInterval = 1.0f;

    [Header("시뮬레이션 노이즈")]
    [Range(0f, 0.005f), Tooltip("TCP 위치 가우시안 노이즈 크기 (m)")]
    public float PositionNoise = 0.0005f;
    [Range(0f, 0.5f),   Tooltip("각도 가우시안 노이즈 크기 (°)")]
    public float AngleNoise    = 0.05f;

    [Header("상태 — 읽기 전용")]
    [SerializeField] private int    _seq;
    [SerializeField] private string _lastPublishTime = "";
    [SerializeField] private bool   _lastPostOk      = true;

    public string LatestJson { get; private set; } = "";

    // 로봇 가상 물리량 누적
    private readonly Dictionary<string, float> _temperature = new();
    private readonly Dictionary<string, float> _power       = new();

    // 그리퍼 이전 상태 (체결/해제 이벤트 감지)
    private readonly Dictionary<string, bool>   _prevGripping    = new();
    private readonly Dictionary<string, string> _prevGrippedPart = new();
    private readonly List<TwinEvent>            _pendingEvents   = new();

    // Gripper._parts 리플렉션 캐시
    private FieldInfo _gripperPartsField;

    private void Start()
    {
        _gripperPartsField = typeof(Preliy.Flange.Common.Gripper)
            .GetField("_parts", BindingFlags.NonPublic | BindingFlags.Instance);
        StartCoroutine(EmitLoop());
    }

    private IEnumerator EmitLoop()
    {
        while (true)
        {
            yield return new WaitForSeconds(PublishInterval);
            BuildAndPublish();
        }
    }

    // ── 스냅샷 빌드 ────────────────────────────────────────────────

    private void BuildAndPublish()
    {
        _seq++;
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _lastPublishTime = DateTime.UtcNow.ToString("HH:mm:ss.fff");

        _pendingEvents.Clear();

        var robots    = BuildRobots();
        var conveyors = BuildConveyors();
        var sensors   = BuildSensors();
        var grippers  = BuildGrippers(nowMs);   // _pendingEvents 내부에서 채움
        var parts     = BuildParts();

        var payload = new TwinPayload
        {
            seq         = _seq,
            timestampMs = nowMs,
            robots      = robots.ToArray(),
            conveyors   = conveyors.ToArray(),
            sensors     = sensors.ToArray(),
            grippers    = grippers.ToArray(),
            parts       = parts.ToArray(),
            events      = _pendingEvents.ToArray(),
        };

        LatestJson = JsonUtility.ToJson(payload);
        if (!string.IsNullOrWhiteSpace(PublishUrl))
            StartCoroutine(Post(LatestJson));
    }

    // ── 로봇 ───────────────────────────────────────────────────────

    private List<RobotData> BuildRobots()
    {
        var list = new List<RobotData>();
        foreach (var task in FindObjectsByType<RobotTask>(FindObjectsSortMode.None))
        {
            string id    = task.gameObject.name;
            int    iid   = task.GetInstanceID();
            bool   isRun = task.Status == "Run";
            float  speed = task.SpeedOverride;

            Vector3    tcpPos = task.transform.position;
            Quaternion tcpRot = task.transform.rotation;
            try
            {
                var m = task.Controller?.PoseObserver?.ToolCenterPointWorld?.Value;
                if (m.HasValue) { tcpPos = m.Value.GetPosition(); tcpRot = m.Value.rotation; }
            }
            catch { }

            tcpPos += Vec(Gauss(), Gauss(), Gauss()) * PositionNoise;
            var euler = tcpRot.eulerAngles + Vec(Gauss(), Gauss(), Gauss()) * AngleNoise;

            if (!_temperature.ContainsKey(id)) _temperature[id] = 28f;
            _temperature[id] = Mathf.Clamp(
                _temperature[id] + (isRun ? 0.06f : -0.03f) * PublishInterval, 25f, 85f);

            float targetW = isRun
                ? Mathf.Lerp(800f, 2400f, Mathf.Clamp01(speed))
                : UnityEngine.Random.Range(120f, 200f);
            if (!_power.ContainsKey(id)) _power[id] = targetW;
            _power[id] = Mathf.Lerp(_power[id], targetW, 0.25f) + Gauss() * 12f;

            float torque = isRun ? Mathf.Lerp(5f, 120f, Mathf.Clamp01(speed)) + Gauss() * 3f : 0f;

            // Controller 트랜스폼이 있으면 그 위치/회전이 실제 로봇 베이스
            var basePos = task.transform.position;
            var baseRot = task.transform.rotation;
            float[] joints = null;
            string modelType = "";
            try
            {
                var robJoint = task.Controller?.MechanicalGroup?.JointState?.RobJoint;
                joints = robJoint?.Value;
                var robot = task.Controller?.MechanicalGroup?.Robot;
                if (robot != null) modelType = robot.GetType().Name;
                if (task.Controller?.transform != null)
                {
                    basePos = task.Controller.transform.position;
                    baseRot = task.Controller.transform.rotation;
                }
            }
            catch { }

            list.Add(new RobotData
            {
                instanceId     = iid,
                name           = id,
                status         = task.Status,
                modelType      = modelType,
                speedFactor    = Round2(speed),
                tcpX           = Round4(tcpPos.x),
                tcpY           = Round4(tcpPos.y),
                tcpZ           = Round4(tcpPos.z),
                tcpRx          = Round2(euler.x),
                tcpRy          = Round2(euler.y),
                tcpRz          = Round2(euler.z),
                baseX          = Round4(basePos.x),
                baseY          = Round4(basePos.y),
                baseZ          = Round4(basePos.z),
                baseQx         = Round4(baseRot.x),
                baseQy         = Round4(baseRot.y),
                baseQz         = Round4(baseRot.z),
                baseQw         = Round4(baseRot.w),
                temperatureC   = Round2(_temperature[id]),
                powerW         = Round1(_power[id]),
                torqueNm       = Round2(Mathf.Max(0f, torque)),
                instructionIdx = task.CurrentInstructionIndex,
                instrType      = task.CurrentInstructionType,
                activeSequence = task.CurrentInstructionLabel,
                currentStep    = task.CurrentStep,
                retryAttempt      = task.RetryAttempt,
                subInstrType      = task.SubInstructionType,
                subInstrLabel     = task.SubInstructionLabel,
                j1 = joints != null && joints.Length > 0 ? Round2(joints[0]) : 0f,
                j2 = joints != null && joints.Length > 1 ? Round2(joints[1]) : 0f,
                j3 = joints != null && joints.Length > 2 ? Round2(joints[2]) : 0f,
                j4 = joints != null && joints.Length > 3 ? Round2(joints[3]) : 0f,
                j5 = joints != null && joints.Length > 4 ? Round2(joints[4]) : 0f,
                j6 = joints != null && joints.Length > 5 ? Round2(joints[5]) : 0f,
            });
        }
        return list;
    }

    // ── 컨베이어 ───────────────────────────────────────────────────

    private List<ConveyorData> BuildConveyors()
    {
        var list = new List<ConveyorData>();
        foreach (var cv in FindObjectsByType<ConveyorConfig>(FindObjectsSortMode.None))
        {
            float noisySpeed = cv.beltSpeed * (1f + Gauss() * 0.02f);
            float currentA   = Mathf.Lerp(0.8f, 8.5f, Mathf.Clamp01(cv.beltSpeed / 2f)) + Gauss() * 0.1f;

            list.Add(new ConveyorData
            {
                name      = cv.gameObject.name,
                running   = cv.enabled && cv.gameObject.activeInHierarchy,
                speedMs   = Round4(noisySpeed),
                direction = cv.directionAxis,
                friction  = Round3(cv.surfaceFriction),
                currentA  = Round2(Mathf.Max(0f, currentA)),
            });
        }
        return list;
    }

    // ── 센서 (HoleBoltInspector) ───────────────────────────────────

    private List<SensorData> BuildSensors()
    {
        var list = new List<SensorData>();
        foreach (var ins in FindObjectsByType<HoleBoltInspector>(FindObjectsSortMode.None))
        {
            bool present = ins.IsBoltPresent();
            float conf = present
                ? UnityEngine.Random.Range(0.85f, 0.99f)
                : UnityEngine.Random.Range(0.00f, 0.08f);

            list.Add(new SensorData
            {
                name        = ins.gameObject.name,
                boltPresent = present,
                confidence  = Round3(conf),
            });
        }
        return list;
    }

    // ── 그리퍼 ─────────────────────────────────────────────────────

    private List<GripperData> BuildGrippers(long nowMs)
    {
        var list            = new List<GripperData>();
        var coveredIds      = new HashSet<int>(); // bridge가 이미 커버한 Gripper instanceId

        // 1차: GripperEventBridge 경유 (PincherController 데이터 포함)
        foreach (var bridge in FindObjectsByType<GripperEventBridge>(FindObjectsSortMode.None))
        {
            if (bridge.gripper == null) continue;
            coveredIds.Add(bridge.gripper.GetInstanceID());
            // Cover every Gripper in the bridge's hierarchy so the fallback loop
            // does not double-count a sibling or parent Gripper on the same rig.
            foreach (var g in bridge.GetComponentsInChildren<Preliy.Flange.Common.Gripper>(true))
                coveredIds.Add(g.GetInstanceID());
            foreach (var g in bridge.GetComponentsInParent<Preliy.Flange.Common.Gripper>(true))
                coveredIds.Add(g.GetInstanceID());
            string id = bridge.gameObject.name;

            // Preliy Gripper._parts (리플렉션)
            var grippedParts = _gripperPartsField?.GetValue(bridge.gripper)
                as List<Preliy.Flange.Common.Part>;
            bool   isGripping  = grippedParts != null && grippedParts.Count > 0;
            string grippedPart = isGripping ? grippedParts[0].gameObject.name : "";

            // 체결/해제 이벤트 감지
            bool   wasGripping = _prevGripping.TryGetValue(id, out bool pg) && pg;
            string prevPart    = _prevGrippedPart.TryGetValue(id, out string pp) ? pp : "";
            if ( isGripping && !wasGripping && grippedPart != "")
                _pendingEvents.Add(new TwinEvent { type = "grip",    partName = grippedPart, gripperName = id, timestampMs = nowMs });
            else if (!isGripping && wasGripping && prevPart != "")
                _pendingEvents.Add(new TwinEvent { type = "release", partName = prevPart,    gripperName = id, timestampMs = nowMs });

            _prevGripping[id]    = isGripping;
            _prevGrippedPart[id] = grippedPart;

            float  gripAmount = 0f;
            string gripState  = "Fixed";
            if (bridge.pincherController != null)
            {
                gripAmount = Round2(bridge.pincherController.grip);
                gripState  = bridge.pincherController.gripState.ToString();
            }
            float gripForce = isGripping
                ? Mathf.Lerp(8f, 30f, gripAmount) + Gauss() * 1.2f
                : 0f;

            string robotName = (bridge.GetComponentInParent<RobotTask>() ?? NearestRobotTask(bridge.transform))?.gameObject.name ?? "";
            list.Add(new GripperData
            {
                name = id, robotName = robotName, isGripping = isGripping,
                grippedPart = grippedPart, gripAmount = gripAmount,
                gripState = gripState, gripForce = Round2(Mathf.Max(0f, gripForce)),
            });
        }

        // 2차: GripperEventBridge 없이 직접 사용되는 Gripper 폴백
        // SuctionPickAndPlaceTask / PickAndPlaceTask 의 Action(() => GripperLogic.Grip()) 패턴 대응
        foreach (var gripper in FindObjectsByType<Preliy.Flange.Common.Gripper>(FindObjectsSortMode.None))
        {
            if (coveredIds.Contains(gripper.GetInstanceID())) continue; // 이미 처리됨

            string id = gripper.gameObject.name;
            var grippedParts = _gripperPartsField?.GetValue(gripper)
                as List<Preliy.Flange.Common.Part>;
            bool   isGripping  = grippedParts != null && grippedParts.Count > 0;
            string grippedPart = isGripping ? grippedParts[0].gameObject.name : "";

            bool   wasGripping = _prevGripping.TryGetValue(id, out bool pg2) && pg2;
            string prevPart    = _prevGrippedPart.TryGetValue(id, out string pp2) ? pp2 : "";
            if ( isGripping && !wasGripping && grippedPart != "")
                _pendingEvents.Add(new TwinEvent { type = "grip",    partName = grippedPart, gripperName = id, timestampMs = nowMs });
            else if (!isGripping && wasGripping && prevPart != "")
                _pendingEvents.Add(new TwinEvent { type = "release", partName = prevPart,    gripperName = id, timestampMs = nowMs });

            _prevGripping[id]    = isGripping;
            _prevGrippedPart[id] = grippedPart;

            string robotName = (gripper.GetComponentInParent<RobotTask>() ?? NearestRobotTask(gripper.transform))?.gameObject.name ?? "";
            list.Add(new GripperData
            {
                name = id, robotName = robotName, isGripping = isGripping,
                grippedPart = grippedPart, gripAmount = isGripping ? 1f : 0f,
                gripState = isGripping ? "Fixed" : "Opening", gripForce = 0f,
            });
        }

        return list;
    }

    // ── 워크파츠 (Part) ─────────────────────────────────────────────

    private List<PartData> BuildParts()
    {
        var list = new List<PartData>();

        // 파지 중인 파트 → 그리퍼 이름 맵
        var partToGripper = new Dictionary<int, string>();
        foreach (var bridge in FindObjectsByType<GripperEventBridge>(FindObjectsSortMode.None))
        {
            if (bridge.gripper == null) continue;
            var gripped = _gripperPartsField?.GetValue(bridge.gripper)
                as List<Preliy.Flange.Common.Part>;
            if (gripped == null) continue;
            foreach (var p in gripped)
                if (p != null) partToGripper[p.GetInstanceID()] = bridge.gameObject.name;
        }

        foreach (var part in FindObjectsByType<Preliy.Flange.Common.Part>(FindObjectsSortMode.None))
        {
            partToGripper.TryGetValue(part.GetInstanceID(), out string gripperName);
            bool isGripped = !string.IsNullOrEmpty(gripperName);
            var  pos = part.transform.position;

            list.Add(new PartData
            {
                name      = part.gameObject.name,
                isGripped = isGripped,
                grippedBy = gripperName ?? "",
                posX      = Round4(pos.x),
                posY      = Round4(pos.y),
                posZ      = Round4(pos.z),
            });
        }
        return list;
    }

    // ── HTTP POST ──────────────────────────────────────────────────

    private IEnumerator Post(string json)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        using var req = new UnityWebRequest(PublishUrl, "POST");
        req.uploadHandler   = new UploadHandlerRaw(bytes);
        req.downloadHandler = new DownloadHandlerBuffer();
        req.SetRequestHeader("Content-Type", "application/json");
        req.timeout = 2;
        yield return req.SendWebRequest();

        _lastPostOk = req.result == UnityWebRequest.Result.Success;
        if (!_lastPostOk)
            Debug.LogWarning($"[DigitalTwinEmitter] POST 실패 → {req.error}");
    }

    // ── 유틸 ──────────────────────────────────────────────────────

    private static RobotTask NearestRobotTask(Transform t)
    {
        RobotTask closest = null;
        float minDist = float.MaxValue;
        foreach (var rt in FindObjectsByType<RobotTask>(FindObjectsSortMode.None))
        {
            float d = Vector3.Distance(t.position, rt.transform.position);
            if (d < minDist) { minDist = d; closest = rt; }
        }
        return closest;
    }

    private static float Gauss()
    {
        float u1 = Mathf.Max(1e-6f, 1f - UnityEngine.Random.value);
        float u2 = 1f - UnityEngine.Random.value;
        return Mathf.Sqrt(-2f * Mathf.Log(u1)) * Mathf.Sin(2f * Mathf.PI * u2);
    }

    private static Vector3 Vec(float x, float y, float z) => new Vector3(x, y, z);
    private static float Round1(float v) => (float)Math.Round(v, 1);
    private static float Round2(float v) => (float)Math.Round(v, 2);
    private static float Round3(float v) => (float)Math.Round(v, 3);
    private static float Round4(float v) => (float)Math.Round(v, 4);

    // ── 직렬화 구조체 ──────────────────────────────────────────────

    [Serializable]
    private class TwinPayload
    {
        public int            seq;
        public long           timestampMs;
        public RobotData[]    robots;
        public ConveyorData[] conveyors;
        public SensorData[]   sensors;
        public GripperData[]  grippers;
        public PartData[]     parts;
        public TwinEvent[]    events;
    }

    [Serializable]
    private class RobotData
    {
        public int    instanceId;   // GetInstanceID() — 씬 내 유일 키
        public string name;
        public string status;
        public string modelType;
        public float  speedFactor;
        public float  tcpX, tcpY, tcpZ;
        public float  tcpRx, tcpRy, tcpRz;
        public float  baseX, baseY, baseZ;
        public float  baseQx, baseQy, baseQz, baseQw;  // 베이스 회전 쿼터니언
        public float  temperatureC;
        public float  powerW;
        public float  torqueNm;
        public int    instructionIdx;
        public string instrType;    // "PTP"|"LIN"|"CIRC"|"WaitInstruction"|"GripInstruction"|"ActionInstruction"|...
        public string activeSequence; // ConfigurableInstruction 실행 중이면 "Cfg:<파일명>", 그 외에는 현재 인스트럭션 라벨
        public string currentStep;    // RobotTask.MarkStep()으로 표시한 의미 단위 구간 (예: "Pick"/"Hold1"/"Place"), 없으면 ""
        public int    retryAttempt;   // VerifyRetryInstruction 등 복합 인스트럭션의 현재 시도 번호. 0 = 재시도 블록 밖
        public string subInstrType;   // 복합 인스트럭션 내부에서 실행 중인 하위 인스트럭션 타입명 (예: "PTP"), 없으면 ""
        public string subInstrLabel;  // 위 하위 인스트럭션의 GetLabel()
        public float  j1, j2, j3, j4, j5, j6;
    }

    [Serializable]
    private class ConveyorData
    {
        public string name;
        public bool   running;
        public float  speedMs;
        public string direction;
        public float  friction;
        public float  currentA;
    }

    [Serializable]
    private class SensorData
    {
        public string name;
        public bool   boltPresent;
        public float  confidence;
    }

    [Serializable]
    private class GripperData
    {
        public string name;
        public string robotName;
        public bool   isGripping;
        public string grippedPart;  // 파지 중인 파트 이름 (없으면 "")
        public float  gripAmount;   // 0=완전 열림, 1=완전 닫힘
        public string gripState;    // "Fixed" | "Opening" | "Closing"
        public float  gripForce;    // 가상 파지력 (N)
    }

    [Serializable]
    private class PartData
    {
        public string name;
        public bool   isGripped;
        public string grippedBy;    // 파지 그리퍼 이름 (없으면 "")
        public float  posX, posY, posZ;
    }

    [Serializable]
    private class TwinEvent
    {
        public string type;         // "grip" | "release"
        public string partName;
        public string gripperName;
        public long   timestampMs;
    }
}
