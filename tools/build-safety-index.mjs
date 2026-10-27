/* ════════════════════════════════════════════════════════════════════
   지역안전지수 등급 → 가중치 (2026-10-20 실무회의 ★)
     입력  data/raw/analysis_0901/지역별 안전유형 3개 추출_강원대.xlsx  (수정본 시트: 2025·2024 등급 6분야 + 강원대 확정 3분야)
     출력  data/stats/safety-index.json
   회의 결정
     · 가중치 자료는 무조건 지역안전지수. 1~5 등급(5 = 가장 나쁨)을 0~1 로 환산해 HEA 에 곱함
     · 자살은 모든 지자체 고정(최하위 등급 취급 = 1.0). 나머지는 실제 등급 그대로
     · 기준 연도 최근 2개년(2025·2024). 2025 로 정렬, 동률이면 2024
     · 산업재해는 지역안전지수에 없는 분야 → 중간값(3등급 = 0.6)으로 두고 noIndex 표시
   환산: w = 등급 ÷ 5 (1등급 0.2 … 5등급 1.0). 0 이 나오면 그 분야가 통째로 사라지므로 (등급−1)/4 는 쓰지 않음.
   실행:  node tools/build-safety-index.mjs
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/raw/analysis_0901/지역별 안전유형 3개 추출_강원대.xlsx');
const OUT = path.join(ROOT, 'data/stats/safety-index.json');
const FIELDS = ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection'];
const LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
const KO2KEY = { 교통사고: 'traffic', 교통: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 자살: 'suicide', 감염병: 'infection', 산업재해: 'industrial', 산재: 'industrial' };
const INDUSTRIAL_W = 0.6;   // 3등급 상당
const YEARS = ['2025', '2024'];   // 엑셀에 있는 연도. 2021~2023 은 아래 AURI 보고서 표(전체본 4곳)에서 덧붙입니다
/* ★ 5개년 등급 (2026-10-21 담당자) — AURI 사전분석 보고서 전체본(남해·부천·사천·영천)의 "<X시 안전분야별 년도별 안전등급>" 표
   (data/stats/auri-reports/<지역>.json 의 blocks, hwpx 원문). 약식본 지자체는 그 표가 없어 엑셀의 2025·2024 만 있습니다 */
const AURI_DIR = path.join(ROOT, 'data/stats/auri-reports');
/* ★ 중점관리분야 직접 지정 (2026-10-27, 10/26 회의 "3개로 고정하지 않음") — tools/config/focus-override.json.
   AURI 가 41개 지자체 중점관리분야(안)를 확정해 보내면 거기에 적습니다. 적힌 지자체만 규칙 대신 그 목록을 씁니다(개수 제한 없음). */
