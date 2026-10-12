/* ════════════════════════════════════════════════════════════════════
   AURI 최종 종합도 이미지(px) ↔ EPSG:5179 정합 — 시설 점과 건물 이름(ANNO)으로

   최종본에는 해안선이 거의 없어(내륙 지자체) fit-draft.mjs 의 바다색 맞춤을 쓸 수 없습니다.
   대신 이미지의 빨간 시설 점(px)과 연속수치지형도 건물 레이어의 같은 이름 건물(5179)을
   짝지어 **회전 포함 유사변환**을 최소제곱으로 풉니다.

     X = a·x + b·y + c
     Y = b·x − a·y + d        (y 축이 뒤집히므로 두 번째 줄 부호가 다릅니다)

   실행
     node tools/overview-map/fit-final.mjs <지역> --sdm=data/raw/SDM_5K/47230_yeongcheon --find=영천시청,하나로마트
         → 이름이 맞는 건물과 중심 좌표(5179)를 나열 (정규식 · 여러 개면 쉼표)
     node tools/overview-map/fit-final.mjs <지역> --sdm=… --pairs=<짝 JSON> [--write]
         짝 JSON: [{ "px": [x, y], "name": "영천시청" }, { "px": [x, y], "at5179": [X, Y] }, …]
         → a·b·c·d · 축척(m/px) · 회전각 · 짝마다 잔차(m). --write 면 regions/<지역>.json 의 draft.affine5179 에 적음
     --sdm 을 생략하면 regions/<지역>.json 의 sdm 을 씁니다(폴더 여러 개면 쉼표).
   같은 이름 건물이 여러 동이면(아파트 단지) 전부의 평균 중심을 씁니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbf, readPolygons } from '../lib/shapefile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!slug) { console.error('사용법: node fit-final.mjs <지역> --sdm=폴더[,폴더] (--find=이름,이름 | --pairs=짝.json [--write])'); process.exit(1); }

const cfgPath = path.join(HERE, 'regions', slug + '.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : null;
const sdm = ARGS.sdm ? String(ARGS.sdm).split(',') : cfg ? (Array.isArray(cfg.sdm) ? cfg.sdm : [cfg.sdm]) : null;
if (!sdm) { console.error('--sdm 또는 regions/<지역>.json 이 필요합니다'); process.exit(1); }

/* 건물 레이어(B0010000) 전부 읽기 — 이름 있는 것만 */
const buildings = [];
for (const sd of sdm) {
  const dir = path.join(ROOT, sd);
  for (const d of fs.readdirSync(dir)) {
    const sub = path.join(dir, d); if (!fs.statSync(sub).isDirectory()) continue;
    const shp = fs.readdirSync(sub).find(f => /\.shp$/i.test(f) && f.includes('B0010000')); if (!shp) continue;
    const shapes = readPolygons(path.join(sub, shp)), rows = readDbf(path.join(sub, shp.replace(/\.shp$/i, '.dbf')), { encoding: 'auto' });
    shapes.forEach((s, i) => { const r = rows[i] || {}; const name = String(r.ANNO || '').trim(); if (!name) return;
      buildings.push({ name, x: (s.bbox[0] + s.bbox[2]) / 2, y: (s.bbox[1] + s.bbox[3]) / 2, rdnm: r.RDNM, bonu: r.BONU }); });
  }
}
console.log(`건물 ${buildings.length}동 (이름 있는 것) · 폴더 ${sdm.join(', ')}`);

const matches = (pat) => { const re = new RegExp(pat.replace(/\s+/g, '')); return buildings.filter(b => re.test(b.name.replace(/\s+/g, ''))); };
const centerOf = (list) => [list.reduce((a, b) => a + b.x, 0) / list.length, list.reduce((a, b) => a + b.y, 0) / list.length];

