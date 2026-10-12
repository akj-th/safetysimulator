/* ════════════════════════════════════════════════════════════════════
   AURI 최종 종합도 이미지 ↔ EPSG:5179 정합 — 건물 윤곽(흰 면)으로

   fit-final.mjs 는 이름 있는 시설 점이 2~3개 이상 있어야 합니다. 포천·홍천처럼 시설 점이
   교량·공원·교차로뿐이면 쓸 수 없습니다. 이 도구는 AURI 지도 바탕의 **흰 건물 면**과
   연속수치지형도 건물 레이어를 겹쳐 가장 잘 맞는 이동·회전을 찾습니다(축척은 축척 막대에서).

     X = a·x + b·y + c ,  Y = b·x − a·y + d       (fit-final 과 같은 꼴)

   실행
     node tools/overview-map/fit-buildings.mjs <지역> --sdm=폴더[,폴더] --mpp=0.775
         --anchor=1575,1289,968653.9,1981131.1   (이미지 px, 5179 — 대략 맞는 점 하나. 탐색의 출발점)
         [--range=300] [--rot=5] [--write] [--img=이미지경로]
     --img 를 생략하면 regions/<지역>.json 의 draft.file 을 씁니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readPolygons } from '../lib/shapefile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const cfgPath = path.join(HERE, 'regions', slug + '.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : null;
const sdm = ARGS.sdm ? String(ARGS.sdm).split(',') : cfg ? (Array.isArray(cfg.sdm) ? cfg.sdm : [cfg.sdm]) : null;
const imgPath = ARGS.img ? path.resolve(String(ARGS.img)) : cfg && cfg.draft && cfg.draft.file ? path.join(ROOT, cfg.draft.file) : null;
const mpp = +ARGS.mpp;
if (!slug || !sdm || !imgPath || !mpp || !ARGS.anchor) { console.error('사용법: fit-buildings.mjs <지역> --sdm=… --img=… --mpp=m/px --anchor=px,py,X,Y [--range=300] [--rot=5]'); process.exit(1); }
const [ax, ay, AX, AY] = String(ARGS.anchor).split(',').map(Number);
const RANGE = +(ARGS.range || 300), ROT = +(ARGS.rot || 5);

/* ── 이미지: 흰 면 마스크 ───────────────────────────────────────────── */
function readPng(f) { const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20), ct = b[25]; const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  let off = 8; const parts = []; while (off < b.length) { const len = b.readUInt32BE(off), t = b.toString('latin1', off + 4, off + 8); if (t === 'IDAT') parts.push(b.subarray(off + 8, off + 8 + len)); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(parts)), stride = w * ch, out = Buffer.alloc(w * h * ch); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const ft = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) { const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i]; if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1; else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? up : c; } cur[i] = v & 255; }
    cur.copy(out, y * stride); prev = cur; } return { w, h, ch, data: out }; }
const img = readPng(imgPath); const { w, h, ch, data } = img;
const mapW = Math.round(w * (+ARGS.mapw || 0.81));            // 오른쪽 범례·키맵 패널 제외
/* 건물 = "주변보다 밝은 면". 히트맵이 덮인 곳의 건물은 흰색이 아니라 옅은 색이라 절대 흰색 기준(222 이상)으로는 빠집니다.
   그래서 반경 rad 안 평균 밝기보다 thr 이상 밝으면 건물로 봅니다(--thr=10 --rad=25). */
const THR = +(ARGS.thr || 10), RAD = +(ARGS.rad || 25);
const lum = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) { const o = i * ch; lum[i] = (data[o] + data[o + 1] + data[o + 2]) / 3; }
const integ = new Float64Array((w + 1) * (h + 1));
for (let y = 1; y <= h; y++) { let row = 0; for (let x = 1; x <= w; x++) { row += lum[(y - 1) * w + (x - 1)]; integ[y * (w + 1) + x] = integ[(y - 1) * (w + 1) + x] + row; } }
const localMean = (x, y) => { const x0 = Math.max(0, x - RAD), y0 = Math.max(0, y - RAD), x1 = Math.min(w, x + RAD + 1), y1 = Math.min(h, y + RAD + 1); const W1 = w + 1; return (integ[y1 * W1 + x1] - integ[y0 * W1 + x1] - integ[y1 * W1 + x0] + integ[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0)); };
const isWhite = (x, y) => { const L = lum[y * w + x]; return L > 140 && L > localMean(x, y) + THR; };

/* 격자 셀(cell px)마다 흰 비율 → 0/1 */
function maskAt(cell) { const gw = Math.floor(mapW / cell), gh = Math.floor(h / cell); const m = new Uint8Array(gw * gh); let n = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { let k = 0; for (let y = gy * cell; y < (gy + 1) * cell; y += 2) for (let x = gx * cell; x < (gx + 1) * cell; x += 2) if (isWhite(x, y)) k++; if (k >= (cell * cell / 4) * 0.55) { m[gy * gw + gx] = 1; n++; } }
  return { m, gw, gh, n }; }

