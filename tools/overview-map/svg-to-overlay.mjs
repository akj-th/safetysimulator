/* ════════════════════════════════════════════════════════════════════
   종합도 SVG → 웹 지도 오버레이 (2026-10-20)

   종합도 SVG(생성본 또는 담당자가 일러스트레이터에서 고쳐 저장한 것)에서
   **지리 정보만** 읽어 위경도로 바꿔 둡니다. 1단계 지도(index.html)가 이 파일을 받아
   네이버 지도 위에 사업지 구역·번호·시설·지명을 얹습니다.

     사업지_구역  다각형 (색 → 안전사고 유형)
     사업지_번호  번호 원 (어느 구역인지는 색 + 가장 가까운 다각형)
     시설         빨간 점 + 이름
     지명         동 이름
     사업지_NN    설명 상자 — 번호·유형·장소·항목 글 (좌표 없음, 눌렀을 때 보여 줄 글)

   픽셀 → 위경도는 `_frame.json`(생성기가 SVG 와 함께 적는 originX/originY/scale/zoom)으로 되돌립니다.
   일러스트레이터가 저장한 SVG 는 레이어 id 가 `_x31_3-1_x5F_…` 꼴로 바뀌고 색이 class(.st12) 로 빠지므로
   둘 다 풀어서 읽습니다. 곡선(c/s/q)은 잘게 쪼개 꼭짓점으로 만듭니다.

   사용
     node tools/overview-map/svg-to-overlay.mjs <지역> [--svg=<파일>]   (기본: output/overview-map/<지역>/<지역>_종합도_최종.svg 가 있으면 그것, 없으면 _종합도.svg)
     → data/overview/<지역>.json
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!slug) { console.error('사용법: node svg-to-overlay.mjs <지역> [--svg=<파일>]'); process.exit(1); }

const outDir = path.join(ROOT, 'output/overview-map', slug);
const svgFile = ARGS.svg ? path.resolve(String(ARGS.svg))
  : [path.join(outDir, `${slug}_종합도_최종.svg`), path.join(outDir, `${slug}_종합도.svg`)].find(f => fs.existsSync(f));
if (!svgFile || !fs.existsSync(svgFile)) { console.error('SVG 없음: ' + svgFile); process.exit(1); }
const frame = JSON.parse(fs.readFileSync(path.join(outDir, '_frame.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/overview-map/regions', slug + '.json'), 'utf8'));

let svg = fs.readFileSync(svgFile, 'utf8').replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '');

/* ── 색 → 안전사고 유형 (AURI 7색, build-overview-map 과 같은 값) ── */
const SAFETY_RGB = { industrial: [224, 60, 60], infection: [242, 140, 40], traffic: [240, 200, 40], crime: [60, 168, 74], suicide: [47, 127, 224], fire: [35, 35, 145], life: [150, 80, 200] };
const SAFETY_LABEL = { industrial: '산업재해', infection: '감염병', traffic: '교통사고', crime: '범죄', suicide: '자살', fire: '화재', life: '생활안전' };
function parseColor(c) {
  if (!c) return null; c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = c.match(/^#([0-9a-f]{3})$/i); if (m) return [...m[1]].map(h => parseInt(h + h, 16));
  m = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i); if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
function safetyOf(rgb) {
  if (!rgb) return null; let best = null, bd = 1e9;
  for (const [k, v] of Object.entries(SAFETY_RGB)) { const d = Math.hypot(rgb[0] - v[0], rgb[1] - v[1], rgb[2] - v[2]); if (d < bd) { bd = d; best = k; } }
  return bd < 90 ? best : null;
}

/* ── class → fill/stroke (일러스트레이터 저장본) ── */
const CLASS = {};
const styleBlock = (svg.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
for (const m of styleBlock.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const sels = m[1].split(',').map(s => s.trim().replace(/^\./, ''));
  const decl = Object.fromEntries(m[2].split(';').map(d => d.split(':').map(s => s.trim())).filter(d => d[0]));
  for (const s of sels) CLASS[s] = Object.assign(CLASS[s] || {}, decl);
}
function attrs(tag) {
  const o = {}; for (const m of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) o[m[1]] = m[2];
  const cls = (o.class || '').split(/\s+/).filter(Boolean);
  const st = {}; for (const c of cls) Object.assign(st, CLASS[c] || {});
  if (o.style) for (const d of o.style.split(';')) { const [k, v] = d.split(':').map(s => s && s.trim()); if (k) st[k] = v; }
  o._fill = o.fill || st.fill; o._stroke = o.stroke || st.stroke;
  return o;
}

/* ── 레이어 꺼내기 (id 의 일러스트레이터 escape 풀기) ── */
const unesc = (id) => id.replace(/_x([0-9A-Fa-f]{2,4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function layer(suffix) {
  const re = /<g\b([^>]*)>|<\/g>/g; let m; const stack = [];
  while ((m = re.exec(svg))) {
    if (m[0] === '</g>') { const t = stack.pop(); if (t && t.hit) return svg.slice(t.start, m.index + 4); }
    else { const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; const name = id ? unesc(id) : ''; stack.push({ start: m.index, hit: !!id && (name === suffix || name.endsWith('_' + suffix) || name.replace(/\d$/, '') === suffix || name.endsWith('_' + suffix + '1')) }); }
  }
  return '';
}

/* ── 경로 → 꼭짓점 ── */
function flattenPath(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || []; let i = 0;
  const pts = []; let cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', px = 0, py = 0, prev = '';
  const num = () => parseFloat(toks[i++]);
  const push = (x, y) => { pts.push([x, y]); cx = x; cy = y; };
  const bez = (x1, y1, x2, y2, x, y) => { const x0 = cx, y0 = cy; for (let t = 0.2; t <= 1.001; t += 0.2) { const u = 1 - t; pts.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]); } px = x2; py = y2; cx = x; cy = y; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': { const x = num(), y = num(); push(rel ? cx + x : x, rel ? cy + y : y); sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; break; }
      case 'L': { const x = num(), y = num(); push(rel ? cx + x : x, rel ? cy + y : y); break; }
      case 'H': { const x = num(); push(rel ? cx + x : x, cy); break; }
      case 'V': { const y = num(); push(cx, rel ? cy + y : y); break; }
      case 'C': { let a = [num(), num(), num(), num(), num(), num()]; if (rel) a = [a[0] + cx, a[1] + cy, a[2] + cx, a[3] + cy, a[4] + cx, a[5] + cy]; bez(...a); break; }
      case 'S': { let a = [num(), num(), num(), num()]; if (rel) a = [a[0] + cx, a[1] + cy, a[2] + cx, a[3] + cy]; const r = /[cs]/i.test(prev) ? [2 * cx - px, 2 * cy - py] : [cx, cy]; bez(r[0], r[1], ...a); break; }
      case 'Q': { let a = [num(), num(), num(), num()]; if (rel) a = [a[0] + cx, a[1] + cy, a[2] + cx, a[3] + cy]; bez(cx + 2 / 3 * (a[0] - cx), cy + 2 / 3 * (a[1] - cy), a[2] + 2 / 3 * (a[0] - a[2]), a[3] + 2 / 3 * (a[1] - a[3]), a[2], a[3]); break; }
      case 'Z': cx = sx; cy = sy; break;
      default: i++;
    }
    prev = cmd;
  }
  return pts;
}
const pointsAttr = (s) => { const n = s.match(/-?\d*\.?\d+/g).map(Number); const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };
function simplify(pts, tol) {   // 더글러스-포이커
  if (pts.length < 4) return pts;
  const d2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const rec = (a, b) => { let mx = 0, mi = -1; for (let i = a + 1; i < b; i++) { const d = d2(pts[i], pts[a], pts[b]); if (d > mx) { mx = d; mi = i; } } return mx > tol ? [...rec(a, mi), ...rec(mi, b).slice(1)] : [pts[a], pts[b]]; };
  return rec(0, pts.length - 1);
}
const polyArea = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const distToPoly = (pt, poly) => { let md = 1e9; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy || 1; let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); md = Math.min(md, Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy)); } return md; };

