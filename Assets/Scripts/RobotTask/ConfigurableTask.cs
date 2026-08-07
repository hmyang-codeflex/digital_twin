using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// JSON 시퀀스 파일 목록으로 로봇 동작을 정의하는 코드리스 RobotTask.
/// Inspector에서 파일 경로와 그리퍼를 설정하면 C# 코드 없이 새 동작을 추가할 수 있습니다.
///
/// 사용 방법:
///   1. 이 컴포넌트를 로봇 GameObject에 추가
///   2. Controller 슬롯에 Preliy.Flange Controller 연결
///   3. Sequence Files에 JSON 파일 경로 추가 (Assets 기준 상대경로)
///   4. (그리퍼 사용 시) Gripper 슬롯에 GripperEventBridge 연결
///   5. Play 모드에서 Inspector ContextMenu → Execute 또는 _autoStart 체크
///
/// JSON 스키마: Assets/StreamingAssets/sequences/ 폴더 권장
/// {
///   "name": "시퀀스 이름",
///   "steps": [
///     { "action": "ptp",           "target": "타겟이름", "speed": 1.0 },
///     { "action": "lin",           "target": "타겟이름", "speed": 0.3 },
///     { "action": "gripper_close"                                      },
///     { "action": "wait",          "seconds": 0.5                     },
///     { "action": "gripper_open"                                       },
///     { "action": "log",           "message": "완료"                  }
///   ]
/// }
/// </summary>
public class ConfigurableTask : RobotTask
{
    [Header("시퀀스 JSON 파일 (순서대로 실행)")]
    [Tooltip("Assets 기준 상대경로. 예: sequences/pick.json\n절대경로도 허용됩니다.")]
    [SerializeField] private List<string> _sequenceFiles = new();

    [Header("그리퍼 (gripper_open / gripper_close 사용 시 연결)")]
    [SerializeField] private GripperEventBridge _gripper;

    protected override void Program()
    {
        if (Controller == null)
        {
            if (!IsPreviewBuild)
                Debug.LogError("[ConfigurableTask] Controller가 연결되지 않았습니다.", this);
            return;
        }

        if (_sequenceFiles == null || _sequenceFiles.Count == 0)
        {
            if (!IsPreviewBuild)
                Debug.LogWarning("[ConfigurableTask] Sequence Files가 비어 있습니다.", this);
            return;
        }

        foreach (var path in _sequenceFiles)
        {
            if (string.IsNullOrWhiteSpace(path)) continue;
            this.Move(new ConfigurableInstruction(path, _gripper));
        }
    }
}
