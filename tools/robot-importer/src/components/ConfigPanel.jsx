import { useState } from 'react';
import { Save, ChevronDown, Info, CheckCircle, AlertCircle } from 'lucide-react';

const SOLVER_TYPES = ['SixAxis', 'SixAxisOffset', 'SCARA', 'Delta'];
const SOLVER_DESC  = {
  SixAxis:       'Robot6RSphericalWrist — 표준 6축 구면 손목 (ABB, KUKA, Fanuc)',
  SixAxisOffset: 'Robot6ROffsetWrist — 6축 오프셋 손목 (오프셋 팔꿈치 구조)',
  SCARA:         'RobotScara — 4축 수평 다관절, 평면 고속 조립',
  Delta:         'Robot3DDelta — 3축 병렬 델타, 고속 픽앤플레이스',
};

const GRIPPER_TYPES = [
  { id: 'None',        label: '없음',             desc: '그리퍼 미사용' },
  { id: 'PincherX100', label: 'PincherX100',      desc: 'Preliy GripperEventBridge + PincherX100 드라이버' },
  { id: 'TwoFinger',   label: '2-Finger Generic', desc: 'Preliy Gripper + 커스텀 PincherController' },
  { id: 'Vacuum',      label: 'Vacuum',            desc: 'true/false 토글 진공 흡착' },
  { id: 'Custom',      label: '커스텀',            desc: '사용자 정의 MonoBehaviour 클래스' },
];

// ── 공통 레이아웃 헬퍼 ────────────────────────────────────────────────────────
function Field({ label, note, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <span className="label" style={{ marginBottom: 0 }}>{label}</span>
        {note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {note}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, color = 'var(--accent)', children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        width: '100%', padding: '9px 14px',
        background: 'var(--bg-card)', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.04em', flex: 1 }}>{title}</span>
        <ChevronDown size={12} color="var(--text-faint)" style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      )}
    </div>
  );
}

