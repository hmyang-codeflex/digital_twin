using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

[ExecuteAlways]
public class ObjectSizeInfo : MonoBehaviour
{
    [Header("설정")]
    public bool showGizmo = true;
    public Color gizmoColor = new Color(0f, 1f, 0.5f, 0.8f);

    private Bounds _bounds;
    private bool _hasBounds;

    public float Width  { get; private set; }
    public float Height { get; private set; }
    public float Depth  { get; private set; }

    private void OnEnable() => Refresh();
    private void Update() => Refresh();
    private void OnTransformChildrenChanged() => Refresh();

    private void Refresh()
    {
        _hasBounds = false;
        foreach (var r in GetComponentsInChildren<Renderer>())
        {
            if (!_hasBounds) { _bounds = r.bounds; _hasBounds = true; }
            else _bounds.Encapsulate(r.bounds);
        }

        if (_hasBounds)
        {
            Width  = _bounds.size.x;
            Height = _bounds.size.y;
            Depth  = _bounds.size.z;
        }
        else
        {
            Width = Height = Depth = 0f;
        }
    }

    private void OnDrawGizmosSelected()
    {
        if (!showGizmo || !_hasBounds) return;
        Gizmos.color = gizmoColor;
        Gizmos.DrawWireCube(_bounds.center, _bounds.size);

#if UNITY_EDITOR
        string label = $"W:{Width:F2}m  H:{Height:F2}m  D:{Depth:F2}m";
        Handles.Label(_bounds.center + Vector3.up * (_bounds.extents.y + 0.1f), label);
#endif
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(ObjectSizeInfo))]
public class ObjectSizeInfoEditor : Editor
{
    public override void OnInspectorGUI()
    {
        base.OnInspectorGUI();

        var t = (ObjectSizeInfo)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("실제 크기 (meters)", EditorStyles.boldLabel);
        using (new EditorGUI.DisabledScope(true))
        {
            EditorGUILayout.FloatField("Width",  t.Width);
            EditorGUILayout.FloatField("Height", t.Height);
            EditorGUILayout.FloatField("Depth",  t.Depth);
        }

        if (GUILayout.Button("크기 다시 측정"))
        {
            typeof(ObjectSizeInfo)
                .GetMethod("Refresh", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                ?.Invoke(t, null);
        }

        Repaint();
    }
}
#endif
