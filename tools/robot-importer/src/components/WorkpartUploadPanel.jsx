import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Box, ArrowRight, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { loadMesh, SUPPORTED_MESH_EXTS } from '../utils/meshLoader.js';

const SUPPORTED_EXTS = SUPPORTED_MESH_EXTS;

export default function WorkpartUploadPanel({ draft, onChange, onNext }) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── 씬 초기화 ──────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let rafId, cleanupFn;
    rafId = requestAnimationFrame(() => {
      if (!mountRef.current) return;
      const W = el.offsetWidth || 800;
      const H = el.offsetHeight || 600;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      const canvas = renderer.domElement;
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf7f6f3);

      const camera = new THREE.PerspectiveCamera(42, W / H, 0.001, 200);
      camera.position.set(0.3, 0.25, 0.3);

      scene.add(new THREE.AmbientLight(0xdde5f5, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(5, 10, 7);
      sun.castShadow = true;
      scene.add(sun);
      const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.4);
      fillLight.position.set(-4, 3, -3);
      scene.add(fillLight);

      const grid = new THREE.GridHelper(2, 20, 0xc8d0e8, 0xdde3f0);
      scene.add(grid);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 0.01;
      controls.maxDistance = 20;

      let animId;
      const animate = () => { animId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
      animate();

      const ro = new ResizeObserver(() => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      });
      ro.observe(el);

      sceneRef.current = { scene, camera, controls };
      setSceneReady(true);
      cleanupFn = () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.dispose();
        if (el.contains(canvas)) el.removeChild(canvas);
        setSceneReady(false);
      };
    });

    return () => { cancelAnimationFrame(rafId); cleanupFn?.(); };
  }, []);

  // ── 메쉬 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneReady || !sceneRef.current || !draft.meshPath) return;
    const { scene, camera, controls } = sceneRef.current;
    setLoadError('');
    setIsFallback(false);

    // 이전 메쉬 제거
    const prev = scene.getObjectByName('__mesh__');
    if (prev) { prev.traverse(c => { c.geometry?.dispose(); [c.material].flat().forEach(m => m?.dispose()); }); scene.remove(prev); }

    loadMesh(draft.meshPath, {
      onError: (message) => {
        console.error('[MeshLoader]', message);
        setLoadError(message);
      },
      onLoad: (obj, { isFallback }) => {
        setIsFallback(isFallback);
        scene.add(obj);

        const box = new THREE.Box3().setFromObject(obj);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size   = box.getSize(new THREE.Vector3());
          obj.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
          const dist = Math.max(size.length() * 1.5, 0.05);
          camera.position.set(dist * 0.8, size.y * 0.6 + dist * 0.1, dist * 0.8);
          controls.target.set(0, size.y * 0.3, 0);
          controls.update();
        }
      },
    });
  }, [draft.meshPath, sceneReady]);

  const applyMeshPath = (p) => {
    const name = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    onChange({ ...draft, meshPath: p, name: draft.name || name });
  };

  const handleSelect = async () => {
    const p = await window.electronAPI.selectMesh();
    if (p) applyMeshPath(p);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!SUPPORTED_EXTS.includes(ext)) return;
    applyMeshPath(file.path);
  };

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
          <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(15,15,15,0.08)' }}>
            <Box size={38} strokeWidth={1.2} color="var(--accent)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>메쉬 파일 여기에 놓기</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>STL / OBJ / GLTF / GLB / FBX 파일을 지원합니다</p>
          </div>
        </div>
      )}
      {/* 좌측 패널 */}
      <div style={{ width: 320, background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ padding: '24px 24px 0' }}>
          <p className="section-title">워크파츠 임포트</p>
          <p className="section-desc">STL / OBJ / GLTF / FBX 파일을 선택하거나 창에 <b>드래그</b>하세요.</p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          {/* 메쉬 파일 */}
          <div>
            <span className="label">메쉬 파일</span>
            <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }} onClick={handleSelect}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: draft.meshPath ? 'var(--accent-dim)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Box size={15} color={draft.meshPath ? 'var(--accent)' : 'var(--text-muted)'} />
              </div>
              <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: draft.meshPath ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draft.meshPath ? draft.meshPath.split(/[\\/]/).pop() : '파일 선택 또는 드래그…'}
                </div>
                {draft.meshPath && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {draft.meshPath}
                  </div>
                )}
              </div>
              {draft.meshPath ? <CheckCircle size={15} color="var(--accent)" style={{ flexShrink: 0 }} /> : <ArrowRight size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />}
            </button>
          </div>

          {/* 이름 */}
          {draft.meshPath && (
            <div>
              <span className="label">워크파츠 이름</span>
              <input value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} placeholder="예: BoltPlate_01" />
            </div>
          )}

          {/* 포맷 안내 */}
          {!draft.meshPath && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--accent)' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              지원 포맷: STL, OBJ, GLTF, GLB, FBX
            </div>
          )}

          {/* 로드 에러 */}
          {loadError && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#991b1b' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {loadError}
            </div>
          )}

          {/* 폴백 렌더링 경고 */}
          {isFallback && !loadError && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#92400e' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              원본 메쉬를 불러오지 못해 대체 도형을 표시하고 있습니다. 파일 경로/포맷을 확인하세요.
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }} disabled={!draft.meshPath || !draft.name} onClick={onNext}>
              다음: 프리셋 설정
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 3D 뷰어 */}
      <div style={{ flex: 1, position: 'relative', background: '#f7f6f3', overflow: 'hidden' }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
        {!draft.meshPath && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
              <Box size={32} strokeWidth={1.2} color="var(--text-sub)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-sub)' }}>3D 미리보기</p>
              <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>메쉬를 선택하거나 창에 드래그하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
