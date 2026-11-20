/* ════════════════════════════════════════════════════════════════════
   복합위험지구 · 세부 구역별 119 출동 종합분석 → data/stats/zones/<지역>.json  (2026-11-20, AURI 11/18 김가은 문의 ②)

   AURI 가 복합위험지구와 그 안의 세부 구역(구역 ❶❷ · 단일 ① …) 바운더리(SHP)를 주면, 그 안의 119 구급출동을
   모아 결과보고서 표 2-1 · 3-1 · 3-2 의 재료를 만듭니다 — 구역별 건수 · 지자체 내 비율 · 연령·성별 ·
   시간대(22~05시)·요일(금~일)·월 · 발생 장소 · 강원대 분류(A_type) · 반복 발생 지점.

   집계 기준은 build-stats 와 같습니다(관악구 범죄 579명 · 연도별 287·146·146 = AURI 예시안 표 1-3 과 일치 확인).
     명 = 출동 기록(환자) 수   ·   건 = 같은 신고일·시각(분)·지번주소를 한 사건으로 묶은 수(AURI "같은 일시·장소 다수 부상은 1건")

   ⚠ 개인정보: 웹에 올라가는 JSON 에는 **지번주소를 남기지 않습니다**(개소 수·행정동만).
     구역별 반복 발생 지번 목록은 연구진 전달용 CSV 로 output/zones/ 에만 씁니다(커밋 안 됨 — .gitignore).

   실행:
     node tools/build-zone-stats.mjs                                  ← tools/config/zones.json 에 적힌 지자체 전부
     node tools/build-zone-stats.mjs --only=gwanak,namwon
     node tools/build-zone-stats.mjs gwanak --zones=<구역 shp> [--name=<이름 칸>] [--district=<지구 shp>] [--out=<폴더>]   ← 시험용
   설정(tools/config/zones.json):
     { "regions": { "<slug>": { "source": "AURI 2026-11-xx", "zones": "data/raw/…/구역.shp", "nameField": "NAME",
                                "district": "data/raw/…/지구.shp"(없으면 구역 전부의 합), "names": { "1": "구역 ❶ …" } } } }
   좌표계는 .prj 로 알아봅니다(EPSG:5186 중부원점 · 5179 UTM-K · 4326 경위도).
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
import { openIncidents, REPEAT_THRESHOLD, ATYPE_AXIS } from './lib/incidents.mjs';
import { readPolygons, readDbf, pointInShape, inBBox } from './lib/shapefile.mjs';
import { REGIONS, slugFor, CATEGORY_BY_KOREAN, CATEGORY_ORDER, CATEGORY_LABEL } from './lib/regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGV = process.argv.slice(2);
const ARGS = Object.fromEntries(ARGV.filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const POS = ARGV.filter((a) => !a.startsWith('--'));
const CFG_FILE = path.join(ROOT, 'tools/config/zones.json');
const OUT_DIR = path.resolve(ROOT, ARGS.out || 'data/stats/zones');
const PRIVATE_DIR = path.join(ROOT, 'output/zones');   // 지번 목록 — 커밋 안 됨

const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const CRS = {
  5186: '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
  5179: '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs',
  4326: WGS84,
};
/** .prj 글로 좌표계 알아보기 — 모르면 5186(강원대·AURI 자료 기본) */
function crsOf(shp) {
  const prj = shp.replace(/\.shp$/i, '.prj');
  const t = fs.existsSync(prj) ? fs.readFileSync(prj, 'utf8') : '';
  if (!t) return 5186;
  if (/Unified|UTM-?K|False_Easting",\s*1000000/i.test(t)) return 5179;
  if (!/PROJCS/i.test(t) && /GEOGCS/i.test(t)) return 4326;
  return 5186;
}

/* ── 구역 읽기 ───────────────────────────────────────────────────── */
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function readZones(shp, nameField, names) {
  const full = path.resolve(ROOT, shp);
  if (!fs.existsSync(full)) throw new Error('SHP 없음: ' + full);
  const shapes = readPolygons(full);
  const dbf = full.replace(/\.shp$/i, '.dbf');
  const rows = fs.existsSync(dbf) ? readDbf(dbf, { encoding: 'auto' }) : [];
  const list = Array.isArray(rows) ? rows : (rows.rows || []);
  const field = nameField || (list[0] ? Object.keys(list[0]).find((k) => /name|명|zone|구역|id/i.test(k)) : null);
  const crs = crsOf(full);
  const zones = shapes.map((s, i) => {
    const raw = field && list[i] ? String(list[i][field] ?? '').trim() : String(i + 1);
    const area = s.rings.reduce((a, r) => a + ringArea(r), 0);
    return { id: raw || String(i + 1), name: (names && names[raw]) || raw || `구역 ${i + 1}`, shape: s, areaKm2: crs === 4326 ? null : +Math.abs(area / 1e6).toFixed(3) };
  });
  return { zones, crs, field, file: path.relative(ROOT, full) };
}

/* ── 누적기 (build-stats 와 같은 꼴 + 요일·월·사건 수) ───────────────── */
const AGE_BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const pct = (a, b) => (b > 0 ? Number((a / b * 100).toFixed(1)) : null);
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const top = (counts, n, lim = 8) => Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, lim).map(([k, v]) => [k, pct(v, n), v]);
function newAcc() {
  return { n: 0, events: new Set(), years: {}, age: { n: 0, sum: 0, b: {}, u20: 0, a2049: 0, a2039: 0, a65: 0, a60: 0 }, sex: { n: 0, male: 0 },
    hour: { n: 0, bins: new Array(24).fill(0) }, wday: { n: 0, bins: new Array(7).fill(0) }, month: { n: 0, bins: new Array(12).fill(0) },
    place: { n: 0, c: {} }, atype: { n: 0, c: {} }, type: { n: 0, c: {} }, symptom: { n: 0, c: {} }, spots: new Map() };
}
function add(acc, row) {
  acc.n++; acc.events.add(row.eventKey);
  if (row.year) bump(acc.years, row.year);
  if (row.age != null) { const a = acc.age; a.n++; a.sum += row.age; bump(a.b, row.age >= 80 ? '80+' : `${Math.floor(row.age / 10) * 10}-${Math.floor(row.age / 10) * 10 + 9}`);
    if (row.age <= 20) a.u20++; if (row.age >= 20 && row.age <= 49) a.a2049++; if (row.age >= 20 && row.age <= 39) a.a2039++; if (row.age >= 65) a.a65++; if (row.age >= 60) a.a60++; }
  if (row.sex === '남' || row.sex === '여') { acc.sex.n++; if (row.sex === '남') acc.sex.male++; }
  if (row.hour != null) { acc.hour.n++; acc.hour.bins[row.hour]++; }
  if (row.wday != null) { acc.wday.n++; acc.wday.bins[row.wday]++; }
  if (row.month != null) { acc.month.n++; acc.month.bins[row.month]++; }
  for (const k of ['place', 'atype', 'type', 'symptom']) if (row[k]) { acc[k].n++; bump(acc[k].c, row[k]); }
  if (row.addr) { const s = acc.spots.get(row.addr) || { n: 0, dong: row.dong }; s.n++; acc.spots.set(row.addr, s); }
}
const WDAY = ['일', '월', '화', '수', '목', '금', '토'];
function peak(bins, span) { const n = bins.length; let best = { from: 0, c: -1 }; for (let s = 0; s < n; s++) { let c = 0; for (let k = 0; k < span; k++) c += bins[(s + k) % n]; if (c > best.c) best = { from: s, c }; } return best; }
function exportAcc(acc, regionN, cat) {
  if (!acc.n) return null;
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((s, h) => s + acc.hour.bins[h], 0);   // 22~05시(05시 전까지)
  const wkend = acc.wday.bins[5] + acc.wday.bins[6] + acc.wday.bins[0];               // 금~일
  const ph = acc.hour.n ? peak(acc.hour.bins, 4) : null;
  const th = REPEAT_THRESHOLD[cat] || 3;
  const rep = [...acc.spots.values()];
  const repAt = (k) => rep.filter((s) => s.n >= k);
  const byDong = {}; for (const s of repAt(2)) byDong[s.dong] = (byDong[s.dong] || 0) + 1;
  return {
    n: acc.n, events: acc.events.size, share: pct(acc.n, regionN), years: acc.years,
    age: { n: acc.age.n, mean: acc.age.n ? +(acc.age.sum / acc.age.n).toFixed(1) : null, u20: pct(acc.age.u20, acc.age.n), a2039: pct(acc.age.a2039, acc.age.n), a2049: pct(acc.age.a2049, acc.age.n), a60: pct(acc.age.a60, acc.age.n), a65: pct(acc.age.a65, acc.age.n),
      buckets: Object.fromEntries(AGE_BUCKETS.filter((b) => acc.age.b[b]).map((b) => [b, [pct(acc.age.b[b], acc.age.n), acc.age.b[b]]])) },
    sex: { n: acc.sex.n, male: pct(acc.sex.male, acc.sex.n), maleN: acc.sex.male },
    hour: { n: acc.hour.n, bins: acc.hour.bins, night2205: pct(night, acc.hour.n), nightN: night, peak: ph ? { from: ph.from, to: (ph.from + 4) % 24, share: pct(ph.c, acc.hour.n), n: ph.c } : null },
    weekday: { n: acc.wday.n, bins: acc.wday.bins, labels: WDAY, friSun: pct(wkend, acc.wday.n), friSunN: wkend },
    month: { n: acc.month.n, bins: acc.month.bins },
    place: { n: acc.place.n, top: top(acc.place.c, acc.place.n) },
    atype: { n: acc.atype.n, axis: ATYPE_AXIS[cat] || null, top: top(acc.atype.c, acc.atype.n, 20) },
    type: { n: acc.type.n, top: top(acc.type.c, acc.type.n) },
    symptom: { n: acc.symptom.n, top: top(acc.symptom.c, acc.symptom.n, 5) },
    /* 반복 발생 지점 — 주소 없이 개소 수·건수·행정동만(지번 목록은 output/zones CSV) */
    repeat: { threshold: th, spots: repAt(th).length, incidents: repAt(th).reduce((s, v) => s + v.n, 0), spots2: repAt(2).length, maxAtOneSpot: rep.reduce((m, v) => Math.max(m, v.n), 0),
      topDongs: Object.entries(byDong).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([dong, spots]) => ({ dong, spots })) },
  };
}

