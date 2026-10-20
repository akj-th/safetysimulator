/* 정합(affine)을 바꾼 뒤 지도 창을 사업지에 다시 맞춥니다 (2026-10-20)
   사업지 다각형·번호 원·시설(draftPx)을 새 affine 으로 5179 에 놓고, 그 범위가 상자 사이 띠
   (가로 520~1400px · 세로 60~1020px of 1920×1080)에 들어오도록 중심·폭을 정합니다.
     node tools/overview-map/reframe.mjs <지역> [--margin=1.08] [--write]   */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const cfgPath = path.join(HERE, 'regions', slug + '.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const A = cfg.draft && cfg.draft.affine5179; if (!A) { console.error('affine 없음'); process.exit(1); }
const T = ([x, y]) => [A.a * x + (A.b || 0) * y + A.c, (A.b || 0) * x - A.a * y + A.d];
const pts = [];
for (const z of cfg.zones || []) {
  for (const pg of z.polygons || []) { if (pg.draftPx) pts.push(...pg.draftPx.map(T)); else if (pg.epsg5179) pts.push(...pg.epsg5179); }
  for (const m of z.markers || []) { const a = m.at || m; if (a.draftPx) pts.push(T(a.draftPx)); else if (a.epsg5179) pts.push(a.epsg5179); }
}
for (const p of cfg.pois || []) { if (p.draftPx) pts.push(T(p.draftPx)); else if (p.epsg5179) pts.push(p.epsg5179); }
if (!pts.length) { console.error('좌표 없음'); process.exit(1); }
const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
const margin = +(ARGS.margin || 1.08);
const widthMeters = Math.ceil(Math.max(bw / (880 / 1920), bh * (1920 / 960), 1200) * margin / 10) * 10;
console.log(`[${slug}] 사업지 범위 ${bw.toFixed(0)}×${bh.toFixed(0)} m → 중심 (${cx.toFixed(0)}, ${cy.toFixed(0)}) · 폭 ${widthMeters} m (전 ${cfg.frame.widthMeters} m)`);
if (ARGS.write) {
  cfg.frame.center5179 = [Math.round(cx), Math.round(cy)]; cfg.frame.widthMeters = widthMeters; cfg.frame.offset = [0, 0]; delete cfg.frame.center; delete cfg.frame.zoomOut;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n'); console.log('→ frame 갱신');
}
