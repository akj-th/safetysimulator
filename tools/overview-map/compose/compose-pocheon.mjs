import { feat, fit, ringOf, circle, prev, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('pocheon'), af = fit('pocheon2');
const O = (pts) => pts.map(p => [p[0] + 1000, p[1] + 700]);   // 크롭(origin 1000,700) 좌표 → 원본
const cfg = {
  region: 'pocheon', title: '포천시 중점관리분야 맞춤형 사업 종합도',
  subtitle: '소흘읍 일원 (송우리시외버스터미널 및 신봉초등학교 일대 주거지역)  |  중점 3분야 · 범죄 · 자살 · 생활안전',
  sdm: 'data/raw/SDM_5K/41650_pocheon', survey: 'data/raw/gis_0901/최종 조사지/pocheon_OverlapUnion_1.shp',
  frame: frameFor(F, af), draft: { file: `${DOCS}/8. 포천시/포천시 지도 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 건물 윤곽 겹침 24% (축척 막대 0.775 m/px × 1.02, 회전 0°)' },
  style: STYLE, risk: RISKCFG,
  labels: [{ text: '선단동', draftPx: [105, 90], size: 20 }, { text: '가산면', draftPx: [3070, 330], size: 20 }, { text: '소흘읍', draftPx: [1570, 1140], size: 20 }],
  zones: [
    { id: 'Z7', num: '⑦', type: '주거생활형', place: '송우초등학교 일대 공동주택', safety: 'life', markers: [{ label: '7', at: M(1419, 698) }], polygons: [{ draftPx: ringOf(F, 5, 16) }],
      box: { x: 60, top: 150, w: 440 }, items: items(['노후승강기 점검 및 교체지원', '어린이 놀이시설 안전점검', '공동주택 내 어린이·고령자 낙상예방시설 설치', '공동주택 정기안전점검 강화']) },
    { id: 'Z3', num: '③', type: '자연환경형 [범죄]', place: '태봉공원 및 은행나무공원 일대', safety: 'crime', markers: [{ label: '3', at: M(1646, 1099) }], polygons: [{ draftPx: circle(1627, 1007, 192) }, { draftPx: circle(1350, 1320, 46) }],
      box: { x: 60, below: 'Z7', gap: 10, w: 440 }, items: items(['기존 CCTV 촬영방향 조정 및 재배치', 'CCTV 통합관제센터 연계 실시간 모니터링 강화']) },
    { id: 'Z4', num: '④', type: '주거생활형', place: '동남고등학교 인근 주거지역', safety: 'crime', markers: [{ label: '4', at: M(1069, 1538) }], polygons: [{ draftPx: ringOf(F, 1, 14) }],
      box: { x: 60, below: 'Z3', gap: 10, w: 440 }, items: items(['스마트 안심비상벨 설치', '노후 방범 CCTV 교체 및 취약지역 재배치', '가정폭력 피해자 공동대응체계 운영', '주민 참여 자율방범 순찰대 운영', '공동주택 경비인력 연계 범죄예방·긴급대응 교육']) },
    { id: 'Z1', num: '①', type: '상업·유흥 밀집형', place: '송우로30번길 일대', safety: 'crime', markers: [{ label: '1', at: M(1819, 1401) }], polygons: [{ draftPx: O([[770, 640], [880, 610], [890, 760], [820, 790], [770, 730]]) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['골목길 사각지대 확인용 반사경·안심거울 추가 설치', '다목적 CCTV 추가 설치 또는 기존 CCTV 촬영각도 조정', '안심비상벨·비상호출시설 설치', '112신고 위치번호 표지 부착', '숙박·유흥업소 종사자 대상 범죄예방 및 긴급신고 교육', '비상벨 경찰 연계 및 출동체계 구축']) },
    { id: 'Z2', num: '②', type: '상업·유흥 밀집형', place: '송우리시외버스터미널 뒷편', safety: 'crime', markers: [{ label: '2', at: M(2118, 1271) }], polygons: [{ draftPx: O([[1060, 610], [1185, 480], [1255, 470], [1250, 525], [1170, 605], [1075, 655]]) }],
      box: { x: 1420, below: 'Z1', gap: 10, w: 440 }, items: items(['다목적 CCTV 추가 설치 또는 기존 CCTV 촬영 각도 조정', 'CCTV 일체형 보안등 추가 설치', '보행자 감지형 조명 설치', '골목길 안전관리 및 방범 순찰']) },
    { id: 'Z5', num: '⑤', type: '주거생활형', place: '솔모루로 일대 공동주택', safety: 'suicide', markers: [{ label: '5', at: M(1986, 1131) }], polygons: [{ draftPx: O([[1010, 232], [1222, 248], [1140, 440], [1010, 635], [860, 595], [785, 425]]) }],
      box: { x: 1420, below: 'Z2', gap: 10, w: 440 }, items: items(['고립위험가구 대상 찾아가는 도시락 배달을 통한 정기 안부 확인', '방문 정신건강 서비스', '마트 연계 자살위험 조기발견 및 상담 안내', '옥상 출입구 및 계단실 마음건강 상담전화 안내표지 설치']) },
    { id: 'Z6', num: '⑥', type: '자연환경형 [자살]', place: '태봉공원 및 은행나무공원 일대', safety: 'suicide', markers: [{ label: '6', at: M(1744, 1035) }], polygons: [{ draftPx: circle(1650, 1015, 203) }, { draftPx: circle(1350, 1320, 54) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['기존 CCTV 사각지대 점검 및 관제센터 연계 위기상황 조기 발견체계 강화', '산림 및 공원 보행로에 비상벨·상담전화 설치', 'LED 보안등 및 경관조명 확충', '로고젝터 설치를 통한 24시간 상담 및 신고 연락처 표출']) },
    { id: 'Z8', num: '⑧', type: '상업·유흥 밀집형', place: '송우중앙사거리 일대', safety: 'life', markers: [{ label: '8', at: M(1359, 1087) }], polygons: [{ draftPx: prev(F, [[445, 330], [540, 296], [620, 360], [615, 505], [455, 478]]) }],
      box: { x: 940, bottom: 1050, w: 400 }, items: items(['노후·파손 보도블록 정비 및 보행환경 개선', '보행안전 취약구간 정비사업', '안전보안관을 활용한 생활안전 위험요소 발굴 및 점검', '안전신문고 및 안전신고 포상제 운영 활성화']) },
  ],
  pois: [{ name: '태봉공원', draftPx: [1620, 1027] }, { name: '송우초등학교', draftPx: [1575, 1289], side: 'left' }, { name: '은행나무공원', draftPx: [1349, 1320], side: 'left' }, { name: '송우리시외버스터미널', draftPx: [2056, 1318] }],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z4', gap: 10, w: 440, h: 110, name: '포천시', label: '포천시 전체 · 지도 범위' },
  legend: LEGEND(['crime', 'suicide', 'life'], ['범죄', '자살', '생활안전']),
  legendPos: { x: 1420, below: 'Z5', gap: 10, w: 440, rowH: 22, fs: 13 },
};
write('pocheon', cfg);
