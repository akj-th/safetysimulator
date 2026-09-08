/* ════════════════════════════════════════════════════════════════════
   강원대 산출값 ↔ 우리 계산값 대조 (2026-09-08)

   강원대가 0904 자료로 연령·성별 비율을 직접 산출해 보내왔습니다.
   우리도 같은 119 CSV 로 같은 값을 계산해 두었으므로, **두 값이 맞는지**
   먼저 확인해야 어느 쪽을 정본으로 쓸지 정할 수 있습니다.

   이 도구는 **판단하지 않습니다.** 차이만 보여 줍니다.

   쓰는 법:  node compare-kangwon.mjs [지자체이름 …]
             (아무것도 안 적으면 부천시·인천시 미추홀구)
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const KW = path.join(ROOT, 'data/raw/인적 특성 결과_0904/인적 특성 결과_0904');
const STATS = path.join(ROOT, 'data/stats');

/* ── 강원대 시트 이름 → 우리 분야 열쇠 ────────────────────────── */
const CAT_BY_SHEET = {
  감염병: 'infection', 교통사고: 'traffic', 산업재해: 'industrial',
  범죄: 'crime', 생활안전: 'life', 자살: 'suicide', 화재: 'fire',
};

/* ── 강원대 연령 칸 이름 → 우리 10년 단위 칸 ───────────────────
   `60대` 는 60-64 + 65-69 의 **소계**라 총합에 두 번 세면 안 됩니다.
   그래서 소계 칸은 건너뛰고 60-64·65-69 만 씁니다.            */
const KW_AGE_COLS = [
  '1-9세', '10-19세', '20대', '30대', '40대', '50대',
  '60-64세', '65-69세', '60대', '70대', '80대', '90대', '100세이상',
];
const SUBTOTAL_COLS = new Set(['60대']);           // 소계 — 합산 제외
const TO_BUCKET = {
  '1-9세': '0-9', '10-19세': '10-19', '20대': '20-29', '30대': '30-39',
  '40대': '40-49', '50대': '50-59', '60-64세': '60-69', '65-69세': '60-69',
  '70대': '70-79', '80대': '80+', '90대': '80+', '100세이상': '80+',
};

/** 한 파일(조사지내 / 지역전체) 을 { 지자체: { 분야: {counts, sexM, sexF} } } 로 */
function readKangwon(file) {
  const out = {};
  for (const sheet of readXlsx(file)) {
    const cat = CAT_BY_SHEET[sheet.name];
    if (!cat) continue;

    /* 2행이 열 이름, 3행부터 지자체 */
    const head = (sheet.rows[1] || []).map((c) => (c == null ? '' : String(c).trim()));
    const colOf = (label, from = 0) => head.indexOf(label, from);

    const ageCol = {};
    for (const c of KW_AGE_COLS) ageCol[c] = colOf(c);
    const totalCol = colOf('연령 총합');
    const maleCol = colOf('남');
    const femaleCol = colOf('여');

    for (const row of sheet.rows.slice(2)) {
      const name = row && row[0] ? String(row[0]).trim() : '';
      if (!name) continue;
      const num = (i) => (i >= 0 && row[i] !== undefined && row[i] !== '' ? Number(row[i]) : 0);

      const counts = {};
      for (const c of KW_AGE_COLS) counts[c] = num(ageCol[c]);
      (out[name] ||= {})[cat] = {
        counts,
        ageTotal: num(totalCol),
        male: num(maleCol),
        female: num(femaleCol),
      };
    }
  }
  return out;
}

/** 강원대 원자료 칸 → 우리와 같은 기준(10년 단위 비율·20~49·65+) 으로 */
function toOurShape(k) {
  const denom = k.ageTotal;
  const buckets = {};
  let u20 = 0; let a2049 = 0; let a65 = 0;
  for (const c of KW_AGE_COLS) {
    if (SUBTOTAL_COLS.has(c)) continue;
    const n = k.counts[c] || 0;
    if (!n) continue;
    const b = TO_BUCKET[c];
    buckets[b] = (buckets[b] || 0) + n;
    if (c === '1-9세' || c === '10-19세') u20 += n;
    if (c === '20대' || c === '30대' || c === '40대') a2049 += n;
    if (c === '65-69세' || c === '70대' || c === '80대' || c === '90대' || c === '100세이상') a65 += n;
  }
  const pct = (n) => (denom ? +((n / denom) * 100).toFixed(1) : null);
  const bucketPct = {};
  for (const b of Object.keys(buckets)) bucketPct[b] = pct(buckets[b]);
  const sexN = k.male + k.female;
  return {
    n: denom,
    u20: pct(u20),
    a2049: pct(a2049),
    a65: pct(a65),
    buckets: bucketPct,
    sexN,
    male: sexN ? +((k.male / sexN) * 100).toFixed(1) : null,
  };
}

/* ── 대조 ────────────────────────────────────────────────────── */
const index = JSON.parse(fs.readFileSync(path.join(STATS, 'index.json'), 'utf8'));
const CAT_LABEL = index.categories;

