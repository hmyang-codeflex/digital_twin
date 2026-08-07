import { useState, useEffect, useMemo } from 'react';
import { FileCode2, Plus, X, ChevronDown, Download, Cpu } from 'lucide-react';
import { createIR, createEmptyStep, DEMO_STEPS, FORMATS, STEP_TYPES, stepSummary, ROBOT_PRESETS, getRobotNamesFromLog, extractStepsFromLog } from '../utils/teachingExport.js';
import { downloadText, downloadZip } from '../utils/reportUtils.js';

const TYPE_COLOR = {
  MOVJ:    { bg: '#eff6ff', tx: '#1d4ed8' },
  MOVL:    { bg: '#f0fdf9', tx: '#0d7a6e' },
  GRIPPER: { bg: '#fdf4ff', tx: '#7e22ce' },
  DOUT:    { bg: '#fff7ed', tx: '#c05914' },
  WAIT:    { bg: '#f1f5f9', tx: '#475569' },
};

const VENDOR_COLOR = {
  Kawasaki: { bg: '#fff1f2', tx: '#be123c' },
  KUKA:     { bg: '#fffbeb', tx: '#b45309' },
  ABB:      { bg: '#eff6ff', tx: '#1d4ed8' },
};

// I3: 타임스탬프 → 읽기 좋은 날짜 문자열
function fmtDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function TeachingExportPanel({
  // I6: twinLog는 향후 "현재 트윈 자세 → 스텝으로 캡처" 기능을 위해 예약된 prop
  twinLog = [],
}) {
  const [catalogRobots, setCatalogRobots] = useState([]);
  const [selectedId,    setSelectedId]    = useState('');
  const [steps,         setSteps]         = useState([]);
  const [format,        setFormat]        = useState('KAS');
  const [addType,       setAddType]       = useState('MOVJ');
  const [expandedUid,   setExpandedUid]   = useState(null);
  const [loadingRobots, setLoadingRobots] = useState(false);
  // 트윈 추출
  const [captureOpen,   setCaptureOpen]   = useState(false);
  const [captureRobot,  setCaptureRobot]  = useState('');

  // twinLog에서 로봇 이름 목록 + 기본 선택
  const twinRobots = useMemo(() => getRobotNamesFromLog(twinLog), [twinLog]);
  useEffect(() => {
    if (twinRobots.length && !captureRobot) setCaptureRobot(twinRobots[0]);
  }, [twinRobots]);

  // 카탈로그 로봇 + 표준 기종 프리셋 병합
  const allRobots = useMemo(() => [
    ...catalogRobots.map(r => ({
      id: `c:${r.name}`,
      name: r.name,
      source: 'catalog',
      vendor: null,
      modelType: r.config?.modelType ?? 'GENERIC',
      dof: r.config?.jointLimits?.length ?? 6,
      jointLimits: r.config?.jointLimits ?? null,
      defaultFormat: null,
    })),
    ...ROBOT_PRESETS.map(p => ({
      id: `p:${p.name}`,
      name: p.name,
      source: 'preset',
      vendor: p.vendor,
      modelType: p.modelType,
      dof: p.dof,
      jointLimits: p.jointLimits,
      defaultFormat: p.defaultFormat,
    })),
  ], [catalogRobots]);

  // B3: electronAPI 미존재 시 TypeError 방지
  useEffect(() => {
    if (!window.electronAPI) { setLoadingRobots(false); return; }
    setLoadingRobots(true);
    window.electronAPI.getRobots()
      .then(list => { setCatalogRobots(list ?? []); })
      .catch(() => {})
      .finally(() => setLoadingRobots(false));
  }, []);

  // 초기 선택: allRobots 준비되면 첫 항목 자동 선택
  useEffect(() => {
    if (allRobots.length && !selectedId) {
      setSelectedId(allRobots[0].id);
    }
  }, [allRobots]);

  const selectedRobot = allRobots.find(r => r.id === selectedId) ?? null;

  // 로봇 변경 시 해당 기종의 기본 포맷으로 자동 전환
  useEffect(() => {
    if (selectedRobot?.defaultFormat) setFormat(selectedRobot.defaultFormat);
  }, [selectedId]);

  const ir      = useMemo(() => createIR(selectedRobot, steps), [selectedRobot, steps]);
  const preview = useMemo(() => {
    const fmt = FORMATS.find(f => f.id === format);
    return fmt ? fmt.render(ir) : '';
  }, [ir, format]);

  function addStep() {
    const s = { ...createEmptyStep(addType), _uid: `${Date.now()}_${Math.floor(Math.random() * 1e6)}` };
    setSteps(prev => [...prev, s]);
    setExpandedUid(s._uid);
  }

  function removeStep(uid) {
    setSteps(prev => prev.filter(s => s._uid !== uid));
    if (expandedUid === uid) setExpandedUid(null);
  }

  function updateStep(uid, patch) {
    setSteps(prev => prev.map(s => s._uid === uid ? { ...s, ...patch } : s));
  }

  // I1: 스텝 순서 변경 (dir: -1=위, +1=아래)
  function moveStep(uid, dir) {
    setSteps(prev => {
      const i = prev.findIndex(s => s._uid === uid);
      if (i < 0) return prev;
      const to = i + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });
  }

  // I2: 스텝 타입 변경 — 레이블만 유지하고 나머지는 새 기본값으로 교체
  function changeStepType(uid, newType) {
    setSteps(prev => prev.map(s => {
      if (s._uid !== uid) return s;
      return { ...createEmptyStep(newType), _uid: s._uid, label: s.label };
    }));
  }

  // B5: 기존 스텝이 있을 때 확인 후 데모 로드
  function loadDemo() {
    if (steps.length > 0 && !window.confirm('현재 스텝을 모두 삭제하고 데모 시퀀스를 로드합니까?')) return;
    const base = Date.now();
    setSteps(DEMO_STEPS.map((s, i) => ({ ...s, _uid: `${base}_${i}` })));
    setExpandedUid(null);
  }

  function clearAll() {
    setSteps([]);
    setExpandedUid(null);
  }

  function handleExtractFromTwin() {
    if (!captureRobot || !twinLog.length) return;
    const extracted = extractStepsFromLog(twinLog, captureRobot);
    if (!extracted.length) {
      window.alert(
        '추출된 스텝이 없습니다.\n' +
        '디지털 트윈에서 로봇 시퀀스가 실행된 후 분석하세요.\n' +
        `(현재 기록: ${twinLog.length}개 프레임)`
      );
      return;
    }
    const base = Date.now();
    const withUids = extracted.map((s, i) => ({ ...s, _uid: `${base}_${i}` }));

    if (steps.length > 0) {
      // 기존 스텝이 있으면 교체/추가 선택
      const replace = window.confirm(
        `현재 ${steps.length}개 스텝이 있습니다.\n` +
        `추출된 ${extracted.length}개 스텝으로 교체합니까?\n` +
        `(취소 → 현재 스텝 뒤에 추가)`
      );
      setSteps(replace ? withUids : prev => [...prev, ...withUids]);
    } else {
      setSteps(withUids);
    }
    setCaptureOpen(false);
    setExpandedUid(null);
  }

  // I3: 파일명에 읽기 좋은 날짜 포맷 적용
  function handleDownload() {
    const fmt = FORMATS.find(f => f.id === format);
    if (!fmt || !steps.length) return;
    const name = (selectedRobot?.name ?? 'robot').replace(/[^A-Za-z0-9]/g, '_');
    downloadText(`${name}_${fmtDate(Date.now())}.${fmt.ext}`, preview);
  }

  // 복수 로봇 ZIP — 트윈에서 감지된 전체 로봇 시퀀스를 현재 포맷으로 묶어 다운로드
  function handleDownloadAllZip() {
    const fmt = FORMATS.find(f => f.id === format);
    if (!fmt || !twinRobots.length || !twinLog.length) return;
    const files = [];
    for (const robotName of twinRobots) {
      const extracted = extractStepsFromLog(twinLog, robotName);
      if (!extracted.length) continue;
      const preset = ROBOT_PRESETS.find(p => p.name === robotName || p.modelType === robotName);
      const robot  = preset
        ? { name: preset.name, modelType: preset.modelType, dof: preset.dof }
        : { name: robotName,   modelType: 'GENERIC',        dof: 6 };
      const withUids = extracted.map((s, i) => ({ ...s, _uid: `${Date.now()}_${i}` }));
      const content  = fmt.render(createIR(robot, withUids));
      files.push({ name: `${robotName.replace(/[^A-Za-z0-9]/g, '_')}.${fmt.ext}`, content });
    }
    if (!files.length) { window.alert('추출 가능한 시퀀스가 없습니다.'); return; }
    downloadZip(`flangemaster_${fmtDate(Date.now())}.zip`, files);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── 헤더 ─────────────────────────────────────────────────── */}
      <div className="panel-header" style={{ boxShadow: 'var(--shadow-xs)', gap: 8 }}>
        <FileCode2 size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>티칭 시퀀스 추출기</span>
        <div style={{ flex: 1 }} />
        {/* 트윈 추출 버튼 — 기록이 있을 때만 표시 */}
        {twinLog.length > 0 && (
          <button
            className="btn-ghost"
            style={{
              fontSize: 11, padding: '5px 10px', height: 30,
              color: captureOpen ? 'var(--accent)' : 'var(--text-sub)',
              fontWeight: captureOpen ? 700 : 400,
            }}
            onClick={() => setCaptureOpen(v => !v)}
          >
            <Cpu size={12} style={{ marginRight: 4 }} />
            트윈에서 추출 ({twinLog.length})
          </button>
        )}
        <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px', height: 30 }} onClick={loadDemo}>
          데모 로드
        </button>
        {steps.length > 0 && (
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: '5px 10px', height: 30, color: 'var(--error)', borderColor: '#fca5a5' }}
            onClick={clearAll}
          >
            전체 삭제
          </button>
        )}
      </div>

      {/* ── 트윈 추출 패널 ──────────────────────────────────────────── */}
      {captureOpen && (
        <div style={{
          padding: '10px 16px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Cpu size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            디지털 트윈 기록 분석
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {twinLog.length}개 프레임
            {twinRobots.length > 0 && ` · ${twinRobots.length}개 로봇 감지`}
          </span>

          {/* 로봇 선택 (씬에 로봇이 여러 대일 때) */}
          {twinRobots.length > 1 && (
            <select
              value={captureRobot}
              onChange={e => setCaptureRobot(e.target.value)}
              style={{ fontSize: 12, height: 30 }}
            >
              {twinRobots.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {twinRobots.length === 1 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
              background: 'var(--bg-hover)', color: 'var(--text-sub)',
            }}>
              {captureRobot}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 10, color: 'var(--text-faint)', maxWidth: 240, lineHeight: 1.4 }}>
            instructionIdx 변화·Run→Idle 전환·grip 이벤트를 감지해 스텝을 자동 생성합니다
          </span>

          <button
            className="btn-primary"
            style={{ fontSize: 12, padding: '0 14px', height: 30, flexShrink: 0 }}
            onClick={handleExtractFromTwin}
            disabled={!captureRobot}
          >
            시퀀스 추출
          </button>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-faint)', padding: 4, display: 'flex', alignItems: 'center',
            }}
            onClick={() => setCaptureOpen(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 본문 ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* LEFT — 스텝 빌더 */}
        <div style={{ width: '46%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>

          {/* 로봇 선택 + 스텝 추가 */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)', display: 'flex', gap: 6, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 160px', display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{ flex: 1, fontSize: 12, height: 32, minWidth: 0 }}
                disabled={loadingRobots}
              >
                {catalogRobots.length > 0 && (
                  <optgroup label="카탈로그 로봇">
                    {catalogRobots.map(r => (
                      <option key={`c:${r.name}`} value={`c:${r.name}`}>{r.name}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="표준 기종">
                  {ROBOT_PRESETS.map(p => (
                    <option key={`p:${p.name}`} value={`p:${p.name}`}>{p.name}</option>
                  ))}
                </optgroup>
              </select>
              {selectedRobot?.vendor && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, flexShrink: 0,
                  background: VENDOR_COLOR[selectedRobot.vendor]?.bg ?? '#f1f5f9',
                  color:      VENDOR_COLOR[selectedRobot.vendor]?.tx ?? '#475569',
                }}>
                  {selectedRobot.vendor}
                </span>
              )}
            </div>

            <select
              value={addType}
              onChange={e => setAddType(e.target.value)}
              style={{ flex: '1 1 150px', fontSize: 12, height: 32 }}
            >
              {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>

            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '0 12px', height: 32, flexShrink: 0 }}
              onClick={addStep}
            >
              <Plus size={13} /> 추가
            </button>
          </div>

          {/* 스텝 목록 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {steps.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 56, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                <FileCode2 size={28} strokeWidth={1.2} style={{ marginBottom: 10, opacity: 0.4 }} />
                <p>스텝을 추가하거나 데모를 로드하세요</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>KAS / JBI / RAPID / KRL 포맷으로 추출됩니다</p>
              </div>
            ) : steps.map((s, i) => (
              <StepCard
                key={s._uid}
                step={s}
                index={i}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                expanded={expandedUid === s._uid}
                onToggle={() => setExpandedUid(id => id === s._uid ? null : s._uid)}
                onUpdate={patch => updateStep(s._uid, patch)}
                onRemove={() => removeStep(s._uid)}
                onMoveUp={() => moveStep(s._uid, -1)}
                onMoveDown={() => moveStep(s._uid, 1)}
                onChangeType={newType => changeStepType(s._uid, newType)}
                jointLimits={selectedRobot?.jointLimits ?? null}
              />
            ))}
          </div>

          {/* 스텝 수 푸터 */}
          {steps.length > 0 && (
            <div style={{
              padding: '6px 14px', borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-panel)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>총 <b style={{ color: 'var(--text-sub)' }}>{steps.length}</b>개 스텝</span>
              <span>{steps.filter(s => s.type === 'MOVJ' || s.type === 'MOVL').length}개 포지션</span>
            </div>
          )}
        </div>

        {/* RIGHT — 포맷 미리보기 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* 포맷 선택 + 다운로드 */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>출력 포맷</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  style={{
                    padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                    fontWeight: format === f.id ? 700 : 400,
                    background: format === f.id ? 'var(--accent)' : 'var(--bg-card)',
                    color:      format === f.id ? '#fff' : 'var(--text-sub)',
                    border:     format === f.id ? 'none' : '1px solid var(--border)',
                    transition: 'background 0.1s',
                    height: 30,
                  }}
                >
                  {f.id}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {/* 복수 로봇 ZIP — 트윈 로봇이 2개 이상일 때만 표시 */}
            {twinRobots.length > 1 && twinLog.length > 0 && (
              <button
                className="btn-ghost"
                style={{ fontSize: 12, padding: '0 12px', height: 32 }}
                onClick={handleDownloadAllZip}
              >
                <Download size={13} />
                ZIP ({twinRobots.length}개 로봇)
              </button>
            )}
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '0 14px', height: 32 }}
              onClick={handleDownload}
              disabled={steps.length === 0}
            >
              <Download size={13} />
              다운로드 (.{FORMATS.find(f => f.id === format)?.ext})
            </button>
          </div>

          {/* 미리보기 */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px' }}>
            <textarea
              readOnly
              value={steps.length ? preview : `; 스텝을 추가하면 ${format} 코드가 여기 표시됩니다`}
              style={{
                width: '100%', height: '100%', resize: 'none', outline: 'none',
                fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
                fontSize: 12.5, lineHeight: 1.65,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: steps.length ? 'var(--text)' : 'var(--text-faint)',
                padding: '12px 14px',
                tabSize: 4,
              }}
            />
          </div>

          {/* 포맷 설명 */}
          <div style={{
            padding: '6px 16px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-panel)',
          }}>
            {FORMATS.find(f => f.id === format)?.label}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StepCard ─────────────────────────────────────────────────────
function StepCard({ step, index, isFirst, isLast, expanded, onToggle, onUpdate, onRemove, onMoveUp, onMoveDown, onChangeType, jointLimits = null }) {
  const clr = TYPE_COLOR[step.type] ?? { bg: 'var(--bg-hover)', tx: 'var(--text-sub)' };

  function updateJoint(i, val) {
    const joints = [...(step.joints ?? [0, 0, 0, 0, 0, 0])];
    joints[i] = val;
    onUpdate({ joints });
  }

  function updateTcp(key, val) {
    onUpdate({ tcp: { ...(step.tcp ?? {}), [key]: val } });
  }

  const moveBtn = (label, handler, disabled) => (
    <button
      onClick={e => { e.stopPropagation(); handler(); }}
      disabled={disabled}
      title={label}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        padding: '1px 3px', fontSize: 11, lineHeight: 1,
        display: 'flex', alignItems: 'center', height: 'auto', flexShrink: 0,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {label === '위로' ? '▲' : '▼'}
    </button>
  );

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* 헤더 행 */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', minWidth: 18, flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
          background: clr.bg, color: clr.tx,
        }}>
          {step.type}
        </span>
        <span style={{
          fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: step.label ? 'var(--text-sub)' : 'var(--text-faint)',
        }}>
          {step.label || stepSummary(step)}
          {step.label && (
            <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 6 }}>{stepSummary(step)}</span>
          )}
        </span>

        {/* I1: 순서 변경 버튼 */}
        {moveBtn('위로', onMoveUp, isFirst)}
        {moveBtn('아래로', onMoveDown, isLast)}

        <ChevronDown
          size={12}
          color="var(--text-faint)"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
        />
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="삭제"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '2px 3px', display: 'flex', alignItems: 'center', height: 'auto', flexShrink: 0 }}
        >
          <X size={13} />
        </button>
      </div>

      {/* 확장 에디터 */}
      {expanded && (
        <div style={{
          padding: '10px 12px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* I2: 스텝 타입 변경 */}
          <FieldRow label="스텝 타입">
            <select
              value={step.type}
              onChange={e => onChangeType(e.target.value)}
              style={{ fontSize: 12, height: 28 }}
            >
              {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="레이블">
            <input
              value={step.label ?? ''}
              onChange={e => onUpdate({ label: e.target.value })}
              placeholder="스텝 설명 (선택)"
              style={{ fontSize: 12, height: 28 }}
            />
          </FieldRow>

          {step.type === 'MOVJ' && <>
            <FieldRow label="관절 (°) — J1 ~ J6">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {[0, 1, 2, 3, 4, 5].map(i => {
                  const lim = jointLimits?.[i];
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <input
                        type="number"
                        value={step.joints?.[i] ?? 0}
                        onChange={e => updateJoint(i, +e.target.value)}
                        min={lim?.min}
                        max={lim?.max}
                        title={lim ? `J${i + 1}: ${lim.min}° ~ ${lim.max}°` : `J${i + 1}`}
                        placeholder={`J${i + 1}`}
                        style={{ fontSize: 11, height: 26, textAlign: 'center' }}
                      />
                      {lim && (
                        <span style={{ fontSize: 8, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.2 }}>
                          {lim.min}~{lim.max}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </FieldRow>
            <SpeedZoneRow step={step} onUpdate={onUpdate} />
          </>}

          {step.type === 'MOVL' && <>
            <FieldRow label="TCP 위치 (mm)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {['x', 'y', 'z'].map(k => (
                  <input key={k} type="number" value={step.tcp?.[k] ?? 0}
                    onChange={e => updateTcp(k, +e.target.value)}
                    placeholder={k.toUpperCase()} style={{ fontSize: 11, height: 26 }} />
                ))}
              </div>
            </FieldRow>
            <FieldRow label="TCP 회전 (°)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {['rx', 'ry', 'rz'].map(k => (
                  <input key={k} type="number" value={step.tcp?.[k] ?? 0}
                    onChange={e => updateTcp(k, +e.target.value)}
                    placeholder={k.toUpperCase()} style={{ fontSize: 11, height: 26 }} />
                ))}
              </div>
            </FieldRow>
            <SpeedZoneRow step={step} onUpdate={onUpdate} />
          </>}

          {step.type === 'GRIPPER' && (
            <FieldRow label="동작">
              <select value={step.action ?? 'open'} onChange={e => onUpdate({ action: e.target.value })} style={{ fontSize: 12, height: 28 }}>
                <option value="open">열기 (Open)</option>
                <option value="close">닫기 (Close)</option>
              </select>
            </FieldRow>
          )}

          {step.type === 'DOUT' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <FieldRow label="채널">
                <input type="number" min={1} max={64} value={step.channel ?? 1}
                  onChange={e => onUpdate({ channel: +e.target.value })} style={{ fontSize: 12, height: 28 }} />
              </FieldRow>
              <FieldRow label="값">
                <select value={step.value ? 'on' : 'off'} onChange={e => onUpdate({ value: e.target.value === 'on' })} style={{ fontSize: 12, height: 28 }}>
                  <option value="on">ON</option>
                  <option value="off">OFF</option>
                </select>
              </FieldRow>
            </div>
          )}

          {step.type === 'WAIT' && (
            <FieldRow label="대기 시간 (초)">
              <input type="number" min={0} step={0.1} value={step.duration ?? 0.5}
                onChange={e => onUpdate({ duration: +e.target.value })} style={{ fontSize: 12, height: 28 }} />
            </FieldRow>
          )}
        </div>
      )}
    </div>
  );
}

function SpeedZoneRow({ step, onUpdate }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      <FieldRow label="속도 (0–1)">
        <input type="number" min={0} max={1} step={0.05} value={step.speed ?? 0.5}
          onChange={e => onUpdate({ speed: +e.target.value })} style={{ fontSize: 12, height: 28 }} />
      </FieldRow>
      <FieldRow label="Zone">
        <select value={step.zone ?? 'fine'} onChange={e => onUpdate({ zone: e.target.value })} style={{ fontSize: 12, height: 28 }}>
          {['fine', 'z5', 'z10', 'z20', 'z50'].map(z => <option key={z}>{z}</option>)}
        </select>
      </FieldRow>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
