const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectUrdf:          ()           => ipcRenderer.invoke('select-urdf'),
  selectMeshFolder:    ()           => ipcRenderer.invoke('select-mesh-folder'),
  selectUnityProject:  ()           => ipcRenderer.invoke('select-unity-project'),
  readFile:            (path)       => ipcRenderer.invoke('read-file', path),
  saveRobot:           (data)       => ipcRenderer.invoke('save-robot', data),
  getRobots:           ()           => ipcRenderer.invoke('get-robots'),
  deployRobot:         (name)       => ipcRenderer.invoke('deploy-robot', name),
  getUnityPath:        ()           => ipcRenderer.invoke('get-unity-path'),
  getStagingPath:      ()           => ipcRenderer.invoke('get-staging-path'),
  getWpStagingPath:    ()           => ipcRenderer.invoke('get-wp-staging-path'),
  // workpart
  selectMesh:          ()           => ipcRenderer.invoke('select-mesh'),
  saveWorkpart:        (data)       => ipcRenderer.invoke('save-workpart', data),
  getWorkparts:        ()           => ipcRenderer.invoke('get-workparts'),
  deployWorkpart:      (name)       => ipcRenderer.invoke('deploy-workpart', name),
  // 배포 취소 (flag만 제거, 스테이징 유지)
  cancelDeployRobot:    (name)      => ipcRenderer.invoke('cancel-deploy-robot', name),
  cancelDeployWorkpart: (name)      => ipcRenderer.invoke('cancel-deploy-workpart', name),
  // 스테이징 완전 삭제
  deleteRobot:         (name)       => ipcRenderer.invoke('delete-robot', name),
  deleteWorkpart:      (name)       => ipcRenderer.invoke('delete-workpart', name),
  // 배포 버전 이력 / 롤백
  getRobotHistory:     (name)              => ipcRenderer.invoke('get-robot-history', name),
  rollbackRobot:       (name, versionId)   => ipcRenderer.invoke('rollback-robot', { name, versionId }),
  getWorkpartHistory:  (name)              => ipcRenderer.invoke('get-workpart-history', name),
  rollbackWorkpart:    (name, versionId)   => ipcRenderer.invoke('rollback-workpart', { name, versionId }),
  // 노코드 시퀀스 빌더 — Assets/StreamingAssets/sequences/ 스테이징
  saveSequence:        (fileName, content) => ipcRenderer.invoke('save-sequence', { fileName, content }),
  getSequences:        ()                  => ipcRenderer.invoke('get-sequences'),
  // 디지털 트윈 실시간 데이터
  onTwinData:        (cb) => ipcRenderer.on('twin-data', (_event, data) => cb(data)),
  offTwinData:       ()   => ipcRenderer.removeAllListeners('twin-data'),
  // 트윈 서버 에러 (포트 충돌 등)
  onTwinServerError: (cb) => ipcRenderer.on('twin-server-error', (_event, msg) => cb(msg)),
  offTwinServerError:()   => ipcRenderer.removeAllListeners('twin-server-error'),
  // 연결 설정 (IP/포트)
  getConnectionSettings:  ()      => ipcRenderer.invoke('get-connection-settings'),
  saveConnectionSettings: (data)  => ipcRenderer.invoke('save-connection-settings', data),
});