const inside = readKangwon(path.join(KW, '조사지내_연령성별_최종.xlsx'));
const whole = readKangwon(path.join(KW, '지역전체_연령성별_최종.xlsx'));

/* 강원대는 `인천시 미추홀구`, 우리 index 는 `미추홀구` — 이름을 이어 줍니다 */
function findRegion(kwName) {
  const tail = kwName.split(/\s+/).pop();
  return index.regions.find((r) => r.short === kwName)
      || index.regions.find((r) => r.short === tail)
      || index.regions.find((r) => r.label.includes(tail));
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = want.length ? want : ['부천시', '인천시 미추홀구'];

const AGE_KEYS = [['u20', '20세이하'], ['a2049', '20~49세'], ['a65', '65세이상']];
const BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const fmt = (v) => (v == null ? '  —  ' : String(v.toFixed ? v.toFixed(1) : v).padStart(5));

/* 버킷 단위 대조 — 구간 정의가 같은 자리끼리만 비교합니다.
   (20세이하·20~49세 같은 묶음은 우리와 강원대의 경계가 달라 따로 봅니다) */
const showBuckets = process.argv.includes('--buckets');

let rows = 0; let big = 0;
let bRows = 0; let bBig = 0;

for (const t of targets) {
  const kwName = Object.keys(inside).find((n) => n === t || n.endsWith(t)) || t;
  const reg = findRegion(kwName);
  if (!reg) { console.log(`\n⚠️ ${t}: 우리 통계에서 지자체를 찾지 못했습니다`); continue; }

  const our = JSON.parse(fs.readFileSync(path.join(STATS, 'regions', `${reg.region}.json`), 'utf8'));
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`■ ${reg.label}  (강원대 표기: ${kwName})`);

  for (const scope of [['inside', '조사지 내', inside], ['region', '지역 전체', whole]]) {
    const [ourKey, scopeLabel, src] = scope;
    const kwRegion = src[kwName];
    if (!kwRegion) { console.log(`\n  [${scopeLabel}] 강원대 자료에 없음`); continue; }

    console.log(`\n  [${scopeLabel}]`);
    console.log('  분야      항목        강원대   우리    차이   표본(강원대/우리)');
    console.log('  ' + '─'.repeat(70));

    for (const cat of index.categoryOrder) {
      const kw = kwRegion[cat];
      const oc = our.categories[cat] && our.categories[cat][ourKey];
      if (!kw || !oc || !oc.age) continue;
      const k = toOurShape(kw);
      const o = oc.age;

      /* ① 10년 단위 칸 — 구간 경계가 서로 같은 자리 */
      if (showBuckets) {
        for (const b of BUCKETS) {
          const kv = k.buckets[b] ?? 0;
          const ov = o.buckets[b] ?? 0;
          const d = +(kv - ov).toFixed(1);
          bRows++; if (Math.abs(d) >= 1) bBig++;
          console.log(`  ${CAT_LABEL[cat].padEnd(5)} ${('칸 ' + b).padEnd(9)} ${fmt(kv)}%  ${fmt(ov)}%  ${d === 0 ? ' 0.0' : (d > 0 ? '+' : '') + d.toFixed(1)}   ${String(k.n).padStart(5)} / ${String(o.n).padStart(5)}`);
        }
      }

      /* ② 묶음 — 경계 정의가 서로 다를 수 있는 자리 */
      for (const [key, label] of AGE_KEYS) {
        const d = (k[key] == null || o[key] == null) ? null : +(k[key] - o[key]).toFixed(1);
        rows++; if (d != null && Math.abs(d) >= 1) big++;
        console.log(`  ${CAT_LABEL[cat].padEnd(5)} ${label.padEnd(9)} ${fmt(k[key])}%  ${fmt(o[key])}%  ${d == null ? '  — ' : (d > 0 ? '+' : '') + d.toFixed(1)}   ${String(k.n).padStart(5)} / ${String(o.n).padStart(5)}`);
      }
      /* 성별 */
      const os = oc.sex;
      if (os) {
        const d = (k.male == null || os.male == null) ? null : +(k.male - os.male).toFixed(1);
        rows++; if (d != null && Math.abs(d) >= 1) big++;
        console.log(`  ${CAT_LABEL[cat].padEnd(5)} ${'남성비율'.padEnd(8)} ${fmt(k.male)}%  ${fmt(os.male)}%  ${d == null ? '  — ' : (d > 0 ? '+' : '') + d.toFixed(1)}   ${String(k.sexN).padStart(5)} / ${String(os.n).padStart(5)}`);
      }
    }
  }
}

console.log(`\n${'═'.repeat(78)}`);
if (showBuckets) console.log(`10년 단위 칸 대조 ${bRows}칸 · 1%p 이상 벌어진 칸 ${bBig}개`);
console.log(`묶음(20세이하·20~49·65+·남성) 대조 ${rows}칸 · 1%p 이상 벌어진 칸 ${big}개`);
