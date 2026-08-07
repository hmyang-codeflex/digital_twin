import { useState, useEffect, useMemo } from 'react';
import { Workflow, Plus, X, ChevronDown, Download, Upload, Cpu } from 'lucide-react';
import { downloadText } from '../utils/reportUtils.js';
import { getRobotNamesFromLog } from '../utils/teachingExport.js';

// ConfigurableInstruction.cs가 지원하는 action 목록과 1:1 대응
const ACTION_TYPES = [
  { id: 'ptp',           label: 'PTP 이동' },
  { id: 'lin',           label: 'LIN 이동' },
  { id: 'wait',          label: '대기' },
  { id: 'gripper_close', label: '그리퍼 닫기' },
  { id: 'gripper_open',  label: '그리퍼 열기' },
  { id: 'log',           label: '로그' },
];

const ACTION_COLOR = {
  ptp:           { bg: '#eff6ff', tx: '#1d4ed8' },
  lin:           { bg: '#f0fdf9', tx: '#0d7a6e' },
  wait:          { bg: '#f1f5f9', tx: '#475569' },
  gripper_close: { bg: '#fdf4ff', tx: '#7e22ce' },
  gripper_open:  { bg: '#fdf4ff', tx: '#7e22ce' },
  log:           { bg: '#fff7ed', tx: '#c05914' },
};

function createEmptyStep(action) {
  switch (action) {
    case 'ptp':  return { action, target: '', speed: 1.0 };
    case 'lin':  return { action, target: '', speed: 0.3 };
    case 'wait': return { action, seconds: 0.5 };
    case 'log':  return { action, message: '' };
    default:     return { action };
  }
}

function stepSummary(step) {
  switch (step.action) {
    case 'ptp':
    case 'lin':  return step.target ? `→ ${step.target}` : '(타겟 미지정)';
    case 'wait': return `${step.seconds ?? 0}초`;
    case 'log':  return step.message || '(메시지 없음)';
    default:     return '';
  }
}

// 웹 스텝 상태 → ConfigurableInstruction.cs JSON 스키마로 직렬화
function buildSequenceJson(name, steps) {
  return {
    name: name || 'UnnamedSequence',
    steps: steps.map(({ action, target, speed, seconds, message }) => {
      const s = { action };
      if (action === 'ptp' || action === 'lin') {
        s.target = target || '';
        if (speed > 0) s.speed = speed;
      }
      if (action === 'wait') s.seconds = seconds ?? 0.5;
      if (action === 'log')  s.message = message || '';
      return s;
    }),
  };
}

