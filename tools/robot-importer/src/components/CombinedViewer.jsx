import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Eye, EyeOff, Crosshair, ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import {
  COLORS, ROBOT_MODELS, resolveModelKey,
  computeFK, buildRobotMeshes, placeCylinder, robotKey,
} from '../utils/robotScene.js';

const TRAIL_WINDOWS = [
  { label: '전체', pts: 0  },
  { label: '60s',  pts: 60 },
  { label: '30s',  pts: 30 },
];

// ── 궤적 오브젝트 제거 ─────────────────────────────────────────────
function disposeTrail(obj) {
  if (!obj) return;
  obj.line?.geometry.dispose();   obj.line?.material.dispose();
  obj.dots?.geometry.dispose();   obj.dots?.material.dispose();
  obj.sphere?.geometry.dispose(); obj.sphere?.material.dispose();
  obj.ring?.geometry.dispose();   obj.ring?.material.dispose();
  obj.labelEl?.remove();
}

// ═══════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════════════
export default function CombinedViewer({ log, connected }) {
  const mountRef      = useRef(null);
  const sceneRef      = useRef(null);
  const robotsRef     = useRef({});   // key → {group, base, joints, links}
  const trailsRef     = useRef({});   // key → {line, dots, sphere, ring, labelEl}
  const colorMapRef   = useRef({});   // key → colorIndex (고정)
  const colorIdxRef   = useRef(0);
  const labelContRef  = useRef(null);
  const focusedKeyRef = useRef(null);

  const [flipZ,      setFlipZ]      = useState(true);
  const [visibleSet, setVisibleSet] = useState(() => new Set());
  const [expanded,   setExpanded]   = useState(() => new Set());
  const [windowIdx,  setWindowIdx]  = useState(0);
  const [clearedAt,  setClearedAt]  = useState(0);
  const [focusedKey, setFocusedKey] = useState(null);
  const [, forceRender]             = useState(0);

  // 스냅샷 보간용 refs
  const prevDataRef = useRef({});   // key → 이전 스냅샷 로봇 상태
  const currDataRef = useRef({});   // key → 현재 스냅샷 로봇 상태
  const snapTimeRef = useRef(0);    // 마지막 스냅샷 수신 시각 (ms)
  const flipZRef    = useRef(true); // 애니메이션 루프용 flipZ 미러
  const arrowsRef   = useRef({});   // key → THREE.ArrowHelper

  useEffect(() => { focusedKeyRef.current = focusedKey; }, [focusedKey]);
  useEffect(() => { flipZRef.current = flipZ; }, [flipZ]);

  const latestSnap = log?.length ? log[log.length - 1] : null;
  const robots     = latestSnap?.robots ?? [];

  // 색상 할당 (처음 등장 시 한 번만)
  function ensureColor(key) {
    if (colorMapRef.current[key] === undefined)
      colorMapRef.current[key] = colorIdxRef.current++;
    return colorMapRef.current[key];
  }

  // ── 씬 초기화 ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el || sceneRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    el.appendChild(canvas);

    // DOM 라벨 컨테이너 (로봇 이름 오버레이)
    const labelCont = document.createElement('div');
    labelCont.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    el.appendChild(labelCont);
    labelContRef.current = labelCont;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0f11');

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 500);
    camera.position.set(8, 6, 8);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.5, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.near  = 0.1;
    sun.shadow.camera.far   = 60;
    sun.shadow.camera.left  = sun.shadow.camera.bottom = -12;
    sun.shadow.camera.right = sun.shadow.camera.top   =  12;
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
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();

      // ── FK 보간: 스냅샷(~1s) 사이를 매 프레임 부드럽게 보간 ───────────
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

      const t       = clock.getElapsedTime();
      const focused = focusedKeyRef.current;
      const cW      = el.clientWidth;
      const cH      = el.clientHeight;

      // 궤적 링 펄스 + 라벨 프로젝션
      Object.entries(trailsRef.current).forEach(([key, obj]) => {
        const isFocused = !focused || focused === key;

        if (obj.ring?.visible) {
          if (isFocused) {
            const s = 1 + 0.28 * Math.sin(t * 4.5);
            obj.ring.scale.setScalar(s);
            obj.ring.material.opacity = 0.25 + 0.22 * Math.sin(t * 4.5 + 1.57);
          } else {
            obj.ring.scale.setScalar(1);
            obj.ring.material.opacity = 0.06;
          }
        }

        if (obj.labelEl && obj.sphere?.visible) {
          const wp = obj.sphere.position.clone();
          wp.y += 0.12;
          wp.project(camera);
          if (wp.z <= 1.0) {
            obj.labelEl.style.left       = `${(wp.x + 1) / 2 * cW}px`;
            obj.labelEl.style.top        = `${(-wp.y + 1) / 2 * cH}px`;
            obj.labelEl.style.visibility = 'visible';
          } else {
            obj.labelEl.style.visibility = 'hidden';
          }
        }
      });

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(canvas))   el.removeChild(canvas);
      if (el.contains(labelCont)) el.removeChild(labelCont);
      labelContRef.current = null;
      sceneRef.current    = null;
      robotsRef.current   = {};
      trailsRef.current   = {};
      colorMapRef.current = {};
      colorIdxRef.current = 0;
      prevDataRef.current = {};
      currDataRef.current = {};
      snapTimeRef.current = 0;
      arrowsRef.current   = {};
    };
  }, []);

  // ── Effect A: 로봇 메쉬 업데이트 (FK 자세) ─────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !robots.length) return;
    const { scene, camera, controls } = sceneRef.current;

    let spawnedAny = false;
    const newKeys  = [];

    robots.forEach(r => {
      const key      = robotKey(r);
      const colorIdx = ensureColor(key);
      const modelKey = resolveModelKey(r.modelType);
      const model    = ROBOT_MODELS[modelKey];
      if (!model) return;

      if (!robotsRef.current[key]) {
        const meshes = buildRobotMeshes(COLORS[colorIdx % COLORS.length]);
        scene.add(meshes.group);
        robotsRef.current[key] = { ...meshes, colorIdx, modelKey, name: r.name };
        newKeys.push(key);
        spawnedAny = true;
        forceRender(n => n + 1);
      }

      // FK는 애니메이션 루프에서 매 프레임 보간 실행 → 여기서는 데이터만 저장
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

    // 사라진 로봇 정리
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
      // 카메라 자동 맞춤
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

  // ── Effect B: TCP 궤적 업데이트 ─────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !log.length) return;
    const { scene } = sceneRef.current;
    const labelCont = labelContRef.current;

    const snap = log[log.length - 1];
    if (!snap?.robots?.length) return;

    const pts   = TRAIL_WINDOWS[windowIdx].pts;
    const slice = (pts ? log.slice(-pts) : log).filter(s => s._ts > clearedAt);

    const activeKeys = new Set(snap.robots.map(robotKey));

    // 사라진 궤적 제거
    Object.keys(trailsRef.current).forEach(key => {
      if (!activeKeys.has(key)) {
        const obj = trailsRef.current[key];
        scene.remove(obj.line, obj.dots, obj.sphere, obj.ring);
        disposeTrail(obj);
        delete trailsRef.current[key];
        const arr = arrowsRef.current[key];
        if (arr) { scene.remove(arr); delete arrowsRef.current[key]; }
      }
    });

    snap.robots.forEach(r => {
      const key       = robotKey(r);
      const colorIdx  = ensureColor(key);
      const hexColor  = COLORS[colorIdx % COLORS.length];
      const color     = new THREE.Color(hexColor);
      const isFocused = !focusedKey || focusedKey === key;
      const alpha     = isFocused ? 1 : 0.1;

      // 이 로봇의 TCP 벡터 배열
      const vectors = slice
        .map(s => {
          const ri = s.robots?.find(x => robotKey(x) === key);
          return ri ? new THREE.Vector3(ri.tcpX, ri.tcpY, flipZ ? -ri.tcpZ : ri.tcpZ) : null;
        })
        .filter(Boolean);

      const hasLine = vectors.length >= 2;
      const hasPt   = vectors.length > 0;

      let obj = trailsRef.current[key];
      if (!obj) {
        const line = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }),
        );
        line.renderOrder = colorIdx + 1;

        const dots = new THREE.Points(
          new THREE.BufferGeometry(),
          new THREE.PointsMaterial({ color, size: 0.018, sizeAttenuation: true, transparent: true, opacity: 0.5, depthTest: false }),
        );
        dots.renderOrder = colorIdx + 1;

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 14, 14),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
        );
        sphere.renderOrder = colorIdx + 10;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.04, 0.055, 28),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = colorIdx + 9;

        if (!arrowsRef.current[key]) {
          const arr = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.3,
            color.getHex(), 0.1, 0.05,
          );
          arr.line.material.transparent = true;
          arr.cone.material.transparent = true;
          arr.line.material.depthTest   = false;
          arr.cone.material.depthTest   = false;
          arr.line.renderOrder = colorIdx + 8;
          arr.cone.renderOrder = colorIdx + 8;
          arr.visible = false;
          scene.add(arr);
          arrowsRef.current[key] = arr;
        }

        const labelEl = document.createElement('div');
        labelEl.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'white-space:nowrap',
          'transform:translate(-50%,-100%)',
          `color:${hexColor}`,
          `border:1.5px solid ${hexColor}`,
          'background:rgba(8,10,13,0.88)',
          'border-radius:6px',
          'padding:2px 8px',
          'font-size:10px',
          'font-weight:700',
          'font-family:system-ui,sans-serif',
          `text-shadow:0 0 8px ${hexColor}88`,
          'visibility:hidden',
        ].join(';');
        labelEl.textContent = r.name;
        labelCont?.appendChild(labelEl);

        scene.add(line, dots, sphere, ring);
        obj = { line, dots, sphere, ring, labelEl };
        trailsRef.current[key] = obj;
      }

      // 투명도 (포커스 상태)
      obj.line.material.opacity   = alpha * 0.85;
      obj.dots.material.opacity   = alpha * 0.5;
      obj.sphere.material.opacity = alpha;
      if (obj.labelEl) obj.labelEl.style.opacity = String(alpha);

      // 속도 기반 색상 그라디언트 계산
      const speeds   = vectors.map((v, i) => i === 0 ? 0 : v.distanceTo(vectors[i - 1]));
      const maxSpd   = Math.max(...speeds, 0.001);
      const vcArr    = [];
      for (let i = 0; i < vectors.length; i++) {
        const age = vectors.length > 1 ? i / (vectors.length - 1) : 1; // 0=오래됨 1=최신
        const spd = speeds[i] / maxSpd;
        // hue: 0.58(파랑·느림) → 0.06(주황/빨강·빠름)
        const c2 = new THREE.Color().setHSL(0.58 - spd * 0.52, 0.78 + spd * 0.18, 0.28 + age * 0.28);
        vcArr.push(c2.r, c2.g, c2.b);
      }

      // 지오메트리 갱신
      obj.line.geometry.setFromPoints(hasLine ? vectors : [new THREE.Vector3()]);
      if (hasLine) {
        obj.line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(vcArr, 3));
      }
      obj.line.visible = hasLine;

      if (hasPt) {
        obj.dots.geometry.setFromPoints(vectors);
        const last = vectors[vectors.length - 1];
        obj.sphere.position.copy(last);
        obj.ring.position.copy(last);
      } else {
        obj.dots.geometry.setFromPoints([new THREE.Vector3()]);
      }
      obj.dots.visible   = hasPt;
      obj.sphere.visible = hasPt;
      obj.ring.visible   = hasPt;
      if (!hasPt && obj.labelEl) obj.labelEl.style.visibility = 'hidden';

      // 속도 방향 화살표 업데이트
      const arr = arrowsRef.current[key];
      if (arr) {
        if (vectors.length >= 2 && hasPt) {
          const lp  = vectors[vectors.length - 1];
          const pp  = vectors[vectors.length - 2];
          const dv  = lp.clone().sub(pp);
          const spd = dv.length();
          if (spd > 0.001) {
            arr.position.copy(lp);
            arr.setDirection(dv.normalize());
            const al = Math.min(spd * 0.55, 0.38);
            arr.setLength(al, Math.min(al * 0.32, 0.1), Math.min(al * 0.14, 0.05));
            arr.line.material.opacity = isFocused ? alpha * 0.88 : 0.06;
            arr.cone.material.opacity = isFocused ? alpha * 0.88 : 0.06;
            arr.visible = true;
          } else {
            arr.visible = false;
          }
        } else {
          arr.visible = false;
        }
      }
    });
  }, [latestSnap, log, windowIdx, clearedAt, flipZ, focusedKey]);

  // ── Effect C: 가시성 → 메쉬 + 궤적 동시 적용 ────────────────────────
  useEffect(() => {
    Object.entries(robotsRef.current).forEach(([key, { group }]) => {
      group.visible = visibleSet.has(key);
    });
    Object.entries(trailsRef.current).forEach(([key, obj]) => {
      const v = visibleSet.has(key);
      if (obj.line)   obj.line.visible   = v && obj.line.visible !== false;
      if (obj.dots)   obj.dots.visible   = v;
      if (obj.sphere) obj.sphere.visible = v;
      if (obj.ring)   obj.ring.visible   = v;
      if (obj.labelEl) obj.labelEl.style.display = v ? '' : 'none';
    });
    Object.entries(arrowsRef.current).forEach(([key, arr]) => {
      if (!visibleSet.has(key)) arr.visible = false;
    });
  }, [visibleSet]);

  // ── 카메라 맞춤 ──────────────────────────────────────────────────────
  const fitAll = useCallback(() => {
    if (!sceneRef.current) return;
    const { camera, controls } = sceneRef.current;
    const box = new THREE.Box3();
    let hasAny = false;
    Object.values(robotsRef.current).forEach(({ group }) => {
      if (group.visible) { group.updateMatrixWorld(true); box.expandByObject(group); hasAny = true; }
    });
    Object.values(trailsRef.current).forEach(({ sphere }) => {
      if (sphere?.visible) { box.expandByPoint(sphere.position); hasAny = true; }
    });
    if (!hasAny) { camera.position.set(8, 6, 8); controls.target.set(0, 1.5, 0); controls.update(); return; }
    const center = box.getCenter(new THREE.Vector3());
    const dist   = Math.max(box.getSize(new THREE.Vector3()).length() * 1.2, 4);
    controls.target.copy(center);
    camera.position.set(center.x + dist*0.7, center.y + dist*0.5, center.z + dist*0.7);
    controls.update();
  }, []);

  const focusRobot = useCallback((key) => {
    if (!sceneRef.current) return;
    const { camera, controls } = sceneRef.current;
    const entry = robotsRef.current[key];
    if (!entry) return;
    entry.group.updateMatrixWorld(true);
    const box    = new THREE.Box3().expandByObject(entry.group);
    const center = box.getCenter(new THREE.Vector3());
    const dist   = Math.max(box.getSize(new THREE.Vector3()).length() * 1.8, 4);
    controls.target.copy(center);
    camera.position.set(center.x + dist*0.7, center.y + dist*0.5, center.z + dist*0.7);
    controls.update();
  }, []);

  const toggleVisible = useCallback((key) => {
    setVisibleSet(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── 렌더 ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d0f11' }}>

      {/* ── 툴바 ── */}
      <div style={{
        padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.4)',
      }}>
        {/* 연결 상태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? '#4ade80' : '#64748b' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: connected ? '#4ade80' : '#334155' }} />
          {connected ? 'Unity 연결됨' : '대기 중'}
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
          로봇 {robots.length}대
        </span>

        <Div />

        {/* 궤적 창 */}
        {TRAIL_WINDOWS.map((w, i) => (
          <TBtn key={w.label} active={windowIdx === i} color="#6e8efb" onClick={() => setWindowIdx(i)}>
            {w.label}
          </TBtn>
        ))}

        {/* 포커스 해제 */}
        {focusedKey && (
          <TBtn active color="#f97316" onClick={() => setFocusedKey(null)}>
            전체 보기
          </TBtn>
        )}

        <div style={{ flex: 1 }} />

        {/* 궤적 초기화 */}
        <button
          onClick={() => setClearedAt(Date.now())}
          style={{ ...baseBtn, color: 'rgba(255,100,100,0.6)' }}
          title="궤적 초기화"
        >
          <Trash2 size={12} /> 초기화
        </button>

        <TBtn active={flipZ} color="#38bdf8" onClick={() => setFlipZ(f => !f)}>
          Z {flipZ ? '반전' : '정방향'}
        </TBtn>

        <Div />

        <button onClick={fitAll} title="전체 뷰 맞춤" style={baseBtn}>
          <RotateCcw size={12} />
        </button>
      </div>

      {/* ── 바디 ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 좌측 패널 ── */}
        <div style={{
          width: 234, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)',
        }}>
          <div style={{
            padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase',
            borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
          }}>
            로봇 목록 ({robots.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {robots.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, padding: '12px 4px' }}>
                디지털 트윈 연결 대기 중
              </div>
            ) : robots.map(r => {
              const key     = robotKey(r);
              const entry   = robotsRef.current[key];
              const colorIdx = colorMapRef.current[key] ?? 0;
              const color   = COLORS[colorIdx % COLORS.length];
              const mk      = resolveModelKey(r.modelType);
              const visible = visibleSet.has(key);
              const open    = expanded.has(key);
              const isFocus = focusedKey === key;
              const isRun   = r.status === 'Run';

              return (
                <div key={key} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${visible ? (isFocus ? color : `${color}55`) : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8, overflow: 'hidden',
                  opacity: visible ? 1 : 0.45,
                  boxShadow: isFocus ? `0 0 0 1px ${color}44` : 'none',
                  transition: 'opacity 0.15s, border-color 0.15s, box-shadow 0.15s',
                }}>
                  {/* 헤더 */}
                  <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />

                    <button
                      onClick={() => toggleExpand(key)}
                      style={{ ...btnReset, flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    }}>{r.status || '—'}</span>

                    {/* 궤적 포커스 (단독 보기) */}
                    <button
                      onClick={() => setFocusedKey(f => f === key ? null : key)}
                      title="이 로봇 단독 궤적 보기"
                      style={{ ...btnReset, color: isFocus ? color : 'rgba(255,255,255,0.2)', flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700 }}>◎</span>
                    </button>

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

                  {/* 확장 */}
                  {open && (
                    <div style={{ padding: '4px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 10, marginTop: 4, marginBottom: 6, color: mk ? '#94a3b8' : '#f97316' }}>
                        {mk ? (ROBOT_MODELS[mk]?.label ?? mk) : `⚠ 미지원 모델: ${r.modelType ?? '—'}`}
                      </div>

                      <SL>베이스</SL>
                      <Row3>
                        <KV label="X" value={`${(r.baseX??0).toFixed(3)}m`} />
                        <KV label="Y" value={`${(r.baseY??0).toFixed(3)}m`} />
                        <KV label="Z" value={`${(r.baseZ??0).toFixed(3)}m`} />
                      </Row3>

                      <SL>관절 각도</SL>
                      <Row3>
                        {[r.j1,r.j2,r.j3].map((q,i)=><KV key={i} label={`J${i+1}`} value={`${(q??0).toFixed(1)}°`}/>)}
                      </Row3>
                      <Row3>
                        {[r.j4,r.j5,r.j6].map((q,i)=><KV key={i} label={`J${i+4}`} value={`${(q??0).toFixed(1)}°`}/>)}
                      </Row3>

                      <SL>TCP (Unity)</SL>
                      <Row3>
                        <KV label="X" value={(r.tcpX??0).toFixed(3)} />
                        <KV label="Y" value={(r.tcpY??0).toFixed(3)} />
                        <KV label="Z" value={(r.tcpZ??0).toFixed(3)} />
                      </Row3>

                      <SL>물리량</SL>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <PhysChip label="온도" value={`${(r.temperatureC??0).toFixed(1)}°C`} warn={(r.temperatureC??0)>70} />
                        <PhysChip label="전력" value={`${(r.powerW??0).toFixed(0)}W`} />
                        <PhysChip label="토크" value={`${(r.torqueNm??0).toFixed(1)}N`} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 3D 씬 ── */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
          {robots.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 13 }}>
                Unity 연결 후 로봇과 궤적이 함께 표시됩니다
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

// ── 스타일 ───────────────────────────────────────────────────────────
const baseBtn = {
  padding: '4px 8px', borderRadius: 5, border: 'none',
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
};

const btnReset = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 0, display: 'flex', alignItems: 'center',
};

function TBtn({ active, color = '#38bdf8', onClick, children }) {
  return (
    <button onClick={onClick} style={{
      ...baseBtn,
      background: active ? `${color}22` : 'rgba(255,255,255,0.06)',
      color:      active ? color         : 'rgba(255,255,255,0.4)',
    }}>{children}</button>
  );
}

function Div() {
  return <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />;
}

function SL({ children }) {
  return <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 6, marginBottom: 3 }}>{children}</div>;
}

function Row3({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 4px', marginBottom: 2 }}>{children}</div>;
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
