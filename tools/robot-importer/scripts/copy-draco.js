const fs   = require('fs');
const path = require('path');

const src  = path.resolve(__dirname, '../node_modules/three/examples/jsm/libs/draco');
const dest = path.resolve(__dirname, '../public/draco');

if (!fs.existsSync(src)) {
  console.warn('[copy-draco] three.js draco 디렉토리를 찾을 수 없습니다:', src);
  process.exit(0);
}

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

copyDir(src, dest);
console.log('[copy-draco] Draco 디코더를 public/draco/에 복사했습니다.');
