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
/* 용량을 줄이려 줄을 배열로 (열 이름은 cols) — 화면은 AuriSafetyDetail 같은 읽기 함수로 객체로 되돌림 */
const COLS = ['field', 'kind', 'name', 'base', 'unit', 'value', 'avgType', 'avgSido', 'avgNation', 'raw', 'ratio', 'badHigh', 'weak'];
const packed = { ...out, cols: COLS, regions: Object.fromEntries(Object.entries(out.regions).map(([k, r]) => [k, { file: r.file, years: Object.fromEntries(Object.entries(r.years).map(([y, list]) => [y, list.map((o) => COLS.map((c) => o[c]))])) }])) };
fs.writeFileSync(OUT, JSON.stringify(packed));
const n = Object.keys(out.regions).length;
console.log(`세부지표 → ${path.relative(ROOT, OUT)} · 지자체 ${n}/${files.length}${miss.length ? ' · 못 맞춘 파일: ' + miss.join(', ') : ''} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
const g = out.regions.gwanak; if (g) { const k = g.years['2025'].find((x) => x.name === '경찰관서수'); console.log('대조: 관악 2025 경찰관서수 ratio', k && k.ratio, '(AURI 표 1-4 0.50배)'); }
