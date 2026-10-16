/* ════════════════════════════════════════════════════════════════════
   PPTX 판(2026-10-15~) 지자체 한 곳을 끝까지: 도형 추출 → 시설 정합 → 건물 정합 → 설정 조립 → SVG → 스크린샷

   실행:  node tools/overview-map/run-pptx-region.mjs <지역> --pptx=<폴더> --png=<PNG> --sdm=<폴더[,폴더]> [--zoomOut=] [--offset=] [--no-build]
   결과:  regions/<지역>.json · output/overview-map/<지역>/… · <pptx>/affine.json · <pptx>/run.log
   정합 순서
     ① fit-final  : 시설 점 이름 ↔ 건물 ANNO (2점 이상 맞고 최대 잔차 < 200m 이면 채택)
     ② fit-buildings : ①의 축척·앵커로 건물 윤곽 겹침 탐색(±5%·±5°). 겹침 ≥ 18% 면 ② 채택, 아니면 ① 유지
     ①이 안 되면 ②를 넓게(축척 ±30%, 앵커 = 조사지 중심 ↔ 구역 중심) 돌리고 "확인 필요" 표시
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import proj4 from '../node_modules/proj4/dist/proj4-src.js';
import { readPolygons } from '../lib/shapefile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!slug || !ARGS.pptx || !ARGS.png || !ARGS.sdm) { console.error('사용법 참조(파일 머리)'); process.exit(1); }
const PP = path.resolve(String(ARGS.pptx)), PNG = path.resolve(String(ARGS.png));
const log = []; const say = (s) => { console.log(s); log.push(s); };
const run = (args, opts = {}) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts }); const out = (r.stdout || '') + (r.stderr || ''); log.push('$ node ' + args.join(' ') + '\n' + out); return { ok: r.status === 0, out }; };
const SH = JSON.parse(fs.readFileSync(path.join(PP, 'shapes.json'), 'utf8'));
const P5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const P5179 = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

/* --reuse : 정합을 다시 하지 않고 affine.json 을 그대로 씀 (레이아웃만 고칠 때) */
const AFJ = path.join(PP, 'affine.json');
let af = null, note = '';
if (ARGS.reuse && fs.existsSync(AFJ)) { af = JSON.parse(fs.readFileSync(AFJ, 'utf8')); say('  정합 재사용: ' + af.note); }
else {
/* ① 시설 정합 */
run([path.join(HERE, 'compose', 'compose-auto.mjs'), slug, `--pptx=${PP}`, `--png=${PNG}`, `--sdm=${ARGS.sdm}`, '--pairs-only']);
const fitJson = path.join(PP, 'fit-final.json'); if (fs.existsSync(fitJson)) fs.unlinkSync(fitJson);
const r1 = run([path.join(HERE, 'fit-final.mjs'), slug, `--sdm=${ARGS.sdm}`, `--pairs=${path.join(PP, 'pairs.json')}`, `--json=${fitJson}`]);
if (fs.existsSync(fitJson)) { const f = JSON.parse(fs.readFileSync(fitJson, 'utf8')); const good = f.pairs.filter(p => p.resid < 200); say(`  ① 시설 정합: ${f.pairs.length}점 (잔차<200m ${good.length}) · 축척 ${f.mpp.toFixed(3)} m/px · 회전 ${f.rot.toFixed(1)}° · 최대 잔차 ${f.worst.toFixed(0)}m`);
  if (good.length >= 2 && f.worst < 400 && Math.abs(f.rot) <= 12) { af = f; note = `시설 ${f.pairs.length}점 정합(최대 잔차 ${f.worst.toFixed(0)}m${f.pairs.length === 2 ? ' · 2점이라 회전 0 고정' : ''})`; }
  else if (f.pairs.length >= 2) { /* 잔차가 큰 짝을 빼고 다시 */ const keep = f.pairs.filter(p => p.resid < 400); if (keep.length >= 2) { fs.writeFileSync(path.join(PP, 'pairs2.json'), JSON.stringify(keep.map(p => ({ px: p.px, at5179: p.at, name: p.name })))); const r2 = run([path.join(HERE, 'fit-final.mjs'), slug, `--sdm=${ARGS.sdm}`, `--pairs=${path.join(PP, 'pairs2.json')}`, `--json=${fitJson}`]); const f2 = JSON.parse(fs.readFileSync(fitJson, 'utf8')); say(`  ①′ 잔차 큰 짝 제외 ${keep.length}점: 최대 잔차 ${f2.worst.toFixed(0)}m`); if (f2.worst < 400) { af = f2; note = `시설 ${keep.length}점 정합(최대 잔차 ${f2.worst.toFixed(0)}m)`; } } } }
else say('  ① 시설 정합 실패: ' + r1.out.split('\n').filter(l => /⚠|필요|짝/.test(l)).join(' / '));

/* ② 건물 정합 */
const mapw = SH.map ? (SH.map.x + SH.map.w) / SH.pngW : 0.72;
const bJson = path.join(PP, 'fit-buildings.json'); if (fs.existsSync(bJson)) fs.unlinkSync(bJson);
let anchor, mpp, extra = [];
if (af) { const p = af.pairs.sort((a, b) => a.resid - b.resid)[0]; const X = af.a * p.px[0] + af.b * p.px[1] + af.c, Y = af.b * p.px[0] - af.a * p.px[1] + af.d; anchor = `${p.px[0]},${p.px[1]},${X},${Y}`; mpp = af.mpp; extra = ['--range=150', '--rot=5', '--kr=0.06']; }
else {
  /* 조사지 중심 ↔ 구역(번호 원) 중심, 축척은 추정 */
  const sv = readPolygons(path.join(ROOT, `data/raw/gis_0901/최종 조사지/${slug}_OverlapUnion_1.shp`))[0];
  const c86 = [(sv.bbox[0] + sv.bbox[2]) / 2, (sv.bbox[1] + sv.bbox[3]) / 2]; const c79 = proj4(P5186, P5179, c86);
  const mk = SH.shapes.filter(s => s.kind === 'marker'); const cx = mk.reduce((a, s) => a + s.x + s.w / 2, 0) / Math.max(1, mk.length), cy = mk.reduce((a, s) => a + s.y + s.h / 2, 0) / Math.max(1, mk.length);
  anchor = `${cx.toFixed(0)},${cy.toFixed(0)},${c79[0].toFixed(1)},${c79[1].toFixed(1)}`; mpp = +(ARGS.mpp || 0.8); extra = ['--range=500', '--rot=6', '--kr=0.3'];
  say(`  ① 없음 → 조사지 중심 앵커 ${anchor} · 축척 가정 ${mpp}`);
}
const r3 = run([path.join(HERE, 'fit-buildings.mjs'), slug, `--sdm=${ARGS.sdm}`, `--img=${PNG}`, `--mpp=${mpp}`, `--anchor=${anchor}`, `--mapw=${mapw.toFixed(3)}`, `--json=${bJson}`, ...extra]);
if (fs.existsSync(bJson)) { const b = JSON.parse(fs.readFileSync(bJson, 'utf8')); say(`  ② 건물 정합: 겹침 ${(b.overlap * 100).toFixed(1)}% · 축척 ${b.mpp.toFixed(3)} · 회전 ${b.rot.toFixed(1)}° · 이동 (${b.dx},${b.dy})m`);
  /* 시골은 건물이 적어 겹침률이 낮게 나옵니다 — 시설 정합이 있으면 12%, 없으면 15% 면 받아들이되 기록에 남김 */
  const accept = af ? b.overlap >= 0.12 : b.overlap >= 0.15;
  if (accept) { af = { ...b, note: `건물 윤곽 정합(겹침 ${(b.overlap * 100).toFixed(0)}%)` + (note ? ' · ' + note : ' · 시설 정합 없음 — 확인 필요') }; }
  else if (af) af.note = note + ` · 건물 겹침 ${(b.overlap * 100).toFixed(0)}% 라 시설 정합 유지`;
  else { af = { ...b, note: `⚠ 확인 필요 — 시설 정합 없음, 건물 겹침 ${(b.overlap * 100).toFixed(0)}%` }; }
} else say('  ② 건물 정합 실패: ' + r3.out.slice(-300));
fs.writeFileSync(AFJ, JSON.stringify(af, null, 1));
say(`  정합 채택: ${af.note}`);
}