export default function SequenceBuilderPanel({ twinLog = [] }) {
  const [name,        setName]        = useState('NewSequence');
  const [steps,        setSteps]      = useState([]);
  const [addType,      setAddType]    = useState('ptp');
  const [expandedUid,  setExpandedUid] = useState(null);
  const [importError,  setImportError] = useState('');
  const [targetRobot,  setTargetRobot] = useState('');
  const [saving,       setSaving]      = useState(false);
  const [savedPath,    setSavedPath]   = useState('');
  const [sequenceFiles, setSequenceFiles] = useState([]);

  function refreshSequenceFiles() {
    window.electronAPI?.getSequences?.().then(list => setSequenceFiles(list ?? []));
  }
  useEffect(() => { refreshSequenceFiles(); }, []);

  // 트윈에서 실시간으로 감지된 로봇 목록 — 씬에 실제 존재하는 로봇만 노출
  const twinRobots = useMemo(() => getRobotNamesFromLog(twinLog), [twinLog]);
  useEffect(() => {
    if (twinRobots.length && !twinRobots.includes(targetRobot)) setTargetRobot(twinRobots[0]);
  }, [twinRobots]);

  const stepsWithUid = useMemo(() => steps, [steps]);

  const json = useMemo(() => buildSequenceJson(name, steps), [name, steps]);
  const preview = useMemo(() => JSON.stringify(json, null, 2), [json]);

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

  function changeStepAction(uid, newAction) {
    setSteps(prev => prev.map(s => s._uid !== uid ? s : { ...createEmptyStep(newAction), _uid: uid }));
  }

  function clearAll() {
    if (steps.length > 0 && !window.confirm('현재 스텝을 모두 삭제합니까?')) return;
    setSteps([]);
    setExpandedUid(null);
  }

  function sequenceFileName() {
    const safeName = (name || 'sequence').replace(/[^A-Za-z0-9_-]/g, '_');
    const prefix = targetRobot ? `${targetRobot.replace(/[^A-Za-z0-9_-]/g, '_')}_` : '';
    return `${prefix}${safeName}.json`;
  }

  function handleDownload() {
    downloadText(sequenceFileName(), preview, 'application/json');
  }

  // Assets/StreamingAssets/sequences/에 바로 저장 — 파일을 직접 옮기고 Inspector에 경로를
  // 수동 등록하는 수고 없이, ConfigurableTask의 Sequence Files에는 여전히 상대경로를 입력해야 함
  async function handleSaveToUnity() {
    if (!window.electronAPI?.saveSequence) return;
    setSaving(true);
    setSavedPath('');
    try {
      const res = await window.electronAPI.saveSequence(sequenceFileName(), preview);
      if (res?.ok) {
        setSavedPath(res.relativePath);
        refreshSequenceFiles();
      } else {
        window.alert(`저장 실패: ${res?.error ?? '알 수 없는 오류'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.steps)) throw new Error('steps 배열이 없습니다.');
        const base = Date.now();
        const imported = parsed.steps.map((s, i) => ({
          ...createEmptyStep(s.action),
          ...s,
          _uid: `${base}_${i}`,
        }));
        setName(parsed.name || 'ImportedSequence');
        setSteps(imported);
        setExpandedUid(null);
      } catch (err) {
        setImportError(`가져오기 실패: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* 헤더 */}
      <div className="panel-header" style={{ boxShadow: 'var(--shadow-xs)', gap: 8 }}>
        <Workflow size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>노코드 태스크 시퀀스 빌더</span>
        <div style={{ flex: 1 }} />
        {twinRobots.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Cpu size={12} color="var(--text-faint)" />
            <select
              value={targetRobot}
              onChange={e => setTargetRobot(e.target.value)}
              title="이 시퀀스가 적용될 대상 로봇 (트윈에서 실시간 감지됨)"
              style={{ fontSize: 12, height: 30 }}
            >
              {twinRobots.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        <label
          className="btn-ghost"
          style={{ fontSize: 11, padding: '5px 10px', height: 30, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Upload size={12} /> JSON 가져오기
          <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: 'none' }} />
        </label>
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

      {importError && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--error)', background: 'rgba(224,82,82,0.08)' }}>
          {importError}
        </div>
      )}

      {/* 본문 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* LEFT — 스텝 빌더 */}
        <div style={{ width: '46%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>

          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="시퀀스 이름"
              style={{ fontSize: 12, height: 30 }}
            />
            {twinRobots.length === 0 && (
              <span style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.4 }}>
                트윈이 연결되면 씬의 로봇 목록이 표시됩니다. 타겟 필드는 해당 로봇의 자식 Transform 이름을 사용하세요.
              </span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={addType}
                onChange={e => setAddType(e.target.value)}
                style={{ flex: 1, fontSize: 12, height: 32 }}
              >
                {ACTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button
                className="btn-primary"
                style={{ fontSize: 12, padding: '0 12px', height: 32, flexShrink: 0 }}
                onClick={addStep}
              >
                <Plus size={13} /> 추가
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {stepsWithUid.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 56, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                <Workflow size={28} strokeWidth={1.2} style={{ marginBottom: 10, opacity: 0.4 }} />
                <p>스텝을 추가해 시퀀스를 구성하세요</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>ConfigurableTask JSON으로 export됩니다</p>
              </div>
            ) : stepsWithUid.map((s, i) => (
              <StepCard
                key={s._uid}
                step={s}
                index={i}
                isFirst={i === 0}
                isLast={i === stepsWithUid.length - 1}
                expanded={expandedUid === s._uid}
                onToggle={() => setExpandedUid(id => id === s._uid ? null : s._uid)}
                onUpdate={patch => updateStep(s._uid, patch)}
                onRemove={() => removeStep(s._uid)}
                onMoveUp={() => moveStep(s._uid, -1)}
                onMoveDown={() => moveStep(s._uid, 1)}
                onChangeAction={newAction => changeStepAction(s._uid, newAction)}
              />
            ))}
          </div>

          {stepsWithUid.length > 0 && (
            <div style={{
              padding: '6px 14px', borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-panel)',
            }}>
              총 <b style={{ color: 'var(--text-sub)' }}>{stepsWithUid.length}</b>개 스텝
            </div>
          )}
        </div>

        {/* RIGHT — JSON 미리보기 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)', display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>ConfigurableTask JSON 미리보기</span>
            <div style={{ flex: 1 }} />
            {savedPath && (
              <span style={{ fontSize: 11, color: 'var(--success)' }}>저장됨: {savedPath}</span>
            )}
            {window.electronAPI?.saveSequence && (
              <button
                className="btn-primary"
                style={{ fontSize: 12, padding: '0 14px', height: 32 }}
                onClick={handleSaveToUnity}
                disabled={steps.length === 0 || saving}
              >
                <Upload size={13} /> {saving ? '저장 중…' : 'Unity로 저장'}
              </button>
            )}
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '0 14px', height: 32 }}
              onClick={handleDownload}
              disabled={steps.length === 0}
            >
              <Download size={13} /> 다운로드 (.json)
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px' }}>
            <textarea
              readOnly
              value={preview}
              style={{
                width: '100%', height: '100%', resize: 'none', outline: 'none',
                fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
                fontSize: 12.5, lineHeight: 1.65,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: steps.length ? 'var(--text)' : 'var(--text-faint)',
                padding: '12px 14px',
                tabSize: 2,
              }}
            />
          </div>

          <div style={{
            padding: '6px 16px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-panel)',
          }}>
            {window.electronAPI?.saveSequence
              ? `'Unity로 저장'을 누르면 Assets/StreamingAssets/sequences/에 파일이 바로 생성됩니다. `
              : 'Assets/StreamingAssets/sequences/ 에 저장 후 '}
            {targetRobot ? `${targetRobot}의 ` : ''}
            ConfigurableTask의 Sequence Files에 상대경로(예: sequences/{sequenceFileName()})를 등록하세요.
            타겟 필드는{targetRobot ? ` ${targetRobot}` : ' 해당 로봇'}의 자식 Transform 이름을 우선 검색합니다.
            {sequenceFiles.length > 0 && (
              <span style={{ display: 'block', marginTop: 4, color: 'var(--text-faint)' }}>
                현재 스테이징된 시퀀스: {sequenceFiles.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StepCard ─────────────────────────────────────────────────────
function StepCard({ step, index, isFirst, isLast, expanded, onToggle, onUpdate, onRemove, onMoveUp, onMoveDown, onChangeAction }) {
  const clr = ACTION_COLOR[step.action] ?? { bg: 'var(--bg-hover)', tx: 'var(--text-sub)' };
  const label = ACTION_TYPES.find(t => t.id === step.action)?.label ?? step.action;

  const moveBtn = (dirLabel, handler, disabled) => (
    <button
      onClick={e => { e.stopPropagation(); handler(); }}
      disabled={disabled}
      title={dirLabel}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        padding: '1px 3px', fontSize: 11, lineHeight: 1,
        display: 'flex', alignItems: 'center', height: 'auto', flexShrink: 0,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {dirLabel === '위로' ? '▲' : '▼'}
    </button>
  );

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
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
          {label}
        </span>
        <span style={{
          fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-sub)',
        }}>
          {stepSummary(step)}
        </span>

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

      {expanded && (
        <div style={{
          padding: '10px 12px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <FieldRow label="액션">
            <select
              value={step.action}
              onChange={e => onChangeAction(e.target.value)}
              style={{ fontSize: 12, height: 28 }}
            >
              {ACTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FieldRow>

          {(step.action === 'ptp' || step.action === 'lin') && <>
            <FieldRow label="타겟 (씬의 Transform 이름)">
              <input
                value={step.target ?? ''}
                onChange={e => onUpdate({ target: e.target.value })}
                placeholder="예: PickApproach"
                style={{ fontSize: 12, height: 28 }}
              />
            </FieldRow>
            <FieldRow label="속도 (0–1)">
              <input
                type="number" min={0} max={1} step={0.05}
                value={step.speed ?? 1.0}
                onChange={e => onUpdate({ speed: +e.target.value })}
                style={{ fontSize: 12, height: 28 }}
              />
            </FieldRow>
          </>}

          {step.action === 'wait' && (
            <FieldRow label="대기 시간 (초)">
              <input
                type="number" min={0} step={0.1}
                value={step.seconds ?? 0.5}
                onChange={e => onUpdate({ seconds: +e.target.value })}
                style={{ fontSize: 12, height: 28 }}
              />
            </FieldRow>
          )}

          {step.action === 'log' && (
            <FieldRow label="메시지">
              <input
                value={step.message ?? ''}
                onChange={e => onUpdate({ message: e.target.value })}
                placeholder="로그로 남길 메시지"
                style={{ fontSize: 12, height: 28 }}
              />
            </FieldRow>
          )}

          {(step.action === 'gripper_open' || step.action === 'gripper_close') && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
              추가 파라미터가 필요 없습니다. ConfigurableTask에 연결된 GripperEventBridge를 사용합니다.
            </p>
          )}
        </div>
      )}
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
