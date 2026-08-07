using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Flask 토크 서버를 주기적으로 폴링해 새 데이터 발행 시마다 이벤트를 발생시킵니다.
///
/// seq(시퀀스 번호) 비교로 "상태가 같아도 새 발행이면 감지" 합니다.
/// 서버의 /api/torque 에 POST가 올 때마다 seq가 +1 되므로,
/// Unity는 PollInterval 안에 발행된 모든 데이터를 놓치지 않고 처리합니다.
/// </summary>
public class TorqueReceiver : MonoBehaviour
{
    [Header("서버 설정")]
    public string ServerUrl    = "http://localhost:5050/api/latest";
    public float  PollInterval = 0.5f;

    [Header("수신 상태 (읽기 전용)")]
    [SerializeField] private int    _seq;
    [SerializeField] private float  _torque;
    [SerializeField] private float  _normalized;
    [SerializeField] private string _status = "idle";
    [SerializeField] private string _timestamp;
    [SerializeField] private float  _lastGapMs;   // 최근 발행→수신 갭 (밀리초)

    public float  Normalized => _normalized;
    public string Status     => _status;
    public bool   IsOk       => string.Equals(_status, "ok",   StringComparison.OrdinalIgnoreCase);
    public bool   IsIdle     => string.Equals(_status, "idle", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// 새 데이터가 발행될 때마다 호출됩니다 (상태 변화 여부 무관).
    /// true = OK, false = FAIL
    /// </summary>
    public event Action<bool> OnResultReceived;

    private int _lastSeq = -1;

    private void Start() => StartCoroutine(PollLoop());

    private IEnumerator PollLoop()
    {
        Debug.Log($"[TorqueReceiver] 폴링 시작 → {ServerUrl}  ({PollInterval}s 간격)");

        while (true)
        {
            using var req = UnityWebRequest.Get(ServerUrl);
            req.timeout = 3;
            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                var data = JsonUtility.FromJson<TorqueData>(req.downloadHandler.text);
                if (data != null)
                {
                    _seq        = data.seq;
                    _torque     = data.torque;
                    _normalized = data.normalized;
                    _status     = data.status;
                    _timestamp  = data.timestamp;

                    // seq가 바뀐 경우에만 = 새 데이터가 발행된 경우에만 이벤트 발생
                    if (data.seq != _lastSeq && _lastSeq >= 0)
                    {
                        // 발행 시각(UTC ms) vs 수신 시각(UTC ms) 갭 계산
                        long receivedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        _lastGapMs = receivedMs - data.published_ms;

                        UnityEngine.Debug.Log($"[TorqueReceiver] seq={data.seq}  " +
                                  $"torque={_torque:F2} Nm  norm={_normalized:F4}  " +
                                  $"→ <b>{_status.ToUpper()}</b>  " +
                                  $"| 갭: <b>{_lastGapMs:F0} ms</b>");
                        OnResultReceived?.Invoke(IsOk);
                    }
                    _lastSeq = data.seq;
                }
            }
            else
            {
                Debug.LogWarning($"[TorqueReceiver] 연결 실패: {req.error}");
            }

            if (PollInterval > 0f)
                yield return new WaitForSeconds(PollInterval);
            else
                yield return null; // 매 프레임 폴링 (최대 성능)
        }
    }

    [Serializable]
    private class TorqueData
    {
        public int    seq;
        public float  torque;
        public float  normalized;
        public string status;
        public string timestamp;
        public long   published_ms;
    }
}
