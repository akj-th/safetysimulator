import { feat, fit, ringOf, circle, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('bucheon'), af = fit('bucheon2');
const cfg = {
  region: 'bucheon', title: '부천시 중점관리분야 맞춤형 사업 종합도',
  subtitle: '심곡동 일원 (부천역 북부역 사거리 및 심곡천 일대)  |  중점 3분야 · 범죄 · 자살 · 감염병',
  sdm: ['data/raw/SDM_5K/41192_buceon_wonmigu', 'data/raw/SDM_5K/41194_bucheon_sosagu'], survey: 'data/raw/gis_0901/최종 조사지/bucheon_OverlapUnion_1.shp',
  frame: frameFor(F, af, { offset: [70, 0] }), draft: { file: `${DOCS}/4. 부천시/부천시 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 건물 윤곽 겹침 62% (축척 막대 0.762 m/px × 1.008, 회전 0°) · 시설 5점 정합과 일치' },
  style: STYLE, risk: RISKCFG,
  labels: [{ text: '중2동', draftPx: [110, 55], size: 20 }, { text: '심곡1동', draftPx: [1000, 355], size: 20 }, { text: '원미1동', draftPx: [2560, 80], size: 20 }, { text: '원미2동', draftPx: [2080, 380], size: 20 }, { text: '역곡2동', draftPx: [3000, 480], size: 20 }, { text: '심곡2동', draftPx: [1330, 980], size: 20 }, { text: '중동', draftPx: [60, 1060], size: 20 }, { text: '소사동', draftPx: [2590, 1070], size: 20 }, { text: '송내2동', draftPx: [90, 1580], size: 20 }, { text: '소사본동', draftPx: [2450, 1900], size: 20 }],
  zones: [
    { id: 'Z1', num: '①', type: '주거생활형', place: '진말어린이공원', safety: 'crime', markers: [{ label: '1', at: M(830, 315) }], polygons: [{ draftPx: circle(815, 345, 50) }],
      box: { x: 60, top: 150, w: 440 }, items: items(['기존 CCTV 촬영방향 조정·재배치(공원 내부 사각지대 포함)', '공원 내 안전관리 및 방범순찰 인력 배치', '범죄취약지역 긴급신고 비상벨 설치']) },
    { id: 'Z4', num: '④', type: '주거생활형', place: '현민빌리지 및 일대 원룸촌', safety: 'suicide', markers: [{ label: '4', at: M(875, 802) }], polygons: [{ draftPx: ringOf(F, 4, 14) }],
      box: { x: 60, below: 'Z1', gap: 10, w: 440 }, items: items(['생명사랑지킴이 양성·고립가구 안부확인', '청년마음건강지원사업 연계']) },
    { id: 'Z2', num: '②', type: '상업·유흥 밀집형', place: '부일로459번길 일대', safety: 'crime', markers: [{ label: '2', at: M(509, 1315) }], polygons: [{ draftPx: ringOf(F, 0, 16) }],
      box: { x: 60, below: 'Z4', gap: 10, w: 440 }, items: items(['골목길 사각지대 확인용 안전거울 설치', '주민 요청지역 중심 맞춤형 경찰순찰(00~04시 취약시간대 순찰동선 조정)']) },
    { id: 'Z3', num: '③', type: '자연환경형', place: '심곡천변', safety: 'suicide', markers: [{ label: '3', at: M(1689, 689) }], polygons: [{ draftPx: ringOf(F, 3, 14) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['교량·수변지역 긴급신고 및 상담전화 설치']) },
    { id: 'Z6', num: '⑥', type: '의료시설 밀집형', place: '가톨릭대학교 부천성모병원', safety: 'infection', markers: [{ label: '6', at: M(2299, 806) }], polygons: [{ draftPx: ringOf(F, 7, 10) }],
      box: { x: 1420, below: 'Z3', gap: 10, w: 440 }, items: items(['공용공간 손위생·소독관리 강화, 자동 손 소독기 설치', '감염병 대응 전문인력 교육·양성']) },
    { id: 'Z7', num: '⑦', type: '상업·유흥 밀집형', place: '북부역 사거리 일대 숙박시설', safety: 'infection', markers: [{ label: '7', at: M(1756, 1328) }], polygons: [{ draftPx: ringOf(F, 8, 12) }],
      box: { x: 1420, below: 'Z6', gap: 10, w: 440 }, items: items(['숙박업소 법정 소독 이행 점검 강화', '출입구·엘리베이터 앞 자동 손 소독기 설치']) },
    { id: 'Z5', num: '⑤', type: '상업·유흥 밀집형', place: '북부역 사거리 일대', safety: 'suicide', markers: [{ label: '5', at: M(1549, 1500) }], polygons: [{ draftPx: ringOf(F, 5, 16) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['생명사랑실천 편의점 운영(세븐일레븐 부천북부역점, 씨유 부천심곡점 등)']) },
  ],
  pois: [{ name: '진말어린이공원', draftPx: [814, 394] }, { name: '현민빌리지', draftPx: [1118, 538] }, { name: '심곡천', draftPx: [1601, 614] }, { name: '가톨릭대학교 부천성모병원', draftPx: [2306, 924] }, { name: '호텔아이', draftPx: [1103, 1243] }, { name: '부천역', draftPx: [1095, 1355] }],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z2', gap: 10, w: 440, h: 110, name: '부천', all: true, label: '부천시 전체 · 지도 범위' },
  legend: LEGEND(['crime', 'suicide', 'infection'], ['범죄', '자살', '감염병']),
  legendPos: { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
write('bucheon', cfg);
