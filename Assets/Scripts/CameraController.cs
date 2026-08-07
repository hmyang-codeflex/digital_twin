using UnityEngine;

/// <summary>
/// Scene 뷰와 동일한 조작감(우클릭 드래그 회전, WASD+QE 이동, 휠 줌)의
/// 자유 비행 카메라. SmoothDamp 기반으로 입력을 즉시 적용하지 않고
/// 부드럽게 따라가도록 보간 처리.
/// </summary>
public class CameraController : MonoBehaviour
{
    [Header("이동 속도")]
    public float moveSpeed = 10f;
    public float fastMoveSpeed = 30f;

    [Header("회전 속도")]
    public float rotateSpeed = 3f;

    [Header("줌 속도")]
    public float scrollSpeed = 5f;

    [Header("부드러움 (값이 클수록 더 부드럽게 따라감)")]
    [Tooltip("이동 목표 위치를 따라가는 데 걸리는 시간(초)")]
    public float positionSmoothTime = 0.15f;
    [Tooltip("회전 목표 각도를 따라가는 데 걸리는 시간(초)")]
    public float rotationSmoothTime = 0.08f;

    private float _targetYaw;
    private float _targetPitch;
    private float _currentYaw;
    private float _currentPitch;
    private float _yawVelocity;
    private float _pitchVelocity;

    private Vector3 _targetPosition;
    private Vector3 _positionVelocity;

    private Vector3 _initialPosition;
    private float _initialYaw, _initialPitch;

    private void Start()
    {
        _targetYaw = _currentYaw = transform.eulerAngles.y;
        _targetPitch = _currentPitch = transform.eulerAngles.x;
        _targetPosition = transform.position;

        _initialPosition = transform.position;
        _initialYaw = _targetYaw;
        _initialPitch = _targetPitch;
    }

    /// <summary>외부(선택 UI 등)에서 특정 월드 위치를 부드럽게 바라보도록 카메라 목표를 설정</summary>
    public void FocusOn(Vector3 targetWorldPos, float distance = 3f)
    {
        Vector3 dir = transform.position - targetWorldPos;
        if (dir.sqrMagnitude < 0.0001f) dir = -transform.forward;
        dir.Normalize();

        _targetPosition = targetWorldPos + dir * distance;

        Vector3 lookEuler = Quaternion.LookRotation(targetWorldPos - _targetPosition, Vector3.up).eulerAngles;
        float pitch = lookEuler.x > 180f ? lookEuler.x - 360f : lookEuler.x;

        _targetYaw = lookEuler.y;
        _targetPitch = Mathf.Clamp(pitch, -89f, 89f);
    }

    /// <summary>카메라를 시작 위치/각도로 되돌림 ("Reset Camera" 버튼용)</summary>
    public void ResetView()
    {
        _targetPosition = _initialPosition;
        _targetYaw = _initialYaw;
        _targetPitch = _initialPitch;
    }

    private void Update()
    {
        // 우클릭 드래그로 회전 목표값 갱신
        if (Input.GetMouseButton(1))
        {
            _targetYaw += Input.GetAxis("Mouse X") * rotateSpeed;
            _targetPitch -= Input.GetAxis("Mouse Y") * rotateSpeed;
            _targetPitch = Mathf.Clamp(_targetPitch, -89f, 89f);
        }

        // 회전을 부드럽게 목표값으로 보간
        _currentYaw = Mathf.SmoothDampAngle(_currentYaw, _targetYaw, ref _yawVelocity, rotationSmoothTime);
        _currentPitch = Mathf.SmoothDampAngle(_currentPitch, _targetPitch, ref _pitchVelocity, rotationSmoothTime);
        transform.eulerAngles = new Vector3(_currentPitch, _currentYaw, 0f);

        // WASD + QE로 이동 목표 위치 갱신 (Shift 누르면 빠르게)
        float speed = Input.GetKey(KeyCode.LeftShift) ? fastMoveSpeed : moveSpeed;
        Vector3 move = Vector3.zero;

        if (Input.GetKey(KeyCode.W)) move += transform.forward;
        if (Input.GetKey(KeyCode.S)) move -= transform.forward;
        if (Input.GetKey(KeyCode.D)) move += transform.right;
        if (Input.GetKey(KeyCode.A)) move -= transform.right;
        if (Input.GetKey(KeyCode.E)) move += Vector3.up;
        if (Input.GetKey(KeyCode.Q)) move -= Vector3.up;

        _targetPosition += move * speed * Time.deltaTime;

        // 마우스 휠 줌도 목표 위치에 반영
        float scroll = Input.GetAxis("Mouse ScrollWheel");
        _targetPosition += transform.forward * scroll * scrollSpeed;

        // 이동을 부드럽게 목표 위치로 보간
        transform.position = Vector3.SmoothDamp(transform.position, _targetPosition, ref _positionVelocity, positionSmoothTime);
    }
}
