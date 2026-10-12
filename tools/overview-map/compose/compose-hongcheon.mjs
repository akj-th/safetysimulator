import { feat, fit, ringOf, circle, prev, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('hongcheon'), af = fit('hongcheon2');
const A = (pts) => pts.map(p => [p[0] + 100, p[1] + 500]);     // 크롭 a (origin 100,500)
const B = (pts) => pts.map(p => [p[0] + 1500, p[1] + 600]);    // 크롭 b (origin 1500,600)
const cfg = {
  region: 'hongcheon', title: '홍천군 중점관리분야 맞춤형 사업 종합도',
  subtitle: '홍천읍 일원 (홍천사거리 및 홍천강 일대)  |  중점 3분야 · 범죄 · 자살 · 교통사고',
  sdm: 'data/raw/SDM_5K/51720_hongcheon', survey: 'data/raw/gis_0901/최종 조사지/hongcheon_OverlapUnion_1.shp',
  frame: frameFor(F, af, { zoomOut: 1.45, offset: [-40, 0] }), draft: { file: `${DOCS}/9. 홍천군/홍천군 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 건물 윤곽 겹침 27% (축척 막대 0.755 m/px × 1.008, 회전 0°)' },
  style: STYLE, risk: RISKCFG,
  labels: [{ text: '홍천읍', draftPx: [1250, 1850], size: 20 }],
  zones: [
    { id: 'Z1', num: '①', type: '상업·유흥 밀집형', place: '홍천로 5길 인근 식당거리', safety: 'crime', markers: [{ label: '1', at: M(738, 1131) }], polygons: [{ draftPx: A([[497, 628], [590, 562], [690, 780], [560, 845]]), dashed: true }],
      box: { x: 60, top: 150, w: 440 }, items: items(['점포 내 긴급상황 알림 경광등 설치', '상업·유흥시설 및 소규모 점포 대상 설치 지원', '비상 시 관할 지구대 비상연락체계 연계', '바닥조명·간판부 라인 조명 설치', '골목길 방범용 CCTV 설치', 'CCTV 촬영 안내표지판 부착', '경찰 및 자율방범대 순찰 동선 지정']) },
    { id: 'Z2', num: '②', type: '자연환경형', place: '홍천강둔치주차장 일대', safety: 'crime', markers: [{ label: '2', at: M(1134, 1536) }], polygons: [{ draftPx: ringOf(F, 0, 14) }],
      box: { x: 60, below: 'Z1', gap: 10, w: 440 }, items: items(['CCTV 및 LED 보안등과 비상벨 통합형 안전·방재 스마트폴 설치', 'CCTV 통합관제센터 연계 실시간 모니터링 강화', '홍천강 둔치 내 안전관리 및 방범순찰 인력 배치']) },
    { id: 'Z5T', num: '⑤', type: '주요교차로형', place: '홍천사거리 및 홍천안경원 앞 사거리 일대', safety: 'traffic', markers: [{ label: '5', at: M(319, 1460) }, { label: '5', at: M(1913, 664) }], polygons: [{ draftPx: circle(319, 1460, 74) }, { draftPx: circle(1913, 664, 74) }],
      box: { x: 60, below: 'Z2', gap: 10, w: 440 }, items: items(['교차로 진입부 감속 유도시설 설치', '교차로 진입부 노면 유도선 설치', '보행 잔여시간 음향신호기 설치', '무신호 횡단보도 내 보행자 작동신호기 설치 검토', '바닥형 보행 신호등 설치', '보행 신호 시간 연장 및 보행자 우선 출발 신호 운영']) },
    { id: 'Z6', num: '⑥', type: '주거생활형', place: '강식자재마트 일대 단독주택지', safety: 'traffic', markers: [{ label: '6', at: M(3079, 995) }], polygons: [{ draftPx: prev(F, [[1222, 372], [1262, 355], [1266, 455], [1225, 468]]) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['주거지 이면도로 보차분리 및 보행안전시설 확충', '골목길 교차부 고원식 횡단보도 설치', '생활도로 내 과속방지턱·노면표시 등 차량 감속시설 설치', '고령운전자 교통안전교육']) },
    { id: 'Z4', num: '④', type: '주거생활형', place: '홍천119안전센터 일대 공동주택 밀집지', safety: 'suicide', markers: [{ label: '4', at: M(2632, 986) }], polygons: [{ draftPx: ringOf(F, 3, 10) }],
      box: { x: 1420, below: 'Z6', gap: 10, w: 440 }, items: items(['생명사랑지킴이 양성 및 사회적 고립 위험가구 정기 안부확인', '기존 공동주택 내 커뮤니티 시설을 활용한 상담·교류 거점 조성']) },
    { id: 'Z3', num: '③', type: '의료시설 밀집형', place: '홍천아산병원 일대', safety: 'suicide', markers: [{ label: '3', at: M(2079, 1131) }], polygons: [{ draftPx: B([[575, 400], [715, 500], [600, 640], [445, 630], [435, 595]]) }],
      box: { x: 1420, below: 'Z4', gap: 10, w: 440 }, items: items(['의료기관 연계 자살 고위험군 조기발견 및 정신건강 상담 지원', '의료진·병원 종사자 대상 자살위기 징후 인지 및 대응 교육', '퇴원 후 홍천군정신건강복지센터 연계 및 고위험군 지속 관리']) },
    { id: 'Z5S', num: '⑤', type: '자연환경형', place: '홍천강 일대 화양교·남산교', safety: 'suicide', markers: [{ label: '5', at: M(1800, 1124) }], polygons: [{ draftPx: ringOf(F, 2, 16) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['교량 난간 높이 상향 및 추락방지 안전시설 보강', '교량 내 안심비상벨 및 SOS 긴급상담전화 설치를 통한 위기상황 신고·상담체계 구축', '자살예방 로고젝터 설치를 통한 야간 생명존중 메시지 및 상담전화 안내']) },
  ],
  pois: [{ name: '화양교', draftPx: [2089, 793] }, { name: '남산교', draftPx: [1371, 1498], side: 'left' }, { name: '홍천사거리', draftPx: [323, 1500] }, { name: '홍천강둔치주차장', draftPx: [951, 1616], side: 'left' }],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z5T', gap: 10, w: 440, h: 110, name: '홍천군', label: '홍천군 전체 · 지도 범위' },
  legend: LEGEND(['crime', 'suicide', 'traffic'], ['범죄', '자살', '교통사고']),
  legendPos: { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
write('hongcheon', cfg);
