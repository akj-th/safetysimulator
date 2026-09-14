/* ════════════════════════════════════════════════════════════════════
   A_type 검증 — 우리 통계의 강원대 분류 ↔ 강원대 0904 사고유형 표 (2026-09-15 전환)

   2026-09-08 에 만든 이 도구는 "분야마다 세는 축이 달라 화재·범죄·자살·산재·
   생활안전은 항목을 맞댈 수 없다"는 전제였습니다. 0909 에 강원대가 분류 결과
   (A_type)를 CSV 에 붙여 보내면서 **7개 분야 모두 같은 축**이 되었으므로,
   이제는 41개 지자체 × 7분야 × 조사지/전체를 **항목별로** 맞댑니다.

     우리 쪽   data/stats/regions/<지역>.json 의 inside.atype / region.atype
               (build-stats 가 A_type 칸을 그대로 센 값)
     강원대 쪽 data/raw/사고유형 특성_0904/조사지내·지역전체_사고유형_최종.xlsx

   판정 (분야·범위마다)
     일치  건수 차이 ≤ max(2건, 2%) · 항목 비율 차이 모두 ≤ 1.0%p
     근사  항목 비율 차이 ≤ 3.0%p
     차이  그 밖
   ※ 표본 30건 미만은 몇 건에 비율이 크게 흔들려 "근사/차이"여도 따로 모읍니다.

   ★ 이 도구는 판단하지 않습니다. 어긋난 곳을 보여 줍니다.

   ── 알려진 것 ───────────────────────────────────────────────────
   ⚠️ 조사지내 교통사고 시트는 지자체 이름과 값이 어긋나 있습니다
      (이름 가나다순 · 값 영문 지역코드순, 2026-09-08 발견). checkAlignment()
      가 자동으로 찾아 대조에서 뺍니다.
   ⚠️ 자살 조사지 내는 강원대 표가 몇 건 더 많습니다(부천 188 vs 180).
      강원대 표에 자살발생지점 일부가 섞였을 가능성 — 확인 요청 중.

   쓰는 법:  node compare-kangwon-type.mjs            41곳 요약
             node compare-kangwon-type.mjs 부천시 …   그 지자체 항목별 상세
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';
import { slugForKangwon } from './lib/regions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const KW = path.join(ROOT, 'data/raw/사고유형 특성_0904');
const STATS = path.join(ROOT, 'data/stats');

/* 두 판에서 항목 이름이 달라진 것 — 0904 표는 나눠 적고 0909 A_type 은 합쳐 적습니다.
   이름이 달라 생기는 차이는 분류 차이가 아니므로 강원대 쪽을 합쳐서 맞댑니다. */
const KANGWON_ALIAS = { 온열질환: '온열한랭', 한랭질환: '온열한랭' };

const MIN_N = 30;                 // 이보다 작은 표본은 따로 모음
const OK_PP = 1.0;                // 일치: 항목 비율 차이 한도 (%p)
const NEAR_PP = 3.0;              // 근사: 항목 비율 차이 한도 (%p)

/* 시트 이름 → 우리 분야 열쇠 */
const CAT_BY_SHEET = {
  화재: 'fire', 감염병: 'infection', 교통사고: 'traffic', 범죄: 'crime',
  산업재해: 'industrial', 생활안전: 'life', 자살: 'suicide',
};

/* ── 강원대 시트 읽기 ─────────────────────────────────────────────
   머리행이 두 줄(교통사고만 세 줄)이고, 앞쪽 절반이 건수·뒤쪽 절반이
   비율입니다. 'sum' 이 처음 나오는 자리가 건수 구간의 끝입니다.
   교통사고는 차종마다 `교통사고` / `교통사고 다발지역` 두 열이 있어
   구급출동(`교통사고`) 열만 씁니다.                                  */
