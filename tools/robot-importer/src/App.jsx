import { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar.jsx';
import DashboardPanel from './components/DashboardPanel.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import CatalogPanel from './components/CatalogPanel.jsx';
import WorkpartUploadPanel from './components/WorkpartUploadPanel.jsx';
import WorkpartConfigPanel from './components/WorkpartConfigPanel.jsx';
import WorkpartCatalogPanel from './components/WorkpartCatalogPanel.jsx';
import MonitorPanel from './components/MonitorPanel.jsx';
import LogPanel from './components/LogPanel.jsx';
import AlarmPanel, { DEFAULT_THRESHOLDS } from './components/AlarmPanel.jsx';
import TcpTrailViewer from './components/TcpTrailViewer.jsx';
import RobotViewer from './components/RobotViewer.jsx';
import CombinedViewer from './components/CombinedViewer.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import TeachingExportPanel from './components/TeachingExportPanel.jsx';
import ConnectionSettingsPanel from './components/ConnectionSettingsPanel.jsx';
import SequenceBuilderPanel from './components/SequenceBuilderPanel.jsx';
import GuidePanel from './components/GuidePanel.jsx';

const TAB_META = {
  guide:        { label: '사용 가이드',         section: null },
  dashboard:    { label: '자산 대시보드',       section: null },
  monitor:      { label: '디지털 트윈 모니터', section: null },
  log:          { label: '데이터 분석',         section: null },
  trail:        { label: 'TCP 궤적 3D',         section: null },
  robot3d:      { label: '로봇 3D 뷰어',        section: null },
  combined:     { label: '통합 3D 뷰',          section: null },
  alarm:        { label: '알람',                section: null },
  report:       { label: '세션 리포트',         section: null },
  teaching:     { label: '티칭 시퀀스 추출기', section: null },
  sequence:     { label: '노코드 시퀀스 빌더', section: null },
  connection:   { label: '연결 설정',           section: null },
  import:       { label: '로봇 임포트',         section: 'Robot' },
  config:       { label: 'Flange 설정',         section: 'Robot' },
  catalog:      { label: '로봇 카탈로그',       section: 'Robot' },
  'wp-import':  { label: '워크파츠 임포트',     section: 'Workpart' },
  'wp-config':  { label: '워크파츠 설정',       section: 'Workpart' },
  'wp-catalog': { label: '워크파츠 카탈로그',   section: 'Workpart' },
};

const EMPTY_WP = {
  name: '', meshPath: '', preset: 'pick_place',
  unityLayer: 'Default', unityTag: 'Untagged',
  convexCollider: false,
  physicsMaterial: { staticFriction: 0.6, dynamicFriction: 0.6, bounciness: 0.0 },
  mass: 1.0, isKinematic: true, isStatic: false,
  gripPoints: [],
  suctionPoints: [], suctionCupRadius: 0.04, isFragile: false,
  holePoints: [], detectionSize: { x: 0.05, y: 0.05, z: 0.05 },
  holeCenterOffset: { x: 0, y: 0, z: 0 }, boltMask: 0, showHoleGizmo: true,
  boltTag: '', requirePart: true,
  conveyorSpeed: 0.3, conveyorDir: 'Z+', conveyorFriction: 0.5,
};

const MAX_LOG = 300; // 최대 300 스냅샷 (1초 간격 = 약 5분)
const FOCUS_KEY = 'fm_monitor_focus';

function loadFocus() {
  try { return JSON.parse(localStorage.getItem(FOCUS_KEY) ?? '[]'); }
  catch { return []; }
}

// 트윈 스냅샷 하나에서 focus(선택 오브젝트 이름)에 해당하는 항목만 남긴다. focus가 비어 있으면 원본 그대로.
function filterSnapshot(snap, focus) {
  if (!focus.length) return snap;
  const keep = arr => arr?.filter(o => focus.includes(o.name));
  return {
    ...snap,
    robots:    keep(snap.robots),
    conveyors: keep(snap.conveyors),
    sensors:   keep(snap.sensors),
    grippers:  keep(snap.grippers),
    parts:     keep(snap.parts),
  };
}

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [robotDraft, setRobotDraft] = useState({ name: '', urdfPath: '', meshFolder: '', joints: [] });
  const [wpDraft, setWpDraft]       = useState(EMPTY_WP);

  // ── 디지털 트윈 전역 상태 ─────────────────────────────────────
  const [twinPayload,    setTwinPayload]    = useState(null);
  const [twinConnected,  setTwinConnected]  = useState(false);
  const [twinLog,        setTwinLog]        = useState([]);
  const [eventHistory,   setEventHistory]   = useState([]);
  const [twinServerError,setTwinServerError]= useState('');
  const connTimerRef = useRef(null);

  // ── 사이클 타임 트래커 ────────────────────────────────────────
  const [cycleLog, setCycleLog]      = useState([]);
  const prevRobotStatusRef           = useRef({});
  const cycleStartRef                = useRef({});

  // ── 스텝별(픽/경유/플레이스) 사이클 타임 트래커 ─────────────────
  // RobotTask.MarkStep()으로 표시된 currentStep이 바뀌는 시점마다 이전 단계의 소요시간을 기록
  const [stepLog, setStepLog]        = useState([]);
  const prevRobotStepRef             = useRef({});
  const stepStartRef                 = useRef({});

  // ── 재시도(재작업) 이력 트래커 ───────────────────────────────────
  // RobotTask.retryAttempt가 0→1(재시도 시작) 또는 N→N+1(재시도 반복)로 바뀌는 시점을 기록.
  // "볼트 실패 → 재시도" 같은 재작업이 얼마나 자주 발생하는지 공정 분석 지표로 쓰기 위함.
  const [retryLog, setRetryLog]      = useState([]);
  const prevRobotRetryRef            = useRef({});

  // ── 알람 ─────────────────────────────────────────────────────
  const [thresholds, setThresholds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fm_thresholds') ?? 'null') ?? { ...DEFAULT_THRESHOLDS }; }
    catch { return { ...DEFAULT_THRESHOLDS }; }
  });
  const [activeAlarms,  setActiveAlarmsState] = useState({});
  const [alarmHistory,  setAlarmHistory]       = useState([]);
  // ref: updater 밖에서 최신 activeAlarms를 읽기 위한 캐시 (anti-pattern 방지)
  const activeAlarmsRef = useRef({});
  useEffect(() => { activeAlarmsRef.current = activeAlarms; }, [activeAlarms]);

  function setActiveAlarms(next) {
    activeAlarmsRef.current = next;
    setActiveAlarmsState(next);
  }

  function handleThresholdsChange(next) {
    setThresholds(next);
    localStorage.setItem('fm_thresholds', JSON.stringify(next));
  }

  function acknowledgeAlarm(akey) {
    const alarm = activeAlarmsRef.current[akey];
    if (!alarm || alarm.acknowledged) return;
    const now = Date.now();
    const updated = { ...alarm, acknowledged: true, acknowledgedAt: now };
    setActiveAlarms({ ...activeAlarmsRef.current, [akey]: updated });
    setAlarmHistory(h => h.map(a => a.id === alarm.id ? { ...a, acknowledged: true, acknowledgedAt: now } : a));
  }

  function acknowledgeAll() {
    const now = Date.now();
    const next = { ...activeAlarmsRef.current };
    const ids  = [];
    Object.entries(next).forEach(([k, a]) => {
      if (!a.acknowledged) { next[k] = { ...a, acknowledged: true, acknowledgedAt: now }; ids.push(a.id); }
    });
    if (!ids.length) return;
    setActiveAlarms(next);
    setAlarmHistory(h => h.map(a => ids.includes(a.id) ? { ...a, acknowledged: true, acknowledgedAt: now } : a));
  }

  // 새 페이로드 또는 임계값 변경 시 재평가 (ref로 읽어 updater 내 side-effect 제거)
  useEffect(() => {
    if (!twinPayload) return;
    const prev = activeAlarmsRef.current;
    const now  = Date.now();
    const next = { ...prev };
    let changed = false;
    const newItems    = [];
    const resolvedIds = [];

    twinPayload.robots?.forEach(r => {
      const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
      const checks = [
        { key: 'temp',   label: '온도', value: r.temperatureC, warn: t.tempWarn,   danger: t.tempDanger,   unit: '°C' },
        { key: 'power',  label: '전력', value: r.powerW,       warn: t.powerWarn,  danger: t.powerDanger,  unit: 'W'  },
        { key: 'torque', label: '토크', value: r.torqueNm,     warn: t.torqueWarn, danger: t.torqueDanger, unit: 'Nm' },
      ];

      checks.forEach(({ key, label, value, warn, danger, unit }) => {
        const akey     = `${r.name}__${key}`;
        const level    = value >= danger ? 'danger' : value >= warn ? 'warning' : null;
        const existing = prev[akey];

        if (level) {
          if (!existing) {
            const alarm = { id: `${now}-${akey}`, ts: now, robotName: r.name, key, label, value, threshold: level === 'danger' ? danger : warn, level, unit, acknowledged: false, acknowledgedAt: null };
            next[akey] = alarm;
            newItems.push({ ...alarm });
            changed = true;
          } else {
            const escalated  = existing.level === 'warning' && level === 'danger';
            const newThresh  = level === 'danger' ? danger : warn;
            const needUpdate = existing.value !== value || existing.level !== level;
            if (needUpdate) {
              next[akey] = {
                ...existing, value, level, threshold: newThresh,
                // 경고 → 위험 격상 시 acknowledged 초기화 (재알림)
                ...(escalated ? { acknowledged: false, acknowledgedAt: null } : {}),
              };
              changed = true;
            }
          }
        } else if (existing) {
          resolvedIds.push(existing.id);
          delete next[akey];
          changed = true;
        }
      });
    });

    if (changed)            setActiveAlarms(next);
    if (newItems.length)    setAlarmHistory(h => [...newItems, ...h].slice(0, 100));
    if (resolvedIds.length) setAlarmHistory(h => h.map(a => resolvedIds.includes(a.id) ? { ...a, resolvedAt: now } : a));
  }, [twinPayload, thresholds]);

  // 로봇 Run↔Idle 전환 감지 → 사이클 타임 측정
  useEffect(() => {
    if (!twinPayload) return;
    const now = Date.now();
    const newCycles = [];
    twinPayload.robots?.forEach(r => {
      const prev = prevRobotStatusRef.current[r.name];
      if (prev !== 'Run' && r.status === 'Run') {
        cycleStartRef.current[r.name] = now;
      } else if (prev === 'Run' && r.status !== 'Run') {
        const start = cycleStartRef.current[r.name];
        if (start) {
          newCycles.push({ robotName: r.name, start, end: now, durationMs: now - start });
          delete cycleStartRef.current[r.name];
        }
      }
      prevRobotStatusRef.current[r.name] = r.status;
    });
    if (newCycles.length) setCycleLog(prev => [...newCycles, ...prev].slice(0, 500));
  }, [twinPayload]);

  // 로봇의 currentStep(픽/경유/플레이스 등)이 바뀌는 시점마다 이전 단계 소요시간을 기록
  useEffect(() => {
    if (!twinPayload) return;
    const now = Date.now();
    const newSteps = [];
    twinPayload.robots?.forEach(r => {
      const prevStep = prevRobotStepRef.current[r.name];
      const step = r.currentStep || '';
      if (step !== prevStep) {
        // 이전 단계가 있었다면 종료 기록
        if (prevStep) {
          const start = stepStartRef.current[r.name];
          if (start) {
            newSteps.push({ robotName: r.name, step: prevStep, start, end: now, durationMs: now - start });
          }
        }
        // 새 단계 시작 (빈 문자열이면 사이클이 끝난 것이므로 시작하지 않음)
        if (step) stepStartRef.current[r.name] = now;
        else delete stepStartRef.current[r.name];
        prevRobotStepRef.current[r.name] = step;
      }
    });
    if (newSteps.length) setStepLog(prev => [...newSteps, ...prev].slice(0, 1000));
  }, [twinPayload]);

  // 로봇의 retryAttempt가 증가하는 시점(재시도 발생)을 기록 — VerifyRetryInstruction 등이
  // 검사 실패로 픽부터 재작업할 때마다 1건씩 쌓여, 재작업 빈도를 공정 분석 지표로 쓸 수 있게 함
  useEffect(() => {
    if (!twinPayload) return;
    const now = Date.now();
    const newRetries = [];
    twinPayload.robots?.forEach(r => {
      const prevAttempt = prevRobotRetryRef.current[r.name] ?? 0;
      const attempt = r.retryAttempt ?? 0;
      if (attempt > prevAttempt) {
        // r.currentStep은 재시도 시작 프레임에는 아직 갱신 전(빈 값)일 수 있어, 방금 스텝
        // 감지 useEffect가 갱신한 prevRobotStepRef(직전까지 실행 중이던 스텝)를 우선 사용
        const step = prevRobotStepRef.current[r.name] || r.currentStep || '';
        newRetries.push({ robotName: r.name, attempt, ts: now, step });
      }
      prevRobotRetryRef.current[r.name] = attempt;
    });
    if (newRetries.length) setRetryLog(prev => [...newRetries, ...prev].slice(0, 500));
  }, [twinPayload]);

  useEffect(() => {
    window.electronAPI?.onTwinServerError(msg => setTwinServerError(msg));
    return () => window.electronAPI?.offTwinServerError();
  }, []);

  useEffect(() => {
    const cb = (data) => {
      setTwinPayload(data);
      setTwinConnected(true);
      setTwinLog(prev => [...prev, { ...data, _ts: Date.now() }].slice(-MAX_LOG));
      if (data.events?.length > 0) {
        setEventHistory(prev => [...data.events, ...prev].slice(0, 50));
      }
      clearTimeout(connTimerRef.current);
      connTimerRef.current = setTimeout(() => setTwinConnected(false), 3000);
    };
    window.electronAPI?.onTwinData(cb);
    return () => {
      window.electronAPI?.offTwinData();
      clearTimeout(connTimerRef.current);
    };
  }, []);

  // ── 관심 오브젝트 선택 (모니터 + 데이터 분석/리포트가 공유) ─────
  const [focus, setFocus] = useState(loadFocus);
  useEffect(() => { localStorage.setItem(FOCUS_KEY, JSON.stringify(focus)); }, [focus]);

  const allNames = useMemo(() => {
    const names = new Set();
    twinLog.forEach(snap => {
      snap.robots?.forEach(r => names.add(r.name));
      snap.conveyors?.forEach(c => names.add(c.name));
      snap.sensors?.forEach(s => names.add(s.name));
      snap.grippers?.forEach(g => names.add(g.name));
      snap.parts?.forEach(p => names.add(p.name));
    });
    return [...names].sort();
  }, [twinLog]);

  function toggleFocus(name) {
    setFocus(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }
  function clearFocus() { setFocus([]); }

  // 모니터(실시간)와 데이터 분석/리포트(누적 로그) 모두 같은 focus로 필터링해 전달
  const focusedTwinPayload = useMemo(() => twinPayload ? filterSnapshot(twinPayload, focus) : twinPayload, [twinPayload, focus]);
  const focusedTwinLog     = useMemo(() => focus.length ? twinLog.map(s => filterSnapshot(s, focus)) : twinLog, [twinLog, focus]);
  const focusedStepLog     = useMemo(() => focus.length ? stepLog.filter(s => focus.includes(s.robotName)) : stepLog, [stepLog, focus]);
  const focusedRetryLog    = useMemo(() => focus.length ? retryLog.filter(r => focus.includes(r.robotName)) : retryLog, [retryLog, focus]);

  const { label, section } = TAB_META[tab] ?? { label: tab, section: null };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar activeTab={tab} onTabChange={setTab} alarmCount={Object.values(activeAlarms).filter(a => !a.acknowledged).length} />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* ── 헤더 ──────────────────────────────────────────── */}
        <header style={{
          height: 48,
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}>
          {section && (
            <>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{section}</span>
              <span style={{ fontSize: 16, color: 'var(--text-faint)', lineHeight: 1, marginBottom: 1 }}>/</span>
            </>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        </header>

        {/* ── 트윈 서버 에러 배너 ─────────────────────────── */}
        {twinServerError && (
          <div style={{
            padding: '7px 20px', background: '#fee2e2', borderBottom: '1px solid #fca5a5',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, color: '#991b1b', flex: 1 }}>
              ⚠ 디지털 트윈 서버 오류 (포트 5051): {twinServerError}
            </span>
            <button
              onClick={() => setTwinServerError('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#991b1b', padding: '0 4px' }}
            >✕</button>
          </div>
        )}

        {/* ── 탭 콘텐츠 ─────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {tab === 'guide' && (
            <GuidePanel onNavigate={setTab} />
          )}
          {tab === 'dashboard' && (
            <DashboardPanel
              onNavigate={setTab}
              twinPayload={twinPayload}
              twinConnected={twinConnected}
              activeAlarms={activeAlarms}
              cycleLog={cycleLog}
              sessionStart={twinLog[0]?._ts ?? null}
            />
          )}
          {tab === 'monitor'   && (
            <MonitorPanel
              payload={twinPayload}
              connected={twinConnected}
              eventHistory={eventHistory}
              activeAlarms={activeAlarms}
              focus={focus}
              allNames={allNames}
              onToggleFocus={toggleFocus}
              onClearFocus={clearFocus}
            />
          )}
          {tab === 'log' && (
            <LogPanel
              log={focusedTwinLog}
              connected={twinConnected}
              cycleLog={cycleLog}
              stepLog={focusedStepLog}
              retryLog={focusedRetryLog}
              alarmHistory={alarmHistory}
              focus={focus}
              onClearFocus={clearFocus}
            />
          )}
          {tab === 'trail' && (
            <TcpTrailViewer
              log={twinLog}
              connected={twinConnected}
            />
          )}
          {tab === 'robot3d' && (
            <RobotViewer
              log={twinLog}
              connected={twinConnected}
            />
          )}
          {tab === 'combined' && (
            <CombinedViewer
              log={twinLog}
              connected={twinConnected}
            />
          )}
          {tab === 'alarm' && (
            <AlarmPanel
              activeAlarms={activeAlarms}
              alarmHistory={alarmHistory}
              thresholds={thresholds}
              onThresholdsChange={handleThresholdsChange}
              onAcknowledge={acknowledgeAlarm}
              onAcknowledgeAll={acknowledgeAll}
            />
          )}
          {tab === 'report' && (
            <ReportPanel
              log={focusedTwinLog}
              cycleLog={cycleLog}
              stepLog={focusedStepLog}
              retryLog={focusedRetryLog}
              alarmHistory={alarmHistory}
              focus={focus}
              onClearFocus={clearFocus}
            />
          )}
          {tab === 'teaching' && (
            <TeachingExportPanel twinLog={twinLog} />
          )}
          {tab === 'sequence' && (
            <SequenceBuilderPanel twinLog={twinLog} />
          )}
          {tab === 'connection' && (
            <ConnectionSettingsPanel />
          )}

          {tab === 'import'  && <UploadPanel draft={robotDraft} onChange={setRobotDraft} onNext={() => setTab('config')} />}
          {tab === 'config'  && <ConfigPanel draft={robotDraft} onChange={setRobotDraft} onSaved={() => setTab('catalog')} />}
          {tab === 'catalog' && <CatalogPanel onEditRobot={(r) => {
            setRobotDraft({
              name: r.name,
              urdfPath:   r.config?.urdfPath   ?? '',
              meshFolder: r.config?.meshFolder  ?? '',
              joints:     r.config?.jointLimits ?? [],
              ...r.config,
            });
            setTab('config');
          }} />}

          {tab === 'wp-import'  && <WorkpartUploadPanel draft={wpDraft} onChange={setWpDraft} onNext={() => setTab('wp-config')} />}
          {tab === 'wp-config'  && <WorkpartConfigPanel draft={wpDraft} onChange={setWpDraft} onSaved={() => setTab('wp-catalog')} />}
          {tab === 'wp-catalog' && <WorkpartCatalogPanel onEditWorkpart={(wp) => {
            setWpDraft({ ...EMPTY_WP, ...wp });
            setTab('wp-config');
          }} />}
        </div>
      </main>
    </div>
  );
}
