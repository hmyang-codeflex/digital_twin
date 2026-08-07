using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 리플렉션으로 컴포넌트의 public int/float/bool 필드를 훑어, 런타임(Play 모드/빌드) UI에
/// 자동으로 입력 위젯을 생성해주는 유틸리티. 게임 씬에서 오브젝트를 선택했을 때 Inspector
/// 창과 비슷한 편집 UI를 즉석에서 만들기 위한 용도입니다.
///
/// 기존 RobotTask/BoltingInspectionTask 등의 클래스는 전혀 건드리지 않고, 이미 public으로
/// 노출된 필드만 리플렉션으로 읽고 씁니다. 이번 1차 범위는 int/float/bool 원시 타입만
/// 지원하며, List&lt;Target&gt;처럼 복잡한 타입은 건너뜁니다(추후 확장 대상).
/// </summary>
public static class RuntimeFieldEditor
{
    /// <summary>대상 오브젝트에서 지원 가능한 public 필드 목록을 순서대로 반환합니다.
    /// [System.NonSerialized] 필드는 실행 중 갱신되는 읽기 전용 런타임 상태(예: CurrentAttempt)로
    /// 간주해 편집 대상에서 제외합니다.</summary>
    public static List<FieldInfo> GetEditableFields(object target)
    {
        var result = new List<FieldInfo>();
        if (target == null) return result;

        foreach (var f in target.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
        {
            if (f.IsDefined(typeof(NonSerializedAttribute), false)) continue;
            if (f.FieldType == typeof(int) || f.FieldType == typeof(float) || f.FieldType == typeof(bool))
                result.Add(f);
        }
        return result;
    }

    /// <summary>
    /// parent 아래에 target의 편집 가능한 필드들을 세로로 나열해 그립니다.
    /// y는 시작 y좌표(음수, 위에서부터 내려감)이며, 다 그린 뒤의 y좌표를 반환합니다.
    /// </summary>
    public static float DrawFields(
        Transform parent, object target, float startY,
        Font font, Color accentColor, Color labelColor)
    {
        float y = startY;
        var fields = GetEditableFields(target);

        foreach (var field in fields)
        {
            string label = RuntimeFieldNames.NicifyVariableName(field.Name);

            if (field.FieldType == typeof(bool))
            {
                var toggle = CreateToggle(parent, label, new Vector2(16, y), font, accentColor, labelColor);
                toggle.SetIsOnWithoutNotify((bool)field.GetValue(target));
                toggle.onValueChanged.AddListener(v => field.SetValue(target, v));
                y -= 28f;
            }
            else // int, float
            {
                CreateLabel(parent, label, new Vector2(16, y), font, labelColor);
                var input = CreateNumberInput(parent, new Vector2(150, y), font);
                input.text = field.FieldType == typeof(int)
                    ? ((int)field.GetValue(target)).ToString()
                    : ((float)field.GetValue(target)).ToString("0.###");

                input.onEndEdit.AddListener(text =>
                {
                    if (!float.TryParse(text, out float parsed)) return;
                    if (field.FieldType == typeof(int)) field.SetValue(target, Mathf.RoundToInt(parsed));
                    else field.SetValue(target, parsed);
                });
                y -= 28f;
            }
        }
        return y;
    }

    // ── UI 헬퍼 (RobotSelectionUI의 동명 헬퍼와 동일한 스타일, 별도 static 버전) ──

    private static Text CreateLabel(Transform parent, string label, Vector2 pos, Font font, Color color)
    {
        var go = new GameObject(label + "Label", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(130, 20);

        var text = go.AddComponent<Text>();
        text.font = font;
        text.fontSize = 11;
        text.color = color;
        text.text = label;
        text.alignment = TextAnchor.MiddleLeft;
        return text;
    }

    private static InputField CreateNumberInput(Transform parent, Vector2 pos, Font font)
    {
        var go = new GameObject("NumberInput", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(130, 22);

        var bgImg = go.AddComponent<Image>();
        bgImg.color = new Color(1, 1, 1, 0.08f);

        var textGo = new GameObject("Text", typeof(RectTransform));
        textGo.transform.SetParent(go.transform, false);
        var textRect = textGo.GetComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.offsetMin = new Vector2(6, 2);
        textRect.offsetMax = new Vector2(-6, -2);
        var text = textGo.AddComponent<Text>();
        text.font = font;
        text.fontSize = 12;
        text.color = Color.white;
        text.alignment = TextAnchor.MiddleLeft;

        var input = go.AddComponent<InputField>();
        input.textComponent = text;
        input.contentType = InputField.ContentType.DecimalNumber;
        input.targetGraphic = bgImg;
        return input;
    }

    private static Toggle CreateToggle(Transform parent, string label, Vector2 pos, Font font, Color accentColor, Color labelColor)
    {
        var go = new GameObject(label + "Toggle", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(268, 22);

        var toggle = go.AddComponent<Toggle>();

        var bgGo = new GameObject("Background", typeof(RectTransform));
        bgGo.transform.SetParent(go.transform, false);
        var bgRect = bgGo.GetComponent<RectTransform>();
        bgRect.anchorMin = bgRect.anchorMax = new Vector2(0, 0.5f);
        bgRect.pivot = new Vector2(0, 0.5f);
        bgRect.anchoredPosition = Vector2.zero;
        bgRect.sizeDelta = new Vector2(18, 18);
        var bgImg = bgGo.AddComponent<Image>();
        bgImg.color = new Color(1, 1, 1, 0.12f);
        toggle.targetGraphic = bgImg;

        var checkGo = new GameObject("Checkmark", typeof(RectTransform));
        checkGo.transform.SetParent(bgGo.transform, false);
        var checkRect = checkGo.GetComponent<RectTransform>();
        checkRect.anchorMin = new Vector2(0.18f, 0.18f);
        checkRect.anchorMax = new Vector2(0.82f, 0.82f);
        checkRect.sizeDelta = Vector2.zero;
        var checkImg = checkGo.AddComponent<Image>();
        checkImg.color = accentColor;
        toggle.graphic = checkImg;

        var textGo = new GameObject("Label", typeof(RectTransform));
        textGo.transform.SetParent(go.transform, false);
        var textRect = textGo.GetComponent<RectTransform>();
        textRect.anchorMin = textRect.anchorMax = new Vector2(0, 0.5f);
        textRect.pivot = new Vector2(0, 0.5f);
        textRect.anchoredPosition = new Vector2(26, 0);
        textRect.sizeDelta = new Vector2(220, 22);
        var text = textGo.AddComponent<Text>();
        text.font = font;
        text.fontSize = 13;
        text.color = labelColor;
        text.text = label;
        text.alignment = TextAnchor.MiddleLeft;

        return toggle;
    }
}

/// <summary>UnityEditor.RuntimeFieldNames가 런타임 빌드에 없으므로 최소 기능만 대체 구현.</summary>
internal static class RuntimeFieldNames
{
    public static string NicifyVariableName(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        if (name.StartsWith("_")) name = name.Substring(1);
        if (name.Length > 0) name = char.ToUpperInvariant(name[0]) + name.Substring(1);

        var sb = new System.Text.StringBuilder();
        for (int i = 0; i < name.Length; i++)
        {
            if (i > 0 && char.IsUpper(name[i]) && !char.IsUpper(name[i - 1]))
                sb.Append(' ');
            sb.Append(name[i]);
        }
        return sb.ToString();
    }
}
