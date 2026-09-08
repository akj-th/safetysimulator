/* ════════════════════════════════════════════════════════════════════
   강원대 사고유형 산출값 ↔ 우리 계산값 대조 (2026-09-08)

   `compare-kangwon.mjs` 가 연령·성별을 대조하는 것과 짝입니다.
   이 도구는 **판단하지 않습니다.** 차이만 보여 줍니다.

   ★ 먼저 알아야 할 것 — 분야마다 축이 다릅니다 ─────────────────────
   강원대 "사고유형" 시트는 분야마다 **서로 다른 것**을 세고 있습니다.
   119 원본의 어느 칸을 쓴 것인지 값 집합을 맞대어 확인한 결과입니다.

     시트        원본 칸    우리와 같은 축인가
     ──────────  ────────  ─────────────────────────────────────
     감염병       type      ✅ 100% 같음 — 항목별로 그대로 대조됨
     교통사고     type      ✅ 100% 같음 — 항목별로 그대로 대조됨
     화재         발생장    ❌ 강원대가 **재분류**함 (10개 중 3개만 일치)
     범죄         발생장    ❌ 재분류 (10개 중 3개)
     자살         발생장    ❌ 재분류 (12개 중 2개)
     산업재해     질병외_   ❌ 재분류 (18개 중 5개)
     생활안전     type      ❌ 재분류 (15개 중 5개)

   그래서 **감염병·교통사고는 항목별로** 대조하고, 나머지 다섯은 항목을
   맞댈 수 없으므로 **총건수만** 대조하고 분류 차이를 보여 줍니다.

   ★ 교통사고는 열이 두 벌입니다 ────────────────────────────────────
   차종마다 `교통사고` / `교통사고 다발지역` 두 열이 있고 세 번째가 합계입니다.
   우리는 **구급출동만** 쓰므로 `교통사고` 열과 맞대야 합니다.
   (다발지역까지 합친 열과 비교하면 우리가 적게 나오는 것이 당연합니다)

   ★★ 조사지내 교통사고 시트는 **이름과 값이 어긋나 있습니다** (2026-09-08 발견)
   지자체 이름은 가나다순인데 값은 **영문 지역코드 알파벳순**으로 붙었습니다.
   41행 전부 밀려 있어, 이 시트를 그대로 쓰면 모든 지자체가 남의 값을 봅니다.

     시트의 "부천시" 행 10건    → 실제로는 **장수군** 값
     시트의 "서울시 관악구" 2,146 → 실제로는 **제주도** 값
     시트의 "강진군" 768       → 실제로는 **안동시** 값

   근거: 제 이름과 맞는 행 4개 / 영문순으로 맞춰 보면 39개 일치.
   같은 점검을 다른 시트에 돌리면 지역전체 교통사고는 40 대 4 로 **정상**입니다.
   → 아래 `checkAlignment()` 가 이 점검을 자동으로 합니다. AURI 확인 요청함.

   쓰는 법:  node compare-kangwon-type.mjs [지자체이름 …]
             (아무것도 안 적으면 부천시·인천시 미추홀구)
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const KW = path.join(ROOT, 'data/raw/사고유형 특성_0904');
const STATS = path.join(ROOT, 'data/stats');

/* 시트 이름 → 우리 분야 열쇠 */
const CAT_BY_SHEET = {
  화재: 'fire', 감염병: 'infection', 교통사고: 'traffic', 범죄: 'crime',
  산업재해: 'industrial', 생활안전: 'life', 자살: 'suicide',
};

/* 우리 통계에서 맞대어 볼 축 (위 표 참고).
   same:true 인 것만 항목별 대조가 성립합니다. */
const AXIS = {
  infection: { field: 'type', same: true, src: 'type' },
  traffic: { field: 'type', same: true, src: 'type' },
  fire: { field: 'place', same: false, src: '발생장' },
  crime: { field: 'place', same: false, src: '발생장' },
  suicide: { field: 'place', same: false, src: '발생장' },
  industrial: { field: 'cause', same: false, src: '질병외_' },
  life: { field: 'type', same: false, src: 'type' },
};

/* ── 강원대 시트 읽기 ─────────────────────────────────────────────
   머리행이 두 줄(교통사고만 세 줄)이고, 앞쪽 절반이 건수·뒤쪽 절반이
   비율입니다. 'sum' 이 처음 나오는 자리가 건수 구간의 끝입니다.      */
