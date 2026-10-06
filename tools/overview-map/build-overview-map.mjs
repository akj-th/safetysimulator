/* ════════════════════════════════════════════════════════════════════
   중점관리분야 맞춤형 사업 종합도 — SVG 생성기

   실행:  node tools/overview-map/build-overview-map.mjs namhae
          (tools 폴더 안에서  npm run overview -- namhae)

   ── 무엇을 만드는가 ────────────────────────────────────────────────
   tools/overview-map/regions/<지역>.json 에 적힌 사업지(존)·문장·동선을
   연속수치지형도(1:5,000) 위에 얹어 **1920×1080 SVG 한 장**을 만듭니다.

     output/overview-map/<지역>/<지역>_종합도.svg

   ── 쓰는 자료 (지자체마다 이것만 있으면 됩니다) ──────────────────────
   연속수치지형도 SHP (data/raw/SDM_5K/<코드_지역>/ 아래 폴더째)
     N3A_A0010000  도로경계(면)        → 도로
     N3A_B0010000  건물(면)            → 건물
     N3A_E0010001  하천경계(면)        → 하천
     N3A_E0032111  실폭하천(면)        → 하천
     N3A_E0052114  호수·저수지(면)     → 저수지
     N3A_G0100000  행정경계 시군구(면) → 굵은 경계선 · 바다(육지 밖) 판정
     N3A_G0110000  행정경계 읍면동(면) → 경계선 · 바다 판정
     N3A_D0010000  경지계(면) — 논·밭  → 전답 (★ 폴더에 있으면 자동으로 얹음, 없으면 건너뜀)
   조사지 SHP       data/raw/gis_0901/최종 조사지/<지역>_OverlapUnion_1.shp
   바탕 위성영상    브이월드 Satellite 타일 (인증키 불필요) — data/raw/tiles/ 에 캐시

   ── 좌표 ──────────────────────────────────────────────────────────
   SHP 는 EPSG:5179(UTM-K), 조사지는 EPSG:5186(중부원점). 둘 다 WGS84 를
   거쳐 **웹 메르카토르 타일 픽셀 좌표**로 바꿔 그립니다. 그래야 위성 타일을
   비틀지 않고 그대로 깔 수 있습니다(이 축척에서 왜곡 차이는 1px 미만).
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from '../node_modules/proj4/dist/proj4-src.js';
import { readDbf, readPolygons } from '../lib/shapefile.mjs';
import { iconDefs } from './icons.mjs';
import { loadRaster, heatPng, extractZone, DEFAULTS as RISK_DEFAULTS, AURI_COLORS } from './risk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const P5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const P5179 = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS = 'EPSG:4326';

/* ── 색·선 (회사 예시 톤 + 앱 테마 색) ─────────────────────────────── */
const C = {
  main: '#D83D64', contrast: '#2793C9', navy: '#1E2A44', ink: '#1F2A33',
  sea: '#CFDCE6', land: '#E9ECEE',
  road: '#FFFFFF', roadLine: '#C9CED3', building: '#7E8790', buildingIn: '#55606A',
  water: '#8FBFDD', farm: '#D9E4C2', umd: '#2B3A48', sgg: '#101820',
  dim: '#0B1622', box: '#FFFFFF', text: '#1F2A33', sub: '#5A6670', line: '#333333',
};
const SAT = { saturate: 0.28, slope: 0.68, intercept: 0.40 };   // 위성영상 채도 낮추고 밝게

