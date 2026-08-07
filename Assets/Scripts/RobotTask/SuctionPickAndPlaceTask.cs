using System.Collections.Generic;
using Preliy.Flange;
using Preliy.Flange.Common;
using UnityEngine;

public class SuctionPickAndPlaceTask : RobotTask
{
    public List<Target> Targets;
    public Preliy.Flange.Common.Gripper GripperLogic;
    public Target FrameLeft;
    public Target FrameRight;
    public bool UseHomePosition = true;

    protected override void Program()
    {
        this.Message(LogType.Log, text: "Start Task");
        this.PTP(Targets[0]);

        for (var i = 0; i < 9; i++)
        {
            Operation(FrameLeft, FrameRight, i);
        }

        this.Message(LogType.Log, text: "End Task");
    }

    private void Operation(Target pickFrame, Target placeFrame, int index)
    {
        var offset = new Vector3(-0.15f * (index / 3), 0, 0.15f * (index % 3));

        // 픽
        var pickPos = pickFrame.transform.position + offset;
        var pickRot = pickFrame.transform.rotation;
        var pickDownPos = pickPos + Vector3.down * 0.1f;

        this.PTP(pickPos, pickRot);
        this.LIN(pickDownPos, pickRot);
        this.Action(() => GripperLogic.Grip());
        this.Wait(seconds: 0.460f);
        this.LIN(pickPos, pickRot);

        // 홈 경유 옵션
        if (UseHomePosition)
            this.PTP(Targets[0]);

        // 플레이스
        var placePos = placeFrame.transform.position + offset;
        var placeRot = placeFrame.transform.rotation;
        var placeDownPos = placePos + Vector3.down * 0.1f;

        this.PTP(placePos, placeRot);
        this.LIN(placeDownPos, placeRot);
        this.Action(() => GripperLogic.Release());
        this.Wait(seconds: 0.460f);
        this.LIN(placePos, placeRot);

        if (UseHomePosition)
            this.PTP(Targets[0]);
    }
}
