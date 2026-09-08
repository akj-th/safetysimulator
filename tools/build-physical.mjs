/* ════════════════════════════════════════════════════════════════════
   물적환경 회귀분석 → assets/physical.json   (강원대 자료, 2026-09-04)

   무엇인가
   ────────
   강원대가 격자마다 "그 자리에 무엇이 있는가"(노후건축물 비율·버스정류장
   밀도·상업지역 면적 …)를 세어 두고, **그것이 사고 건수와 얼마나 이어지는지**
   를 회귀분석으로 계산한 결과입니다.

   사전진단서 원문의 이런 문장이 여기서 나옵니다.
     "노후건축물 밀도, 버스정류장 밀도, 일반음식점 밀도, 상업지역 면적 등이
      범죄위험과 관련성이 높은 요인으로 확인됨"

   우리가 하는 일 / 하지 않는 일
   ────────────────────────────
   ✅ 유의한 것만 골라내고, 약어를 한글 이름으로 바꾸고, 강한 순으로 줄 세움
   ❌ 회귀분석을 다시 돌리지 않습니다. 계수를 손보지도 않습니다.
      (팔레트와 같은 원칙 — 원자료를 옮겨 담기만 합니다)

   ⚠️ **7개 지자체에만 있습니다.** 부천·광주북구·공주·관악·홍천·남원·영천.
      나머지 34곳은 이 자료가 없어 문서에서 이 줄이 아예 안 나옵니다.

   쓰는 법:  npm run physical --prefix tools
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'assets/physical.json');

/* 강원대 위험유형 코드 → 우리 분야 열쇠 */
const CAT = {
  CRIME: 'crime', FIRE: 'fire', INFEST: 'infection', LIFE: 'life',
  SUICIDE: 'suicide', TRAFFIC: 'traffic', INDUSTRY: 'industrial',
};

/* ── ① 약어표 읽기 (DB_약어.xlsx) ─────────────────────────────────
   약어 칸에 `ROAD_1/ROAD_1_P` 처럼 **둘이 빗금으로 붙어** 있습니다.
   회귀분석에는 둘 중 하나만 나오므로 각각 따로 등록합니다.       */
function readAbbr() {
  const dict = {};
  const file = path.join(RAW, 'analysis_0904/DB_약어.xlsx');
  for (const sheet of readXlsx(file)) {
    for (const r of sheet.rows.slice(1)) {
      if (!r || !r[2]) continue;
      const ko = String(r[1] || '').trim();
      const kind = String(r[0] || '').trim();
      for (const a of String(r[2]).split('/').map((s) => s.trim()).filter(Boolean)) {
        if (!dict[a]) dict[a] = { ko, kind };
      }
    }
  }
  return dict;
}

/* ── ② 회귀분석 결과 읽기 ─────────────────────────────────────────
   `유의한_영향요인` 시트가 이미 유의한 것만 걸러 놓았습니다.
   우리가 p값으로 다시 거르지 않는 이유 — 어떤 기준으로 걸렀는지는
   분석한 쪽이 정할 일이고, 우리가 다시 걸면 두 문서가 어긋납니다.   */
function readRegression(file) {
  const sheets = readXlsx(file);
  const sig = sheets.find((s) => s.name === '유의한_영향요인');
  if (!sig) throw new Error(`'유의한_영향요인' 시트가 없습니다: ${file}`);

  const head = sig.rows[0].map((c) => String(c || '').trim());
  const col = (n) => {
    const i = head.indexOf(n);
    if (i < 0) throw new Error(`'${n}' 열을 찾지 못했습니다: ${file}`);
    return i;
  };
  const c = {
    city: col('도시'), type: col('위험유형'), v: col('변수'),
    irr: col('IRR'), pct: col('효과변화율(%)'), p: col('p값'),
    dir: col('영향방향'), model: col('최종모형'),
  };

  const out = {};
  let skipped = 0;
  for (const r of sig.rows.slice(1)) {
    if (!r || !r[c.city]) continue;
    const cat = CAT[String(r[c.type]).trim()];
    if (!cat) { skipped++; continue; }
    const city = String(r[c.city]).trim();
    const pct = Number(r[c.pct]);
    ((out[city] ||= {})[cat] ||= []).push({
      v: String(r[c.v]).trim(),
      irr: Number(Number(r[c.irr]).toFixed(3)),
      pct: Number(pct.toFixed(1)),
      p: Number(Number(r[c.p]).toExponential(2)),
      up: String(r[c.dir]).includes('정(+)'),
      model: String(r[c.model]).trim(),
    });
  }

  /* 영향이 큰 순 — 늘리든 줄이든 **변화 폭이 큰 것**이 먼저 옵니다 */
  for (const city of Object.values(out)) {
    for (const list of Object.values(city)) list.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }
  return { out, skipped };
}