/* ════════════════════════════════════════════════════════════════════ */
const regionId = process.argv[2];
if (!regionId) { console.error('사용법: node build-overview-map.mjs <지역슬러그>'); process.exit(1); }
const cfgPath = path.join(HERE, 'regions', regionId + '.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const F = { ...cfg.frame };
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (ARGS.width) F.widthMeters = +ARGS.width;
if (ARGS.center) { const [x, y] = ARGS.center.split(',').map(Number); F.center = proj4(P5179, WGS, [x, y]); }   // --center=5179x,5179y
if (ARGS.width && !ARGS.keepOffset) F.offset = [0, 0];
const DEBUG_GRID = !!ARGS.grid;
const W = F.width, H = F.height, Z = F.zoom || 17;

/* ── 조사지 읽기 (5186 → lng/lat) ───────────────────────────────────── */
const surveyShp = path.join(ROOT, cfg.survey);
const survey = readPolygons(surveyShp);
const surveyLL = survey.map(s => s.rings.map(r => r.map(p => proj4(P5186, WGS, p))));

/* ── 지도 창: 조사지 중심 + widthMeters ─────────────────────────────── */
const allPts = surveyLL.flat(2);
const cLng = F.center ? F.center[0] : allPts.reduce((a, p) => a + p[0], 0) / allPts.length;
const cLat = F.center ? F.center[1] : allPts.reduce((a, p) => a + p[1], 0) / allPts.length;

/* 웹 메르카토르 "월드 픽셀" (확대 Z 기준) */
const WORLD = 256 * 2 ** Z;
const toWorld = ([lng, lat]) => {
  const x = (lng + 180) / 360 * WORLD;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  return [x, y];
};
const mPerWorldPx = 156543.03392 * Math.cos(cLat * Math.PI / 180) / 2 ** Z;
const scale = W / (F.widthMeters / mPerWorldPx);           // 화면 px / 월드 px
const [cwx, cwy] = toWorld([cLng, cLat]);
const off = F.offset || [0, 0];                              // 화면 px 단위로 중심 밀기
const originX = cwx - (W / 2 + off[0]) / scale, originY = cwy - (H / 2 + off[1]) / scale;
const toPx = (ll) => { const [x, y] = toWorld(ll); return [(x - originX) * scale, (y - originY) * scale]; };
const mPerPx = mPerWorldPx / scale;
const from5179 = (p) => toPx(proj4(P5179, WGS, p));
const anchorPx = (a) => a.lnglat ? toPx(a.lnglat) : from5179(a.epsg5179);
const pxToLL = (px, py) => {
  const wx = px / scale + originX, wy = py / scale + originY;
  const lng = wx / WORLD * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / WORLD))) * 180 / Math.PI;
  return [lng, lat];
};
const pxTo5186 = (px, py) => proj4(WGS, P5186, pxToLL(px, py));
const from5186 = (p) => toPx(proj4(P5186, WGS, p));

const MARGIN = 40;
const inFrame = (bboxPx) => bboxPx[2] >= -MARGIN && bboxPx[0] <= W + MARGIN && bboxPx[3] >= -MARGIN && bboxPx[1] <= H + MARGIN;

/* ── SHP 레이어 읽기 → 화면 px 경로 ────────────────────────────────── */
function findLayer(code) {
  const dir = path.join(ROOT, cfg.sdm);
  for (const d of fs.readdirSync(dir)) {
    const sub = path.join(dir, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    const shp = fs.readdirSync(sub).find(f => /\.shp$/i.test(f) && f.includes(code));
    if (shp) return path.join(sub, shp);
  }
  return null;
}

/* 더글러스-포이커 단순화 (px 단위) */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (L === 0) d = Math.hypot(px - ax, py - ay);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function ringPath(ring, tol = 0.35) {
  const pts = simplify(ring, tol);
  if (pts.length < 3) return '';
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}

/** 레이어를 읽어 창 안의 도형만 px 경로 문자열 배열로 */
function layerPaths(code, opts = {}) {
  const shp = findLayer(code);
  if (!shp) { console.warn(`  ⚠ ${code} 레이어 없음 — 건너뜀`); return { paths: [], rows: [], n: 0 }; }
  const shapes = readPolygons(shp);
  const rows = opts.attrs ? readDbf(shp.replace(/\.shp$/i, '.dbf'), { encoding: 'auto' }) : null;
  const paths = [], keptRows = [], rings5179 = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const b1 = from5179([s.bbox[0], s.bbox[1]]), b2 = from5179([s.bbox[2], s.bbox[3]]);
    const bb = [Math.min(b1[0], b2[0]), Math.min(b1[1], b2[1]), Math.max(b1[0], b2[0]), Math.max(b1[1], b2[1])];
    if (!inFrame(bb)) continue;
    if (opts.minPx && (bb[2] - bb[0]) < opts.minPx && (bb[3] - bb[1]) < opts.minPx) continue;
    if (opts.filter && rows && !opts.filter(rows[i])) continue;
    const d = s.rings.map(r => ringPath(r.map(from5179), opts.tol)).join('');
    if (!d) continue;
    paths.push(d); if (rows) keptRows.push(rows[i]); rings5179.push(...s.rings);
  }
  console.log(`  ${code}: ${shapes.length}개 중 창 안 ${paths.length}개`);
  return { paths, rows: keptRows, n: shapes.length, rings5179 };
}

