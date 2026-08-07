import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { RotateCcw, RotateCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';

const STEP = Math.PI / 2; // 90°

export default function ModelViewer({ urdfPath, meshFolder }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  // ── 씬 초기화 ────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let rafId;
    let cleanupFn;

    rafId = requestAnimationFrame(() => {
      if (!mountRef.current) return;

      const W = el.offsetWidth  || 800;
      const H = el.offsetHeight || 600;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const canvas = renderer.domElement;
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf7f6f3);
      scene.fog = new THREE.FogExp2(0xf7f6f3, 0.022);

      const camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 200);
      camera.position.set(3.5, 2.2, 3.5);

      // 조명
      scene.add(new THREE.AmbientLight(0xdde5f5, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(6, 12, 8);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 60;
      sun.shadow.camera.left = -8;  sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;    sun.shadow.camera.bottom = -8;
      sun.shadow.bias = -0.0005;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xc8d8ff, 0.5);
      fill.position.set(-6, 4, -4);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xfff0e0, 0.22);
      rim.position.set(0, -3, -8);
      scene.add(rim);

      // 그리드 + 바닥
      const grid = new THREE.GridHelper(20, 40, 0xc8d0e8, 0xdde3f0);
      grid.position.y = -0.001;
      scene.add(grid);
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({ color: 0xf5f7fc, roughness: 0.95 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 0.3;
      controls.maxDistance = 40;
      controls.maxPolarAngle = Math.PI * 0.88;

      let animId;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const ro = new ResizeObserver(() => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      });
      ro.observe(el);

      sceneRef.current = { scene, camera, controls, renderer };

      cleanupFn = () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.dispose();
        if (el.contains(canvas)) el.removeChild(canvas);
      };
    });

    return () => {
      cancelAnimationFrame(rafId);
      cleanupFn?.();
    };
  }, []);

  // ── URDF 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !urdfPath) return;
    const { scene } = sceneRef.current;

    const prev = scene.getObjectByName('__robot__');
    if (prev) {
      prev.traverse(c => {
        if (!c.isMesh) return;
        c.geometry?.dispose();
        (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m?.dispose());
      });
      scene.remove(prev);
    }

    const manager = new THREE.LoadingManager();
    const loader  = new URDFLoader(manager);

    const urdfUnix = urdfPath.replace(/\\/g, '/');
    const urdfDir  = urdfUnix.substring(0, urdfUnix.lastIndexOf('/'));
    loader.packages = () => meshFolder
      ? 'file:///' + meshFolder.replace(/\\/g, '/')
      : 'file:///' + urdfDir;

    let loadedRobot = null;

    const positionCamera = (robot) => {
      if (!sceneRef.current) return false;
      const { camera, controls } = sceneRef.current;
      const box = new THREE.Box3().setFromObject(robot);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        robot.position.set(-center.x, -box.min.y, -center.z);
        const dist = Math.max(size.length() * 1.5, 2);
        controls.target.set(0, size.y * 0.4, 0);
        camera.position.set(dist * 0.7, size.y * 0.5, dist * 0.7);
        controls.update();
        return true;
      }
      return false;
    };

    manager.onLoad = () => { if (loadedRobot) positionCamera(loadedRobot); };

    loader.load(
      'file:///' + urdfUnix,
      (robot) => {
        robot.name = '__robot__';
        robot.traverse(child => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          if (!child.material || child.material.type === 'MeshBasicMaterial') {
            child.material = new THREE.MeshStandardMaterial({
              color: 0x8899cc, metalness: 0.65, roughness: 0.25,
            });
          }
        });
        scene.add(robot);
        loadedRobot = robot;

        let tries = 0;
        const retry = () => {
          if (tries++ > 120 || positionCamera(robot)) return;
          requestAnimationFrame(retry);
        };
        requestAnimationFrame(retry);
      },
      undefined,
      (err) => {
        console.warn('[ModelViewer] 로드 실패:', err);
        const fallback = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.5, 0.5),
          new THREE.MeshStandardMaterial({ color: 0xef4444, wireframe: true })
        );
        fallback.name = '__robot__';
        fallback.position.y = 0.75;
        scene.add(fallback);
        loadedRobot = fallback;
      }
    );
  }, [urdfPath, meshFolder]);

  // ── 90° 회전 핸들러 ───────────────────────────────────────────
  const rotate = (axis, dir) => {
    const robot = sceneRef.current?.scene.getObjectByName('__robot__');
    if (!robot) return;
    robot.rotation[axis] = Math.round((robot.rotation[axis] + dir * STEP) * 1e6) / 1e6;
  };

  const resetRotation = () => {
    const robot = sceneRef.current?.scene.getObjectByName('__robot__');
    if (!robot) return;
    robot.rotation.set(0, 0, 0);
  };

  return (
    <div ref={mountRef} style={{ position: 'absolute', inset: 0 }}>
      <RotationControls onRotate={rotate} onReset={resetRotation} />
    </div>
  );
}

// ── 회전 컨트롤 패널 ─────────────────────────────────────────────
function RotationControls({ onRotate, onReset }) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      zIndex: 10,
      background: 'rgba(255,255,255,0.90)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      userSelect: 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        회전 90°
      </div>

      {/* Y축 (좌우 회전) */}
      <AxisRow label="Y" color="#22c55e">
        <Btn onClick={() => onRotate('y', -1)} title="Y축 -90°"><ChevronLeft size={13}/></Btn>
        <Btn onClick={() => onRotate('y', +1)} title="Y축 +90°"><ChevronRight size={13}/></Btn>
      </AxisRow>

      {/* X축 (앞뒤 기울기) */}
      <AxisRow label="X" color="#ef4444">
        <Btn onClick={() => onRotate('x', -1)} title="X축 -90°"><ChevronUp size={13}/></Btn>
        <Btn onClick={() => onRotate('x', +1)} title="X축 +90°"><ChevronDown size={13}/></Btn>
      </AxisRow>

      {/* Z축 (롤) */}
      <AxisRow label="Z" color="#2383e2">
        <Btn onClick={() => onRotate('z', -1)} title="Z축 -90°"><RotateCcw size={13}/></Btn>
        <Btn onClick={() => onRotate('z', +1)} title="Z축 +90°"><RotateCw size={13}/></Btn>
      </AxisRow>

      {/* 리셋 */}
      <button
        onClick={onReset}
        title="회전 초기화"
        style={{
          marginTop: 2,
          width: '100%',
          padding: '5px 0',
          borderRadius: 7,
          background: 'var(--accent-dim)',
          border: '1px solid var(--border)',
          color: 'var(--accent)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#e9e8e4'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#f1f0ee'; }}
      >
        <RefreshCw size={11} />
        리셋
      </button>
    </div>
  );
}

function AxisRow({ label, color, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 16, height: 16,
        borderRadius: 4,
        background: color,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Btn({ children, onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 30, height: 30,
        borderRadius: 7,
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        color: '#374151',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 0.1s, transform 0.08s',
        padding: 0,
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f1f0ee'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.93)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}
