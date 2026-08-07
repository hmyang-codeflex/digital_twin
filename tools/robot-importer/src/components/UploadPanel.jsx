import { useState } from 'react';
import { FolderOpen, FileCode, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import ModelViewer from './ModelViewer.jsx';

export default function UploadPanel({ draft, onChange, onNext }) {
  const [parsing, setParsing]       = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const parseUrdfJoints = async (urdfPath) => {
    const xml = await window.electronAPI.readFile(urdfPath);
    if (!xml) return [];
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return Array.from(doc.querySelectorAll('joint'))
      .filter(j => j.getAttribute('type') !== 'fixed')
      .map(j => {
        const name  = j.getAttribute('name');
        const limit = j.querySelector('limit');
        const todeg = (rad) => Math.round(parseFloat(rad) * 180 / Math.PI);
        const min = limit?.getAttribute('lower') != null ? todeg(limit.getAttribute('lower')) : -180;
        const max = limit?.getAttribute('upper') != null ? todeg(limit.getAttribute('upper')) : 180;
        return { name, min, max };
      })
      .filter(j => j.name);
  };

  const processUrdfPath = async (p) => {
    const name = p.split(/[\\/]/).pop().replace(/\.(urdf|xacro)$/, '');
    setParsing(true);
    const joints = await parseUrdfJoints(p);
    setParsing(false);
    onChange({ ...draft, urdfPath: p, name: draft.name || name, joints });
  };

  const handleSelectUrdf = async () => {
    const p = await window.electronAPI.selectUrdf();
    if (p) await processUrdfPath(p);
  };

  const handleSelectMeshFolder = async () => {
    const p = await window.electronAPI.selectMeshFolder();
    if (p) onChange({ ...draft, meshFolder: p });
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'urdf' && ext !== 'xacro') return;
    await processUrdfPath(file.path);
  };

  const ready = draft.urdfPath && draft.name;

  return (
    <div
      style={{ display: 'flex', height: '100%', position: 'relative' }}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
          background: 'rgba(55,53,47,0.04)', border: '2px dashed var(--accent)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'rgba(255,255,255,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(15,15,15,0.08)',
          }}>
            <FileCode size={38} strokeWidth={1.2} color="var(--accent)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>URDF 파일 여기에 놓기</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>.urdf / .xacro 파일을 지원합니다</p>
          </div>
        </div>
      )}

      {/* ── 좌측 패널 ── */}
      <div style={{
        width: 340, background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '24px 24px 0' }}>
          <p className="section-title">로봇 모델 임포트</p>
          <p className="section-desc">URDF 파일과 메쉬 폴더를 선택하거나 창에 <b>드래그</b>하세요.</p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          <div>
            <span className="label">URDF 파일</span>
            <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }} onClick={handleSelectUrdf}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: draft.urdfPath ? 'var(--accent-dim)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileCode size={15} color={draft.urdfPath ? 'var(--accent)' : 'var(--text-muted)'} />
              </div>
              <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: draft.urdfPath ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draft.urdfPath ? draft.urdfPath.split(/[\\/]/).pop() : '파일 선택 또는 드래그…'}
                </div>
                {draft.urdfPath && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.urdfPath}</div>
                )}
              </div>
              {draft.urdfPath ? <CheckCircle size={15} color="var(--accent)" style={{ flexShrink: 0 }} /> : <ArrowRight size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />}
            </button>
          </div>

          <div>
            <span className="label">메쉬 폴더 <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(STL / DAE)</span></span>
            <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }} onClick={handleSelectMeshFolder}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: draft.meshFolder ? 'var(--accent-dim)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderOpen size={15} color={draft.meshFolder ? 'var(--accent)' : 'var(--text-muted)'} />
              </div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 500, color: draft.meshFolder ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft.meshFolder ? draft.meshFolder.split(/[\\/]/).pop() : '폴더 선택…'}
              </span>
              {draft.meshFolder ? <CheckCircle size={15} color="var(--accent)" style={{ flexShrink: 0 }} /> : <ArrowRight size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />}
            </button>
          </div>

          {draft.urdfPath && (
            <div>
              <span className="label">로봇 이름</span>
              <input value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} placeholder="예: ABB_IRB6700_235" />
            </div>
          )}

          {parsing && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>URDF 파싱 중…</div>
          )}
          {draft.joints?.length > 0 && (
            <div>
              <span className="label">감지된 조인트 ({draft.joints.length}개)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {draft.joints.map((j, i) => (
                  <span key={`${j.name}_${i}`} style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{i + 1}</span>{j.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {draft.urdfPath && !draft.meshFolder && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--warning-dim)', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--warning)' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>메쉬 폴더를 선택하지 않으면 3D 미리보기가 표시되지 않을 수 있습니다.</span>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }} disabled={!ready} onClick={onNext}>
              다음: Flange 설정 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 우측: 3D 뷰어 ── */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg-base)', overflow: 'hidden' }}>
        <ModelViewer urdfPath={draft.urdfPath} meshFolder={draft.meshFolder} />
        {!draft.urdfPath && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
              <FileCode size={32} strokeWidth={1.2} color="var(--accent)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-sub)' }}>3D 미리보기</p>
              <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>URDF를 선택하거나 창에 드래그하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
