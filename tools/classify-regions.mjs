/* ════════════════════════════════════════════════════════════════════
   41개 지자체 유형화 1차 (2026-10-16, 10/14 AURI 화상회의 ④ "도심형/농촌형/도농복합 분류" — AKJ 담당)

   회의 결정: "AI 로 1차 분류 시도 → 분류 기준을 역으로 확인 → 테스트 후 논의".
   여기서는 먼저 **숫자로 재현 가능한 규칙**으로 1차안을 만듭니다(AI 판단은 같은 표를 보고
   하게 하면 기준을 역추적할 수 있음). 쓰는 지표는 전부 이미 가진 자료에서만 나옵니다.

     인구·세대     data/raw/population/…주민등록인구및세대현황 (시군구 합계 줄, 202608)
     고령 비율     …연령별인구현황 (시군구 합계 줄) 65세 이상 = 60대 절반 근사가 아니라 70+ 와 60~69 의 절반 → 아래 주석
     면적         data/dong/<지역>.json 의 법정동 경계(단순화 8m)를 합산 — 행정구역 면적 통계가 없어 경계에서 잼
     조사지 지표   data/stats/index.json (조사지 면적 ha · 3개년 출동 건수 · 조사지 안 건수 · 동 수)
     행정 구분     이름 끝 글자 (구 / 시 / 군)

   규칙 (1차안 — 담당자·AURI 와 조정 전제)
     도심형      자치구(…구) 전부, 또는 시 중 인구밀도 ≥ 1,500명/km²
     도농복합형   시 중 인구밀도 300~1,500, 또는 군 중 인구밀도 ≥ 150 이거나 조사지 출동밀도가 높은 곳
     농촌형      군 중 인구밀도 < 150, 시 중 < 300
     + 보조 표기  고령(65세+ ≥ 25%) · 해안(조사지 폴리곤이 바다에 닿는 지자체는 표에 "해안" 손표기 — 자동 판정 자료 없음)

   실행: node tools/classify-regions.mjs  → data/stats/region-types.json + 표 출력(markdown)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const regions = Array.isArray(idx) ? idx : idx.regions || Object.values(idx);

/* EUC-KR CSV */
const readCsv = (f) => new TextDecoder('euc-kr').decode(fs.readFileSync(f)).split(/\r?\n/).filter(Boolean).map(l => l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').trim()));
const popRows = readCsv(path.join(ROOT, 'data/raw/population/202608_202608_주민등록인구및세대현황_월간.csv'));
const ageRows = readCsv(path.join(ROOT, 'data/raw/population/202608_202608_연령별인구현황_월간.csv'));
const codeOf = (name) => (name.match(/\((\d{10})\)/) || [])[1];
const num = (s) => +String(s).replace(/[,\s]/g, '') || 0;
const popByCode = new Map(); for (const r of popRows.slice(1)) { const c = codeOf(r[0]); if (c) popByCode.set(c, { pop: num(r[1]), hh: num(r[2]) }); }
const ageHead = ageRows[0]; const col = (re) => ageHead.findIndex(h => re.test(h));
const c60 = col(/계_60~69세/), c70 = col(/계_70~79세/), c80 = col(/계_80~89세/), c90 = col(/계_90~99세/), c100 = col(/계_100세/), cTot = col(/계_총인구수/);
const ageByCode = new Map(); for (const r of ageRows.slice(1)) { const c = codeOf(r[0]); if (c) ageByCode.set(c, { tot: num(r[cTot]), over65: num(r[c70]) + num(r[c80]) + num(r[c90]) + num(r[c100]) + num(r[c60]) / 2 }); }   // 65세+ ≈ 70+ 와 60대의 절반 (10세 구간뿐이라 근사)

const ringArea = (ring) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a) / 2; };
/* data/dong 의 geometry = [ [ [lat,lng], … ] , … ] (폴리곤마다 바깥 링 하나) → 위경도를 m 로 펴서 면적(km²) */
const areaOf = (geom) => { if (!Array.isArray(geom)) return 0; let s = 0;
  for (const poly of geom) { if (!Array.isArray(poly)) continue; poly.forEach((ring, i) => { if (!Array.isArray(ring) || ring.length < 3 || !Array.isArray(ring[0])) return; const lat0 = ring[0][0] * Math.PI / 180; const m = ring.map(([la, lo]) => [lo * 111320 * Math.cos(lat0), la * 110574]); s += ringArea(m); }); }   // 링마다 더함 (진도처럼 섬이 여러 링으로 들어오므로 구멍 빼기는 하지 않음)
  return s / 1e6; };

