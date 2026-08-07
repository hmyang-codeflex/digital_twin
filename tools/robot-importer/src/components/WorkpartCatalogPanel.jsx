import { useState, useEffect, useCallback } from 'react';
import { Package, RefreshCw, Rocket, CheckCircle, Clock, AlertCircle, Box, XCircle, X, Hand, Circle, MapPin, Zap, Pencil, Trash2, Undo2, ChevronDown } from 'lucide-react';

const STATUS_META = {
  staged:   { label: '대기',    color: '#6b7280', bg: 'var(--bg-card)',    border: 'var(--border)',  Icon: Package },
  pending:  { label: '처리중',  color: '#d97706', bg: '#fef3c7',           border: '#fde68a',        Icon: Clock },
  deployed: { label: '배포됨',  color: '#059669', bg: '#d1fae5',           border: '#a7f3d0',        Icon: CheckCircle },
  failed:   { label: '시간초과', color: '#dc2626', bg: '#fee2e2',           border: '#fca5a5',        Icon: XCircle },
};

const PRESET_LABEL = {
  pick_place:      '집어들기 워크파츠',
  suction_workpart:'흡착 워크파츠',
  bolt_workpart:   '볼트 조립 워크파츠',
  static_fixture:  '고정 픽스처',
  conveyor:        '컨베이어',
};

const PRESET_ICON = {
  pick_place:       Hand,
  suction_workpart: Circle,
  bolt_workpart:    MapPin,
  static_fixture:   Box,
  conveyor:         Zap,
};

function getMetaItems(wp) {
  const c = wp.config ?? {};
  const meshFile = c.meshFile ?? '—';
  const mass = `${c.mass ?? '—'} kg`;
  const items = [{ label: '메쉬', value: meshFile }];

  if (c.preset === 'pick_place') {
    items.push({ label: '그립', value: `${c.gripPoints?.length ?? 0}개` });
    items.push({ label: 'Mass', value: mass });
  } else if (c.preset === 'suction_workpart') {
    items.push({ label: '흡착', value: `${c.suctionPoints?.length ?? 0}개` });
    items.push({ label: 'R', value: `${((c.suctionCupRadius ?? 0.04) * 1000).toFixed(0)}mm` });
  } else if (c.preset === 'bolt_workpart') {
    items.push({ label: '홀', value: `${c.holePoints?.length ?? 0}개` });
    items.push({ label: 'Mass', value: mass });
  } else if (c.preset === 'conveyor') {
    items.push({ label: '속도', value: `${c.conveyorSpeed ?? 0.3}m/s` });
    items.push({ label: '방향', value: c.conveyorDir ?? 'Z+' });
  } else {
    items.push({ label: 'Layer', value: c.unityLayer ?? 'Default' });
    items.push({ label: 'Mass', value: mass });
  }
  return items;
}

