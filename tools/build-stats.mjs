/* ════════════════════════════════════════════════════════════════════
   119 출동자료 CSV → 앱이 읽는 집계 파일 만들기

   실행:  node tools/build-stats.mjs        (tools 폴더 안에서 npm run build)

   ── 무엇을 만드는가 ────────────────────────────────────────────────
   CSV 7개를 **한 번만 읽으면서** 두 가지를 동시에 만듭니다.

     data/incidents/<지역>.json   지도에 찍는 격자 집계 (50m 칸별 건수)
     data/stats/regions/<지역>.json  리포트에 쓰는 통계
                                  (연령·성별·사고유형·시간대·장소 +
                                   조사지 안 / 지자체 전체 비교)

   예전에는 convert-gis.js 가 SHP 를 읽어 격자만 만들었습니다. 이제
   원본이 CSV 로 바뀌었고 통계도 같은 자료에서 나오므로, 두 번 읽지
   않도록 하나로 합쳤습니다. (convert-gis.js 는 옛 SHP 자료용으로 남겨 둡니다.)

   ── 개인정보를 남기지 않는다 ───────────────────────────────────────
   원본에는 신고일시·환자연령·성별·지번주소가 들어 있습니다.
   이 스크립트가 내보내는 것은 **격자 칸별 건수**와 **비율 통계**뿐이라
   개별 신고를 되짚을 수 없습니다. 표본이 적은 칸도 좌표를 50m 격자로
   뭉개므로 지점이 드러나지 않습니다.

   원본(data/raw/)은 .gitignore 로 막혀 있고, 결과물(data/incidents,
   data/stats)만 커밋합니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

import { readCsvFile } from './lib/csv.mjs';
import { readPolygons, readDbf, pointInShape, inBBox } from './lib/shapefile.mjs';
import { readXlsx } from './lib/xlsx.mjs';
import {
  REGIONS, slugFor, isRelabelled, slugForXlsx,
  CATEGORY_BY_CODE, CATEGORY_LABEL, CATEGORY_BY_KOREAN, CATEGORY_ORDER,
} from './lib/regions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CSV_DIR = path.join(ROOT, 'data/raw/incidents_0826');
const SHP_DIR = path.join(ROOT, 'data/raw/gis_0901/최종 조사지');
const XLSX_PATH = path.join(ROOT, 'data/raw/analysis_0901/대표_위험_선정_기준_표본수추가.xlsx');
const OUT_GRID = path.join(ROOT, 'data/incidents');
const OUT_STATS = path.join(ROOT, 'data/stats');

/* ── 조절값 ────────────────────────────────────────────────────────── */

/** 지도 격자 크기(m). 기존 값을 그대로 씁니다 — 바꾸면 지도 해상도가 바뀝니다 */
const CELL_SIZE = 50;

/** 표본이 이보다 적으면 "참고값"으로 표시합니다 (비율이 몇 건에 좌우되는 구간) */
const MIN_SAMPLE = 30;

/** 좌표계 — 원본 CSV 는 위경도(WGS84), 조사지 SHP 와 격자는 EPSG:5186 */
const EPSG5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const toGrid = proj4(WGS84, EPSG5186);
const toLatLng = proj4(EPSG5186, WGS84);

/** 파일 이름 → 분야 key (파일마다 분야가 하나씩입니다) */
const FILE_CATEGORY = {
  '0826감염병_최종.csv': 'infection',
  '0826교통사고_최종.csv': 'traffic',
  '0826범죄_최종.csv': 'crime',
  '0826산업재해_최종.csv': 'industrial',
  '0826생활안전_최종.csv': 'life',
  '0826자살_최종.csv': 'suicide',
  '0826화재_최종.csv': 'fire',
};

/* 발생장 묶음 — 사전진단서가 `도로`와 `도로외교통지역`을 "교통지역" 하나로
   묶어 서술하기에 같은 규칙을 씁니다. 원본 분포도 함께 저장하므로
   묶기 전 값이 필요하면 언제든 되짚을 수 있습니다. */
const PLACE_GROUPS = {
  '도로': '교통지역',
  '도로외교통지역': '교통지역',
};

