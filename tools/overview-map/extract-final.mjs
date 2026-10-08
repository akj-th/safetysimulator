/* ════════════════════════════════════════════════════════════════════
   AURI 최종 종합도 이미지(PNG)에서 도형을 색으로 뽑아냅니다 — 사람이 이름만 붙이면 되게

   실행:  node tools/overview-map/extract-final.mjs "<이미지.png>" [출력.json]

   뽑는 것
     dots      빨간 점(시설 위치)            → 중심 px
     markers   번호 원(녹·청·보라·주황)       → 중심 px · 색(안전 유형)
     zones     같은 색의 윤곽선(실선·점선) 안쪽 → 다각형 px (점선은 팽창해 이어 붙임)
     lines     노란/빨간 구간선·점선          → 점 사슬 px

   색 기준은 2026-10-08 남해·사천 최종본에서 찍은 값입니다(COLORS). 다른 판이 오면 여기만 고칩니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const outFile = process.argv[3] || file.replace(/\.png$/i, '_features.json');

function readPng(f) {
  const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20), ct = b[25];
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  let off = 8; const parts = []; while (off < b.length) { const len = b.readUInt32BE(off), t = b.toString('latin1', off + 4, off + 8); if (t === 'IDAT') parts.push(b.subarray(off + 8, off + 8 + len)); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(parts)), stride = w * ch, out = Buffer.alloc(w * h * ch); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const ft = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) { const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i]; if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1; else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? up : c; } cur[i] = v & 255; }
    cur.copy(out, y * stride); prev = cur; }
  return { w, h, ch, data: out };
}
const img = readPng(file);
const { w, h, ch, data } = img;
const px = (x, y) => { const o = (y * w + x) * ch; return [data[o], data[o + 1], data[o + 2]]; };
const near = (c, ref, tol) => Math.abs(c[0] - ref[0]) <= tol && Math.abs(c[1] - ref[1]) <= tol && Math.abs(c[2] - ref[2]) <= tol;

/* 색 (R,G,B) — 안전 유형 색은 마커·윤곽 공용 */
const COLORS = {
  crime: [30, 142, 62], suicide: [31, 95, 168], life: [123, 63, 160], infection: [222, 120, 40],
  dot: [209, 61, 65], yellow: [247, 200, 40], redline: [230, 40, 40],
};
const TOL = { crime: 34, suicide: 34, life: 34, infection: 34, dot: 28, yellow: 45, redline: 40 };
if (process.argv[4]) { const o = JSON.parse(process.argv[4]); for (const k in o) { if (Array.isArray(o[k])) COLORS[k] = o[k].slice(0, 3); if (o[k].length === 4) TOL[k] = o[k][3]; } }

/* 색 마스크 → 연결 요소 (4방향) */
function mask(test) { const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(px(x, y))) m[y * w + x] = 1; return m; }
function dilate(m, r) { const o = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!m[y * w + x]) continue; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) o[ny * w + nx] = 1; } } return o; }
function comps(m, minSize) {
  const lab = new Int32Array(w * h); const out = []; let n = 0; const st = [];
  for (let i = 0; i < m.length; i++) { if (!m[i] || lab[i]) continue; n++; lab[i] = n; st.push(i); let cnt = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    while (st.length) { const c = st.pop(); const x = c % w, y = (c / w) | 0; cnt++; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const k of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) if (k >= 0 && m[k] && !lab[k]) { lab[k] = n; st.push(k); } }
    if (cnt >= minSize) out.push({ id: n, n: cnt, x: +(sx / cnt).toFixed(1), y: +(sy / cnt).toFixed(1), bw: maxx - minx + 1, bh: maxy - miny + 1, minx, miny, maxx, maxy }); }
  return { lab, list: out };
}

