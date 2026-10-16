/* ════════════════════════════════════════════════════════════════════
   PPTX 도형(shapes.json) → regions/<지역>.json 자동 조립 (2026-10-16, 미추홀~공주 13곳)

   실행:  node compose-auto.mjs <지역> --pptx=<풀어둔 pptx 폴더> --png=<최종 PNG> --sdm=<폴더[,폴더]>
              [--affine=<affine.json>] [--pairs-only] [--zoomOut=1.2] [--offset=x,y]
   - --pairs-only : 시설 점(px)+이름만 <pptx>/pairs.json 에 적고 끝 (fit-final 입력용)
   - --affine     : 정합 결과(JSON {a,b,c,d}). 없으면 frame 을 못 정하므로 임시값으로 적고 경고

   무엇을 어떻게 읽는가
     범례 글    "[범죄]" 머리 + "① 상업·유흥 밀집형 (장소)" 줄 → 번호별 유형·장소·분야
     설명 상자  첫 줄 "① 유형 (장소)" 또는 유형만, 둘째 줄 "(장소)", 나머지 줄 = 사업 항목
                번호가 없으면 범례의 유형·장소 글과 맞대어 번호를 찾음
     번호 원    글 "1".."9" + 색 → 번호·위치 (색은 범례가 없을 때만 분야 추정에 씀)
     구역 윤곽  선만 있는 다각형·사각·원 → 번호 원이 안쪽에 있는(없으면 가장 가까운) 번호에 붙임
     시설 점    빨간 점 + 가장 가까운 흰 바탕 라벨 글 → 이름
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, items, STYLE, RISKCFG, LEGEND, write } from './compose-lib.mjs';

const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!slug || !ARGS.pptx || !ARGS.png || !ARGS.sdm) { console.error('사용법: compose-auto.mjs <지역> --pptx=폴더 --png=PNG --sdm=폴더[,폴더] [--affine=json] [--pairs-only]'); process.exit(1); }
const PP = path.resolve(String(ARGS.pptx));
const SH = JSON.parse(fs.readFileSync(path.join(PP, 'shapes.json'), 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const me = (Array.isArray(idx) ? idx : idx.regions || Object.values(idx)).find(r => r.region === slug);
if (!me) { console.error('data/stats/index.json 에 없는 지역: ' + slug); process.exit(1); }
const LABEL2KEY = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 산업재해: 'industrial', 산재: 'industrial', 자살: 'suicide', 감염병: 'infection' };
const KEY2LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', industrial: '산업재해', suicide: '자살', infection: '감염병' };
const map = SH.map || { x: 0, y: 0, w: SH.pngW * 0.72, h: SH.pngW * 0.5 };
const inMap = (s) => s.x + s.w / 2 < map.x + map.w && s.y + s.h / 2 > map.y;
const center = (s) => [s.x + s.w / 2, s.y + s.h / 2];
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
const numsOf = (t) => [...t].filter(ch => CIRC.includes(ch)).map(ch => CIRC.indexOf(ch) + 1);
const norm = (t) => (t || '').replace(/\s+/g, '').replace(/[()（）·,.\-–~]/g, '');

/* ── 색 → 분야 (범례가 없을 때 예비) ─────────────────────────────── */
function kindOfColor(hex) {
  if (!hex) return null; const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 40) return null;
  if (r > 180 && g > 160 && b < 100) return 'traffic'; if (r > 200 && g > 90 && g < 170 && b < 90) return 'infection';
  if (r > 170 && g < 90 && b < 90) return 'industrial'; if (g > 110 && g >= r && g > b) return 'crime';
  if (b > 120 && r < 110 && g < 120 && b > 150 && (b + 40 < 256) && g > 70) return 'suicide'; if (b > 80 && r < 90 && g < 90) return b < 150 ? 'fire' : 'suicide';
  if (r > 90 && b > 120 && g < 90) return 'life'; return null;
}

