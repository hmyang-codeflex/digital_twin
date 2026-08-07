import { useState } from 'react';
import { BellOff, AlertTriangle, AlertCircle, RotateCcw, CheckCheck, Check } from 'lucide-react';

export const DEFAULT_THRESHOLDS = {
  tempWarn: 60,   tempDanger: 75,
  powerWarn: 2000, powerDanger: 2500,
  torqueWarn: 80,  torqueDanger: 100,
};

// ── 유틸 ──────────────────────────────────────────────────────
function fmtTs(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
}

// ── 활성 알람 카드 ────────────────────────────────────────────
function ActiveAlarmCard({ alarm, akey, onAcknowledge }) {
  const isDanger = alarm.level === 'danger';
  const acked    = alarm.acknowledged;
  const color    = isDanger ? 'var(--error)' : 'var(--warning)';
  const bgDim    = isDanger ? 'rgba(224,82,82,0.08)' : 'rgba(245,166,35,0.07)';
  const over     = (alarm.value - alarm.threshold).toFixed(2);

  return (
    <div style={{
      padding: '12px 16px',
      background: acked ? 'transparent' : bgDim,
      border: `1px solid ${acked ? 'var(--border)' : color}`,
      borderLeft: `3px solid ${acked ? 'var(--border-strong)' : color}`,
      borderRadius: 10,
      opacity: acked ? 0.6 : 1,
      transition: 'all 0.25s',
    }}>
      {/* 상단: 레벨 뱃지 + 이름 + 확인 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {isDanger
          ? <AlertCircle   size={14} color={acked ? 'var(--text-faint)' : color} strokeWidth={2.2} />
          : <AlertTriangle size={14} color={acked ? 'var(--text-faint)' : color} strokeWidth={2.2} />
        }
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
          color: acked ? 'var(--text-faint)' : color,
          background: acked ? 'var(--bg-hover)' : bgDim,
          border: `1px solid ${acked ? 'var(--border)' : color}`,
        }}>
          {isDanger ? '위험' : '경고'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: acked ? 'var(--text-muted)' : 'var(--text)' }}>
          {alarm.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {alarm.robotName}</span>

        <div style={{ marginLeft: 'auto' }}>
          {acked ? (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Check size={11} /> 확인됨 {fmtTs(alarm.acknowledgedAt)}
            </span>
          ) : (
            <button
              onClick={() => onAcknowledge(akey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
                border: `1px solid ${color}`, color, background: bgDim, cursor: 'pointer',
              }}
            >
              <Check size={11} /> 확인
            </button>
          )}
        </div>
      </div>

      {/* 값 표시 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingLeft: 22 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: acked ? 'var(--text-muted)' : color, fontFamily: 'monospace' }}>
          {alarm.value.toFixed(1)}
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{alarm.unit}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          기준 {alarm.threshold}{alarm.unit}
          <span style={{ color: acked ? 'var(--text-faint)' : color, marginLeft: 4 }}>+{over} 초과</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
          발생 {fmtTs(alarm.ts)}
        </span>
      </div>
    </div>
  );
}

// ── 히스토리 아이템 ───────────────────────────────────────────
function HistoryItem({ alarm }) {
  const isDanger   = alarm.level === 'danger';
  const isResolved = !!alarm.resolvedAt;
  const isAcked    = !!alarm.acknowledgedAt;
  const color      = isDanger ? 'var(--error)' : 'var(--warning)';

  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${isResolved ? 'var(--border-strong)' : color}`,
      borderRadius: 10, opacity: isResolved ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
          color: isResolved ? 'var(--text-faint)' : color,
          border: `1px solid ${isResolved ? 'var(--border)' : color}`,
          background: isResolved ? 'transparent' : (isDanger ? 'rgba(224,82,82,0.08)' : 'rgba(245,166,35,0.07)'),
        }}>
          {isDanger ? '위험' : '경고'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sub)' }}>{alarm.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {alarm.robotName}</span>
        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', marginLeft: 'auto', color: isResolved ? 'var(--text-faint)' : color }}>
          {alarm.value.toFixed(1)}{alarm.unit}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
          발생 {fmtTs(alarm.ts)}
        </span>
        {isAcked && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
            ✓ 확인 {fmtTs(alarm.acknowledgedAt)}
          </span>
        )}
        {isResolved && (
          <span style={{ fontSize: 10, color: 'var(--success)', fontFamily: 'monospace' }}>
            ● 해소 {fmtTs(alarm.resolvedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 임계값 입력 행 ────────────────────────────────────────────
function ThresholdRow({ label, unit, warnKey, dangerKey, thresholds, onChange }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '72px 1fr 1fr', gap: 14, alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sub)' }}>{label}</span>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertTriangle size={12} color="var(--warning)" />
        <input
          type="number"
          value={thresholds[warnKey]}
          onChange={e => {
            const v = Number(e.target.value);
            if (!isNaN(v) && v > 0 && v < thresholds[dangerKey]) onChange({ ...thresholds, [warnKey]: v });
          }}
          style={numInput('#f5a623')}
        />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{unit}</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertCircle size={12} color="var(--error)" />
        <input
          type="number"
          value={thresholds[dangerKey]}
          onChange={e => {
            const v = Number(e.target.value);
            if (!isNaN(v) && v > thresholds[warnKey]) onChange({ ...thresholds, [dangerKey]: v });
          }}
          style={numInput('#e05252')}
        />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{unit}</span>
      </label>
    </div>
  );
}

const numInput = (border) => ({
  width: 70, padding: '4px 8px', borderRadius: 6,
  border: `1px solid ${border}`,
  background: 'var(--bg-card)', color: 'var(--text)',
  fontSize: 12, fontFamily: 'monospace', outline: 'none',
});

// ── 메인 ──────────────────────────────────────────────────────
export default function AlarmPanel({
  activeAlarms, alarmHistory, thresholds,
  onThresholdsChange, onAcknowledge, onAcknowledgeAll,
}) {
  const [tab, setTab] = useState('active');

  const activeEntries = Object.entries(activeAlarms);
  const unackedCount  = activeEntries.filter(([, a]) => !a.acknowledged).length;
  const activeCount   = activeEntries.length;

  // 정렬: 미확인 위험 > 미확인 경고 > 확인된 위험 > 확인된 경고
  const sortedActive = [...activeEntries].sort(([, a], [, b]) => {
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
    if (a.level !== b.level) return a.level === 'danger' ? -1 : 1;
    return b.ts - a.ts;
  });

  const TABS = [
    { id: 'active',   label: '활성 알람',   badge: unackedCount },
    { id: 'history',  label: '히스토리',    badge: null         },
    { id: 'settings', label: '임계값 설정', badge: null         },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── 탭 헤더 ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        padding: '0 24px',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '12px 16px',
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid var(--text)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: '#e05252', color: '#fff', minWidth: 18, textAlign: 'center',
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 콘텐츠 ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* 활성 알람 탭 */}
        {tab === 'active' && (
          <>
            {/* 전체 확인 버튼 */}
            {unackedCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button onClick={onAcknowledgeAll} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}>
                  <CheckCheck size={13} /> 전체 확인 ({unackedCount})
                </button>
              </div>
            )}

            {activeCount === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: 'var(--bg-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <BellOff size={28} strokeWidth={1.2} color="var(--text-sub)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>활성 알람 없음</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>모든 지표가 임계값 이내입니다.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedActive.map(([akey, alarm]) => (
                  <ActiveAlarmCard key={akey} alarm={alarm} akey={akey} onAcknowledge={onAcknowledge} />
                ))}
              </div>
            )}
          </>
        )}

        {/* 히스토리 탭 */}
        {tab === 'history' && (
          alarmHistory.length === 0 ? (
            <div style={{ paddingTop: 60, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>아직 발생한 알람이 없습니다.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10 }}>
                최근 {alarmHistory.length}건 · 최대 100건 보관
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alarmHistory.map((alarm, i) => <HistoryItem key={alarm.id + i} alarm={alarm} />)}
              </div>
            </>
          )
        )}

        {/* 임계값 설정 탭 */}
        {tab === 'settings' && (
          <div style={{ maxWidth: 460 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              모든 로봇에 공통 적용됩니다.<br />
              경고 값은 반드시 위험 값보다 낮아야 하며, 변경은 즉시 반영됩니다.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr', gap: 14, paddingBottom: 8 }}>
              <div />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f5a623' }}>⚠ 경고</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e05252' }}>✕ 위험</span>
            </div>

            <ThresholdRow label="온도"  unit="°C" warnKey="tempWarn"   dangerKey="tempDanger"   thresholds={thresholds} onChange={onThresholdsChange} />
            <ThresholdRow label="전력"  unit="W"  warnKey="powerWarn"  dangerKey="powerDanger"  thresholds={thresholds} onChange={onThresholdsChange} />
            <ThresholdRow label="토크"  unit="Nm" warnKey="torqueWarn" dangerKey="torqueDanger" thresholds={thresholds} onChange={onThresholdsChange} />

            <button
              onClick={() => onThresholdsChange({ ...DEFAULT_THRESHOLDS })}
              style={{
                marginTop: 20, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} /> 기본값으로 초기화
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