/* 닫힌 윤곽 안쪽을 다각형으로: 요소의 경계 상자 안에서 바깥과 이어지지 않은 빈칸 = 안쪽 */
function insidePolygon(m, lab, c) {
  const x0 = Math.max(0, c.minx - 2), y0 = Math.max(0, c.miny - 2), W = Math.min(w - 1, c.maxx + 2) - x0 + 1, H = Math.min(h - 1, c.maxy + 2) - y0 + 1;
  const wall = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y + y0) * w + (x + x0); if (m[i] && lab[i] === c.id) wall[y * W + x] = 1; }
  const outside = new Uint8Array(W * H); const st = [];
  for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
  while (st.length) { const i = st.pop(); if (outside[i] || wall[i]) continue; outside[i] = 1; const x = i % W, y = (i / W) | 0; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
  const inside = new Uint8Array(W * H); let area = 0; for (let i = 0; i < inside.length; i++) if (!outside[i] && !wall[i]) { inside[i] = 1; area++; }
  if (area < 400) return null;
  /* 테두리 추적 */
  const edges = new Map(); const key = (x, y) => x + ',' + y; const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : inside[y * W + x];
  const add = (a, b) => { const k = key(a[0], a[1]); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!inside[y * W + x]) continue; if (!at(x, y - 1)) add([x, y], [x + 1, y]); if (!at(x + 1, y)) add([x + 1, y], [x + 1, y + 1]); if (!at(x, y + 1)) add([x + 1, y + 1], [x, y + 1]); if (!at(x - 1, y)) add([x, y + 1], [x, y]); }
  let best = null;
  while (edges.size) { const [k0, list] = edges.entries().next().value; const start = k0.split(',').map(Number); const ring = [start]; let cur = start;
    for (;;) { const kk = cur.join(','); const nx = edges.get(kk); if (!nx || !nx.length) break; const p = nx.shift(); if (!nx.length) edges.delete(kk); if (p[0] === start[0] && p[1] === start[1]) break; ring.push(p); cur = p; }
    if (!best || ring.length > best.length) best = ring; }
  const simp = simplify(best, 3).map(p => [p[0] + x0, p[1] + y0]);
  return { area, ring: simp };
}
function simplify(pts, tol) { if (pts.length < 4) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, idx = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [p, q] = pts[i]; let d; if (!L) d = Math.hypot(p - ax, q - ay); else { const t = Math.max(0, Math.min(1, ((p - ax) * dx + (q - ay) * dy) / L)); d = Math.hypot(p - ax - t * dx, q - ay - t * dy); } if (d > md) { md = d; idx = i; } }
    if (md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); } }
  return pts.filter((_, i) => keep[i]); }

