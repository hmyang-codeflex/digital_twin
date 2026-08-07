import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Eye, EyeOff, Crosshair, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import {
  COLORS, ROBOT_MODELS, resolveModelKey,
  computeFK, buildRobotMeshes, placeCylinder, robotKey,
} from '../utils/robotScene.js';

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export default function RobotViewer({ log, connected }) {
  const mountRef    = useRef(null);
  const sceneRef    = useRef(null);
  const robotsRef   = useRef({});
  const colorIdxRef = useRef(0);

  const [flipZ,      setFlipZ]      = useState(true);
  const [visibleSet, setVisibleSet] = useState(() => new Set());
  const [expanded,   setExpanded]   = useState(() => new Set());
  const [, forceRender]             = useState(0);

  const prevDataRef = useRef({});
  const currDataRef = useRef({});
  const snapTimeRef = useRef(0);
  const flipZRef    = useRef(true);

  useEffect(() => { flipZRef.current = flipZ; }, [flipZ]);

  const latestSnap = log?.length ? log[log.length - 1] : null;
  const robots     = latestSnap?.robots ?? [];

  // ── 씬 초기화 ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el || sceneRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0f11');

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 500);
    camera.position.set(8, 6, 8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.5, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.near   = 0.1;
    sun.shadow.camera.far    = 60;
    sun.shadow.camera.left   = sun.shadow.camera.bottom = -12;
    sun.shadow.camera.right  = sun.shadow.camera.top   =  12;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.5);
    fill.position.set(-4, 4, -4);
    scene.add(fill);

    scene.add(new THREE.GridHelper(40, 80, 0x1a1a1a, 0x141414));
    scene.add(new THREE.AxesHelper(1.0));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    sceneRef.current = { renderer, scene, camera, controls };

    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();

      // FK 보간: 스냅샷 사이를 매 프레임 부드럽게 보간
      {
        const elapsed = Date.now() - snapTimeRef.current;
        const tLerp   = Math.min(elapsed / 1000, 1);
        const fz      = flipZRef.current;
        Object.entries(robotsRef.current).forEach(([key, entry]) => {
          const curr  = currDataRef.current[key];
          const prev  = prevDataRef.current[key];
          if (!curr) return;
          const model = ROBOT_MODELS[entry.modelKey];
          if (!model) return;
          const ang = curr.angles.map((c, i) =>
            prev ? prev.angles[i] + (c - prev.angles[i]) * tLerp : c
          );
          const bx = prev ? prev.bx + (curr.bx - prev.bx) * tLerp : curr.bx;
          const by = prev ? prev.by + (curr.by - prev.by) * tLerp : curr.by;
          const bz = prev ? prev.bz + (curr.bz - prev.bz) * tLerp : curr.bz;
          const pts = computeFK(model.dh, ang, bx, by, bz,
            curr.bqx, curr.bqy, curr.bqz, curr.bqw, fz);
          entry.base.position.copy(pts[0]);
          entry.base.position.y += 0.07;
          entry.joints.forEach((m, i) => m.position.copy(pts[i + 1]));
          entry.links.forEach((m, i)  => placeCylinder(m, pts[i], pts[i + 1]));
        });
      }

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      sceneRef.current    = null;
      robotsRef.current   = {};
      colorIdxRef.current = 0;
      prevDataRef.current = {};
      currDataRef.current = {};
      snapTimeRef.current = 0;
    };
  }, []);

  // ── 스냅샷 → 씬 업데이트 ────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !robots.length) return;
    const { scene, camera, controls } = sceneRef.current;

    let spawnedAny = false;
    const newKeys  = [];

    robots.forEach(r => {
      const key      = robotKey(r);
      const modelKey = resolveModelKey(r.modelType);
      const model    = ROBOT_MODELS[modelKey];
      if (!model) return;

      if (!robotsRef.current[key]) {
        const colorIdx = colorIdxRef.current++ % COLORS.length;
        const meshes   = buildRobotMeshes(COLORS[colorIdx]);
        scene.add(meshes.group);
        robotsRef.current[key] = { ...meshes, colorIdx, modelKey, name: r.name };
        newKeys.push(key);
        spawnedAny = true;
        forceRender(n => n + 1);
      }

      // FK는 애니메이션 루프에서 보간 실행 → 데이터만 저장
      const bx = r.baseX ?? 0;
      const by = r.baseY ?? 0;
      const bz = flipZ ? -(r.baseZ ?? 0) : (r.baseZ ?? 0);
      const newSnap = {
        angles: [r.j1??0, r.j2??0, r.j3??0, r.j4??0, r.j5??0, r.j6??0],
        bx, by, bz,
        bqx: r.baseQx ?? 0, bqy: r.baseQy ?? 0,
        bqz: r.baseQz ?? 0, bqw: r.baseQw ?? 1,
      };
      const prevSnap = currDataRef.current[key];
      if (prevSnap) prevDataRef.current[key] = prevSnap;
      currDataRef.current[key] = newSnap;
    });

    snapTimeRef.current = Date.now(); // 보간 타이머 리셋

    // 사라진 로봇 제거
    const activeKeys = new Set(robots.map(robotKey));
    Object.entries(robotsRef.current).forEach(([key, { group }]) => {
      if (!activeKeys.has(key)) {
        scene.remove(group);
        delete robotsRef.current[key];
        delete prevDataRef.current[key];
        delete currDataRef.current[key];
        forceRender(n => n + 1);
      }
    });

    if (spawnedAny) {
      setVisibleSet(prev => {
        const next = new Set(prev);
        newKeys.forEach(k => next.add(k));
        return next;
      });

      const entries = Object.values(robotsRef.current);
      entries.forEach(({ group }) => group.updateMatrixWorld(true));
      const box = new THREE.Box3();
      entries.forEach(({ group }) => box.expandByObject(group));
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const dist   = Math.max(box.getSize(new THREE.Vector3()).length() * 1.2, 4);
        controls.target.copy(center);
        camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
        controls.update();
      }
    }
  }, [latestSnap, flipZ]);

  // ── 가시성 → Three.js group.visible ─────────────────────────────────
  useEffect(() => {
    Object.entries(robotsRef.current).forEach(([key, { group }]) => {
      group.visible = visibleSet.has(key);
    });
  }, [visibleSet]);

  // ── 카메라 전체 맞춤 ────────────────────────────────────────────────
  const fitAll = useCallback(() => {
    if (!sceneRef.current) return;
    const { camera, controls } = sceneRef.current;
    const visible = Object.values(robotsRef.current).filter(e => e.group.visible);
    if (!visible.length) { camera.position.set(8, 6, 8); controls.target.set(0, 1.5, 0); controls.update(); return; }
    visible.forEach(({ group }) => group.updateMatrixWorld(true));
    const box = new THREE.Box3();
    visible.forEach(({ group }) => box.expandByObject(group));
    const center = box.getCenter(new THREE.Vector3());
    const dist   = Math.max(box.getSize(new THREE.Vector3()).length() * 1.2, 4);
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    controls.update();
  }, []);

  // ── 단일 로봇 포커스 ────────────────────────────────────────────────
  const focusRobot = useCallback((key) => {
    if (!sceneRef.current) return;
    const entry = robotsRef.current[key];
    if (!entry) return;
    const { camera, controls } = sceneRef.current;
    entry.group.updateMatrixWorld(true);
    const box    = new THREE.Box3().expandByObject(entry.group);
    const center = box.getCenter(new THREE.Vector3());
    const dist   = Math.max(box.getSize(new THREE.Vector3()).length() * 1.5, 4);
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    controls.update();
  }, []);

  const toggleVisible = useCallback((key) => {
    setVisibleSet(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d0f11' }}>

      {/* ── 툴바 ── */}
      <div style={{
        padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(0,0,0,0.4)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? '#4ade80' : '#64748b' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: connected ? '#4ade80' : '#334155' }} />
          {connected ? 'Unity 연결됨' : '대기 중'}
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
          로봇 {robots.length}대
        </span>
        <div style={{ flex: 1 }} />
        <Btn active={flipZ} color="#38bdf8" onClick={() => setFlipZ(f => !f)}>
          Z {flipZ ? '반전' : '정방향'}
        </Btn>
        <Sep />
        <button onClick={fitAll} title="전체 뷰 맞춤" style={baseBtn}>
          <RotateCcw size={12} />
        </button>
      </div>

      {/* ── 바디 ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 좌측 로봇 목록 패널 ── */}
        <div style={{
          width: 234, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.25)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px 6px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', color: 'rgba(255,255,255,0.28)',
            textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            로봇 목록 ({robots.length})
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', padding: '6px 8px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {robots.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, padding: '12px 4px' }}>
                디지털 트윈 연결 대기 중
              </div>
            ) : robots.map(r => {
              const key     = robotKey(r);
              const entry   = robotsRef.current[key];
              const color   = entry ? COLORS[entry.colorIdx] : '#555';
              const mk      = resolveModelKey(r.modelType);
              const visible = visibleSet.has(key);
              const open    = expanded.has(key);
              const isRun   = r.status === 'Run';

              return (
                <div key={key} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${visible ? `${color}55` : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8, overflow: 'hidden',
                  opacity: visible ? 1 : 0.5,
                  transition: 'opacity 0.15s, border-color 0.15s',
                }}>
                  {/* 카드 헤더 */}
                  <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />

                    <button
                      onClick={() => toggleExpand(key)}
                      style={{ ...btnReset, flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                    >
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.name}
                      </span>
                      {open
                        ? <ChevronDown size={11} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0 }} />
                        : <ChevronRight size={11} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0 }} />}
                    </button>

                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                      background: isRun ? '#16a34a33' : '#1e293b',
                      color: isRun ? '#4ade80' : '#64748b',
                    }}>
                      {r.status || '—'}
                    </span>

                    <button
                      onClick={() => toggleVisible(key)}
                      title={visible ? '숨기기' : '표시'}
                      style={{ ...btnReset, color: visible ? color : 'rgba(255,255,255,0.2)', flexShrink: 0 }}
                    >
                      {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>

                    <button
                      onClick={() => focusRobot(key)}
                      title="카메라 이동"
                      style={{ ...btnReset, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}
                    >
                      <Crosshair size={13} />
                    </button>
                  </div>

                  {/* 확장 영역 */}
                  {open && (
                    <div style={{ padding: '4px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 10, marginTop: 4, marginBottom: 8, color: mk ? '#94a3b8' : '#f97316' }}>
                        {mk ? (ROBOT_MODELS[mk]?.label ?? mk) : `⚠ 미지원 모델: ${r.modelType ?? '—'}`}
                      </div>

                      <SectionLabel>베이스 위치</SectionLabel>
                      <Row3>
                        <KV label="X" value={`${(r.baseX ?? 0).toFixed(3)}m`} />
                        <KV label="Y" value={`${(r.baseY ?? 0).toFixed(3)}m`} />
                        <KV label="Z" value={`${(r.baseZ ?? 0).toFixed(3)}m`} />
                      </Row3>

                      <SectionLabel>관절 각도</SectionLabel>
                      <Row3>
                        {[r.j1, r.j2, r.j3].map((q, i) => <KV key={i} label={`J${i + 1}`} value={`${(q ?? 0).toFixed(1)}°`} />)}
                      </Row3>
                      <Row3>
                        {[r.j4, r.j5, r.j6].map((q, i) => <KV key={i} label={`J${i + 4}`} value={`${(q ?? 0).toFixed(1)}°`} />)}
                      </Row3>

                      <SectionLabel>TCP</SectionLabel>
                      <Row3>
                        <KV label="X" value={(r.tcpX ?? 0).toFixed(3)} />
                        <KV label="Y" value={(r.tcpY ?? 0).toFixed(3)} />
                        <KV label="Z" value={(r.tcpZ ?? 0).toFixed(3)} />
                      </Row3>

                      <SectionLabel>물리량</SectionLabel>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <PhysChip label="온도" value={`${(r.temperatureC ?? 0).toFixed(1)}°C`} warn={(r.temperatureC ?? 0) > 70} />
                        <PhysChip label="전력" value={`${(r.powerW ?? 0).toFixed(0)}W`} />
                        <PhysChip label="토크" value={`${(r.torqueNm ?? 0).toFixed(1)}N`} />
                      </div>

                      <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>
                        id:{r.instanceId ?? 'n/a'} · step:{r.instructionIdx ?? 0}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 3D 뷰포트 ── */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
          {robots.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 13 }}>
                Unity 연결 후 로봇이 자동으로 표시됩니다
              </span>
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 10, right: 10, fontSize: 10,
            color: 'rgba(255,255,255,0.15)', lineHeight: 1.8, pointerEvents: 'none',
          }}>
            좌클릭: 회전 · 우클릭: 이동 · 스크롤: 줌
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 스타일 상수 ───────────────────────────────────────────────────────
const baseBtn = {
  padding: '4px 8px', borderRadius: 5, border: 'none',
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
};

const btnReset = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 0, display: 'flex', alignItems: 'center',
};

// ── 미니 컴포넌트 ─────────────────────────────────────────────────────

function Btn({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      ...baseBtn,
      background: active ? `${color}22` : 'rgba(255,255,255,0.06)',
      color:      active ? color         : 'rgba(255,255,255,0.4)',
    }}>
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />;
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, color: 'rgba(255,255,255,0.25)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginTop: 6, marginBottom: 3,
    }}>
      {children}
    </div>
  );
}

function Row3({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 4px', marginBottom: 2 }}>
      {children}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div style={{ fontSize: 10 }}>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>{label} </span>
      <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 10 }}>{value}</span>
    </div>
  );
}

function PhysChip({ label, value, warn }) {
  return (
    <div style={{
      background: warn ? '#7f1d1d44' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${warn ? '#ef444433' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 4, padding: '2px 6px', flex: 1,
    }}>
      <div style={{ fontSize: 8, color: warn ? '#fca5a5' : 'rgba(255,255,255,0.25)' }}>{label}</div>
      <div style={{ fontSize: 10, color: warn ? '#fca5a5' : '#e2e8f0', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
