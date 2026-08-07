using System.Collections.Generic;
using Preliy.Flange;
using realvirtual;
using realvirtual.RendererFeatures;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

/// <summary>
/// 디지털 트윈 데모(Unity dt-demo)처럼: 좌측 사이드바 목록 + 3D 월드 위의 원형 마커로
/// 로봇을 선택하고, 선택하면 카메라가 해당 로봇으로 포커스되며 우측에 속성 편집 패널이 뜬다.
/// Physics Raycast/Collider에 의존하지 않으므로 로봇 모델에 Collider가 없어도 동작한다.
/// RobotTask/Instruction의 실행 로직은 건드리지 않고, 이미 공개된 접근자만 사용한다.
/// 별도 배치 없이 게임 시작 시 자동으로 스스로 생성된다 (Bootstrap 참고).
/// </summary>
public class RobotSelectionUI : MonoBehaviour
{
    private class RobotEntry
    {
        public RobotTask Task;
        public Transform FocusTransform;
        public readonly List<Renderer> Renderers = new();

        public GameObject MarkerGo;
        public RectTransform MarkerRect;
        public Image MarkerImage;

        public GameObject SidebarRowGo;
        public Image SidebarRowBg;
        public Image SidebarIcon;
    }

    [Header("스타일")]
    [SerializeField] private Color _accentColor = new Color(0.2f, 0.85f, 1f);
    [SerializeField] private Color _panelColor = new Color(0.06f, 0.07f, 0.09f, 0.92f);
    [SerializeField] private float _focusDistance = 3.5f;

    private Camera _cam;
    private CameraController _camController;
    private OutlineSelectionManager _selectOutlineManager;
    private OutlineSelectionManager _hoverOutlineManager;
    private Font _font;
    private Canvas _canvas;
    private RectTransform _canvasRect;

    private readonly List<RobotEntry> _entries = new();
    private readonly Dictionary<Controller, RobotEntry> _controllerToEntry = new();
    private RobotEntry _selected;
    private RobotEntry _hovered;
    private Sprite _markerSpriteDefault, _markerSpriteSelected;

    // 사이드바
    private GameObject _sidebarRoot;

    // 우측 속성 편집 패널 (재사용)
    private GameObject _panelRoot;
    private Text _titleText, _statusText, _progressText, _speedValueText, _scaleValueText;
    private Toggle _loopToggle, _pathToggle, _framesToggle;
    private Slider _speedSlider, _scaleSlider;

