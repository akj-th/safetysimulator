/* ════════════════════════════════════════════════════════════════════
   위험도 히트맵 GeoTIFF → 지도에 얹는 PNG

   실행:  node tools/build-heatmap.mjs            (전체 287장)
          node tools/build-heatmap.mjs michuhol   (한 지자체만)

   입력   data/raw/gis_0901/density/<분야>/<지역>_*.tif   🔴 커밋 금지
   출력   data/heatmap/<지역>_<분야>.png + index.json

   ── 중요: 밀도를 다시 계산하지 않습니다 ────────────────────────────
   강원대가 QGIS 로 만든 결과를 **그대로** 씁니다. 우리가 커널 밀도를
   다시 계산하면 사전진단서에 실린 히트맵과 다른 그림이 나옵니다.
   이 스크립트가 하는 일은 축소 · 색칠 · 좌표 계산뿐입니다.

   ── 축소할 때 NoData 를 섞지 않습니다 ──────────────────────────────
   4×4 블록을 하나로 줄이는데, 그냥 평균 내면 NoData(3.4e38)가 섞여
   전체가 거대한 값이 됩니다. **유효 픽셀만 평균**을 내고, 블록 전체가
   NoData 면 NoData 로 남깁니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

import { readHeader, eachTile, isNoData, geoRef } from './lib/geotiff.mjs';
import { encodePng } from './lib/png.mjs';
import { REGIONS } from './lib/regions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'data/raw/gis_0901/density');
const OUT = path.join(ROOT, 'data/heatmap');

/* ── 조절값 ────────────────────────────────────────────────────────── */

/** 몇 배로 줄일 것인가. 원본 10m → 4배 축소 = 40m 해상도.
    키우면 파일이 작아지고 그림이 뭉개집니다 (2 = 20m, 8 = 80m). */
const SHRINK = 4;

/** 색이 가장 진해지는 기준값을 어디에 둘 것인가.
    분야마다 밀도 범위가 크게 달라(교통사고는 자살의 수백 배) 한 기준으로
    묶으면 한쪽이 안 보입니다. **그 지자체·그 분야 안에서** 이 분위수를
    만점으로 잡습니다.
    99분위를 쓰는 이유는 유난히 높은 한 점이 나머지를 다 눌러 버리기
    때문입니다 (안동 교통사고: 99분위 103.2 vs 최댓값 304). */
const TOP_QUANTILE = 0.99;

/** 색이 나타나기 시작하는 하한 — 이보다 옅으면 아예 투명하게 둡니다.
    0에 가까운 꼬리까지 칠하면 지도 전체가 옅게 덮여 지형이 안 보입니다. */
const MIN_ALPHA_AT = 0.04;

/** 가장 진한 곳의 불투명도 (0~1). 화면에서 다시 조절할 수 있습니다. */
const MAX_ALPHA = 0.9;

/* ── 색을 어떻게 입히는가 ──────────────────────────────────────────
   한 가지 색을 두고 투명도만 바꾸면, 옅은 곳이 "색이 연한 것"이 아니라
   "덜 덮인 것"으로 보여 바탕 지도와 뒤섞입니다.

   그래서 **흰색 → 분야 색** 으로 색 자체를 옮기고, 거기에 투명도를 얹습니다.
   옅은 곳은 흰빛, 짙은 곳은 분야 색이 되어 밀도 차이가 색으로 읽힙니다.

     값 낮음 ──────────────────► 값 높음
     흰색(반투명)   연한 색   진한 분야 색(불투명)                        */

/** 투명도가 최대에 이르는 지점. 이 아래는 가장자리가 부드럽게 사라집니다.
    올리면 옅은 영역이 더 투명해져 바탕 지도가 잘 보입니다. */
const ALPHA_FULL_AT = 0.35;

/** 색이 짙어지는 곡선. 1보다 작으면 중간값에서도 색이 빨리 올라옵니다.
    (1 = 직선, 0.7 = 중간 밀도에서도 색이 뚜렷) */
const COLOR_GAMMA = 0.75;