function readSheet(sheet) {
  const rows = sheet.rows;
  if (sheet.name === '교통사고') {
    const r1 = (rows[1] || []).map((c) => String(c || '').trim());
    const r2 = (rows[2] || []).map((c) => String(c || '').trim());
    const cols = [];
    let cur = '';
    for (let i = 1; i < r2.length; i++) {
      if (r1[i]) cur = r1[i];
      if (r2[i] === '교통사고') cols.push({ name: cur, i });
    }
    return { headRows: 3, cols };
  }
  const head = (rows[1] || []).map((c) => String(c || '').trim());
  const sumAt = head.indexOf('sum');
  const cols = [];
  for (let i = 1; i < sumAt; i++) if (head[i]) cols.push({ name: head[i], i });
  return { headRows: 2, cols };
}

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
        /* 이름 끝 공백이 섞인 칸이 있습니다("개인형이동장치 ") — 위에서 trim 함 */
        const nm = KANGWON_ALIAS[c.name] || c.name;
        counts[nm] = (counts[nm] || 0) + v;
        total += v;
      }
      (byRegion[name] ||= {})[cat] = { counts, total };
      order[cat].push({ name, v: total });
    }
  }
  return { byRegion, order };
}

/* ── 우리 통계 ──────────────────────────────────────────────── */
const index = JSON.parse(fs.readFileSync(path.join(STATS, 'index.json'), 'utf8'));
const CAT_LABEL = index.categories;
const OUR = {};
for (const r of index.regions) {
  OUR[r.region] = JSON.parse(fs.readFileSync(path.join(STATS, 'regions', `${r.region}.json`), 'utf8'));
}
const ALPHA = index.regions.map((r) => r.region).sort();

/* 강원대 표 이름 → slug. 끝 단어만 보면 대구·대전·울산 중구가 섞입니다 (lib/regions.mjs) */
const keyOf = (kwName) => slugForKangwon(kwName);
/** 우리 A_type 분포 { counts, total } */
function ours(regKey, cat, scope) {
  const c = OUR[regKey] && OUR[regKey].categories[cat];
  const a = c && c[scope];
  if (!a || !a.atype) return null;
  const counts = {};
  for (const [name, , n] of a.atype.top) counts[name] = n;
  return { counts, total: a.atype.n, ok: c.atypeOk };
}

/* ── 이름과 값이 어긋났는지 점검 ─────────────────────────────────
   시트에 적힌 이름으로 맞춰 볼 때와 **영문 지역코드 알파벳순**으로 맞춰 볼
   때 중 어느 쪽이 우리 값과 더 맞는지 셉니다. 값이 작아 우연히 맞는 행은
   판정에서 뺍니다 — 없는 문제를 있다고 말하지 않기 위해서입니다.        */
