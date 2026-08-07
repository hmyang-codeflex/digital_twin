import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Trash2, Route, Maximize2, ArrowLeftRight, Eye, EyeOff } from 'lucide-react';
import { COLORS as ROBOT_COLORS, robotKey } from '../utils/robotScene.js';

const TRAIL_WINDOWS = [
  { label: '전체',     pts: 0  },
  { label: '최근 60s', pts: 60 },
  { label: '최근 30s', pts: 30 },
];

export default function TcpTrailViewer({ log, connected }) {
  const mountRef         = useRef(null);
  const sceneRef         = useRef(null);
  const trailsRef        = useRef({});        // key → { line, dots, sphere, ring, labelEl }
  const colorMapRef      = useRef({});        // key → colorIndex (고정)
  const labelContRef     = useRef(null);
  const focusedKeyRef    = useRef(null);      // animate 루프용 미러
  const autoFittedRef    = useRef(false);

  const [sceneReady,   setSceneReady]   = useState(false);
  const [windowIdx,    setWindowIdx]    = useState(0);
  const [focusedKey,   setFocusedKey]   = useState(null); // null=전체, string=key
  const [hiddenKeys,   setHiddenKeys]   = useState(() => new Set());
  const [clearedAt,    setClearedAt]    = useState(0);
  const [flipZ,        setFlipZ]        = useState(true);

  useEffect(() => { focusedKeyRef.current = focusedKey; }, [focusedKey]);

  // ── 로봇 엔트리 목록: { key, name } — key는 instanceId, name은 표시용 ──
  const robotEntries = useMemo(() => {
    const map = new Map(); // key → name
    log.forEach(snap => {
      snap.robots?.forEach(r => {
        const k = robotKey(r);
        if (!map.has(k)) map.set(k, r.name);
      });
    });
    const entries = [...map.entries()].map(([key, name]) => ({ key, name }));
    entries.forEach(({ key }) => {
      if (colorMapRef.current[key] === undefined)
        colorMapRef.current[key] = Object.keys(colorMapRef.current).length;
    });
    return entries;
  }, [log]);

  // ── 키로 TCP 벡터 배열 빌드 ─────────────────────────────────────
  const buildVectors = useCallback((key, targetLog) => {
    const pts   = TRAIL_WINDOWS[windowIdx].pts;
    const slice = (pts ? targetLog.slice(-pts) : targetLog).filter(s => s._ts > clearedAt);
    return slice
      .map(snap => {
        const r = snap.robots?.find(r => robotKey(r) === key);
        return r ? new THREE.Vector3(r.tcpX, r.tcpY, flipZ ? -r.tcpZ : r.tcpZ) : null;
      })
      .filter(Boolean);
  }, [windowIdx, clearedAt, flipZ]);

  // ── 카메라 맞추기 ────────────────────────────────────────────────
  const fitCamera = useCallback(() => {
    if (!sceneRef.current || !robotEntries.length) return;
    const box = new THREE.Box3();
    let hasAny = false;
    robotEntries.forEach(({ key }) => {
      buildVectors(key, log).forEach(v => { box.expandByPoint(v); hasAny = true; });
    });
    if (!hasAny) return;

    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.3);

    const { camera, controls, gridRef } = sceneRef.current;
    controls.target.copy(center);
    const dist = maxDim * 2.2;
    camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist);
    camera.near = maxDim * 0.001;
    camera.far  = maxDim * 500;
    camera.updateProjectionMatrix();
    controls.update();
    if (gridRef) { gridRef.position.x = center.x; gridRef.position.z = center.z; }
  }, [log, robotEntries, buildVectors]);

  // ── Three.js 씬 초기화 ──────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let rafId, cleanupFn;

    rafId = requestAnimationFrame(() => {
      if (!mountRef.current) return;

      const W = el.offsetWidth  || 900;
      const H = el.offsetHeight || 600;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      const canvas = renderer.domElement;
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      el.appendChild(canvas);

      const labelContainer = document.createElement('div');
      labelContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
      el.appendChild(labelContainer);
      labelContRef.current = labelContainer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f1012);
      const grid = new THREE.GridHelper(50, 100, 0x1e2126, 0x191c21);
      scene.add(grid);
      scene.add(new THREE.AxesHelper(0.5));

      const camera = new THREE.PerspectiveCamera(50, W / H, 0.001, 5000);
      camera.position.set(3, 3, 3);

      const controls = new OrbitControls(camera, canvas);
      controls.target.set(0, 0.5, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance   = 0.01;
      controls.maxDistance   = 500;
      controls.update();

      const clock = new THREE.Clock();
      let animId;

      const animate = () => {
        animId = requestAnimationFrame(animate);
        controls.update();
        const t       = clock.getElapsedTime();
        const focused = focusedKeyRef.current;
        const cW      = el.clientWidth;
        const cH      = el.clientHeight;

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
            const worldPos = obj.sphere.position.clone();
            worldPos.y += 0.08;
            worldPos.project(camera);
            if (worldPos.z <= 1.0) {
              obj.labelEl.style.left       = `${(worldPos.x + 1) / 2 * cW}px`;
              obj.labelEl.style.top        = `${(-worldPos.y + 1) / 2 * cH}px`;
              obj.labelEl.style.visibility = 'visible';
            } else {
              obj.labelEl.style.visibility = 'hidden';
            }
          }
        });

        renderer.render(scene, camera);
      };
      animate();

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      ro.observe(el);

      sceneRef.current = { scene, camera, controls, renderer, gridRef: grid, clock };
      setSceneReady(true);

      cleanupFn = () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        controls.dispose();
        Object.values(trailsRef.current).forEach(disposeTrailObj);
        trailsRef.current = {};
        renderer.dispose();
        if (el.contains(canvas))          el.removeChild(canvas);
        if (el.contains(labelContainer))  el.removeChild(labelContainer);
        labelContRef.current = null;
      };
    });

    return () => { cancelAnimationFrame(rafId); cleanupFn?.(); };
  }, []);

  // ── 궤적 오브젝트 업데이트 ──────────────────────────────────────
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    const { scene } = sceneRef.current;
    const labelCont = labelContRef.current;

    // 사라진 로봇 정리
    const activeKeys = new Set(robotEntries.map(e => e.key));
    Object.keys(trailsRef.current).forEach(key => {
      if (!activeKeys.has(key)) {
        const obj = trailsRef.current[key];
        scene.remove(obj.line, obj.dots, obj.sphere, obj.ring);
        obj.labelEl?.remove();
        disposeTrailObj(obj);
        delete trailsRef.current[key];
      }
    });

    robotEntries.forEach(({ key, name }) => {
      const colorIdx  = colorMapRef.current[key] ?? 0;
      const hexColor  = ROBOT_COLORS[colorIdx % ROBOT_COLORS.length];
      const color     = new THREE.Color(hexColor);
      const isFocused = !focusedKey || focusedKey === key;
      const baseAlpha = isFocused ? 1 : 0.1;
      const vectors   = buildVectors(key, log);
      const hasLine   = vectors.length >= 2;
      const hasPt     = vectors.length > 0;

      let obj = trailsRef.current[key];
      if (!obj) {
        const line = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })
        );
        line.renderOrder = colorIdx + 1;

        const dots = new THREE.Points(
          new THREE.BufferGeometry(),
          new THREE.PointsMaterial({
            color, size: 0.02, sizeAttenuation: true,
            transparent: true, opacity: 0.5, depthTest: false,
          })
        );
        dots.renderOrder = colorIdx + 1;

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 14, 14),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
        );
        sphere.renderOrder = colorIdx + 10;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.034, 0.048, 28),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = colorIdx + 9;

        const labelEl = document.createElement('div');
        labelEl.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'white-space:nowrap',
          'transform:translate(-50%,-100%)',
          'margin-top:-8px',
          `color:${hexColor}`,
          `border:1.5px solid ${hexColor}`,
          'background:rgba(8,10,13,0.9)',
          'border-radius:6px',
          'padding:2px 9px',
          'font-size:11px',
          'font-weight:700',
          'font-family:system-ui,sans-serif',
          `text-shadow:0 0 8px ${hexColor}99`,
          'visibility:hidden',
        ].join(';');
        labelEl.textContent = name;
        labelCont?.appendChild(labelEl);

        scene.add(line, dots, sphere, ring);
        obj = { line, dots, sphere, ring, labelEl };
        trailsRef.current[key] = obj;
      }

      const isHidden = hiddenKeys.has(key);

      obj.line.material.opacity   = baseAlpha * 0.9;
      obj.dots.material.opacity   = baseAlpha * 0.5;
      obj.sphere.material.opacity = baseAlpha;
      if (obj.labelEl) obj.labelEl.style.opacity = String(baseAlpha);

      obj.line.geometry.setFromPoints(hasLine ? vectors : [new THREE.Vector3()]);

      if (hasPt) {
        obj.dots.geometry.setFromPoints(vectors);
        const last = vectors[vectors.length - 1];
        obj.sphere.position.copy(last);
        obj.ring.position.copy(last);
      } else {
        obj.dots.geometry.setFromPoints([new THREE.Vector3()]);
      }

      // 레이어 토글: hidden이면 전체 오브젝트 숨김
      obj.line.visible   = hasLine && !isHidden;
      obj.dots.visible   = hasPt   && !isHidden;
      obj.sphere.visible = hasPt   && !isHidden;
      obj.ring.visible   = hasPt   && !isHidden;
      if ((!hasPt || isHidden) && obj.labelEl) obj.labelEl.style.visibility = 'hidden';
    });
  }, [sceneReady, log, windowIdx, robotEntries, clearedAt, flipZ, focusedKey, hiddenKeys, buildVectors]);

  // ── 첫 데이터 자동 맞추기 ──────────────────────────────────────
  useEffect(() => {
    if (!sceneReady || !robotEntries.length || autoFittedRef.current) return;
    autoFittedRef.current = true;
    setTimeout(fitCamera, 100);
  }, [sceneReady, robotEntries, fitCamera]);

  // ── 현재 TCP 좌표 (레전드용) ────────────────────────────────────
  const currentPositions = useMemo(() => {
    const snap = log[log.length - 1];
    if (!snap) return {};
    const map = {};
    snap.robots?.forEach(r => {
      map[robotKey(r)] = {
        x: r.tcpX, y: r.tcpY,
        z: flipZ ? -r.tcpZ : r.tcpZ,
        status: r.status,
      };
    });
    return map;
  }, [log, flipZ]);

  function toggleFocus(key) {
    setFocusedKey(f => f === key ? null : key);
  }

  function toggleHidden(key) {
    const willHide = !hiddenKeys.has(key);
    setHiddenKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    // 숨기기로 전환 시, 해당 로봇이 포커스 중이면 포커스 해제 (다른 로봇 dim 방지)
    if (willHide) setFocusedKey(f => f === key ? null : f);
  }

  function clearTrails() {
    setClearedAt(Date.now());
    autoFittedRef.current = false;
  }

  function handleFlipZ() {
    setFlipZ(f => !f);
    autoFittedRef.current = false;
    setTimeout(fitCamera, 50);
  }

  // 현재 포커스된 로봇의 표시용 이름
  const focusedName = robotEntries.find(e => e.key === focusedKey)?.name ?? focusedKey;

  if (!log.length) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', background: '#0f1012', gap: 12,
      }}>
        <Route size={40} strokeWidth={1} color="#2a2d32" />
        <p style={{ fontSize: 14, fontWeight: 700, color: '#3a3d44', margin: 0 }}>
          수신된 TCP 데이터 없음
        </p>
        <p style={{ fontSize: 12, color: '#2d3038', margin: 0 }}>
          Unity에서 데이터를 수신하면 TCP 궤적이 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', position: 'relative', background: '#0f1012' }}>

      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* ── 좌상단 컨트롤 ── */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>

        {/* 연결 상태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, pointerEvents: 'none' }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? '#10b981' : '#333',
            boxShadow: connected ? '0 0 8px rgba(16,185,129,0.55)' : 'none',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: connected ? '#10b981' : '#444' }}>
            {connected ? '실시간 수신 중' : '연결 끊김'}
          </span>
          <span style={{ fontSize: 11, color: '#333' }}>· {log.length}pt</span>
        </div>

        {/* 궤적 창 버튼 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TRAIL_WINDOWS.map((w, i) => (
            <button key={w.label}
              onClick={() => { setWindowIdx(i); autoFittedRef.current = false; setTimeout(fitCamera, 50); }}
              style={btnStyle(windowIdx === i)}>
              {w.label}
            </button>
          ))}
          <button onClick={fitCamera} title="카메라 맞추기" style={btnStyle(false)}>
            <Maximize2 size={11} />
          </button>
          <button onClick={handleFlipZ} title={flipZ ? 'Unity 좌표계(Z반전)' : '원본 좌표계'} style={btnStyle(flipZ)}>
            <ArrowLeftRight size={11} />
            <span>Z{flipZ ? '↔' : '→'}</span>
          </button>
        </div>

        {/* 포커스 안내 */}
        {robotEntries.length > 1 && (
          <div style={{ fontSize: 10, color: '#2d3038', paddingLeft: 2 }}>
            {focusedKey ? `🔍 ${focusedName} 단독 보기 중` : '카드 클릭 → 단독 보기'}
          </div>
        )}

        {/* 로봇 레전드 카드 */}
        {robotEntries.map(({ key, name }) => {
          const colorIdx  = colorMapRef.current[key] ?? 0;
          const hexColor  = ROBOT_COLORS[colorIdx % ROBOT_COLORS.length];
          const isFocused = focusedKey === key;
          const isOther   = focusedKey && !isFocused;
          const isHidden  = hiddenKeys.has(key);
          const pos       = currentPositions[key];
          return (
            <div key={key} onClick={() => !isHidden && toggleFocus(key)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 9,
              padding: '8px 10px', borderRadius: 9, cursor: isHidden ? 'default' : 'pointer', textAlign: 'left',
              background: isFocused ? `${hexColor}14` : 'rgba(8,10,13,0.9)',
              backdropFilter: 'blur(10px)',
              border: `1.5px solid ${isFocused ? hexColor : isOther ? '#1e2126' : isHidden ? '#1e2126' : hexColor + '44'}`,
              opacity: isHidden ? 0.3 : isOther ? 0.45 : 1,
              transition: 'opacity 0.18s, border-color 0.18s, background 0.18s',
              minWidth: 168,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: isHidden ? '#333' : hexColor, flexShrink: 0, marginTop: 1,
                boxShadow: isFocused ? `0 0 10px ${hexColor}` : 'none',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isHidden ? '#444' : isOther ? '#444' : hexColor }}>
                    {name}
                  </span>
                  {pos?.status && !isHidden && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      background: pos.status === 'Run' ? '#10b98122' : '#33333344',
                      color: pos.status === 'Run' ? '#10b981' : '#555',
                    }}>
                      {pos.status}
                    </span>
                  )}
                </div>
                {pos && !isHidden && (
                  <div style={{
                    fontSize: 9, color: isOther ? '#333' : '#4a5060',
                    fontFamily: 'monospace', marginTop: 3, lineHeight: 1.6,
                  }}>
                    X {pos.x.toFixed(3)}<br />
                    Y {pos.y.toFixed(3)}<br />
                    Z {pos.z.toFixed(3)}
                  </div>
                )}
              </div>
              {/* 레이어 표시/숨김 토글 */}
              <button
                onClick={e => { e.stopPropagation(); toggleHidden(key); }}
                title={isHidden ? '궤적 표시' : '궤적 숨기기'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '1px 2px', display: 'flex', alignItems: 'center',
                  color: isHidden ? '#444' : hexColor, flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            </div>
          );
        })}

        {focusedKey && (
          <button onClick={() => setFocusedKey(null)} style={{
            fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
            border: '1px solid #333', background: 'rgba(8,10,13,0.9)',
            color: '#666', cursor: 'pointer',
          }}>
            전체 보기로 돌아가기
          </button>
        )}
      </div>

      {/* ── 우상단: 축 레전드 ── */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 10,
        background: 'rgba(8,10,13,0.9)', backdropFilter: 'blur(10px)',
        border: '1px solid #23262b', borderRadius: 8, padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none',
      }}>
        {[['X', '#ef4444'], ['Y', '#22c55e'], ['Z', '#3b82f6']].map(([ax, col]) => (
          <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 16, height: 2, background: col, borderRadius: 1 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#555' }}>{ax}축</span>
          </div>
        ))}
      </div>

      {/* ── 하단 바 ── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={clearTrails} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8,
          background: 'rgba(8,10,13,0.9)', backdropFilter: 'blur(10px)',
          border: '1px solid #23262b', color: '#555',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'color 0.12s, border-color 0.12s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e05252'; e.currentTarget.style.borderColor = '#e0525238'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#555';    e.currentTarget.style.borderColor = '#23262b'; }}
        >
          <Trash2 size={12} /> 궤적 초기화
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, color: '#2d3038', pointerEvents: 'none' }}>
          좌클릭 — 회전 &nbsp;·&nbsp; 우클릭 — 패닝 &nbsp;·&nbsp; 스크롤 — 줌
        </div>
      </div>
    </div>
  );
}

function disposeTrailObj(obj) {
  if (!obj) return;
  obj.line?.geometry.dispose();   obj.line?.material.dispose();
  obj.dots?.geometry.dispose();   obj.dots?.material.dispose();
  obj.sphere?.geometry.dispose(); obj.sphere?.material.dispose();
  obj.ring?.geometry.dispose();   obj.ring?.material.dispose();
  obj.labelEl?.remove();
}

function btnStyle(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
    border: '1px solid',
    borderColor: active ? '#6e8efb' : '#23262b',
    background:  active ? 'rgba(110,142,251,0.14)' : 'rgba(8,10,13,0.9)',
    color:       active ? '#6e8efb' : '#555',
    cursor: 'pointer', backdropFilter: 'blur(8px)',
  };
}
