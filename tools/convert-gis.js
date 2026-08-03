/* ════════════════════════════════════════════════════════════════════
   119 응급신고 SHP → 앱이 읽는 격자 집계 JSON

   실행:  node tools/convert-gis.js

   ── 무엇을 하는가 ──────────────────────────────────────────────────
   data/raw/points/*.shp 에서 **좌표와 사건분류 2가지만** 꺼내
   100×100m 격자 단위 발생 건수로 집계한 뒤 data/incidents/ 에 저장합니다.

   ── 개인정보를 다루지 않는다 ───────────────────────────────────────
   원본 속성표(.dbf)에는 신고일시·환자연령·성별·상병·지번주소 등
   98개 항목이 들어 있지만, 이 스크립트는 그중 **분류코드 한 칸만**
   읽습니다. 나머지 항목은 파일에서 꺼내지도 않으므로 결과물에
   개인정보가 남을 수 없습니다.

   ── 왜 격자로 묶는가 ───────────────────────────────────────────────
   · 개별 신고 지점이 드러나지 않습니다 (집계값만 남음)
   · 시행계획서의 진단 단위(100×100m 격자)와 같은 기준이 됩니다
   · 6.3GB → 수 MB 로 줄어 지도가 가벼워집니다
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(HERE, '../data/raw/points');
const OUT_DIR = path.resolve(HERE, '../data/incidents');

const CELL_SIZE = 100;   // 격자 한 칸 = 100m

/* 원본 좌표계: EPSG:5186 (Korea 2000 / 중부원점) — .prj 파일에서 확인한 값 */
const EPSG5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/* 분류코드 → 앱의 7대 사회재난 key. 원본의 분류기(영문)를 먼저 쓰고,
   비어 있으면 안전유(한글)로 맞춥니다. */
const CATEGORY_BY_CODE = {
  SUICIDE: 'suicide', TRAFFIC: 'traffic', FIRE: 'fire', CRIME: 'crime',
  LIFE: 'life', INDUSTRIAL: 'industrial', INFECTIOUS: 'infection',
};
const CATEGORY_BY_KOREAN = {
  '자살': 'suicide', '교통사고': 'traffic', '화재': 'fire', '범죄': 'crime',
  '생활안전': 'life', '산재': 'industrial', '산업재해': 'industrial', '감염병': 'infection',
};
const CATEGORY_LABEL = {
  suicide: '자살', traffic: '교통사고', fire: '화재', crime: '범죄',
  life: '생활안전', industrial: '산업재해', infection: '감염병',
};

/* ── .shp 에서 점 좌표만 읽습니다 ──────────────────────────────────── */
function readPoints(shpPath) {
  const buf = fs.readFileSync(shpPath);
  const points = [];
  let off = 100;                       // 파일 머리말 100바이트 건너뜀
  while (off + 8 <= buf.length) {
    const contentWords = buf.readInt32BE(off + 4);
    const content = off + 8;
    const shapeType = buf.readInt32LE(content);
    points.push(shapeType === 1
      ? { x: buf.readDoubleLE(content + 4), y: buf.readDoubleLE(content + 12) }
      : null);                         // 빈 도형
    off = content + contentWords * 2;
  }
  return points;
}

/* ── .dbf 는 필요한 칸의 위치만 계산해 그 칸만 읽습니다 ────────────── */
function openDbf(dbfPath) {
  const fd = fs.openSync(dbfPath, 'r');
  const head = Buffer.alloc(32);
  fs.readSync(fd, head, 0, 32, 0);
  const headerSize = head.readUInt16LE(8);

  const defs = Buffer.alloc(headerSize - 32);
  fs.readSync(fd, defs, 0, defs.length, 32);

  const fields = {};
  let offset = 1;                      // 첫 바이트는 삭제 표시
  for (let o = 0; o + 32 <= defs.length; o += 32) {
    if (defs[o] === 0x0d) break;
    let end = 0;
    while (end < 11 && defs[o + end] !== 0) end++;
    const name = defs.slice(o, o + end).toString('utf8');
    if (!name) break;
    const len = defs[o + 16];
    fields[name] = { offset, len };
    offset += len;
  }

  return {
    fd,
    headerSize,
    recordSize: head.readUInt16LE(10),
    recordCount: head.readUInt32LE(4),
    fields,
    /* 지정한 칸 하나만 읽습니다 — 나머지 항목은 건드리지 않습니다 */
    read(index, fieldName) {
      const f = this.fields[fieldName];
      if (!f) return '';
      const b = Buffer.alloc(f.len);
      fs.readSync(this.fd, b, 0, f.len, this.headerSize + index * this.recordSize + f.offset);
      return b.toString('utf8').trim();
    },
    close() { fs.closeSync(this.fd); },
  };
}

