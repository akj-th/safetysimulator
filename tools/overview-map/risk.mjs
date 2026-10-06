/* ════════════════════════════════════════════════════════════════════
   종합도용 위험도 — 중점 3분야 TIF 히트맵 + "현실적 대상지" 경계 추출

   AURI 답변(2026-10-06)을 그대로 따릅니다.
     · 히트맵: 분야별 TIF 를 **각자의 색**으로 칠하고 값이 낮으면 투명, 높으면
       진하게 해서 겹친 **시각화**다. 가중치·합산 점수는 없다.
     · 대상지 확대 범위: 산식 없이 중점 3분야가 함께 나타나는 구간을 눈으로 잡았다.

   AURI 는 눈으로 조정했으니, 우리는 같은 그림을 **규칙으로** 다시 만듭니다
   (41곳을 같은 기준으로 돌리기 위해). 규칙은 모두 regions/<지역>.json 의
   `risk` 항목에서 숫자로 바꿀 수 있습니다.

   ── 히트맵 규칙 ──────────────────────────────────────────────────
     t = 값 / (그 지자체·그 분야의 TOP_QUANTILE 분위수)   (1 에서 자름)
     색  = 흰색 → 분야 색  (t^COLOR_GAMMA)
     투명도 = min(1, t / ALPHA_FULL_AT) × MAX_ALPHA
     → build-heatmap.mjs(2026-09) 와 같은 규칙. 색만 AURI 7색으로 바꿈.

   ── 대상지 경계 규칙 ──────────────────────────────────────────────
     ① 중점 3분야 모두 t ≥ overlapT 인 칸               (3분야 중첩 구간)
     ② 건물·도로에서 builtBufferM 안에 있는 칸          (시가지 — 산지 제외)
     ③ ①∧② 를 closeM 만큼 닫기(틈 메우기) → minAreaHa 미만 조각 버림 → 구멍 메움
     ④ 바깥 테두리를 따라 다각형으로 → 단순화
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { readHeader, eachTile, isNoData, geoRef } from '../lib/geotiff.mjs';
import { encodePng } from '../lib/png.mjs';

/* AURI 7색 (정호경 연구원 답변 2026-10-06) */
export const AURI_COLORS = {
  industrial: { label: '산업재해', rgb: [0xE5, 0x32, 0x2D] },   // 빨강
  infection:  { label: '감염병',   rgb: [0xF2, 0x8C, 0x28] },   // 주황
  traffic:    { label: '교통사고', rgb: [0xF2, 0xD0, 0x2E] },   // 노랑
  crime:      { label: '범죄',     rgb: [0x3C, 0xA8, 0x4A] },   // 초록
  suicide:    { label: '자살',     rgb: [0x2F, 0x7F, 0xE0] },   // 파랑
  fire:       { label: '화재',     rgb: [0x1F, 0x2E, 0x7A] },   // 남색
  life:       { label: '생활안전', rgb: [0x8E, 0x44, 0xAD] },   // 보라
};
const FOLDER = { traffic: '교통사고_최종', fire: '화재', crime: '범죄', life: '생활안전', industrial: '산업재해', suicide: '자살', infection: '감염병' };

export const DEFAULTS = {
  topQuantile: 0.99,     // 분야 안 만점 기준 (build-heatmap.mjs 와 같음)
  alphaFullAt: 0.60,     // 이 t 이상이면 투명도 최대
  maxAlpha: 0.50,        // 최대 불투명도 — 세 분야가 겹쳐도 아래가 비치도록 낮게
  colorGamma: 0.75,
  overlapT: 0.30,        // ① 세 분야 모두 이 t 이상 → 중첩 구간
  builtBufferM: 40,      // ② 건물·도로에서 이 거리 안만 시가지로 봄
  closeM: 30,            // ③ 틈 메우기 반경
  minAreaHa: 1.0,        // ③ 이보다 작은 조각은 버림
  cellM: 10,             // 대상지 판정 격자 (TIF 와 같은 10m)
  simplifyM: 12,         // ④ 경계 단순화 허용 오차
};

function findTif(root, folder, slug) {
  const dir = path.join(root, 'data/raw/gis_0901/density', folder);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.tif') && f.slice(0, f.lastIndexOf('.')).toLowerCase().startsWith(slug.toLowerCase() + '_'));
  return hit ? path.join(dir, hit) : null;
}

