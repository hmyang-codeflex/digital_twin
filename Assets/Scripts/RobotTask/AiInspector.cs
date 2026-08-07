using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// ⚠ 실험적 컴포넌트 — GS 인증 등 "확실히 동작함"을 전제로 하는 용도로 사용하지 마세요.
/// torque_server(외부 Flask 프로세스, Roboflow API 의존)가 꺼져 있거나 ROBOFLOW_API_KEY가
/// 없으면, 서버가 random.choice(["ok","fail"])로 완전 무작위 판정을 내려보냅니다. 즉 이
/// 컴포넌트의 판정 정확도는 별도 프로세스와 외부 서비스 키 설정에 전적으로 좌우되며,
/// Unity/이 프로젝트 코드만으로는 결정론적 동작을 보장할 수 없습니다.
/// 프로덕션/인증 대상 검사에는 HoleBoltInspector(물리 콜라이더 기반, 자립적)를 사용하세요.
///
/// torque_server(/api/latest-detect)를 폴링해 AI 모델의 볼트 판정 결과를 받아오는 검사기.
/// HoleBoltInspector(물리 콜라이더 기반)와 동일한 IBoltInspector 인터페이스를 구현하므로,
/// BoltingInspectionTask의 Inspector 슬롯에 이 컴포넌트를 대신 꽂으면 판정 소스만 AI로 교체됩니다.
///
/// 1단계(현재): Unity가 직접 이미지를 캡처하지 않습니다 — 검사 대상 이미지는 미리
/// torque_server(웹 UI 또는 /api/detect)로 업로드해두고, 이 컴포넌트는 그 결과만 폴링합니다.
/// 2단계(추후): Unity 씬을 렌더타겟으로 캡처해 자동으로 /api/detect에 전송하는 기능을 추가할 예정.
///
/// 재시도 정합성: VerifyRetryInstruction은 검사 시점마다 IsBoltPresent()를 호출하는데, 사람이
/// 매 시도마다 새 이미지를 서버에 올려주지 않으면 이전 시도 때 받은 낡은 seq를 그대로 재사용해
/// "재시도했는데 계속 같은 판정"이 나오는 문제가 있었다. 이를 막기 위해 한 번 판정에 사용한 seq는
/// ConsumeResult()로 소비 처리하고, 새 seq가 오기 전까지 IsBoltPresent()는 무조건 false(검사 대기 중)를
/// 반환한다 — 서버가 꺼져있거나 새 이미지가 안 올라온 상황과 "AI가 진짜 fail 판정"을 혼동하지 않도록,
/// 이 경우 reason에 "새 이미지 대기 중"임을 명시한다.
/// </summary>
public class AiInspector : MonoBehaviour, IBoltInspector
{
    [Header("서버 설정")]
    public string ServerUrl    = "http://localhost:5050/api/latest-detect";
    [Tooltip("MODEL_REGISTRY의 키 (예: missing, presence, npu_bolt)")]
    public string ModelKey     = "missing";
    public float  PollInterval = 1f;

    [Header("수신 상태 (읽기 전용)")]
    [SerializeField] private int    _seq;
    [SerializeField] private string _status = "idle";
    [SerializeField] private string _reason;
    [SerializeField] private string _filename;
    [SerializeField] private float  _lastGapMs;

    public string Status => _status;
    public bool   IsConnected => _seq > 0;

    /// <summary>새 판정 결과 수신 시 호출. true = OK, false = FAIL</summary>
    public event Action<bool> OnResultReceived;

    private int _lastSeq = -1;
    private int _consumedSeq = -1; // 마지막으로 판정에 실제 사용(소비)한 seq

    private void OnEnable()
    {
        Debug.LogWarning(
            $"[AiInspector] '{gameObject.name}'에서 활성화됨 — 이 검사기는 외부 서버(torque_server)에 " +
            "의존하는 실험적 컴포넌트입니다. 서버가 꺼져있거나 API 키가 없으면 판정이 무작위로 나올 수 " +
            "있습니다. 확실한 판정이 필요하면 HoleBoltInspector를 사용하세요.", this);
        StartCoroutine(PollLoop());
    }

    private IEnumerator PollLoop()
    {
        string url = $"{ServerUrl}?model_key={UnityWebRequest.EscapeURL(ModelKey)}";
        Debug.Log($"[AiInspector] 폴링 시작 → {url}");

        while (true)
        {
            using var req = UnityWebRequest.Get(url);
            req.timeout = 3;
            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                var data = JsonUtility.FromJson<DetectData>(req.downloadHandler.text);
                // 아직 이 모델로 한 번도 검사한 적 없으면 서버가 빈 객체({})를 반환 → seq=0, status=null
                if (data != null && !string.IsNullOrEmpty(data.status))
                {
                    _seq      = data.seq;
                    _status   = data.status;
                    _reason   = data.reason;
                    _filename = data.filename;

                    if (data.seq != _lastSeq && _lastSeq >= 0)
                    {
                        long receivedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        _lastGapMs = receivedMs - data.published_ms;

                        Debug.Log($"[AiInspector:{ModelKey}] seq={data.seq}  {_filename}  " +
                                  $"→ <b>{_status.ToUpper()}</b>  ({_reason})  | 갭: <b>{_lastGapMs:F0} ms</b>");
                        OnResultReceived?.Invoke(string.Equals(_status, "ok", StringComparison.OrdinalIgnoreCase));
                    }
                    _lastSeq = data.seq;
                }
            }
            else
            {
                Debug.LogWarning($"[AiInspector] 연결 실패: {req.error}");
            }

            if (PollInterval > 0f)
                yield return new WaitForSeconds(PollInterval);
            else
                yield return null;
        }
    }

    /// <summary>
    /// 아직 소비하지 않은 새 seq가 있을 때만 그 판정을 반환합니다. 이미 이전 시도에서 사용한 seq를
    /// 재사용하지 않도록, VerifyRetryInstruction의 검사 시점(onScanStart)마다 이 값을 확인한 뒤
    /// 반드시 ConsumeResult()를 호출해 "다음 시도 전까지는 새 seq가 와야 한다"는 상태로 만들어야 합니다.
    /// 새 seq가 없으면(=아직 새 이미지 판정 대기 중) 안전하게 false를 반환합니다.
    /// </summary>
    public bool IsBoltPresent()
    {
        if (_seq <= 0 || _seq == _consumedSeq)
        {
            // 서버가 아예 안 켜져 있는 것과, 새 이미지가 아직 안 올라온 것을 구분해 로그로 명시
            Debug.LogWarning(_seq <= 0
                ? $"[AiInspector:{ModelKey}] 검사 실패로 처리 — 서버에서 받은 판정이 아직 없습니다 (연결 확인 필요)."
                : $"[AiInspector:{ModelKey}] 검사 실패로 처리 — 새 이미지 판정 대기 중입니다 (seq={_seq}는 이미 이전 시도에서 사용됨). 재시도 전에 새 이미지를 서버에 업로드하세요.");
            return false;
        }
        return string.Equals(_status, "ok", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>지금 판정에 사용한 seq를 "소비됨"으로 표시. 재시도 검사 직후 반드시 호출해야
    /// 다음 시도에서 같은 seq를 다시 성공/실패 판정에 쓰지 않습니다.</summary>
    public void ConsumeResult() => _consumedSeq = _seq;

    /// <summary>현재 seq가 아직 소비되지 않은 새 판정인지 여부 (디버깅/HUD 표시용).</summary>
    public bool HasFreshResult => _seq > 0 && _seq != _consumedSeq;

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