const OVERRIDE_FILE = path.join(ROOT, 'tools/config/focus-override.json');
const OVERRIDE = fs.existsSync(OVERRIDE_FILE) ? (JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8')).regions || {}) : {};
function overrideFor(slug) {
  const list = OVERRIDE[slug];
  if (!Array.isArray(list) || !list.length) return null;
  const keys = list.map((x) => (LABEL[x] ? x : KO2KEY[String(x).trim()])).filter(Boolean);
  const bad = list.filter((x) => !LABEL[x] && !KO2KEY[String(x).trim()]);
  if (bad.length) console.warn('⚠ focus-override', slug, '— 모르는 분야:', bad.join(', '));
  return keys.length ? [...new Set(keys)] : null;
}
function auriYearGrades(slug) {
  const f = path.join(AURI_DIR, slug + '.json');
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const t = (j.blocks || []).find(b => b.type === 'table' && /년도별\s*안전등급|연도별\s*안전등급/.test(b.caption || ''));
  if (!t) return null;
  const rows = t.rows.map(r => r.map(c => c.text.trim()));
  const hdr = rows.find(r => r.some(c => KO2KEY[c]));                       // 분야 이름이 든 줄
  if (!hdr) return null;
  const cols = hdr.map(c => KO2KEY[c] || null);
  const out = {};
  for (const r of rows) {
    const y = r.find(c => /^20\d\d$/.test(c)); if (!y) continue;
    const vals = r.filter(c => c !== y);
    const keys = cols.filter(Boolean);
    if (vals.length < keys.length) continue;
    out[y] = {}; keys.forEach((k, i) => { const g = +vals[i]; if (Number.isFinite(g)) out[y][k] = g; });
  }
  return Object.keys(out).length ? out : null;
}
const YEAR_COL = { 2025: 5, 2024: 11 };   // 수정본 시트에서 그 연도 교통 열의 자리

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const regions = Array.isArray(idx) ? idx : idx.regions;
/* 엑셀 지자체 이름 → slug. 라벨 끝 단어로 맞추되 중구·북구처럼 겹치는 것은 시·도로 가립니다 */
function slugOf(sido, name) {
  const n = name.replace(/^\*/, '').trim();
  const cand = regions.filter(r => r.label.endsWith(n.replace(/^(광주|대구|대전|울산)\s*/, '')) || (n === '세종시' && r.region === 'sejong') || (n === '제주도' && r.region === 'jeju'));
  if (cand.length === 1) return cand[0].region;
  const sidoKey = sido.replace(/특별자치도|특별자치시|광역시|특별시|도$/g, '');
  const c2 = cand.filter(r => r.label.startsWith(sidoKey));
  return c2.length ? c2[0].region : null;
}

const wb = readXlsx(SRC);
const sheet = Object.values(wb).find(s => (s.rows || s)[3] && String((s.rows || s)[3][0]).includes('광역권')) ;
const rows = (sheet.rows || sheet);
const out = { source: path.basename(SRC) + ' (수정본 시트 · 강원대)', generatedAt: new Date().toISOString().slice(0, 10), years: YEARS,
  rule: { weight: 'w = 등급 ÷ 5 (5등급 → 1.0). 자살은 모든 지자체 1.0 고정. 산업재해는 지수에 없어 ' + INDUSTRIAL_W + '. 정렬은 2025 등급, 동률이면 2024 (2026-10-20 실무회의)', industrialW: INDUSTRIAL_W },
  regions: {} };
let matched = 0;
for (const r of rows.slice(4)) {
  if (!r[2] || !/\d/.test(String(r[5]))) continue;
  const slug = slugOf(String(r[1]), String(r[2]));
  if (!slug) { console.warn('⚠ 지자체 못 찾음:', r[1], r[2]); continue; }
  const grades = {}; YEARS.forEach(y => { grades[y] = {}; FIELDS.forEach((f, i) => { grades[y][f] = +r[YEAR_COL[y] + i]; }); });
  const extra = auriYearGrades(slug);
  /* AURI 보고서 표가 있으면 그 값이 우선 — 엑셀의 2024 열은 네 곳 모두 AURI 표와 달랐고(2025 열은 전부 일치) 어느 판인지 확인 안 됨 */
  if (extra) for (const [y, g] of Object.entries(extra)) { if (!grades[y]) grades[y] = {}; FIELDS.forEach(f => { if (g[f] != null) grades[y][f] = g[f]; }); }
  const g25 = grades[YEARS[0]], g24 = grades[YEARS[1]];
  /* ★ 정규점수(1) — 있는 연도 등급 평균 ÷ 5 (2026-10-21 담당자: 5개년 등급 × 가중치). 자살 1.0 고정 */
  const allYears = Object.keys(grades).sort().reverse();
  const score1 = {}; FIELDS.forEach(f => { const gs = allYears.map(y => grades[y][f]).filter(Number.isFinite); score1[f] = f === 'suicide' ? 1 : +(gs.reduce((a, b) => a + b, 0) / gs.length / 5).toFixed(3); }); score1.industrial = INDUSTRIAL_W;
  const _reg = regions.find(x => x.region === slug);
  const kangwon = (_reg.focusTypesKangwon || _reg.focusTypes || []).map(s => KO2KEY[String(s || '').trim()]).filter(Boolean);   // 2026-10-22: focusTypes 가 지수 기준으로 바뀌어 강원대 원본은 focusTypesKangwon   // 강원대 확정 3분야는 index.json 의 focusTypes(검증된 값)
  const grade = (f) => Number.isFinite(g25[f]) ? g25[f] : g24[f];
  const weights = {}; FIELDS.forEach(f => { weights[f] = f === 'suicide' ? 1 : +(grade(f) / 5).toFixed(2); });
  weights.industrial = INDUSTRIAL_W;
  /* 하위 등급 분야 순위 — 자살 제외하고 2025 ↓, 2024 ↓, 분야 순 */
  const ranked = FIELDS.filter(f => f !== 'suicide').sort((a, b) => (g25[b] - g25[a]) || (g24[b] - g24[a]) || (FIELDS.indexOf(a) - FIELDS.indexOf(b)));
  const forced = overrideFor(slug);
  const focusByIndex = forced || ['suicide', ...ranked.slice(0, 2)];
  const lowGrades = FIELDS.filter(f => grade(f) >= 4);
  const same = kangwon.length === focusByIndex.length && focusByIndex.every(f => kangwon.includes(f));
  out.regions[slug] = {
    label: regions.find(x => x.region === slug).label,
    grades,                       // 연도 → 분야 → 등급 (2021~2023 은 AURI 보고서 전체본에만)
    years: allYears,
    weights,
    score1,                       // 연도 평균 등급 ÷ 5 — 복합위험지수의 분야 가중
    ranked,                       // 자살 뺀 5개 분야, 나쁜 등급부터
    focusByIndex,                 // 자살 + 하위 2개 = 지수 기준 중점 분야 (focus-override.json 에 적힌 지자체는 그 목록 — 개수 제한 없음)
    focusSource: forced ? 'override' : 'index',
    lowGrades,                    // 4·5등급인 분야
    kangwonFocus: kangwon,        // 강원대 공간분석 기반 확정 3분야
    matchesKangwon: same,
  };
  matched++;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const n = Object.keys(out.regions).length, agree = Object.values(out.regions).filter(r => r.matchesKangwon).length;
console.log(`지역안전지수 → ${path.relative(ROOT, OUT)} · 지자체 ${n}곳 (엑셀 ${matched}) · 지수 기준 3분야 = 강원대 확정 3분야 인 곳 ${agree}곳`);
console.log('5개년 등급이 있는 곳:', Object.values(out.regions).filter(r => r.years.length > 2).map(r => r.label + '(' + r.years.join('·') + ')').join(', ') || '없음');
for (const [s, r] of Object.entries(out.regions)) console.log(`  ${s.padEnd(11)} 2025 ${FIELDS.map(f => r.grades[2025][f]).join('')} → 지수 ${r.focusByIndex.map(f => LABEL[f]).join('·')} | 강원대 ${r.kangwonFocus.map(f => LABEL[f]).join('·')} ${r.matchesKangwon ? '✓' : ''}`);