/* ── 픽셀 → 위경도 (웹 메르카토르, _frame.json) ── */
const N = 256 * 2 ** frame.zoom;
function toLL([px, py]) {
  const wx = px / frame.scale + frame.originX, wy = py / frame.scale + frame.originY;
  const lng = wx / N * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / N))) * 180 / Math.PI;
  return [+lat.toFixed(6), +lng.toFixed(6)];
}

/* ── 1) 사업지 구역 다각형 ── */
const zoneLayer = layer('13-1_사업지_구역');
const polys = [];
for (const m of zoneLayer.matchAll(/<(polygon|path)\b([^>]*)\/?>/g)) {
  const a = attrs(m[0]);
  const pts = m[1] === 'polygon' ? pointsAttr(a.points) : flattenPath(a.d);
  if (pts.length < 3) continue;
  const color = parseColor(a._stroke && a._stroke !== 'none' ? a._stroke : a._fill);
  const safety = safetyOf(color);
  const sp = simplify(pts, 1.2);
  const area = polyArea(sp);
  /* 같은 모양이 칠·선으로 두 번 들어 있으므로 면적·첫 점이 같으면 하나로 */
  const dup = polys.find(p => Math.abs(p.area - area) < area * 0.02 && Math.hypot(p.px[0][0] - sp[0][0], p.px[0][1] - sp[0][1]) < 3);
  if (dup) { dup.safety = dup.safety || safety; dup.dashed = dup.dashed || /dasharray/.test(JSON.stringify(a)); continue; }
  polys.push({ px: sp, area, safety, dashed: false });
}

