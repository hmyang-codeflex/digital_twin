import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Rocket, Box, Clock, CheckCircle2, AlertCircle,
  FolderOpen, Trash2, UploadCloud, Zap, ChevronRight, XCircle, RotateCcw,
  Activity, Bell, Timer,
} from 'lucide-react';

const STATUS_CONFIG = {
  deployed: { label: '배포됨',   bg: '#dcfce7', color: '#16a34a', icon: CheckCircle2 },
  pending:  { label: '배포 중',  bg: '#fef9c3', color: '#ca8a04', icon: Clock        },
  failed:   { label: '타임아웃', bg: '#fee2e2', color: '#dc2626', icon: AlertCircle  },
  staged:   { label: '스테이징', bg: 'var(--bg-hover)', color: 'var(--text-sub)', icon: Box },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.staged;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function ElapsedBadge({ pendingAt, now }) {
  const secs = pendingAt ? Math.floor((now - pendingAt) / 1000) : 0;
  return (
    <span style={{ fontSize: 11, color: '#ca8a04', fontVariantNumeric: 'tabular-nums' }}>
      {secs}초 대기 중
    </span>
  );
}

function Pip({ color, text }) {
  return (
    <span style={{ fontSize: 10.5, color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {text}
    </span>
  );
}

function StatCard({ label, total, deployed, pending, failed = 0, color, icon: Icon }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '18px 20px',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `linear-gradient(135deg, ${color}20 0%, ${color}0a 100%)`,
          border: `1px solid ${color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={color} strokeWidth={1.8} />
        </div>
      </div>

      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em' }}>
        {total}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <Pip color="#059669" text={`${deployed} 배포됨`} />
        {pending > 0 && <Pip color="#d97706" text={`${pending} 대기중`} />}
        {failed  > 0 && <Pip color="#dc2626" text={`${failed} 실패`} />}
        {(total - deployed - pending - failed) > 0 && (
          <Pip color="var(--text-faint)" text={`${total - deployed - pending - failed} 스테이징`} />
        )}
      </div>
    </div>
  );
}

// ── 액션 셀 ──────────────────────────────────────────────────────────────────
function ActionCell({ asset, isDepl, isCancel, isDel, cancelErr, onDeploy, onCancel, onRemove }) {
  const isBusy = isDepl || isCancel || isDel;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      {cancelErr && (
        <span style={{ fontSize: 11, color: '#dc2626', maxWidth: 150, textAlign: 'right', lineHeight: 1.3 }}>
          ⚠ {cancelErr}
        </span>
      )}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>

        {/* staged / deployed */}
        {(asset.status === 'staged' || asset.status === 'deployed') && (
          <button
            onClick={onDeploy} disabled={isBusy}
            title={asset.status === 'deployed' ? '재배포' : 'Unity로 배포'}
            className={asset.status === 'deployed' ? 'btn-ghost' : 'btn-primary'}
            style={{ fontSize: 12, height: 30, padding: '0 10px', opacity: isBusy ? 0.55 : 1 }}
          >
            {isDepl
              ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <UploadCloud size={11} />}
            {asset.status === 'deployed' ? '재배포' : '배포'}
          </button>
        )}

        {/* pending: 스피너 + 취소 */}
        {asset.status === 'pending' && (
          <>
            <RefreshCw size={12} color="var(--warning)" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <button
              onClick={onCancel} disabled={isCancel}
              title="배포 취소"
              className="btn-ghost"
              style={{ fontSize: 12, height: 30, padding: '0 10px', color: 'var(--warning)', borderColor: '#f0c060', opacity: isCancel ? 0.55 : 1 }}
            >
              {isCancel
                ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <XCircle size={11} />}
              취소
            </button>
          </>
        )}

        {/* failed: 재시도 + 취소 */}
        {asset.status === 'failed' && (
          <>
            <button
              onClick={onDeploy} disabled={isBusy}
              title="다시 배포 시도"
              className="btn-primary"
              style={{ fontSize: 12, height: 30, padding: '0 10px', opacity: isBusy ? 0.55 : 1 }}
            >
              {isDepl
                ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <RotateCcw size={11} />}
              재시도
            </button>
            <button
              onClick={onCancel} disabled={isCancel}
              title="배포 취소"
              className="btn-danger"
              style={{ fontSize: 12, height: 30, padding: '0 10px', opacity: isCancel ? 0.55 : 1 }}
            >
              {isCancel
                ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <XCircle size={11} />}
              취소
            </button>
          </>
        )}

        {/* 삭제 (pending 중에는 비활성) */}
        <button
          onClick={onRemove}
          disabled={isBusy || asset.status === 'pending'}
          title={asset.status === 'pending' ? '배포 중에는 삭제할 수 없습니다' : '스테이징에서 영구 삭제'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-card)', flexShrink: 0,
            cursor: isBusy || asset.status === 'pending' ? 'default' : 'pointer',
            opacity: isBusy || asset.status === 'pending' ? 0.3 : 1,
          }}
        >
          <Trash2 size={11} color="var(--text-muted)" />
        </button>

      </div>
    </div>
  );
}

// ── 트윈 KPI 카드 ─────────────────────────────────────────────────────────────
function TwinKPI({ label, value, icon, accentColor, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        minWidth: 100, padding: '10px 14px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon}
        <span style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.02em' }}>{label}</span>
      </div>
      <span style={{ fontSize: 20, fontWeight: 800, color: accentColor ?? 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardPanel({ onNavigate, twinPayload = null, twinConnected = false, activeAlarms = {}, cycleLog = [], sessionStart = null }) {
  const [robots,       setRobots]       = useState([]);
  const [workparts,    setWorkparts]    = useState([]);
  const [unityPath,    setUnityPath]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [now,          setNow]          = useState(Date.now());
  const [deploying,    setDeploying]    = useState(new Set());
  const [canceling,    setCanceling]    = useState(new Set());
  const [deleting,     setDeleting]     = useState(new Set());
  const [cancelErrors, setCancelErrors] = useState({});

  const load = useCallback(async () => {
    const [r, w, p] = await Promise.all([
      window.electronAPI.getRobots(),
      window.electronAPI.getWorkparts(),
      window.electronAPI.getUnityPath(),
    ]);
    setRobots(r ?? []);
    setWorkparts(w ?? []);
    setUnityPath(p ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // pending 있을 때만 2초 폴링
  useEffect(() => {
    const hasPending = [...robots, ...workparts].some(a => a.status === 'pending');
    if (!hasPending) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [robots, workparts, load]);

  // pending 있을 때 1초 tick (경과시간 표시용)
  useEffect(() => {
    const hasPending = [...robots, ...workparts].some(a => a.status === 'pending');
    if (!hasPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [robots, workparts]);

  // ── 배포 ──────────────────────────────────────────────────────────────────
  const deploy = async (type, name) => {
    const key = `${type}:${name}`;
    setDeploying(s => new Set(s).add(key));
    try {
      if (type === 'robot') await window.electronAPI.deployRobot(name);
      else                  await window.electronAPI.deployWorkpart(name);
    } finally {
      await load();
      setDeploying(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const deployAll = async () => {
    const targets = [
      ...robots.filter(r => r.status === 'staged').map(r => ({ type: 'robot',    name: r.name })),
      ...workparts.filter(w => w.status === 'staged').map(w => ({ type: 'workpart', name: w.name })),
    ];
    await Promise.all(targets.map(({ type, name }) => deploy(type, name)));
  };

  // ── 배포 취소 ──────────────────────────────────────────────────────────────
  const cancelDeploy = async (type, name) => {
    const key = `${type}:${name}`;
    setCanceling(s => new Set(s).add(key));
    setCancelErrors(e => { const n = { ...e }; delete n[key]; return n; });
    try {
      const api = type === 'robot'
        ? window.electronAPI.cancelDeployRobot
        : window.electronAPI.cancelDeployWorkpart;
      if (typeof api !== 'function') {
        throw new Error('앱을 재시작해야 합니다 (IPC 미로드)');
      }
      const result = await api(name);
      if (result && !result.ok) throw new Error(result.error ?? '알 수 없는 오류');
    } catch (e) {
      setCancelErrors(prev => ({ ...prev, [key]: e.message }));
    } finally {
      await load();
      setCanceling(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const remove = async (type, name) => {
    if (!window.confirm(`'${name}'을(를) 스테이징에서 영구 삭제하시겠습니까?`)) return;
    const key = `${type}:${name}`;
    setDeleting(s => new Set(s).add(key));
    try {
      if (type === 'robot') await window.electronAPI.deleteRobot(name);
      else                  await window.electronAPI.deleteWorkpart(name);
    } finally {
      await load();
      setDeleting(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  // ── 통계 ──────────────────────────────────────────────────────────────────
  const stats = (list) => ({
    total:    list.length,
    deployed: list.filter(a => a.status === 'deployed').length,
    pending:  list.filter(a => a.status === 'pending').length,
    failed:   list.filter(a => a.status === 'failed').length,
  });
  const robotStats    = stats(robots);
  const wpStats       = stats(workparts);
  const allPending    = robotStats.pending + wpStats.pending;
  const allFailed     = robotStats.failed  + wpStats.failed;
  const allDeployable = robots.filter(r => r.status === 'staged').length +
                        workparts.filter(w => w.status === 'staged').length;

  const allAssets = [
    ...robots.map(r => ({ ...r, assetType: 'robot',    typeLabel: 'ROBOT',    color: '#37352f', subLabel: r.config?.solverType ?? '—' })),
    ...workparts.map(w => ({ ...w, assetType: 'workpart', typeLabel: 'WORKPART', color: '#37352f', subLabel: w.config?.preset ?? '—' })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const changeUnityPath = async () => { await window.electronAPI.selectUnityProject(); await load(); };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', height: '100%' }}>
      <RefreshCw size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13 }}>로딩 중…</span>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px 48px' }}>

        {/* 페이지 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.03em' }}>
              자산 대시보드
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <FolderOpen size={11} color="var(--text-faint)" />
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                {unityPath || '(Unity 프로젝트 경로 미설정)'}
              </span>
              <button onClick={changeUnityPath} style={{
                fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)',
                border: 'none', cursor: 'pointer',
                padding: '2px 8px', borderRadius: 4, fontWeight: 600, height: 'auto',
              }}>
                변경
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={load} className="btn-ghost" style={{ fontSize: 13 }}>
              <RefreshCw size={14} /> 새로고침
            </button>
            {allDeployable > 0 && (
              <button onClick={deployAll} className="btn-primary" style={{ fontSize: 13 }}>
                <Zap size={14} /> 전체 배포 ({allDeployable})
              </button>
            )}
          </div>
        </div>

        {/* ── 디지털 트윈 현황 ─────────────────────────────────── */}
        {(twinPayload || sessionStart) && (() => {
          const activeRobotCount = twinPayload?.robots?.filter(r => r.status === 'Run').length ?? 0;
          const totalRobotCount  = twinPayload?.robots?.length ?? 0;
          const activeAlarmCount = Object.values(activeAlarms).filter(a => !a.acknowledged).length;
          const sessionDuration  = sessionStart ? (() => {
            const sec = Math.floor((Date.now() - sessionStart) / 1000);
            return `${Math.floor(sec / 60)}m ${sec % 60}s`;
          })() : null;
          const recentCycles = cycleLog.slice(0, 4);
          const recentEvents = twinPayload?.events?.slice(0, 4) ?? [];
          return (
            <div style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '16px 20px', marginBottom: 20,
              boxShadow: 'var(--shadow-sm)',
            }}>
              {/* 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: twinConnected ? '#10b981' : 'var(--text-faint)',
                  boxShadow: twinConnected ? '0 0 8px rgba(16,185,129,0.45)' : 'none',
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                  디지털 트윈 현황
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: twinConnected ? '#10b981' : 'var(--text-faint)' }}>
                  {twinConnected ? '실시간 수신 중' : '연결 끊김'}
                </span>
              </div>

              {/* KPI 카드 행 */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <TwinKPI
                  label="활성 로봇"
                  value={`${activeRobotCount} / ${totalRobotCount}`}
                  icon={<Activity size={13} color="#6e8efb" />}
                  accentColor="#6e8efb"
                  onClick={() => onNavigate('monitor')}
                />
                <TwinKPI
                  label="확인 필요 알람"
                  value={String(activeAlarmCount)}
                  icon={<Bell size={13} color={activeAlarmCount > 0 ? '#e05252' : 'var(--text-faint)'} />}
                  accentColor={activeAlarmCount > 0 ? '#e05252' : undefined}
                  onClick={() => onNavigate('alarm')}
                />
                {sessionDuration && (
                  <TwinKPI
                    label="세션 시간"
                    value={sessionDuration}
                    icon={<Timer size={13} color="var(--text-muted)" />}
                  />
                )}
                {cycleLog.length > 0 && (
                  <TwinKPI
                    label="측정 사이클"
                    value={`${cycleLog.length}회`}
                    icon={<RefreshCw size={13} color="#50c8a8" />}
                    accentColor="#50c8a8"
                    onClick={() => onNavigate('log')}
                  />
                )}

                {/* 최근 이벤트 */}
                {(recentEvents.length > 0 || recentCycles.length > 0) && (
                  <div style={{
                    flex: 1, minWidth: 200,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6 }}>최근 이벤트</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recentEvents.map((ev, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: ev.type === 'grip' ? '#50c8a8' : '#f5a623', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.robot} — {ev.type}
                          </span>
                        </div>
                      ))}
                      {recentCycles.map((c, i) => (
                        <div key={`c${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6e8efb', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.robotName} 사이클 {(c.durationMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 실패 배너 */}
        {allFailed > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#fee2e2', border: '1px solid #fca5a5',
            borderRadius: 10, padding: '10px 16px', marginBottom: 18,
          }}>
            <AlertCircle size={15} color="#dc2626" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', flex: 1 }}>
              {allFailed}개 자산이 30초 내에 Unity에서 처리되지 않았습니다. Unity Editor가 열려 있는지 확인하세요.
            </span>
            <button
              onClick={async () => {
                for (const a of allAssets.filter(x => x.status === 'failed'))
                  await cancelDeploy(a.assetType, a.name);
              }}
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', cursor: 'pointer' }}
            >
              실패 전체 취소
            </button>
          </div>
        )}

        {/* 통계 카드 */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <StatCard label="로봇"     {...robotStats} color="#37352f" icon={Rocket} />
          <StatCard label="워크파츠" {...wpStats}    color="#37352f" icon={Box}    />
          <div style={{
            flex: 1,
            background: allFailed > 0 ? '#fee2e2' : allPending > 0 ? '#fef9c3' : 'var(--bg-panel)',
            border: `1px solid ${allFailed > 0 ? '#fca5a5' : allPending > 0 ? '#fde68a' : 'var(--border)'}`,
            borderRadius: 14,
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: allFailed > 0 ? '#dc2626' : allPending > 0 ? '#d97706' : 'var(--border-strong)',
              borderRadius: '14px 14px 0 0',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {allFailed > 0 ? '처리 실패' : 'Unity 대기'}
              </span>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: allFailed > 0 ? '#fee2e2' : allPending > 0 ? '#fef9c3' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {allFailed > 0
                  ? <AlertCircle size={16} color="#dc2626" />
                  : <Clock size={16} color={allPending > 0 ? '#d97706' : 'var(--text-muted)'} strokeWidth={1.8} />}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: allFailed > 0 ? '#dc2626' : allPending > 0 ? '#d97706' : 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {allFailed > 0 ? allFailed : allPending}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
              {allFailed > 0
                ? `${allFailed}개 자산이 타임아웃됐습니다. 재시도하세요.`
                : allPending > 0
                  ? 'Unity Editor가 열려 있으면 자동 임포트됩니다.'
                  : '모든 자산이 정상 상태입니다.'}
            </div>
          </div>
        </div>

        {/* 통합 자산 테이블 */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              전체 자산 <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{allAssets.length}</span>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, padding: '2px 9px 3px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>
                ROBOT {robots.length}
              </span>
              <span style={{ fontSize: 11, padding: '2px 9px 3px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>
                WORKPART {workparts.length}
              </span>
            </div>
          </div>

          {allAssets.length === 0 ? (
            <div style={{ padding: '56px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: 'var(--bg-hover)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Box size={28} strokeWidth={1.2} color="var(--text-faint)" />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-sub)' }}>아직 임포트된 자산이 없습니다</p>
              <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>사이드바에서 로봇 또는 워크파츠를 임포트하세요.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                <button onClick={() => onNavigate('import')} className="btn-primary" style={{ fontSize: 13 }}>
                  <Rocket size={14} /> 로봇 임포트
                </button>
                <button onClick={() => onNavigate('wp-import')} className="btn-ghost" style={{ fontSize: 13 }}>
                  <Box size={14} /> 워크파츠 임포트
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 테이블 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 150px 130px 1fr 170px', padding: '8px 20px', gap: 12, background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                {['타입', '이름', '프리셋 / 솔버', '상태', '경로', '액션'].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                ))}
              </div>

              {/* 자산 행 */}
              {allAssets.map((asset, i) => {
                const key       = `${asset.assetType}:${asset.name}`;
                const isDepl    = deploying.has(key);
                const isCancel  = canceling.has(key);
                const isDel     = deleting.has(key);
                const cancelErr = cancelErrors[key];
                const rowBg     = asset.status === 'failed' ? '#fff5f5' : i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-card)';
                const rowHover  = asset.status === 'failed' ? '#fee2e2' : 'var(--bg-hover)';
                return (
                  <div
                    key={key}
                    style={{
                      display: 'grid', gridTemplateColumns: '80px 1fr 150px 130px 1fr 170px',
                      padding: '11px 20px', gap: 12, alignItems: 'start',
                      borderBottom: i < allAssets.length - 1 ? '1px solid var(--border)' : 'none',
                      background: rowBg, transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = rowHover}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '3px 8px 4px', borderRadius: 6,
                      background: asset.color + '15', color: asset.color,
                      letterSpacing: '0.05em', display: 'inline-block',
                    }}>
                      {asset.typeLabel}
                    </span>

                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', paddingTop: 2 }}>{asset.name}</span>

                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', paddingTop: 2 }}>{asset.subLabel}</span>

                    <div>
                      <StatusBadge status={asset.status} />
                      {asset.status === 'pending' && asset.pendingAt && (
                        <div style={{ marginTop: 3 }}>
                          <ElapsedBadge pendingAt={asset.pendingAt} now={now} />
                        </div>
                      )}
                    </div>

                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 2 }}>
                      {asset.assetType === 'robot'
                        ? `Assets/RobotImportStaging/${asset.name}`
                        : `Assets/WorkpartImportStaging/${asset.name}`}
                    </span>

                    <ActionCell
                      asset={asset}
                      isDepl={isDepl}
                      isCancel={isCancel}
                      isDel={isDel}
                      cancelErr={cancelErr}
                      onDeploy={() => deploy(asset.assetType, asset.name)}
                      onCancel={() => cancelDeploy(asset.assetType, asset.name)}
                      onRemove={() => remove(asset.assetType, asset.name)}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 빠른 이동 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {[
            { label: '로봇 임포트',     tab: 'import'   },
            { label: 'Flange 설정',     tab: 'config'   },
            { label: '워크파츠 임포트', tab: 'wp-import'},
            { label: '워크파츠 설정',   tab: 'wp-config'},
          ].map(({ label, tab }) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab)}
              className="btn-ghost"
              style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
            >
              {label}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