/* 윤곽에 틈이 있을 때: 픽셀을 cell 크기 격자로 뭉친 뒤 r칸 닫기(팽창→침식)로 틈을 메우고 안쪽을 채웁니다 */
function insideByCells(m, lab, c, cell, r) {
  const x0 = c.minx - cell * (r + 1), y0 = c.miny - cell * (r + 1);
  const W = Math.ceil((c.maxx - x0) / cell) + r + 2, H = Math.ceil((c.maxy - y0) / cell) + r + 2;
  let g = new Uint8Array(W * H);
  for (let y = c.miny; y <= c.maxy; y++) for (let x = c.minx; x <= c.maxx; x++) { const i = y * w + x; if (m[i] && lab[i] === c.id) g[(((y - y0) / cell) | 0) * W + (((x - x0) / cell) | 0)] = 1; }
  const dil = (q, rr) => { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!q[y * W + x]) continue; for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) o[ny * W + nx] = 1; } } return o; };
  const d = dil(g, r);
  const outside = new Uint8Array(W * H); const st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (outside[i] || d[i]) continue; outside[i] = 1; const x = i % W, y = (i / W) | 0; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
  /* 안쪽 = 바깥 아님. 벽(팽창분)도 안쪽으로 되돌리되 r 만큼 침식 → 원래 선 두께 자리 */
  let inside = new Uint8Array(W * H); for (let i = 0; i < inside.length; i++) inside[i] = outside[i] ? 0 : 1;
  const inv = new Uint8Array(W * H); for (let i = 0; i < inv.length; i++) inv[i] = inside[i] ? 0 : 1;
  const invD = dil(inv, r); for (let i = 0; i < inside.length; i++) inside[i] = invD[i] ? 0 : 1;
  let area = 0; for (let i = 0; i < inside.length; i++) area += inside[i];
  if (area < 6) return null;
  const edges = new Map(); const key = (x, y) => x + ',' + y; const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : inside[y * W + x];
  const add = (p, q) => { const k = key(p[0], p[1]); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(q); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!inside[y * W + x]) continue; if (!at(x, y - 1)) add([x, y], [x + 1, y]); if (!at(x + 1, y)) add([x + 1, y], [x + 1, y + 1]); if (!at(x, y + 1)) add([x + 1, y + 1], [x, y + 1]); if (!at(x - 1, y)) add([x, y + 1], [x, y]); }
  let best = null;
  while (edges.size) { const [k0] = edges.entries().next().value; const start = k0.split(',').map(Number); const ring = [start]; let cur = start;
    for (;;) { const kk = cur.join(','); const nx = edges.get(kk); if (!nx || !nx.length) break; const p = nx.shift(); if (!nx.length) edges.delete(kk); if (p[0] === start[0] && p[1] === start[1]) break; ring.push(p); cur = p; }
    if (!best || ring.length > best.length) best = ring; }
  const ring = simplify(best, 1.2).map(p => [p[0] * cell + x0, p[1] * cell + y0]);
  return { area: area * cell * cell, ring, closedByCells: true };
}

/* 점 사슬 (점선 → 폴리라인) */
function chains(cs, maxGap) {
  const used = new Set(); const out = []; const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const order = cs.map((c, i) => i).sort((a, b) => cs.filter(o => o !== cs[a] && d(o, cs[a]) <= maxGap).length - cs.filter(o => o !== cs[b] && d(o, cs[b]) <= maxGap).length);
  for (const i of order) { if (used.has(i)) continue; const chain = [cs[i]]; used.add(i); let cur = cs[i];
    for (;;) { let best = null, bd = Infinity; cs.forEach((o, j) => { if (used.has(j)) return; const dd = d(o, cur); if (dd <= maxGap && dd < bd) { bd = dd; best = j; } }); if (best == null) break; used.add(best); cur = cs[best]; chain.push(cur); }
    if (chain.length >= 2) out.push(chain.map(c => [c.x, c.y])); }
  return out;
}

const result = { file, width: w, height: h, dots: [], markers: [], zones: [], lines: [] };
const S = w / 3141;                                   // 남해 최종본 기준 크기 비율

/* 빨간 점 */
{ const m = mask(c => near(c, COLORS.dot, TOL.dot)); const { list } = comps(m, 60 * S * S);
  const cand = list.filter(c => c.bw <= 60 * S && c.bh <= 60 * S && c.n > 0.5 * c.bw * c.bh).map(c => ({ x: c.x, y: c.y, r: +((c.bw + c.bh) / 4).toFixed(1) }));
  const nearest = (a) => Math.min(...cand.filter(b => b !== a).map(b => Math.hypot(a.x - b.x, a.y - b.y)), Infinity);
  const dash = cand.filter(a => nearest(a) <= 90 * S);           // 이웃이 가까우면 점선의 한 토막
  result.dots = cand.filter(a => nearest(a) > 90 * S);
  for (const ch of chains(dash, 95 * S)) if (ch.length >= 3) result.lines.push({ kind: 'reddash', points: ch.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]) }); }