/* ── 지자체 하나 ─────────────────────────────────────────────────── */
let _rows = null;   // 분야 → 정리된 줄 (한 번만 읽음)
function loadRows() {
  if (_rows) return _rows;
  _rows = {};
  for (const category of CATEGORY_ORDER) {
    const csv = openIncidents(fs, ROOT, category);
    const C = { sido: csv.col('긴급구'), sgg: csv.col('긴급_1'), safety: csv.col('안전유'), year: csv.col('분류연'), date: csv.col('신고일'), time: csv.col('신고시'),
      age: csv.col('환자연'), sex: csv.col('환자성'), place: csv.col('발생장'), symptom: csv.col('환자증'), x: csv.col('X'), y: csv.col('Y'), addr: csv.col('지번주'), dong: csv.col('긴급_12') };
    for (let i = 0; i < csv.rows.length; i++) {
      const r = csv.rows[i];
      const lng = parseFloat(r[C.x]), lat = parseFloat(r[C.y]);
      if (!isFinite(lng) || !isFinite(lat)) continue;
      const slug = slugFor(r[C.sido], r[C.sgg], lng, lat); if (!slug) continue;
      const cat = CATEGORY_BY_KOREAN[(r[C.safety] || '').trim()] || category;
      const date = String(r[C.date] || '').trim(), time = String(r[C.time] || '').trim();
      const dm = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      const ageRaw = parseInt(r[C.age], 10), hourRaw = parseInt(time.split(':')[0], 10);
      const addr = String(r[C.addr] || '').replace(/\s+/g, ' ').trim();
      (_rows[slug] ||= []).push({ cat, lng, lat, year: String(r[C.year] || '').trim(),
        age: Number.isInteger(ageRaw) && ageRaw >= 0 && ageRaw < 130 ? ageRaw : null, sex: String(r[C.sex] || '').trim(),
        hour: Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw < 24 ? hourRaw : null,
        wday: dm ? new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3])).getUTCDay() : null, month: dm ? +dm[2] - 1 : null,
        place: String(r[C.place] || '').trim(), atype: csv.atype(i), type: csv.type(i), symptom: String(r[C.symptom] || '').trim(),
        addr, dong: String(r[C.dong] || '').trim() || '(미상)', eventKey: `${date}|${time.slice(0, 5)}|${addr || lng.toFixed(5) + ',' + lat.toFixed(5)}` });
    }
  }
  return _rows;
}

