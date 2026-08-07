import { useState, useEffect, useCallback } from 'react';
import { Bot, Rocket, RefreshCw, FolderOpen, CheckCircle, Clock, Package, ChevronRight, AlertCircle, XCircle, X, Search, History, ChevronDown, Undo2 } from 'lucide-react';

// ── 배포 이력 helpers (localStorage) ─────────────────────────────
function getDeployHistory(name) {
  try { return JSON.parse(localStorage.getItem(`fm_deploy_hist_${name}`) ?? '[]'); }
  catch { return []; }
}
function pushDeployHistory(name, entry) {
  const prev = getDeployHistory(name).slice(0, 19);
  localStorage.setItem(`fm_deploy_hist_${name}`, JSON.stringify([entry, ...prev]));
}

export default function CatalogPanel({ onEditRobot }) {
  const [robots, setRobots]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [deploying, setDeploying] = useState(new Set());
  const [canceling, setCanceling] = useState(new Set());
  const [unityPath, setUnityPath] = useState('');
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, up] = await Promise.all([
        window.electronAPI.getRobots(),
        window.electronAPI.getUnityPath(),
      ]);
      setRobots(list ?? []);
      setUnityPath(up ?? '');
      setError('');
    } catch (e) {
      setError('목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!robots.some(r => r.status === 'pending')) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [robots, load]);

  const handleDeploy = async (name) => {
    setDeploying(s => new Set(s).add(name));
    setError('');
    const ts = Date.now();
    try {
      const result = await window.electronAPI.deployRobot(name);
      if (!result.ok) {
        setError(`배포 실패: ${result.error}`);
        pushDeployHistory(name, { ts, status: 'failed', unityPath });
      } else {
        pushDeployHistory(name, { ts, status: 'deployed', unityPath });
      }
    } catch (e) {
      setError(`배포 중 오류: ${e.message}`);
      pushDeployHistory(name, { ts, status: 'failed', unityPath });
    } finally {
      await load();
      setDeploying(s => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  const handleCancel = async (name) => {
    setCanceling(s => new Set(s).add(name));
    setError('');
    try {
      const result = await window.electronAPI.cancelDeployRobot(name);
      if (result && !result.ok) setError(`취소 실패: ${result.error}`);
    } catch (e) {
      setError(`취소 중 오류: ${e.message}`);
    } finally {
      await load();
      setCanceling(s => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  const handleSetUnityPath = async () => {
    const p = await window.electronAPI.selectUnityProject();
    if (p) await load();
  };

  const pendingCount = robots.filter(r => r.status === 'pending').length;
  const failedCount  = robots.filter(r => r.status === 'failed').length;
  const filtered = search ? robots.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : robots;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header" style={{ boxShadow: 'var(--shadow-xs)' }}>
        <FolderOpen size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unity 프로젝트</span>
        <ChevronRight size={12} color="var(--text-faint)" />
        <span style={{
          fontSize: 11, color: 'var(--text-sub)', fontFamily: 'monospace',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 5, padding: '2px 8px',
          maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {unityPath || '설정 안됨'}
        </span>
        <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={handleSetUnityPath}>
          변경
        </button>

        {pendingCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
            {pendingCount}개 임포트 중…
          </span>
        )}
        {failedCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <XCircle size={11} />
            {failedCount}개 시간 초과
          </span>
        )}

        <div style={{ flex: 1 }} />
        <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }} onClick={load}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          새로고침
        </button>
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름으로 검색…"
            style={{ paddingLeft: 32, fontSize: 12, height: 34, background: 'var(--bg-card)' }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          margin: '10px 28px 0', flexShrink: 0,
          display: 'flex', gap: 8, alignItems: 'center',
          background: 'var(--error-dim)', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--error)',
        }}>
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {robots.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              등록된 로봇 <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{robots.length}</span>
              {search && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>({filtered.length}개 표시)</span>}
            </p>
            {filtered.map(robot => (
              <RobotCard
                key={robot.name}
                robot={robot}
                deploying={deploying.has(robot.name)}
                canceling={canceling.has(robot.name)}
                onDeploy={() => handleDeploy(robot.name)}
                onCancel={() => handleCancel(robot.name)}
                onEdit={() => onEditRobot(robot)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 40 }}>
      <div style={{
        width: 80, height: 80, borderRadius: 22,
        background: 'var(--bg-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <Bot size={36} strokeWidth={1.2} color="var(--text-sub)" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>등록된 로봇이 없습니다</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>임포트 탭에서 URDF 파일을 추가하세요.</p>
    </div>
  );
}

function RobotActions({ status, deploying, canceling, onDeploy, onCancel }) {
  if (status === 'pending') {
    return (
      <button
        className="btn-ghost"
        style={{ fontSize: 12, padding: '7px 14px', color: 'var(--warning)', borderColor: '#fde68a' }}
        onClick={onCancel}
        disabled={canceling}
      >
        {canceling
          ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
          : <X size={12} />}
        취소
      </button>
    );
  }
  if (status === 'failed') {
    return (
      <>
        <button
          className="btn-ghost"
          style={{ fontSize: 12, padding: '7px 14px', color: 'var(--error)', borderColor: '#fca5a5' }}
          onClick={onCancel}
          disabled={canceling}
        >
          {canceling
            ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <XCircle size={12} />}
          초기화
        </button>
        <button
          className="btn-primary"
          style={{ fontSize: 12, padding: '7px 14px', background: '#dc2626', boxShadow: '0 2px 6px rgba(220,38,38,0.28)' }}
          onClick={onDeploy}
          disabled={deploying}
        >
          <Rocket size={13} />
          {deploying ? '배포 중…' : '재시도'}
        </button>
      </>
    );
  }
  return (
    <button
      className={status === 'deployed' ? 'btn-ghost' : 'btn-primary'}
      style={{ fontSize: 12, padding: '7px 14px' }}
      onClick={onDeploy}
      disabled={deploying}
    >
      <Rocket size={13} />
      {deploying ? '배포 중…' : status === 'deployed' ? '재배포' : 'Unity로 배포'}
    </button>
  );
}

function RobotCard({ robot, deploying, canceling, onDeploy, onCancel, onEdit }) {
  const { name, config, status } = robot;
  const [histOpen,    setHistOpen]    = useState(false);
  const [histShowAll, setHistShowAll] = useState(false); // I4
  const [histRev,     setHistRev]     = useState(0);     // I5: 삭제 후 강제 재읽기
  const history = getDeployHistory(name); // histRev가 바뀌면 재렌더 → 자동 재읽기

  // 파일시스템 기반 버전 이력 (프리팹 스냅샷) — 시도 이력과 별개
  const [versions,      setVersions]      = useState([]);
  const [versionsOpen,  setVersionsOpen]  = useState(false);
  const [rollingBack,   setRollingBack]   = useState('');

  useEffect(() => {
    if (!versionsOpen) return;
    window.electronAPI.getRobotHistory(name).then(v => setVersions(v ?? []));
  }, [versionsOpen, name]);

  const handleRollback = async (versionId) => {
    if (!window.confirm('이 버전으로 롤백하시겠습니까? 현재 배포된 프리팹이 해당 버전으로 교체됩니다.')) return;
    setRollingBack(versionId);
    try {
      const res = await window.electronAPI.rollbackRobot(name, versionId);
      if (!res.ok) window.alert(`롤백 실패: ${res.error}`);
      else {
        const v = await window.electronAPI.getRobotHistory(name);
        setVersions(v ?? []);
      }
    } finally {
      setRollingBack('');
    }
  };

  const badgeMap = {
    staged:   { cls: 'badge-staged',   Icon: Package,     label: '스테이징' },
    pending:  { cls: 'badge-pending',  Icon: Clock,       label: 'Unity 대기 중' },
    deployed: { cls: 'badge-deployed', Icon: CheckCircle, label: 'Unity 배포됨' },
    failed:   { cls: 'badge-failed',   Icon: XCircle,     label: '시간 초과' },
  };
  const { cls, Icon: BadgeIcon, label } = badgeMap[status] ?? badgeMap.staged;
  const isFailed  = status === 'failed';
  const stripColor = { staged: 'var(--accent)', pending: 'var(--warning)', deployed: 'var(--success)', failed: 'var(--error)' }[status] ?? 'var(--accent)';

  return (
    <div style={{
      background: 'var(--bg-panel)',
      borderTop: `1px solid ${isFailed ? '#fca5a5' : 'var(--border)'}`,
      borderRight: `1px solid ${isFailed ? '#fca5a5' : 'var(--border)'}`,
      borderBottom: `1px solid ${isFailed ? '#fca5a5' : 'var(--border)'}`,
      borderLeft: `3px solid ${stripColor}`,
      borderRadius: 14,
      boxShadow: isFailed ? '0 0 0 1px #fca5a520' : 'var(--shadow-sm)',
      transition: 'box-shadow 0.15s',
      overflow: 'hidden',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = isFailed ? '0 0 0 1px #fca5a520' : 'var(--shadow-sm)'; }}
    >
      {/* 메인 행 */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: isFailed ? 'var(--error-dim)' : 'var(--bg-hover)',
          border: `1px solid ${isFailed ? '#f5b8bb' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={24} color={isFailed ? 'var(--error)' : 'var(--text-sub)'} strokeWidth={1.8} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{name}</span>
            <span className={`badge ${cls}`}>
              <BadgeIcon size={10} /> {label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
            <MetaPill label="Solver" value={config.solverType ?? '—'} />
            <MetaPill label="TCP"    value={config.tcpLinkName ?? '—'} />
            <MetaPill label="조인트" value={`${config.jointLimits?.length ?? '—'}축`} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {history.length > 0 && (
            // I7: btn-ghost가 이미 gap:6px 처리하므로 인라인 gap 제거
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '6px 10px', color: 'var(--text-muted)' }}
              onClick={() => setHistOpen(o => !o)}
              title="배포 이력"
            >
              <History size={12} />
              {history.length}
              <ChevronDown size={11} style={{ transform: histOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
          {status === 'deployed' && (
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '6px 10px', color: 'var(--text-muted)' }}
              onClick={() => setVersionsOpen(o => !o)}
              title="버전 이력 / 롤백"
            >
              <Undo2 size={12} />
              버전
              <ChevronDown size={11} style={{ transform: versionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={onEdit}>
            편집
          </button>
          <RobotActions
            status={status}
            deploying={deploying}
            canceling={canceling}
            onDeploy={onDeploy}
            onCancel={onCancel}
          />
        </div>
      </div>

      {/* 배포 이력 패널 */}
      {histOpen && history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', padding: '10px 20px 12px' }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', flex: 1 }}>
              배포 이력
            </p>
            {/* I5: 이력 삭제 버튼 */}
            <button
              onClick={() => {
                if (!window.confirm('배포 이력을 모두 삭제합니까?')) return;
                localStorage.removeItem(`fm_deploy_hist_${name}`);
                setHistOpen(false);
                setHistRev(r => r + 1);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)', padding: '0 2px' }}
              title="이력 삭제"
            >
              이력 삭제
            </button>
          </div>

          {/* 이력 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* I4: histShowAll이면 전체, 아니면 5개 */}
            {(histShowAll ? history : history.slice(0, 5)).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                  background: h.status === 'deployed' ? 'var(--success-dim)' : 'var(--error-dim)',
                  color:      h.status === 'deployed' ? 'var(--success)'     : 'var(--error)',
                }}>
                  {h.status === 'deployed' ? '성공' : '실패'}
                </span>
                <span style={{ color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {new Date(h.ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                {h.unityPath && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.unityPath.split(/[\\/]/).slice(-2).join('/')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* I4: 5건 초과 시 더 보기 토글 */}
          {history.length > 5 && (
            <button
              onClick={() => setHistShowAll(v => !v)}
              style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', padding: 0 }}
            >
              {histShowAll ? '접기' : `${history.length - 5}건 더 보기`}
            </button>
          )}
        </div>
      )}

      {/* 버전 이력 / 롤백 패널 */}
      {versionsOpen && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', padding: '10px 20px 12px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            배포된 버전 (프리팹 스냅샷)
          </p>
          {versions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>기록된 버전이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {versions.map((v, i) => (
                <div key={v.versionId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                    background: i === 0 ? 'var(--success-dim)' : 'var(--bg-hover)',
                    color:      i === 0 ? 'var(--success)'     : 'var(--text-muted)',
                  }}>
                    {i === 0 ? '현재' : `v${versions.length - i}`}
                  </span>
                  <span style={{ color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums', flex: 1 }}>
                    {new Date(v.deployedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {i !== 0 && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => handleRollback(v.versionId)}
                      disabled={rollingBack !== ''}
                    >
                      {rollingBack === v.versionId
                        ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                        : <Undo2 size={11} />}
                      롤백
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaPill({ label, value }) {
  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span style={{
        fontWeight: 600, color: 'var(--text-sub)',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 4, padding: '1px 6px', fontSize: 11,
      }}>{value}</span>
    </span>
  );
}