/* ③ 설정 → ④ SVG → ⑤ 스크린샷 */
const r4 = run([path.join(HERE, 'compose', 'compose-auto.mjs'), slug, `--pptx=${PP}`, `--png=${PNG}`, `--sdm=${ARGS.sdm}`, `--affine=${path.join(PP, 'affine.json')}`, ...(ARGS.zoomOut ? [`--zoomOut=${ARGS.zoomOut}`] : []), ...(ARGS.offset ? [`--offset=${ARGS.offset}`] : [])]);
say(r4.out.trim().split('\n').map(l => '  ' + l).join('\n'));
if (!ARGS['no-build']) {
  const r5 = run([path.join(HERE, 'build-overview-map.mjs'), slug], { timeout: 900000 });
  say(r5.ok ? '  ' + r5.out.trim().split('\n').slice(-3).join('\n  ') : '  ⚠ 생성 실패\n' + r5.out.slice(-600));
  const svg = path.join(ROOT, 'output', 'overview-map', slug, `${slug}_종합도.svg`), shot = path.join(PP, `${slug}.png`);
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));
  if (chrome && fs.existsSync(svg)) { spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1920,1080', `--screenshot=${shot}`, 'file:///' + svg.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 120000 }); say('  스크린샷 → ' + shot); }
}
fs.writeFileSync(path.join(PP, 'run.log'), log.join('\n'));
