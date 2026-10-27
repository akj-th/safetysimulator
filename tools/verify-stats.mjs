/* ════════════════════════════════════════════════════════════════════
   집계 결과 점검 — AURI 가 낸 값과 맞는지 대조합니다

   실행:  node tools/verify-stats.mjs

   우리가 만든 data/stats/ 의 숫자를 두 곳의 정답과 맞춰 봅니다.

     ① 사전진단서_경기 부천시.pdf  [표 2] 안전분야별 사고 분포
     ② 대표_위험_선정_기준_표본수추가.xlsx  시트 `표본수_전체`
        (41개 지자체 × 7개 분야 전부 — 조사지 내 / 지자체 전체)

   ②는 강원대가 직접 센 값이라, 41×7 = 287칸이 모두 맞으면
   조사지 판정과 지자체 매칭이 통째로 검증됩니다.

   ※ 자살만 기준이 다릅니다. 강원대는 구급출동에 '자살발생지점'
     자료를 더해 세었고(부천 1404건), 우리는 구급출동만 씁니다(926건).
     자살발생지점 원본을 받지 못했고 사전진단서 3·4장도 구급출동
     기준이기 때문입니다. 그래서 자살은 대조에서 빼고 따로 표시합니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';
import { slugForXlsx, CATEGORY_BY_KOREAN, CATEGORY_LABEL } from './lib/regions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATS = path.join(ROOT, 'data/stats/regions');
const XLSX_PATH = path.join(ROOT, 'data/raw/analysis_0901/대표_위험_선정_기준_표본수추가.xlsx');

let errors = 0, warns = 0, checked = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); errors++; };
const warn = (m) => { console.log(`  ! ${m}`); warns++; };

const load = (slug) => JSON.parse(fs.readFileSync(path.join(STATS, `${slug}.json`), 'utf8'));

/* ── ① 사전진단서 [표 2] — 부천시 ───────────────────────────────── */

console.log('① 사전진단서 [표 2] 대조 (경기도 부천시)\n');

const BUCHEON_TABLE = {
  crime:      [1929, 530, 27.48],
  suicide:    [926, 180, 19.44],
  infection:  [256, 43, 16.80],
  fire:       [364, 59, 16.21],
  life:       [16815, 2680, 15.94],
  traffic:    [6313, 904, 14.32],
  industrial: [762, 79, 10.37],
};

const bucheon = load('bucheon');
console.log('  분야       │ 지자체 전체 │ 조사지 내 │ 발생비율 │ 진단서 값');
console.log('  ───────────┼─────────────┼───────────┼──────────┼──────────────────');
for (const [cat, [region, inside, share]] of Object.entries(BUCHEON_TABLE)) {
  const c = bucheon.categories[cat];
  const ok = c && c.count.region === region && c.count.inside === inside
             && Math.abs(c.count.share - share) < 0.05;
  checked++;
  if (!ok) fail(`${CATEGORY_LABEL[cat]}: ${c ? `${c.count.region}/${c.count.inside}/${c.count.share}` : '없음'} ≠ ${region}/${inside}/${share}`);
  console.log(`  ${CATEGORY_LABEL[cat].padEnd(9)} │ ${String(c.count.region).padStart(11)} │ ${String(c.count.inside).padStart(9)} │ ${String(c.count.share).padStart(7)}% │ ${region}/${inside}/${share} ${ok ? '✓' : '✗'}`);
}

const insideSum = Object.values(bucheon.categories).reduce((n, c) => n + c.count.inside, 0);
console.log(`\n  조사지 내 합계 ${insideSum}건 (진단서 4,475건) ${insideSum === 4475 ? '✓' : '✗'}`);
if (insideSum !== 4475) fail(`조사지 내 합계가 다릅니다: ${insideSum}`);
checked++;

/* ── ② 강원대 표본수 표 — 41개 지자체 전체 ──────────────────────── */

console.log('\n\n② 강원대 표본수 표 대조 (41개 지자체 × 6개 분야, 자살 제외)\n');

const sheet = readXlsx(XLSX_PATH).find((s) => s.name === '표본수_전체');
if (!sheet) throw new Error('엑셀에 "표본수_전체" 시트가 없습니다');