/* ── 2) 번호 원 ── */
const numLayer = layer('14-1_사업지_번호');
const markers = [];
{
  const re = /<circle\b([^>]*)\/>|<text\b([^>]*)>([\s\S]*?)<\/text>/g; let m, cur = null;
  while ((m = re.exec(numLayer))) {
    if (m[1] !== undefined) { const a = attrs(m[0]); cur = { px: [+a.cx, +a.cy], safety: safetyOf(parseColor(a._fill)), label: '' }; markers.push(cur); }
    else if (cur) { cur.label = m[3].replace(/<[^>]+>/g, '').trim(); }
  }
}

/* ── 3) 시설 ── */
const poiLayer = layer('15-1_시설');
const pois = [];
{
  const re = /<circle\b([^>]*)\/>|<text\b([^>]*)>([\s\S]*?)<\/text>/g; let m, cur = null;
  while ((m = re.exec(poiLayer))) {
    if (m[1] !== undefined) { const a = attrs(m[0]); cur = { px: [+a.cx, +a.cy], name: '' }; pois.push(cur); }
    else if (cur) cur.name = m[3].replace(/<[^>]+>/g, '').trim();
  }
}

/* ── 4) 지명 (같은 글이 외곽선·본문으로 두 번) ── */
const labelLayer = layer('15_지명');
const labels = [];
for (const m of labelLayer.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
  const a = attrs(m[0]); const text = m[2].replace(/<[^>]+>/g, '').trim();
  let px; const t = (a.transform || '').match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/);
  if (t) px = [+t[1], +t[2]]; else if (a.x) px = [+a.x, +a.y];
  if (!px || !text) continue;
  if (labels.some(l => l.text === text && Math.hypot(l.px[0] - px[0], l.px[1] - px[1]) < 4)) continue;
  labels.push({ text, px });
}

/* ── 5) 설명 상자 — 번호·유형·장소 (항목 글은 설정 JSON 이 정본) ── */
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
const boxes = [];
for (let n = 1; n <= 12; n++) {
  const L = layer('사업지_' + String(n).padStart(2, '0'));
  if (!L) continue;
  const texts = [...L.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!texts.length) continue;
  let num = '', type = '', place = '';
  const first = texts[0];
  const cm = first.match(new RegExp('[' + CIRC + ']+'));
  if (cm) { num = cm[0]; type = first.replace(cm[0], '').trim(); if (!type && texts[1] && !CIRC.includes(texts[1][0])) { type = texts[1]; place = texts[2] || ''; } else place = texts[1] || ''; }
  else { type = first; place = texts[1] || ''; }
  if (!place && texts[2] && type === texts[1]) place = texts[2];
  boxes.push({ num, type, place });
}

