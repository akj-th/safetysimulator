import { feat, fit, ringOf, hullOf, circle, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('geumcheon'), af = fit('geumcheon2');
const cfg = {
  region: 'geumcheon', title: '금천구 중점관리분야 맞춤형 사업 종합도',
  subtitle: '독산동 일원 (독산사거리 및 시흥대로 일대)  |  중점 3분야 · 감염병 · 범죄 · 자살',
  sdm: 'data/raw/SDM_5K/11545_geumcheongu', survey: 'data/raw/gis_0901/최종 조사지/geumcheon_OverlapUnion_1.shp',
  frame: frameFor(F, af), draft: { file: `${DOCS}/5. 서울 금천구/금천구 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 건물 윤곽 겹침 67% (축척 막대 0.538 m/px, 회전 0°) · 시설 7점 정합과 10~20m 안에서 일치' },
  style: STYLE, risk: RISKCFG,
  labels: [{ text: '독산3동', draftPx: [2110, 350], size: 20 }, { text: '미성동', draftPx: [3020, 650], size: 20 }, { text: '독산1동', draftPx: [650, 1200], size: 20 }, { text: '독산4동', draftPx: [2150, 1250], size: 20 }, { text: '독산2동', draftPx: [2170, 1980], size: 20 }],
  zones: [
    { id: 'Z2', num: '②', type: '의료시설 밀집형', place: '서울바른세상병원 일대', safety: 'infection', markers: [{ label: '2', at: M(1111, 619) }], polygons: [{ draftPx: hullOf(F, [8]) }],
      box: { x: 60, top: 150, w: 440 }, items: items(['출입구·대기공간 스마트 손 소독기 설치', '의료기관 종사자 대상 감염관리 교육', '의료기관 연계 신종 감염병 대응 모의훈련']) },
    { id: 'Z5', num: '⑤', type: '상업·유흥 밀집형', place: '88호텔·시흥대로123길 일대', safety: 'crime', markers: [{ label: '5', at: M(829, 716) }], polygons: [{ draftPx: ringOf(F, 1, 12) }],
      box: { x: 60, below: 'Z2', gap: 10, w: 440 }, items: items(['업소 밀집 골목 안심비상벨·CCTV 연계 설치', '자율방범대 야간 순찰']) },
    { id: 'Z4', num: '④', type: '주요 교차로형', place: '독산사거리', safety: 'crime', markers: [{ label: '4', at: M(1267, 696) }], polygons: [{ draftPx: circle(1265, 789, 36) }],
      box: { x: 60, below: 'Z5', gap: 10, w: 440 }, items: items(['주민(자율방범대)·구청·경찰 합동순찰, 주민 요청 지역 경찰 순찰 강화', '안심비상벨·비상호출시설 설치']) },
    { id: 'Z1', num: '①', type: '주거생활형', place: '리치힐아파트 일대', safety: 'infection', markers: [{ label: '1', at: M(2402, 504) }], polygons: [{ draftPx: ringOf(F, 6, 12) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['환기 취약가구 실내 공기질 개선(환기설비)', '독산보건지소 연계 찾아가는 결핵검진·예방접종', '주민 대상 찾아가는 감염병 예방교육']) },
    { id: 'Z3', num: '③', type: '주거생활형', place: '서초파레스아파트 일대', safety: 'crime', markers: [{ label: '3', at: M(1693, 1020) }], polygons: [{ draftPx: ringOf(F, 0, 14) }],
      box: { x: 1420, below: 'Z1', gap: 10, w: 440 }, items: items(['CCTV 설치 및 사각지대 개선, 골목 모퉁이 안심거울 설치', '가로등형 방범 블랙박스 보안등 설치']) },
    { id: 'Z6', num: '⑥', type: '주거생활형', place: '대덕트윈빌아파트 일대', safety: 'suicide', markers: [{ label: '6', at: M(1630, 1513) }], polygons: [{ draftPx: ringOf(F, 4, 10) }],
      box: { x: 1420, below: 'Z3', gap: 10, w: 440 }, items: items(['우리동네돌봄단 운영(1인 가구 안부 확인)', '번개탄 판매 형태 개선(진열대 대신 계산대 보관)']) },
    { id: 'Z7', num: '⑦', type: '주거생활형', place: '대광아파트 일대', safety: 'suicide', markers: [{ label: '7', at: M(1864, 540) }], polygons: [{ draftPx: ringOf(F, 3, 12) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['생명사랑 편의점(CU) 경영주·직원 대상 생명지킴이 교육', '편의점 연계 자살예방 인식 개선 캠페인', '청년마음건강지원사업 연계(전문 심리상담)']) },
  ],
  pois: [
    { name: '리치힐아파트', draftPx: [2323, 321] }, { name: '대광아파트', draftPx: [2049, 334] }, { name: '독산보건지소', draftPx: [1920, 340], side: 'left' }, { name: '서울병원', draftPx: [1120, 460] },
    { name: '88호텔', draftPx: [780, 604] }, { name: '독산사거리', draftPx: [1272, 790] }, { name: '서울바른세상병원', draftPx: [1155, 820], side: 'left' }, { name: '서초파레스아파트', draftPx: [1422, 961] },
    { name: '독산1동 주민센터', draftPx: [1008, 1011], side: 'left' }, { name: '금천체육공원', draftPx: [2941, 1405] }, { name: '독산4동 주민센터', draftPx: [1902, 1587] }, { name: '대덕트윈빌아파트', draftPx: [1391, 1634] },
  ],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z4', gap: 10, w: 440, h: 110, name: '금천구', label: '금천구 전체 · 지도 범위' },
  legend: LEGEND(['infection', 'crime', 'suicide'], ['감염병', '범죄', '자살']),
  legendPos: { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
write('geumcheon', cfg);