/* 헤더: 0=시·도 1=지자체 2~8=분야별 "조사지내/전체 (비율%)" */
const header = sheet.rows[0];
const cols = [];
for (let i = 2; i <= 8; i++) {
  const key = CATEGORY_BY_KOREAN[(header[i] || '').trim()];
  if (key) cols.push([i, key]);
}

const parseCell = (v) => {
  const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String(v || ''));
  return m ? { inside: +m[1], region: +m[2] } : null;
};

let matched = 0, mismatched = 0;
const suicideRows = [];

for (const row of sheet.rows.slice(1)) {
  if (!row || !row[1]) continue;
  const slug = slugForXlsx(row[1]);
  if (!slug) { warn(`엑셀 지자체를 매칭하지 못했습니다: "${row[1]}"`); continue; }
  const data = load(slug);

  for (const [i, key] of cols) {
    const ref = parseCell(row[i]);
    if (!ref) continue;
    const c = data.categories[key];
    const got = c ? c.count : { inside: 0, region: 0 };

    if (key === 'suicide') {           // 기준이 달라 대조하지 않고 따로 모읍니다
      suicideRows.push([data.shortLabel, got.inside, got.region, ref.inside, ref.region]);
      continue;
    }
    checked++;
    if (got.inside === ref.inside && got.region === ref.region) matched++;
    else {
      mismatched++;
      fail(`${data.shortLabel} ${CATEGORY_LABEL[key]}: 우리 ${got.inside}/${got.region} ≠ 강원대 ${ref.inside}/${ref.region}`);
    }
  }
}

console.log(`  일치 ${matched}칸 / 불일치 ${mismatched}칸`);

console.log('\n  [참고] 자살은 기준이 달라 대조 대상이 아닙니다');
console.log('  지자체        우리(구급출동만)   강원대(구급+발생지점)');
for (const [name, gi, gr, ri, rr] of suicideRows.slice(0, 6)) {
  console.log(`  ${name.padEnd(12)} ${String(gi).padStart(5)}/${String(gr).padStart(5)}      ${String(ri).padStart(5)}/${String(rr).padStart(5)}`);
}
console.log(`  … 41개 지자체 전부 우리 값이 더 작습니다 (자살발생지점 자료 미수신)`);

/* ── ③ 자체 정합성 ─────────────────────────────────────────────── */

console.log('\n\n③ 파일 자체 정합성\n');

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
for (const entry of index.regions) {
  const d = load(entry.region);
  checked++;

  const sumRegion = Object.values(d.categories).reduce((n, c) => n + c.count.region, 0);
  const sumInside = Object.values(d.categories).reduce((n, c) => n + c.count.inside, 0);
  if (sumRegion !== d.totals.region) fail(`${entry.region}: 분야 합계 ${sumRegion} ≠ 총계 ${d.totals.region}`);
  if (sumInside !== d.totals.inside) fail(`${entry.region}: 조사지 분야 합계 ${sumInside} ≠ 총계 ${d.totals.inside}`);

  const dongSum = Object.values(d.byDong).reduce((n, x) => n + x.total.region, 0);
  if (dongSum !== d.totals.region) fail(`${entry.region}: 읍면동 합계 ${dongSum} ≠ 총계 ${d.totals.region}`);

  if (!d.surveyArea) fail(`${entry.region}: 조사지 경계가 없습니다`);
  /* 중점분야 — 지수 기준이면 3개(자살 + 하위 2), tools/config/focus-override.json 으로 정한 곳은 개수 제한 없음 (2026-10-27) */
  const want3 = !String(d.focusSource || '').includes('직접 지정');
  if (!d.focusTypes || !d.focusTypes.length || (want3 && d.focusTypes.length !== 3)) fail(`${entry.region}: 중점분야가 ${want3 ? '3개가' : '1개 이상이'} 아닙니다 (${(d.focusTypes || []).length}개)`);
  else for (const t of d.focusTypes) if (!t.key) fail(`${entry.region}: 안전유형 "${t.label}" 을 분야 key 로 바꾸지 못했습니다`);

  /* 격자 집계와 통계의 총건수가 같아야 합니다 */
  const grid = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/incidents', `${entry.region}.json`), 'utf8'));
  const gridTotal = Object.values(grid.categories).reduce((n, c) => n + c.total, 0);
  if (gridTotal !== d.totals.region) fail(`${entry.region}: 격자 ${gridTotal}건 ≠ 통계 ${d.totals.region}건`);
}
console.log(`  지자체 ${index.regions.length}개 점검 완료`);