/* 유형 색 — 마커(꽉 찬 원) · 윤곽(길고 성긴 요소) */
for (const [kind, ref] of Object.entries({ crime: COLORS.crime, suicide: COLORS.suicide, life: COLORS.life, infection: COLORS.infection })) {
  const m = mask(c => near(c, ref, TOL[kind]));
  const { lab, list } = comps(m, 40);
  for (const c of list) {
    const fill = c.n / (c.bw * c.bh), size = Math.max(c.bw, c.bh);
    if (size >= 50 * S && size <= 140 * S && fill > 0.45 && Math.abs(c.bw - c.bh) < 0.3 * size) { result.markers.push({ kind, x: c.x, y: c.y, r: +(size / 2).toFixed(1) }); continue; }
  }
  /* 윤곽: 점선을 잇기 위해 팽창한 뒤 다시 요소를 잡음 */
  const dm = dilate(m, Math.round((+process.env.DIL || 9) * S));   // 점선 윤곽은 DIL=24 처럼 키워서 한 번 더
  const { lab: dl, list: dlist } = comps(dm, 2000 * S * S);
  for (const c of dlist) {
    const size = Math.max(c.bw, c.bh); if (size < 150 * S) continue;
    const fill = c.n / (c.bw * c.bh); if (fill > 0.6) continue;           // 꽉 찬 것은 마커·글상자
    let poly = insidePolygon(dm, dl, c);
    if (!poly) poly = insideByCells(dm, dl, c, Math.round(22 * S), 2);   // 틈이 있으면 격자로 닫아서
    if (process.env.DEBUG) console.log('   [윤곽 후보]', kind, 'size', size, 'fill', fill.toFixed(2), 'bbox', c.minx, c.miny, c.maxx, c.maxy, poly ? 'area ' + poly.area : '안쪽 없음');
    if (!poly) continue;
    result.zones.push({ kind, x: c.x, y: c.y, bbox: [c.minx, c.miny, c.maxx, c.maxy], area: poly.area, ring: poly.ring, closedByCells: !!poly.closedByCells });
  }
}

/* 구간선: 노랑 · 빨강(점·굵은선) */
for (const [kind, ref, tol] of [['yellow', COLORS.yellow, 45], ['redline', COLORS.redline, 40]]) {
  const m = mask(c => near(c, ref, tol) && !(kind === 'redline' && near(c, COLORS.dot, 10)));
  const { lab, list } = comps(m, 30 * S * S);
  const cell = Math.round(14 * S);
  for (const c of list) {
    if (Math.max(c.bw, c.bh) < 80 * S) continue;
    /* 요소 픽셀을 칸으로 묶어 칸 중심을 사슬로 잇습니다 (굵은 연속선 → 폴리라인) */
    const cells = new Map();
    for (let y = c.miny; y <= c.maxy; y++) for (let x = c.minx; x <= c.maxx; x++) { const i = y * w + x; if (lab[i] !== c.id) continue; const k = ((y / cell) | 0) * 100000 + ((x / cell) | 0); const e = cells.get(k) || { x: 0, y: 0, n: 0 }; e.x += x; e.y += y; e.n++; cells.set(k, e); }
    const pts = [...cells.values()].map(e => ({ x: e.x / e.n, y: e.y / e.n }));
    for (const ch of chains(pts, cell * 2.2)) if (ch.length >= 3) result.lines.push({ kind, points: simplify(ch, 2 * S).map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
  }
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(`→ ${outFile}`);
console.log(` 빨간 점 ${result.dots.length} · 마커 ${result.markers.length} · 존 윤곽 ${result.zones.length} · 선 ${result.lines.length}`);
for (const m of result.markers) console.log('  marker', m.kind, m.x, m.y, 'r', m.r);
for (const z of result.zones) console.log('  zone', z.kind, 'bbox', z.bbox.join(','), 'area', z.area, 'pts', z.ring.length);
for (const l of result.lines) console.log('  line', l.kind, l.points.length, l.points[0], l.points[l.points.length - 1]);
for (const d of result.dots) console.log('  dot', d.x, d.y);