/* ── ③ 만들기 ────────────────────────────────────────────────── */
const abbr = readAbbr();
console.log(`약어표 ${Object.keys(abbr).length}개를 읽었습니다`);

const inside = readRegression(path.join(RAW, '물적환경_0904/조사지내_회귀분석_7개의 대상지.xlsx'));
const region = readRegression(path.join(RAW, '물적환경_0904/지역전체_회귀분석_7개의 대상지.xlsx'));

/* 실제로 쓰인 변수가 약어표에 다 있는지 — 없으면 문서에 약어가 그대로 찍힙니다 */
const used = new Set();
for (const src of [inside.out, region.out]) {
  for (const city of Object.values(src)) {
    for (const list of Object.values(city)) for (const it of list) used.add(it.v);
  }
}
const missing = [...used].filter((v) => !abbr[v]);
if (missing.length) {
  console.log(`\n⚠️ 약어표에 없는 변수 ${missing.length}개 — 문서에 약어가 그대로 나옵니다`);
  console.log('   ' + missing.join(', '));
}

/* ── 한글 이름이 겹치는 약어 — AURI 확인이 필요한 자리 ──────────────
   약어표가 `ROAD_2/ROAD_2_P` 처럼 두 약어를 한 줄에 적어 두어 이름이
   같아집니다. 회귀분석에서는 둘이 따로 들어가고 방향이 반대인 경우도
   있어, 문서에서는 약어를 괄호로 덧붙여 구분합니다(assets/physical.js).
   여기서는 어떤 것이 겹치는지 알려 주기만 합니다.                   */
const byKo = {};
for (const v of used) if (abbr[v]) (byKo[abbr[v].ko] ||= []).push(v);
const dup = Object.entries(byKo).filter(([, list]) => list.length > 1);
if (dup.length) {
  console.log(`\n⚠️ 한글 이름이 겹치는 약어 ${dup.length}쌍 — 문서에는 약어를 괄호로 붙여 구분합니다`);
  for (const [ko, list] of dup) console.log(`   ${ko}  ←  ${list.join(' , ')}`);
  console.log('   → 둘이 무엇이 다른지 AURI 확인 필요 (길이 vs 비율로 짐작되나 표에 없음)');
}

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const labelOf = (key) => {
  const r = index.regions.find((x) => x.region === key);
  return r ? r.label : null;
};

const cities = [...new Set([...Object.keys(inside.out), ...Object.keys(region.out)])].sort();
const regions = {};
for (const key of cities) {
  const label = labelOf(key);
  if (!label) console.log(`⚠️ ${key}: 우리 통계에 없는 지자체입니다`);
  regions[key] = {
    label: label || key,
    inside: inside.out[key] || {},
    region: region.out[key] || {},
  };
}

/* 변수 사전은 **실제로 쓰인 것만** 담습니다 (파일을 작게 유지) */
const vars = {};
for (const v of [...used].sort()) if (abbr[v]) vars[v] = abbr[v].ko;

const json = {
  source: '강원대학교 물적환경 회귀분석 (2026-09-04) · 변수명은 DB_약어.xlsx',
  note: '유의한_영향요인 시트만 옮겨 담은 것입니다. 회귀분석을 다시 계산하지 않았습니다.',
  generatedAt: new Date().toISOString().slice(0, 10),
  effectBasis: '설명변수 1 표준편차 증가 시 사고 건수의 변화율(%)',
  vars,
  regions,
};
fs.writeFileSync(OUT, JSON.stringify(json));

/* ── ④ 요약 ──────────────────────────────────────────────────── */
console.log('\n지자체       조사지 내(분야·요인수)              지역 전체');
console.log('─'.repeat(76));
const CAT_KO = index.categories;
for (const key of cities) {
  const r = regions[key];
  const brief = (o) => Object.keys(o).map((c) => `${CAT_KO[c]}${o[c].length}`).join(' ') || '없음';
  console.log(`${key.padEnd(12)} ${brief(r.inside).padEnd(36)} ${brief(r.region)}`);
}
const n = (src) => Object.values(src).reduce((a, c) => a + Object.values(c).reduce((b, l) => b + l.length, 0), 0);
console.log(`\n지자체 ${cities.length}곳 · 유의한 요인 조사지내 ${n(inside.out)}건 · 지역전체 ${n(region.out)}건 · 변수 ${Object.keys(vars).length}종`);
console.log(`→ assets/physical.json (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
