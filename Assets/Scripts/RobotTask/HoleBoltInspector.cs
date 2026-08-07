using System.Collections.Generic;
using Preliy.Flange.Common;
using UnityEngine;

/// <summary>
/// 지정한 홈(Hole) 위치에 볼트 워크파츠가 들어가 있는지 검사하는 "비전" 센서.
///
/// [방법 1] 영상 픽셀이 아니라 씬의 콜라이더/Part 정보로 판정합니다.
///   - 홈 위치에 OverlapBox를 만들어 그 안에 Part(볼트)가 있는지 확인
///   - 나중에 OpenCV/실제 비전으로 교체할 때는 IsBoltPresent()의 내부 구현만 바꾸고
///     이 메서드를 호출하는 task 코드는 그대로 두면 됩니다(인터페이스 유지).
///
/// 사용법:
///   1) 빈 GameObject를 홈 위치에 두고 이 컴포넌트 추가 (또는 Hole에 홈 Transform 연결)
///   2) DetectionSize로 검사 영역(박스) 크기 조절 — Scene 뷰 기즈모로 확인
///   3) BoltMask/RequirePart로 "무엇을 볼트로 볼지" 필터링
/// </summary>
[ExecuteAlways]
public class HoleBoltInspector : MonoBehaviour, IBoltInspector
{
    [Header("검사 위치 - 비우면 이 오브젝트 자신을 기준으로 사용")]
    public Transform Hole;

    [Tooltip("홈 기준 추가 오프셋 (검사 박스 중심 미세조정)")]
    public Vector3 CenterOffset = Vector3.zero;

    [Header("검사 영역 (박스 크기, Unity 단위)")]
    public Vector3 DetectionSize = new Vector3(0.05f, 0.05f, 0.05f);

    [Header("볼트 판정 필터")]
    [Tooltip("검사할 레이어 (볼트가 속한 레이어만 켜두면 오인식 감소)")]
    public LayerMask BoltMask = ~0;

    [Tooltip("켜면 Part 컴포넌트가 있는 오브젝트만 볼트로 인정")]
    public bool RequirePart = true;

    [Tooltip("비워두면 무시. 값이 있으면 해당 Tag를 가진 오브젝트만 볼트로 인정")]
    public string BoltTag = "";

    [Header("기즈모")]
    public bool ShowGizmo = true;
    public Color ColorDetected = Color.green;
    public Color ColorEmpty = Color.red;

    private static readonly Collider[] _hits = new Collider[16];

    // 검사 박스의 중심/회전 계산
    private Vector3 BoxCenter => (Hole != null ? Hole.position : transform.position)
                                 + (Hole != null ? Hole.rotation : transform.rotation) * CenterOffset;
    private Quaternion BoxRotation => Hole != null ? Hole.rotation : transform.rotation;

    /// <summary>
    /// 홈에 볼트가 들어가 있으면 true.
    /// (나중에 OpenCV로 교체 시 이 메서드 내부만 바꾸면 됩니다.)
    /// </summary>
    public bool IsBoltPresent()
    {
        int count = Physics.OverlapBoxNonAlloc(
            BoxCenter,
            DetectionSize * 0.5f,
            _hits,
            BoxRotation,
            BoltMask,
            QueryTriggerInteraction.Ignore);

        for (int i = 0; i < count; i++)
        {
            var col = _hits[i];
            if (col == null) continue;

            // 자기 자신/홈 콜라이더는 제외
            if (Hole != null && (col.transform == Hole || col.transform.IsChildOf(Hole))) continue;
            if (col.transform == transform) continue;

            if (RequirePart && col.GetComponentInParent<Part>() == null) continue;
            if (!string.IsNullOrEmpty(BoltTag) && !col.CompareTag(BoltTag)) continue;

            return true;
        }
        return false;
    }

    /// <summary>물리 콜라이더 기반 판정은 호출 시점의 실제 상태를 그대로 반환하므로
    /// 캐싱된 결과를 소비 처리할 필요가 없습니다 (IBoltInspector 인터페이스 충족용).</summary>
    public void ConsumeResult() { }

    /// <summary>현재 검사 영역 안의 볼트 Part 목록을 반환 (디버그/확장용).</summary>
    public List<Part> GetDetectedParts()
    {
        var result = new List<Part>();
        int count = Physics.OverlapBoxNonAlloc(BoxCenter, DetectionSize * 0.5f, _hits, BoxRotation, BoltMask, QueryTriggerInteraction.Ignore);
        for (int i = 0; i < count; i++)
        {
            var col = _hits[i];
            if (col == null) continue;
            if (Hole != null && (col.transform == Hole || col.transform.IsChildOf(Hole))) continue;
            var part = col.GetComponentInParent<Part>();
            if (part != null && !result.Contains(part)) result.Add(part);
        }
        return result;
    }

    private void OnDrawGizmos()
    {
        if (!ShowGizmo) return;

        bool present = IsBoltPresent();
        Gizmos.color = present ? ColorDetected : ColorEmpty;

        var prev = Gizmos.matrix;
        Gizmos.matrix = Matrix4x4.TRS(BoxCenter, BoxRotation, Vector3.one);
        Gizmos.DrawWireCube(Vector3.zero, DetectionSize);
        Gizmos.matrix = prev;
    }
}