/** TIF 를 통째로 읽어 (x5186, y5186) → 정규화값 t 를 돌려주는 표본기를 만듭니다 */
export function loadRaster(root, key, slug, opt) {
  const file = findTif(root, FOLDER[key], slug);
  if (!file) return null;
  const t = readHeader(file);
  const g = geoRef(t);
  const data = new Float32Array(t.width * t.height).fill(NaN);
  const tw = t.tileWidth, th = t.tileHeight;
  eachTile(file, t, (tx, ty, values) => {
    const bx = tx * tw, by = ty * th;
    for (let y = 0; y < th; y++) { const py = by + y; if (py >= t.height) break;
      for (let x = 0; x < tw; x++) { const px = bx + x; if (px >= t.width) continue;
        const v = values[y * tw + x]; if (isNoData(v) || v <= 0) continue; data[py * t.width + px] = v; } }
  });
  /* 분위수 */
  const vals = []; for (let i = 0; i < data.length; i++) if (Number.isFinite(data[i])) vals.push(data[i]);
  vals.sort((a, b) => a - b);
  const top = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * opt.topQuantile))] : 1;
  const sample = (x, y) => {
    const c = Math.floor((x - g.originX) / g.scaleX), r = Math.floor((g.originY - y) / g.scaleY);
    if (c < 0 || r < 0 || c >= t.width || r >= t.height) return 0;
    const v = data[r * t.width + c];
    return Number.isFinite(v) ? Math.min(1, v / top) : 0;
  };
  return { key, label: AURI_COLORS[key].label, rgb: AURI_COLORS[key].rgb, top, n: vals.length, sample, file };
}

/**
 * 히트맵 PNG — 화면 px 격자(step 간격)마다 5186 좌표로 되돌려 표본을 뽑아
 * 분야별로 "흰→분야색 + 투명도" 를 만들고 차례로 겹칩니다(over 합성).
 * 결과는 base64 data URL 과 화면 크기.
 */
export function heatPng(layers, W, H, step, pxTo5186, opt) {
  const w = Math.ceil(W / step), h = Math.ceil(H / step);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [x, y] = pxTo5186((i + 0.5) * step, (j + 0.5) * step);
    let R = 0, G = 0, B = 0, A = 0;                       // 투명한 바탕에서 시작
    for (const L of layers) {
      const t = L.sample(x, y); if (t <= 0) continue;
      const c = Math.pow(t, opt.colorGamma);
      const a = Math.min(1, t / opt.alphaFullAt) * opt.maxAlpha;
      const r = 255 + (L.rgb[0] - 255) * c, g = 255 + (L.rgb[1] - 255) * c, b = 255 + (L.rgb[2] - 255) * c;
      const na = a + A * (1 - a);
      if (na > 0) { R = (r * a + R * A * (1 - a)) / na; G = (g * a + G * A * (1 - a)) / na; B = (b * a + B * A * (1 - a)) / na; }
      A = na;
    }
    const o = (j * w + i) * 4; rgba[o] = R; rgba[o + 1] = G; rgba[o + 2] = B; rgba[o + 3] = A * 255;
  }
  const png = encodePng(rgba, w, h);
  return { dataUrl: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), w, h };
}

/* ── 대상지 경계 추출 ─────────────────────────────────────────────── */

/** 다각형 링들을 격자에 채웁니다 (짝홀 스캔라인). rings: [[x,y]…] 격자 좌표 */
function rasterize(rings, gw, gh, mask) {
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let minY = Infinity, maxY = -Infinity;
    for (const p of ring) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(gh - 1, Math.ceil(maxY));
    for (let gy = y0; gy <= y1; gy++) {
      const sy = gy + 0.5, xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > sy) !== (yj > sy)) xs.push(xi + (sy - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.round(xs[k])), b = Math.min(gw - 1, Math.round(xs[k + 1]) - 1);
        for (let gx = a; gx <= b; gx++) mask[gy * gw + gx] = 1;
      }
    }
  }
}

function dilate(mask, gw, gh, r) {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(gw * gh);
  const r2 = r * r;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!mask[y * gw + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      out[ny * gw + nx] = 1;
    }
  }
  return out;
}
function erode(mask, gw, gh, r) {
  const inv = new Uint8Array(gw * gh); for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  /* 가장자리도 바깥으로 봅니다 */
  const d = dilate(inv, gw, gh, r);
  const out = new Uint8Array(gw * gh); for (let i = 0; i < out.length; i++) out[i] = d[i] ? 0 : 1;
  for (let x = 0; x < gw; x++) for (let k = 0; k < r; k++) { out[k * gw + x] = 0; out[(gh - 1 - k) * gw + x] = 0; }
  for (let y = 0; y < gh; y++) for (let k = 0; k < r; k++) { out[y * gw + k] = 0; out[y * gw + gw - 1 - k] = 0; }
  return out;
}

/** 연결 요소 라벨링 (4방향). 돌려주는 값: labels, sizes */
function components(mask, gw, gh) {
  const lab = new Int32Array(gw * gh); const sizes = [0]; let n = 0;
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || lab[i]) continue;
    n++; lab[i] = n; stack.push(i); let s = 0;
    while (stack.length) {
      const c = stack.pop(); s++;
      const x = c % gw, y = (c / gw) | 0;
      const nb = [x > 0 ? c - 1 : -1, x < gw - 1 ? c + 1 : -1, y > 0 ? c - gw : -1, y < gh - 1 ? c + gw : -1];
      for (const k of nb) if (k >= 0 && mask[k] && !lab[k]) { lab[k] = n; stack.push(k); }
    }
    sizes.push(s);
  }
  return { lab, sizes, n };
}