/* 분야 → 폴더 이름. 교통사고는 구급·다발지역을 합친 **최종**을 씁니다
   (density/설명.txt: "구급출동 자료와 교통사고 다발지역 자료의 개별
   밀도 분석 결과를 활용하여 도출한 최종 교통사고 밀도 결과") */
const FOLDER = {
  traffic: '교통사고_최종',
  fire: '화재',
  crime: '범죄',
  life: '생활안전',
  industrial: '산업재해',
  suicide: '자살',
  infection: '감염병',
};

/* 지도 레이어 점 색과 같은 색을 씁니다 (index.html 의 INCIDENT_CATEGORIES).
   히트맵과 점이 같은 분야인데 색이 다르면 무엇이 무엇인지 알 수 없습니다. */
const COLOR = {
  suicide: [0x7b, 0x5e, 0xa7], traffic: [0x2a, 0x78, 0xd6], fire: [0xe3, 0x49, 0x48],
  crime: [0xe0, 0x76, 0x1f], life: [0x1b, 0xaf, 0x7a], industrial: [0x8a, 0x6d, 0x3b],
  infection: [0x4a, 0x3a, 0xa7],
};

const EPSG5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const toLatLng = proj4(EPSG5186, WGS84);

/* ── 파일 찾기 ─────────────────────────────────────────────────────
   폴더마다 이름 규칙이 다릅니다.
     교통사고_최종  andong_TrafficRisk.tif
     나머지         andong_자살_kd.tif
   그래서 확장자를 뺀 이름이 slug 로 **시작하는** 파일을 찾습니다. */
function findTif(folder, slug) {
  const dir = path.join(SRC, folder);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.tif')
    && f.slice(0, f.lastIndexOf('.')).toLowerCase().startsWith(slug.toLowerCase() + '_'));
  return hit ? path.join(dir, hit) : null;
}

/* ── 축소 ──────────────────────────────────────────────────────────
   타일을 하나씩 읽으며 축소 격자에 바로 더합니다.
   원본을 통째로 메모리에 올리지 않습니다 (안동 교통사고 239MB). */
function downsample(file, t) {
  const w = Math.ceil(t.width / SHRINK);
  const h = Math.ceil(t.height / SHRINK);
  const sum = new Float64Array(w * h);
  const cnt = new Int32Array(w * h);

  const tw = t.tileWidth, th = t.tileHeight;
  eachTile(file, t, (tx, ty, values) => {
    const baseX = tx * tw, baseY = ty * th;
    for (let y = 0; y < th; y++) {
      const py = baseY + y;
      if (py >= t.height) break;
      const oy = (py / SHRINK) | 0;
      for (let x = 0; x < tw; x++) {
        const px = baseX + x;
        if (px >= t.width) continue;
        const v = values[y * tw + x];
        if (isNoData(v) || v <= 0) continue;      // NoData 와 0 은 빼고 셉니다
        const i = oy * w + ((px / SHRINK) | 0);
        sum[i] += v; cnt[i]++;
      }
    }
  });

  /* 유효 픽셀만 평균. 하나도 없으면 NaN(= 값 없음)으로 둡니다. */
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? sum[i] / cnt[i] : NaN;
  return { data: out, width: w, height: h };
}

/** 값이 있는 픽셀들의 분위수 */
function quantile(data, q) {
  const vals = [];
  for (let i = 0; i < data.length; i++) if (Number.isFinite(data[i])) vals.push(data[i]);
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * q)))];
}

/** 축소한 격자 → RGBA. 흰색에서 분야 색으로 옮겨 가며, 가장자리만 투명해집니다 */
function colorize(grid, rgb, top) {
  const px = new Uint8Array(grid.width * grid.height * 4);
  if (!top) return px;

  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (!Number.isFinite(v)) continue;                 // 값 없음 → 투명
    const t = Math.min(1, v / top);
    if (t < MIN_ALPHA_AT) continue;                    // 너무 옅으면 투명

    const o = i * 4;
    /* 색: 흰색 → 분야 색 */
    const c = Math.pow(t, COLOR_GAMMA);
    px[o]     = Math.round(255 + (rgb[0] - 255) * c);
    px[o + 1] = Math.round(255 + (rgb[1] - 255) * c);
    px[o + 2] = Math.round(255 + (rgb[2] - 255) * c);
    /* 투명도: 가장자리만 부드럽게 사라지고 그 위로는 일정하게 */
    px[o + 3] = Math.round(Math.min(1, t / ALPHA_FULL_AT) * MAX_ALPHA * 255);
  }
  return px;
}

