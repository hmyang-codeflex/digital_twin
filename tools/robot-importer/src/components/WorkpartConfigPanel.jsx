import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Save, Trash2, MapPin, Hand, CheckCircle, AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Info, Circle } from 'lucide-react';
import { loadMesh } from '../utils/meshLoader.js';

const PRESETS = [
  { id: 'pick_place',      label: '집어들기 워크파츠', desc: 'Part + GripPoints + Rigidbody', color: '#37352f',
    note: '차체 프레임, 패널, 박스 등 그리퍼로 파지하는 일반 워크파츠' },
  { id: 'suction_workpart',label: '흡착 워크파츠',    desc: 'Part + SuctionPoints + Rigidbody', color: '#37352f',
    note: '차량 유리, 평판 패널 등 진공 흡착컵으로 집는 워크파츠' },
  { id: 'bolt_workpart',   label: '볼트 조립 워크파츠', desc: 'Part + HoleBoltInspector + GripPoints', color: '#dc2626',
    note: '볼팅 공정 대상물, 홀 위치를 검사하는 워크파츠' },
  { id: 'static_fixture',  label: '고정 픽스처',       desc: 'MeshCollider (Static)', color: '#37352f',
    note: '지그, 기준 핀, 가이드 레일 등 씬에 고정된 구조물' },
  { id: 'conveyor',        label: '컨베이어',           desc: 'realvirtual Drive + TransportSurface', color: '#37352f',
    note: '이송 벨트. realvirtual Drive + TransportSurface 자동 추가' },
];

const UNITY_LAYERS = ['Default', 'Workpart', 'Conveyor', 'Robot', 'Ignore Raycast', 'UI'];
const UNITY_TAGS   = ['Untagged', 'Workpart', 'Bolt', 'Fixture', 'Conveyor', 'Player'];
const DIRECTIONS   = ['X+', 'X-', 'Y+', 'Y-', 'Z+', 'Z-'];

