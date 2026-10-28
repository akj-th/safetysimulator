/* ════════════════════════════════════════════════════════════════════
   41개 지자체 주요 거점 → data/stats/hotspots.json  (2026-10-20, 10/14 AURI 회의 ①)

   "복합위험지구 밖이라도 히트맵에서 밀도가 높은 거점은 거점별 1개씩 원인·대안을 제시" — 그 거점을
   사람이 눈으로 고르지 않고, 강원대 커널밀도 TIF(중점 3분야)에서 규칙으로 뽑아 지도(1단계)에 올립니다.
   규칙은 종합도와 같습니다(tools/overview-map/risk.mjs findHotspots):
     분야별 t = 값 ÷ 지자체 p99 (0~1)  →  분야 2개 이상 t ≥ minT 인 칸의 평균 점수  →  반경 radiusM 안 최대값만

   실행:  node tools/build-hotspots.mjs [--count=10] [--radius=400] [--cell=50] [--minScore=0.22] [--only=slug,slug]
   결과:  data/stats/hotspots.json  { generatedAt, rule, regions: { <slug>: [{ rank, lat, lng, score, parts:{분야:t}, inside }] } }
          lat/lng 는 WGS84 (지도용) · inside 는 조사지(복합위험지구) 안인지
   ⚠ 원본 TIF(data/raw/gis_0901/density/, 6.6GB)가 있어야 돌아갑니다. 결과 파일은 좌표·점수뿐이라 커밋해도 됩니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from './node_modules/proj4/dist/proj4-src.js';
import { readPolygons } from './lib/shapefile.mjs';
import { loadRaster, findHotspots, DEFAULTS } from './overview-map/risk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const P5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const OPT = { count: +(ARGS.count || 10), radiusM: +(ARGS.radius || 400), cellM: +(ARGS.cell || 50), minT: +(ARGS.minT || 0.15), minScore: +(ARGS.minScore || 0.22) };
const BASE_FIELDS = 3;   // minScore 를 맞춘 중점 분야 수 — 분야가 더 많으면 문턱을 3/N 로 (아래 findHotspots 부르는 곳)
const LABEL2KEY = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 산업재해: 'industrial', 자살: 'suicide', 감염병: 'infection' };

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const regions = (Array.isArray(idx) ? idx : idx.regions || Object.values(idx)).filter(r => !ARGS.only || String(ARGS.only).split(',').includes(r.region));
const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

const outFile = path.join(ROOT, 'data/stats/hotspots.json');
const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { regions: {} };
const out = { generatedAt: new Date().toISOString().slice(0, 10), rule: { ...OPT, note: '중점 분야 커널밀도(강원대 TIF)를 지자체 p99 로 0~1 정규화 → 2개 분야 이상 ≥minT 인 칸의 평균(중점 분야 수로 나눔) → 반경 radiusM 안 최대값. 문턱 minScore 는 3분야 기준이라 분야가 N개면 ×3/N. 점수는 지자체 안 상대값' }, regions: ARGS.only ? prev.regions || {} : {} };
for (const r of regions) {
  const t0 = Date.now(); const focus = (r.focusTypes || []).map(l => LABEL2KEY[l] || l);
  const layers = focus.map(k => loadRaster(ROOT, k, r.region, { topQuantile: DEFAULTS.topQuantile })).filter(Boolean);
  if (!layers.length) { console.log(`${r.region}: TIF 없음`); out.regions[r.region] = []; continue; }
  const ex = layers.map(L => L.extent); const bbox = [Math.max(...ex.map(e => e[0])), Math.max(...ex.map(e => e[1])), Math.min(...ex.map(e => e[2])), Math.min(...ex.map(e => e[3]))];
  /* ★ 2026-10-28 AURI 중점관리분야(지자체마다 3~6개): 점수는 중점 분야 전체의 평균이라 분야가 N개면 같은 자리도 3/N 로 낮아집니다.
     문턱(minScore)은 중점 3분야 때 맞춘 값이므로 같은 비율로 낮춰 "겹친 분야 밀도의 합" 기준을 분야 수와 상관없이 같게 둡니다
     (안 하면 6개 분야인 대구 중구 5→3곳·부산 동구 4→3곳). 순위는 그대로 점수 순 — 더 많은 중점 분야가 겹치는 자리가 위로 */
  const spots = findHotspots(layers, bbox, { ...OPT, minScore: OPT.minScore * Math.min(1, BASE_FIELDS / layers.length) });
  const svPath = path.join(ROOT, 'data/raw/gis_0901/최종 조사지', `${r.region}_OverlapUnion_1.shp`);
  const sv = fs.existsSync(svPath) ? readPolygons(svPath) : [];
  out.regions[r.region] = spots.map((h, i) => { const [lng, lat] = proj4(P5186, 'EPSG:4326', [h.x, h.y]); const parts = {}; for (const [k, v] of Object.entries(h.parts)) parts[k] = v;
    return { rank: i + 1, lat: +lat.toFixed(6), lng: +lng.toFixed(6), score: h.score, parts, inside: sv.some(s => s.rings.some(ring => inside([h.x, h.y], ring))) }; });
  console.log(`${r.region}: 분야 ${layers.map(L => L.label).join('·')} → 거점 ${spots.length} (조사지 안 ${out.regions[r.region].filter(h => h.inside).length}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('→ data/stats/hotspots.json', (fs.statSync(outFile).size / 1024).toFixed(0) + 'KB');
