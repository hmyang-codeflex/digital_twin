import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const SUPPORTED_MESH_EXTS = ['stl', 'obj', 'gltf', 'glb', 'fbx'];

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(import.meta.env.BASE_URL + 'draco/');

// 한글/공백 포함 경로를 file:// URL로 안전하게 변환
export function toFileUrl(p) {
  return encodeURI('file:///' + p.replace(/\\/g, '/'));
}

// 로드 실패 시 표시할 절차적 대체 지오메트리 (와이어프레임 박스 + 축 표시)
// 실제 치수를 알 수 없으므로 고정 크기의 플레이스홀더로, 사용자가 로딩 실패를 시각적으로 인지하도록 함
export function buildProceduralFallback(name = '') {
  const group = new THREE.Group();
  group.name = '__mesh__';

  const size = 0.15;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color: 0xd9822b, metalness: 0.1, roughness: 0.7,
      transparent: true, opacity: 0.35,
    }),
  );
  box.castShadow = true;
  group.add(box);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: 0xd9822b, linewidth: 2 }),
  );
  group.add(edges);

  group.userData.isFallback = true;
  group.userData.fallbackReason = name;
  return group;
}

// 확장자에 따라 적절한 로더로 메쉬를 로드한다.
// onLoad(object3d, { isFallback }) / onError(message) 콜백을 받는다.
// 로드 실패 시 onError를 호출한 뒤 자동으로 절차적 폴백을 onLoad로 전달한다.
export function loadMesh(meshPath, { onLoad, onError }) {
  const ext = meshPath.split('.').pop().toLowerCase();
  const url = toFileUrl(meshPath);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7c9fcc, metalness: 0.15, roughness: 0.5 });

  const wrapLoad = (obj) => {
    obj.name = '__mesh__';
    obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.material = mat.clone(); } });
    onLoad(obj, { isFallback: false });
  };

  const wrapError = (e) => {
    const message = `.${ext} 로드 실패: ${e?.message ?? String(e)}`;
    onError?.(message);
    onLoad(buildProceduralFallback(message), { isFallback: true });
  };

  try {
    if (ext === 'stl') {
      new STLLoader().load(url, (geo) => {
        geo.computeVertexNormals();
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(geo, mat.clone()));
        wrapLoad(grp);
      }, undefined, wrapError);
    } else if (ext === 'obj') {
      new OBJLoader().load(url, wrapLoad, undefined, wrapError);
    } else if (ext === 'fbx') {
      new FBXLoader().load(url, wrapLoad, undefined, wrapError);
    } else if (ext === 'gltf' || ext === 'glb') {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.load(url, (gltf) => wrapLoad(gltf.scene), undefined, wrapError);
    } else {
      wrapError(new Error(`지원하지 않는 포맷: .${ext}`));
    }
  } catch (e) {
    wrapError(e);
  }
}
