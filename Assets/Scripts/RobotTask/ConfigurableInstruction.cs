using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

/// <summary>
/// JSON 파일 한 개로 정의된 다단계 로봇 동작 Instruction.
///
/// 지원 action:
///   ptp           — PTP 이동. target: 씬의 Transform 이름
///   lin           — LIN 이동. target: 씬의 Transform 이름
///   wait          — 대기. seconds: float
///   gripper_open  — 그리퍼 열기
///   gripper_close — 그리퍼 닫기
///   log           — 로그. message: string
///
/// JSON 스키마 예시:
/// {
///   "name": "PickFromConveyor",
///   "steps": [
///     { "action": "ptp",           "target": "PickApproach", "speed": 1.0 },
///     { "action": "lin",           "target": "PickPoint",    "speed": 0.3 },
///     { "action": "gripper_close"                                          },
///     { "action": "wait",          "seconds": 0.5                         },
///     { "action": "lin",           "target": "PickApproach", "speed": 0.3 },
///     { "action": "ptp",           "target": "PlacePoint"                 },
///     { "action": "gripper_open"                                           },
///     { "action": "log",           "message": "사이클 완료"               }
///   ]
/// }
/// </summary>
public class ConfigurableInstruction : Instruction
{
    readonly string _jsonPath;
    readonly GripperEventBridge _gripper;
    readonly string _label;
    SequenceData _data;

    /// <param name="jsonPath">JSON 파일 경로. Assets 기준 상대경로 또는 절대경로.</param>
    /// <param name="gripper">그리퍼 브릿지 (gripper_open/close 사용 시 필요)</param>
    public ConfigurableInstruction(string jsonPath, GripperEventBridge gripper = null)
    {
        _jsonPath = jsonPath;
        _gripper  = gripper;
        _label    = Path.GetFileNameWithoutExtension(jsonPath);
    }

    public override string GetLabel() => $"Cfg:{_label}";

    public override IEnumerator Execute(RobotTask task)
    {
        _data ??= Load();
        if (_data?.steps == null || _data.steps.Count == 0) yield break;

        foreach (var step in _data.steps)
            yield return ExecuteStep(step, task);
    }

    // ── 스텝 실행 ────────────────────────────────────────────────
    IEnumerator ExecuteStep(Step step, RobotTask task)
    {
        switch (step.action.ToLowerInvariant())
        {
            case "ptp":
            {
                var t = FindTarget(step.target, task);
                if (t == null) { WarnMissing("PTP", step.target); yield break; }
                var instr = new PTP(t);
                if (step.speed > 0f)        instr.Speed(step.speed);
                if (ReferenceFrame != null) instr.Frame(ReferenceFrame);
                yield return instr.Execute(task);
                yield break;
            }
            case "lin":
            {
                var t = FindTarget(step.target, task);
                if (t == null) { WarnMissing("LIN", step.target); yield break; }
                var instr = new LIN(t);
                if (step.speed > 0f)        instr.Speed(step.speed);
                if (ReferenceFrame != null) instr.Frame(ReferenceFrame);
                yield return instr.Execute(task);
                yield break;
            }
            case "wait":
                yield return new WaitForSeconds(Mathf.Max(step.seconds, 0.01f));
                yield break;

            case "gripper_open":
                if (_gripper != null) _gripper.Release();
                else Debug.LogWarning($"[{GetLabel()}] gripper_open: GripperEventBridge가 null입니다.");
                yield break;

            case "gripper_close":
                if (_gripper != null) _gripper.Grip();
                else Debug.LogWarning($"[{GetLabel()}] gripper_close: GripperEventBridge가 null입니다.");
                yield break;

            case "log":
                if (!string.IsNullOrEmpty(step.message))
                    Debug.Log($"[{GetLabel()}] {step.message}");
                yield break;

            default:
                Debug.LogWarning($"[ConfigurableInstruction] 알 수 없는 action: '{step.action}'");
                yield break;
        }
    }

    // ── 유틸 ─────────────────────────────────────────────────────
    // 같은 씬에 로봇이 여러 대 있으면 타겟 이름이 겹칠 수 있어, 먼저 이 태스크(로봇) 자신의
    // 자식 계층에서만 찾는다. 못 찾으면 기존 동작(씬 전역 검색)으로 폴백해 기존에 배치된
    // 시퀀스/로봇의 동작을 바꾸지 않는다.
    static Transform FindTarget(string name, RobotTask task)
    {
        if (string.IsNullOrEmpty(name)) return null;

        if (task != null)
        {
            var local = FindChildRecursive(task.transform, name);
            if (local != null) return local;
        }

        return GameObject.Find(name)?.transform;
    }

    static Transform FindChildRecursive(Transform root, string name)
    {
        if (root.name == name) return root;
        foreach (Transform child in root)
        {
            var found = FindChildRecursive(child, name);
            if (found != null) return found;
        }
        return null;
    }

    void WarnMissing(string instr, string name) =>
        Debug.LogWarning($"[{GetLabel()}] {instr}: '{name}' 타겟을 씬에서 찾을 수 없습니다.");

    SequenceData Load()
    {
        var fullPath = Path.IsPathRooted(_jsonPath)
            ? _jsonPath
            : Path.Combine(Application.dataPath, _jsonPath);

        if (!File.Exists(fullPath))
        {
            Debug.LogError($"[ConfigurableInstruction] JSON 없음: {fullPath}");
            return null;
        }

        try   { return JsonUtility.FromJson<SequenceData>(File.ReadAllText(fullPath)); }
        catch (Exception e)
        {
            Debug.LogError($"[ConfigurableInstruction] JSON 파싱 오류: {e.Message}");
            return null;
        }
    }

    // ── JSON 스키마 클래스 ────────────────────────────────────────
    [Serializable]
    class SequenceData
    {
        public string     name;
        public List<Step> steps;
    }

    [Serializable]
    class Step
    {
        public string action  = "";
        public string target  = "";
        public float  speed   = 0f;
        public float  seconds = 0f;
        public string message = "";
    }
}
