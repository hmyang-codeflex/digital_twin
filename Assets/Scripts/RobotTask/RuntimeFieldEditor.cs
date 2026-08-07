using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEngine.UI;
using Preliy.Flange;

/// <summary>
/// 리플렉션으로 컴포넌트의 필드를 훑어, 런타임(Play 모드/빌드) UI에 자동으로 입력 위젯을
/// 생성해주는 유틸리티. 게임 씬에서 오브젝트를 선택했을 때 Inspector 창과 비슷한 편집 UI를
/// 즉석에서 만들기 위한 용도입니다.
///
/// 기존 RobotTask/BoltingInspectionTask 등의 클래스는 전혀 건드리지 않고, 이미 public으로
/// 노출된 필드만 리플렉션으로 읽고 씁니다. int/float/bool 원시 타입에 더해, 로봇 작업 위치를
/// 나타내는 Target/List&lt;Target&gt; 필드도 드롭다운으로 편집할 수 있습니다 — 에디터
/// Inspector에서 p_??? 타겟을 드래그해 연결하던 작업을 플레이 화면에서 그대로 대체합니다.
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
            if (IsSupportedType(f.FieldType))
                result.Add(f);
        }
        return result;
    }

    private static bool IsSupportedType(Type t) =>
        t == typeof(int) || t == typeof(float) || t == typeof(bool)
        || t == typeof(Target) || t == typeof(List<Target>);

    /// <summary>
    /// parent 아래에 target의 편집 가능한 필드들을 세로로 나열해 그립니다.
    /// y는 시작 y좌표(음수, 위에서부터 내려감)이며, 다 그린 뒤의 y좌표를 반환합니다.
    /// onListChanged: List&lt;Target&gt; 필드에서 항목을 추가/삭제했을 때 호출됩니다. 이 유틸리티는
    /// 자기 자신을 다시 그리지 않으므로, 호출부(RobotSelectionUI 등)가 이 콜백을 받아
    /// DrawFields를 다시 호출해 화면을 갱신해야 삭제/추가가 실제로 반영된 것처럼 보입니다.
    /// </summary>
    public static float DrawFields(
        Transform parent, object target, float startY,
        Font font, Color accentColor, Color labelColor,
        Action onListChanged = null)
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
            else if (field.FieldType == typeof(int) || field.FieldType == typeof(float))
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
            else if (field.FieldType == typeof(Target))
            {
                y = DrawSingleTargetField(parent, target, field, label, y, font, accentColor, labelColor);
            }
            else if (field.FieldType == typeof(List<Target>))
            {
                y = DrawTargetListField(parent, target, field, label, y, font, accentColor, labelColor, onListChanged);
            }
        }
        return y;
    }

    // ── Target(단일) 필드 ────────────────────────────────────────
    // 씬의 Target 컴포넌트 전체를 드롭다운으로 나열해 선택하면 그 필드를 즉시 교체합니다.
    private static float DrawSingleTargetField(
        Transform parent, object target, FieldInfo field, string label, float y,
        Font font, Color accentColor, Color labelColor)
    {
        CreateLabel(parent, label, new Vector2(16, y), font, labelColor);
        y -= 20f;

        var allTargets = FindAllTargets();
        var current = (Target)field.GetValue(target);
        var dropdown = CreateDropdown(parent, new Vector2(16, y), font);

        PopulateTargetOptions(dropdown, allTargets, current);
        dropdown.onValueChanged.AddListener(idx =>
        {
            if (idx <= 0) { field.SetValue(target, null); return; } // 0번 = "(없음)"
            if (idx - 1 < allTargets.Count) field.SetValue(target, allTargets[idx - 1]);
        });

        y -= 30f;
        return y;
    }

    // ── List<Target> 필드 ────────────────────────────────────────
    // 리스트의 각 항목을 드롭다운(교체용)+삭제 버튼으로 나열하고, 하단에 추가 버튼을 둡니다.
    private static float DrawTargetListField(
        Transform parent, object target, FieldInfo field, string label, float y,
        Font font, Color accentColor, Color labelColor, Action onListChanged)
    {
        CreateLabel(parent, label, new Vector2(16, y), font, labelColor);
        y -= 20f;

        var allTargets = FindAllTargets();
        var list = (List<Target>)field.GetValue(target) ?? new List<Target>();
        field.SetValue(target, list); // null이었으면 새 리스트를 필드에 반영

        for (int i = 0; i < list.Count; i++)
        {
            int idx = i; // 클로저 캡처용 로컬 복사
            var dropdown = CreateDropdown(parent, new Vector2(16, y), font, width: 220);
            PopulateTargetOptions(dropdown, allTargets, list[idx]);
            dropdown.onValueChanged.AddListener(v =>
            {
                list[idx] = (v <= 0 || v - 1 >= allTargets.Count) ? null : allTargets[v - 1];
            });

            // 오조작으로 경유지가 바로 삭제되지 않도록 2단계 확인: 처음 누르면 "X"가 느낌표로
            // 바뀌어 경고색이 되고, 그 상태에서 같은 버튼을 한 번 더 눌러야 실제 삭제됩니다.
            // 버튼 폭(22px)이 좁아 긴 문구 대신 단일 문자로 상태를 표시합니다.
            var removeBtn = CreateSmallButton(parent, "X", new Vector2(246, y), font);
            bool confirmPending = false;
            removeBtn.onClick.AddListener(() =>
            {
                if (!confirmPending)
                {
                    confirmPending = true;
                    SetButtonLabel(removeBtn, "!");
                    SetButtonColor(removeBtn, new Color(0.85f, 0.45f, 0.05f, 0.95f));
                    return;
                }
                list.RemoveAt(idx);
                onListChanged?.Invoke(); // 삭제 직후 목록에서 즉시 사라진 것처럼 보이려면 화면을 다시 그려야 함
            });
            y -= 28f;
        }

        var addBtn = CreateButton(parent, "+ 경유지 추가", new Vector2(16, y), 268, 24, font, accentColor);
        addBtn.onClick.AddListener(() =>
        {
            list.Add(allTargets.Count > 0 ? allTargets[0] : null);
            onListChanged?.Invoke();
        });
        y -= 32f;

        return y;
    }

    private static List<Target> FindAllTargets() =>
        UnityEngine.Object.FindObjectsByType<Target>(FindObjectsSortMode.None).OrderBy(t => t.name).ToList();

    private static void PopulateTargetOptions(Dropdown dropdown, List<Target> allTargets, Target current)
    {
        var options = new List<string> { "(없음)" };
        options.AddRange(allTargets.Select(t => t.name));
        dropdown.ClearOptions();
        dropdown.AddOptions(options);

        int selectedIdx = current == null ? 0 : allTargets.IndexOf(current) + 1;
        dropdown.SetValueWithoutNotify(Mathf.Max(0, selectedIdx));
    }

    // ── UI 헬퍼 (RobotSelectionUI의 동명 헬퍼와 동일한 스타일, 별도 static 버전) ──

    /// <summary>Target 드롭다운 위젯 생성. Unity 기본 Dropdown 템플릿을 최소 구성으로 직접 조립합니다.</summary>
    private static Dropdown CreateDropdown(Transform parent, Vector2 pos, Font font, float width = 268)
    {
        var go = new GameObject("TargetDropdown", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(width, 24);

        var bgImg = go.AddComponent<Image>();
        bgImg.color = new Color(1, 1, 1, 0.08f);

        var labelGo = new GameObject("Label", typeof(RectTransform));
        labelGo.transform.SetParent(go.transform, false);
        var labelRect = labelGo.GetComponent<RectTransform>();
        labelRect.anchorMin = Vector2.zero;
        labelRect.anchorMax = Vector2.one;
        labelRect.offsetMin = new Vector2(8, 2);
        labelRect.offsetMax = new Vector2(-20, -2);
        var labelText = labelGo.AddComponent<Text>();
        labelText.font = font;
        labelText.fontSize = 12;
        labelText.color = Color.white;
        labelText.alignment = TextAnchor.MiddleLeft;

        // 드롭다운을 펼쳤을 때 보이는 옵션 목록(Template) — Unity Dropdown이 요구하는 최소 계층 구조
        var templateGo = new GameObject("Template", typeof(RectTransform));
        templateGo.transform.SetParent(go.transform, false);
        var templateRect = templateGo.GetComponent<RectTransform>();
        templateRect.anchorMin = new Vector2(0, 0);
        templateRect.anchorMax = new Vector2(1, 0);
        templateRect.pivot = new Vector2(0.5f, 1);
        templateRect.anchoredPosition = new Vector2(0, 2);
        templateRect.sizeDelta = new Vector2(0, 150);
        var templateImg = templateGo.AddComponent<Image>();
        templateImg.color = new Color(0.08f, 0.08f, 0.1f, 0.98f);
        var scrollRect = templateGo.AddComponent<ScrollRect>();
        templateGo.SetActive(false);

        var viewportGo = new GameObject("Viewport", typeof(RectTransform));
        viewportGo.transform.SetParent(templateGo.transform, false);
        var viewportRect = viewportGo.GetComponent<RectTransform>();
        viewportRect.anchorMin = Vector2.zero;
        viewportRect.anchorMax = Vector2.one;
        viewportRect.sizeDelta = Vector2.zero;
        viewportGo.AddComponent<Image>().color = new Color(1, 1, 1, 0.01f);
        viewportGo.AddComponent<Mask>().showMaskGraphic = false;
        scrollRect.viewport = viewportRect;

        var contentGo = new GameObject("Content", typeof(RectTransform));
        contentGo.transform.SetParent(viewportGo.transform, false);
        var contentRect = contentGo.GetComponent<RectTransform>();
        contentRect.anchorMin = new Vector2(0, 1);
        contentRect.anchorMax = new Vector2(1, 1);
        contentRect.pivot = new Vector2(0.5f, 1);
        contentRect.sizeDelta = new Vector2(0, 28);
        scrollRect.content = contentRect;

        var itemGo = new GameObject("Item", typeof(RectTransform));
        itemGo.transform.SetParent(contentGo.transform, false);
        var itemRect = itemGo.GetComponent<RectTransform>();
        itemRect.anchorMin = new Vector2(0, 0.5f);
        itemRect.anchorMax = new Vector2(1, 0.5f);
        itemRect.sizeDelta = new Vector2(0, 24);
        var itemToggle = itemGo.AddComponent<Toggle>();
        var itemBgGo = new GameObject("Item Background", typeof(RectTransform));
        itemBgGo.transform.SetParent(itemGo.transform, false);
        var itemBgRect = itemBgGo.GetComponent<RectTransform>();
        itemBgRect.anchorMin = Vector2.zero;
        itemBgRect.anchorMax = Vector2.one;
        itemBgRect.sizeDelta = Vector2.zero;
        var itemBgImg = itemBgGo.AddComponent<Image>();
        itemBgImg.color = new Color(1, 1, 1, 0.06f);
        itemToggle.targetGraphic = itemBgImg;

        var itemLabelGo = new GameObject("Item Label", typeof(RectTransform));
        itemLabelGo.transform.SetParent(itemGo.transform, false);
        var itemLabelRect = itemLabelGo.GetComponent<RectTransform>();
        itemLabelRect.anchorMin = Vector2.zero;
        itemLabelRect.anchorMax = Vector2.one;
        itemLabelRect.offsetMin = new Vector2(8, 0);
        itemLabelRect.offsetMax = new Vector2(-8, 0);
        var itemLabelText = itemLabelGo.AddComponent<Text>();
        itemLabelText.font = font;
        itemLabelText.fontSize = 12;
        itemLabelText.color = Color.white;
        itemLabelText.alignment = TextAnchor.MiddleLeft;

        // Item은 Dropdown.Show()가 옵션 개수만큼 복제하는 "찍어내기 원본"이라, 표준 Dropdown
        // 프리팹과 동일하게 비활성 상태로 둬야 한다. 활성 상태로 두면 원본이 화면에 그대로
        // 남아 첫 옵션 자리에 유령처럼 겹쳐 보이는 문제가 생긴다.
        itemGo.SetActive(false);

        var dropdown = go.AddComponent<Dropdown>();
        dropdown.targetGraphic = bgImg;
        dropdown.captionText = labelText;
        dropdown.itemText = itemLabelText;
        dropdown.template = templateRect;
        return dropdown;
    }

    /// <summary>버튼의 표시 텍스트를 바꿉니다. 2단계 확인 흐름(삭제 등)에서 문구를 갱신할 때 사용.</summary>
    private static void SetButtonLabel(Button button, string label)
    {
        var text = button.GetComponentInChildren<Text>();
        if (text != null) text.text = label;
    }

    /// <summary>버튼 배경색을 바꿉니다. Button.targetGraphic이 Image라는 전제(이 파일의 버튼 헬퍼가 전부 그렇게 만듦)로 동작.</summary>
    private static void SetButtonColor(Button button, Color color)
    {
        if (button.targetGraphic is Image img) img.color = color;
    }

    private static Button CreateSmallButton(Transform parent, string label, Vector2 pos, Font font)
    {
        var go = new GameObject(label + "Btn", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(22, 22);

        var img = go.AddComponent<Image>();
        img.color = new Color(0.45f, 0.18f, 0.18f, 0.9f);
        var btn = go.AddComponent<Button>();
        btn.targetGraphic = img;

        var textGo = new GameObject("Label", typeof(RectTransform));
        textGo.transform.SetParent(go.transform, false);
        var textRect = textGo.GetComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.sizeDelta = Vector2.zero;
        var text = textGo.AddComponent<Text>();
        text.font = font;
        text.fontSize = 12;
        text.fontStyle = FontStyle.Bold;
        text.color = Color.white;
        text.text = label;
        text.alignment = TextAnchor.MiddleCenter;

        return btn;
    }

    private static Button CreateButton(Transform parent, string label, Vector2 pos, float width, float height, Font font, Color bg)
    {
        var go = new GameObject(label + "Button", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(width, height);

        var img = go.AddComponent<Image>();
        img.color = new Color(bg.r, bg.g, bg.b, 0.18f);
        var btn = go.AddComponent<Button>();
        btn.targetGraphic = img;

        var textGo = new GameObject("Label", typeof(RectTransform));
        textGo.transform.SetParent(go.transform, false);
        var textRect = textGo.GetComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.sizeDelta = Vector2.zero;
        var text = textGo.AddComponent<Text>();
        text.font = font;
        text.fontSize = 12;
        text.fontStyle = FontStyle.Bold;
        text.color = bg;
        text.text = label;
        text.alignment = TextAnchor.MiddleCenter;

        return btn;
    }

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