console.log(`[${cfg.region}] 지도 창 중심 ${cLng.toFixed(5)}, ${cLat.toFixed(5)} · 폭 ${F.widthMeters}m · ${mPerPx.toFixed(2)} m/px · 타일 z${Z}`);

const roads = layerPaths('A0010000', { tol: 0.3 });
const bldg = layerPaths('B0010000', { tol: 0.25, minPx: 0.8 });
const river = layerPaths('E0010001', { tol: 0.3 });
const stream = layerPaths('E0032111', { tol: 0.3 });
const lake = layerPaths('E0052114', { tol: 0.3 });
const farm = layerPaths('D0010000', { tol: 0.4 });          // 없으면 비어 있음
const sgg = layerPaths('G0100000', { tol: 0.3 });
const umd = layerPaths('G0110000', { tol: 0.3 });

/* 읍면 폴리곤에서 "두 읍면이 함께 쓰는 변"만 행정경계로, 나머지(바다와 닿는 변)는 해안선으로 나눕니다.
   폴리곤 경계선을 통째로 점선으로 그리면 해안선까지 행정경계처럼 보이기 때문입니다. */
function splitSharedEdges(code) {
  const shp = findLayer(code); if (!shp) return { shared: [], coast: [] };
  const shapes = readPolygons(shp);
  const key = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const owner = new Map();                       // 변 → 그 변을 쓰는 폴리곤 번호들
  const segs = [];
  shapes.forEach((s, si) => {
    const b1 = from5179([s.bbox[0], s.bbox[1]]), b2 = from5179([s.bbox[2], s.bbox[3]]);
    if (!inFrame([Math.min(b1[0], b2[0]), Math.min(b1[1], b2[1]), Math.max(b1[0], b2[0]), Math.max(b1[1], b2[1])])) return;
    for (const ring of s.rings) for (let i = 0; i < ring.length - 1; i++) {
      const a = key(ring[i]), b = key(ring[i + 1]); const k = a < b ? a + '|' + b : b + '|' + a;
      if (!owner.has(k)) { owner.set(k, new Set()); segs.push([k, ring[i], ring[i + 1]]); }
      owner.get(k).add(si);
    }
  });
  const shared = [], coast = [];
  for (const [k, a, b] of segs) {
    const pa = from5179(a), pb = from5179(b);
    const d = `M${pa[0].toFixed(1)} ${pa[1].toFixed(1)}L${pb[0].toFixed(1)} ${pb[1].toFixed(1)}`;
    (owner.get(k).size >= 2 ? shared : coast).push(d);
  }
  return { shared, coast };
}
const umdEdges = splitSharedEdges('G0110000');
console.log(`  읍면 경계: 행정경계 변 ${umdEdges.shared.length} · 해안선 변 ${umdEdges.coast.length}`);

/* 조사지 (px) */
const surveyPaths = surveyLL.map(rings => rings.map(r => ringPath(r.map(toPx), 0.2)).join(''));
const surveyPathAll = surveyPaths.join('');
const surveyPts = surveyLL.flat(1).flat(1).map(toPx);
const sBox = [Math.min(...surveyPts.map(p => p[0])), Math.min(...surveyPts.map(p => p[1])), Math.max(...surveyPts.map(p => p[0])), Math.max(...surveyPts.map(p => p[1]))];

