using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

[ExecuteAlways]
public class MultiPointMeasure : MonoBehaviour
{
    public enum PointMode { FreePosition, SnapToTransform }

    [System.Serializable]
    public class MeasurePoint
    {
        public string label = "";
        public PointMode mode = PointMode.FreePosition;
        public Vector3 position;
        public Transform snapTarget;

        public Vector3 WorldPosition => (mode == PointMode.SnapToTransform && snapTarget != null)
            ? snapTarget.position
            : position;
    }

    public List<MeasurePoint> points = new();
    public bool loop = false;
    public Color lineColor = new Color(0.2f, 0.8f, 1f, 0.9f);

    public float TotalDistance { get; private set; }
    public IReadOnlyList<float> SegmentDistances => _segmentDistances;
    private readonly List<float> _segmentDistances = new();

    private void Update() => Recalculate();

    private void Recalculate()
    {
        _segmentDistances.Clear();
        TotalDistance = 0f;

        int count = points.Count;
        int segments = loop ? count : count - 1;
        if (count < 2) return;

        for (int i = 0; i < segments; i++)
        {
            float d = Vector3.Distance(points[i].WorldPosition, points[(i + 1) % count].WorldPosition);
            _segmentDistances.Add(d);
            TotalDistance += d;
        }
    }

    private void OnDrawGizmosSelected()
    {
        if (points == null || points.Count < 2) return;

        int count = points.Count;
        int segments = loop ? count : count - 1;

        for (int i = 0; i < segments; i++)
        {
            var a = points[i].WorldPosition;
            var b = points[(i + 1) % count].WorldPosition;

            Gizmos.color = lineColor;
            Gizmos.DrawLine(a, b);

#if UNITY_EDITOR
            if (i < _segmentDistances.Count)
                Handles.Label((a + b) * 0.5f, $"{_segmentDistances[i]:F3} m");
#endif
        }

        for (int i = 0; i < count; i++)
        {
            var wp = points[i].WorldPosition;
            Gizmos.color = Color.white;
            Gizmos.DrawSphere(wp, 0.04f);

#if UNITY_EDITOR
            string n = string.IsNullOrEmpty(points[i].label) ? $"P{i}" : points[i].label;
            Handles.Label(wp + Vector3.up * 0.12f, n);
#endif
        }

#if UNITY_EDITOR
        Handles.Label(points[0].WorldPosition + Vector3.up * 0.25f, $"합계: {TotalDistance:F3} m");
#endif
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(MultiPointMeasure))]
public class MultiPointMeasureEditor : Editor
{
    private void OnSceneGUI()
    {
        var t = (MultiPointMeasure)target;
        if (t.points == null) return;

        for (int i = 0; i < t.points.Count; i++)
        {
            var p = t.points[i];
            if (p.mode != MultiPointMeasure.PointMode.FreePosition) continue;

            EditorGUI.BeginChangeCheck();
            Vector3 newPos = Handles.PositionHandle(p.position, Quaternion.identity);
            if (EditorGUI.EndChangeCheck())
            {
                Undo.RecordObject(t, "Move Measure Point");
                p.position = newPos;
                EditorUtility.SetDirty(t);
            }
        }
    }

    public override void OnInspectorGUI()
    {
        base.OnInspectorGUI();

        var t = (MultiPointMeasure)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("측정 결과", EditorStyles.boldLabel);
        using (new EditorGUI.DisabledScope(true))
        {
            EditorGUILayout.FloatField("합계 거리 (m)", t.TotalDistance);
            for (int i = 0; i < t.SegmentDistances.Count; i++)
                EditorGUILayout.FloatField($"  구간 P{i}→P{i + 1}", t.SegmentDistances[i]);
        }

        EditorGUILayout.Space();
        if (GUILayout.Button("포인트 추가"))
        {
            Undo.RecordObject(t, "Add Measure Point");
            var prev = t.points.Count > 0 ? t.points[^1].WorldPosition : t.transform.position;
            t.points.Add(new MultiPointMeasure.MeasurePoint
            {
                label    = $"P{t.points.Count}",
                position = prev + Vector3.right * 0.5f
            });
            EditorUtility.SetDirty(t);
        }

        if (GUILayout.Button("마지막 포인트 제거") && t.points.Count > 0)
        {
            Undo.RecordObject(t, "Remove Measure Point");
            t.points.RemoveAt(t.points.Count - 1);
            EditorUtility.SetDirty(t);
        }

        Repaint();
    }
}
#endif