/* 상자 ↔ 설정 zone (유형+장소 글로) → 항목·아이콘 */
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[·ㆍ]/g, '');
function zoneFor(box) {
  let best = null, bs = 0;
  for (const z of cfg.zones || []) {
    let s = 0; if (norm(z.type) === norm(box.type)) s += 2; if (norm(z.place) === norm(box.place)) s += 2;
    if (!s) { const a = norm(z.place), b = norm(box.place); if (a && b && (a.includes(b.slice(0, 4)) || b.includes(a.slice(0, 4)))) s += 1; }
    if (s > bs) { bs = s; best = z; }
  }
  return bs >= 2 ? best : null;
}

/* ── 조립: 상자 번호 → 번호 원 → 다각형(색 같고 번호 원을 품거나 가장 가까운 것) ── */
const zones = boxes.map(b => {
  const z = zoneFor(b);
  const items = z ? (z.items || []).map(it => typeof it === 'string' ? { text: it } : { text: it.text, icon: it.icon }) : [];
  const nums = [...b.num].map(ch => String(CIRC.indexOf(ch) + 1));
  const mk = markers.filter(m => nums.includes(m.label));
  const safety = (z && z.safety) || (mk[0] && mk[0].safety) || null;
  return { num: b.num, nums, type: b.type, place: b.place, safety, items, markers: mk.map(m => ({ label: m.label, px: m.px })), polygons: [] };
});
const used = new Set();
for (const p of polys) {
  let best = null, bd = 1e9;
  for (const z of zones) {
    if (z.safety && p.safety && z.safety !== p.safety) continue;
    for (const m of z.markers) { const d = inside(m.px, p.px) ? 0 : distToPoly(m.px, p.px); if (d < bd) { bd = d; best = z; } }
  }
  if (best && bd < 260) { best.polygons.push(p); used.add(p); }
}
const orphan = polys.filter(p => !used.has(p));

if (ARGS.debug) {
  console.log('MK', JSON.stringify(markers));
  for (const p of polys) { const xs = p.px.map(q => q[0]), ys = p.px.map(q => q[1]); console.log('PG', p.safety, p.px.length, `x ${Math.min(...xs).toFixed(0)}~${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}~${Math.max(...ys).toFixed(0)}`); }
  console.log('BOX', JSON.stringify(boxes));
}
const out = {
  region: slug, title: cfg.title, subtitle: cfg.subtitle,
  source: path.basename(svgFile), builtAt: new Date().toISOString().slice(0, 10),
  frame: { zoom: frame.zoom, center: toLL([frame.W / 2, frame.H / 2]), bounds: [toLL([0, frame.H]), toLL([frame.W, 0])] },
  zones: zones.map(z => ({ num: z.num, type: z.type, place: z.place, safety: z.safety, safetyLabel: z.safety ? SAFETY_LABEL[z.safety] : '', items: z.items, markers: z.markers.map(m => ({ label: m.label, at: toLL(m.px) })), polygons: z.polygons.map(p => ({ dashed: p.dashed, ring: p.px.map(toLL) })) })),
  pois: pois.filter(p => p.name).map(p => ({ name: p.name, at: toLL(p.px) })),
  labels: labels.map(l => ({ text: l.text, at: toLL(l.px) })),
  orphanPolygons: orphan.map(p => ({ safety: p.safety, ring: p.px.map(toLL) })),
};
const outFile = path.join(ROOT, 'data/overview', slug + '.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`${slug}: ${path.basename(svgFile)} → ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)}KB)`);
console.log(`  구역 다각형 ${polys.length} (귀속 안 됨 ${orphan.length}) · 번호 원 ${markers.length} · 시설 ${pois.length} · 지명 ${labels.length} · 상자 ${boxes.length}`);
for (const z of out.zones) console.log(`  ${z.num} ${z.type} | ${z.place} | ${z.safetyLabel || '유형?'} · 다각형 ${z.polygons.length} · 항목 ${z.items.length}${z.items.length ? '' : ' ⚠ 설정 JSON 과 못 맞춤'}`);