/* ── 위험도: 중점 3분야 TIF 히트맵 + 현실적 대상지 (risk.mjs) ─────────── */
const RISK = { ...RISK_DEFAULTS, ...(cfg.risk || {}) };
for (const k of Object.keys(RISK)) if (ARGS[k] !== undefined && ARGS[k] !== true) RISK[k] = Number(ARGS[k]);   // --overlapT=0.2 처럼 명령줄에서 바꿔 볼 수 있음
const LABEL2KEY = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 산업재해: 'industrial', 자살: 'suicide', 감염병: 'infection' };
let riskLayers = [], heat = null, zone = null;
if (RISK.enabled !== false) {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
  const me = (Array.isArray(idx) ? idx : idx.regions || Object.values(idx)).find(r => r.region === cfg.region);
  const focus = (cfg.risk && cfg.risk.focus) || (me ? me.focusTypes.map(l => LABEL2KEY[l] || l) : []);
  for (const key of focus) {
    const L = loadRaster(ROOT, key, cfg.region, RISK);
    if (L) { riskLayers.push(L); console.log(`  위험도 ${L.label}: 만점(p${RISK.topQuantile * 100}) ${L.top.toFixed(3)} · 유효 칸 ${L.n}`); }
    else console.warn(`  ⚠ ${key} TIF 없음 (data/raw/gis_0901/density)`);
  }
  if (riskLayers.length) {
    heat = heatPng(riskLayers, W, H, RISK.heatStepPx || 2, pxTo5186, RISK);
    /* 대상지: 조사지 둘레 + 여유 안에서 판정 */
    const s86 = survey[0].bbox, pad = RISK.searchPadM ?? 300;
    const bbox = [s86[0] - pad, s86[1] - pad, s86[2] + pad, s86[3] + pad];
    const to5186ring = (r) => r.map(p => proj4(P5179, P5186, p));
    const built = [...bldg.rings5179, ...roads.rings5179].map(to5186ring);
    zone = extractZone(riskLayers, built, bbox, RISK);
    console.log(`  대상지 추출: 중첩 칸 ${zone.stats.nOverlap} → 시가지 교집합 ${zone.stats.nBoth} → 조각 ${zone.stats.pieces} · ${zone.areaHa.toFixed(1)}ha (조사지 ${(me ? me.areaHa : '?')}ha)`);
  }
}
/* 화면에서 "대상지" 로 쓰는 경계: 추출 결과가 있으면 그것, 없으면 공식 조사지 */
const zonePaths = zone && zone.rings.length ? zone.rings.map(r => ringPath(r.map(from5186), 0.2)) : null;
const zonePathAll = zonePaths ? zonePaths.join('') : surveyPathAll;

