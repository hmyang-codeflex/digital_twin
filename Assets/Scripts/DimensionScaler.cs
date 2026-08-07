using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// 도면 치수(mm)를 입력해 오브젝트 스케일을 맞추는 컴포넌트.
/// "자연 크기 캡처" → 치수 입력 → "스케일 적용" 순으로 사용.
[ExecuteAlways]
public class DimensionScaler : MonoBehaviour
{
    [Header("자연 크기 (Scale 1,1,1 기준 — 캡처 후 자동 입력)")]
    [SerializeField] private Vector3 _naturalSizeM = Vector3.zero;

    [Header("원하는 치수 (mm)")]
    public float desiredWidthMm;
    public float desiredHeightMm;
    public float desiredDepthMm;

    [Header("비율 고정 (한 축 기준으로 나머지 자동 계산)")]
    public bool lockAspectRatio = false;
    public enum Axis { X_Width, Y_Height, Z_Depth }
    public Axis aspectReferenceAxis = Axis.Y_Height;

    public float CurrentWidthMm  { get; private set; }
    public float CurrentHeightMm { get; private set; }
    public float CurrentDepthMm  { get; private set; }

    private void Update() => RefreshCurrentSize();

    private void RefreshCurrentSize()
    {
        var b = GetCombinedBounds();
        if (!b.HasValue) return;
        CurrentWidthMm  = b.Value.size.x * 1000f;
        CurrentHeightMm = b.Value.size.y * 1000f;
        CurrentDepthMm  = b.Value.size.z * 1000f;
    }

    public void CaptureNaturalSize()
    {
        var b = GetCombinedBounds();
        if (!b.HasValue) { Debug.LogWarning("[DimensionScaler] Renderer 없음"); return; }

        // lossyScale = 자신 + 부모 스케일 전체 곱 → 월드 bounds를 정확히 역산
        var ls = transform.lossyScale;
        _naturalSizeM = new Vector3(
            ls.x != 0 ? b.Value.size.x / ls.x : 0,
            ls.y != 0 ? b.Value.size.y / ls.y : 0,
            ls.z != 0 ? b.Value.size.z / ls.z : 0
        );

        desiredWidthMm  = b.Value.size.x * 1000f;
        desiredHeightMm = b.Value.size.y * 1000f;
        desiredDepthMm  = b.Value.size.z * 1000f;

        Debug.Log($"[DimensionScaler] 자연 크기 캡처: {_naturalSizeM * 1000f} mm");
    }

    public void ApplyDimensions()
    {
        if (_naturalSizeM == Vector3.zero)
        {
            Debug.LogWarning("[DimensionScaler] 먼저 '자연 크기 캡처'를 눌러주세요.");
            return;
        }

        float wm = desiredWidthMm  / 1000f;
        float hm = desiredHeightMm / 1000f;
        float dm = desiredDepthMm  / 1000f;

        // 부모 스케일이 있으면 localScale을 역산해 원하는 월드 크기를 정확히 맞춤
        var ps = transform.parent != null ? transform.parent.lossyScale : Vector3.one;

        if (lockAspectRatio)
        {
            float lossyRatio = aspectReferenceAxis switch
            {
                Axis.X_Width  => (_naturalSizeM.x > 0 ? wm / _naturalSizeM.x : 1f),
                Axis.Y_Height => (_naturalSizeM.y > 0 ? hm / _naturalSizeM.y : 1f),
                _             => (_naturalSizeM.z > 0 ? dm / _naturalSizeM.z : 1f),
            };
            transform.localScale = new Vector3(
                ps.x > 0 ? lossyRatio / ps.x : transform.localScale.x,
                ps.y > 0 ? lossyRatio / ps.y : transform.localScale.y,
                ps.z > 0 ? lossyRatio / ps.z : transform.localScale.z
            );
        }
        else
        {
            transform.localScale = new Vector3(
                (_naturalSizeM.x > 0 && ps.x > 0) ? (wm / _naturalSizeM.x) / ps.x : transform.localScale.x,
                (_naturalSizeM.y > 0 && ps.y > 0) ? (hm / _naturalSizeM.y) / ps.y : transform.localScale.y,
                (_naturalSizeM.z > 0 && ps.z > 0) ? (dm / _naturalSizeM.z) / ps.z : transform.localScale.z
            );
        }
    }

    private Bounds? GetCombinedBounds()
    {
        var renderers = GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0) return null;
        var b = renderers[0].bounds;
        for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
        return b;
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(DimensionScaler))]
public class DimensionScalerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        base.OnInspectorGUI();

        var t = (DimensionScaler)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("현재 실제 크기 (mm)", EditorStyles.boldLabel);
        using (new EditorGUI.DisabledScope(true))
        {
            EditorGUILayout.FloatField("Width",  t.CurrentWidthMm);
            EditorGUILayout.FloatField("Height", t.CurrentHeightMm);
            EditorGUILayout.FloatField("Depth",  t.CurrentDepthMm);
        }

        EditorGUILayout.Space();
        if (GUILayout.Button("① 자연 크기 캡처 (처음 한 번)", GUILayout.Height(30)))
        {
            Undo.RecordObject(t, "Capture Natural Size");
            t.CaptureNaturalSize();
            EditorUtility.SetDirty(t);
        }

        EditorGUILayout.Space();
        GUI.backgroundColor = new Color(0.4f, 0.9f, 0.5f);
        if (GUILayout.Button("② 치수로 스케일 적용", GUILayout.Height(35)))
        {
            Undo.RecordObject(t.transform, "Apply Dimensions");
            t.ApplyDimensions();
            EditorUtility.SetDirty(t.transform);
        }
        GUI.backgroundColor = Color.white;

        Repaint();
    }
}
#endif
