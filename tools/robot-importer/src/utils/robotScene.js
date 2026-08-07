import * as THREE from 'three';

// ── 로봇 색상 팔레트 ─────────────────────────────────────────────
export const COLORS = [
  '#38bdf8', '#f97316', '#4ade80', '#e879f9',
  '#f43f5e', '#facc15', '#fb923c', '#a78bfa',
];

// ── DH 파라미터 ──────────────────────────────────────────────────
export const ROBOT_MODELS = {
  ABB_IRB_6700: {
    label: 'ABB IRB 6700',
    dh: [
      { d: 0.78,   tOfs: 0,            a: 0.32,  al: -Math.PI / 2, f:  1 },
      { d: 0,      tOfs: -Math.PI / 2, a: 1.135, al: 0,            f:  1 },
      { d: 0,      tOfs: 0,            a: 0.2,   al: -Math.PI / 2, f:  1 },
      { d: 1.1825, tOfs: 0,            a: 0,     al: -Math.PI / 2, f:  1 },
      { d: 0,      tOfs: 0,            a: 0,     al:  Math.PI / 2, f: -1 },
      { d: 0.35,   tOfs: 0,            a: 0,     al: 0,            f:  1 },
    ],
  },
  BX200L: {
    label: 'BX200L',
    dh: [
      { d: 0.53,  tOfs: 0,            a: 0.2,  al: -Math.PI / 2, f:  1 },
      { d: 0,     tOfs: -Math.PI / 2, a: 1.16, al: 0,            f:  1 },
      { d: 0,     tOfs: 0,            a: 0.23, al: -Math.PI / 2, f:  1 },
      { d: 1.25,  tOfs: 0,            a: 0,    al: -Math.PI / 2, f:  1 },
      { d: 0,     tOfs: 0,            a: 0,    al:  Math.PI / 2, f: -1 },
      { d: 0.225, tOfs: 0,            a: 0,    al: 0,            f:  1 },
    ],
  },
};

// ── 모델 키 해석 — 인식 못 하면 null ────────────────────────────
export function resolveModelKey(modelType) {
  if (!modelType) return 'ABB_IRB_6700';
  if (modelType.toLowerCase().includes('spherical')) return 'ABB_IRB_6700';
  if (modelType.includes('BX200L')) return 'BX200L';
  return null;
}

// ── Unity 왼손계 DH 행렬 ─────────────────────────────────────────
export const DEG2RAD = Math.PI / 180;

export function unityDH(d, theta, a, alpha) {
  const cT = Math.cos(theta), sT = Math.sin(theta);
  const cA = Math.cos(alpha), sA = Math.sin(alpha);
  const m = new THREE.Matrix4();
  m.set(
    cT * cA,  cT * sA, -sT,   -a * sT,
    -sA,       cA,      0,     d,
    sT * cA,  sT * sA,  cT,    a * cT,
    0,         0,        0,     1,
  );
  return m;
}

// ── Unity 왼손계 → Three.js 오른손계 변환 (Z 반전) ─────────────
export function toThreeJS(m) {
  const e = m.elements, o = [...e];
  o[8]  = -e[8];  o[9]  = -e[9];  o[10] = -e[10]; o[11] = -e[11];
  o[2]  = -o[2];  o[6]  = -o[6];  o[10] = -o[10]; o[14] = -o[14];
  return new THREE.Matrix4().fromArray(o);
}

// ── FK 계산 (base 쿼터니언 포함) ─────────────────────────────────
export function computeFK(dhRows, angles, bx, by, bz, bqx, bqy, bqz, bqw, flipZ) {
  const q = flipZ
    ? new THREE.Quaternion(-bqx, -bqy, bqz, bqw)
    : new THREE.Quaternion(bqx,   bqy,  bqz, bqw);
  q.normalize();
  let W = new THREE.Matrix4().compose(
    new THREE.Vector3(bx, by, bz),
    q,
    new THREE.Vector3(1, 1, 1),
  );
  const pts = [new THREE.Vector3(bx, by, bz)];
  dhRows.forEach((row, i) => {
    const theta = row.tOfs + (angles[i] ?? 0) * row.f * DEG2RAD;
    W = new THREE.Matrix4().multiplyMatrices(W, toThreeJS(unityDH(row.d, theta, row.a, row.al)));
    pts.push(new THREE.Vector3().setFromMatrixPosition(W));
  });
  return pts; // [base, J1..J6]
}

// ── 로봇 메쉬 빌더 ──────────────────────────────────────────────
export const LINK_R  = 0.045;
export const JOINT_R = 0.085;

export function buildRobotMeshes(hexColor) {
  const group   = new THREE.Group();
  const tint    = new THREE.Color(hexColor);
  const linkMat = new THREE.MeshPhongMaterial({ color: tint, shininess: 60 });
  const jMat    = new THREE.MeshPhongMaterial({ color: 0x4a4a4a });
  const tcpMat  = new THREE.MeshPhongMaterial({ color: 0xffaa22, shininess: 120 });
  const baseMat = new THREE.MeshPhongMaterial({ color: 0x222222 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 24), baseMat);
  base.receiveShadow = true;
  group.add(base);

  const joints = Array.from({ length: 6 }, (_, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(i === 5 ? JOINT_R * 0.65 : JOINT_R, 16, 12),
      i === 5 ? tcpMat : jMat.clone(),
    );
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });

  const links = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(LINK_R, LINK_R, 1, 10),
      linkMat.clone(),
    );
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });

  return { group, base, joints, links };
}

// ── 실린더를 두 점 사이에 배치 ───────────────────────────────────
const _V  = new THREE.Vector3();
const _Q  = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

export function placeCylinder(mesh, from, to) {
  const dist = from.distanceTo(to);
  if (dist < 1e-4) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.set(
    (from.x + to.x) * 0.5,
    (from.y + to.y) * 0.5,
    (from.z + to.z) * 0.5,
  );
  _V.subVectors(to, from).normalize();
  if (_V.dot(_UP) < -0.9999) _Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  else _Q.setFromUnitVectors(_UP, _V);
  mesh.quaternion.copy(_Q);
  mesh.scale.y = dist;
}

// ── 로봇 고유 키 (instanceId 우선) ──────────────────────────────
export function robotKey(r) {
  return r.instanceId != null ? String(r.instanceId) : r.name;
}
