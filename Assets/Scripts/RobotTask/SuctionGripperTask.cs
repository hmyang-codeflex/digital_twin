using System.Collections.Generic;
using Preliy.Flange;
using UnityEngine;

/// <summary>
/// 석션(진공) 그리퍼 전용 Pick &amp; Place 태스크.
///
/// 핑거 그리퍼용 PickAndPlaceTask와 동일한 검증된 이동 흐름을 따르되,
/// 손가락 실린더(Cylinder.JogPlus) 구동을 제거하고
/// Flange Gripper의 부착/해제(Grip/Release)만으로 진공 흡착을 시뮬레이션합니다.
///
/// 4cupSuction+tcp 프리팹처럼 손가락이 없는 석션 헤드에 사용하세요.
/// </summary>
public class SuctionGripperTask : RobotTask
{
    [System.Serializable]
    public class HoldWaypoint
    {
        public Target Frame;
        [Tooltip("이 경유지 도착 후 대기 시간 (초, 0 = 즉시 다음으로 이동)")]
        public float Delay = 0f;
        [Tooltip("이 경유지로 이동하는 구간의 속도 배율. 0 이하면 로봇 기본 속도를 그대로 사용.")]
        public float Speed = 0f;
    }

    public enum PickPlaceMode
    {
        Single, // FrameLeft = 픽 위치, FrameRight = 플레이스 위치 (큰 워크파츠 1회 운반)
        Grid    // FrameLeft/Right를 기준점으로 3x3=9칸 순회
    }

    [Header("동작 모드")]
    [Tooltip("Single: Left=픽, Right=플레이스 위치로 1회 이동 (자동창·유리창 등 큰 워크파츠용)\nGrid: 3x3 그리드 순회")]
    public PickPlaceMode Mode = PickPlaceMode.Single;

    [Header("Targets - [0] = 홈 위치")]
    public List<Target> Targets;

    [Header("Suction Gripper - 부품을 부착/해제하는 Flange Gripper")]
    public Preliy.Flange.Common.Gripper GripperLogic;

    [Header("Pick / Place 기준 프레임")]
    public Target FrameLeft;   // 픽 위치 (Grid 모드에서는 그리드 기준점)
    public Target FrameRight;  // 플레이스 위치 (Grid 모드에서는 그리드 기준점)

    [Header("동작 옵션")]
    public bool UseHomePosition = true;

    [Tooltip("픽/플레이스 전후 하강·상승 높이 (Unity 단위)")]
    public float ApproachHeight = 0.1f;

    [Tooltip("흡착/해제 후 안정화 대기 시간 (초)")]
    public float GripSettleTime = 0.460f;

    [Header("홀드 웨이포인트 (픽 → 플레이스 중간 경유)")]
    [Tooltip("픽 완료 후 플레이스 전에 경유할 위치. 비우면 홈 → 플레이스로 바로 이동.\nHoldFrames가 채워져 있으면 이 필드는 무시됩니다.")]
    public Target HoldFrame;
    [Tooltip("픽 완료 후 플레이스 전에 순서대로 경유할 위치 목록. 동작 폭이 커서 PTP 한 번으로 이동이 어려울 때 여러 경유지로 나눠 이동시키는 용도.\n각 경유지마다 개별 대기 시간(Delay)을 지정할 수 있습니다. 비어 있으면 HoldFrame(단일) 로직으로 폴백합니다.")]
    public List<HoldWaypoint> HoldFrames;
    [Tooltip("HoldFrame(단일) 사용 시에만 적용되는 대기 시간 (초, 0 = 즉시 이동)")]
    public float HoldDelay = 0f;
    [Tooltip("홀드 위치 대기 후 플레이스로 이동 전 홈(Targets[0])을 경유")]
    public bool HoldViaHome = false;

    protected override void Program()
    {
        if (!ValidateSetup()) return;

        this.Message(LogType.Log, text: "Start Suction Task");
        this.PTP(Targets[0]);

        if (Mode == PickPlaceMode.Single)
        {
            // Left = 픽, Right = 플레이스 위치로 1회 운반
            Operation(FrameLeft, FrameRight, Vector3.zero);
        }
        else // Grid
        {
            for (var i = 0; i < 9; i++)
            {
                var offset = new Vector3(-0.15f * (i / 3), 0, 0.15f * (i % 3));
                Operation(FrameLeft, FrameRight, offset);
            }
        }

        this.Message(LogType.Log, text: "End Suction Task");
    }