/* ── 통계 누적기 ───────────────────────────────────────────────────── */

const AGE_BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];

function newAcc() {
  return {
    n: 0,
    years: {},                        // 2023 / 2024 / 2025 건수
    age: { n: 0, sum: 0, buckets: {}, u20: 0, a2049: 0, a65: 0 },
    sex: { n: 0, male: 0, female: 0 },
    place: { n: 0, counts: {} },
    type: { n: 0, counts: {} },
    symptom: { n: 0, counts: {} },    // 환자증 (증상)
    cause: { n: 0, counts: {} },      // 질병외_ (외상 원인)
    hour: { n: 0, bins: new Array(24).fill(0) },
  };
}

const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

/** CSV 한 줄을 누적기에 더합니다 */
function addRow(acc, row) {
  acc.n++;
  if (row.year) bump(acc.years, row.year);

  if (row.age !== null) {
    const a = acc.age;
    a.n++; a.sum += row.age;
    const b = row.age >= 80 ? '80+' : `${Math.floor(row.age / 10) * 10}-${Math.floor(row.age / 10) * 10 + 9}`;
    bump(a.buckets, b);
    if (row.age <= 20) a.u20++;               // 20세 이하 (사전진단서 표기와 맞춤)
    if (row.age >= 20 && row.age <= 49) a.a2049++;
    if (row.age >= 65) a.a65++;
  }

  if (row.sex === '남' || row.sex === '여') {
    acc.sex.n++;
    if (row.sex === '남') acc.sex.male++; else acc.sex.female++;
  }

  for (const [field, value] of [['place', row.place], ['type', row.type],
                                ['symptom', row.symptom], ['cause', row.cause]]) {
    if (value) { acc[field].n++; bump(acc[field].counts, value); }
  }

  if (row.hour !== null) { acc.hour.n++; acc.hour.bins[row.hour]++; }
}

/* ── 누적기 → 내보낼 모양 ──────────────────────────────────────────── */

const pct = (a, b) => (b > 0 ? Number((a / b * 100).toFixed(1)) : null);

/** 비율 상위 목록. [이름, 비율%, 건수] 로 돌려줍니다 */
function topList(bag, limit = 8) {
  return Object.entries(bag.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => [name, pct(n, bag.n), n]);
}

/** 발생장을 묶은 뒤의 상위 목록 */
function topGrouped(bag, limit = 8) {
  const merged = {};
  for (const [name, n] of Object.entries(bag.counts)) {
    const key = PLACE_GROUPS[name] || name;
    merged[key] = (merged[key] || 0) + n;
  }
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => [name, pct(n, bag.n), n]);
}

/** 가장 사고가 몰린 연속 4시간대를 찾습니다 (자정을 넘어가도 됩니다) */
function peakWindow(hour, span = 4) {
  if (!hour.n) return null;
  let best = { from: 0, count: -1 };
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let k = 0; k < span; k++) c += hour.bins[(s + k) % 24];
    if (c > best.count) best = { from: s, count: c };
  }
  return { from: best.from, to: (best.from + span) % 24, share: pct(best.count, hour.n), count: best.count };
}

function exportAcc(acc) {
  if (!acc.n) return null;
  return {
    n: acc.n,
    years: acc.years,
    age: {
      n: acc.age.n,
      mean: acc.age.n ? Number((acc.age.sum / acc.age.n).toFixed(1)) : null,
      u20: pct(acc.age.u20, acc.age.n),
      a2049: pct(acc.age.a2049, acc.age.n),
      a65: pct(acc.age.a65, acc.age.n),
      buckets: Object.fromEntries(AGE_BUCKETS
        .filter((b) => acc.age.buckets[b])
        .map((b) => [b, pct(acc.age.buckets[b], acc.age.n)])),
    },
    sex: { n: acc.sex.n, male: pct(acc.sex.male, acc.sex.n), female: pct(acc.sex.female, acc.sex.n) },
    place: { n: acc.place.n, top: topList(acc.place) },
    placeGrouped: { n: acc.place.n, top: topGrouped(acc.place) },
    type: { n: acc.type.n, top: topList(acc.type) },
    symptom: { n: acc.symptom.n, top: topList(acc.symptom) },
    cause: { n: acc.cause.n, top: topList(acc.cause) },
    hour: { n: acc.hour.n, bins: acc.hour.bins, peak: peakWindow(acc.hour) },
  };
}