function runRegion(slug, cfg) {
  if (!REGIONS[slug]) throw new Error('모르는 지자체: ' + slug);
  const Z = readZones(cfg.zones, cfg.nameField, cfg.names);
  const D = cfg.district ? readZones(cfg.district, cfg.districtNameField, null) : null;
  const proj = proj4(WGS84, CRS[Z.crs]);
  const projD = D ? proj4(WGS84, CRS[D.crs]) : null;
  const rows = loadRows()[slug] || [];
  const regionAcc = {}, districtAcc = {}, zoneAcc = Z.zones.map(() => ({}));
  const inShapes = (x, y, s) => inBBox(x, y, s.bbox) && pointInShape(x, y, s);
  for (const row of rows) {
    (regionAcc[row.cat] ||= newAcc()); add(regionAcc[row.cat], row);
    const [x, y] = Z.crs === 4326 ? [row.lng, row.lat] : proj.forward([row.lng, row.lat]);
    let anyZone = false;
    Z.zones.forEach((z, i) => { if (inShapes(x, y, z.shape)) { anyZone = true; (zoneAcc[i][row.cat] ||= newAcc()); add(zoneAcc[i][row.cat], row); } });
    let inD = anyZone;
    if (D) { const [dx, dy] = D.crs === 4326 ? [row.lng, row.lat] : projD.forward([row.lng, row.lat]); inD = D.zones.some((z) => inShapes(dx, dy, z.shape)); }
    if (inD) { (districtAcc[row.cat] ||= newAcc()); add(districtAcc[row.cat], row); }
  }
  const regionN = Object.fromEntries(Object.entries(regionAcc).map(([k, a]) => [k, a.n]));
  const cats = (accs) => Object.fromEntries(CATEGORY_ORDER.filter((k) => accs[k]).map((k) => [k, exportAcc(accs[k], regionN[k], k)]));
  const out = {
    region: slug, label: REGIONS[slug].label || slug, source: cfg.source || null, generatedAt: new Date().toISOString().slice(0, 10),
    basis: '119 구급출동(2023~2025) · 명 = 출동 기록(환자) 수 · 건 = 같은 신고일·시각(분)·지번 한 사건 · 비율(share) = 지자체 전체 대비 · 22~05시 = 22시~04시대 · 금~일 · 반복 지점 = 같은 지번 임계 이상(분야별 REPEAT_THRESHOLD, spots2 = 2회 이상) · topDongs 는 원자료 동(법정동) 이름',
    files: { zones: Z.file, nameField: Z.field, district: D ? D.file : null, crs: Z.crs },
    labels: Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORY_LABEL[k]])),
    regionTotals: Object.fromEntries(Object.entries(regionAcc).map(([k, a]) => [k, { n: a.n, events: a.events.size, years: a.years }])),
    district: { name: D ? (D.zones[0] && D.zones[0].name) : '복합위험지구(구역 합)', areaKm2: D ? +D.zones.reduce((s, z) => s + (z.areaKm2 || 0), 0).toFixed(3) : null, categories: cats(districtAcc) },
    zones: Z.zones.map((z, i) => ({ id: z.id, name: z.name, areaKm2: z.areaKm2, categories: cats(zoneAcc[i]) })),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, slug + '.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  /* 연구진 전달용 — 구역·분야별 2회 이상 지번 (커밋 안 되는 output/) */
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const lines = ['구역,분야,지번주소,명,행정동(원자료)'];
  Z.zones.forEach((z, i) => { for (const [cat, acc] of Object.entries(zoneAcc[i])) {
    [...acc.spots.entries()].filter(([, s]) => s.n >= 2).sort((a, b) => b[1].n - a[1].n).forEach(([addr, s]) => lines.push([z.name, CATEGORY_LABEL[cat], addr, s.n, s.dong].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')));
  } });
  const privFile = path.join(PRIVATE_DIR, `${slug}_구역별_반복지번.csv`);
  fs.writeFileSync(privFile, '﻿' + lines.join('\r\n'));
  console.log(`${slug}: 구역 ${Z.zones.length}(칸 ${Z.field || '-'} · EPSG:${Z.crs}) · 출동 ${rows.length} → ${path.relative(ROOT, outFile)} · 지번 목록 ${lines.length - 1}줄 ${path.relative(ROOT, privFile)}`);
  for (const z of out.zones) console.log(`  ${String(z.name).slice(0, 30).padEnd(30)} ${Object.entries(z.categories).map(([k, v]) => `${CATEGORY_LABEL[k]} ${v.n}(${v.share}%)`).join(' · ') || '출동 없음'}`);
  return out;
}

/* ── 실행 ────────────────────────────────────────────────────────── */
if (POS[0] && ARGS.zones) {
  runRegion(POS[0], { zones: ARGS.zones, nameField: ARGS.name, district: ARGS.district, source: '시험 실행(--zones)' });
} else {
  const cfg = fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) : { regions: {} };
  const only = ARGS.only ? String(ARGS.only).split(',') : null;
  const list = Object.entries(cfg.regions || {}).filter(([s]) => !only || only.includes(s));
  if (!list.length) console.log('tools/config/zones.json 에 적힌 지자체가 없습니다 — AURI 복합위험지구·구역 SHP 를 받으면 적으세요 (시험: node tools/build-zone-stats.mjs <지역> --zones=<shp>)');
  for (const [slug, c] of list) runRegion(slug, c);
}