    private void Operation(Target pickFrame, Target placeFrame, Vector3 offset)
    {
        // ── 픽 ──
        this.Action(() => MarkStep("Pick"));
        var pickPos = pickFrame.transform.position + offset;
        var pickRot = pickFrame.transform.rotation;
        var pickDownPos = pickPos + Vector3.down * ApproachHeight;

        this.PTP(pickPos, pickRot);
        this.LIN(pickDownPos, pickRot);
        this.Action(SuctionOn);          // 진공 ON → 부품 부착
        this.Wait(seconds: GripSettleTime);
        this.LIN(pickPos, pickRot);

        // 홀드 웨이포인트 경유 (설정 시) — HoldFrames(복수)가 있으면 우선, 없으면 HoldFrame(단일) 폴백
        if (HoldFrames != null && HoldFrames.Count > 0)
        {
            for (var i = 0; i < HoldFrames.Count; i++)
            {
                var waypoint = HoldFrames[i];
                if (waypoint?.Frame == null) continue;
                var stepName = $"Hold{i + 1}";
                this.Action(() => MarkStep(stepName));
                var instr = new PTP(waypoint.Frame);
                if (waypoint.Speed > 0f) instr.Speed(waypoint.Speed);
                this.Move(instr);
                if (waypoint.Delay > 0f)
                    this.Wait(waypoint.Delay);
            }
            if (HoldViaHome && UseHomePosition)
                this.PTP(Targets[0]);
        }
        else if (HoldFrame != null)
        {
            this.Action(() => MarkStep("Hold"));
            this.PTP(HoldFrame);
            if (HoldDelay > 0f)
                this.Wait(HoldDelay);
            if (HoldViaHome && UseHomePosition)
                this.PTP(Targets[0]);
        }
        else if (UseHomePosition)
            this.PTP(Targets[0]);

        // ── 플레이스 ──
        this.Action(() => MarkStep("Place"));
        var placePos = placeFrame.transform.position + offset;
        var placeRot = placeFrame.transform.rotation;
        var placeDownPos = placePos + Vector3.down * ApproachHeight;

        this.PTP(placePos, placeRot);
        this.LIN(placeDownPos, placeRot);
        this.Action(SuctionOff);         // 진공 OFF → 부품 해제
        this.Wait(seconds: GripSettleTime);
        this.LIN(placePos, placeRot);

        if (UseHomePosition)
            this.PTP(Targets[0]);
    }

    private void SuctionOn()  { GripperLogic?.Grip(); }
    private void SuctionOff() { GripperLogic?.Release(); }

    /// <summary>
    /// 실행 전 필수 참조를 검사합니다.
    /// 누락 시 로봇이 조용히 멈추는 대신 무엇이 빠졌는지 콘솔에 명확히 출력합니다.
    /// (기즈모 미리보기 빌드 중에는 콘솔 스팸 방지를 위해 로그를 출력하지 않습니다.)
    /// </summary>
    private bool ValidateSetup()
    {
        bool ok = true;
        bool log = !IsPreviewBuild;

        if (Controller == null)
        {
            if (log) Debug.LogError("[SuctionGripperTask] Controller가 비어 있습니다. RobotTask의 Controller 필드를 로봇 Controller에 연결하세요.", this);
            ok = false;
        }

        if (Targets == null || Targets.Count == 0 || Targets[0] == null)
        {
            if (log) Debug.LogError("[SuctionGripperTask] Targets[0](홈 위치)이 설정되지 않았습니다.", this);
            ok = false;
        }

        if (FrameLeft == null)
        {
            if (log) Debug.LogError("[SuctionGripperTask] FrameLeft(픽 기준 프레임)이 비어 있습니다.", this);
            ok = false;
        }

        if (FrameRight == null)
        {
            if (log) Debug.LogError("[SuctionGripperTask] FrameRight(플레이스 기준 프레임)이 비어 있습니다.", this);
            ok = false;
        }

        if (GripperLogic == null && log)
        {
            // 그리퍼가 없어도 이동은 가능하므로 경고만 출력 (흡착은 동작하지 않음)
            Debug.LogWarning("[SuctionGripperTask] GripperLogic이 비어 있습니다. 로봇은 이동하지만 부품 흡착/해제는 동작하지 않습니다.", this);
        }

        if (log && HoldFrames != null && HoldFrames.Count > 0)
        {
            for (var i = 0; i < HoldFrames.Count; i++)
            {
                if (HoldFrames[i]?.Frame == null)
                    Debug.LogWarning($"[SuctionGripperTask] HoldFrames[{i}].Frame이 비어 있어 건너뜁니다.", this);
            }
        }

        return ok;
    }
}