/** 안쪽 구멍 메우기 — 바깥(가장자리)과 이어진 빈칸만 빈칸으로 남깁니다 */
function fillHoles(mask, gw, gh) {
  const inv = new Uint8Array(gw * gh); for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const { lab } = components(inv, gw, gh);
  const outside = new Set();
  for (let x = 0; x < gw; x++) { if (inv[x]) outside.add(lab[x]); if (inv[(gh - 1) * gw + x]) outside.add(lab[(gh - 1) * gw + x]); }
  for (let y = 0; y < gh; y++) { if (inv[y * gw]) outside.add(lab[y * gw]); if (inv[y * gw + gw - 1]) outside.add(lab[y * gw + gw - 1]); }
  const out = mask.slice();
  for (let i = 0; i < inv.length; i++) if (inv[i] && !outside.has(lab[i])) out[i] = 1;
  return out;
}

/** 이진 격자의 테두리를 따라 링(격자 좌표, 꼭짓점 단위)을 만듭니다 */
function traceRings(mask, gw, gh) {
  const edges = new Map();          // "x,y" 시작점 → [끝점...]  (안쪽 칸을 왼쪽에 두는 방향)
  const add = (a, b) => { const k = a.join(','); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
  const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh) ? 0 : mask[y * gw + x];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!mask[y * gw + x]) continue;
    if (!at(x, y - 1)) add([x, y], [x + 1, y]);           // 위쪽 변 →
    if (!at(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);   // 오른쪽 변 ↓
    if (!at(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);   // 아래 변 ←
    if (!at(x - 1, y)) add([x, y + 1], [x, y]);           // 왼쪽 변 ↑
  }
  const rings = [];
  while (edges.size) {
    const [k0, list] = edges.entries().next().value;
    const start = k0.split(',').map(Number);
    const ring = [start]; let cur = start;
    for (;;) {
      const key = cur.join(','); const nxt = edges.get(key); if (!nxt || !nxt.length) break;
      const p = nxt.shift(); if (!nxt.length) edges.delete(key);
      if (p[0] === start[0] && p[1] === start[1]) break;
      ring.push(p); cur = p;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; let d;
      if (!L) d = Math.hypot(px - ax, py - ay); else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); d = Math.hypot(px - ax - t * dx, py - ay - t * dy); }
      if (d > md) { md = d; idx = i; }
    }
    if (md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * 대상지 경계 추출.
 *   layers      중점 분야 표본기들 (loadRaster 결과)
 *   builtRings  건물·도로 링들 — 격자 좌표계로 넘기는 함수 to5186 가 있으므로 5179 원좌표 그대로
 *   bbox5186    [minX, minY, maxX, maxY] 판정 범위 (조사지 둘레 + 여유)
 *   opt         DEFAULTS 와 같은 키
 * 돌려주는 값: { rings: [[[x5186,y5186]…]…], areaHa, stats }
 */
export function extractZone(layers, builtRings5186, bbox5186, opt) {
  const cell = opt.cellM;
  const gw = Math.ceil((bbox5186[2] - bbox5186[0]) / cell), gh = Math.ceil((bbox5186[3] - bbox5186[1]) / cell);
  const toG = ([x, y]) => [(x - bbox5186[0]) / cell, (bbox5186[3] - y) / cell];
  const fromG = ([gx, gy]) => [bbox5186[0] + gx * cell, bbox5186[3] - gy * cell];

  /* ① 중첩 */
  const overlap = new Uint8Array(gw * gh); let nOverlap = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const [x, y] = fromG([gx + 0.5, gy + 0.5]);
    let ok = true; for (const L of layers) if (L.sample(x, y) < opt.overlapT) { ok = false; break; }
    if (ok) { overlap[gy * gw + gx] = 1; nOverlap++; }
  }
  /* ② 시가지 */
  const built = new Uint8Array(gw * gh);
  rasterize(builtRings5186.map(r => r.map(toG)), gw, gh, built);
  const builtD = dilate(built, gw, gh, Math.round(opt.builtBufferM / cell));
  /* ③ 교집합 → 닫기 → 작은 조각 제거 → 구멍 메움 */
  let m = new Uint8Array(gw * gh); let nBoth = 0;
  for (let i = 0; i < m.length; i++) if (overlap[i] && builtD[i]) { m[i] = 1; nBoth++; }
  const cr = Math.round(opt.closeM / cell);
  if (cr > 0) m = erode(dilate(m, gw, gh, cr), gw, gh, cr);
  const { lab, sizes } = components(m, gw, gh);
  const minCells = opt.minAreaHa * 1e4 / (cell * cell);
  for (let i = 0; i < m.length; i++) if (m[i] && sizes[lab[i]] < minCells) m[i] = 0;
  m = fillHoles(m, gw, gh);
  /* ④ 테두리 */
  let area = 0; for (let i = 0; i < m.length; i++) area += m[i];
  const rings = traceRings(m, gw, gh).map(r => simplifyRing(r, opt.simplifyM / cell)).map(r => r.map(fromG));
  return { rings, areaHa: area * cell * cell / 1e4, stats: { gw, gh, nOverlap, nBoth, pieces: rings.length } };
}
