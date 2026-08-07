using UnityEngine;

/// <summary>
/// 컨베이어 파라미터를 보관하는 MonoBehaviour.
/// WorkpartImportWatcher가 자동으로 추가하며,
/// realvirtual TransportSurface + Drive 컴포넌트가 이 값을 참조할 수 있습니다.
/// </summary>
public class ConveyorConfig : MonoBehaviour
{
    [Header("Belt")]
    public float  beltSpeed      = 0.3f;
    public string directionAxis  = "Z+";
    public float  surfaceFriction = 0.5f;

    void OnDrawGizmosSelected()
    {
        Gizmos.color = new Color(0f, 0.6f, 1f, 0.8f);
        var dir = ParseAxis(directionAxis);
        Gizmos.DrawRay(transform.position, dir * beltSpeed);
    }

    static Vector3 ParseAxis(string axis) => axis switch
    {
        "X+"  =>  Vector3.right,
        "X-"  => -Vector3.right,
        "Y+"  =>  Vector3.up,
        "Y-"  => -Vector3.up,
        "Z-"  => -Vector3.forward,
        _     =>  Vector3.forward,   // "Z+"
    };
}