function readSheet(sheet) {
  const rows = sheet.rows;
  const isTraffic = sheet.name === '교통사고';

  /* 교통사고는 셋째 줄에 `교통사고` / `교통사고 다발지역` 이 적혀 있습니다.
     우리는 구급출동만 쓰므로 `교통사고` 열만 골라 냅니다. */
  if (isTraffic) {
    const r1 = (rows[1] || []).map((c) => String(c || '').trim());   // 차종 (병합셀 첫 칸)
    const r2 = (rows[2] || []).map((c) => String(c || '').trim());   // 교통사고 / 다발지역 / 합계
    const cols = [];
    let cur = '';
    for (let i = 1; i < r2.length; i++) {
      if (r1[i]) cur = r1[i];                     // 새 차종이 시작되는 칸
      if (r2[i] === '교통사고') cols.push({ name: cur, i });
    }
    return { headRows: 3, cols, sumCol: -1 };
  }

  const head = (rows[1] || []).map((c) => String(c || '').trim());
  const sumAt = head.indexOf('sum');
  const cols = [];
  for (let i = 1; i < sumAt; i++) if (head[i]) cols.push({ name: head[i], i });
  return { headRows: 2, cols, sumCol: sumAt };
}

/** 파일 → { byRegion: {지자체:{분야:{counts,total}}}, order: {분야:[{name,v},…]} }
 *  `order` 는 시트에 적힌 **순서 그대로**입니다 — 정렬 점검에 씁니다. */
function readKangwon(file) {
  const byRegion = {};
  const order = {};
  for (const sheet of readXlsx(file)) {
    const cat = CAT_BY_SHEET[sheet.name];
    if (!cat) continue;
    const { headRows, cols } = readSheet(sheet);
    order[cat] = [];

    for (const row of sheet.rows.slice(headRows)) {
      const name = row && row[0] ? String(row[0]).trim() : '';
      if (!name) continue;
      const counts = {};
      let total = 0;
      for (const c of cols) {
        const v = row[c.i] === undefined || row[c.i] === '' ? 0 : Number(row[c.i]);
        if (!Number.isFinite(v)) continue;
        counts[c.name] = (counts[c.name] || 0) + v;
        total += v;
      }
      (byRegion[name] ||= {})[cat] = { counts, total };
      order[cat].push({ name, v: total });
    }
  }
  return { byRegion, order };
}

/* ── 대조 ────────────────────────────────────────────────────── */
const index = JSON.parse(fs.readFileSync(path.join(STATS, 'index.json'), 'utf8'));
const CAT_LABEL = index.categories;

/* 지자체별 통계를 미리 읽어 둡니다 (정렬 점검이 41곳을 모두 훑습니다) */
const OUR = {};
for (const r of index.regions) {
  OUR[r.region] = JSON.parse(fs.readFileSync(path.join(STATS, 'regions', `${r.region}.json`), 'utf8'));
}
const KEY_BY_SHORT = {};
for (const r of index.regions) KEY_BY_SHORT[r.short] = r.region;
const ALPHA = index.regions.map((r) => r.region).sort();

const keyOf = (kwName) => {
  const tail = kwName.split(/\s+/).pop();
  return KEY_BY_SHORT[kwName] || KEY_BY_SHORT[tail]
      || (index.regions.find((r) => r.label.includes(tail)) || {}).region || null;
};
const ourN = (regKey, cat, scope) => {
  const c = OUR[regKey] && OUR[regKey].categories[cat];
  const a = c && c[scope];
  const f = a && a[AXIS[cat].field];
  return f ? f.n : null;
};

/* ── ★ 이름과 값이 어긋났는지 점검 ─────────────────────────────
   시트에 적힌 이름으로 맞춰 볼 때와, **영문 지역코드 알파벳순**으로
   맞춰 볼 때 중 어느 쪽이 우리 값과 더 맞는지 셉니다.

   ⚠️ 값이 작은 지자체(0·13건 등)는 어느 쪽으로 맞춰도 우연히 맞습니다.
      그래서 **값이 30 이상인 행만** 세어 우연 일치를 걸러 냅니다.
      그래도 두 수가 비슷하면 "판별 불가"로 둡니다 — 없는 문제를
      있다고 말하지 않기 위해서입니다.
   ──────────────────────────────────────────────────────────── */
