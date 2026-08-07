using UnityEngine;
using Preliy.Flange.Common;

public class GripperEventBridge : MonoBehaviour
{
    [Tooltip("GripPoint 오브젝트의 Gripper 컴포넌트를 연결하세요")]
    public Gripper gripper;

    [Tooltip("HandE 루트의 PincherController를 연결하세요")]
    public PincherController pincherController;

    // 손가락 닫기 + 큐브 부착
    public void Grip()
    {
        if (pincherController != null) pincherController.gripState = GripState.Closing;
        if (gripper != null) gripper.Grip();
    }

    // 손가락 열기 + 큐브 해제
    public void Release()
    {
        if (pincherController != null) pincherController.gripState = GripState.Opening;
        if (gripper != null) gripper.Release();
    }

    // 손가락 정지 (Grip/Release 후 일정 시간 뒤 호출)
    public void StopFingers()
    {
        if (pincherController != null) pincherController.gripState = GripState.Fixed;
    }
}
