/* ════════════════════════════════════════════════════════════════════
   AURI 위치도 PPT 의 도형 → 사업구역·후보지 경계(좌표)  (2026-11-25, 이예린 11/24 회신)

   AURI 는 세부 사업구역(구역 ①②)·후보지(②③)를 GIS 가 아니라 PPT 위치도 위에 "자유형 도형"으로 그렸고
   SHP 는 따로 없다고 했습니다("PPT 위치도의 도형을 추출해 활용해 주시면 됩니다").
   위치도의 바탕 그림은 GIS 에서 뽑은 지도라 그 안에 ① 최종 복합위험지구(빨간 선)와 읍면동 경계(검은 선)가 그려져 있습니다.
   → 이미 정확한 좌표가 있는 두 선(AURI 지구 SHP · 행정동 경계)을 그림 속 선에 겹쳐 그림의 축척·회전·위치를 찾고,
     그 변환으로 도형 꼭짓점을 실제 좌표(EPSG:5186)로 옮깁니다.

   입력   PPT(docs/02_수신자료, 커밋 안 됨) — 슬라이드는 지자체 이름으로 찾음(못 찾으면 설정의 slide)
          지구 SHP = tools/config/zones.json 의 district · 행정동 경계 = data/raw/admin_boundary_hjd
   출력   data/raw/사업구역_ppt/<slug>.geojson  (구역 kind:'zone' · 후보지 kind:'candidate', 좌표 EPSG:5186) — build-zone-stats 가 읽음
          output/ppt-zones/<slug>_<kind>.png   (확인용 — 초록 = AURI 지구 SHP · 하늘색 = 행정동 경계 · 자홍 = 뽑은 도형, 그림 위에 겹침)
   정확도  손으로 그린 도형이라 선 자체가 수 m~수십 m 흔들립니다. 겹치기 오차(픽셀·m)는 실행할 때 찍습니다.
   실행   node tools/build-ppt-zones.mjs                 ← config/ppt-zones.json 전부
          node tools/build-ppt-zones.mjs --only=goheung,mokpo
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib/hwpx.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { readPolygons } from './lib/shapefile.mjs';
import { REGIONS } from './lib/regions.mjs';
import { hjdGroups, pickGroups } from './lib/hjd.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/config/ppt-zones.json'), 'utf8'));
const ZONES_CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/config/zones.json'), 'utf8')).regions;
const OUT_DIR = path.join(ROOT, 'data/raw/사업구역_ppt');
const CHECK_DIR = path.join(ROOT, 'output/ppt-zones');
const HJD_DIR = path.join(ROOT, 'data/raw/admin_boundary_hjd');
const CIRCLED = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '❶': 1, '❷': 2, '❸': 3, '❹': 4, '❺': 5 };

/* ── PPT 슬라이드 읽기 ───────────────────────────────────────────── */
const attr = (s, name) => { const m = s.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function paraTexts(xml) { return xml.split(/<\/a:p>/).map((p) => unesc([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).trim()).filter(Boolean); }
function xfrmOf(s) {
  const x = s.match(/<a:xfrm([^>]*)>\s*<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  if (!x) return null;
  return { x: +x[2], y: +x[3], cx: +x[4], cy: +x[5], flipH: /flipH="1"/.test(x[1]), flipV: /flipV="1"/.test(x[1]), rot: +(attr(x[1], 'rot') || 0) / 60000 };
}
/* 자유형 도형 경로 → 슬라이드 좌표(EMU) 점 목록 — 3차 곡선은 4점으로 나눔 */
function freeformPoints(s, xf) {
  const gd = {};
  for (const m of s.matchAll(/<a:gd name="([^"]+)" fmla="([^"]+)"\/>/g)) {
    const t = m[2].split(/\s+/);
    if (t[0] === '*/') gd[m[1]] = { a: +t[1], ref: t[2], b: +t[3] };
    else if (t[0] === 'val') gd[m[1]] = { v: +t[1] };
  }
  const pts = [];
  for (const pm of s.matchAll(/<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/g)) {
    const pw = +(attr(pm[1], 'w') || xf.cx), ph = +(attr(pm[1], 'h') || xf.cy);
    /* 안내선 값 "*\/ a w b" = a × (도형 너비) ÷ b → 도형 좌표(EMU). 숫자 좌표는 경로 공간 → 도형 크기로 늘림 */
    const val = (v, axis) => {
      if (/^-?\d+$/.test(v)) return +v * (axis === 'x' ? xf.cx / pw : xf.cy / ph);
      const g = gd[v]; if (!g) return NaN;
      if (g.v != null) return g.v;
      return g.a * (g.ref === 'w' ? xf.cx : g.ref === 'h' ? xf.cy : 1) / g.b;
    };
    const P = (m) => [val(attr(m, 'x'), 'x'), val(attr(m, 'y'), 'y')];
    let cur = null;
    for (const c of pm[2].matchAll(/<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:\1>)/g)) {
      const ps = [...(c[2] || '').matchAll(/<a:pt [^>]*\/>/g)].map((m) => P(m[0]));
      if (c[1] === 'moveTo' || c[1] === 'lnTo') { cur = ps[0]; pts.push(cur); }
      else if (c[1] === 'cubicBezTo' && cur) {
        const [p1, p2, p3] = ps;
        for (const t of [0.25, 0.5, 0.75, 1]) { const u = 1 - t; pts.push([u * u * u * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
        cur = p3;
      } else if (c[1] === 'quadBezTo' && cur) { const [p1, p2] = ps; for (const t of [0.5, 1]) { const u = 1 - t; pts.push([u * u * cur[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * cur[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } cur = p2; }
    }
  }
  /* 도형 좌표 → 슬라이드 좌표 (뒤집기·회전 반영) */
  const cx = xf.x + xf.cx / 2, cy = xf.y + xf.cy / 2, r = xf.rot * Math.PI / 180;
  return pts.filter((p) => isFinite(p[0]) && isFinite(p[1])).map(([px, py]) => {
    let dx = (xf.flipH ? xf.cx - px : px) - xf.cx / 2, dy = (xf.flipV ? xf.cy - py : py) - xf.cy / 2;
    return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
  });
}
function readSlides(pptx) {
  const z = readZip(path.resolve(ROOT, pptx));
  const slides = [];
  for (let n = 1; z[`ppt/slides/slide${n}.xml`]; n++) {
    const xml = z[`ppt/slides/slide${n}.xml`].toString('utf8');
    const rels = (z[`ppt/slides/_rels/slide${n}.xml.rels`] || '').toString('utf8');
    const relOf = (id) => { const m = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`)); return m ? 'ppt/' + m[1].replace(/^\.\.\//, '') : null; };
    const shapes = [];
    for (const m of xml.matchAll(/<p:(sp|pic)>([\s\S]*?)<\/p:\1>/g)) {
      const s = m[2], xf = xfrmOf(s), name = unesc(attr(s, 'name') || '');
      if (m[1] === 'pic') {
        const sr = s.match(/<a:srcRect([^/]*)\/>/);
        const crop = sr ? Object.fromEntries(['l', 't', 'r', 'b'].map((k) => [k, +(attr(sr[1], k) || 0) / 100000])) : { l: 0, t: 0, r: 0, b: 0 };
        shapes.push({ kind: 'pic', name, xf, img: relOf(attr(s, 'r:embed')), crop });
      } else {
        const custom = /<a:custGeom>/.test(s);
        const ln = (s.match(/<a:ln\b[\s\S]*?<\/a:ln>/) || [''])[0];
        shapes.push({ kind: 'sp', name, xf, texts: paraTexts(s), custom, line: (ln.match(/srgbClr val="([0-9A-Fa-f]{6})"/) || [])[1] || null, pts: custom && xf ? freeformPoints(s, xf) : null });
      }
    }
    slides.push({ n, xml, shapes, text: paraTexts(xml).join(' '), z });
  }
  return { slides, z };
}

/* ── 그림 · 거리 지도 ────────────────────────────────────────────── */
function distanceMap(w, h, isOn) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = isOn(i) ? 0 : INF;
  const D2 = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D2); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D2); } d[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1); if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D2); if (x > 0) v = Math.min(v, d[i + w - 1] + D2); } d[i] = v; }
  return d;
}
/* 지도 좌표(5186) ↔ 그림 픽셀 — 닮음변환(축척 s · 회전 th · 위치 u0,v0), 기준점 (cx, cy) */
const toPx = (T, x, y) => { const dx = x - T.cx, dy = y - T.cy, c = Math.cos(T.th), s = Math.sin(T.th); return [T.u0 + T.s * (c * dx - s * dy), T.v0 - T.s * (s * dx + c * dy)]; };
const toMap = (T, u, v) => { const X = (u - T.u0) / T.s, Y = -(v - T.v0) / T.s, c = Math.cos(T.th), s = Math.sin(T.th); return [T.cx + c * X + s * Y, T.cy - s * X + c * Y]; };
function densify(rings, step) {
  const out = [];
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1], L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]); }
  return out;
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };

/* 그림 속 빨간 선(복합위험지구) · 검은 선(읍면동 경계)에 AURI 지구 SHP · 행정동 경계를 겹쳐 변환 찾기 */
function georef(img, district, bounds) {
  const { width: W, height: H, rgba } = img;
  const isRed = (i) => { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]; return r > 190 && g < 80 && b < 80; };
  const isDark = (i) => rgba[i * 4] < 70 && rgba[i * 4 + 1] < 70 && rgba[i * 4 + 2] < 70;
  const dRed = distanceMap(W, H, isRed), dDark = distanceMap(W, H, isDark);
  /* 빨간 점 묶음 — 범례의 빨간 네모와 지구선을 가르려고 24px 칸으로 이어진 덩어리별로 */
  const CELL = 24, gw = Math.ceil(W / CELL), cells = new Map();
  for (let i = 0; i < W * H; i++) if (isRed(i)) { const k = Math.floor((i % W) / CELL) + Math.floor(Math.floor(i / W) / CELL) * gw; const c = cells.get(k); if (c) { c.n++; c.bb[0] = Math.min(c.bb[0], i % W); c.bb[1] = Math.min(c.bb[1], Math.floor(i / W)); c.bb[2] = Math.max(c.bb[2], i % W); c.bb[3] = Math.max(c.bb[3], Math.floor(i / W)); } else cells.set(k, { n: 1, bb: [i % W, Math.floor(i / W), i % W, Math.floor(i / W)] }); }
  const seen = new Set(), clusters = [];
  for (const k of cells.keys()) { if (seen.has(k)) continue; const st = [k], cl = { n: 0, bb: [Infinity, Infinity, -Infinity, -Infinity] }; seen.add(k);
    while (st.length) { const c = st.pop(), v = cells.get(c); cl.n += v.n; cl.bb = [Math.min(cl.bb[0], v.bb[0]), Math.min(cl.bb[1], v.bb[1]), Math.max(cl.bb[2], v.bb[2]), Math.max(cl.bb[3], v.bb[3])];
      const cx = c % gw, cy = Math.floor(c / gw); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nk = cx + dx + (cy + dy) * gw; if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); } } }
    if (cl.n >= 30) clusters.push(cl); }
  if (!clusters.length) throw new Error('그림에서 빨간 지구선을 못 찾음');
  const dbb = district.reduce((b, s) => [Math.min(b[0], s.bbox[0]), Math.min(b[1], s.bbox[1]), Math.max(b[2], s.bbox[2]), Math.max(b[3], s.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const cx = (dbb[0] + dbb[2]) / 2, cy = (dbb[1] + dbb[3]) / 2;
  const at = (d, u, v) => { const x = Math.round(u), y = Math.round(v); return x < 0 || y < 0 || x >= W || y >= H ? null : d[y * W + x]; };
  const TR = 12;
  const score = (T, dSamples, bSamples, lam) => {
    let a = 0, na = 0; for (const [x, y] of dSamples) { const [u, v] = toPx(T, x, y); const d = at(dRed, u, v); a += d == null ? TR : Math.min(d, TR); na++; }
    let b = 0, nb = 0; if (lam) for (const [x, y] of bSamples) { const [u, v] = toPx(T, x, y); const d = at(dDark, u, v); if (d == null) continue; b += Math.min(d, TR); nb++; }
    return a / na + (nb ? lam * b / nb : lam * TR);
  };
  const dRings = district.flatMap((s) => s.rings);
  /* 출발점 후보: 큰 빨간 덩어리 하나씩(작은 글자·아이콘 빼고 — 가장 큰 덩어리의 30% 이상) +
     점선이 사고 점 등에 끊겨 여러 덩어리로 나뉜 경우를 위해 덩어리들(5% 이상)을 합친 범위. 각각 맞춰 보고 가장 잘 맞는 것 */
  const maxN = Math.max(...clusters.map((c) => c.n));
  const starts = clusters.filter((c) => c.n >= maxN * 0.3).map((c) => c.bb);
  const big = clusters.filter((c) => c.n >= maxN * 0.05);
  if (big.length > 1) starts.push(big.reduce((b, c) => [Math.min(b[0], c.bb[0]), Math.min(b[1], c.bb[1]), Math.max(b[2], c.bb[2]), Math.max(b[3], c.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]));
  const optimize = (T, ds, bs, lam) => {
    const st = { s: T.s * 0.02, th: 0.01, u0: 6, v0: 6 };
    let cur = score(T, ds, bs, lam);
    for (let it = 0; it < 400; it++) {
      let moved = false;
      for (const k of ['u0', 'v0', 's', 'th']) for (const sg of [1, -1]) { const t = { ...T, [k]: T[k] + sg * st[k] }; const v = score(t, ds, bs, lam); if (v < cur - 1e-6) { T = t; cur = v; moved = true; } }
      if (!moved) { st.s /= 2; st.th /= 2; st.u0 /= 2; st.v0 /= 2; if (st.u0 < 0.03) break; }
    }
    return { T, cur };
  };
  let best = null;
  for (const bb of starts) {
    const s0 = ((bb[2] - bb[0]) / (dbb[2] - dbb[0]) + (bb[3] - bb[1]) / (dbb[3] - dbb[1])) / 2;
    const ds = densify(dRings, 1.5 / s0);
    const r = optimize({ s: s0, th: 0, u0: (bb[0] + bb[2]) / 2, v0: (bb[1] + bb[3]) / 2, cx, cy }, ds, [], 0);
    if (!best || r.cur < best.sc) best = { T: r.T, sc: r.cur, ds };
  }
  /* 지구선으로 맞춘 뒤 → 읍면동 경계까지 함께(그림 범위 안 표본) 다듬기 */
  let { T } = best;
  const bAll = densify(bounds, 2 / T.s);
  const inImg = (p) => { const [u, v] = toPx(T, p[0], p[1]); return u >= 0 && v >= 0 && u < W && v < H; };
  const bs = bAll.filter(inImg).filter((_, i, a) => a.length < 40000 || i % Math.ceil(a.length / 40000) === 0);
  ({ T } = optimize(T, best.ds, bs, bs.length > 200 ? 1 : 0));
  /* 맞춘 뒤 남는 어긋남: 지구선 표본·경계 표본의 그림 속 선까지 거리(중앙값, px) */
  const med = (arr) => { const a = arr.filter((v) => v != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const resRed = med(best.ds.map(([x, y]) => at(dRed, ...toPx(T, x, y))));
  const resDark = med(bs.map(([x, y]) => at(dDark, ...toPx(T, x, y))));
  return { T, resRed, resDark, nBounds: bs.length, W, H, dbb };
}

function drawCheck(img, T, district, bounds, polys, file) {
  const { width: W, height: H } = img; const rgba = new Uint8Array(img.rgba);
  const dot = (u, v, c, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(u) + dx, y = Math.round(v) + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; } };
  const line = (pts, c, r) => { for (let i = 0; i < pts.length - 1; i++) { const [u1, v1] = pts[i], [u2, v2] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(u2 - u1, v2 - v1))); for (let k = 0; k <= n; k++) dot(u1 + (u2 - u1) * k / n, v1 + (v2 - v1) * k / n, c, r); } };
  for (const r of bounds) line(r.map(([x, y]) => toPx(T, x, y)), [0, 200, 255], 0);
  for (const s of district) for (const r of s.rings) line(r.map(([x, y]) => toPx(T, x, y)), [0, 190, 0], 1);
  for (const p of polys) line(p.ring.map(([x, y]) => toPx(T, x, y)), [230, 0, 200], 2);
  /* 4배 줄여 저장 */
  const f = Math.max(1, Math.ceil(W / 1800)), w2 = Math.floor(W / f), h2 = Math.floor(H / f), small = new Uint8Array(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const o = (y * w2 + x) * 4, i = (y * f * W + x * f) * 4; small[o] = rgba[i]; small[o + 1] = rgba[i + 1]; small[o + 2] = rgba[i + 2]; small[o + 3] = 255; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(small, w2, h2));
}

/* ── 지자체 하나 · 종류 하나(구역 / 후보지) ──────────────────────── */
function findSlide(slides, slug, want) {
  if (want) return slides.find((s) => s.n === want);
  const r = REGIONS[slug], keys = [r.short, r.short.replace(/(시|군|구)$/, ''), r.label.split(' ').pop()].filter(Boolean);
  return slides.find((s) => keys.some((k) => s.text.includes(k)));
}
function circledNo(t) { const m = t.match(/^[\s]*([①②③④⑤❶❷❸❹❺])/); return m ? CIRCLED[m[1]] : null; }
function extract(slug, kind, spec) {
  const { slides } = readSlides(spec.pptx);
  const sl = findSlide(slides, slug, spec.slide);
  if (!sl) throw new Error(`${slug}: ${spec.pptx} 에서 슬라이드를 못 찾음`);
  const pics = sl.shapes.filter((s) => s.kind === 'pic' && s.xf && s.img);
  if (!pics.length) throw new Error(`${slug}: 지도 그림 없음 (슬라이드 ${sl.n})`);
  const imgPath = pics[0].img;
  const img = decodePng(sl.z[imgPath]);
  /* 지도 그림(같은 그림을 전체·확대 두 번 쓰기도 함) — 도형이 얹힌 그림과 그림 픽셀 대응 */
  const picOf = (p) => pics.filter((q) => q.img === imgPath && p[0] >= q.xf.x && p[0] <= q.xf.x + q.xf.cx && p[1] >= q.xf.y && p[1] <= q.xf.y + q.xf.cy);
  const emuToPx = (q, [X, Y]) => [img.width * (q.crop.l + (X - q.xf.x) / q.xf.cx * (1 - q.crop.l - q.crop.r)), img.height * (q.crop.t + (Y - q.xf.y) / q.xf.cy * (1 - q.crop.t - q.crop.b))];
  const pxPerEmu = (q) => img.width * (1 - q.crop.l - q.crop.r) / q.xf.cx;
  const free = sl.shapes.filter((s) => s.kind === 'sp' && s.custom && s.pts && s.pts.length >= 4 && s.xf.cx > 150000 && s.xf.cy > 150000)
    .map((s) => { const c = [s.xf.x + s.xf.cx / 2, s.xf.y + s.xf.cy / 2]; const q = picOf(c).sort((a, b) => pxPerEmu(b) - pxPerEmu(a))[0]; return q ? { ...s, pic: q, res: pxPerEmu(q) } : null; }).filter(Boolean);
  /* 번호표(①②… 원·네모 안 숫자) — 도형마다 가장 가까운 번호 */
  const markers = sl.shapes.filter((s) => s.kind === 'sp' && !s.custom && s.xf && s.texts.length === 1 && /^[1-9]$/.test(s.texts[0])).map((s) => ({ no: +s.texts[0], c: [s.xf.x + s.xf.cx / 2, s.xf.y + s.xf.cy / 2], name: s.name }));
  const pairs = [];
  /* 번호표는 도형과 같은 그림(전체/확대) 위에 있는 것만 */
  for (const f of free) for (const m of markers) if (picOf(m.c).includes(f.pic)) pairs.push({ f, m, d: Math.min(...f.pts.map((p) => Math.hypot(p[0] - m.c[0], p[1] - m.c[1]))) });
  pairs.sort((a, b) => a.d - b.d);
  const usedF = new Set(), usedM = new Set(), got = [];
  for (const p of pairs) { if (usedF.has(p.f) || usedM.has(p.m)) continue; usedF.add(p.f); usedM.add(p.m); got.push({ f: p.f, no: p.m.no }); }
  /* 같은 번호가 전체·확대 그림에 두 번 그려졌으면 확대(해상도 높은) 쪽 */
  const byNo = {};
  for (const g of free.map((f) => got.find((x) => x.f === f) || { f, no: null })) { const k = g.no ?? `?${g.f.name}`; if (!byNo[k] || g.f.res > byNo[k].f.res) byNo[k] = g; }
  /* 번호 없는 도형이 번호 있는 도형과 같은 꼴(점 수·선 색)이면 전체 그림의 사본 → 뺌 */
  for (const k of Object.keys(byNo)) if (k.startsWith('?')) { const f = byNo[k].f; if (Object.values(byNo).some((g) => g.no != null && g.f.pts.length === f.pts.length && g.f.line === f.line)) delete byNo[k]; }
  /* 이름 — "② 후보지: 고흥읍 남계리 일원 (약 2.0㎢)" · "① 상업·유흥 밀집형(평화광장 일대)" */
  const names = {};
  for (const s of sl.shapes) if (s.kind === 'sp') { let last = null;
    for (const t of s.texts) for (const part of t.split(/(?=[①②③④⑤❶❷❸❹❺])/)) { const no = circledNo(part);
      if (no) { last = names[no] ? null : no; if (last) names[no] = part.trim(); }
      else if (last && /^\(/.test(part.trim())) names[last] += part.trim();   // "① 주거생활형" + "(늑동파출소 일대)" 두 줄
    } }
  /* 그림 기준선: AURI 지구 SHP · 행정동 경계 */
  const zc = ZONES_CFG[slug];
  if (!zc || !zc.district) throw new Error(`${slug}: zones.json 에 district 없음`);
  const district = readPolygons(path.resolve(ROOT, zc.district));
  const samp = district.flatMap((s) => s.rings[0].filter((_, i) => i % 5 === 0));
  const groups = pickGroups(hjdGroups(HJD_DIR), samp);
  const bounds = groups.flatMap(({ g }) => Object.values(g.byName).flat().flatMap((s) => s.rings));
  const G = georef(img, district, bounds);
  const mPerPx = 1 / G.T.s;
  const polys = Object.entries(byNo).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([no, g]) => {
    const ring = g.f.pts.map((p) => toMap(G.T, ...emuToPx(g.f.pic, p)));
    if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push(ring[0]);
    const raw = names[no] || null;
    const m = raw ? raw.replace(/^[①②③④⑤❶❷❸❹❺]\s*/, '') : '';
    const area = ringArea(ring) / 1e6;
    const note = (m.match(/\(약\s*([\d.]+)\s*㎢\)/) || [])[1];
    const label = m.replace(/^후보지\s*:\s*/, '').replace(/\s*\(약\s*[\d.]+\s*㎢\)\s*/, ' ').replace(/\s+/g, ' ').trim();
    const typed = label.match(/^(.+?형)\s*\((.+)\)$/);   // "상업·유흥 밀집형(평화광장 일대)"
    return { no: isNaN(+no) ? null : +no, raw, label, type: typed ? typed[1] : null, place: typed ? typed[2] : null, ring, areaKm2: +area.toFixed(3), areaNote: note ? +note : null, shape: g.f.name, line: g.f.line, pxRes: +(g.f.res * 1e5).toFixed(2) };
  });
  drawCheck(img, G.T, district, bounds, polys, path.join(CHECK_DIR, `${slug}_${kind}.png`));
  console.log(`${slug} ${kind}: 슬라이드 ${sl.n} · 그림 ${img.width}×${img.height} · 1px = ${mPerPx.toFixed(2)}m · 회전 ${(G.T.th * 180 / Math.PI).toFixed(2)}° · 어긋남(중앙값) 지구선 ${G.resRed != null ? (G.resRed * mPerPx).toFixed(1) + 'm' : '-'} · 읍면동선 ${G.resDark != null ? (G.resDark * mPerPx).toFixed(1) + 'm' : '-'} (표본 ${G.nBounds})`);
  for (const p of polys) console.log(`   ${p.no ?? '?'} ${p.label || '(이름 없음)'} — 계산 ${p.areaKm2}㎢${p.areaNote ? ` (PPT "약 ${p.areaNote}㎢")` : ''} · 꼭짓점 ${p.ring.length} · 도형 "${p.shape}"`);
  return { slide: sl.n, mPerPx: +mPerPx.toFixed(3), rotationDeg: +(G.T.th * 180 / Math.PI).toFixed(3), residualM: { district: G.resRed != null ? +(G.resRed * mPerPx).toFixed(1) : null, bounds: G.resDark != null ? +(G.resDark * mPerPx).toFixed(1) : null }, polys };
}

const only = ARGS.only ? String(ARGS.only).split(',') : null;
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [slug, spec] of Object.entries(CFG.regions)) {
  if (only && !only.includes(slug)) continue;
  const features = [], meta = {};
  for (const kind of ['zones', 'candidates']) {
    if (!spec[kind]) continue;
    const r = extract(slug, kind, spec[kind]);
    meta[kind] = { pptx: spec[kind].pptx, slide: r.slide, mPerPx: r.mPerPx, rotationDeg: r.rotationDeg, residualM: r.residualM };
    for (const p of r.polys) features.push({ type: 'Feature', properties: { kind: kind === 'zones' ? 'zone' : 'candidate', no: p.no, name: p.label, raw: p.raw, type: p.type, place: p.place, areaKm2: p.areaKm2, areaNote: p.areaNote, shape: p.shape }, geometry: { type: 'Polygon', coordinates: [p.ring.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)])] } });
  }
  const out = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:5186' } }, source: 'AURI 위치도 PPT 자유형 도형 → build-ppt-zones.mjs', generatedAt: new Date().toISOString().slice(0, 10), meta, features };
  fs.writeFileSync(path.join(OUT_DIR, slug + '.geojson'), JSON.stringify(out));
  console.log(`  → ${path.relative(ROOT, path.join(OUT_DIR, slug + '.geojson'))} (${features.length}개)`);
}
