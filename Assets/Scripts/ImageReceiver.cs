using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Flask 서버 /api/latest-image 를 폴링해 이미지 판단 결과를 수신합니다.
/// 추후 AI 모델 연결 시 Flask 쪽만 교체하면 Unity 코드는 변경 불필요.
/// </summary>
public class ImageReceiver : MonoBehaviour
{
    [Header("서버 설정")]
    public string ServerUrl    = "http://localhost:5050/api/latest-image";
    public float  PollInterval = 1f;

    [Header("수신 상태 (읽기 전용)")]
    [SerializeField] private int    _seq;
    [SerializeField] private string _filename;
    [SerializeField] private float  _sizeKb;
    [SerializeField] private string _status = "idle";
    [SerializeField] private string _timestamp;
    [SerializeField] private float  _lastGapMs;

    public bool   IsOk   => string.Equals(_status, "ok",   StringComparison.OrdinalIgnoreCase);
    public bool   IsIdle => string.Equals(_status, "idle", StringComparison.OrdinalIgnoreCase);
    public string Status => _status;

    /// <summary>새 이미지 판단 결과 수신 시 호출. true = OK, false = FAIL</summary>
    public event Action<bool> OnResultReceived;

    private int _lastSeq = -1;

    private void Start() => StartCoroutine(PollLoop());

    private IEnumerator PollLoop()
    {
        Debug.Log($"[ImageReceiver] 폴링 시작 → {ServerUrl}");

        while (true)
        {
            using var req = UnityWebRequest.Get(ServerUrl);
            req.timeout = 3;
            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                var data = JsonUtility.FromJson<ImageData>(req.downloadHandler.text);
                if (data != null)
                {
                    _seq       = data.seq;
                    _filename  = data.filename;
                    _sizeKb    = data.size_kb;
                    _status    = data.status;
                    _timestamp = data.timestamp;

                    if (data.seq != _lastSeq && _lastSeq >= 0)
                    {
                        long receivedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        _lastGapMs = receivedMs - data.published_ms;

                        Debug.Log($"[ImageReceiver] seq={data.seq}  {_filename}  {_sizeKb:F1} KB  " +
                                  $"→ <b>{_status.ToUpper()}</b>  | 갭: <b>{_lastGapMs:F0} ms</b>");
                        OnResultReceived?.Invoke(IsOk);
                    }
                    _lastSeq = data.seq;
                }
            }
            else
            {
                Debug.LogWarning($"[ImageReceiver] 연결 실패: {req.error}");
            }

            if (PollInterval > 0f)
                yield return new WaitForSeconds(PollInterval);
            else
                yield return null;
        }
    }

    [Serializable]
    private class ImageData
    {
        public int    seq;
        public string filename;
        public float  size_kb;
        public string status;
        public string timestamp;
        public long   published_ms;
    }
}