    // 선택된 로봇에 BoltingInspectionTask 등 세부 설정 가능한 태스크가 붙어있을 때, 그 필드를
    // 리플렉션으로 그려주는 동적 섹션. 로봇을 바꿀 때마다 통째로 지우고 다시 생성한다.
    private GameObject _taskDetailRoot;
    private float _basePanelHeight; // 태스크 세부 섹션이 없을 때의 기본 패널 높이

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (FindAnyObjectByType<RobotSelectionUI>() != null) return;
        var go = new GameObject("RobotSelectionUI");
        go.AddComponent<RobotSelectionUI>();
        DontDestroyOnLoad(go);
    }

    private void Awake()
    {
        _camController = FindAnyObjectByType<CameraController>();
        _cam = _camController != null ? _camController.GetComponent<Camera>() : Camera.main;
        FindOutlineManagers();
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

        _markerSpriteDefault = CreateCircleSprite(28, new Color(1f, 1f, 1f, 0.85f), new Color(0.05f, 0.06f, 0.08f, 0.95f));
        _markerSpriteSelected = CreateCircleSprite(28, _accentColor, new Color(0.05f, 0.06f, 0.08f, 0.95f));

        EnsureSingleActiveEventSystem();
        BuildCanvas();
        CollectRobots();
        BuildSidebar();
        BuildResetCameraButton();
        BuildMarkers();
        BuildPropertyPanel();
        HidePanel();
    }

    private void Update()
    {
        if (_camController == null) _camController = FindAnyObjectByType<CameraController>();
        if (_cam == null) _cam = _camController != null ? _camController.GetComponent<Camera>() : Camera.main;
        if (_selectOutlineManager == null || _hoverOutlineManager == null) FindOutlineManagers();
        if (_cam == null) return;

        foreach (var e in _entries)
            UpdateMarkerPosition(e);

        bool overUI = IsPointerOverUI();
        var hovered = overUI ? null : ResolveSceneRayTarget();
        if (hovered != _hovered)
        {
            if (_hovered != null && _hovered != _selected) SetOutline(_hoverOutlineManager, _hovered, false);
            _hovered = hovered;
            if (_hovered != null && _hovered != _selected) SetOutline(_hoverOutlineManager, _hovered, true);
        }

        if (Input.GetMouseButtonDown(0) && !overUI && hovered != null)
            Select(hovered);

        if (_selected != null)
            RefreshLiveFields();
    }

    /// <summary>
    /// 호버(노란색)와 선택(파란색)을 각각 고정 색상의 별도 Renderer Feature로 분리했다.
    /// 같은 Feature의 color를 런타임에 바꿔가며 재사용하는 방식이 불안정해서
    /// (선택은 항상 보이는데 호버만 안 보이는 현상) 색상이 절대 바뀌지 않는 두 개의
    /// 인스턴스로 나눠 우회한다.
    /// </summary>
    private void FindOutlineManagers()
    {
        // 씬에 이름이 다른 OutlineSelectionManager(예: 'Outline')가 이미 존재할 수 있어
        // 정확한 이름으로만 매칭한다 — 아무거나 매칭하면 무관한 인스턴스로 덮어써진다.
        var managers = FindObjectsByType<OutlineSelectionManager>(FindObjectsSortMode.None);
        foreach (var m in managers)
        {
            if (m.gameObject.name == "OutlineSelectionManagerHover") _hoverOutlineManager = m;
            else if (m.gameObject.name == "OutlineSelectionManager") _selectOutlineManager = m;
        }

        Debug.Log($"[RobotSelectionUI] select={(_selectOutlineManager != null ? _selectOutlineManager.gameObject.name + $" color={_selectOutlineManager.color} spread={_selectOutlineManager.spread}" : "NULL")}, hover={(_hoverOutlineManager != null ? _hoverOutlineManager.gameObject.name + $" color={_hoverOutlineManager.color} spread={_hoverOutlineManager.spread}" : "NULL")}");
    }

    private static void SetOutline(OutlineSelectionManager manager, RobotEntry e, bool active)
    {
        Debug.Log($"[RobotSelectionUI] SetOutline manager={(manager != null ? manager.gameObject.name : "NULL")} entry={e.FocusTransform.gameObject.name} rendererCount={e.Renderers.Count} active={active}");
        if (manager == null) return;
        foreach (var r in e.Renderers)
        {
            if (active) manager.Select(r);
            else manager.Deselect(r);
        }
    }

    private bool IsPointerOverUI() => EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();

    private RobotEntry ResolveSceneRayTarget()
    {
        Ray ray = _cam.ScreenPointToRay(Input.mousePosition);
        if (!Physics.Raycast(ray, out RaycastHit hit, 500f, ~0, QueryTriggerInteraction.Collide)) return null;

        var controller = hit.collider.GetComponentInParent<Controller>();
        if (controller != null && _controllerToEntry.TryGetValue(controller, out var entry)) return entry;
        return null;
    }

    /// <summary>
    /// 씬에 EventSystem이 여러 개 활성화돼 있거나(2개 이상 동시 활성 시 UI 클릭이 불안정해짐),
    /// 유일한 EventSystem이 기본적으로 비활성화돼 있어 UI Button 클릭이 전혀 동작하지 않는
    /// 경우를 정리한다. 정확히 하나의 EventSystem만 활성 상태로 남긴다.
    /// </summary>
    private static void EnsureSingleActiveEventSystem()
    {
        var systems = FindObjectsByType<EventSystem>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        if (systems.Length == 0) return;

        EventSystem keep = null;
        foreach (var es in systems)
        {
            if (!es.gameObject.activeInHierarchy || !es.enabled) continue;
            if (keep == null) keep = es;
            else es.gameObject.SetActive(false);
        }

        if (keep == null)
            systems[0].gameObject.SetActive(true);
    }

    // ──────────────────────────────────────────────────────────────
    // 로봇 수집
    // ──────────────────────────────────────────────────────────────
    private void CollectRobots()
    {
        var tasks = FindObjectsByType<RobotTask>(FindObjectsInactive.Include, FindObjectsSortMode.None);

        var seen = new HashSet<Controller>();
        foreach (var task in tasks)
        {
            if (task.Controller == null) continue;
            if (!seen.Add(task.Controller)) continue; // 같은 컨트롤러에 RobotTask가 여러개면 첫번째만 등록

            var entry = new RobotEntry { Task = task, FocusTransform = task.Controller.transform };
            _entries.Add(entry);
            _controllerToEntry[task.Controller] = entry;
            SetupMeshHelpers(task.Controller, entry);
        }
    }

    /// <summary>
    /// 로봇 모델(Flange-master 샘플 프리팹)에 Collider가 전혀 없어 3D 직접 클릭이 안 되는 경우가
    /// 있어, 각 메쉬에 맞춰 런타임에 MeshCollider를 자동 부착한다 (Trigger로 설정해 기존 물리/볼트
    /// 검사에 영향 없음 — Raycast는 기본적으로 Trigger Collider도 감지). 동시에 해당 메쉬의
    /// Renderer를 모아서 호버/선택 아웃라인 대상으로 등록한다.
    /// </summary>
    private static void SetupMeshHelpers(Controller controller, RobotEntry entry)
    {
        var filters = controller.GetComponentsInChildren<MeshFilter>();
        foreach (var filter in filters)
        {
            if (filter.sharedMesh == null) continue;

            if (filter.GetComponent<Collider>() == null)
            {
                var col = filter.gameObject.AddComponent<MeshCollider>();
                col.sharedMesh = filter.sharedMesh;
                col.convex = false;
                col.isTrigger = true;
            }

            var renderer = filter.GetComponent<Renderer>();
            if (renderer != null) entry.Renderers.Add(renderer);
        }
    }

    private static string DisplayName(RobotEntry e) => e.FocusTransform.gameObject.name.ToUpperInvariant();

    private static Vector3 GetFocusWorldPos(RobotEntry e)
    {
        var renderers = e.FocusTransform.GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0) return e.FocusTransform.position;

        Bounds b = renderers[0].bounds;
        for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
        return new Vector3(b.center.x, b.max.y + 0.15f, b.center.z);
    }

    // ──────────────────────────────────────────────────────────────
    // 마커 (3D 월드 위치를 따라가는 UI 점)
    // ──────────────────────────────────────────────────────────────
    private void BuildMarkers()
    {
        foreach (var e in _entries)
        {
            var go = new GameObject("Marker_" + e.FocusTransform.gameObject.name, typeof(RectTransform));
            go.transform.SetParent(_canvas.transform, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(20, 20);

            var img = go.AddComponent<Image>();
            img.sprite = _markerSpriteDefault;

            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            var entry = e;
            btn.onClick.AddListener(() => Select(entry));

            e.MarkerGo = go;
            e.MarkerRect = rect;
            e.MarkerImage = img;
        }
    }

    private void UpdateMarkerPosition(RobotEntry e)
    {
        Vector3 screenPos = _cam.WorldToScreenPoint(GetFocusWorldPos(e));
        if (screenPos.z < 0)
        {
            e.MarkerGo.SetActive(false);
            return;
        }

        e.MarkerGo.SetActive(true);
        RectTransformUtility.ScreenPointToLocalPointInRectangle(_canvasRect, screenPos, null, out var localPoint);
        e.MarkerRect.anchoredPosition = localPoint;
    }

    private static Sprite CreateCircleSprite(int size, Color fill, Color border)
    {
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        float r = size / 2f;
        float borderWidth = 2.5f;
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float dx = x + 0.5f - r;
                float dy = y + 0.5f - r;
                float dist = Mathf.Sqrt(dx * dx + dy * dy);
                Color c = dist > r ? new Color(0, 0, 0, 0) : (dist > r - borderWidth ? border : fill);
                tex.SetPixel(x, y, c);
            }
        }
        tex.Apply();
        tex.wrapMode = TextureWrapMode.Clamp;
        return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
    }

    // ──────────────────────────────────────────────────────────────
    // 선택 / 해제
    // ──────────────────────────────────────────────────────────────
    private void Select(RobotEntry e)
    {
        if (_selected != null) { ApplySelectedVisual(_selected, false); SetOutline(_selectOutlineManager, _selected, false); }
        if (_hovered == e) SetOutline(_hoverOutlineManager, e, false); // 호버 표시 끄고 선택 표시로 전환

        _selected = e;
        ApplySelectedVisual(e, true);
        SetOutline(_selectOutlineManager, e, true);

        _panelRoot.SetActive(true);
        PopulatePanel(e.Task);

        if (_camController != null)
            _camController.FocusOn(GetFocusWorldPos(e), _focusDistance);
    }

    private void Deselect()
    {
        if (_selected != null) { ApplySelectedVisual(_selected, false); SetOutline(_selectOutlineManager, _selected, false); }
        _selected = null;
        HidePanel();
    }

    private void ApplySelectedVisual(RobotEntry e, bool selected)
    {
        e.MarkerImage.sprite = selected ? _markerSpriteSelected : _markerSpriteDefault;
        e.SidebarIcon.sprite = selected ? _markerSpriteSelected : _markerSpriteDefault;
        e.SidebarRowBg.color = selected
            ? new Color(_accentColor.r, _accentColor.g, _accentColor.b, 0.18f)
            : new Color(1, 1, 1, 0.03f);
    }

    private void HidePanel() => _panelRoot.SetActive(false);

    private void PopulatePanel(RobotTask task)
    {
        var displayObject = task.Controller != null ? task.Controller.gameObject : task.gameObject;
        _titleText.text = displayObject.name.ToUpperInvariant();
        _loopToggle.SetIsOnWithoutNotify(task.LoopExecution);
        _pathToggle.SetIsOnWithoutNotify(task.ShowPathGizmo);
        _framesToggle.SetIsOnWithoutNotify(task.ShowFrames);
        _speedSlider.SetValueWithoutNotify(task.SpeedOverride);
        _scaleSlider.SetValueWithoutNotify(task.GizmoScale);
        RefreshLiveFields();
        RebuildTaskDetailSection(task);
    }

    /// <summary>
    /// 선택된 로봇에 BoltingInspectionTask가 붙어있으면, 그 편집 가능한 필드(MaxAttempts,
    /// InspectDelay 등)를 리플렉션으로 나열한 섹션을 패널 하단에 다시 그린다. 로봇을 바꿀 때마다
    /// 기존 섹션을 통째로 지우고 새로 만들어 항상 현재 선택된 오브젝트 기준으로 갱신되게 한다.
    /// 지금은 1차 테스트 범위로 BoltingInspectionTask만 대상으로 하며, 다른 컴포넌트로의 확장은
    /// 이 메서드에 else-if 분기를 추가하는 방식으로 이어갈 수 있다.
    /// </summary>
    private void RebuildTaskDetailSection(RobotTask task)
    {
        // 기존 섹션 내용 제거. Destroy()는 프레임 끝에 지연 파괴되므로, 같은 프레임 안에서
        // 로봇을 연속으로 바꿔 다시 호출돼도 childCount에 안 잡히도록 부모에서 먼저 떼어낸다.
        for (int i = _taskDetailRoot.transform.childCount - 1; i >= 0; i--)
        {
            var child = _taskDetailRoot.transform.GetChild(i);
            child.SetParent(null);
            Destroy(child.gameObject);
        }

        var bolting = task.GetComponent<BoltingInspectionTask>();
        float extraHeight = 0f;

        if (bolting != null)
        {
            float y = -10f;
            CreateDivider(_taskDetailRoot.transform, y); y -= 14f;

            var header = new GameObject("HeaderLabel", typeof(RectTransform));
            header.transform.SetParent(_taskDetailRoot.transform, false);
            var headerRect = header.GetComponent<RectTransform>();
            headerRect.anchorMin = headerRect.anchorMax = new Vector2(0, 1);
            headerRect.pivot = new Vector2(0, 1);
            headerRect.anchoredPosition = new Vector2(16, y);
            headerRect.sizeDelta = new Vector2(260, 20);
            var headerText = header.AddComponent<Text>();
            headerText.font = _font;
            headerText.fontSize = 12;
            headerText.fontStyle = FontStyle.Bold;
            headerText.color = _accentColor;
            headerText.text = "BOLTING TASK 설정";
            y -= 26f;

            y = RuntimeFieldEditor.DrawFields(
                _taskDetailRoot.transform, bolting, y,
                _font, _accentColor, new Color(0.85f, 0.86f, 0.9f));

            y -= 6f;
            var hint = new GameObject("Hint", typeof(RectTransform));
            hint.transform.SetParent(_taskDetailRoot.transform, false);
            var hintRect = hint.GetComponent<RectTransform>();
            hintRect.anchorMin = hintRect.anchorMax = new Vector2(0, 1);
            hintRect.pivot = new Vector2(0, 1);
            hintRect.anchoredPosition = new Vector2(16, y);
            hintRect.sizeDelta = new Vector2(268, 32);
            var hintText = hint.AddComponent<Text>();
            hintText.font = _font;
            hintText.fontSize = 9;
            hintText.color = new Color(0.55f, 0.57f, 0.62f);
            hintText.text = "변경 값은 다음 재시도 사이클부터 적용됩니다.";
            y -= 32f;

            extraHeight = -y;
        }

        var panelRect = _panelRoot.GetComponent<RectTransform>();
        panelRect.sizeDelta = new Vector2(panelRect.sizeDelta.x, _basePanelHeight + extraHeight);
    }

    private void RefreshLiveFields()
    {
        var task = _selected.Task;
        bool running = task.Status == "Run";
        _statusText.text = running ? "RUNNING" : "IDLE";
        _statusText.color = running ? new Color(0.35f, 1f, 0.55f) : new Color(0.6f, 0.62f, 0.68f);
        _progressText.text = running ? $"{task.CurrentInstructionIndex + 1} / {Mathf.Max(task.InstructionCount, 1)}" : "-";
        _speedValueText.text = $"x{task.SpeedOverride:F2}";
        _scaleValueText.text = $"{task.GizmoScale:F2}";
    }

    // ──────────────────────────────────────────────────────────────
    // 캔버스 / 사이드바
    // ──────────────────────────────────────────────────────────────
    private void BuildCanvas()
    {
        var canvasGo = new GameObject("RobotSelectionCanvas");
        canvasGo.transform.SetParent(transform, false);
        _canvas = canvasGo.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 100;
        var scaler = canvasGo.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        canvasGo.AddComponent<GraphicRaycaster>();
        _canvasRect = canvasGo.GetComponent<RectTransform>();
    }

    private void BuildSidebar()
    {
        float height = 56 + _entries.Count * 34 + 16;
        _sidebarRoot = CreatePanel(_canvas.transform, "RobotSidebarPanel", new Vector2(260, height));
        var rect = _sidebarRoot.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = new Vector2(20, -20);

        CreateText(_sidebarRoot.transform, "Title", "ROBOTS", 16, FontStyle.Bold, _accentColor, new Vector2(16, -14), 200, 22);
        CreateDivider(_sidebarRoot.transform, -40);

        float y = -54f;
        foreach (var e in _entries)
        {
            BuildSidebarRow(e, y);
            y -= 34f;
        }
    }

    private void BuildSidebarRow(RobotEntry e, float y)
    {
        var rowGo = new GameObject("Row_" + e.FocusTransform.gameObject.name, typeof(RectTransform));
        rowGo.transform.SetParent(_sidebarRoot.transform, false);
        var rect = rowGo.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = new Vector2(8, y);
        rect.sizeDelta = new Vector2(244, 28);

        var bg = rowGo.AddComponent<Image>();
        bg.color = new Color(1, 1, 1, 0.03f);
        var btn = rowGo.AddComponent<Button>();
        btn.targetGraphic = bg;
        btn.onClick.AddListener(() => Select(e));

        CreateText(rowGo.transform, "Label", DisplayName(e), 13, FontStyle.Normal, new Color(0.85f, 0.86f, 0.9f), new Vector2(10, -4), 190, 20);

        var iconGo = new GameObject("Icon", typeof(RectTransform));
        iconGo.transform.SetParent(rowGo.transform, false);
        var iconRect = iconGo.GetComponent<RectTransform>();
        iconRect.anchorMin = iconRect.anchorMax = new Vector2(1, 0.5f);
        iconRect.pivot = new Vector2(1, 0.5f);
        iconRect.anchoredPosition = new Vector2(-8, 0);
        iconRect.sizeDelta = new Vector2(16, 16);
        var iconImg = iconGo.AddComponent<Image>();
        iconImg.sprite = _markerSpriteDefault;
        iconImg.raycastTarget = false;

        e.SidebarRowGo = rowGo;
        e.SidebarRowBg = bg;
        e.SidebarIcon = iconImg;
    }

    private void BuildResetCameraButton()
    {
        var go = new GameObject("ResetCameraButton", typeof(RectTransform));
        go.transform.SetParent(_canvas.transform, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 0);
        rect.pivot = new Vector2(0, 0);
        rect.anchoredPosition = new Vector2(20, 20);
        rect.sizeDelta = new Vector2(150, 34);

        var img = go.AddComponent<Image>();
        img.color = _panelColor;
        var btn = go.AddComponent<Button>();
        btn.targetGraphic = img;
        btn.onClick.AddListener(() => { if (_camController != null) _camController.ResetView(); });

        CreateText(go.transform, "Label", "RESET CAMERA", 12, FontStyle.Bold, new Color(0.85f, 0.86f, 0.9f), Vector2.zero, 150, 34, TextAnchor.MiddleCenter);
    }

    // ──────────────────────────────────────────────────────────────
    // 우측 속성 편집 패널
    // ──────────────────────────────────────────────────────────────
    private void BuildPropertyPanel()
    {
        _panelRoot = CreatePanel(_canvas.transform, "RobotInspectorPanel", new Vector2(300, 470));
        var panelRect = _panelRoot.GetComponent<RectTransform>();
        panelRect.anchorMin = panelRect.anchorMax = new Vector2(1, 1);
        panelRect.pivot = new Vector2(1, 1);
        panelRect.anchoredPosition = new Vector2(-20, -20);

        float y = -16f;
        _titleText = CreateText(_panelRoot.transform, "Title", "ROBOT", 18, FontStyle.Bold, _accentColor, new Vector2(16, y), 260, 24);
        y -= 30f;

        CreateDivider(_panelRoot.transform, y); y -= 14f;

        CreateLabel(_panelRoot.transform, "STATUS", new Vector2(16, y));
        _statusText = CreateText(_panelRoot.transform, "StatusValue", "IDLE", 14, FontStyle.Bold, Color.white, new Vector2(150, y), 130, 20, TextAnchor.MiddleRight);
        y -= 26f;

        CreateLabel(_panelRoot.transform, "PROGRESS", new Vector2(16, y));
        _progressText = CreateText(_panelRoot.transform, "ProgressValue", "-", 14, FontStyle.Normal, Color.white, new Vector2(150, y), 130, 20, TextAnchor.MiddleRight);
        y -= 34f;

        var execBtn = CreateButton(_panelRoot.transform, "Execute", new Vector2(16, y), 122, 30, new Color(0.16f, 0.45f, 0.3f));
        execBtn.onClick.AddListener(() => { if (_selected != null) _selected.Task.Execute(); });
        var stopBtn = CreateButton(_panelRoot.transform, "Stop", new Vector2(154, y), 122, 30, new Color(0.45f, 0.18f, 0.18f));
        stopBtn.onClick.AddListener(() => { if (_selected != null) _selected.Task.Stop(); });
        y -= 42f;

        CreateDivider(_panelRoot.transform, y); y -= 14f;

        _loopToggle = CreateToggle(_panelRoot.transform, "Loop Execution", new Vector2(16, y));
        _loopToggle.onValueChanged.AddListener(v => { if (_selected != null) _selected.Task.LoopExecution = v; });
        y -= 30f;

        _pathToggle = CreateToggle(_panelRoot.transform, "Show Path", new Vector2(16, y));
        _pathToggle.onValueChanged.AddListener(v => { if (_selected != null) _selected.Task.ShowPathGizmo = v; });
        y -= 30f;

        _framesToggle = CreateToggle(_panelRoot.transform, "Show Frames", new Vector2(16, y));
        _framesToggle.onValueChanged.AddListener(v => { if (_selected != null) _selected.Task.ShowFrames = v; });
        y -= 38f;

        CreateDivider(_panelRoot.transform, y); y -= 14f;

        CreateLabel(_panelRoot.transform, "SPEED OVERRIDE", new Vector2(16, y));
        _speedValueText = CreateText(_panelRoot.transform, "SpeedValue", "x1.00", 13, FontStyle.Normal, _accentColor, new Vector2(190, y), 90, 20, TextAnchor.MiddleRight);
        y -= 22f;
        _speedSlider = CreateSlider(_panelRoot.transform, new Vector2(16, y), 0.1f, 3f, 1f);
        _speedSlider.onValueChanged.AddListener(v => { if (_selected != null) _selected.Task.SetSpeedOverride(v); });
        y -= 36f;

        CreateLabel(_panelRoot.transform, "GIZMO SCALE", new Vector2(16, y));
        _scaleValueText = CreateText(_panelRoot.transform, "ScaleValue", "1.00", 13, FontStyle.Normal, _accentColor, new Vector2(190, y), 90, 20, TextAnchor.MiddleRight);
        y -= 22f;
        _scaleSlider = CreateSlider(_panelRoot.transform, new Vector2(16, y), 0.2f, 3f, 1f);
        _scaleSlider.onValueChanged.AddListener(v => { if (_selected != null) _selected.Task.GizmoScale = v; });
        y -= 36f;

        CreateDivider(_panelRoot.transform, y); y -= 26f;

        var closeBtn = CreateButton(_panelRoot.transform, "CLOSE", new Vector2(16, y), 268, 28, new Color(0.16f, 0.17f, 0.2f));
        closeBtn.onClick.AddListener(Deselect);
        y -= 40f;

        // 여기부터는 로봇 선택 시마다 동적으로 채워지는 "태스크 세부 설정" 영역.
        // BoltingInspectionTask 등 특정 컴포넌트가 있을 때만 리플렉션으로 필드를 그려 넣는다.
        _basePanelHeight = -y; // 지금까지 쌓은 고정 UI의 총 높이
        _taskDetailRoot = new GameObject("TaskDetailRoot", typeof(RectTransform));
        _taskDetailRoot.transform.SetParent(_panelRoot.transform, false);
        var detailRect = _taskDetailRoot.GetComponent<RectTransform>();
        detailRect.anchorMin = detailRect.anchorMax = new Vector2(0, 1);
        detailRect.pivot = new Vector2(0, 1);
        detailRect.anchoredPosition = new Vector2(0, y);
        detailRect.sizeDelta = Vector2.zero;
    }

    // ──────────────────────────────────────────────────────────────
    // UI 헬퍼
    // ──────────────────────────────────────────────────────────────
    private GameObject CreatePanel(Transform parent, string name, Vector2 size)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.sizeDelta = size;
        var img = go.AddComponent<Image>();
        img.color = _panelColor;
        return go;
    }

    private Text CreateLabel(Transform parent, string label, Vector2 pos)
    {
        return CreateText(parent, label + "Label", label, 11, FontStyle.Normal, new Color(0.55f, 0.57f, 0.62f), pos, 160, 20);
    }

    private Text CreateText(Transform parent, string name, string content, int fontSize, FontStyle style, Color color, Vector2 anchoredPos, float width, float height, TextAnchor anchor = TextAnchor.MiddleLeft)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = anchoredPos;
        rect.sizeDelta = new Vector2(width, height);

        var text = go.AddComponent<Text>();
        text.font = _font;
        text.fontSize = fontSize;
        text.fontStyle = style;
        text.color = color;
        text.text = content;
        text.alignment = anchor;
        return text;
    }

    private void CreateDivider(Transform parent, float y)
    {
        var go = new GameObject("Divider", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = new Vector2(16, y);
        rect.sizeDelta = new Vector2(268, 1.5f);
        var img = go.AddComponent<Image>();
        img.color = new Color(1, 1, 1, 0.08f);
    }

    private Button CreateButton(Transform parent, string label, Vector2 pos, float width, float height, Color bg)
    {
        var go = new GameObject(label + "Button", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(width, height);

        var img = go.AddComponent<Image>();
        img.color = bg;
        var btn = go.AddComponent<Button>();
        btn.targetGraphic = img;

        CreateText(go.transform, "Label", label.ToUpperInvariant(), 12, FontStyle.Bold, Color.white, Vector2.zero, width, height, TextAnchor.MiddleCenter);
        return btn;
    }

    private Toggle CreateToggle(Transform parent, string label, Vector2 pos)
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
        checkImg.color = _accentColor;
        toggle.graphic = checkImg;

        CreateText(go.transform, "Label", label, 13, FontStyle.Normal, new Color(0.85f, 0.86f, 0.9f), new Vector2(26, 0), 220, 22, TextAnchor.MiddleLeft);

        return toggle;
    }

    private Slider CreateSlider(Transform parent, Vector2 pos, float min, float max, float value)
    {
        var go = new GameObject("Slider", typeof(RectTransform));
        go.transform.SetParent(parent, false);
        var rect = go.GetComponent<RectTransform>();
        rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
        rect.pivot = new Vector2(0, 1);
        rect.anchoredPosition = pos;
        rect.sizeDelta = new Vector2(268, 12);

        var slider = go.AddComponent<Slider>();
        slider.minValue = min;
        slider.maxValue = max;

        var bgGo = new GameObject("Background", typeof(RectTransform));
        bgGo.transform.SetParent(go.transform, false);
        var bgRect = bgGo.GetComponent<RectTransform>();
        bgRect.anchorMin = new Vector2(0, 0.3f);
        bgRect.anchorMax = new Vector2(1, 0.7f);
        bgRect.sizeDelta = Vector2.zero;
        bgGo.AddComponent<Image>().color = new Color(1, 1, 1, 0.1f);

        var fillAreaGo = new GameObject("FillArea", typeof(RectTransform));
        fillAreaGo.transform.SetParent(go.transform, false);
        var fillAreaRect = fillAreaGo.GetComponent<RectTransform>();
        fillAreaRect.anchorMin = new Vector2(0, 0.3f);
        fillAreaRect.anchorMax = new Vector2(1, 0.7f);
        fillAreaRect.sizeDelta = Vector2.zero;

        var fillGo = new GameObject("Fill", typeof(RectTransform));
        fillGo.transform.SetParent(fillAreaGo.transform, false);
        var fillRect = fillGo.GetComponent<RectTransform>();
        fillRect.anchorMin = new Vector2(0, 0);
        fillRect.anchorMax = new Vector2(0, 1);
        fillRect.sizeDelta = new Vector2(10, 0);
        fillGo.AddComponent<Image>().color = _accentColor;
        slider.fillRect = fillRect;
        slider.direction = Slider.Direction.LeftToRight;

        var handleAreaGo = new GameObject("HandleArea", typeof(RectTransform));
        handleAreaGo.transform.SetParent(go.transform, false);
        var handleAreaRect = handleAreaGo.GetComponent<RectTransform>();
        handleAreaRect.anchorMin = new Vector2(0, 0);
        handleAreaRect.anchorMax = new Vector2(1, 1);
        handleAreaRect.sizeDelta = Vector2.zero;

        var handleGo = new GameObject("Handle", typeof(RectTransform));
        handleGo.transform.SetParent(handleAreaGo.transform, false);
        var handleRect = handleGo.GetComponent<RectTransform>();
        handleRect.sizeDelta = new Vector2(10, 16);
        handleGo.AddComponent<Image>().color = Color.white;
        slider.targetGraphic = handleGo.GetComponent<Image>();
        slider.handleRect = handleRect;

        slider.value = value;
        return slider;
    }
}
