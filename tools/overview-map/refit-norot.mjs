/* ════════════════════════════════════════════════════════════════════
   정합 다시 — 회전 0 고정 (2026-10-20)

   AURI 최종 이미지는 웹지도(네이버) 화면 캡처라 북쪽이 위입니다. 그런데 자동 정합(fit-final 3점↑ / fit-buildings)이
   4~7° 회전을 찾아낸 지자체가 많았고(안동은 −180°), 그 회전 때문에 화면 가장자리의 사업지가 수백 m 씩 밀려
   "엉뚱한 곳"에 그려졌습니다(담당자 지적). 회전을 0 으로 묶고 이동·축척만 다시 찾습니다.

     node tools/overview-map/refit-norot.mjs <지역> [--range=400] [--kr=0.08] [--write]
   지금 affine 을 출발점(앵커·축척)으로 삼아 fit-buildings 를 --rot=0 으로 돌리고, 겹침이 더 좋거나 같으면 적습니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const cfgPath = path.join(HERE, 'regions', slug + '.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const D = cfg.draft || {};
const A = D.affine5179;
if (!A || !D.file) { console.error('draft.affine5179 / draft.file 없음'); process.exit(1); }
const img = path.join(ROOT, D.file);
if (!fs.existsSync(img)) { console.error('이미지 없음: ' + img); process.exit(1); }
const b = fs.readFileSync(img); const W = b.readUInt32BE(16), H = b.readUInt32BE(20);
const cx = W / 2, cy = H / 2;
/* --survey : 앵커를 지금 affine 이 아니라 '이미지 중심 ↔ 대상지(우리가 뽑은 경계) 중심' 으로. 지금 affine 이 크게 틀렸을 때 */
let anchorXY = null;
if (ARGS.survey) {
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/overview-map', slug, slug + '_대상지.geojson'), 'utf8'));
  const pts = gj.features.flatMap(ft => ft.geometry.coordinates[0]);
  const lng = pts.reduce((t, p) => t + p[0], 0) / pts.length, lat = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const proj4 = (await import('../node_modules/proj4/dist/proj4-src.js')).default;
  const P5179 = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
  anchorXY = proj4('EPSG:4326', P5179, [lng, lat]);
}
/* 지금 affine 으로 이미지 중심이 어디인지 — 회전을 빼고 그 자리를 앵커로 */
const s = Math.hypot(A.a, A.b || 0);
const X = anchorXY ? anchorXY[0] : A.a * cx + (A.b || 0) * cy + A.c, Y = anchorXY ? anchorXY[1] : (A.b || 0) * cx - A.a * cy + A.d;
const mpp = +(ARGS.mpp || s.toFixed(4));
console.log(`[${slug}] 이미지 ${W}×${H} · 지금 축척 ${s.toFixed(4)} m/px · 회전 ${(Math.atan2(A.b || 0, A.a) * 180 / Math.PI).toFixed(1)}° → 앵커 (${cx},${cy}) ↔ (${X.toFixed(1)}, ${Y.toFixed(1)})`);
const out = path.join(process.env.TEMP || '/tmp', `refit_${slug}.json`);
const args = [path.join(HERE, 'fit-buildings.mjs'), slug, `--mpp=${mpp}`, `--anchor=${cx},${cy},${X.toFixed(1)},${Y.toFixed(1)}`, `--range=${ARGS.range || 400}`, '--rot=0', `--kr=${ARGS.kr || 0.08}`, `--json=${out}`];
if (ARGS.thr) args.push(`--thr=${ARGS.thr}`);
const log = execFileSync('node', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
console.log(log.trim().split('\n').slice(-3).join('\n'));
const r = JSON.parse(fs.readFileSync(out, 'utf8'));
const kr = +(ARGS.kr || 0.08); const hitEdge = Math.abs(r.mpp / mpp - 1) >= kr - 0.004;
console.log(`→ 회전 0 · 축척 ${r.mpp.toFixed(4)} m/px(×${(r.mpp / mpp).toFixed(3)}${hitEdge ? ' ⚠ 탐색 한계' : ''}) · 겹침 ${(r.overlap * 100).toFixed(1)}%`);
if (ARGS.write) {
  cfg.draft.affine5179_prev = A;
  cfg.draft.affine5179 = { a: r.mpp, b: 0, c: r.c, d: r.d };   // 회전 0 이니 a = 축척 그대로
  cfg.draft.note = `회전 0 재정합 ${new Date().toISOString().slice(0, 10)} — 건물 윤곽 겹침 ${(r.overlap * 100).toFixed(0)}% (축척 ${r.mpp.toFixed(4)} m/px) · 이전 값은 affine5179_prev`;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log('→ regions/' + slug + '.json 갱신');
}