function checkAlignment(rows, cat, scope) {
  const near = (a, b) => b !== null && b > 0 && Math.abs(a - b) <= Math.max(3, b * 0.05);
  let self = 0; let shifted = 0; let judged = 0;
  for (let i = 0; i < rows.length; i++) {
    const mine = keyOf(rows[i].name);
    const byName = mine ? ourN(mine, cat, scope) : null;
    const byAlpha = ALPHA[i] ? ourN(ALPHA[i], cat, scope) : null;
    /* 판별력이 있는 행만 — 두 후보 값이 충분히 크고 서로 달라야 합니다 */
    if (byName === null || byAlpha === null) continue;
    if (byName < 30 && byAlpha < 30) continue;
    if (Math.abs(byName - byAlpha) <= Math.max(3, byName * 0.05)) continue;
    judged++;
    if (near(rows[i].v, byName)) self++;
    if (near(rows[i].v, byAlpha)) shifted++;
  }
  if (judged < 5) return { verdict: 'unknown', self, shifted, judged };
  if (shifted >= self * 2 && shifted > judged * 0.5) return { verdict: 'shifted', self, shifted, judged };
  if (self >= shifted * 2) return { verdict: 'ok', self, shifted, judged };
  return { verdict: 'unknown', self, shifted, judged };
}

const insideAll = readKangwon(path.join(KW, '조사지내_사고유형_최종.xlsx'));
const wholeAll = readKangwon(path.join(KW, '지역전체_사고유형_최종.xlsx'));
const inside = insideAll.byRegion;
const whole = wholeAll.byRegion;

function findRegion(kwName) {
  const tail = kwName.split(/\s+/).pop();
  return index.regions.find((r) => r.short === kwName)
      || index.regions.find((r) => r.short === tail)
      || index.regions.find((r) => r.label.includes(tail));
}

/* ── ① 먼저 시트가 성한지부터 봅니다 ─────────────────────────────
   어긋난 시트를 모르고 대조하면 "우리가 틀렸다"는 결론이 나옵니다. */
console.log('■ 시트 정렬 점검 — 지자체 이름과 값이 제대로 붙어 있는가\n');
console.log('  파일        분야       판정        (제이름 일치 / 영문순 일치 / 판별 가능 행)');
console.log('  ' + '─'.repeat(72));
const VERDICT = {
  ok: '✅ 정상    ',
  shifted: '❌ 어긋남  ',
  unknown: '·  판별 불가',
};
const broken = [];
for (const [all, scope, label] of [[insideAll, 'inside', '조사지내'], [wholeAll, 'region', '지역전체']]) {
  for (const cat of index.categoryOrder) {
    const rows = all.order[cat];
    if (!rows) continue;
    const r = checkAlignment(rows, cat, scope);
    if (r.verdict === 'shifted') broken.push(`${label} ${CAT_LABEL[cat]}`);
    console.log(`  ${label}    ${CAT_LABEL[cat].padEnd(6)} ${VERDICT[r.verdict]}  (${String(r.self).padStart(2)} / ${String(r.shifted).padStart(2)} / ${String(r.judged).padStart(2)})`);
  }
}
if (broken.length) {
  console.log(`\n  ❌ 이름과 값이 어긋난 시트: ${broken.join(', ')}`);
  console.log('     지자체 이름은 가나다순인데 값은 영문 지역코드순으로 붙었습니다.');
  console.log('     이 시트의 숫자는 **그대로 쓸 수 없습니다.** AURI 확인 필요.');
}
console.log('\n  ※ "판별 불가" 는 값이 작아 어느 쪽으로 맞춰도 우연히 맞는 경우입니다');
console.log('    (예: 여러 지자체가 0건·13건). 문제가 있다는 뜻이 아닙니다.');

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = want.length ? want : ['부천시', '인천시 미추홀구'];

let rows = 0; let big = 0; let totalRows = 0; let totalBig = 0;

