/* ════════════════════════════════════════════════════════════════════
   종합도 정합 검증·보정 — 시설 이름으로 (2026-10-23, 이은석 박사 "종합도 오버레이가 한 블록 서쪽으로 밀림")

   지자체마다 AURI 종합도의 시설 점(pois, 이미지 px)을 지금 affine 으로 EPSG:5179 에 놓고, 건물 레이어(ANNO)에서
   같은 이름의 건물을 찾아 "건물 − 시설" 벡터를 모읍니다. 여러 시설이 같은 벡터(120m 안)를 가리키면 그것이
   affine 의 이동 오차입니다(회전 0 · 축척은 축척 막대값 그대로 두고 c·d 만 보정). 건물 겹침 정합(refit-norot)이
   잘못된 극값에 빠진 지자체(북구 1.3km · 미추홀 0.8km)를 이렇게 잡아냅니다.

     node tools/overview-map/check-pois.mjs [지역 ...] [--write] [--min=2]
   --write 를 주면 지지 시설 ≥ min(기본 2)인 지자체의 draft.affine5179.c/d 를 보정하고 이전 값을 affine5179_prev2 에 남깁니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbf, readPolygons } from '../lib/shapefile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const ARGS = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MIN = +(ARGS.min || 2), TOL = +(ARGS.tol || 150), SEARCH = +(ARGS.search || 5000);

const norm = (s) => String(s || '').replace(/\(.*?\)/g, '').replace(/[\s·.,]/g, '').replace(/(일대|인근|앞|주변|부근)$/, '');
const GENERIC = /^(다이소|편의점|주차장|공원|시장|아파트|빌라|학교|병원|약국|교회|마트)$/;

const cache = {};
function buildings(sdm) {
  const dirs = Array.isArray(sdm) ? sdm : [sdm]; const key = dirs.join('|'); if (cache[key]) return cache[key];
  const out = [];
  for (const d of dirs) {
    const base = path.join(ROOT, d); if (!fs.existsSync(base)) continue;
    const sub = fs.readdirSync(base).find((x) => /B0010000$/.test(x)); if (!sub) continue;
    const shp = path.join(base, sub, 'N3A_B0010000.shp');
    const polys = readPolygons(shp), rows = readDbf(shp.replace(/\.shp$/i, '.dbf'), { encoding: 'auto' });
    polys.forEach((p, i) => { const name = String((rows[i] || {}).ANNO || '').trim(); if (!name) return; const bb = p.bbox; out.push({ name, n: norm(name), x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 }); });
  }
  return (cache[key] = out);
}

const files = fs.readdirSync(path.join(HERE, 'regions')).filter((f) => f.endsWith('.json') && !/draft/.test(f)).map((f) => f.replace('.json', '')).filter((s) => !only.length || only.includes(s));
for (const slug of files) {
  const cfgPath = path.join(HERE, 'regions', slug + '.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const A0 = cfg.draft && cfg.draft.affine5179; const A = A0 && A0.a == null && A0.s != null ? { a: A0.s, b: 0, c: A0.c, d: A0.d } : A0; const pois = cfg.pois || [];   // 남해 옛 형식 {s,c,d}
  if (!A || !pois.length) { console.log(`${slug.padEnd(11)} 시설 없음`); continue; }
  const B = buildings(cfg.sdm);
  const at = (px) => [A.a * px[0] + (A.b || 0) * px[1] + A.c, (A.b || 0) * px[0] - A.a * px[1] + A.d];
  const votes = [];   // { poi, v:[dx,dy], bname }
  for (const p of pois) {
    const px = p.draftPx || (p.epsg5179 ? null : null); if (!px) continue;
    const n = norm(p.name); if (n.length < 2 || GENERIC.test(n)) continue;
    const [X, Y] = at(px);
    /* '첫마을 2·3·4·5단지' → 첫마을2단지·첫마을3단지… / '서망항 수협 위판장' → 전체·마지막 낱말 */
    const variants = new Set([n, n.replace(/초등학교$/, '초교'), n.replace(/중학교$/, '중교')]); const m = p.name.match(/^(.*?)s*([d·]+)(단지|동|차)s*$/); if (m) m[2].split('·').forEach((k) => variants.add(norm(m[1]) + k + m[3]));
    const words = p.name.replace(/(.*?)/g, '').trim().split(/s+/); if (words.length >= 2) { const last = norm(words[words.length - 1]); if (last.length >= 3 && !GENERIC.test(last)) variants.add(last); }
    const head = n.slice(0, 2), tail = n.slice(-2);   // '안덕면보건지소' ↔ '안덕보건지소' 처럼 가운데가 다른 이름
    const cands = B.filter((b) => !(/교회$/.test(b.n) && !/교회$/.test(n)) && !(/정류장$/.test(b.n) && !/정류장$/.test(n)) && ([...variants].some((v) => b.n.includes(v) || (v.length >= 4 && v.includes(b.n) && b.n.length >= 3)) || (n.length >= 5 && b.n.length >= 5 && b.n.startsWith(head) && b.n.endsWith(tail))) && Math.hypot(b.x - X, b.y - Y) <= SEARCH);
    for (const b of cands) votes.push({ poi: p.name, v: [b.x - X, b.y - Y], bname: b.name });
  }
  if (ARGS.verbose) { const byPoi = {}; for (const v of votes) (byPoi[v.poi] = byPoi[v.poi] || []).push(v); for (const [k, arr] of Object.entries(byPoi)) console.log('   ', k, arr.slice(0, 6).map((v) => v.bname + '(' + v.v.map((n) => n.toFixed(0)).join(',') + ')').join(' ')); }
  /* 가장 많은 시설이 지지하는 벡터 (시설 하나는 한 표) */
  let best = null;
  for (const v of votes) {
    const sup = new Map();
    for (const w of votes) if (Math.hypot(w.v[0] - v.v[0], w.v[1] - v.v[1]) <= TOL) { const d = Math.hypot(w.v[0] - v.v[0], w.v[1] - v.v[1]); if (!sup.has(w.poi) || sup.get(w.poi).d > d) sup.set(w.poi, { d, w }); }
    const n = sup.size; if (!best || n > best.n || (n === best.n && Math.hypot(v.v[0], v.v[1]) < Math.hypot(best.v[0], best.v[1]))) best = { n, v: v.v, members: [...sup.values()].map((o) => o.w) };
  }
  if (!best) { console.log(`${slug.padEnd(11)} 이름 일치 건물 없음 (시설 ${pois.length})`); continue; }
  const mx = best.members.reduce((t, m) => t + m.v[0], 0) / best.n, my = best.members.reduce((t, m) => t + m.v[1], 0) / best.n;
  const dist = Math.hypot(mx, my);
  const tag = best.n >= MIN ? (dist > 60 ? '✗ 보정 필요' : '✓') : '? 지지 부족';
  console.log(`${slug.padEnd(11)} ${tag.padEnd(8)} 시설 ${pois.length} · 지지 ${best.n} · 오차 동 ${mx.toFixed(0)} 북 ${my.toFixed(0)} m (${dist.toFixed(0)} m) · ${best.members.map((m) => m.poi + '↔' + m.bname).join(' / ').slice(0, 140)}`);
  if (ARGS.write && best.n >= MIN && dist > 60) {
    cfg.draft.affine5179_prev2 = { ...A };
    cfg.draft.affine5179 = { ...A, c: +(A.c + mx).toFixed(3), d: +(A.d + my).toFixed(3) };
    cfg.draft.note = `시설 이름 정합 보정 2026-10-23 — ${best.n}개 시설 일치, 이동 (${mx.toFixed(0)}, ${my.toFixed(0)}) m · 이전 값은 affine5179_prev2 · ` + (cfg.draft.note || '');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 1));
    console.log(`  → ${slug}.json 갱신`);
  }
}
