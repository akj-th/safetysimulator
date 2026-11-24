/* ════════════════════════════════════════════════════════════════════
   자살 사망지점 (’22~’24, AURI 김가은 2026-11-23) 읽기 — build-safety-detail · build-zone-stats 가 함께 씀
   data/raw/자살_1123/자살 관련 자료/자살발생지점/<slug>_자살발생지점.xlsx
     열: 구분 · 구분_1(장소: 1_건물_주택 · 산 · 하천 · 교량 · 1_건물_숙박업소 …) · 사망연 · 지역_시 · 지역__1 · 지역_법(법정동) ·
         지번 · 지번주 · 건물명_ · … · X · Y(경위도 — 브이월드 지오코딩, VWORLD_CRS = EPSG:4326) · 유형 · 안전유
   🔴 개인정보 — 지번·건물명은 웹 자료(data/)에 남기지 않습니다. 반복 건물은 개소 수만, 이름은 output/ 전달용 파일에만.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { readXlsx } from './xlsx.mjs';

export const DEATH_DIR = 'data/raw/자살_1123/자살 관련 자료/자살발생지점';
export const DEATH_YEARS = ['2022', '2023', '2024'];
/* 구분_1 → 보고서 표기 (예시안: "주택 내 사망 68.1%" · "숙박업소 11명" · "산·하천·교량 12.5%") */
export const DEATH_PLACE = { '1_건물_주택': '주택', '1_건물_숙박업소': '숙박업소', '1_건물_상가/회사': '상가·회사', '1_건물_병원': '병원', '1_건물_학교': '학교', '1_건물_기타': '기타 건물', 산: '산', 하천: '하천', 교량: '교량' };
export const OUTDOOR = ['산', '하천', '교량'];

const de = (s) => String(s ?? '').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').trim();

/** slug → [{ year, place, lng, lat, addr, building }] · 파일이 없으면 null */
export function readDeaths(root, slug) {
  const file = path.join(root, DEATH_DIR, `${slug}_자살발생지점.xlsx`);
  if (!fs.existsSync(file)) return null;
  const rows = readXlsx(file)[0].rows;
  const h = rows[0].map(de); const c = (n) => h.indexOf(n);
  const I = { place: c('구분_1'), year: c('사망연'), addr: c('지번주'), bld: c('건물명_'), x: c('X'), y: c('Y') };
  return rows.slice(1).filter((r) => r && r.some((v) => v !== '' && v != null)).map((r) => {
    const raw = de(r[I.place]);
    return { year: de(r[I.year]).slice(0, 4), place: DEATH_PLACE[raw] || raw.replace(/^1_건물_/, '') || '미상',
      lng: parseFloat(r[I.x]), lat: parseFloat(r[I.y]), addr: de(r[I.addr]), building: de(r[I.bld]) };
  });
}

/** 사망 목록 → 연도·장소 집계 (+ 같은 건물 반복 — 건물명 없이 개소 수만) */
export function summarizeDeaths(list, regionTotal) {
  const n = list.length;
  const pct = (a, b) => (b > 0 ? +(a / b * 100).toFixed(1) : null);
  const years = Object.fromEntries(DEATH_YEARS.map((y) => [y, list.filter((d) => d.year === y).length]));
  const pc = {}; list.forEach((d) => { pc[d.place] = (pc[d.place] || 0) + 1; });
  const place = Object.entries(pc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, n), v]);
  const outdoor = list.filter((d) => OUTDOOR.includes(d.place)).length;
  /* 같은 건물(이름이 있는 건물, 없으면 지번) 2명 이상 — "체스모텔 3명 반복" 꼴을 이름 없이 */
  const by = new Map(); list.forEach((d) => { const k = d.building || d.addr; if (!k) return; by.set(k, (by.get(k) || 0) + 1); });
  const rep = [...by.values()].filter((v) => v >= 2);
  return { n, share: regionTotal ? pct(n, regionTotal) : null, years, place, outdoor: { n: outdoor, share: pct(outdoor, n) },
    repeat: { spots: rep.length, deaths: rep.reduce((s, v) => s + v, 0), max: rep.reduce((m, v) => Math.max(m, v), 0) } };
}

/** 반복 건물 목록(연구진 전달용 — output/ 에만) */
export function repeatBuildings(list) {
  const by = new Map();
  list.forEach((d) => { const k = d.building || d.addr; if (!k) return; const o = by.get(k) || { name: d.building, addr: d.addr, place: d.place, n: 0, years: [] }; o.n++; o.years.push(d.year); by.set(k, o); });
  return [...by.values()].filter((o) => o.n >= 2).sort((a, b) => b.n - a.n);
}