/* ── 위성 타일 (브이월드) ───────────────────────────────────────────── */
const TILE_DIR = path.join(ROOT, 'data/raw/tiles/vworld-satellite', String(Z));
fs.mkdirSync(TILE_DIR, { recursive: true });
async function fetchTile(x, y) {
  const f = path.join(TILE_DIR, `${x}_${y}.jpeg`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const url = `https://xdworld.vworld.kr/2d/Satellite/service/${Z}/${x}/${y}.jpeg`;
  const r = await fetch(url);
  if (!r.ok) { console.warn('  타일 실패', x, y, r.status); return null; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
}
async function tilesSvg() {
  const x0 = Math.floor(originX / 256), y0 = Math.floor(originY / 256);
  const x1 = Math.floor((originX + W / scale) / 256), y1 = Math.floor((originY + H / scale) / 256);
  const out = [];
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const buf = await fetchTile(tx, ty); if (!buf) continue; n++;
    const px = (tx * 256 - originX) * scale, py = (ty * 256 - originY) * scale, sz = 256 * scale;
    out.push(`<image x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${(sz + 0.5).toFixed(2)}" height="${(sz + 0.5).toFixed(2)}" preserveAspectRatio="none" href="data:image/jpeg;base64,${buf.toString('base64')}"/>`);
  }
  console.log(`  위성 타일 ${n}장 (z${Z})`);
  return out.join('\n');
}

/* ── 글 줄바꿈 (대략적 폭 계산: 한글 0.95em · 영숫자 0.55em) ─────────── */
const charW = (ch, fs) => (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 0.95 : /[ .,·()\-]/.test(ch) ? 0.32 : 0.56) * fs;
const textW = (s, fs) => [...s].reduce((a, ch) => a + charW(ch, fs), 0);
function wrap(s, fs, maxW) {
  const words = s.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textW(t, fs) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  /* 한 단어가 너무 길면 글자 단위로 자름 */
  return lines.flatMap(l => {
    if (textW(l, fs) <= maxW) return [l];
    const out = []; let c = '';
    for (const ch of l) { if (textW(c + ch, fs) > maxW) { out.push(c); c = ch; } else c += ch; }
    if (c) out.push(c); return out;
  });
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── 사업지 설명 상자 ─────────────────────────────────────────────── */
const FONT = "Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif";
function zoneBox(z, i) {
  const { x, y, w } = z.box;
  const pad = 18, fsT = 21, fsP = 14, fsI = 15, lh = 22, gap = 8;
  const items = z.items.map(t => wrap(t, fsI, w - pad * 2 - 20));
  const bodyH = items.reduce((a, l) => a + l.length * lh + gap, 0) - gap;
  const headH = pad + fsT + 6 + fsP + 12;                  // 제목 + 장소 + 구분선까지
  const h = headH + 12 + bodyH + pad;
  const num = String(i + 1).padStart(2, '0');
  const out = [];
  /* 아이콘 줄 — 상자 위에 띄움 (회사 예시 방식) */
  out.push(`<g class="zone" id="${z.id}">`);
  out.push((z.icons || []).map((k, j) => `<use href="#ic-${k}" x="${x + j * 42}" y="${y - 46}" width="36" height="36"/>`).join(''));
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h.toFixed(0)}" rx="6" fill="${C.box}" fill-opacity="0.96" stroke="${C.line}" stroke-width="1"/>`);
  out.push(`<path d="M${x + 6} ${y}H${x}V${y + h}H${x + 6}Z" fill="${C.main}"/>`);
  let cy = y + pad + fsT - 5;
  out.push(`<text x="${x + pad}" y="${cy}" font-family="${FONT}" font-size="${fsT}" font-weight="700" fill="${C.text}"><tspan fill="${C.main}" font-size="${fsT - 3}">${num}</tspan><tspan dx="8">${esc(z.type)}</tspan></text>`);
  cy += fsP + 6;
  out.push(`<text x="${x + pad}" y="${cy}" font-family="${FONT}" font-size="${fsP}" fill="${C.sub}">${esc(z.place)}</text>`);
  cy += 12;
  out.push(`<line x1="${x + pad}" y1="${cy}" x2="${x + w - pad}" y2="${cy}" stroke="#CCCCCC" stroke-width="1"/>`);
  cy += 12;
  for (const ls of items) {
    ls.forEach((l, k) => {
      const ty = cy + fsI - 2 + k * lh;
      if (k === 0) out.push(`<text x="${x + pad}" y="${ty}" font-family="${FONT}" font-size="${fsI}" fill="${C.text}"><tspan fill="${C.main}" font-size="9">■</tspan><tspan dx="8">${esc(l)}</tspan></text>`);
      else out.push(`<text x="${x + pad + 20}" y="${ty}" font-family="${FONT}" font-size="${fsI}" fill="${C.text}">${esc(l)}</text>`);
    });
    cy += ls.length * lh + gap;
  }
  out.push('</g>');
  return { svg: out.join('\n'), h, rect: { x, y, w, h } };
}

/* 지시선: 상자 가까운 변 가운데 → 꺾임 → 지점 */
function leader(rect, anchor) {
  const [ax, ay] = anchor;
  const right = ax > rect.x + rect.w;        // 지점이 상자 오른쪽에 있으면 오른쪽 변에서 출발
  const sx = right ? rect.x + rect.w : rect.x;
  const sy = Math.max(rect.y + 20, Math.min(rect.y + rect.h - 20, ay));
  const midX = right ? sx + (ax - sx) * 0.45 : sx - (sx - ax) * 0.45;
  const d = `M${sx} ${sy}H${midX.toFixed(1)}V${ay.toFixed(1)}H${ax.toFixed(1)}`;
  return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-opacity="0.75" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="1.4" stroke-linejoin="round"/>
<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="7" fill="#FFFFFF" stroke="${C.ink}" stroke-width="1.4"/>
<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.2" fill="${C.main}"/>`;
}

function anchorDot([ax, ay], id) {
  return `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="7" fill="#FFFFFF" stroke="${C.ink}" stroke-width="1.4"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.2" fill="${C.main}"/><text x="${(ax + 10).toFixed(1)}" y="${(ay - 8).toFixed(1)}" font-size="13" font-weight="700" fill="${C.main}" stroke="#fff" stroke-width="3" paint-order="stroke">${id}</text>`;
}
/* 동선 화살표 — 부드러운 곡선(카드멀-롬) */
function smoothPath(pts) {
  if (pts.length < 3) return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L');
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
const ROUTE_STYLE = {
  patrol: { color: C.main, w: 4, dash: '2 9' },
  link: { color: C.navy, w: 5, dash: '12 8' },
};
function routeSvg(r) {
  const st = ROUTE_STYLE[r.style] || ROUTE_STYLE.link;
  const pts = r.points.map(p => r.lnglat ? toPx(p) : from5179(p));
  const d = smoothPath(pts);
  return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.8" stroke-width="${st.w + 4}" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${st.w}" stroke-dasharray="${st.dash}" stroke-linecap="round" marker-end="url(#arrow-${r.style})"/>`;
}

/* ── 범례·축척·제목 ──────────────────────────────────────────────── */
function legendSvg(x, y) {
  const rows = cfg.legend || [];
  const w = 250, rowH = 24, h = rows.length * rowH + 22;
  const out = [`<g id="legend"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" fill-opacity="0.94" stroke="${C.line}" stroke-width="1"/>`];
  rows.forEach((r, i) => {
    const cy = y + 16 + i * rowH, lx = x + 14;
    let sw = '';
    switch (r.kind) {
      case 'survey': sw = `<rect x="${lx}" y="${cy - 7}" width="34" height="14" fill="#fff" fill-opacity=".4" stroke="${C.main}" stroke-width="2.5"/>`; break;
      case 'umd': sw = `<line x1="${lx}" y1="${cy}" x2="${lx + 34}" y2="${cy}" stroke="${C.umd}" stroke-width="1.8" stroke-dasharray="7 4"/>`; break;
      case 'sgg': sw = `<line x1="${lx}" y1="${cy}" x2="${lx + 34}" y2="${cy}" stroke="${C.sgg}" stroke-width="2.6"/>`; break;
      case 'patrol': sw = `<line x1="${lx}" y1="${cy}" x2="${lx + 34}" y2="${cy}" stroke="${C.main}" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"/>`; break;
      case 'link': sw = `<line x1="${lx}" y1="${cy}" x2="${lx + 34}" y2="${cy}" stroke="${C.navy}" stroke-width="5" stroke-dasharray="10 7" stroke-linecap="round"/>`; break;
      case 'building': sw = `<rect x="${lx + 4}" y="${cy - 6}" width="12" height="12" fill="${C.building}"/><rect x="${lx + 19}" y="${cy - 4}" width="10" height="10" fill="${C.building}"/>`; break;
      case 'road': sw = `<rect x="${lx}" y="${cy - 4}" width="34" height="8" fill="${C.road}" stroke="${C.roadLine}"/>`; break;
      case 'water': sw = `<rect x="${lx}" y="${cy - 6}" width="34" height="12" fill="${C.water}"/>`; break;
      case 'farm': sw = `<rect x="${lx}" y="${cy - 6}" width="34" height="12" fill="${C.farm}"/>`; break;
      case 'survey-ref': sw = `<line x1="${lx}" y1="${cy}" x2="${lx + 34}" y2="${cy}" stroke="${C.ink}" stroke-width="1.4" stroke-dasharray="5 4"/>`; break;
      case 'heat': { const c = AURI_COLORS[r.key] ? AURI_COLORS[r.key].rgb : [128, 128, 128]; const col = `rgb(${c.join(',')})`; sw = `<defs><linearGradient id="lg-${r.key}"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="${col}" stop-opacity=".85"/></linearGradient></defs><rect x="${lx}" y="${cy - 6}" width="34" height="12" fill="url(#lg-${r.key})"/>`; break; }
    }
    out.push(sw, `<text x="${lx + 46}" y="${cy + 5}" font-family="${FONT}" font-size="14" fill="${C.text}">${esc(r.label)}</text>`);
  });
  out.push('</g>');
  return { svg: out.join('\n'), w, h };
}
function scaleBar(x, y) {
  const m = F.widthMeters >= 8000 ? 1000 : 500, px = m / mPerPx;
  return `<g id="scale"><rect x="${x}" y="${y}" width="${px.toFixed(1)}" height="6" fill="${C.ink}"/><rect x="${x}" y="${y}" width="${(px / 2).toFixed(1)}" height="6" fill="#fff" stroke="${C.ink}" stroke-width="1"/>
<text x="${x}" y="${y - 5}" font-family="${FONT}" font-size="12" fill="${C.ink}">0</text><text x="${(x + px).toFixed(1)}" y="${y - 5}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${C.ink}">${m}m</text></g>`;
}
function northArrow(x, y) {
  return `<g id="north" transform="translate(${x} ${y})"><path d="M0 -22L9 10 0 4 -9 10Z" fill="${C.ink}"/><path d="M0 -22L-9 10 0 4Z" fill="#fff" stroke="${C.ink}" stroke-width="1"/><text x="0" y="26" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="${C.ink}">N</text></g>`;
}

/* ════════════════════════════════════════════════════════════════════
   조립
   ════════════════════════════════════════════════════════════════════ */
const tiles = await tilesSvg();
const frameRect = `M0 0H${W}V${H}H0Z`;
const landAll = umd.paths.join('') || sgg.paths.join('');
const P = (arr) => arr.map(d => `<path d="${d}"/>`).join('');

const zoneBoxes = cfg.zones.map((z, i) => ({ z, ...zoneBox(z, i) }));
const legendH = (cfg.legend || []).length * 24 + 22;
const LP = cfg.legendPos || { x: W - 290, y: H - 60 - legendH };
const legend = legendSvg(LP.x, LP.y);

/* 디버그 격자 — 100m 마다 EPSG:5179 좌표를 적어 사업지 좌표를 고를 때 씁니다 */
let gridSvg = '';
if (DEBUG_GRID) {
  const c0 = proj4(WGS, P5179, [cLng, cLat]);
  const step = 100, n = Math.ceil(F.widthMeters / step / 2) + 2;
  const g = [];
  for (let i = -n; i <= n; i++) {
    const gx = Math.round(c0[0] / step + i) * step, gy = Math.round(c0[1] / step + i) * step;
    const a = from5179([gx, c0[1] - 5000]), b = from5179([gx, c0[1] + 5000]);
    g.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#00E5FF" stroke-width="${gx % 500 ? 0.5 : 1.2}"/>`);
    const c = from5179([c0[0] - 5000, gy]), d = from5179([c0[0] + 5000, gy]);
    g.push(`<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${d[0].toFixed(1)}" y2="${d[1].toFixed(1)}" stroke="#00E5FF" stroke-width="${gy % 500 ? 0.5 : 1.2}"/>`);
    if (gx % 500 === 0) { const t = from5179([gx, c0[1]]); g.push(`<text x="${t[0].toFixed(0)}" y="14" font-size="11" fill="#00E5FF" text-anchor="middle">${gx}</text>`); }
    if (gy % 500 === 0) { const t = from5179([c0[0], gy]); g.push(`<text x="4" y="${t[1].toFixed(0)}" font-size="11" fill="#00E5FF">${gy}</text>`); }
  }
  gridSvg = '<g id="debug-grid">' + g.join('') + '</g>';
}

const labelsSvg = (cfg.labels || []).map(l => {
  const [x, y] = anchorPx(l);
  const big = (l.size || 16) >= 20;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${l.size || 16}" font-weight="${big ? 700 : 500}" fill="${C.ink}" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round" letter-spacing="${big ? 6 : 1}">${esc(l.text)}</text>`;
}).join('\n');

const titleW = Math.max(560, textW(cfg.title, 30) + 60).toFixed(0);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${esc(cfg.title)}</title>
<defs>
  <clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>
  <clipPath id="survey-clip"><path d="${zonePathAll}"/></clipPath>
  <filter id="sat" color-interpolation-filters="sRGB">
    <feColorMatrix type="saturate" values="${SAT.saturate}"/>
    <feComponentTransfer><feFuncR type="linear" slope="${SAT.slope}" intercept="${SAT.intercept}"/><feFuncG type="linear" slope="${SAT.slope}" intercept="${SAT.intercept}"/><feFuncB type="linear" slope="${SAT.slope}" intercept="${SAT.intercept}"/></feComponentTransfer>
  </filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
  <marker id="arrow-patrol" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5 0 10z" fill="${C.main}"/></marker>
  <marker id="arrow-link" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5 0 10z" fill="${C.navy}"/></marker>
  ${iconDefs(C.ink)}
</defs>

<!-- ① 바탕: 바다색 → 위성영상(채도↓ 밝기↑) → 육지 밖(바다) 덮기 -->
<rect width="${W}" height="${H}" fill="${C.sea}"/>
<g id="satellite" clip-path="url(#frame)" filter="url(#sat)">
${tiles}
</g>
<path id="sea" d="${frameRect}${landAll}" fill-rule="evenodd" fill="${C.sea}" fill-opacity="0.9"/>
<path id="land-tint" d="${landAll}" fill="#FFFFFF" fill-opacity="0.18"/>

<!-- ② 지형 레이어 -->
<g id="farm" fill="${C.farm}" fill-opacity="0.55" stroke="none">${P(farm.paths)}</g>
<g id="water" fill="${C.water}" fill-opacity="0.85" stroke="${C.contrast}" stroke-width="0.6" stroke-opacity="0.5">${P([...river.paths, ...stream.paths, ...lake.paths])}</g>
<g id="roads" fill="${C.road}" fill-opacity="0.82" stroke="${C.roadLine}" stroke-width="0.5">${P(roads.paths)}</g>
<g id="buildings" fill="${C.building}" fill-opacity="0.78" stroke="none">${P(bldg.paths)}</g>
<g id="buildings-in" clip-path="url(#survey-clip)" fill="${C.buildingIn}" fill-opacity="0.9">${P(bldg.paths)}</g>

<!-- ②-1 위험도 히트맵 (중점 3분야 · AURI 7색) -->
${heat ? `<image id="heat" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" href="${heat.dataUrl}"/>` : ''}

<!-- ③ 경계 -->
<path id="coast" d="${umdEdges.coast.join('')}" fill="none" stroke="${C.umd}" stroke-width="0.9" stroke-opacity="0.7"/>
<path id="umd" d="${umdEdges.shared.join('')}" fill="none" stroke="${C.umd}" stroke-width="2.2" stroke-dasharray="9 5" stroke-opacity="0.95"/>
<g id="sgg" fill="none" stroke="${C.sgg}" stroke-width="2.6">${P(sgg.paths)}</g>

<!-- ④ 사업지 안 밝게 · 밖 어둡게 -->
<path id="dim" d="${frameRect}${zonePathAll}" fill-rule="evenodd" fill="${C.dim}" fill-opacity="0.24"/>
${zonePaths ? `<path id="survey-ref" d="${surveyPathAll}" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-dasharray="5 4" stroke-opacity="0.85"/>` : ''}
<path id="zone-glow" d="${zonePathAll}" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-opacity="0.55" filter="url(#soft)"/>
<path id="zone" d="${zonePathAll}" fill="#FFFFFF" fill-opacity="0.14" stroke="${C.main}" stroke-width="2.6" stroke-linejoin="round"/>

<!-- ⑤ 동선 -->
<g id="routes">${(cfg.routes || []).map(routeSvg).join('\n')}</g>

<!-- ⑥ 지명 -->
<g id="labels">${labelsSvg}</g>

<!-- ⑦ 지시선 · 사업지 상자 -->
<g id="leaders">${zoneBoxes.map(b => DEBUG_GRID ? anchorDot(anchorPx(b.z.anchor), b.z.id) : leader(b.rect, anchorPx(b.z.anchor))).join('\n')}</g>
<g id="zones">${DEBUG_GRID ? '' : zoneBoxes.map(b => b.svg).join('\n')}</g>

${gridSvg}
<!-- ⑧ 제목 · 범례 · 축척 -->
<g id="title" display="${DEBUG_GRID ? 'none' : 'inline'}"><rect x="40" y="36" width="${titleW}" height="92" rx="6" fill="#fff" fill-opacity="0.94" stroke="${C.line}" stroke-width="1"/>
<path d="M48 36H40V128H48Z" fill="${C.ink}"/>
<text x="66" y="76" font-family="${FONT}" font-size="30" font-weight="700" fill="${C.text}">${esc(cfg.title)}</text>
<text x="66" y="106" font-family="${FONT}" font-size="15" fill="${C.sub}">${esc(cfg.subtitle)}</text></g>
${DEBUG_GRID ? '' : legend.svg}
${scaleBar(W - 290, H - 32)}
${northArrow(W - 50, 62)}
<text x="40" y="${H - 18}" font-family="${FONT}" font-size="11.5" fill="#fff" fill-opacity="0.9">${esc(cfg.source)}</text>
</svg>`;

const outDir = path.join(ROOT, 'output/overview-map', cfg.region);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${cfg.region}_종합도${DEBUG_GRID ? '_debug' : ''}.svg`);
fs.writeFileSync(outFile, svg);
console.log(`→ ${path.relative(ROOT, outFile)}  (${(svg.length / 1e6).toFixed(2)} MB)`);
if (zone && zone.rings.length && !DEBUG_GRID) {
  const gj = { type: 'FeatureCollection', features: zone.rings.map((r, i) => ({ type: 'Feature', properties: { region: cfg.region, part: i + 1, areaHa: +zone.areaHa.toFixed(2), rule: RISK }, geometry: { type: 'Polygon', coordinates: [[...r, r[0]].map(p => proj4(P5186, WGS, p).map(v => +v.toFixed(6)))] } })) };
  fs.writeFileSync(path.join(outDir, `${cfg.region}_대상지.geojson`), JSON.stringify(gj));
  console.log(`  대상지 경계 → output/overview-map/${cfg.region}/${cfg.region}_대상지.geojson`);
}
console.log(`  조사지 화면 범위 x ${sBox[0].toFixed(0)}–${sBox[2].toFixed(0)} · y ${sBox[1].toFixed(0)}–${sBox[3].toFixed(0)}`);