/* ── 범례 ───────────────────────────────────────────────────────── */
const legendShape = SH.shapes.find(s => s.text.some(t => /^\[/.test(t)) && s.text.some(t => /[①-⑫]/.test(t)));
const legend = {};   // num → { type, place, safety }
if (legendShape) {
  let cur = null, last = null;
  for (const raw of legendShape.text) { const t = raw.trim();
    const h = t.match(/^\[(.+?)\]/); if (h) { cur = LABEL2KEY[h[1].replace(/\s/g, '')] || null; const rest = t.replace(/^\[.+?\]\s*/, ''); if (!rest) continue; }
    const body = t.replace(/^\[.+?\]\s*/, ''); const nums = numsOf(body);
    if (nums.length) { const txt = body.replace(/[①-⑫]/g, '').trim(); const pm = txt.match(/\(([^)]*)\)?/); const type = txt.replace(/\(.*$/, '').trim(); const place = pm ? pm[1].trim() : '';
      for (const n of nums) legend[n] = { type, place, safety: cur, nums }; last = nums; }
    else if (last && /^\(/.test(body)) { for (const n of last) legend[n].place = (legend[n].place + ' ' + body.replace(/[()]/g, '')).trim(); }   // 장소가 다음 줄로
  }
}
/* ── 번호 원 ───────────────────────────────────────────────────── */
const markers = SH.shapes.filter(s => s.kind === 'marker' && inMap(s)).map(s => ({ num: +s.text[0], at: center(s), color: s.fill, r: s.w / 2 }));
/* ── 상자 ─────────────────────────────────────────────────────── */
const boxes = SH.shapes.filter(s => s.kind === 'box').map(s => {
  const lines = s.text.map(t => t.trim()).filter(Boolean); let nums = numsOf(lines[0]); let i = 0;
  let title = lines[0].replace(/[①-⑫]/g, '').trim(); i = 1;
  let place = ''; const pm = title.match(/\((.*)\)?\s*$/); if (pm && /\(/.test(title)) { place = pm[1].replace(/\)$/, ''); title = title.replace(/\s*\(.*$/, '').trim(); }
  if (lines[i] && /^\(/.test(lines[i]) && !place) { place = lines[i].replace(/[()]/g, '').trim(); i++; }
  else if (lines[i] && /^\(/.test(lines[i])) { place += ' ' + lines[i].replace(/[()]/g, '').trim(); i++; }
  const its = lines.slice(i).map(t => t.replace(/^[-–·•▪]\s*/, '').trim()).filter(t => t && !/^\($/.test(t));
  /* 번호가 없으면 범례와 맞춤 (유형 + 장소 글자 겹침) */
  if (!nums.length) { let best = null, bs = 0; for (const [n, L] of Object.entries(legend)) { const a = norm(L.type + L.place), b = norm(title + place); let sc = 0; if (norm(L.type) && norm(title).includes(norm(L.type).slice(0, 4))) sc += 2; const pl = norm(L.place); if (pl && (b.includes(pl.slice(0, 4)) || a.includes(norm(place).slice(0, 4)) && norm(place))) sc += 3; if (sc > bs) { bs = sc; best = +n; } } if (best && bs >= 3) nums = legend[best].nums || [best]; }
  return { nums, title, place, items: its, box: s };
});
/* ── 존 목록: 범례 번호 ∪ 상자 번호 ∪ 마커 번호 ──────────────────── */
const allNums = [...new Set([...Object.keys(legend).map(Number), ...boxes.flatMap(b => b.nums), ...markers.map(m => m.num)])].sort((a, b) => a - b);
/* 같은 상자를 공유하는 번호 묶음(①②)은 존 하나 */
const groups = []; const seen = new Set();
for (const n of allNums) { if (seen.has(n)) continue; const b = boxes.find(b => b.nums.includes(n)); const g = b ? b.nums.filter(x => !seen.has(x)) : [n]; g.forEach(x => seen.add(x)); groups.push(g); }
/* 다각형 */
const polys = SH.shapes.filter(s => s.kind === 'zone' && inMap(s) && s.pts && s.pts.length >= 3);
const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const polyOwner = new Map();
for (const pg of polys) { const c = center(pg); let best = null, bd = Infinity;
  for (const m of markers) { const d = inside(m.at, pg.pts) ? 0 : Math.hypot(m.at[0] - c[0], m.at[1] - c[1]) - Math.max(pg.w, pg.h) / 2; if (d < bd) { bd = d; best = m; } }
  if (best && bd < 260) polyOwner.set(pg, best.num); else console.warn(`  ⚠ 주인 없는 윤곽 (${Math.round(c[0])},${Math.round(c[1])}) ${pg.w}×${pg.h} 선 ${pg.line}`); }
/* 시설 */
const labels = SH.shapes.filter(s => s.kind === 'text' && inMap(s) && s.fill === 'FFFFFF' && s.w < 600 && s.text.length <= 2 && s !== legendShape);
/* 점 ↔ 라벨은 가까운 짝부터 하나씩 묶습니다 (한 라벨이 두 점에 붙어 같은 이름이 두 번 나오는 것 방지 — 강진 2026-10-16) */
const poiShapes = SH.shapes.filter(s => s.kind === 'poi' && inMap(s));
const cand = []; for (const s of poiShapes) for (const l of labels) { const c = center(s), lc = center(l); cand.push({ s, l, d: Math.hypot(lc[0] - c[0], lc[1] - c[1]) }); }
cand.sort((a, b) => a.d - b.d); const usedL = new Set(), bestOf = new Map();
for (const x of cand) { if (x.d > 320 || usedL.has(x.l) || bestOf.has(x.s)) continue; usedL.add(x.l); bestOf.set(x.s, x.l); }
const pois = poiShapes.map(s => { const c = center(s); const best = bestOf.get(s) || null;
  let name = best ? best.text.join(' ') : (s.name.includes('_') && !/랜드마크|지점_영동교/.test(s.name) ? s.name.split('_').slice(1).join('_') : null);
  if (!name) return null; const side = best && center(best)[0] < c[0] ? 'left' : undefined; return { name, draftPx: [+c[0].toFixed(1), +c[1].toFixed(1)], side }; }).filter(Boolean);
if (ARGS['pairs-only']) { const pairs = pois.map(p => ({ px: p.draftPx, name: '^' + p.name.replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') })); fs.writeFileSync(path.join(PP, 'pairs.json'), JSON.stringify(pairs, null, 1)); console.log(`${slug}: 시설 ${pairs.length} → pairs.json`); process.exit(0); }

/* ── 제목 ─────────────────────────────────────────────────────── */
const t2 = SH.shapes.find(s => s.text.some(t => /중점관리분야 맞춤형 사업 종합도/.test(t)));
let subtitle = t2 ? t2.text.join(' ').replace(/.*종합도\s*/, '').trim() : '';
const focus = (me.focusTypes || []).map(l => LABEL2KEY[l] || l);
const focusLabel = focus.map(k => KEY2LABEL[k]).join(' · ');
subtitle = subtitle.replace(/\s*\|.*$/, '') + '  |  중점 3분야 · ' + focusLabel;

/* ── 정합 ─────────────────────────────────────────────────────── */
let af = null; if (ARGS.affine && fs.existsSync(String(ARGS.affine))) af = JSON.parse(fs.readFileSync(String(ARGS.affine), 'utf8'));
if (!af) console.warn('  ⚠ 정합값 없음 — frame 임시. fit 뒤 다시 돌리세요');
/* 지도 창: 구역·번호 원·시설이 모두 상자 사이 빈 띠(가로 520~1400 · 세로 60~1020)에 들어오도록 중심·폭을 정함 */
function frameFor(afx, opt = {}) {
  const pts = [...polys.filter(pg => polyOwner.has(pg)).flatMap(pg => pg.pts), ...markers.map(m => m.at), ...pois.map(p => p.draftPx)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const ext = pts.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [map.x, map.y, map.x + map.w, map.y + map.h];
  const cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
  const X = afx.a * cx + afx.b * cy + afx.c, Y = afx.b * cx - afx.a * cy + afx.d; const mpp = Math.hypot(afx.a, afx.b);
  const scalePx = Math.min(880 / Math.max(1, ext[2] - ext[0] + 80), 960 / Math.max(1, ext[3] - ext[1] + 80));   // 화면 px / 초안 px
  const widthMeters = Math.round(Math.min(1920 / scalePx, map.w * 2.2) * mpp * (opt.zoomOut || 1) / 10) * 10;
  return { width: 1920, height: 1080, widthMeters, center5179: [Math.round(X), Math.round(Y)], offset: opt.offset || [0, 0], zoom: 17, note: '구역 범위 ' + ext.map(Math.round).join(',') + ' 에 맞춤' };
}
/* ── 존 조립 + 상자 배치 ───────────────────────────────────────── */
const N = groups.length;
const compact = N >= 8;
const style = { ...STYLE, box: compact ? { pad: 11, fsT: 16, fsP: 11.5, fsI: 12, lh: 15.5, rowGap: 3, ic: 20 } : STYLE.box };
const slots = [];   // 배치 순서: 왼쪽 열 → 오른쪽 열 → 바닥
const leftN = N >= 10 ? 4 : 3, rightN = 3, bottomN = Math.max(0, N - leftN - rightN);
for (let i = 0; i < leftN; i++) slots.push({ col: 'L', i });
for (let i = 0; i < rightN; i++) slots.push({ col: 'R', i });
const bw = bottomN >= 3 ? 290 : 400, bx0 = 520, bgap = bottomN >= 3 ? 10 : 20;
for (let i = 0; i < bottomN; i++) slots.push({ col: 'B', i, x: bx0 + i * (bw + bgap), w: bw });
const zones = []; let prevL = null, prevR = null;
groups.forEach((g, gi) => {
  const n0 = g[0]; const L = legend[n0] || {}; const b = boxes.find(b => b.nums.includes(n0));
  const safety = L.safety || kindOfColor((markers.find(m => m.num === n0) || {}).color) || focus[0];
  const id = 'Z' + g.join('');
  const num = g.map(n => CIRC[n - 1]).join('');
  const type = (b && b.title) || L.type || '사업지', place = (b && b.place) || L.place || '';
  const mk = markers.filter(m => g.includes(m.num)).map(m => ({ label: String(m.num), at: { draftPx: [+m.at[0].toFixed(1), +m.at[1].toFixed(1)] } }));
  const pgs = polys.filter(pg => g.includes(polyOwner.get(pg))).map(pg => { const pc = kindOfColor(pg.line); const o = { draftPx: pg.pts }; if (pg.dash !== 'solid') o.dashed = true; if (pc && pc !== safety) o.color = pc; return o; });
  const slot = slots[gi] || { col: 'B', i: 0, x: 520, w: 400 };
  let box;
  if (slot.col === 'L') { box = prevL ? { x: 60, below: prevL, gap: 8, w: 440 } : { x: 60, top: 150, w: 440 }; prevL = id; }
  else if (slot.col === 'R') { box = prevR ? { x: 1420, below: prevR, gap: 8, w: 440 } : { x: 1420, top: 150, w: 440 }; prevR = id; }
  else box = { x: slot.x, bottom: 1050, w: slot.w };
  zones.push({ id, num, type, place, safety, markers: mk, polygons: pgs, box, items: items(b ? b.items : ['(설명 상자 없음 — 범례만 있음)']) });
  if (!b) console.warn(`  ⚠ ${num} 설명 상자 없음`); if (!mk.length) console.warn(`  ⚠ ${num} 번호 원 없음`); if (!pgs.length) console.warn(`  ⚠ ${num} 윤곽 없음`);
});
const name3 = (me.label || '').split(' ').pop();
const cfg = {
  region: slug, title: `${name3} 중점관리분야 맞춤형 사업 종합도`, subtitle,
  sdm: String(ARGS.sdm).includes(',') ? String(ARGS.sdm).split(',') : String(ARGS.sdm), survey: `data/raw/gis_0901/최종 조사지/${slug}_OverlapUnion_1.shp`,
  frame: af ? frameFor(af, { zoomOut: ARGS.zoomOut ? +ARGS.zoomOut : 1, offset: ARGS.offset ? String(ARGS.offset).split(',').map(Number) : [0, 0] }) : { width: 1920, height: 1080, widthMeters: 3000, offset: [0, 0], zoom: 17 },
  draft: { file: path.relative(ROOT, path.resolve(String(ARGS.png))).replace(/\\/g, '/'), width: SH.pngW, height: Math.round(SH.pngW * SH.slide.cy / SH.slide.cx), affine5179: af ? { a: af.a, b: af.b, c: af.c, d: af.d } : undefined, note: af ? (af.note || '자동 정합') : '정합 안 됨', pptx: path.relative(ROOT, PP).replace(/\\/g, '/') },
  style, risk: RISKCFG,
  labels: [],
  zones, pois, routes: [],
  keymap: { x: 60, y: 0, below: prevL, gap: 8, w: 440, h: 110, name: name3.replace(/구$/, ''), label: `${name3} 전체 · 지도 범위` },
  legend: LEGEND(focus, focus.map(k => KEY2LABEL[k])),
  legendPos: bottomN >= 2 ? { x: 1420, below: prevR, gap: 8, w: 440, rowH: 21, fs: 12.5 } : { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
/* 바닥 상자가 하나뿐이면 범례는 바닥 가운데(x 940), 둘이면 오른쪽 열 아래, 셋이면 역시 오른쪽 열 아래 */
write(slug, cfg);
console.log(`  존 ${N} (${groups.map(g => g.join('')).join(' ')}) · 상자 ${boxes.length} · 번호 원 ${markers.length} · 윤곽 ${polys.length} · 시설 ${pois.length} · 범례 ${Object.keys(legend).length}건 · 분야 ${focusLabel}`);