/* 표본이 적어 비율을 그대로 읽으면 안 되는 곳 */
console.log('\n\n④ 표본 부족 경고 (조사지 내 30건 미만 — 리포트에 "참고값" 표기 필요)\n');
let low = 0, lowRegions = 0;
for (const entry of index.regions) {
  const d = load(entry.region);
  const bad = (d.focusTypes || [])
    .filter((t) => t.key && d.categories[t.key] && !d.categories[t.key].sample.reliable)
    .map((t) => `${t.label}(n=${d.categories[t.key].count.inside})`);
  if (bad.length) { lowRegions++; low += bad.length; console.log(`  ${d.shortLabel.padEnd(10)} ${bad.join(' · ')}`); }
}
console.log(`\n  중점분야 중 표본 부족: ${lowRegions}개 지자체 / ${low}개 분야`);

/* ── ⑤ 파일 사이 일치 (2026-10-27 점검) ─────────────────────────────
   중점분야를 바꾸면(지수·직접 지정) 통계 → 동별 HEA → 현장평가 → 거점 순으로 다시 만들어야 합니다(npm run focus-all).
   한 단계라도 빠지면 화면마다 다른 분야를 말하게 되므로 여기서 잡습니다. */
console.log('\n\n⑤ 파일 사이 일치 — 지수 기준 분야 = 통계 = 동별 HEA = 거점 · 현장평가 = 동 이름\n');
const readJ = (p) => (fs.existsSync(path.join(ROOT, p)) ? JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) : null);
const si = readJ('data/stats/safety-index.json'), survey = readJ('data/stats/field-survey.json'), hot = readJ('data/stats/hotspots.json');
const setOf = (a) => [...new Set(a)].sort().join(',');
let crossChecked = 0;
for (const entry of index.regions) {
  const slug = entry.region, d = load(slug);
  const stat = setOf((d.focusTypes || []).map((t) => t.key));
  const idx = setOf((entry.focusTypes || []).map((t) => (typeof t === 'string' ? t : t.label)).filter(Boolean));   // index.json 은 한글 이름
  const fromSi = si && si.regions[slug] ? setOf(si.regions[slug].focusByIndex) : null;
  const dong = readJ(`data/dong/${slug}.json`);
  const hea = dong ? setOf((dong.heaCategories || []).map((c) => c.key)) : null;
  const hp = hot && hot.regions && hot.regions[slug] && hot.regions[slug][0] ? setOf(Object.keys(hot.regions[slug][0].parts || {})) : null;
  if (fromSi && stat !== fromSi) fail(`${slug}: 통계 중점분야 ${stat} ≠ 지역안전지수 ${fromSi} — npm run focus 다시`);
  const statLabels = setOf((d.focusTypes || []).map((t) => t.label));
  if (idx && statLabels !== idx) fail(`${slug}: index.json 중점분야 ${idx} ≠ 통계 ${statLabels}`);
  if (hea && hea !== stat) fail(`${slug}: 동별 HEA 분야 ${hea} ≠ 중점분야 ${stat} — npm run dong-hea 다시`);
  if (hp && hp !== stat) fail(`${slug}: 거점 분야 ${hp} ≠ 중점분야 ${stat} — npm run hotspots 다시 (거점 글자가 바뀌니 DB 거점 보정 정리)`);
  if (dong && survey) {
    const sv = survey.regions[slug] || {};
    const names = dong.dongs.map((x) => x.name);
    const miss = names.filter((n) => sv[n] == null), extra = Object.keys(sv).filter((n) => !names.includes(n));
    if (miss.length || extra.length) fail(`${slug}: 현장평가 동 이름이 동별 HEA 와 다름 (없음 ${miss.join('·') || '-'} / 남음 ${extra.join('·') || '-'}) — node tools/build-field-survey.mjs 다시`);
  }
  crossChecked++;
}
console.log(`  지자체 ${crossChecked}곳 점검`);

/* ── 마무리 ────────────────────────────────────────────────────── */

console.log('\n' + '─'.repeat(60));
console.log(`점검 ${checked}건 · 오류 ${errors}건 · 경고 ${warns}건`);
if (errors) { console.log('\n✗ 오류가 있습니다.'); process.exit(1); }
console.log('\n✓ 모두 통과했습니다.');
