using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

[ExecuteAlways]
public class ObjectDistanceMeasure : MonoBehaviour
{
    public Transform target;

    public enum MeasureMode { TransformOrigin, BoundsCenter }
    public MeasureMode mode = MeasureMode.BoundsCenter;

    public Color lineColor = new Color(1f, 0.5f, 0f, 0.9f);

    public float    Distance  { get; private set; }
    public Vector3  FromPoint { get; private set; }
    public Vector3  ToPoint   { get; private set; }

    private void Update()
    {
        if (target == null) return;
        FromPoint = GetPoint(transform);
        ToPoint   = GetPoint(target);
        Distance  = Vector3.Distance(FromPoint, ToPoint);
    }

    private Vector3 GetPoint(Transform t)
    {
        if (mode == MeasureMode.BoundsCenter)
        {
            var renderers = t.GetComponentsInChildren<Renderer>();
            if (renderers.Length > 0)
            {
                var b = renderers[0].bounds;
                for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
                return b.center;
            }
        }
        return t.position;
    }

    private void OnDrawGizmosSelected()
    {
        if (target == null) return;
        Gizmos.color = lineColor;
        Gizmos.DrawLine(FromPoint, ToPoint);
        Gizmos.DrawSphere(FromPoint, 0.05f);
        Gizmos.DrawSphere(ToPoint,   0.05f);

#if UNITY_EDITOR
        Handles.Label((FromPoint + ToPoint) * 0.5f, $"{Distance:F3} m");
#endif
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(ObjectDistanceMeasure))]
public class ObjectDistanceMeasureEditor : Editor
{
    public override void OnInspectorGUI()
    {
        base.OnInspectorGUI();

        var t = (ObjectDistanceMeasure)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("거리 (meters)", EditorStyles.boldLabel);
        using (new EditorGUI.DisabledScope(true))
        {
            EditorGUILayout.FloatField("Distance", t.Distance);
            EditorGUILayout.Vector3Field("From",   t.FromPoint);
            EditorGUILayout.Vector3Field("To",     t.ToPoint);
        }

        Repaint();
    }
}
#endif