function checkAlignment(rows, cat, scope) {
  const n = (k) => { const o = ours(k, cat, scope); return o ? o.total : null; };
  const near = (a, b) => b !== null && b > 0 && Math.abs(a - b) <= Math.max(3, b * 0.05);
  let self = 0; let shifted = 0; let judged = 0;
  for (let i = 0; i < rows.length; i++) {
    const byName = keyOf(rows[i].name) ? n(keyOf(rows[i].name)) : null;
    const byAlpha = ALPHA[i] ? n(ALPHA[i]) : null;
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

const SCOPES = [
  { key: 'inside', label: '조사지 내', data: readKangwon(path.join(KW, '조사지내_사고유형_최종.xlsx')) },
  { key: 'region', label: '지역 전체', data: readKangwon(path.join(KW, '지역전체_사고유형_최종.xlsx')) },
];

console.log('■ 시트 정렬 점검 — 이름과 값이 제대로 붙어 있는가');
const broken = new Set();
for (const sc of SCOPES) {
  for (const cat of index.categoryOrder) {
    if (!sc.data.order[cat]) continue;
    const r = checkAlignment(sc.data.order[cat], cat, sc.key);
    if (r.verdict === 'shifted') {
      broken.add(`${sc.key}|${cat}`);
      console.log(`  ❌ ${sc.label} ${CAT_LABEL[cat]} — 이름과 값이 어긋남 (제이름 ${r.self} / 영문순 ${r.shifted} / 판별 ${r.judged}) → 대조에서 뺌`);
    }
  }
}
if (!broken.size) console.log('  어긋난 시트 없음');

/* ── 항목별 대조 ─────────────────────────────────────────────── */
function judge(o, k) {
  const names = new Set([...Object.keys(o.counts), ...Object.keys(k.counts)]);
  let maxPP = 0; let worst = null;
  for (const nm of names) {
    const po = o.total ? (o.counts[nm] || 0) / o.total * 100 : 0;
    const pk = k.total ? (k.counts[nm] || 0) / k.total * 100 : 0;
    const d = Math.abs(po - pk);
    if (d > maxPP) { maxPP = d; worst = nm; }
  }
  const nDiff = Math.abs(o.total - k.total);
  const verdict = (nDiff <= Math.max(2, k.total * 0.02) && maxPP <= OK_PP) ? 'ok'
    : maxPP <= NEAR_PP ? 'near' : 'diff';
  return { verdict, maxPP, worst, nDiff };
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tally = {};
const diffs = [];
for (const sc of SCOPES) {
  for (const [kwName, cats] of Object.entries(sc.data.byRegion)) {
    const regKey = keyOf(kwName);
    if (!regKey) continue;
    for (const cat of Object.keys(cats)) {
      if (broken.has(`${sc.key}|${cat}`)) continue;
      const o = ours(regKey, cat, sc.key);
      const k = cats[cat];
      const t = (tally[`${sc.label}|${cat}`] ||= { ok: 0, near: 0, diff: 0, small: 0, noAtype: 0 });
      if (!o || !o.ok) { t.noAtype++; continue; }
      if (!k.total && !o.total) { t.ok++; continue; }
      const j = judge(o, k);
      if (Math.max(o.total, k.total) < MIN_N && j.verdict !== 'ok') { t.small++; continue; }
      t[j.verdict]++;
      if (j.verdict !== 'ok') diffs.push({ sc: sc.label, cat, kwName, o, k, j });

      if (want.some((w) => kwName === w || kwName.endsWith(w))) {
        console.log(`\n  [${kwName} · ${sc.label} · ${CAT_LABEL[cat]}] 우리 ${o.total} / 강원대 ${k.total} — ${j.verdict}`);
        const names = [...new Set([...Object.keys(o.counts), ...Object.keys(k.counts)])]
          .sort((a, b) => (k.counts[b] || 0) - (k.counts[a] || 0));
        for (const nm of names) {
          const po = o.total ? (o.counts[nm] || 0) / o.total * 100 : 0;
          const pk = k.total ? (k.counts[nm] || 0) / k.total * 100 : 0;
          console.log(`     ${nm.padEnd(12)} 우리 ${String(o.counts[nm] || 0).padStart(5)} (${po.toFixed(1)}%)  강원대 ${String(k.counts[nm] || 0).padStart(5)} (${pk.toFixed(1)}%)  ${(po - pk >= 0 ? '+' : '') + (po - pk).toFixed(1)}%p`);
        }
      }
    }
  }
}

console.log('\n■ A_type 대조 요약 (41곳, 판정별 지자체 수)');
console.log('  범위       분야       일치  근사  차이  표본<30  A_type없음');
for (const sc of SCOPES) {
  for (const cat of index.categoryOrder) {
    const t = tally[`${sc.label}|${cat}`];
    if (!t) continue;
    console.log(`  ${sc.label.padEnd(8)} ${CAT_LABEL[cat].padEnd(6)} ${String(t.ok).padStart(4)} ${String(t.near).padStart(5)} ${String(t.diff).padStart(5)} ${String(t.small).padStart(7)} ${String(t.noAtype).padStart(9)}`);
  }
}
if (diffs.length) {
  console.log(`\n■ 표본 ${MIN_N}건 이상인데 일치가 아닌 곳 ${diffs.length}건 (차이 큰 순)`);
  for (const d of diffs.sort((a, b) => b.j.maxPP - a.j.maxPP).slice(0, 25)) {
    console.log(`  ${d.j.verdict === 'diff' ? '❌' : '·'} ${d.sc} ${CAT_LABEL[d.cat].padEnd(5)} ${d.kwName.padEnd(10)} 우리 ${d.o.total} / 강원대 ${d.k.total} · 최대 ${d.j.maxPP.toFixed(1)}%p (${d.j.worst})`);
  }
}
