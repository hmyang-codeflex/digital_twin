using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// 에디터 Play 모드에서 Scene 뷰 카메라의 위치/회전을 이 카메라에 실시간 복사.
/// Scene 뷰에서 움직이는 그대로 Game 뷰에도 동일하게 보임.
/// 에디터 전용 — 빌드된 실행 파일에는 Scene 뷰가 없어 동작하지 않음 (CameraController.cs로 별도 처리 필요).
/// </summary>
public class SceneViewCameraSync : MonoBehaviour
{
#if UNITY_EDITOR
    void Update()
    {
        var sceneView = SceneView.lastActiveSceneView;
        if (sceneView == null || sceneView.camera == null) return;

        transform.position = sceneView.camera.transform.position;
        transform.rotation = sceneView.camera.transform.rotation;
    }
#endif
}