// ── 섹션 컴포넌트 ──────────────────────────────────────────────
function Section({ title, color = 'var(--accent)', defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        width: '100%', padding: '9px 12px', background: 'var(--bg-card)',
        border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.04em', flex: 1 }}>{title}</span>
        {badge != null && (
          <span style={{ fontSize: 11, background: color + '22', color, borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>{badge}</span>
        )}
        {open ? <ChevronDown size={12} color="var(--text-faint)" /> : <ChevronRight size={12} color="var(--text-faint)" />}
      </button>
      {open && <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
}

// ── 라벨 + 입력 묶음 ──────────────────────────────────────────
function Field({ label, note, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {note}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Vec3 편집 ─────────────────────────────────────────────────
function Vec3Input({ value, onChange, step = 0.001, label = ['X', 'Y', 'Z'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
      {['x', 'y', 'z'].map((ax, i) => (
        <div key={ax}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>{label[i] ?? ax.toUpperCase()}</span>
          <input type="number" step={step} value={value[ax]}
            onChange={e => onChange({ ...value, [ax]: parseFloat(e.target.value) || 0 })}
            style={{ padding: '4px 6px', fontSize: 11 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── 포인트 목록 행 ─────────────────────────────────────────────
function PointRow({ icon, color, label, sub, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '5px 8px', fontSize: 11,
    }}>
      <div style={{ color, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-sub)' }}>{label}</div>
        {sub && <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 10 }}>{sub}</div>}
      </div>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={onDelete}>
        <Trash2 size={11} color="var(--text-muted)" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function WorkpartConfigPanel({ draft, onChange, onSaved }) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const meshRef    = useRef(null);
  const [sceneReady, setSceneReady] = useState(false);
  // 'none' | 'hole' | 'grip'
  const [clickMode, setClickMode] = useState('none');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);
  const [meshLoadError, setMeshLoadError] = useState('');
  const [isFallback, setIsFallback] = useState(false);

  const set = (patch) => onChange({ ...draft, ...patch });

  // ── 씬 초기화 ──────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let animId, cleanupFn;

    requestAnimationFrame(() => {
      if (!mountRef.current) return;
      const W = el.offsetWidth || 800;
      const H = el.offsetHeight || 600;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

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
      const fill = new THREE.DirectionalLight(0xc8d8ff, 0.4);
      fill.position.set(-4, 3, -3);
      scene.add(fill);
      scene.add(new THREE.GridHelper(2, 20, 0xc8d0e8, 0xdde3f0));

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 0.001;
      controls.maxDistance = 20;

      const animate = () => { animId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
      animate();

      const ro = new ResizeObserver(() => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      });
      ro.observe(el);

      sceneRef.current = { scene, camera, controls, renderer };
      setSceneReady(true);
      cleanupFn = () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.dispose();
        if (el.contains(canvas)) el.removeChild(canvas);
        setSceneReady(false);
      };
    });

    return () => { cleanupFn?.(); };
  }, []);

  // ── 씬 배경 — 클릭 모드 반영 ─────────────────────────────────
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    sceneRef.current.scene.background = new THREE.Color(clickMode !== 'none' ? 0x1a2030 : 0xf7f6f3);
  }, [clickMode, sceneReady]);

  // ── 메쉬 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneReady || !sceneRef.current || !draft.meshPath) return;
    const { scene, camera, controls } = sceneRef.current;

    const prev = scene.getObjectByName('__mesh__');
    if (prev) { prev.traverse(c => { c.geometry?.dispose(); [c.material].flat().forEach(m => m?.dispose()); }); scene.remove(prev); }
    meshRef.current = null;
    setMeshLoadError('');
    setIsFallback(false);

    loadMesh(draft.meshPath, {
      onError: (message) => {
        console.error('[MeshLoader ConfigPanel]', message);
        setMeshLoadError(message);
      },
      onLoad: (obj, { isFallback }) => {
        setIsFallback(isFallback);
        scene.add(obj);
        meshRef.current = obj;

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

  // ── 마커 동기화 (홀 + 그립 + 흡착) ──────────────────────────
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    const { scene } = sceneRef.current;
    scene.children.filter(c => c.name.startsWith('__pt_')).forEach(c => scene.remove(c));

    const addNormalArrow = (pos, n, color, label) => {
      if (!n || (n.nx === 0 && n.ny === 0 && n.nz === 0)) return;
      const dir = new THREE.Vector3(n.nx, n.ny, n.nz).normalize();
      const arrow = new THREE.ArrowHelper(dir, pos, 0.025, color, 0.007, 0.005);
      arrow.name = label; scene.add(arrow);
    };

    (draft.holePoints ?? []).forEach((hp, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff4422 }));
      s.position.set(hp.x, hp.y, hp.z); s.name = `__pt_hole_${i}`; scene.add(s);
    });
    (draft.gripPoints ?? []).forEach((gp, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 10), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
      s.position.set(gp.x, gp.y, gp.z); s.name = `__pt_grip_${i}`; scene.add(s);
      addNormalArrow(s.position, gp, 0xf59e0b, `__pt_grip_arrow_${i}`);
    });
    (draft.suctionPoints ?? []).forEach((sp, i) => {
      const r = draft.suctionCupRadius ?? 0.04;
      // 흡착컵 → 원형 링 + 노멀 화살표
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.003, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x2383e2 }),
      );
      ring.position.set(sp.x, sp.y, sp.z);
      if (sp.nx != null && (sp.nx !== 0 || sp.ny !== 0 || sp.nz !== 0)) {
        const normal = new THREE.Vector3(sp.nx, sp.ny, sp.nz).normalize();
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      }
      ring.name = `__pt_suction_${i}`; scene.add(ring);
      addNormalArrow(ring.position, sp, 0x2383e2, `__pt_suction_arrow_${i}`);
    });
  }, [draft.holePoints, draft.gripPoints, draft.suctionPoints, draft.suctionCupRadius, sceneReady]);

  // ── 클릭 이벤트 ───────────────────────────────────────────────
  useEffect(() => {
    if (clickMode === 'none' || !sceneReady || !sceneRef.current) return;
    const { camera, renderer } = sceneRef.current;
    const canvas = renderer.domElement;

    const onClick = (e) => {
      if (!meshRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const hits = rc.intersectObject(meshRef.current, true);
      if (!hits.length) return;

      const pt = hits[0].point.clone();
      const p = { x: +pt.x.toFixed(5), y: +pt.y.toFixed(5), z: +pt.z.toFixed(5) };

      // 월드 노멀 계산 (grip / suction / hole 공통)
      let nx = 0, ny = 1, nz = 0;
      if (hits[0].face) {
        const normal = hits[0].face.normal.clone();
        const mat4 = hits[0].object.matrixWorld.clone();
        mat4.setPosition(0, 0, 0);
        normal.applyMatrix4(mat4).normalize();
        nx = +normal.x.toFixed(4); ny = +normal.y.toFixed(4); nz = +normal.z.toFixed(4);
      }

      if (clickMode === 'hole') {
        onChange({ ...draft, holePoints: [...(draft.holePoints ?? []), p] });
      } else if (clickMode === 'grip') {
        onChange({ ...draft, gripPoints: [...(draft.gripPoints ?? []), { ...p, nx, ny, nz }] });
      } else if (clickMode === 'suction') {
        onChange({ ...draft, suctionPoints: [...(draft.suctionPoints ?? []), { ...p, nx, ny, nz }] });
      }
    };

    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'crosshair';
    return () => { canvas.removeEventListener('click', onClick); canvas.style.cursor = 'default'; };
  }, [clickMode, sceneReady, draft, onChange]);

  // ── 저장 ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft.name?.trim()) { setError('워크파츠 이름을 입력하세요'); return; }
    if (!draft.meshPath)      { setError('메쉬 파일을 선택하세요'); return; }
    setError(''); setSaving(true);
    const res = await window.electronAPI.saveWorkpart({
      name:     draft.name,
      meshPath: draft.meshPath,
      config: {
        preset:          draft.preset,
        unityLayer:      draft.unityLayer      ?? 'Default',
        unityTag:        draft.unityTag        ?? 'Untagged',
        convexCollider:  draft.convexCollider  ?? false,
        physicsMaterial: draft.physicsMaterial ?? { staticFriction: 0.6, dynamicFriction: 0.6, bounciness: 0.0 },
        mass:            draft.mass,
        isKinematic:     draft.isKinematic,
        isStatic:        draft.isStatic        ?? false,
        // pick_place
        gripPoints:       draft.gripPoints       ?? [],
        // suction_workpart
        suctionPoints:    draft.suctionPoints    ?? [],
        suctionCupRadius: draft.suctionCupRadius ?? 0.04,
        isFragile:        draft.isFragile        ?? false,
        // bolt_workpart
        holePoints:       draft.holePoints       ?? [],
        detectionSize:    draft.detectionSize,
        holeCenterOffset: draft.holeCenterOffset ?? { x: 0, y: 0, z: 0 },
        boltMask:         draft.boltMask         ?? 0,
        showHoleGizmo:    draft.showHoleGizmo    ?? true,
        boltTag:          draft.boltTag          ?? '',
        requirePart:      draft.requirePart      ?? true,
        // conveyor
        conveyorSpeed:   draft.conveyorSpeed   ?? 0.3,
        conveyorDir:     draft.conveyorDir     ?? 'Z+',
        conveyorFriction:draft.conveyorFriction?? 0.5,
      },
    });
    setSaving(false);
    if (!res.ok) { setError(res.error || '저장 실패'); return; }
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 900);
  };

  const isBolt      = draft.preset === 'bolt_workpart';
  const isConv      = draft.preset === 'conveyor';
  const isPickPlace = draft.preset === 'pick_place';
  const isSuction   = draft.preset === 'suction_workpart';
  const isStatic    = draft.isStatic ?? false;

  const ModeBtn = ({ mode, color, icon: Icon, label }) => (
    <button onClick={() => setClickMode(v => v === mode ? 'none' : mode)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        background: clickMode === mode ? color : 'var(--bg-card)',
        color: clickMode === mode ? '#fff' : 'var(--text-muted)',
        border: `1px solid ${clickMode === mode ? color : 'var(--border)'}`,
        transition: 'all 0.15s',
      }}>
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* ── 좌측 설정 패널 ──────────────────────────────────────── */}
      <div style={{ width: 340, background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '18px 16px 0' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>워크파츠 설정</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Unity 컴포넌트 및 물리 속성을 구성합니다.</p>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>

          {/* ── 프리셋 ─────────────────────────────────────────── */}
          <Section title="프리셋" color="#37352f">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {PRESETS.map(p => {
                const active = draft.preset === p.id;
                const isBolt = p.id === 'bolt_workpart';
                return (
                  <button key={p.id} onClick={() => set({ preset: p.id })} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%',
                    background: active
                      ? (isBolt ? 'var(--error-dim)' : 'var(--bg-hover)')
                      : 'var(--bg-card)',
                    border: `1px solid ${active
                      ? (isBolt ? '#f5b8bb' : 'var(--border-strong)')
                      : 'var(--border)'}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: active ? (isBolt ? 'var(--error)' : 'var(--text)') : 'var(--text-sub)',
                        marginBottom: 2,
                      }}>
                        {p.label}
                      </div>
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.desc}
                      </div>
                    </div>
                    {active && (
                      <CheckCircle size={14} color={isBolt ? 'var(--error)' : 'var(--text)'} style={{ flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Unity 통합 ─────────────────────────────────────── */}
          <Section title="Unity 통합" color="#37352f">
            <Field label="Layer">
              <select value={draft.unityLayer ?? 'Default'} onChange={e => set({ unityLayer: e.target.value })} style={{ fontSize: 12 }}>
                {UNITY_LAYERS.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="__custom__">직접 입력…</option>
              </select>
              {(draft.unityLayer === '__custom__') && (
                <input placeholder="레이어 이름" value={draft.unityLayerCustom ?? ''} onChange={e => set({ unityLayerCustom: e.target.value, unityLayer: e.target.value })} style={{ marginTop: 4, fontSize: 12 }} />
              )}
            </Field>
            <Field label="Tag">
              <select value={draft.unityTag ?? 'Untagged'} onChange={e => set({ unityTag: e.target.value })} style={{ fontSize: 12 }}>
                {UNITY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="__custom__">직접 입력…</option>
              </select>
              {(draft.unityTag === '__custom__') && (
                <input placeholder="태그 이름" value={draft.unityTagCustom ?? ''} onChange={e => set({ unityTagCustom: e.target.value, unityTag: e.target.value })} style={{ marginTop: 4, fontSize: 12 }} />
              )}
            </Field>
          </Section>

          {/* ── 충돌체 ─────────────────────────────────────────── */}
          <Section title="충돌체 (Collider)" color="#37352f">
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.convexCollider ?? false} onChange={e => set({ convexCollider: e.target.checked })} style={{ accentColor: '#37352f' }} />
              Convex Collider
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(그리퍼 충돌 가능)</span>
            </label>
            <Field label="PhysicsMaterial">
              {[['staticFriction', '정지 마찰'], ['dynamicFriction', '운동 마찰'], ['bounciness', '탄성']].map(([k, label]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 62, flexShrink: 0 }}>{label}</span>
                  <input type="range" min="0" max="1" step="0.01"
                    value={draft.physicsMaterial?.[k] ?? (k === 'bounciness' ? 0 : 0.6)}
                    onChange={e => set({ physicsMaterial: { ...(draft.physicsMaterial ?? {}), [k]: parseFloat(e.target.value) } })}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-sub)', width: 30, textAlign: 'right' }}>
                    {(draft.physicsMaterial?.[k] ?? (k === 'bounciness' ? 0 : 0.6)).toFixed(2)}
                  </span>
                </div>
              ))}
            </Field>
          </Section>

          {/* ── 물리 ───────────────────────────────────────────── */}
          <Section title="물리 (Rigidbody)" color="#37352f">
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={isStatic} onChange={e => set({ isStatic: e.target.checked, isKinematic: !e.target.checked })} style={{ accentColor: '#37352f' }} />
              Static Object
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Rigidbody 없음, 완전 고정)</span>
            </label>
            {!isStatic && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={draft.isKinematic ?? true} onChange={e => set({ isKinematic: e.target.checked })} style={{ accentColor: '#37352f' }} />
                  Is Kinematic
                </label>
                <Field label="Mass (kg)">
                  <input type="number" step="0.1" min="0" value={draft.mass ?? 1} onChange={e => set({ mass: parseFloat(e.target.value) || 1 })} style={{ fontSize: 12 }} />
                </Field>
              </>
            )}
          </Section>

          {/* ═══ pick_place 전용 ══════════════════════════════ */}
          {isPickPlace && (
            <Section title="그립 포인트" color="#37352f" badge={draft.gripPoints?.length ?? 0}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: 'var(--text-muted)' }}>
                <b>그리퍼가 파지할 위치 + 접근 방향.</b> 차체 프레임이나 대형 패널의 경우 복수 포인트 권장.
                Unity에서 GripPoint_00, GripPoint_01… 오브젝트로 생성됩니다.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeBtn mode="grip" color="#37352f" icon={Hand} label="그립 추가" />
              </div>
              {clickMode === 'grip' && <p style={{ fontSize: 11, color: '#37352f', fontWeight: 600 }}>메쉬 표면을 클릭하면 위치 + 노멀 방향이 기록됩니다.</p>}
              {(draft.gripPoints ?? []).map((gp, i) => (
                <PointRow key={i} icon={<Hand size={11} />} color="#37352f"
                  label={`그립 #${String(i).padStart(2, '0')}`}
                  sub={`pos(${gp.x.toFixed(3)}, ${gp.y.toFixed(3)}, ${gp.z.toFixed(3)}) n(${gp.nx?.toFixed(2)}, ${gp.ny?.toFixed(2)}, ${gp.nz?.toFixed(2)})`}
                  onDelete={() => set({ gripPoints: draft.gripPoints.filter((_, j) => j !== i) })} />
              ))}
            </Section>
          )}

          {/* ═══ suction_workpart 전용 ════════════════════════ */}
          {isSuction && (
            <Section title="흡착 포인트 (Suction Cup)" color="#37352f" badge={draft.suctionPoints?.length ?? 0}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: 'var(--text-muted)' }}>
                <b>진공 흡착컵이 접촉할 위치 + 법선 방향.</b> 유리면이나 평판 표면을 클릭하세요.
                Unity에서 SuctionPoint_00… 오브젝트로 생성됩니다.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeBtn mode="suction" color="#37352f" icon={Circle} label="흡착 추가" />
              </div>
              {clickMode === 'suction' && <p style={{ fontSize: 11, color: '#37352f', fontWeight: 600 }}>흡착 표면을 클릭하면 위치 + 법선 방향이 기록됩니다.</p>}
              <Field label={`흡착컵 반지름 — ${(draft.suctionCupRadius ?? 0.04).toFixed(3)} m`}>
                <input type="range" min="0.005" max="0.15" step="0.005"
                  value={draft.suctionCupRadius ?? 0.04}
                  onChange={e => set({ suctionCupRadius: parseFloat(e.target.value) })} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>5 mm</span><span>150 mm</span>
                </div>
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.isFragile ?? false} onChange={e => set({ isFragile: e.target.checked })} style={{ accentColor: '#37352f' }} />
                Fragile (유리/취성 소재 — 저속 접근 권장)
              </label>
              {(draft.suctionPoints ?? []).map((sp, i) => (
                <PointRow key={i} icon={<Circle size={11} />} color="#37352f"
                  label={`흡착 #${String(i).padStart(2, '0')}`}
                  sub={`pos(${sp.x.toFixed(3)}, ${sp.y.toFixed(3)}, ${sp.z.toFixed(3)}) n(${sp.nx?.toFixed(2)}, ${sp.ny?.toFixed(2)}, ${sp.nz?.toFixed(2)})`}
                  onDelete={() => set({ suctionPoints: draft.suctionPoints.filter((_, j) => j !== i) })} />
              ))}
            </Section>
          )}

          {/* ═══ bolt_workpart 전용 ════════════════════════════ */}
          {isBolt && <>
            {/* 홀 포인트 */}
            <Section title="홀 포인트" color="#dc2626" badge={draft.holePoints?.length ?? 0}>
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeBtn mode="hole" color="#dc2626" icon={MapPin} label="홀 추가" />
              </div>
              {clickMode === 'hole' && <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>메쉬 표면을 클릭하여 홀 위치를 지정하세요.</p>}
              <Field label="Detection Size (m)" note="OverlapBox 크기">
                <Vec3Input value={draft.detectionSize ?? { x: 0.05, y: 0.05, z: 0.05 }} step={0.005}
                  onChange={v => set({ detectionSize: v })} />
              </Field>
              <Field label="Center Offset (m)" note="홀 기준 검사박스 오프셋">
                <Vec3Input value={draft.holeCenterOffset ?? { x: 0, y: 0, z: 0 }} step={0.002}
                  onChange={v => set({ holeCenterOffset: v })} />
              </Field>
              <Field label="볼트 감지 필터">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.requirePart ?? true} onChange={e => set({ requirePart: e.target.checked })} style={{ accentColor: '#dc2626' }} />
                    RequirePart (Part 컴포넌트 필수)
                  </label>
                  <input placeholder="BoltTag (비우면 모든 태그)" value={draft.boltTag ?? ''} onChange={e => set({ boltTag: e.target.value })} style={{ fontSize: 12 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>BoltMask (비트마스크)</span>
                    <input type="number" value={draft.boltMask ?? 0} onChange={e => set({ boltMask: parseInt(e.target.value) || 0 })}
                      style={{ fontSize: 12, width: 80 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>0=전체</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.showHoleGizmo ?? true} onChange={e => set({ showHoleGizmo: e.target.checked })} style={{ accentColor: '#dc2626' }} />
                    ShowGizmo (씬뷰 시각화)
                  </label>
                </div>
              </Field>
              {(draft.holePoints ?? []).map((hp, i) => (
                <PointRow key={i} icon={<MapPin size={11} />} color="#dc2626"
                  label={`홀 #${String(i).padStart(2, '0')}`}
                  sub={`(${hp.x.toFixed(3)}, ${hp.y.toFixed(3)}, ${hp.z.toFixed(3)})`}
                  onDelete={() => set({ holePoints: draft.holePoints.filter((_, j) => j !== i) })} />
              ))}
            </Section>

            {/* 그립 포인트 */}
            <Section title="그립 포인트" color="#37352f" badge={draft.gripPoints?.length ?? 0} defaultOpen={false}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: 'var(--text-muted)' }}>
                볼팅 공정에서 로봇 그리퍼가 워크파츠를 파지할 위치를 지정하세요.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeBtn mode="grip" color="#37352f" icon={Hand} label="그립 추가" />
              </div>
              {clickMode === 'grip' && <p style={{ fontSize: 11, color: '#37352f', fontWeight: 600 }}>메쉬 표면을 클릭하면 위치 + 노멀 방향이 기록됩니다.</p>}
              {(draft.gripPoints ?? []).map((gp, i) => (
                <PointRow key={i} icon={<Hand size={11} />} color="#37352f"
                  label={`그립 #${String(i).padStart(2, '0')}`}
                  sub={`pos(${gp.x.toFixed(3)}, ${gp.y.toFixed(3)}, ${gp.z.toFixed(3)}) n(${gp.nx?.toFixed(2)}, ${gp.ny?.toFixed(2)}, ${gp.nz?.toFixed(2)})`}
                  onDelete={() => set({ gripPoints: draft.gripPoints.filter((_, j) => j !== i) })} />
              ))}
            </Section>
          </>}

          {/* ═══ conveyor 전용 ══════════════════════════════════ */}
          {isConv && (
            <Section title="컨베이어 파라미터" color="#37352f">
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: 'var(--text-muted)' }}>
                <Info size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Unity Import 시 <b>realvirtual.Drive + TransportSurface</b>가 자동으로 추가됩니다. SpeedOverride와 Direction(LinearX/Y/Z)이 아래 값으로 설정됩니다.</span>
              </div>
              <Field label={`벨트 속도 — ${(draft.conveyorSpeed ?? 0.3).toFixed(2)} m/s`}>
                <input type="range" min="0.01" max="5" step="0.01"
                  value={draft.conveyorSpeed ?? 0.3}
                  onChange={e => set({ conveyorSpeed: parseFloat(e.target.value) })} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>0.01 m/s</span><span>5.0 m/s</span>
                </div>
              </Field>
              <Field label="이동 방향 축">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {DIRECTIONS.map(d => (
                    <button key={d} onClick={() => set({ conveyorDir: d })} style={{
                      padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: (draft.conveyorDir ?? 'Z+') === d ? '#37352f' : 'var(--bg-card)',
                      color: (draft.conveyorDir ?? 'Z+') === d ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${(draft.conveyorDir ?? 'Z+') === d ? '#37352f' : 'var(--border)'}`,
                    }}>{d}</button>
                  ))}
                </div>
              </Field>
              <Field label={`표면 마찰 — ${(draft.conveyorFriction ?? 0.5).toFixed(2)}`}>
                <input type="range" min="0" max="1" step="0.05"
                  value={draft.conveyorFriction ?? 0.5}
                  onChange={e => set({ conveyorFriction: parseFloat(e.target.value) })} />
              </Field>
            </Section>
          )}

        </div>
        </div>
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, boxShadow: '0 -4px 16px rgba(0,0,0,0.04)' }}>
          {error && (
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b', marginBottom: 8 }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}
          <button className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: 8, background: saved ? 'var(--success)' : undefined }}
            disabled={saving || saved}
            onClick={handleSave}>
            {saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? '저장 중…' : saved ? '저장됨!' : '스테이징에 저장'}
          </button>
        </div>
      </div>

      {/* ── 3D 뷰어 ───────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', background: clickMode !== 'none' ? '#1a2030' : 'var(--bg-base)', overflow: 'hidden', transition: 'background 0.3s' }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
        {isFallback && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, maxWidth: 320,
            background: 'rgba(217,130,43,0.92)', color: '#fff', pointerEvents: 'none',
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            원본 메쉬 로드 실패 — 대체 도형 표시 중{meshLoadError ? `: ${meshLoadError}` : ''}
          </div>
        )}
        {clickMode !== 'none' && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            borderRadius: 20, padding: '6px 16px', fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none',
            background: clickMode === 'hole' ? 'rgba(220,38,38,0.9)' : clickMode === 'suction' ? 'rgba(124,58,237,0.9)' : 'rgba(245,158,11,0.9)',
            color: '#fff',
          }}>
            {clickMode === 'hole'
              ? <><MapPin size={12} /> 홀 클릭 모드 — 표면을 클릭하세요</>
              : clickMode === 'suction'
                ? <><Circle size={12} /> 흡착 클릭 모드 — 표면을 클릭하세요</>
                : <><Hand size={12} /> 그립 클릭 모드 — 표면을 클릭하세요</>}
          </div>
        )}
      </div>
    </div>
  );
}
