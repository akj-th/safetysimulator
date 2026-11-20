/* ════════════════════════════════════════════════════════════════════
   지역안전지수 세부(핵심)지표 → data/stats/safety-detail.json  (2026-11-20, AURI 11/18 김가은 자료)

   입력  data/raw/safety_index_detail_1118/지역안전지수 지표 분석 관련 자료/안전진단 시스템 자료/안전지수 지표/<번호>. <지자체> 안전지수 지표.xlsx
         시트 = 연도(2025·2024·2023·2022). 줄 = 분야 · 지표분류(위해·취약·경감·의식·환산) · 지표명 · 환산기준 · 단위 · 지표값 ·
         평균(시/군/구 = 같은 유형 평균 · 시도 · 전국) · 원통계
   출력  regions.<slug>.years.<연도> = [[…], …] — 줄마다 cols 순서의 배열 { field, kind, name, base, unit, value, avgType, avgSido, avgNation, raw, ratio, badHigh, weak }
           ratio = 지표값 ÷ 같은 유형 평균 (AURI 결과보고서 표 1-4 "자치구 평균 대비 0.50배" 와 같은 값)
           badHigh = 클수록 나쁜 지표인가(위해·취약, 의식 중 음주·위반) · weak = 평균보다 나쁜 쪽인가
   쓰는 곳: 결과보고서 탭 1장(표 1-2·1-4 취약 지표) · 붙임(분야별 산출지표 심층 분석)
   실행: node tools/build-safety-detail.mjs
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/raw/safety_index_detail_1118/지역안전지수 지표 분석 관련 자료/안전진단 시스템 자료/안전지수 지표');
const OUT = path.join(ROOT, 'data/stats/safety-detail.json');
const FIELD = { 교통: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 자살: 'suicide', 감염병: 'infection', 공통: 'common' };
const KINDS = ['위해', '취약', '경감', '의식', '환산'];
/* 의식 지표 중 클수록 나쁜 것 */
const BAD_HIGH_AWARE = /음주|위반|흡연/;

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const regions = Array.isArray(idx) ? idx : idx.regions;
/* 파일 이름 "2. 서울 관악구" → slug. 시도 줄임말 + 시군구 이름으로 라벨과 맞춤 */
const SIDO = { 서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 경기: '경기', 강원: '강원', 충북: '충청북', 충남: '충청남', 전북: '전북', 전남: '전라남', 경북: '경상북', 경남: '경상남', 제주: '제주' };
function slugOfFile(f) {
  const m = f.replace(/\.xlsx$/i, '').replace(/^\d+\.\s*/, '').replace(/\s*안전지수 지표$/, '').trim().split(/\s+/);
  const [sido, ...rest] = m; const sgg = rest.join(' ').replace('미추훌구', '미추홀구');
  if (sido === '세종') return 'sejong';
  if (sido === '제주') return 'jeju';
  const pre = SIDO[sido] || sido;
  const hit = regions.filter((r) => r.label.startsWith(pre) && (r.label.endsWith(' ' + sgg) || r.label.endsWith(' ' + sgg + '시') || r.label.endsWith(' ' + sgg + '군') || r.label.endsWith(' ' + sgg + '구')));
  return hit.length === 1 ? hit[0].region : null;
}
const num = (v) => { const s = String(v ?? '').replace(/,/g, '').trim(); if (!s || s === '-' || s === '.') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

const out = { source: path.relative(ROOT, SRC).replace(/\\/g, '/') + ' (AURI 2026-11-18)', generatedAt: new Date().toISOString().slice(0, 10),
  rule: 'ratio = 지표값 ÷ 같은 유형(시/군/구) 평균 · badHigh = 위해·취약(의식 중 음주·위반·흡연 포함)은 클수록 나쁨 · weak = 평균보다 나쁜 쪽', regions: {} };
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.xlsx'));
const miss = [];
for (const f of files) {
  const slug = slugOfFile(f);
  if (!slug) { miss.push(f); continue; }
  const years = {};
  for (const sh of readXlsx(path.join(SRC, f))) {
    const y = String(sh.name).trim(); if (!/^20\d\d$/.test(y)) continue;
    const rows = sh.rows; const h = rows.findIndex((r) => r && String(r[0] || '').trim() === '분야' && String(r[1] || '').includes('지표분류'));
    if (h < 0) continue;
    const list = [];
    for (const r of rows.slice(h + 2)) {
      const fk = String(r[0] || '').trim(), kind = String(r[1] || '').trim(), name = String(r[2] || '').trim();
      if (!FIELD[fk] || !KINDS.includes(kind) || !name) continue;
      const value = num(r[5]), avgType = num(r[6]);
      const badHigh = kind === '위해' || kind === '취약' || (kind === '의식' && BAD_HIGH_AWARE.test(name));
      const ratio = value != null && avgType ? +(value / avgType).toFixed(2) : null;
      list.push({ field: FIELD[fk], kind, name, base: String(r[3] || '').trim().replace(/^[-.]$/, ''), unit: String(r[4] || '').trim(), value, avgType, avgSido: num(r[7]), avgNation: num(r[8]), raw: num(r[9]),
        ratio, badHigh: kind === '환산' ? null : badHigh, weak: kind === '환산' || ratio == null ? null : (badHigh ? ratio > 1 : ratio < 1) });
    }
    years[y] = list;
  }
  out.regions[slug] = { file: f, years };
}
/* ★ AURI 원본 파일끼리 같은 자료 (2026-11-20 확인: 남원·목포 파일 = 영도구 자료 전 연도 · 홍천 2025 시트 = 정선 2025)
   같은 연도에 지표값이 모두 같은 지자체들은 행정동 인구(region-types.json)와 주민등록인구가 가장 가까운(15% 안) 한 곳만 남기고
   나머지는 그 연도를 비웁니다 → 화면은 "AURI 원자료 확인 중"으로 표시. AURI 가 고친 파일을 보내면 다시 돌리면 됨 */
const rtPop = Object.fromEntries((JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/region-types.json'), 'utf8')).regions || []).map((r) => [r.region, r.population]));
const popOf = (list) => { const r = (list || []).find((x) => x.name === '주민등록인구수'); return r ? (r.raw ?? r.value) : null; };
const excluded = [];
for (const y of ['2022', '2023', '2024', '2025']) {
  const groups = {};
  for (const [s, r] of Object.entries(out.regions)) { const l = r.years[y]; if (!l || !l.length) continue; const k = JSON.stringify(l.map((o) => [o.name, o.value])); (groups[k] = groups[k] || []).push(s); }
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const p = popOf(out.regions[g[0]].years[y]);
    const best = g.map((s) => [s, p && rtPop[s] ? Math.abs(p / rtPop[s] - 1) : 9]).sort((a, b) => a[1] - b[1])[0];
    const keep = best[1] < 0.15 ? best[0] : null;
    for (const s of g) if (s !== keep) { delete out.regions[s].years[y]; excluded.push({ region: s, year: y, sameAs: g.filter((x) => x !== s), kept: keep }); }
  }
}
out.excluded = excluded;
/* ★ 119 구급출동 발생률 — 결과보고서 표 1-2·1-3 "인구 10만명당 · 동일유형 평균 대비" (AURI 예시안 산식)
   발생률 = ’23~’25 출동 합 ÷ 3 ÷ 주민등록인구 × 10만. 인구 = 지역안전지수 2024 산출 시트의 주민등록인구수
   (AURI 는 "’23년 말 주민등록인구" — 관악 범죄 39.8 vs 이 인구로 40.0, 0.5% 차).
   동일유형 = 41개 대상지 중 같은 행정 유형(자치구 · 시 · 군)의 발생률 평균. 출동 건수 = data/stats/regions/<slug>.json */
const adminType = (label) => /(특별시|광역시) .+구$/.test(label) ? '자치구' : /군$/.test(label) ? '군' : '시';
const RATE_FIELDS = ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection', 'industrial'];
const rates = {};
for (const [slug, r] of Object.entries(out.regions)) {
  const reg = regions.find((x) => x.region === slug);
  /* 인구: 지역안전지수 2024 산출(= ’23년 말, AURI 와 같은 시점) → 2025 → 행정동 인구(위에서 시트를 비운 남원·목포) · 세종·제주는 raw 칸이 비어 value */
  const pop = popOf(r.years['2024']) || popOf(r.years['2025']) || rtPop[slug] || null;
  const popSource = popOf(r.years['2024']) ? '지역안전지수 2024' : popOf(r.years['2025']) ? '지역안전지수 2025' : rtPop[slug] ? '행정동 인구(region-types)' : null;
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/regions', slug + '.json'), 'utf8'));
  const f = {};
  for (const k of RATE_FIELDS) {
    const c = st.categories && st.categories[k]; const years = c && c.region ? c.region.years || {} : {};
    const total = ['2023', '2024', '2025'].reduce((s, y) => s + (years[y] || 0), 0);
    /* 장소(묶음)·60세 이상 비율 — 결과보고서 표 1-3·1-4 "도로 22.3%(평균 9.0%) 집중" (같은 유형 평균은 아래) */
    const reg = c && c.region;
    const place = reg && reg.placeGrouped && reg.placeGrouped.n ? Object.fromEntries((reg.placeGrouped.top || []).map((p) => [p[0], p[1]])) : null;
    const b = reg && reg.age && reg.age.n ? reg.age.buckets || {} : null;
    const age60 = b ? +['60-69', '70-79', '80+'].reduce((s, x) => s + (b[x] || 0), 0).toFixed(1) : null;
    f[k] = { years, total, perYear: +(total / 3).toFixed(1), rate: pop ? +(total / 3 / pop * 1e5).toFixed(2) : null, place, age60 };
  }
  rates[slug] = { label: reg ? reg.label : slug, type: adminType(reg ? reg.label : ''), pop, popSource, fields: f };
}
/* 동일유형 평균에서 빼는 곳 — 생활안전 발생률이 같은 유형 가운데값의 5배를 넘는 곳(원자료 분류가 생활안전으로 쏠린 곳: 광주 북구·부천·안동).
   AURI 예시안 "동일유형(자치구 9개)" = 북구를 뺀 자치구 · 남원(시) 대조: 부천·안동을 빼면 생활안전 1.49(예시안 1.50)·교통 1.16(1.15)·산재 1.31(1.29).
   평균에서만 빼고, 그 지자체 자신은 같은 유형 평균과 비교. ⚠ AURI 확인 필요(2026-11-20) */
const mean = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const median = (v) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const AVG_EXCLUDE = [];
for (const t of ['자치구', '시', '군']) {
  const rs = Object.entries(rates).filter(([, x]) => x.type === t && x.fields.life.rate != null);
  const med = median(rs.map(([, x]) => x.fields.life.rate));
  rs.forEach(([s, x]) => { if (x.fields.life.rate > med * 5) AVG_EXCLUDE.push(s); });
}
const typeAvg = {};
for (const t of ['자치구', '시', '군']) {
  const rs = Object.entries(rates).filter(([s, x]) => x.type === t && !AVG_EXCLUDE.includes(s)).map(([, x]) => x);
  typeAvg[t] = { n: rs.length,
    fields: Object.fromEntries(RATE_FIELDS.map((k) => { const m = mean(rs.map((x) => x.fields[k].rate).filter((v) => v != null)); return [k, m == null ? null : +m.toFixed(2)]; })),
    /* 장소 비율 평균 — 그 분야 출동이 있는 지자체만, 없는 장소는 0% 로 셈 · 60세 이상 비율 평균 */
    place: Object.fromEntries(RATE_FIELDS.map((k) => { const has = rs.filter((x) => x.fields[k].place); const names = [...new Set(has.flatMap((x) => Object.keys(x.fields[k].place)))];
      return [k, Object.fromEntries(names.map((nm) => [nm, +mean(has.map((x) => x.fields[k].place[nm] || 0)).toFixed(1)]))]; })),
    age60: Object.fromEntries(RATE_FIELDS.map((k) => { const m = mean(rs.map((x) => x.fields[k].age60).filter((v) => v != null)); return [k, m == null ? null : +m.toFixed(1)]; })) };
}
for (const r of Object.values(rates)) for (const k of RATE_FIELDS) { const a = typeAvg[r.type].fields[k]; r.fields[k].typeAvg = a; r.fields[k].ratio = a && r.fields[k].rate != null ? +(r.fields[k].rate / a).toFixed(2) : null; }
out.rates = { rule: '발생률 = ’23~’25 119 구급출동 합 ÷ 3 ÷ 주민등록인구(지역안전지수 2024 산출) × 10만 · ratio = 41개 대상지 중 같은 유형(자치구·시·군) 평균 대비 · 평균에서 뺀 곳 ' + AVG_EXCLUDE.join(',') +
  ' · place = 장소(묶음)별 비율(%) · age60 = 연령 확인 출동 중 60세 이상 비율(%) · typeAvg.place·age60 = 같은 유형 평균', avgExclude: AVG_EXCLUDE, typeAvg, regions: rates };

/* 용량을 줄이려 줄을 배열로 (열 이름은 cols) — 화면은 AuriSafetyDetail 같은 읽기 함수로 객체로 되돌림 */
const COLS = ['field', 'kind', 'name', 'base', 'unit', 'value', 'avgType', 'avgSido', 'avgNation', 'raw', 'ratio', 'badHigh', 'weak'];
const packed = { ...out, cols: COLS, regions: Object.fromEntries(Object.entries(out.regions).map(([k, r]) => [k, { file: r.file, years: Object.fromEntries(Object.entries(r.years).map(([y, list]) => [y, list.map((o) => COLS.map((c) => o[c]))])) }])) };
fs.writeFileSync(OUT, JSON.stringify(packed));
const n = Object.keys(out.regions).length;
console.log(`세부지표 → ${path.relative(ROOT, OUT)} · 지자체 ${n}/${files.length}${miss.length ? ' · 못 맞춘 파일: ' + miss.join(', ') : ''} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
if (excluded.length) console.log('⚠ 같은 자료라 비운 시트(AURI 원본 확인 필요): ' + excluded.map((e) => `${e.region} ${e.year}(= ${e.sameAs.join('·')}${e.kept ? ', ' + e.kept + ' 것으로 봄' : ''})`).join(' / '));
console.log('동일유형 평균에서 뺀 곳: ' + AVG_EXCLUDE.join(', ') + ' · 자치구 ' + typeAvg['자치구'].n + ' · 시 ' + typeAvg['시'].n + ' · 군 ' + typeAvg['군'].n);
const g = out.regions.gwanak; if (g) { const k = g.years['2025'].find((x) => x.name === '경찰관서수'); console.log('대조: 관악 2025 경찰관서수 ratio', k && k.ratio, '(AURI 표 1-4 0.50배)'); }