/* ── 지역 한 곳 처리 ──────────────────────────────────────────────── */
function convertRegion(slug) {
  const points = readPoints(path.join(RAW_DIR, `${slug}.shp`));
  const dbf = openDbf(path.join(RAW_DIR, `${slug}.dbf`));

  const count = Math.min(points.length, dbf.recordCount);
  const grid = {};          // key: "category|cellX|cellY" → 건수
  let skipped = 0;
  const regionNames = new Map();
  let nameFound = false;

  for (let i = 0; i < count; i++) {
    const p = points[i];
    if (!p || !isFinite(p.x) || !isFinite(p.y)) { skipped++; continue; }

    /* 지역 이름은 원본 값에서 찾습니다 (파일명으로 추측하지 않습니다).
       이름이 채워진 건은 일부뿐이고 분류가 빈 건에도 들어 있으므로,
       분류를 거르기 전에 먼저 봅니다. */
    if (!nameFound) {
      const sido = dbf.read(i, '지역_시');
      const sgg = dbf.read(i, '지역__1');
      if (sido && sgg) {
        const full = sido === sgg ? sido : `${sido} ${sgg}`;   // 세종처럼 시=구인 경우
        const n = (regionNames.get(full) || 0) + 1;
        regionNames.set(full, n);
        if (n >= 3) nameFound = true;   // 충분히 확인됐으면 더 읽지 않습니다
      }
    }

    const code = dbf.read(i, '분류기').toUpperCase();
    let key = CATEGORY_BY_CODE[code];
    if (!key) key = CATEGORY_BY_KOREAN[dbf.read(i, '안전유')];
    if (!key) { skipped++; continue; }   // 분류가 비어 있는 건은 제외

    const cx = Math.floor(p.x / CELL_SIZE);
    const cy = Math.floor(p.y / CELL_SIZE);
    const gk = `${key}|${cx}|${cy}`;
    grid[gk] = (grid[gk] || 0) + 1;
  }
  dbf.close();

  /* 격자 중심점을 위경도로 바꿔 담습니다 */
  const categories = {};
  for (const gk in grid) {
    const [key, cx, cy] = gk.split('|');
    const mx = (Number(cx) + 0.5) * CELL_SIZE;
    const my = (Number(cy) + 0.5) * CELL_SIZE;
    const [lng, lat] = proj4(EPSG5186, WGS84, [mx, my]);

    if (!categories[key]) categories[key] = { label: CATEGORY_LABEL[key], total: 0, points: [] };
    categories[key].total += grid[gk];
    categories[key].points.push([Number(lat.toFixed(5)), Number(lng.toFixed(5)), grid[gk]]);
  }

  const label = [...regionNames.entries()].sort(function (a, b) { return b[1] - a[1]; })[0];
  return {
    region: slug.replace(/_p$/, ''),
    label: label ? label[0] : null,      // 못 찾으면 null — 나중에 직접 채웁니다
    cellSize: CELL_SIZE,
    unit: '건',
    source: '119 응급신고 이력 (AURI 제공) · 개인정보 항목 제외, 100m 격자 집계',
    totalRecords: count,
    skipped,
    categories,
  };
}

/* ── 전체 실행 ────────────────────────────────────────────────────── */
fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(RAW_DIR).filter(function (f) { return f.endsWith('.shp'); });
console.log(`${files.length}개 지역 변환을 시작합니다.\n`);

const index = [];
let grandTotal = 0;

for (const file of files) {
  const slug = path.basename(file, '.shp');
  process.stdout.write(`  ${slug.padEnd(16)}`);

  const data = convertRegion(slug);
  const outPath = path.join(OUT_DIR, `${data.region}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data));

  const cells = Object.values(data.categories).reduce(function (n, c) { return n + c.points.length; }, 0);
  const total = Object.values(data.categories).reduce(function (n, c) { return n + c.total; }, 0);
  grandTotal += total;

  /* 지도에서 어느 지역 파일을 불러올지 고르기 위한 대표 좌표 */
  const all = Object.values(data.categories).flatMap(function (c) { return c.points; });
  const cLat = all.reduce(function (s, p) { return s + p[0]; }, 0) / (all.length || 1);
  const cLng = all.reduce(function (s, p) { return s + p[1]; }, 0) / (all.length || 1);

  index.push({
    region: data.region,
    label: data.label,
    lat: Number(cLat.toFixed(5)),
    lng: Number(cLng.toFixed(5)),
    total,
  });

  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`${String(total).padStart(7)}건 → 격자 ${String(cells).padStart(6)}칸  ${String(kb).padStart(5)}KB` +
              (data.skipped ? `  (분류없음 ${data.skipped}건 제외)` : ''));
}

fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({
  cellSize: CELL_SIZE,
  categories: CATEGORY_LABEL,
  regions: index.sort(function (a, b) { return b.total - a.total; }),
}, null, 2));

const outMB = fs.readdirSync(OUT_DIR)
  .reduce(function (n, f) { return n + fs.statSync(path.join(OUT_DIR, f)).size; }, 0) / 1024 / 1024;

console.log(`\n완료 — 총 ${grandTotal.toLocaleString()}건, 결과물 ${outMB.toFixed(1)}MB`);
const unnamed = index.filter(function (r) { return !r.label; });
if (unnamed.length) {
  console.log(`\n지역 이름을 원본에서 찾지 못한 곳 ${unnamed.length}개 (index.json에서 직접 채워야 합니다):`);
  console.log('  ' + unnamed.map(function (r) { return r.region; }).join(', '));
}
