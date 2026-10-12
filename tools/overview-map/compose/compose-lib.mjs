// 9개 지자체 설정 조립 공용 도우미 (실행: tools/overview-map/compose 에서 node compose-<지역>.mjs → regions/<지역>.json)
// 입력: _features/<지역>.json (extract-final) · <지역>2.txt (fit-buildings 출력) — AURI 이미지 폴더 옆 _features 에 보관 — 추출 결과(feat JSON) + 손으로 적은 명세 → regions/<slug>.json
import fs from 'node:fs';
export const ROOT = 'C:/Users/kj2/Desktop/auri-safety-simulator-code/safetysimulator';
export const DOCS = 'docs/사전진단 보고서 및 지도 작업본(AURI)/261008 남해군~홍천군 (9개지자체)';
export const S = ROOT + '/' + DOCS + '/_features';   // 추출 결과(feat)·정합 결과(fit)·짝(pairs) 보관 — docs 는 커밋되지 않음
export const feat = (slug) => JSON.parse(fs.readFileSync(`${S}/${slug}.json`, 'utf8'));
export const fit = (slug) => { const t = fs.readFileSync(`${S}/${slug}.txt`, 'utf8'); const m = t.match(/affine5179\s+a=(\S+)\s+b=(\S+)\s+c=(\S+)\s+d=(\S+)/); return { a: +m[1], b: +m[2], c: +m[3], d: +m[4] }; };
const r1 = (p) => [+p[0].toFixed(1), +p[1].toFixed(1)];

/* 더글러스-포이커 단순화 */
export function simplify(pts, tol) { if (pts.length < 4) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, idx = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [p, q] = pts[i]; let d; if (!L) d = Math.hypot(p - ax, q - ay); else { const t = Math.max(0, Math.min(1, ((p - ax) * dx + (q - ay) * dy) / L)); d = Math.hypot(p - ax - t * dx, q - ay - t * dy); } if (d > md) { md = d; idx = i; } }
    if (md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); } }
  return pts.filter((_, i) => keep[i]); }
export function hull(pts) { const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (const p of P.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }
/* 추출 존 i 의 윤곽 (tol px 로 단순화) */
export const ringOf = (F, i, tol = 14) => simplify(F.zones[i].ring, tol).map(r1);
export const hullOf = (F, idxs) => hull(idxs.flatMap(i => F.zones[i].ring)).map(r1);
export const circle = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, i) => r1([cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]));
/* 미리보기(1600px 폭) 좌표 → 원본 px */
export const prev = (F, pts) => { const k = F.width / 1600; return pts.map(p => r1([p[0] * k, p[1] * k])); };
export const M = (x, y) => ({ draftPx: [x, y] });

/* 항목 글 → 아이콘 (낱말 규칙) */
const RULES = [
  [/거울|반사경/, 'mirror'], [/112.*위치번호|위치번호/, 'report-sign'], [/비상벨|비상호출|긴급신고 비상/, 'emergency-bell'],
  [/상담전화|SOS|긴급전화|긴급신고망|비상연락|연락체계|연락망|출동체계|핫라인/, 'emergency-phone'],
  [/일체형 보안등/, 'cctv-lamp'], [/CCTV.*(관제|사각|촬영|모니터링|지능형|방향|재배치)|관제센터|지능형 CCTV|배회 감지/, 'cctv-control'], [/CCTV|블랙박스/, 'cctv-multi'],
  [/로고젝터|바닥등|바닥조명|태양광|도로표지병|라인 ?조명|로고 라이트/, 'ground-light'], [/벽부등/, 'wall-lamp'], [/보안등|가로등|경관조명|조명|조도/, 'led-streetlight'],
  [/자율방범|순찰대|주민 참여|합동순찰|합동 ?부두|돌봄단|지킴이 양성/, 'community-watch'], [/순찰/, 'patrol-night'],
  [/교육|훈련|캠페인|인식개선/, 'education'], [/안부|방문|도시락|검진|돌봄|스마트플러그|위기 감지/, 'visit-check'],
  [/마트 연계|편의점|판매|번개탄|건강음료|생명사랑실천/, 'delivery-drink'], [/상담|정신건강|마음|심리|고위험군|커뮤니티|교류/, 'counseling'],
  [/경광등|점포|상가|안심거점|숙박|업주/, 'safe-shop'],
  [/난간|추락|펜스|옥상|개폐|출입통제|환기/, 'railing'], [/AED|심장충격기|구급/, 'aed'], [/소화|감지기|경보기|소독|방역|위생|가스|전기설비|승강기|놀이시설|안전점검|낙상/, 'co-alarm'],
  [/음성|스피커|스마트폴|방송|음향신호|신호등|신호기|신호/, 'speaker'], [/구명|인명구조/, 'lifebuoy'],
  [/노면|유도선|유도표시|보행|보도|횡단보도|감속|과속|속도|보차분리|회전교차로|동선 분리|미끄럼|배수로|하역|노인보호구역|반사용품|보호 노면/, 'guide-mark'],
  [/안내표지|표지판|안내판|표지|전광판|안내/, 'location-sign'],
  [/지원|보급|점검|관리|운영|배치|강화|정비|확충|조성|연계|설치/, 'billboard'],
];
export const icon = (t) => { for (const [re, ic] of RULES) if (re.test(t)) return ic; return 'billboard'; };
export const items = (list) => list.map(t => typeof t === 'string' ? { text: t, icon: icon(t) } : t);

/* 지도 창: 이미지 지도 영역(왼쪽 81%) 가운데를 중심으로, 세로를 다 담는 폭 */
export function frameFor(F, af, opt = {}) {
  const mapW = F.width * (opt.mapFrac || 0.81), cx = mapW / 2, cy = F.height / 2;
  const X = af.a * cx + af.b * cy + af.c, Y = af.b * cx - af.a * cy + af.d;
  const mpp = Math.hypot(af.a, af.b);
  const widthMeters = Math.round((opt.widthMeters || F.height * mpp * (1920 / 1080) * (opt.zoomOut || 1)) / 10) * 10;
  return { width: 1920, height: 1080, widthMeters, center5179: [Math.round(X), Math.round(Y)], offset: opt.offset || [0, 0], zoom: 17 };
}
export const STYLE = { dimOpacity: 0, surveyColor: '#2793C9', hideZoneLines: true, box: { pad: 13, fsT: 18, fsP: 12.5, fsI: 13, lh: 17.5, rowGap: 4, ic: 24 } };
export const RISKCFG = { enabled: true, overlapT: 0.2, builtBufferM: 40, closeM: 30, minAreaHa: 1, simplifyM: 12, maxAlpha: 0.62, alphaFullAt: 0.5, colorGamma: 0.55 };
export const LEGEND = (keys, names, extra = []) => [...keys.map((k, i) => ({ kind: 'zonepoly', key: k, label: '사업지 구역 — ' + names[i] })), { kind: 'poi', label: '주요 시설' }, ...extra, { kind: 'heat', keys, label: `위험도 밀도 — ${names.join(' · ')} (낮음 → 높음)` }];
export function write(slug, cfg) { const p = `${ROOT}/tools/overview-map/regions/${slug}.json`; fs.writeFileSync(p, JSON.stringify(cfg, null, 2)); console.log(slug + '.json 작성 · 존', cfg.zones.length, '· 시설', (cfg.pois || []).length); }