/** 조사지 안 값이 지자체 전체보다 몇 배인가 — "평균 대비 2.3배↑" 문장의 재료 */
function compare(inside, region) {
  if (!inside || !region) return null;
  const ratio = (a, b) => (a !== null && b !== null && b > 0 ? Number((a / b).toFixed(2)) : null);
  const diff = (a, b) => (a !== null && b !== null ? Number((a - b).toFixed(1)) : null);
  return {
    ratio: {
      u20: ratio(inside.age.u20, region.age.u20),
      a2049: ratio(inside.age.a2049, region.age.a2049),
      a65: ratio(inside.age.a65, region.age.a65),
      male: ratio(inside.sex.male, region.sex.male),
    },
    diff: {
      u20: diff(inside.age.u20, region.age.u20),
      a2049: diff(inside.age.a2049, region.age.a2049),
      a65: diff(inside.age.a65, region.age.a65),
      male: diff(inside.sex.male, region.sex.male),
    },
  };
}

/* ── 조사지 경계 읽기 ──────────────────────────────────────────────── */

function loadSurveyAreas() {
  const areas = {};
  for (const slug of Object.keys(REGIONS)) {
    const shp = path.join(SHP_DIR, `${slug}_OverlapUnion_1.shp`);
    if (!fs.existsSync(shp)) { console.warn(`  ⚠ 조사지 SHP 없음: ${slug}`); continue; }
    const shapes = readPolygons(shp);
    const attrs = readDbf(path.join(SHP_DIR, `${slug}_OverlapUnion_1.dbf`))[0] || {};
    areas[slug] = {
      shapes,
      meta: {
        areaHa: Number(Number(attrs.Area_ha).toFixed(2)) || null,
        overlapN: Number(attrs.Overlap_N) || null,
        meanRisk: Number(Number(attrs.Mean_Risk).toFixed(3)) || null,
        rank: Number(attrs.Rank) || null,
        types: (attrs.Types || '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    };
  }
  return areas;
}

/** 조사지 경계를 위경도 GeoJSON 으로 바꿉니다 (지도에 그리기 위해) */
function areaToGeoJson(shapes) {
  const coords = [];
  for (const shape of shapes) {
    for (const ring of shape.rings) {
      coords.push(ring.map(([x, y]) => {
        const [lng, lat] = toLatLng.forward([x, y]);
        return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
      }));
    }
  }
  return { type: 'Polygon', coordinates: coords };
}

/* ── 강원대 엑셀에서 확정 안전유형 3개 읽기 ────────────────────────── */

function loadFocusTypes() {
  const sheets = readXlsx(XLSX_PATH);
  const sheet = sheets.find((s) => s.name === '수정본');
  if (!sheet) throw new Error('엑셀에 "수정본" 시트가 없습니다');

  /* 열 위치는 헤더가 병합돼 있어 이름으로 못 찾습니다. 실제 값 위치입니다:
       2=지자체 · 4=위험도 · 17,18,19=확정 안전유형 3개 · 20=대체된 원래 분야
       21,22=분야1·2 표본수(조사지 내) · 23=자살 표본수(구급+발생지점) */
  const out = {};
  for (const row of sheet.rows.slice(4)) {
    if (!row || !row[2]) continue;
    const slug = slugForXlsx(row[2]);
    if (!slug) { console.warn(`  ⚠ 엑셀 지자체를 매칭하지 못했습니다: "${row[2]}"`); continue; }
    out[slug] = {
      focusTypes: [row[17], row[18], row[19]]
        .filter(Boolean)
        .map((k) => ({ key: CATEGORY_BY_KOREAN[k.trim()] || null, label: k.trim() })),
      replacedType: row[20] ? String(row[20]).trim() : null,
      meanRisk: row[4] ? Number(Number(row[4]).toFixed(3)) : null,
      /* 표본수는 강원대가 자살에 '자살발생지점'까지 더해 센 값입니다.
         우리 리포트 본문은 구급출동(자살 926건)만 쓰지만, 분야 선정이
         왜 그렇게 됐는지 되짚을 수 있도록 참고값으로 함께 남깁니다. */
      sampleRef: { focus1: num(row[21]), focus2: num(row[22]), suicide: num(row[23]) },
    };
  }
  return out;
}
function num(v) { return v === undefined || v === null || v === '' ? null : Number(v); }

/* ════════════════════════════════════════════════════════════════════
   본 처리
   ════════════════════════════════════════════════════════════════════ */

console.log('조사지 경계를 읽습니다…');
const areas = loadSurveyAreas();
console.log(`  조사지 ${Object.keys(areas).length}개`);

console.log('강원대 엑셀에서 확정 안전유형을 읽습니다…');
const focus = loadFocusTypes();
console.log(`  지자체 ${Object.keys(focus).length}개`);

/* 지역별 그릇을 미리 만들어 둡니다 */
const store = {};
for (const slug of Object.keys(REGIONS)) {
  store[slug] = {
    grid: {},          // "분야|칸X|칸Y" → 건수
    cat: {},           // 분야 → { region: acc, inside: acc }
    dong: {},          // 읍면동 → 분야 → { region: acc, inside: acc }
    insideTotal: 0,
    regionTotal: 0,
  };
}

let grandTotal = 0, dropped = 0, relabelled = 0, noCoord = 0, codeMismatch = 0;
const droppedKeys = new Map();

console.log('\n119 출동자료를 읽습니다…');
for (const [file, category] of Object.entries(FILE_CATEGORY)) {
  const filePath = path.join(CSV_DIR, file);
  if (!fs.existsSync(filePath)) { console.warn(`  ⚠ 파일 없음: ${file}`); continue; }

  const csv = readCsvFile(fs, filePath);
  const C = {
    sido: csv.col('긴급구'), sgg: csv.col('긴급_1'), dong: csv.col('긴급_12'),
    safety: csv.col('안전유'), code: csv.col('분류기'), year: csv.col('분류연'),
    date: csv.col('신고일'), time: csv.col('신고시'),
    age: csv.col('환자연'), sex: csv.col('환자성'),
    place: csv.col('발생장'), type: csv.col('type'),
    symptom: csv.col('환자증'), cause: csv.col('질병외_'),
    x: csv.col('X'), y: csv.col('Y'),
  };

  let used = 0;
  for (const r of csv.rows) {
    /* 분야는 `안전유`(한글) 칸을 따릅니다 — 13.8만 건 전부 파일과 일치합니다.
       `분류기`(영문 코드)는 2건이 어긋나 있어(감염병 행에 LIFE) 쓰지 않습니다.
       강원대 집계도 안전유 기준이라 이렇게 해야 숫자가 맞습니다. */
    const cat = CATEGORY_BY_KOREAN[(r[C.safety] || '').trim()] || category;
    if (CATEGORY_BY_CODE[(r[C.code] || '').trim().toUpperCase()] !== cat) codeMismatch++;

    const lng = parseFloat(r[C.x]), lat = parseFloat(r[C.y]);
    if (!isFinite(lng) || !isFinite(lat)) { noCoord++; continue; }

    const slug = slugFor(r[C.sido], r[C.sgg], lng, lat);
    if (!slug) {
      dropped++;
      const k = `${(r[C.sido] || '').trim()} / ${(r[C.sgg] || '').trim()}`;
      droppedKeys.set(k, (droppedKeys.get(k) || 0) + 1);
      continue;
    }
    if (isRelabelled(r[C.sido], r[C.sgg])) relabelled++;

    const [gx, gy] = toGrid.forward([lng, lat]);

    /* 조사지 안인가 */
    let inside = false;
    const area = areas[slug];
    if (area) {
      for (const shape of area.shapes) {
        if (inBBox(gx, gy, shape.bbox) && pointInShape(gx, gy, shape)) { inside = true; break; }
      }
    }

    /* 지도용 격자 — 좌표를 50m 칸으로 뭉갭니다 */
    const s = store[slug];
    const gk = `${cat}|${Math.floor(gx / CELL_SIZE)}|${Math.floor(gy / CELL_SIZE)}`;
    s.grid[gk] = (s.grid[gk] || 0) + 1;

    /* 통계용 한 줄 */
    const ageRaw = parseInt(r[C.age], 10);
    const hourRaw = parseInt((r[C.time] || '').slice(0, 2), 10);
    const row = {
      year: (r[C.year] || '').trim(),
      age: Number.isInteger(ageRaw) && ageRaw >= 0 && ageRaw < 130 ? ageRaw : null,
      sex: (r[C.sex] || '').trim(),
      place: (r[C.place] || '').trim(),
      type: (r[C.type] || '').trim(),
      symptom: (r[C.symptom] || '').trim(),
      cause: (r[C.cause] || '').trim(),
      hour: Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw < 24 ? hourRaw : null,
    };

    if (!s.cat[cat]) s.cat[cat] = { region: newAcc(), inside: newAcc() };
    addRow(s.cat[cat].region, row);
    if (inside) addRow(s.cat[cat].inside, row);

    const dongName = (r[C.dong] || '').trim() || '(미상)';
    if (!s.dong[dongName]) s.dong[dongName] = {};
    if (!s.dong[dongName][cat]) s.dong[dongName][cat] = { region: newAcc(), inside: newAcc() };
    addRow(s.dong[dongName][cat].region, row);
    if (inside) addRow(s.dong[dongName][cat].inside, row);

    s.regionTotal++;
    if (inside) s.insideTotal++;
    used++; grandTotal++;
  }
  console.log(`  ${file.padEnd(24)} ${String(csv.rows.length).padStart(6)}행 → ${String(used).padStart(6)}건 사용`);
}

console.log(`\n총 ${grandTotal.toLocaleString()}건 집계`);
console.log(`  주소가 틀려 좌표로 제자리를 찾아준 건: ${relabelled + 2}건 (매칭표의 RELABELLED · BY_COORD 참고)`);
if (codeMismatch) console.log(`  참고 — 안전유와 분류기가 어긋나는 행 ${codeMismatch}건 (안전유를 따랐습니다)`);
if (dropped) {
  console.log(`  ⚠ 매칭 실패로 버린 건: ${dropped}건`);
  for (const [k, v] of droppedKeys) console.log(`      ${k} — ${v}건`);
}
if (noCoord) console.log(`  ⚠ 좌표 없음: ${noCoord}건`);

/* ── 결과물 쓰기 ───────────────────────────────────────────────────── */

fs.mkdirSync(OUT_GRID, { recursive: true });
fs.mkdirSync(path.join(OUT_STATS, 'regions'), { recursive: true });

const SOURCE_NOTE = '119 출동자료 (AURI 제공, 2026-08-26 최종본) · 2023~2025년 · 개인정보 항목 제외';

const gridIndex = [];
const statsIndex = [];
const national = {};     // 41개 지자체를 합친 평균 (비교 기준용)

console.log('\n지역별 파일을 씁니다…');
for (const [slug, meta] of Object.entries(REGIONS)) {
  const s = store[slug];
  if (!s.regionTotal) { console.warn(`  ⚠ ${slug}: 자료가 한 건도 없습니다`); continue; }

  /* ① 지도용 격자 집계 — 기존 형식을 그대로 유지합니다 */
  const categories = {};
  for (const gk in s.grid) {
    const [cat, sx, sy] = gk.split('|');
    const mx = (Number(sx) + 0.5) * CELL_SIZE;
    const my = (Number(sy) + 0.5) * CELL_SIZE;
    const [lng, lat] = toLatLng.forward([mx, my]);
    if (!categories[cat]) categories[cat] = { label: CATEGORY_LABEL[cat], total: 0, points: [] };
    categories[cat].total += s.grid[gk];
    categories[cat].points.push([Number(lat.toFixed(6)), Number(lng.toFixed(6)), s.grid[gk]]);
  }
  fs.writeFileSync(path.join(OUT_GRID, `${slug}.json`), JSON.stringify({
    region: slug, label: meta.label, cellSize: CELL_SIZE, unit: '건',
    source: SOURCE_NOTE, totalRecords: s.regionTotal, skipped: 0, categories,
  }));

  const all = Object.values(categories).flatMap((c) => c.points);
  const centroid = {
    lat: Number((all.reduce((a, p) => a + p[0], 0) / (all.length || 1)).toFixed(5)),
    lng: Number((all.reduce((a, p) => a + p[1], 0) / (all.length || 1)).toFixed(5)),
  };
  gridIndex.push({ region: slug, label: meta.label, ...centroid, total: s.regionTotal });

  /* ② 리포트용 통계 */
  const catOut = {};
  for (const cat of CATEGORY_ORDER) {
    const pair = s.cat[cat];
    if (!pair) continue;
    const region = exportAcc(pair.region);
    const inside = exportAcc(pair.inside);
    catOut[cat] = {
      label: CATEGORY_LABEL[cat],
      count: {
        inside: pair.inside.n,
        region: pair.region.n,
        share: pct(pair.inside.n, pair.region.n),      // 사전진단서 [표 2] 의 발생비율
      },
      inside, region,
      compare: compare(inside, region),
      /* 표본이 적으면 비율을 그대로 읽으면 안 됩니다 */
      sample: { n: pair.inside.n, reliable: pair.inside.n >= MIN_SAMPLE, minSample: MIN_SAMPLE },
    };

    /* 41개 지자체 합계 — 전체 평균과 비교하기 위한 값 */
    if (!national[cat]) national[cat] = newAcc();
    mergeAcc(national[cat], pair.region);
  }

  /* ③ 읍면동별 — 주무관이 담당 동 단위로 사업을 관리하기 때문에 필요합니다 */
  const dongOut = {};
  for (const [name, cats] of Object.entries(s.dong)) {
    const entry = { total: { inside: 0, region: 0 }, categories: {} };
    for (const cat of CATEGORY_ORDER) {
      const pair = cats[cat];
      if (!pair || !pair.region.n) continue;
      entry.total.region += pair.region.n;
      entry.total.inside += pair.inside.n;
      const reg = exportAcc(pair.region);
      const ins = exportAcc(pair.inside);
      entry.categories[cat] = {
        label: CATEGORY_LABEL[cat],
        count: { inside: pair.inside.n, region: pair.region.n },
        /* 동 단위는 표본이 작아 분포 전체를 담지 않고 핵심만 남깁니다 */
        age: { a2049: reg.age.a2049, a65: reg.age.a65, u20: reg.age.u20, n: reg.age.n },
        sex: { male: reg.sex.male, n: reg.sex.n },
        place: reg.placeGrouped.top.slice(0, 3),
        type: reg.type.top.slice(0, 3),
        insideAge: ins ? { a2049: ins.age.a2049, a65: ins.age.a65, n: ins.age.n } : null,
      };
    }
    if (entry.total.region) dongOut[name] = entry;
  }

  const area = areas[slug];
  const f = focus[slug] || {};
  fs.writeFileSync(path.join(OUT_STATS, 'regions', `${slug}.json`), JSON.stringify({
    region: slug,
    label: meta.label,
    shortLabel: meta.short,
    source: SOURCE_NOTE,
    generatedAt: new Date().toISOString().slice(0, 10),
    minSample: MIN_SAMPLE,

    /* 강원대가 확정한 중점 안전유형 3개 — 리포트는 이 3개를 중심으로 씁니다 */
    focusTypes: f.focusTypes || null,
    replacedType: f.replacedType || null,
    sampleRef: f.sampleRef || null,

    surveyArea: area ? {
      ...area.meta,
      geometry: areaToGeoJson(area.shapes),
    } : null,

    totals: { inside: s.insideTotal, region: s.regionTotal, share: pct(s.insideTotal, s.regionTotal) },
    categories: catOut,
    byDong: dongOut,
  }));

  const kb = Math.round(fs.statSync(path.join(OUT_STATS, 'regions', `${slug}.json`)).size / 1024);
  statsIndex.push({
    region: slug, label: meta.label, short: meta.short,
    /* 선택한 지점에서 가장 가까운 지역 파일을 고르기 위한 대표 좌표
       (data/incidents/index.json 과 같은 값 — 화면이 둘 중 하나만 읽어도 되게) */
    ...centroid,
    total: s.regionTotal, inside: s.insideTotal,
    focusTypes: (f.focusTypes || []).map((t) => t.label),
    areaHa: area ? area.meta.areaHa : null,
    meanRisk: area ? area.meta.meanRisk : null,
    dongCount: Object.keys(dongOut).length,
  });

  console.log(`  ${slug.padEnd(12)} ${String(s.regionTotal).padStart(6)}건 (조사지 내 ${String(s.insideTotal).padStart(5)}건) · 동 ${String(Object.keys(dongOut).length).padStart(2)}개 · ${String(kb).padStart(3)}KB`);
}

/** 누적기 두 개를 합칩니다 (전국 평균 계산용) */
function mergeAcc(target, src) {
  target.n += src.n;
  for (const k in src.years) bump2(target.years, k, src.years[k]);
  target.age.n += src.age.n; target.age.sum += src.age.sum;
  target.age.u20 += src.age.u20; target.age.a2049 += src.age.a2049; target.age.a65 += src.age.a65;
  for (const k in src.age.buckets) bump2(target.age.buckets, k, src.age.buckets[k]);
  target.sex.n += src.sex.n; target.sex.male += src.sex.male; target.sex.female += src.sex.female;
  for (const f of ['place', 'type', 'symptom', 'cause']) {
    target[f].n += src[f].n;
    for (const k in src[f].counts) bump2(target[f].counts, k, src[f].counts[k]);
  }
  target.hour.n += src.hour.n;
  for (let i = 0; i < 24; i++) target.hour.bins[i] += src.hour.bins[i];
}
function bump2(obj, key, n) { obj[key] = (obj[key] || 0) + n; }

/* 색인 파일들 */
fs.writeFileSync(path.join(OUT_GRID, 'index.json'), JSON.stringify({
  cellSize: CELL_SIZE,
  categories: CATEGORY_LABEL,
  source: SOURCE_NOTE,
  regions: gridIndex.sort((a, b) => b.total - a.total),
}, null, 2));

fs.writeFileSync(path.join(OUT_STATS, 'index.json'), JSON.stringify({
  source: SOURCE_NOTE,
  generatedAt: new Date().toISOString().slice(0, 10),
  minSample: MIN_SAMPLE,
  categories: CATEGORY_LABEL,
  categoryOrder: CATEGORY_ORDER,
  regions: statsIndex.sort((a, b) => b.total - a.total),
}, null, 2));

fs.writeFileSync(path.join(OUT_STATS, 'national.json'), JSON.stringify({
  source: SOURCE_NOTE,
  note: '41개 지자체 전체를 합친 값입니다. "전체 평균 대비" 비교의 기준으로 씁니다.',
  regionCount: statsIndex.length,
  categories: Object.fromEntries(CATEGORY_ORDER
    .filter((c) => national[c])
    .map((c) => [c, { label: CATEGORY_LABEL[c], ...exportAcc(national[c]) }])),
}, null, 2));

/* 예전 자료로 만들어진 파일이 남아 있으면 알려 줍니다 */
const expected = new Set([...Object.keys(REGIONS).map((s) => `${s}.json`), 'index.json']);
const stale = fs.readdirSync(OUT_GRID).filter((f) => f.endsWith('.json') && !expected.has(f));

const mb = (dir) => fs.readdirSync(dir).reduce((n, f) => {
  const p = path.join(dir, f);
  return n + (fs.statSync(p).isDirectory() ? 0 : fs.statSync(p).size);
}, 0) / 1024 / 1024;

console.log(`\n완료 — 격자 ${mb(OUT_GRID).toFixed(1)}MB · 통계 ${(mb(OUT_STATS) + mb(path.join(OUT_STATS, 'regions'))).toFixed(1)}MB`);
if (stale.length) {
  console.log(`\n⚠ 이번 자료에 없는 예전 파일이 남아 있습니다 (직접 지우세요):`);
  for (const f of stale) console.log(`    data/incidents/${f}`);
}