if (ARGS.find) {
  for (const pat of String(ARGS.find).split(',')) {
    const m = matches(pat);
    console.log(`\n"${pat}" → ${m.length}동`);
    /* 같은 이름끼리 묶어 보여 줌 (단지는 동 여러 개) */
    const groups = new Map(); for (const b of m) { const g = groups.get(b.name) || []; g.push(b); groups.set(b.name, g); }
    for (const [name, g] of [...groups.entries()].slice(0, 25)) { const c = centerOf(g); console.log(`   ${name}  ×${g.length}  중심 5179 [${c[0].toFixed(1)}, ${c[1].toFixed(1)}]  (${g[0].rdnm || ''} ${g[0].bonu || ''})`); }
    if (groups.size > 25) console.log('   … 외', groups.size - 25, '종');
  }
  process.exit(0);
}

if (!ARGS.pairs) { console.error('--find 또는 --pairs 가 필요합니다'); process.exit(1); }
const pairs = JSON.parse(fs.readFileSync(path.resolve(String(ARGS.pairs)), 'utf8'));
const P = [];
for (const p of pairs) {
  let at = p.at5179;
  if (!at) { const m = matches(p.name); if (!m.length) { console.warn(`  ⚠ "${p.name}" 건물 없음 — 건너뜀`); continue; } at = centerOf(m); p._n = m.length; }
  P.push({ px: p.px, at, name: p.name || 'at5179', n: p._n || 1 });
}
if (P.length < 2) { console.error('짝이 2개 이상 필요합니다 (회전·축척·이동을 풀려면)'); process.exit(1); }

/* 최소제곱: 미지수 (a, b, c, d) — 행마다 두 식 */
const N = 4, A = Array.from({ length: N }, () => new Array(N).fill(0)), B = new Array(N).fill(0);
const addRow = (row, rhs) => { for (let i = 0; i < N; i++) { B[i] += row[i] * rhs; for (let j = 0; j < N; j++) A[i][j] += row[i] * row[j]; } };
for (const { px: [x, y], at: [X, Y] } of P) { addRow([x, y, 1, 0], X); addRow([-y, x, 0, 1], Y); }
/* 가우스 소거 */
for (let i = 0; i < N; i++) { let piv = i; for (let r = i + 1; r < N; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r; [A[i], A[piv]] = [A[piv], A[i]]; [B[i], B[piv]] = [B[piv], B[i]];
  for (let r = 0; r < N; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < N; c++) A[r][c] -= f * A[i][c]; B[r] -= f * B[i]; } }
const [a, b, c, d] = B.map((v, i) => v / A[i][i]);
const scaleM = Math.hypot(a, b), rot = Math.atan2(b, a) * 180 / Math.PI;
console.log(`\naffine5179  a=${a}  b=${b}  c=${c}  d=${d}`);
console.log(`축척 ${scaleM.toFixed(4)} m/px · 회전 ${rot.toFixed(2)}°`);
let worst = 0;
for (const { px: [x, y], at: [X, Y], name, n } of P) { const ex = a * x + b * y + c, ey = b * x - a * y + d; const r = Math.hypot(ex - X, ey - Y); worst = Math.max(worst, r); console.log(`   ${name}${n > 1 ? ' ×' + n : ''}  잔차 ${r.toFixed(1)} m`); }
console.log(`최대 잔차 ${worst.toFixed(1)} m`);
if (ARGS.write) {
  if (!cfg) { console.error('regions/' + slug + '.json 이 없어 못 적습니다'); process.exit(1); }
  cfg.draft = cfg.draft || {}; cfg.draft.affine5179 = { a, b, c, d };
  cfg.draft.note = `최종본 정합 ${new Date().toISOString().slice(0, 10)} — 시설 ${P.length}점 유사변환(축척 ${scaleM.toFixed(3)} m/px · 회전 ${rot.toFixed(1)}°), 최대 잔차 ${worst.toFixed(0)}m`;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); console.log('→ ' + cfgPath + ' 의 draft.affine5179 갱신');
}