/** 래스터 네 모서리 → 위경도 경계 */
function bounds(t) {
  const g = geoRef(t);
  const x0 = g.originX, y0 = g.originY;
  const x1 = x0 + t.width * g.scaleX;
  const y1 = y0 - t.height * g.scaleY;              // 북 → 남으로 내려갑니다
  const [wLng, nLat] = toLatLng.forward([x0, y0]);
  const [eLng, sLat] = toLatLng.forward([x1, y1]);
  return {
    sw: [Number(sLat.toFixed(6)), Number(wLng.toFixed(6))],
    ne: [Number(nLat.toFixed(6)), Number(eLng.toFixed(6))],
  };
}

/* ════════════════════════════════════════════════════════════════════ */

const only = process.argv[2] || null;
const slugs = Object.keys(REGIONS).filter((s) => !only || s === only);
if (!slugs.length) { console.error(`지자체 slug 를 찾지 못했습니다: ${only}`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });

const index = {};
let made = 0, skipped = 0, bytes = 0;
const problems = [];
const started = Date.now();

console.log(`히트맵 변환 — 지자체 ${slugs.length}곳 × 분야 ${Object.keys(FOLDER).length}개`);
console.log(`축소 ${SHRINK}배(${10 * SHRINK}m) · 기준 분위수 ${TOP_QUANTILE}\n`);

for (const slug of slugs) {
  const label = REGIONS[slug].short;
  const row = {};
  const marks = [];

  for (const [cat, folder] of Object.entries(FOLDER)) {
    const file = findTif(folder, slug);
    if (!file) { skipped++; marks.push(`${cat.slice(0, 3)}—`); continue; }

    try {
      const t = readHeader(file);
      const grid = downsample(file, t);
      const top = quantile(grid.data, TOP_QUANTILE);
      if (!top) { skipped++; marks.push(`${cat.slice(0, 3)}∅`); continue; }

      const png = encodePng(colorize(grid, COLOR[cat], top), grid.width, grid.height);
      const name = `${slug}_${cat}.png`;
      fs.writeFileSync(path.join(OUT, name), png);
      bytes += png.length;
      made++;

      row[cat] = {
        png: name,
        bounds: bounds(t),
        size: [grid.width, grid.height],
        /* 색의 기준값 — 화면 범례에 쓰고, 나중에 되짚을 수 있게 남깁니다 */
        top: Number(top.toFixed(2)),
        max: Number((quantile(grid.data, 1) || 0).toFixed(2)),
      };
      marks.push(`${cat.slice(0, 3)}${Math.round(png.length / 1024)}K`);
    } catch (e) {
      problems.push(`${slug}/${cat}: ${e.message}`);
      marks.push(`${cat.slice(0, 3)}✗`);
    }
  }

  if (Object.keys(row).length) index[slug] = { label: REGIONS[slug].label, layers: row };
  console.log(`  ${label.padEnd(10)} ${marks.join(' ')}`);
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  source: '강원대 QGIS 커널밀도 분석 결과 (AURI 제공) — 밀도값은 재계산하지 않고 그대로 사용',
  generatedAt: new Date().toISOString().slice(0, 10),
  resolutionM: 10 * SHRINK,
  topQuantile: TOP_QUANTILE,
  maxAlpha: MAX_ALPHA,
  note: '색은 그 지자체·그 분야 안에서의 상대값입니다. 지역 간·분야 간 색 비교는 할 수 없습니다.',
  regions: index,
}, null, 1));

console.log(`\n완료 — PNG ${made}장 · ${(bytes / 1e6).toFixed(1)}MB · ${((Date.now() - started) / 1000).toFixed(0)}초`);
if (skipped) console.log(`  건너뜀 ${skipped}건 (원본 없음 또는 값이 전부 비어 있음)`);
if (problems.length) {
  console.log(`\n⚠️ 실패 ${problems.length}건`);
  for (const p of problems.slice(0, 15)) console.log('   ' + p);
}
