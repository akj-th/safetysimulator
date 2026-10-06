/* ════════════════════════════════════════════════════════════════════
   AURI 초안 이미지를 우리 지도에 맞추기 (자동 조정)

   실행:  node tools/overview-map/fit-draft.mjs namhae
   먼저   node tools/overview-map/build-overview-map.mjs namhae  를 한 번 돌려
          output/…/_frame.json (육지 폴리곤 px) 이 있어야 합니다.

   초안(네이버 지도 바탕)의 **바다색 픽셀**과 우리 지도의 **육지 밖 영역**이 가장 잘
   겹치는 위치(x0,y0)·배율(scale)을 찾아 regions/<지역>.json 의 draft.transform 에 적습니다.
   눈으로 맞추면 수십 m 씩 어긋나므로 자동으로 합니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const regionId = process.argv[2];
const cfgPath = path.join(HERE, 'regions', regionId + '.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const frame = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/overview-map', cfg.region, '_frame.json'), 'utf8'));

/* ── PNG 읽기 (8비트 RGB/RGBA, 비인터레이스) ───────────────────────── */
function readPng(file) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), ct = b[25];
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : null;
  if (!ch || b[24] !== 8) throw new Error('8비트 RGB/RGBA PNG 만 지원합니다');
  let off = 8; const parts = [];
  while (off < b.length) { const len = b.readUInt32BE(off); const type = b.toString('latin1', off + 4, off + 8); if (type === 'IDAT') parts.push(b.subarray(off + 8, off + 8 + len)); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = w * ch, out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1;
      else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, ch, data: out };
}

/* ── 초안의 바다 마스크 ───────────────────────────────────────────────
   네이버 지도 바다색: 연한 청색. 초안 위에 얹힌 보라색 히트맵·흰 상자는 제외됩니다. */
const png = readPng(path.join(ROOT, cfg.draft.file));
let D = cfg.draft.transform || { x0: 0, y0: 0, scale: 1 };
if (cfg.draft.world) {               // 지난 정합 결과(월드 좌표)를 지금 화면 px 로 환산해 시작값으로
  const w = cfg.draft.world, k = 2 ** (frame.zoom - w.zoom);
  D = { x0: (w.x0 * k - frame.originX) * frame.scale, y0: (w.y0 * k - frame.originY) * frame.scale, scale: w.scale * k * frame.scale };
}
const isSea = (r, g, b) => b > 200 && g > 190 && r < 215 && (b - r) > 20 && (g - r) > 8;
const seaD = new Uint8Array(png.w * png.h);
let nSea = 0;
for (let i = 0; i < png.w * png.h; i++) { const o = i * png.ch; if (isSea(png.data[o], png.data[o + 1], png.data[o + 2])) { seaD[i] = 1; nSea++; } }
console.log(`초안 ${png.w}×${png.h} · 바다 픽셀 ${nSea} (${(100 * nSea / (png.w * png.h)).toFixed(1)}%)`);

/* ── 우리 지도의 육지 마스크 (px) ─────────────────────────────────────── */
const { W, H } = frame;
const land = new Uint8Array(W * H);
function parsePath(d) {        // "M x y L x y … Z" 반복 → 링들
  const rings = []; let cur = null;
  const re = /([MLZ])([^MLZ]*)/g; let m;
  while ((m = re.exec(d))) {
    if (m[1] === 'M') { cur = []; rings.push(cur); const [x, y] = m[2].trim().split(/\s+/).map(Number); cur.push([x, y]); }
    else if (m[1] === 'L') { const nums = m[2].trim().split(/[\s,]+/).map(Number); for (let i = 0; i + 1 < nums.length; i += 2) cur.push([nums[i], nums[i + 1]]); }
  }
  return rings;
}
function rasterize(rings, gw, gh, mask) {
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const ys = ring.map(p => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(gh - 1, Math.ceil(Math.max(...ys)));
    for (let gy = y0; gy <= y1; gy++) {
      const sy = gy + 0.5, xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > sy) !== (yj > sy)) xs.push(xi + (sy - yi) * (xj - xi) / (yj - yi)); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.round(xs[k])), b = Math.min(gw - 1, Math.round(xs[k + 1]) - 1); for (let gx = a; gx <= b; gx++) mask[gy * gw + gx] ^= 1; }
    }
  }
}
for (const d of frame.land) rasterize(parsePath(d), W, H, land);

/* ── 점수: 초안 바다 픽셀(표본)을 변환했을 때 우리 지도에서 바다인 비율
          + 초안 육지 픽셀이 우리 육지인 비율 (둘 다 높아야 함) ─────────── */
const samples = [];
for (let y = 0; y < png.h; y += 3) for (let x = 0; x < png.w; x += 3) samples.push([x, y, seaD[y * png.w + x]]);
function score(x0, y0, s) {
  let agree = 0, n = 0;
  for (const [dx, dy, sea] of samples) {
    const px = Math.round(x0 + dx * s), py = Math.round(y0 + dy * s);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    n++; if ((land[py * W + px] ? 0 : 1) === sea) agree++;
  }
  return n ? agree / n : 0;
}
let best = { x0: D.x0, y0: D.y0, scale: D.scale, sc: score(D.x0, D.y0, D.scale) };
console.log(`시작값 x0 ${best.x0} y0 ${best.y0} scale ${best.scale} → 일치 ${(best.sc * 100).toFixed(2)}%`);
for (const [rx, ry, rs, st, ss] of [[120, 120, 0.25, 6, 0.02], [24, 24, 0.06, 2, 0.005], [6, 6, 0.015, 1, 0.001]]) {
  const b0 = { ...best };
  for (let s = b0.scale - rs; s <= b0.scale + rs + 1e-9; s += ss)
    for (let x0 = b0.x0 - rx; x0 <= b0.x0 + rx; x0 += st)
      for (let y0 = b0.y0 - ry; y0 <= b0.y0 + ry; y0 += st) {
        const sc = score(x0, y0, s);
        if (sc > best.sc) best = { x0, y0, scale: +s.toFixed(4), sc };
      }
  console.log(`  탐색 ±${rx}px / 배율 ±${rs} → x0 ${best.x0} y0 ${best.y0} scale ${best.scale} · 일치 ${(best.sc * 100).toFixed(2)}%`);
}
cfg.draft.transform = { x0: best.x0, y0: best.y0, scale: best.scale, fit: +(best.sc * 100).toFixed(2), note: '이 화면(폭 ' + (cfg.frame.widthMeters) + 'm) 기준 px — 참고용. 실제로는 world 를 씁니다' };
cfg.draft.world = { x0: frame.originX + best.x0 / frame.scale, y0: frame.originY + best.y0 / frame.scale, scale: best.scale / frame.scale, zoom: frame.zoom };
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log(`→ ${path.relative(ROOT, cfgPath)} 의 draft.transform 갱신`);
