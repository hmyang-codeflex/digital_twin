using System.Collections;
using System.Collections.Generic;
using Preliy.Flange;
using Preliy.Flange.Common;
using UnityEngine;

public class PickTask : RobotTask
{
    public bool UseGridMode = true;

    [Header("Grid Mode - Targets[0]=홈, Targets[1]=그리드 기준점")]
    public List<Target> Targets;

    [Header("Waypoint Mode - 순차 이동할 WP 목록")]
    public List<Target> Waypoints;

    public Cylinder Gripper;
    public Preliy.Flange.Common.Gripper GripperLogic;

    protected override void Program()
    {
        this.Message(LogType.Log, text: "Start Task");

        if (UseGridMode)
        {
            this.PTP(Targets[0]);

            for (var i = 0; i < 9; i++)
            {
                var target = Targets[1];
                var offset = new Vector3(-0.15f * (i / 3), 0, 0.15f * (i % 3));
                var targetPos = target.transform.position + offset;
                var targetRot = target.transform.rotation;
                var pickTargetPos = targetPos + Vector3.down * 0.1f;

                this.PTP(targetPos, targetRot);
                this.LIN(pickTargetPos, targetRot);
                this.Action(() => { GripperLogic.Grip(); Gripper.JogPlus = true; });
                this.Wait(seconds: 0.460f);
                this.LIN(targetPos, targetRot);

                this.PTP(Targets[0]);
                this.Action(() => { Gripper.JogPlus = false; GripperLogic.Release(); });
            }
        }
        else
        {
            foreach (var wp in Waypoints)
            {
                this.PTP(wp);
            }
        }

        this.Message(LogType.Log, text: "End Task");
    }
}