for (const t of targets) {
  const kwName = Object.keys(inside).find((n) => n === t || n.endsWith(t)) || t;
  const reg = findRegion(kwName);
  if (!reg) { console.log(`\n⚠️ ${t}: 우리 통계에서 지자체를 찾지 못했습니다`); continue; }

  const our = JSON.parse(fs.readFileSync(path.join(STATS, 'regions', `${reg.region}.json`), 'utf8'));
  console.log(`\n${'═'.repeat(76)}`);
  console.log(`■ ${reg.label}  (강원대 표기: ${kwName})`);

  for (const [ourKey, scopeLabel, src] of [['inside', '조사지 내', inside], ['region', '지역 전체', whole]]) {
    const kwRegion = src[kwName];
    if (!kwRegion) { console.log(`\n  [${scopeLabel}] 강원대 자료에 없음`); continue; }
    console.log(`\n  [${scopeLabel}]`);

    /* ① 축이 같은 분야 — 항목별 비율 대조 */
    console.log('\n  ▸ 축이 같아 항목별로 맞댈 수 있는 분야');
    console.log('    분야     항목            강원대    우리     차이   표본(강원대/우리)');
    console.log('    ' + '─'.repeat(68));
    for (const cat of index.categoryOrder) {
      if (!AXIS[cat] || !AXIS[cat].same) continue;
      const kw = kwRegion[cat];
      const oc = our.categories[cat] && our.categories[cat][ourKey];
      if (!kw || !oc) continue;
      const o = oc[AXIS[cat].field];
      if (!o || !o.top) continue;

      const ourPct = {};
      for (const [name, pct] of o.top) ourPct[name] = pct;
      const names = [...new Set([...Object.keys(kw.counts), ...Object.keys(ourPct)])].sort();

      /* 정렬이 어긋난 시트는 숫자를 맞대는 것 자체가 뜻이 없습니다 */
      const isBroken = broken.includes(`${scopeLabel === '조사지 내' ? '조사지내' : '지역전체'} ${CAT_LABEL[cat]}`);
      if (isBroken) {
        console.log(`    ${CAT_LABEL[cat].padEnd(4)} — 이 시트는 이름과 값이 어긋나 있어 대조하지 않습니다 (위 점검 참고)`);
        continue;
      }

      for (const n of names) {
        const kp = kw.total ? +((kw.counts[n] || 0) / kw.total * 100).toFixed(1) : null;
        const op = ourPct[n] === undefined ? 0 : ourPct[n];
        const d = kp === null ? null : +(kp - op).toFixed(1);
        rows++; if (d !== null && Math.abs(d) >= 1) big++;
        console.log(`    ${CAT_LABEL[cat].padEnd(4)} ${n.padEnd(14)} ${String(kp).padStart(6)}%  ${String(op).padStart(6)}%  ${d === null ? '  — ' : (d > 0 ? '+' : '') + d.toFixed(1)}   ${String(kw.total).padStart(5)} / ${String(o.n).padStart(5)}`);
      }
    }

    /* ② 축이 다른 분야 — 총건수만 대조 */
    console.log('\n  ▸ 강원대가 재분류해 항목을 맞댈 수 없는 분야 (총건수만)');
    console.log('    분야       강원대   우리    차이   강원대 분류 항목 수 / 우리 항목 수');
    console.log('    ' + '─'.repeat(68));
    for (const cat of index.categoryOrder) {
      if (!AXIS[cat] || AXIS[cat].same) continue;
      const kw = kwRegion[cat];
      const oc = our.categories[cat] && our.categories[cat][ourKey];
      if (!kw || !oc) continue;
      const o = oc[AXIS[cat].field];
      const on = o ? o.n : 0;
      const d = kw.total - on;
      totalRows++; if (Math.abs(d) > 0) totalBig++;
      console.log(`    ${CAT_LABEL[cat].padEnd(6)} ${String(kw.total).padStart(7)} ${String(on).padStart(7)} ${String(d > 0 ? '+' + d : d).padStart(7)}   ${String(Object.keys(kw.counts).length).padStart(2)}종 / ${o && o.top ? o.top.length : 0}종  (원본 ${AXIS[cat].src} 칸)`);
    }
  }
}

console.log(`\n${'═'.repeat(76)}`);
console.log(`항목별 대조 ${rows}칸 · 1%p 이상 벌어진 칸 ${big}개`);
console.log(`총건수 대조 ${totalRows}칸 · 어긋난 칸 ${totalBig}개`);