export default function WorkpartCatalogPanel({ onEditWorkpart }) {
  const [workparts, setWorkparts] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [deploying,    setDeploying]    = useState(new Set());
  const [canceling,    setCanceling]    = useState(new Set());
  const [deleting,     setDeleting]     = useState(new Set());
  const [error,        setError]        = useState('');
  const [filterPreset, setFilterPreset] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const wps = await window.electronAPI.getWorkparts();
      setWorkparts(wps ?? []);
    } catch (e) {
      setError(e.message || '목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!workparts.some(w => w.status === 'pending')) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [workparts, load]);

  const handleDeploy = async (name) => {
    setDeploying(s => new Set(s).add(name));
    setError('');
    try {
      const res = await window.electronAPI.deployWorkpart(name);
      if (!res.ok) setError(res.error || '배포 실패');
    } catch (e) {
      setError(e.message || '배포 중 오류');
    } finally {
      await load();
      setDeploying(s => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  const handleCancel = async (name) => {
    setCanceling(s => new Set(s).add(name));
    setError('');
    try {
      const res = await window.electronAPI.cancelDeployWorkpart(name);
      if (res && !res.ok) setError(res.error || '취소 실패');
    } catch (e) {
      setError(e.message || '취소 중 오류');
    } finally {
      await load();
      setCanceling(s => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`'${name}'을(를) 스테이징에서 영구 삭제하시겠습니까?`)) return;
    setDeleting(s => new Set(s).add(name));
    setError('');
    try {
      const res = await window.electronAPI.deleteWorkpart(name);
      if (!res.ok) setError(res.error || '삭제 실패');
    } catch (e) {
      setError(e.message || '삭제 중 오류');
    } finally {
      await load();
      setDeleting(s => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  const handleEdit = async (wp) => {
    if (!onEditWorkpart) return;
    const wpStagingPath = await window.electronAPI.getWpStagingPath();
    const meshPath = wpStagingPath
      ? `${wpStagingPath}\\${wp.name}\\${wp.config?.meshFile ?? ''}`
      : '';
    onEditWorkpart({ ...wp.config, name: wp.name, meshPath });
  };

  const pendingCount = workparts.filter(w => w.status === 'pending').length;
  const failedCount  = workparts.filter(w => w.status === 'failed').length;

  return (
    <div style={{ padding: '32px 36px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>워크파츠 카탈로그</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            스테이징된 워크파츠 — Unity 배포 전 검토 및 배포
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {pendingCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                {pendingCount}개 처리 중…
              </span>
            )}
            {failedCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <XCircle size={11} />
                {failedCount}개 시간 초과
              </span>
            )}
          </div>
        </div>
        <button className="btn-ghost" style={{ gap: 6 }} onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          새로고침
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          background: '#fee2e2', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#991b1b', marginBottom: 20,
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {!loading && workparts.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, padding: '80px 0',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Package size={30} strokeWidth={1.2} color="var(--text-faint)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-sub)' }}>워크파츠 없음</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>워크파츠 임포트 → 설정 탭에서 먼저 저장하세요.</p>
          </div>
        </div>
      )}

      {workparts.length > 0 && (() => {
        const FILTER_OPTS = [
          { id: 'all',             label: '전체' },
          { id: 'pick_place',      label: '집어들기' },
          { id: 'suction_workpart',label: '흡착' },
          { id: 'bolt_workpart',   label: '볼트 조립' },
          { id: 'static_fixture',  label: '픽스처' },
          { id: 'conveyor',        label: '컨베이어' },
        ].filter(f => f.id === 'all' || workparts.some(w => w.config?.preset === f.id));
        const filtered = filterPreset === 'all' ? workparts : workparts.filter(w => w.config?.preset === filterPreset);
        return (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {FILTER_OPTS.map(f => {
                const count = f.id === 'all' ? workparts.length : workparts.filter(w => w.config?.preset === f.id).length;
                const active = filterPreset === f.id;
                return (
                  <button key={f.id} onClick={() => setFilterPreset(f.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '0 12px', height: 30, borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
                    background: active ? 'var(--text)' : 'var(--bg-panel)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                    transition: 'all 0.12s',
                  }}>
                    {f.label}
                    <span style={{ fontSize: 11, background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg-hover)', color: active ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', borderRadius: 4, padding: '0 5px' }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(wp => (
                <WorkpartCard
                  key={wp.name}
                  wp={wp}
                  deploying={deploying.has(wp.name)}
                  canceling={canceling.has(wp.name)}
                  deleting={deleting.has(wp.name)}
                  onDeploy={() => handleDeploy(wp.name)}
                  onCancel={() => handleCancel(wp.name)}
                  onDelete={() => handleDelete(wp.name)}
                  onEdit={onEditWorkpart ? () => handleEdit(wp) : null}
                />
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function WorkpartCard({ wp, deploying, canceling, deleting, onDeploy, onCancel, onDelete, onEdit }) {
  const meta    = STATUS_META[wp.status] ?? STATUS_META.staged;
  const preset  = PRESET_LABEL[wp.config?.preset] ?? wp.config?.preset ?? '—';
  const PresetIcon = PRESET_ICON[wp.config?.preset] ?? Box;
  const metaItems = getMetaItems(wp);
  const isFailed  = wp.status === 'failed';
  const isBusy    = deploying || canceling || deleting;

  // 파일시스템 기반 배포 버전 이력 (프리팹 스냅샷) + 롤백
  const [versions,     setVersions]     = useState([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [rollingBack,  setRollingBack]  = useState('');

  useEffect(() => {
    if (!versionsOpen) return;
    window.electronAPI.getWorkpartHistory(wp.name).then(v => setVersions(v ?? []));
  }, [versionsOpen, wp.name]);

  const handleRollback = async (versionId) => {
    if (!window.confirm('이 버전으로 롤백하시겠습니까? 현재 배포된 프리팹이 해당 버전으로 교체됩니다.')) return;
    setRollingBack(versionId);
    try {
      const res = await window.electronAPI.rollbackWorkpart(wp.name, versionId);
      if (!res.ok) window.alert(`롤백 실패: ${res.error}`);
      else {
        const v = await window.electronAPI.getWorkpartHistory(wp.name);
        setVersions(v ?? []);
      }
    } finally {
      setRollingBack('');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: `1px solid ${isFailed ? '#fca5a5' : 'var(--border)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ padding: '16px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: isFailed ? 'var(--error-dim)' : 'var(--bg-hover)',
              border: `1px solid ${isFailed ? '#f5b8bb' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PresetIcon size={17} color={isFailed ? 'var(--error)' : 'var(--text-sub)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {wp.name}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{preset}</p>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            background: meta.bg, border: `1px solid ${meta.border}`,
            borderRadius: 20, padding: '3px 9px',
            fontSize: 11, fontWeight: 600, color: meta.color,
          }}>
            <meta.Icon size={10} />
            {meta.label}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 0,
        padding: '10px 18px', borderBottom: '1px solid var(--border)', marginTop: 12,
      }}>
        {metaItems.map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < metaItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 편집 / 삭제 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={isBusy}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                height: 30, borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                opacity: isBusy ? 0.4 : 1,
              }}
            >
              <Pencil size={11} /> 편집
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isBusy || wp.status === 'pending'}
            title={wp.status === 'pending' ? '배포 중에는 삭제할 수 없습니다' : '영구 삭제'}
            style={{
              flex: onEdit ? undefined : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              width: onEdit ? 30 : undefined, height: 30, borderRadius: 6, fontSize: 12,
              cursor: (isBusy || wp.status === 'pending') ? 'default' : 'pointer',
              background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
              opacity: (isBusy || wp.status === 'pending') ? 0.3 : 1,
            }}
          >
            <Trash2 size={11} />
          </button>
          {wp.status === 'deployed' && (
            <button
              onClick={() => setVersionsOpen(o => !o)}
              title="버전 이력 / 롤백"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                width: 30, height: 30, borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
              }}
            >
              <Undo2 size={11} />
            </button>
          )}
        </div>
        <WorkpartActions
          status={wp.status}
          deploying={deploying}
          canceling={canceling}
          onDeploy={onDeploy}
          onCancel={onCancel}
        />
        {versionsOpen && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              배포된 버전
            </p>
            {versions.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>기록된 버전이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {versions.map((v, i) => (
                  <div key={v.versionId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                      background: i === 0 ? '#d1fae5' : 'var(--bg-hover)',
                      color:      i === 0 ? '#059669' : 'var(--text-muted)',
                    }}>
                      {i === 0 ? '현재' : `v${versions.length - i}`}
                    </span>
                    <span style={{ color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums', flex: 1 }}>
                      {new Date(v.deployedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {i !== 0 && (
                      <button
                        onClick={() => handleRollback(v.versionId)}
                        disabled={rollingBack !== ''}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                        }}
                      >
                        {rollingBack === v.versionId
                          ? <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
                          : <Undo2 size={10} />}
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
    </div>
  );
}

function WorkpartActions({ status, deploying, canceling, onDeploy, onCancel }) {
  if (status === 'pending') {
    return (
      <button
        className="btn-ghost"
        style={{ width: '100%', justifyContent: 'center', gap: 7, color: 'var(--warning)', borderColor: '#fde68a' }}
        onClick={onCancel}
        disabled={canceling}
      >
        {canceling
          ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
          : <X size={13} />}
        배포 취소
      </button>
    );
  }
  if (status === 'failed') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-ghost"
          style={{ flex: 1, justifyContent: 'center', gap: 6, color: 'var(--error)', borderColor: '#fca5a5' }}
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
          style={{ flex: 1, justifyContent: 'center', gap: 6, background: '#dc2626', boxShadow: '0 2px 6px rgba(220,38,38,0.28)' }}
          onClick={onDeploy}
          disabled={deploying}
        >
          <Rocket size={12} />
          {deploying ? '배포 중…' : '재시도'}
        </button>
      </div>
    );
  }
  if (status === 'deployed') {
    return (
      <button
        className="btn-success"
        style={{ width: '100%', justifyContent: 'center', gap: 7 }}
        disabled
      >
        <CheckCircle size={13} />
        Unity 배포 완료
      </button>
    );
  }
  return (
    <button
      className="btn-primary"
      style={{ width: '100%', justifyContent: 'center', gap: 7 }}
      onClick={onDeploy}
      disabled={deploying}
    >
      {deploying
        ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> 배포 중…</>
        : <><Rocket size={13} /> Unity에 배포</>}
    </button>
  );
}
