using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// ⚠ 실험적 컴포넌트 — GS 인증 등 "확실히 동작함"을 전제로 하는 용도로 사용하지 마세요.
/// AiInspector와 마찬가지로 torque_server(외부 Flask 프로세스, Roboflow API 의존)가 응답하지
/// 않으면 판정 자체가 성립하지 않고(InvalidateResult로 항상 검사 실패 처리), 서버 미기동 시
/// 무작위 판정이 나올 수 있습니다. 클래스 자체가 "시뮬레이션용 2단계"로 설계된 실험적 기능입니다.
/// 프로덕션/인증 대상 검사에는 HoleBoltInspector(물리 콜라이더 기반, 자립적)를 사용하세요.
///
/// 지정한 카메라로 검사 지점을 렌더타겟에 캡처해 PNG로 만든 뒤 torque_server(/api/detect)에
/// 자동 전송하고, 응답으로 온 판정 결과를 그대로 사용하는 검사기 (시뮬레이션용 2단계).
///
/// AiInspector(1단계, 사람이 미리 올려둔 이미지를 폴링)와 판정 소비 방식(seq 기반, 재시도마다
/// 새 판정을 강제)은 동일하되, 이미지 소스가 "폴링"이 아니라 "직접 캡처+전송"이라는 차이만 있습니다.
/// VerifyRetryInstruction의 검사 시점(onScanStart)에 CaptureAndSend()를 호출해야 하므로,
/// BoltingInspectionTask 쪽에서 onScanStart 콜백에 연결해 사용합니다.
/// </summary>
public class SceneCaptureInspector : MonoBehaviour, IBoltInspector
{
    [Header("캡처 카메라")]
    [Tooltip("검사 지점을 비추는 카메라. 비우면 Camera.main 사용")]
    public Camera CaptureCamera;
    public int CaptureWidth  = 640;
    public int CaptureHeight = 480;

    [Header("서버 설정")]
    public string DetectUrl = "http://localhost:5050/api/detect";
    [Tooltip("MODEL_REGISTRY의 키 (예: missing, presence, npu_bolt)")]
    public string ModelKey  = "missing";
    [Tooltip("서버 응답 대기 최대 시간 (초)")]
    public float  RequestTimeout = 5f;

    [Header("수신 상태 (읽기 전용)")]
    [SerializeField] private int    _seq;
    [SerializeField] private string _status = "idle";
    [SerializeField] private string _reason;
    [SerializeField] private bool   _requestInFlight;

    public string Status => _status;
    public bool   IsBusy => _requestInFlight;

    /// <summary>캡처+전송 완료 시 호출. true = OK, false = FAIL</summary>
    public event Action<bool> OnResultReceived;

    private int _consumedSeq = -1;
    private Camera ResolveCamera() => CaptureCamera != null ? CaptureCamera : Camera.main;

    private void OnEnable()
    {
        Debug.LogWarning(
            $"[SceneCaptureInspector] '{gameObject.name}'에서 활성화됨 — 이 검사기는 외부 서버" +
            "(torque_server)에 의존하는 실험적 컴포넌트입니다. 서버가 꺼져있거나 API 키가 없으면 " +
            "판정이 무작위로 나올 수 있습니다. 확실한 판정이 필요하면 HoleBoltInspector를 사용하세요.", this);
    }

    /// <summary>
    /// 지금 카메라 화면을 캡처해 서버로 전송하고 응답을 기다립니다.
    /// VerifyRetryInstruction의 onScanStart에서 코루틴으로 호출해, 검사 시점마다
    /// "실제로 새로 캡처된" 이미지로 판정하도록 합니다.
    /// </summary>
    public IEnumerator CaptureAndSend()
    {
        var cam = ResolveCamera();
        if (cam == null)
        {
            // 캡처 실패 시 직전(이전 시도) 판정이 남아있으면 성공/실패가 잘못 재사용될 수 있으므로 무효화
            InvalidateResult();
            Debug.LogError("[SceneCaptureInspector] 캡처할 카메라가 없습니다 (CaptureCamera 미지정 + Camera.main 없음). 이번 시도는 검사 실패로 처리됩니다.");
            yield break;
        }

        _requestInFlight = true;
        byte[] png = CaptureToPng(cam);

        var form = new WWWForm();
        form.AddField("model_key", ModelKey);
        form.AddBinaryData("image", png, $"capture_{DateTime.UtcNow:yyyyMMdd_HHmmss}.png", "image/png");

        using var req = UnityWebRequest.Post(DetectUrl, form);
        req.timeout = Mathf.CeilToInt(RequestTimeout);
        yield return req.SendWebRequest();

        _requestInFlight = false;

        if (req.result != UnityWebRequest.Result.Success)
        {
            InvalidateResult();
            Debug.LogWarning($"[SceneCaptureInspector] 전송 실패: {req.error}. 이번 시도는 검사 실패로 처리됩니다.");
            yield break;
        }

        var data = JsonUtility.FromJson<DetectData>(req.downloadHandler.text);
        if (data == null || string.IsNullOrEmpty(data.status))
        {
            InvalidateResult();
            Debug.LogWarning("[SceneCaptureInspector] 서버 응답 파싱 실패. 이번 시도는 검사 실패로 처리됩니다.");
            yield break;
        }

        _seq    = data.seq;
        _status = data.status;
        _reason = data.reason;

        Debug.Log($"[SceneCaptureInspector:{ModelKey}] seq={data.seq} → <b>{_status.ToUpper()}</b> ({_reason})");
        OnResultReceived?.Invoke(string.Equals(_status, "ok", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>지정한 카메라의 현재 화면을 CaptureWidth x CaptureHeight PNG로 렌더링합니다.</summary>
    private byte[] CaptureToPng(Camera cam)
    {
        var rt = RenderTexture.GetTemporary(CaptureWidth, CaptureHeight, 24, RenderTextureFormat.ARGB32);
        var prevTarget = cam.targetTexture;
        var prevActive = RenderTexture.active;

        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;

        var tex = new Texture2D(CaptureWidth, CaptureHeight, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, CaptureWidth, CaptureHeight), 0, 0);
        tex.Apply();

        cam.targetTexture = prevTarget;
        RenderTexture.active = prevActive;
        RenderTexture.ReleaseTemporary(rt);

        byte[] png = tex.EncodeToPNG();
        Destroy(tex);
        return png;
    }

    /// <summary>
    /// 마지막으로 캡처+전송한 결과 중 아직 소비하지 않은 것만 반환합니다.
    /// CaptureAndSend()를 먼저 호출해 새 판정을 받아온 뒤 사용해야 하며, 캡처 없이 호출하면
    /// (AiInspector와 동일하게) 안전하게 false를 반환합니다.
    /// </summary>
    public bool IsBoltPresent()
    {
        if (_seq <= 0 || _seq == _consumedSeq) return false;
        return string.Equals(_status, "ok", StringComparison.OrdinalIgnoreCase);
    }

    public void ConsumeResult() => _consumedSeq = _seq;

    /// <summary>캡처/전송/파싱이 실패했을 때 직전 seq를 즉시 소비 처리해, 이번 시도의 판정에
    /// 이전 시도의 낡은 결과가 잘못 재사용되지 않도록 합니다.</summary>
    private void InvalidateResult() => _consumedSeq = _seq;

    [Serializable]
    private class DetectData
    {
        public int    seq;
        public string model_key;
        public string hit_status;
        public string filename;
        public float  size_kb;
        public string status;
        public string reason;
        public string timestamp;
        public long   published_ms;
    }
}