const out = [];
for (const r of regions) {
  const dongFile = path.join(ROOT, 'data/dong', r.region + '.json');
  const d = fs.existsSync(dongFile) ? JSON.parse(fs.readFileSync(dongFile, 'utf8')) : null;
  const codes = d && d.boundary && d.boundary.sggCodes ? d.boundary.sggCodes : [];
  let pop = 0, hh = 0, tot = 0, over65 = 0;
  for (const c of codes) { const k = c + '00000'; const p = popByCode.get(k); if (p) { pop += p.pop; hh += p.hh; } const a = ageByCode.get(k); if (a) { tot += a.tot; over65 += a.over65; } }
  /* 면적: 법정동 경계 합산 (5186 m²). 경계가 WGS84 면 대략 환산 */
  let areaKm2 = 0;
  if (d && d.dongs) for (const dg of Object.values(d.dongs)) areaKm2 += areaOf(dg.geometry);
  const suffix = (r.short || r.label).replace(/\s/g, '').slice(-1);
  const density = areaKm2 ? pop / areaKm2 : null;
  const elderly = tot ? over65 / tot : null;
  const insideDensity = r.areaHa ? r.inside / r.areaHa : null;         // 조사지 1ha 당 3개년 출동
  let type, why;
  if (suffix === '구') { type = '도심형'; why = '특별·광역시 자치구'; }
  else if (density == null) { type = '미분류'; why = '인구·면적 자료 없음'; }
  else if (suffix === '시') { type = density >= 1500 ? '도심형' : density >= 300 ? '도농복합형' : '농촌형'; why = `시 · 인구밀도 ${Math.round(density)}명/km²`; }
  else { type = density >= 150 ? '도농복합형' : '농촌형'; why = `군 · 인구밀도 ${Math.round(density)}명/km²`; }
  const tags = []; if (elderly != null && elderly >= 0.25) tags.push('고령'); if (insideDensity != null && insideDensity >= 15) tags.push('조사지 고밀');
  out.push({ region: r.region, label: r.label, short: r.short, suffix, type, why, tags, population: pop || null, households: hh || null, areaKm2: +areaKm2.toFixed(1) || null, densityPerKm2: density != null ? Math.round(density) : null, elderlyShare: elderly != null ? +(elderly * 100).toFixed(1) : null, surveyAreaHa: r.areaHa, incidents3y: r.total, insidePerHa: insideDensity != null ? +insideDensity.toFixed(1) : null, dongCount: r.dongCount, focusTypes: r.focusTypes, sggCodes: codes });
}
out.sort((a, b) => ['도심형', '도농복합형', '농촌형', '미분류'].indexOf(a.type) - ['도심형', '도농복합형', '농촌형', '미분류'].indexOf(b.type) || (b.densityPerKm2 || 0) - (a.densityPerKm2 || 0));
const result = { generatedAt: new Date().toISOString().slice(0, 10), rule: '구→도심형 · 시: 밀도≥1500 도심형 / 300~1500 도농복합형 / <300 농촌형 · 군: 밀도≥150 도농복합형 / <150 농촌형 · 보조표기 고령(65+≥25%) · 조사지 고밀(조사지 1ha당 3개년 출동 ≥15건)', sources: ['data/raw/population/202608 주민등록(시군구 합계)', 'data/dong/<지역>.json 법정동 경계 합산 면적', 'data/stats/index.json'], regions: out };
fs.writeFileSync(path.join(ROOT, 'data/stats/region-types.json'), JSON.stringify(result, null, 2));
const counts = {}; for (const r of out) counts[r.type] = (counts[r.type] || 0) + 1;
console.log('유형별:', JSON.stringify(counts));
console.log('\n| 유형 | 지자체 | 인구 | 면적 km² | 밀도 | 65세+ % | 조사지 ha | 3개년 출동 | 조사지 ha당 | 보조 | 중점 3분야 |\n|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of out) console.log(`| ${r.type} | ${r.label} | ${r.population ? r.population.toLocaleString() : '-'} | ${r.areaKm2 ?? '-'} | ${r.densityPerKm2 ?? '-'} | ${r.elderlyShare ?? '-'} | ${r.surveyAreaHa} | ${r.incidents3y.toLocaleString()} | ${r.insidePerHa ?? '-'} | ${r.tags.join('·') || ''} | ${(r.focusTypes || []).join('·')} |`);
