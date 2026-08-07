// ── 파일 다운로드 헬퍼 ───────────────────────────────────────────
export function downloadText(filename, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}

// ── ZIP 생성 (외부 의존성 없음, STORE 방식) ──────────────────────
function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: Array<{ name: string, content: string }>
export function downloadZip(filename, files) {
  const enc     = new TextEncoder();
  const entries = [];
  let   offset  = 0;

  for (const { name, content } of files) {
    const nameB = enc.encode(name);
    const dataB = enc.encode(content);
    const crc   = _crc32(dataB);
    const size  = dataB.length;

    const lh = new Uint8Array(30 + nameB.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32( 0, 0x04034b50, true); // local file sig
    lv.setUint16( 4, 20,         true); // version needed
    lv.setUint16( 8, 0,          true); // compression: STORE
    lv.setUint32(14, crc,        true);
    lv.setUint32(18, size,       true); // compressed size
    lv.setUint32(22, size,       true); // uncompressed size
    lv.setUint16(26, nameB.length, true);
    lh.set(nameB, 30);

    entries.push({ nameB, dataB, crc, size, lhOffset: offset, lh });
    offset += lh.length + size;
  }

  const cdOffset = offset;
  const cdParts  = entries.map(({ nameB, crc, size, lhOffset }) => {
    const h = new Uint8Array(46 + nameB.length);
    const v = new DataView(h.buffer);
    v.setUint32( 0, 0x02014b50, true); // central dir sig
    v.setUint16( 4, 20,         true);
    v.setUint16( 6, 20,         true);
    v.setUint16(10, 0,          true); // STORE
    v.setUint32(16, crc,        true);
    v.setUint32(20, size,       true);
    v.setUint32(24, size,       true);
    v.setUint16(28, nameB.length, true);
    v.setUint32(42, lhOffset,   true);
    h.set(nameB, 46);
    return h;
  });

  const cdSize = cdParts.reduce((s, h) => s + h.length, 0);
  const eocd   = new Uint8Array(22);
  const ev     = new DataView(eocd.buffer);
  ev.setUint32( 0, 0x06054b50,      true);
  ev.setUint16( 8, entries.length,  true);
  ev.setUint16(10, entries.length,  true);
  ev.setUint32(12, cdSize,          true);
  ev.setUint32(16, cdOffset,        true);

  const blob = new Blob(
    [...entries.flatMap(e => [e.lh, e.dataB]), ...cdParts, eocd],
    { type: 'application/zip' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 보고서 공통 CSS ───────────────────────────────────────────────
export const REPORT_BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a1a;line-height:1.5}
h1{font-size:22px;font-weight:800;letter-spacing:-.03em;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:6px}
.meta{font-size:11px;color:#999;margin-bottom:30px}
h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;margin:28px 0 10px;border-left:3px solid #1a1a1a;padding-left:10px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
th{background:#f5f5f5;padding:7px 12px;text-align:left;font-weight:700;border:1px solid #eaeaea;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
td{padding:7px 12px;border:1px solid #eaeaea;vertical-align:middle}
tr:nth-child(even) td{background:#fafafa}
.bd{background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
.bw{background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
.footer{font-size:11px;color:#ccc;margin-top:48px;padding-top:14px;border-top:1px solid #f0f0f0;text-align:center}
@media print{body{padding:20px}}`;
