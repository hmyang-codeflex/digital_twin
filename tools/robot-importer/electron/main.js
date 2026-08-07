const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let twinServer = null;

const isDev = process.env.NODE_ENV !== 'production';
// ── 배포 타임아웃 (ms) ───────────────────────────────────────────────────────
const DEPLOY_TIMEOUT_MS = 30 * 1000;

// ── 스테이징 폴더 경로 (설정 가능) ──────────────────────────────────────
let unityProjectPath = path.join(__dirname, '../../..');
let stagingPath   = path.join(unityProjectPath, 'Assets/RobotImportStaging');
let wpStagingPath = path.join(unityProjectPath, 'Assets/WorkpartImportStaging');
let sequencesPath = path.join(unityProjectPath, 'Assets/StreamingAssets/sequences');

// ── 연결 설정 (IP/포트, settings.json에 영속화) ────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = { host: '0.0.0.0', port: 5051 };

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(next) {
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
}

let connSettings = loadSettings();

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ── 창 생성 ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f0f2f8',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // 로컬 mesh 파일(file://) 접근 허용
    },
  });

  // 렌더러 콘솔을 메인 프로세스로 전달 (stdout 파이프 끊김 무시)
  mainWindow.webContents.on('console-message', (e, level, msg, line, src) => {
    if (!process.stdout.writable) return;
    const tag = ['V','I','W','E'][level] ?? '?';
    try { process.stdout.write(`[renderer][${tag}] ${msg}  (${src}:${line})\n`); } catch {}
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ensureDir(stagingPath);
  ensureDir(wpStagingPath);
  createWindow();
  startTwinServer();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC 핸들러 ───────────────────────────────────────────────────────────

// URDF 파일 선택
ipcMain.handle('select-urdf', async () => {
  const result = await dialog.showOpenDialog({
    title: 'URDF 파일 선택',
    filters: [{ name: 'URDF', extensions: ['urdf', 'xacro'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// 메쉬 폴더 선택
ipcMain.handle('select-mesh-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: '메쉬 폴더 선택 (STL/DAE 파일이 있는 폴더)',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Unity 프로젝트 경로 설정
ipcMain.handle('select-unity-project', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Unity 프로젝트 폴더 선택',
    properties: ['openDirectory'],
  });
  if (!result.canceled) {
    unityProjectPath = result.filePaths[0];
    stagingPath   = path.join(unityProjectPath, 'Assets/RobotImportStaging');
    wpStagingPath = path.join(unityProjectPath, 'Assets/WorkpartImportStaging');
    sequencesPath = path.join(unityProjectPath, 'Assets/StreamingAssets/sequences');
    ensureDir(stagingPath);
    ensureDir(wpStagingPath);
  }
  return result.canceled ? null : unityProjectPath;
});

// 노코드 시퀀스 빌더 JSON을 Assets/StreamingAssets/sequences/에 직접 저장 (ConfigurableTask가 상대경로로 참조)
ipcMain.handle('save-sequence', (_, { fileName, content }) => {
  try {
    ensureDir(sequencesPath);
    const safeName = path.basename(fileName).replace(/[^A-Za-z0-9_.-]/g, '_');
    const destPath = path.join(sequencesPath, safeName);
    fs.writeFileSync(destPath, content);
    return { ok: true, relativePath: `sequences/${safeName}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 현재 스테이징된 시퀀스 JSON 파일 목록 (ConfigurableTask Sequence Files 등록 참고용)
ipcMain.handle('get-sequences', () => {
  try {
    ensureDir(sequencesPath);
    return fs.readdirSync(sequencesPath)
      .filter(f => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
});

// 파일 읽기 (URDF 텍스트 파싱용)
ipcMain.handle('read-file', async (_, filePath) => {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return null; }
});

// 로봇 스테이징 저장
ipcMain.handle('save-robot', async (_, { name, urdfPath, meshFolder, config }) => {
  try {
    const robotDir = path.join(stagingPath, name);
    ensureDir(robotDir);
    ensureDir(path.join(robotDir, 'meshes'));

    // URDF 복사
    fs.copyFileSync(urdfPath, path.join(robotDir, `${name}.urdf`));

    // 메쉬 폴더 전체 복사
    if (meshFolder && fs.existsSync(meshFolder)) {
      copyDirRecursive(meshFolder, path.join(robotDir, 'meshes'));
    }

    // Flange 설정 저장
    fs.writeFileSync(
      path.join(robotDir, 'config.flange.json'),
      JSON.stringify({ name, urdfPath: `${name}.urdf`, meshFolder: 'meshes', ...config }, null, 2)
    );

    return { ok: true, path: robotDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── 배포 상태 계산 헬퍼 ───────────────────────────────────────────────────
function resolveStatus(donePath, pendingPath) {
  if (fs.existsSync(donePath)) return { status: 'deployed', pendingAt: null };
  if (fs.existsSync(pendingPath)) {
    const pendingAt = fs.statSync(pendingPath).mtimeMs;
    const age = Date.now() - pendingAt;
    return { status: age > DEPLOY_TIMEOUT_MS ? 'failed' : 'pending', pendingAt };
  }
  return { status: 'staged', pendingAt: null };
}

// ── 배포 버전 이력 (파일시스템 스냅샷) ──────────────────────────────────────
// import_done.json이 새로 생성된 시점(= Unity가 프리팹을 완성한 시점)을 감지해
// <stagingDir>/History/<timestamp>/ 에 config + prefab 스냅샷을 남긴다.
function snapshotHistoryIfNewDeploy(entryDir, cfgFileName, doneInfo) {
  const donePath = path.join(entryDir, 'import_done.json');
  if (!doneInfo || !fs.existsSync(donePath)) return;

  const doneMtime = fs.statSync(donePath).mtimeMs;
  const historyDir = path.join(entryDir, 'History');
  ensureDir(historyDir);

  // 이미 같은 done 시각의 스냅샷이 있으면 중복 저장하지 않는다.
  const existing = fs.readdirSync(historyDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const alreadySnapshotted = existing.some(e => {
    const metaPath = path.join(historyDir, e.name, 'meta.json');
    if (!fs.existsSync(metaPath)) return false;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      return meta.doneMtime === doneMtime;
    } catch { return false; }
  });
  if (alreadySnapshotted) return;

  const versionId = String(Math.round(doneMtime));
  const versionDir = path.join(historyDir, versionId);
  ensureDir(versionDir);

  const cfgPath = path.join(entryDir, cfgFileName);
  if (fs.existsSync(cfgPath)) fs.copyFileSync(cfgPath, path.join(versionDir, cfgFileName));

  const prefabPath = doneInfo.prefab
    ? path.join(unityProjectPath, doneInfo.prefab)
    : null;
  let prefabRel = null;
  if (prefabPath && fs.existsSync(prefabPath)) {
    const prefabName = path.basename(prefabPath);
    fs.copyFileSync(prefabPath, path.join(versionDir, prefabName));
    prefabRel = doneInfo.prefab;
  }

  fs.writeFileSync(path.join(versionDir, 'meta.json'), JSON.stringify({
    versionId,
    doneMtime,
    deployedAt: doneInfo.timestamp || doneInfo.importedAt || new Date(doneMtime).toISOString(),
    prefabPath: prefabRel,
  }, null, 2));
}

function readHistory(entryDir) {
  const historyDir = path.join(entryDir, 'History');
  if (!fs.existsSync(historyDir)) return [];
  return fs.readdirSync(historyDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const metaPath = path.join(historyDir, e.name, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.doneMtime - a.doneMtime);
}

function rollbackToVersion(entryDir, cfgFileName, versionId) {
  const versionDir = path.join(entryDir, 'History', versionId);
  const metaPath = path.join(versionDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return { ok: false, error: '버전을 찾을 수 없음' };
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

  const cfgSnapshot = path.join(versionDir, cfgFileName);
  if (fs.existsSync(cfgSnapshot)) {
    fs.copyFileSync(cfgSnapshot, path.join(entryDir, cfgFileName));
  }

  if (meta.prefabPath) {
    const prefabName = path.basename(meta.prefabPath);
    const prefabSnapshot = path.join(versionDir, prefabName);
    const prefabDest = path.join(unityProjectPath, meta.prefabPath);
    if (fs.existsSync(prefabSnapshot)) {
      ensureDir(path.dirname(prefabDest));
      fs.copyFileSync(prefabSnapshot, prefabDest);
    }
  }

  // import_done.json을 롤백 시각으로 갱신해 카탈로그가 'deployed' 상태를 유지하게 한다.
  fs.writeFileSync(path.join(entryDir, 'import_done.json'), JSON.stringify({
    ...meta,
    rolledBackAt: new Date().toISOString(),
    prefab: meta.prefabPath,
  }, null, 2));

  return { ok: true };
}

// 로봇 목록 조회
ipcMain.handle('get-robots', async () => {
  ensureDir(stagingPath);
  const entries = fs.readdirSync(stagingPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const dir         = path.join(stagingPath, e.name);
      const cfgPath     = path.join(dir, 'config.flange.json');
      const donePath    = path.join(dir, 'import_done.json');
      const pendingPath = path.join(dir, 'pending_import.flag');
      const cfg         = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
      const { status, pendingAt } = resolveStatus(donePath, pendingPath);
      if (status === 'deployed') {
        try {
          const doneInfo = JSON.parse(fs.readFileSync(donePath, 'utf-8'));
          snapshotHistoryIfNewDeploy(dir, 'config.flange.json', doneInfo);
        } catch { /* ignore malformed import_done.json */ }
      }
      return { name: e.name, config: cfg, status, pendingAt };
    });
});

// 로봇 배포 이력 조회
ipcMain.handle('get-robot-history', (_, name) => readHistory(path.join(stagingPath, name)));

// 로봇 특정 버전으로 롤백
ipcMain.handle('rollback-robot', (_, { name, versionId }) =>
  rollbackToVersion(path.join(stagingPath, name), 'config.flange.json', versionId));

// Unity로 배포 (pending_import.flag 생성)
ipcMain.handle('deploy-robot', async (_, name) => {
  try {
    const robotDir = path.join(stagingPath, name);
    if (!fs.existsSync(robotDir)) return { ok: false, error: '스테이징 폴더 없음' };
    fs.writeFileSync(path.join(robotDir, 'pending_import.flag'), new Date().toISOString());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 현재 Unity 프로젝트 경로 조회
ipcMain.handle('get-unity-path', () => unityProjectPath);

// 설정 파일 경로 반환 (ModelViewer에서 file:// URL 생성용)
ipcMain.handle('get-staging-path',    () => stagingPath);
ipcMain.handle('get-wp-staging-path', () => wpStagingPath);

// ── 워크파츠 IPC ──────────────────────────────────────────────────────────

// 메쉬 파일 선택 (STL / OBJ / GLTF / GLB / FBX)
ipcMain.handle('select-mesh', async () => {
  const result = await dialog.showOpenDialog({
    title: '메쉬 파일 선택 (STL / OBJ / GLTF / GLB / FBX)',
    filters: [{ name: 'Mesh', extensions: ['stl', 'obj', 'gltf', 'glb', 'fbx'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// 워크파츠 스테이징 저장
ipcMain.handle('save-workpart', async (_, { name, meshPath, config }) => {
  try {
    const wpDir = path.join(wpStagingPath, name);
    ensureDir(wpDir);

    // 메쉬 파일 복사
    const ext = path.extname(meshPath);
    fs.copyFileSync(meshPath, path.join(wpDir, `${name}${ext}`));

    // config.workpart.json 저장
    fs.writeFileSync(
      path.join(wpDir, 'config.workpart.json'),
      JSON.stringify({ name, meshFile: `${name}${ext}`, ...config }, null, 2)
    );

    return { ok: true, path: wpDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 워크파츠 목록 조회
ipcMain.handle('get-workparts', async () => {
  ensureDir(wpStagingPath);
  const entries = fs.readdirSync(wpStagingPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const dir         = path.join(wpStagingPath, e.name);
      const cfgPath     = path.join(dir, 'config.workpart.json');
      const donePath    = path.join(dir, 'import_done.json');
      const pendingPath = path.join(dir, 'pending_import.flag');
      const cfg         = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
      const { status, pendingAt } = resolveStatus(donePath, pendingPath);
      if (status === 'deployed') {
        try {
          const doneInfo = JSON.parse(fs.readFileSync(donePath, 'utf-8'));
          snapshotHistoryIfNewDeploy(dir, 'config.workpart.json', doneInfo);
        } catch { /* ignore malformed import_done.json */ }
      }
      return { name: e.name, config: cfg, status, pendingAt };
    });
});

// 워크파츠 배포 이력 조회
ipcMain.handle('get-workpart-history', (_, name) => readHistory(path.join(wpStagingPath, name)));

// 워크파츠 특정 버전으로 롤백
ipcMain.handle('rollback-workpart', (_, { name, versionId }) =>
  rollbackToVersion(path.join(wpStagingPath, name), 'config.workpart.json', versionId));

// 워크파츠 Unity 배포
ipcMain.handle('deploy-workpart', async (_, name) => {
  try {
    const wpDir = path.join(wpStagingPath, name);
    if (!fs.existsSync(wpDir)) return { ok: false, error: '스테이징 폴더 없음' };
    fs.writeFileSync(path.join(wpDir, 'pending_import.flag'), new Date().toISOString());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 로봇 배포 취소 (pending_import.flag만 제거 → staged로 복귀)
ipcMain.handle('cancel-deploy-robot', async (_, name) => {
  try {
    const flagPath = path.join(stagingPath, name, 'pending_import.flag');
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 워크파츠 배포 취소
ipcMain.handle('cancel-deploy-workpart', async (_, name) => {
  try {
    const flagPath = path.join(wpStagingPath, name, 'pending_import.flag');
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 로봇 스테이징 삭제
ipcMain.handle('delete-robot', async (_, name) => {
  try {
    const robotDir = path.join(stagingPath, name);
    if (!fs.existsSync(robotDir)) return { ok: false, error: '스테이징 폴더 없음' };
    fs.rmSync(robotDir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 워크파츠 스테이징 삭제
ipcMain.handle('delete-workpart', async (_, name) => {
  try {
    const wpDir = path.join(wpStagingPath, name);
    if (!fs.existsSync(wpDir)) return { ok: false, error: '스테이징 폴더 없음' };
    fs.rmSync(wpDir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 연결 설정 조회/저장
ipcMain.handle('get-connection-settings', () => connSettings);

ipcMain.handle('save-connection-settings', async (_, { host, port }) => {
  try {
    connSettings = { host: host || DEFAULT_SETTINGS.host, port: Number(port) || DEFAULT_SETTINGS.port };
    saveSettings(connSettings);
    restartTwinServer();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Unity 디지털 트윈 HTTP 수신 서버 (포트는 settings.json에서 로드) ──────
function restartTwinServer() {
  if (twinServer) {
    twinServer.close();
    twinServer = null;
  }
  startTwinServer();
}

function startTwinServer() {
  const { host, port } = connSettings;
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/twin') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('twin-data', data);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end('{"ok":false,"error":"invalid json"}');
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, host, () => {
    console.log(`[twin-server] listening on ${host}:${port}`);
  });
  server.on('error', (e) => {
    console.error('[twin-server] error:', e.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('twin-server-error', e.message);
    }
  });
  twinServer = server;
}

// ── 유틸 ─────────────────────────────────────────────────────────────────
function copyDirRecursive(src, dest) {
  ensureDir(dest);
  fs.readdirSync(src).forEach(item => {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.lstatSync(s).isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  });
}
