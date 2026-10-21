/* ════════════════════════════════════════════════════════════════════
   행정동 경계 (vuski/admdongkor HangJeongDong_ver20261001.geojson) — 2026-10-21
   data/raw/admin_boundary_hjd/*.geojson (WGS84) 를 읽어 시군구(sgg 코드)별로 묶고, 좌표를 EPSG:5186 으로 바꿔
   shapefile.mjs 와 같은 shape 꼴({ rings, bbox })로 돌려줍니다. build-dong-hea.mjs · build-stats.mjs 가 함께 씁니다.
     hjdGroups()                → [{ code, file, version, byName: { 행정동: [shape…] }, bbox }]
     pickGroups(groups, pts)    → 표본 좌표(5186)의 share 이상이 떨어지는 묶음만 (옛/새 판 중복 제거)
     makeAssigner(byName)       → (x, y) => 행정동 이름 | null   (bbox 선별 + 마지막 적중 캐시)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import proj4 from 'proj4';
import { pointInShape, inBBox } from './shapefile.mjs';

const EPSG5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const toGrid = proj4('WGS84', EPSG5186);

let _groups = null;
export function hjdGroups(dir) {
  if (_groups) return _groups;
  _groups = [];
  if (!fs.existsSync(dir)) return _groups;
  for (const f of fs.readdirSync(dir).filter((x) => /\.geojson$/i.test(x))) {
    const gj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const version = (/ver(\d{8})/.exec(f) || [])[1] || '00000000';
    const by = {};
    for (const ft of gj.features || []) {
      const p = ft.properties || {};
      const code = String(p.sgg || '').trim();
      const name = String(p.adm_nm || '').trim().split(/\s+/).pop();
      if (!code || !name || !ft.geometry) continue;
      const polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.type === 'MultiPolygon' ? ft.geometry.coordinates : [];
      const g = (by[code] ||= { code, file: f, version, byName: {}, bbox: [Infinity, Infinity, -Infinity, -Infinity] });
      for (const poly of polys) {
        const rings = poly.map((ring) => ring.map(([lng, lat]) => toGrid.forward([lng, lat])));
        const bbox = [Infinity, Infinity, -Infinity, -Infinity];
        for (const ring of rings) for (const [x, y] of ring) { if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y; if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y; }
        (g.byName[name] ||= []).push({ rings, bbox });
        g.bbox = [Math.min(g.bbox[0], bbox[0]), Math.min(g.bbox[1], bbox[1]), Math.max(g.bbox[2], bbox[2]), Math.max(g.bbox[3], bbox[3])];
      }
    }
    _groups.push(...Object.values(by));
  }
  return _groups;
}

const inShapes = (x, y, shapes) => shapes.some((sh) => inBBox(x, y, sh.bbox) && pointInShape(x, y, sh));

/** 표본 좌표(5186)의 share 이상이 떨어지는 시군구 묶음 */
export function pickGroups(groups, samplePts, share = 0.05) {
  const hits = [];
  for (const g of groups) {
    let c = 0;
    for (const [x, y] of samplePts) {
      if (!inBBox(x, y, g.bbox)) continue;
      if (Object.values(g.byName).some((shs) => inShapes(x, y, shs))) c++;
    }
    if (samplePts.length && c / samplePts.length >= share) hits.push({ g, share: c / samplePts.length });
  }
  hits.sort((a, b) => b.g.version.localeCompare(a.g.version) || b.share - a.share);
  const picked = [];
  for (const h of hits) {
    const names = Object.keys(h.g.byName);
    if (!picked.some((p) => names.filter((n) => p.g.byName[n]).length >= names.length * 0.8)) picked.push(h);
  }
  return picked;
}

/** { 이름: [shape…] } → (x, y) => 이름 | null */
export function makeAssigner(byName) {
  const zones = Object.entries(byName).map(([name, shapes]) => ({ name, shapes, bbox: shapes.reduce((b, sh) => [Math.min(b[0], sh.bbox[0]), Math.min(b[1], sh.bbox[1]), Math.max(b[2], sh.bbox[2]), Math.max(b[3], sh.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]) }));
  let last = null;
  return (x, y) => {
    if (last && inBBox(x, y, last.bbox) && inShapes(x, y, last.shapes)) return last.name;
    for (const z of zones) { if (!inBBox(x, y, z.bbox)) continue; if (inShapes(x, y, z.shapes)) { last = z; return z.name; } }
    return null;
  };
}