/* ── 건물 레이어 → 5179 격자(res m) ──────────────────────────────────── */
const rings = [];
for (const sd of sdm) { const dir = path.join(ROOT, sd); for (const d of fs.readdirSync(dir)) { const sub = path.join(dir, d); if (!fs.statSync(sub).isDirectory()) continue; const shp = fs.readdirSync(sub).find(f => /\.shp$/i.test(f) && f.includes('B0010000')); if (!shp) continue; for (const s of readPolygons(path.join(sub, shp))) rings.push(...s.rings); } }
/* 관심 범위: 앵커 기준 이미지 전체 + 탐색 여유 */
const halfW = w * mpp * 0.75, halfH = h * mpp * 0.75;
const X0 = AX - halfW - RANGE, X1 = AX + halfW + RANGE, Y0 = AY - halfH - RANGE, Y1 = AY + halfH + RANGE;
function bldgRaster(res) { const gw = Math.ceil((X1 - X0) / res), gh = Math.ceil((Y1 - Y0) / res); const g = new Uint8Array(gw * gh);
  for (const ring of rings) { let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity; for (const p of ring) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    if (maxx < X0 || minx > X1 || maxy < Y0 || miny > Y1) continue;
    const gy0 = Math.max(0, Math.floor((Y1 - maxy) / res)), gy1 = Math.min(gh - 1, Math.floor((Y1 - miny) / res));
    for (let gy = gy0; gy <= gy1; gy++) { const yc = Y1 - (gy + 0.5) * res; const xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) * (xj - xi) / (yj - yi)); }
      xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) { const ga = Math.max(0, Math.floor((xs[k] - X0) / res)), gb = Math.min(gw - 1, Math.floor((xs[k + 1] - X0) / res)); for (let gx = ga; gx <= gb; gx++) g[gy * gw + gx] = 1; } } }
  return { g, gw, gh, res }; }

/* ── 점수: 이미지 흰 셀을 5179 로 옮겨 건물 격자와 겹치는 비율 ───────── */
function score(M, B, cell, a, b, c, d) { let hit = 0, tot = 0; const { m, gw, gh } = M;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { if (!m[gy * gw + gx]) continue; tot++; const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell; const X = a * x + b * y + c, Y = b * x - a * y + d;
    const bx = Math.floor((X - X0) / B.res), by = Math.floor((Y1 - Y) / B.res); if (bx < 0 || by < 0 || bx >= B.gw || by >= B.gh) continue; if (B.g[by * B.gw + bx]) hit++; }
  return hit / Math.max(1, tot); }
const abcd = (theta, dx, dy, k = 1) => { const a = mpp * k * Math.cos(theta), b = mpp * k * Math.sin(theta); const c = AX + dx - (a * ax + b * ay), d = AY + dy - (b * ax - a * ay); return [a, b, c, d]; };

/* 거친 탐색 → 세밀 탐색 */
let best = { s: -1 };
/* 축척 막대를 눈으로 읽은 값은 ±2% 쯤 틀릴 수 있어 축척 배율 k 도 함께 찾습니다 */
const stages = [{ cell: 12, step: 10, rotStep: 1, range: RANGE, rot: ROT, kr: +(ARGS.kr || 0.05), ks: 0.01 }, { cell: 6, step: 3, rotStep: 0.25, range: 24, rot: 1.5, kr: 0.01, ks: 0.0025 }, { cell: 3, step: 1, rotStep: 0.1, range: 6, rot: 0.4, kr: 0.003, ks: 0.001 }];
let center = { theta: 0, dx: 0, dy: 0, k: 1 };
for (const st of stages) {
  const M = maskAt(st.cell), B = bldgRaster(st.cell * mpp);
  let sb = { s: -1 };
  for (let k = center.k - st.kr; k <= center.k + st.kr + 1e-9; k += st.ks)
  for (let th = center.theta - st.rot * Math.PI / 180; th <= center.theta + st.rot * Math.PI / 180 + 1e-9; th += st.rotStep * Math.PI / 180)
    for (let dx = center.dx - st.range; dx <= center.dx + st.range; dx += st.step) for (let dy = center.dy - st.range; dy <= center.dy + st.range; dy += st.step) {
      const s = score(M, B, st.cell, ...abcd(th, dx, dy, k)); if (s > sb.s) sb = { s, theta: th, dx, dy, k }; }
  center = sb; best = sb;
  console.log(`cell ${st.cell}px: 겹침 ${(sb.s * 100).toFixed(1)}% · 회전 ${(sb.theta * 180 / Math.PI).toFixed(2)}° · 이동 (${sb.dx}, ${sb.dy}) m · 축척 ×${sb.k.toFixed(4)} · 흰 셀 ${M.n}`);
}
const [a, b, c, d] = abcd(best.theta, best.dx, best.dy, best.k);
console.log(`\naffine5179  a=${a}  b=${b}  c=${c}  d=${d}`);
console.log(`축척 ${(mpp * best.k).toFixed(4)} m/px(막대 ${mpp} × ${best.k.toFixed(4)}) · 회전 ${(best.theta * 180 / Math.PI).toFixed(2)}° · 앵커 보정 (${best.dx}, ${best.dy}) m · 겹침 ${(best.s * 100).toFixed(1)}%`);
if (ARGS.write) { if (!cfg) { console.error('regions/' + slug + '.json 없음'); process.exit(1); } cfg.draft = cfg.draft || {}; cfg.draft.affine5179 = { a, b, c, d }; cfg.draft.note = `최종본 정합 ${new Date().toISOString().slice(0, 10)} — 건물 윤곽 겹침 ${(best.s * 100).toFixed(0)}% (축척 ${(mpp * best.k).toFixed(4)} m/px · 회전 ${(best.theta * 180 / Math.PI).toFixed(1)}°)`; fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); console.log('→ draft.affine5179 갱신'); }