function Vec3Input({ value, onChange, step = 0.001, labels = ['X', 'Y', 'Z'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
      {['x', 'y', 'z'].map((ax, i) => (
        <div key={ax}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{labels[i]}</span>
          <input type="number" step={step} value={value?.[ax] ?? 0}
            onChange={e => onChange({ ...(value ?? {}), [ax]: parseFloat(e.target.value) || 0 })}
            style={{ padding: '4px 6px', fontSize: 11 }}
          />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ConfigPanel({ draft, onChange, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const [config, setConfig] = useState({
    solverType:     'SixAxis',
    tcpLinkName:    draft.joints?.at(-1)?.name ?? '',
    maxSpeed:       1.5,
    maxAcceleration: 5.0,
    jointLimits:    draft.joints?.map(j => ({ name: j.name, min: j.min, max: j.max, speedMax: 0, accMax: 0 })) ?? [],
    homePosition:   draft.joints?.map(() => 0) ?? [],
    // TCP Offset (meters + degrees)
    tcpOffset:      { x: 0, y: 0, z: 0 },
    tcpRotation:    { x: 0, y: 0, z: 0 },
    // 그리퍼
    gripperType:         'None',
    gripperBridgeClass:  '',
    gripperOpenValue:    100,
    gripperCloseValue:   0,
  });

  const update = (patch) => setConfig(c => ({ ...c, ...patch }));

  const handleSave = async () => {
    if (!draft.urdfPath) { setError('URDF 파일을 먼저 선택해주세요.'); return; }
    if (!draft.name)     { setError('로봇 이름을 입력해주세요.');     return; }
    setSaving(true); setError('');
    try {
      const result = await window.electronAPI.saveRobot({
        name: draft.name, urdfPath: draft.urdfPath, meshFolder: draft.meshFolder, config,
      });
      if (result.ok) { setSaved(true); setTimeout(() => { setSaved(false); onSaved(); }, 900); }
      else setError(result.error);
    } catch (e) {
      setError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── 좌측 설정 폼 ─────────────────────────────────────────────────── */}
      <div style={{ width: 460, background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <p className="section-title">Preliy.Flange 설정</p>
          <p className="section-desc">Unity에서 Controller / Solver / Gripper 컴포넌트를 자동 구성할 메타데이터를 입력하세요.</p>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* 로봇 이름 읽기 전용 */}
          <Field label="로봇 이름">
            <div style={{ position: 'relative' }}>
              <input value={draft.name} readOnly style={{ paddingLeft: 36, color: 'var(--text-muted)', background: 'var(--bg-card)' }} />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>🤖</span>
            </div>
          </Field>

          {/* ── 솔버 & 기구학 ─────────────────────────────────────────────── */}
          <Section title="솔버 & 기구학" color="var(--accent)">
            <Field label="Solver 타입">
              <div style={{ position: 'relative' }}>
                <select value={config.solverType} onChange={e => update({ solverType: e.target.value })} style={{ paddingRight: 36 }}>
                  {SOLVER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'flex-start' }}>
                <Info size={11} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{SOLVER_DESC[config.solverType]}</p>
              </div>
            </Field>

            <Field label="TCP 링크 (엔드 이펙터)">
              <div style={{ position: 'relative' }}>
                <select value={config.tcpLinkName} onChange={e => update({ tcpLinkName: e.target.value })} style={{ paddingRight: 36 }}>
                  <option value="">-- 선택 --</option>
                  {draft.joints?.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </Field>
          </Section>

          {/* ── TCP Offset ────────────────────────────────────────────────── */}
          <Section title="TCP Offset (공구 보정)" color="var(--accent)">
            <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: 'var(--accent)' }}>
              TCP 링크에서 실제 공구 끝단까지의 오프셋. Target 이동 시 자동 보정에 사용됩니다.
            </div>
            <Field label="위치 (m)">
              <Vec3Input value={config.tcpOffset} onChange={v => update({ tcpOffset: v })} step={0.001} />
            </Field>
            <Field label="회전 (°)">
              <Vec3Input value={config.tcpRotation} onChange={v => update({ tcpRotation: v })} step={0.5} labels={['Rx', 'Ry', 'Rz']} />
            </Field>
          </Section>

          {/* ── 속도 & 가속도 ─────────────────────────────────────────────── */}
          <Section title="속도 & 가속도" color="var(--accent)">
            <Field label={`최대 속도 — ${config.maxSpeed.toFixed(2)} m/s`}>
              <input type="range" min="0.1" max="5" step="0.05" value={config.maxSpeed} onChange={e => update({ maxSpeed: parseFloat(e.target.value) })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>0.1</span><span>5.0 m/s</span>
              </div>
            </Field>
            <Field label={`최대 가속도 — ${config.maxAcceleration.toFixed(1)} m/s²`}>
              <input type="range" min="0.5" max="30" step="0.5" value={config.maxAcceleration} onChange={e => update({ maxAcceleration: parseFloat(e.target.value) })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>0.5</span><span>30 m/s²</span>
              </div>
            </Field>
          </Section>

          {/* ── 조인트 리밋 & 홈포지션 ───────────────────────────────────── */}
          {config.jointLimits.length > 0 && (
            <Section title={`조인트 리밋 & 홈포지션 — ${config.jointLimits.length}축`} color="var(--accent)">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                SPD/ACC = 0이면 전역 기본값 사용. deg/s 또는 m/s.
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px 52px 52px', minWidth: 380, padding: '6px 10px', gap: 4, borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                  {['조인트', 'MIN°', 'MAX°', 'HOME°', 'SPD', 'ACC'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h !== '조인트' ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {config.jointLimits.map((jl, i) => (
                  <div key={jl.name} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px 52px 52px', minWidth: 380, padding: '5px 10px', gap: 4, alignItems: 'center', borderBottom: i < config.jointLimits.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-card)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-sub)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jl.name}</span>
                    {['min', 'max'].map(k => (
                      <input key={k} type="number" value={jl[k]}
                        style={{ padding: '3px 4px', fontSize: 11, textAlign: 'right' }}
                        onChange={e => {
                          const next = [...config.jointLimits];
                          next[i] = { ...next[i], [k]: parseFloat(e.target.value) };
                          update({ jointLimits: next });
                        }}
                      />
                    ))}
                    <input type="number" value={config.homePosition?.[i] ?? 0}
                      style={{ padding: '3px 4px', fontSize: 11, textAlign: 'right' }}
                      onChange={e => {
                        const next = [...(config.homePosition ?? [])];
                        next[i] = parseFloat(e.target.value) || 0;
                        update({ homePosition: next });
                      }}
                    />
                    {['speedMax', 'accMax'].map(k => (
                      <input key={k} type="number" min="0" value={jl[k] ?? 0}
                        placeholder="0"
                        style={{ padding: '3px 4px', fontSize: 11, textAlign: 'right', color: jl[k] > 0 ? 'var(--text)' : 'var(--text-faint)' }}
                        onChange={e => {
                          const next = [...config.jointLimits];
                          next[i] = { ...next[i], [k]: parseFloat(e.target.value) || 0 };
                          update({ jointLimits: next });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── 그리퍼 ────────────────────────────────────────────────────── */}
          <Section title="그리퍼 (Gripper)" color="var(--accent)">
            {GRIPPER_TYPES.map(g => {
              const active = config.gripperType === g.id;
              return (
                <button key={g.id} onClick={() => update({ gripperType: g.id })} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px',
                  borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                  background: active ? 'var(--accent-dim)' : 'var(--bg-card)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? 'var(--accent)' : 'var(--text)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{g.label}</div>
                    <div style={{ fontSize: 11, color: active ? 'var(--text-sub)' : 'var(--text-muted)', marginTop: 1 }}>{g.desc}</div>
                  </div>
                  {active && <CheckCircle size={13} color="var(--accent)" />}
                </button>
              );
            })}
            {config.gripperType !== 'None' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {config.gripperType === 'Custom' && (
                  <Field label="MonoBehaviour 클래스명">
                    <input placeholder="예: MyGripperController" value={config.gripperBridgeClass}
                      onChange={e => update({ gripperBridgeClass: e.target.value })}
                      style={{ fontSize: 12 }} />
                  </Field>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Open 값 (%)">
                    <input type="number" min="0" max="100" value={config.gripperOpenValue}
                      onChange={e => update({ gripperOpenValue: parseFloat(e.target.value) })}
                      style={{ fontSize: 12 }} />
                  </Field>
                  <Field label="Close 값 (%)">
                    <input type="number" min="0" max="100" value={config.gripperCloseValue}
                      onChange={e => update({ gripperCloseValue: parseFloat(e.target.value) })}
                      style={{ fontSize: 12 }} />
                  </Field>
                </div>
              </div>
            )}
          </Section>

        </div>
        </div>
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, boxShadow: '0 -4px 16px rgba(0,0,0,0.04)' }}>
          {error && (
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b', marginBottom: 8 }}>
              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}
          <button className={saved ? 'btn-success' : 'btn-primary'}
            style={{ width: '100%', justifyContent: 'center', gap: 8 }}
            onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saving ? '저장 중…' : saved ? '✓ 저장 완료!' : '스테이징에 저장'}
          </button>
        </div>
      </div>

      {/* ── 우측: JSON 미리보기 ──────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg-base)' }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#fc5c57','#fdbc2c','#34c749'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: 4 }}>config.flange.json</span>
          </div>
          <pre style={{ padding: '20px 24px', fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono','Fira Code',monospace", color: '#1e293b', overflow: 'auto', background: 'var(--bg-panel)' }}>
            <JsonLines data={{ name: draft.name, urdfFile: `${draft.name}.urdf`, meshFolder: 'meshes', ...config }} />
          </pre>
        </div>
      </div>
    </div>
  );
}

function JsonLines({ data }) {
  return JSON.stringify(data, null, 2).split('\n').map((line, i) => {
    const m = line.match(/^(\s*)"([^"]+)":/);
    if (m) {
      const [full, indent, key] = m;
      return (
        <span key={i} style={{ display: 'block' }}>
          {indent}<span style={{ color: 'var(--accent)' }}>"{key}"</span>:{line.slice(full.length)}{'\n'}
        </span>
      );
    }
    return <span key={i} style={{ display: 'block' }}>{line}{'\n'}</span>;
  });
}
