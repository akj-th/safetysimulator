import { feat, ringOf, prev, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('jindo');
const af = { a: 0.6865115671973923, b: -0.03168473442657427, c: 873578.0324671442, d: 1598944.2263667118 };   // 시설 5점 유사변환 (fit-final)
const cfg = {
  region: 'jindo', title: '진도군 중점관리분야 맞춤형 사업 종합도',
  subtitle: '임회면 남동리·연동리 (서망항 및 진도항 일원)  |  중점 3분야 · 산업재해 · 범죄 · 자살',
  sdm: 'data/raw/SDM_5K/46900_jindo', survey: 'data/raw/gis_0901/최종 조사지/jindo_OverlapUnion_1.shp',
  frame: frameFor(F, af), draft: { file: `${DOCS}/7. 진도군/진도군 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 시설 5점(파출소·마을회관·선원복지회관·위판장·여객터미널) 유사변환, 축척 0.687 m/px · 회전 −2.6°, 최대 잔차 49m' },
  style: STYLE, risk: { ...RISKCFG, alphaFullAt: 0.8, colorGamma: 0.9, note: '진도는 산재 밀도가 서망항에만 몰려 p99 기준으로는 바다까지 붉게 번져 투명도를 완만하게' },
  labels: [{ text: '임회면 남동리', draftPx: [2300, 1900], size: 20 }, { text: '진도항', draftPx: [1500, 420], size: 16 }],
  zones: [
    { id: 'Z6', num: '⑥', type: '자연환경형', place: '서망항·진도항 방파제', safety: 'suicide', markers: [{ label: '6', at: M(1124, 61) }, { label: '6', at: M(1058, 1399) }], polygons: [{ draftPx: ringOf(F, 3, 10) }, { draftPx: ringOf(F, 4, 12) }],
      box: { x: 60, top: 150, w: 440 }, items: items(['방파제 진입구 109 연결 긴급전화·안내판 설치', '끝단부 지능형 CCTV(배회 감지) 설치', '진도파출소 연계 방파제 야간 순찰']) },
    { id: 'Z1', num: '①', type: '상업·유흥 밀집형', place: '서망항 수협 위판장', safety: 'industrial', markers: [{ label: '1', at: M(1371, 1924) }], polygons: [{ draftPx: prev(F, [[440, 770], [625, 758], [633, 805], [448, 818]]) }],
      box: { x: 60, below: 'Z6', gap: 10, w: 440 }, items: items(['바닥 미끄럼방지 포장·배수로 정비', '하역 보조장비 지원', '종사자 대상 보호구 보급·안전보건교육']) },
    { id: 'Z3', num: '③', type: '주거생활형', place: '서망선원복지회관 일대', safety: 'crime', markers: [{ label: '3', at: M(1522, 1687) }], polygons: [{ draftPx: ringOf(F, 2, 10) }],
      box: { x: 60, below: 'Z1', gap: 10, w: 440 }, items: items(['방범용 CCTV·비상벨 설치(범죄 발생지점 중심)']) },
    { id: 'Z5', num: '⑤', type: '관광산업 밀집형', place: '진도항', safety: 'crime', markers: [{ label: '5', at: M(1240, 301) }], polygons: [{ draftPx: ringOf(F, 0, 10) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['여객선 부두·대합실 주변 CCTV·비상벨 설치', '운항 시간 외 해경·경찰 순찰 연계']) },
    { id: 'Z2', num: '②', type: '자연환경형 [산재]', place: '서망항 북측 물양장', safety: 'industrial', markers: [{ label: '2', at: M(1306, 1412) }], polygons: [{ draftPx: ringOf(F, 7, 10) }],
      box: { x: 1420, below: 'Z5', gap: 10, w: 440 }, items: items(['보행자·차량 동선 분리 노면표시·안전펜스 설치', '지게차 안전관리 점검·유도요원 배치']) },
    { id: 'Z4', num: '④', type: '자연환경형 [범죄]', place: '서망항 북측 물양장', safety: 'crime', markers: [{ label: '4', at: M(1535, 1399) }], polygons: [{ draftPx: ringOf(F, 1, 10) }],
      box: { x: 1420, below: 'Z2', gap: 10, w: 440 }, items: items(['해경·경찰 합동 부두 순찰(탄력순찰)', '선박 계류구간 방범용 CCTV 설치']) },
    { id: 'Z7', num: '⑦', type: '주거생활형', place: '서망항 배후 주거지', safety: 'suicide', markers: [{ label: '7', at: M(1979, 1525) }], polygons: [{ draftPx: ringOf(F, 6, 10) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['농약안전보관함 보급(고령·독거 가구 우선)', '이장·부녀회 대상 생명지킴이 교육·안부확인']) },
  ],
  pois: [{ name: '진도항', draftPx: [1289, 164], side: 'left' }, { name: '씨월드 고속훼리 진도지점', draftPx: [1324, 205] }, { name: '서망항', draftPx: [1379, 1513], side: 'left' }, { name: '빅마린호', draftPx: [1477, 1523] }, { name: '진도파출소', draftPx: [1549, 1512] }, { name: '서망리마을회관', draftPx: [1881, 1688] }, { name: '서망선원복지회관', draftPx: [1643, 1797] }, { name: '서망항 수협 위판장', draftPx: [1256, 1948] }],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z3', gap: 10, w: 440, h: 110, name: '진도군', label: '진도군 전체 · 지도 범위' },
  legend: LEGEND(['industrial', 'crime', 'suicide'], ['산업재해', '범죄', '자살']),
  legendPos: { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
write('jindo', cfg);
