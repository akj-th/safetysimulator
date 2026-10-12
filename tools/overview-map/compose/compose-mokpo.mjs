import { feat, fit, ringOf, circle, M, items, frameFor, STYLE, RISKCFG, LEGEND, write, DOCS } from './compose-lib.mjs';
const F = feat('mokpo'), af = fit('mokpo2');
const cfg = {
  region: 'mokpo', title: '목포시 중점관리분야 맞춤형 사업 종합도',
  subtitle: '상동·하당동·신흥동·부흥동 일원 (평화광장 및 목포종합버스터미널 일대)  |  중점 3분야 · 범죄 · 자살 · 화재',
  sdm: 'data/raw/SDM_5K/46110_mockpo', survey: 'data/raw/gis_0901/최종 조사지/mokpo_OverlapUnion_1.shp',
  frame: frameFor(F, af), draft: { file: `${DOCS}/6. 목포시/목포시 지도 최종.png`, width: F.width, height: F.height, affine5179: af, note: '최종본 정합 2026-10-12 — 건물 윤곽 겹침 26% (축척 막대 1.139 m/px × 0.94, 회전 −6.9°) · 시설 4점 정합(회전 +1.3°, 잔차 65m)과 어긋남 — 확인 필요' },
  style: STYLE, risk: RISKCFG,
  labels: [{ text: '용해동', draftPx: [520, 850], size: 20 }, { text: '용당1동', draftPx: [100, 850], size: 20 }, { text: '용당2동', draftPx: [110, 1520], size: 20 }, { text: '이로동', draftPx: [650, 1700], size: 20 }, { text: '상동', draftPx: [1080, 430], size: 20 }, { text: '하당동', draftPx: [1540, 790], size: 20 }, { text: '옥암동', draftPx: [2820, 540], size: 20 }, { text: '부흥동', draftPx: [2480, 1090], size: 20 }, { text: '신흥동', draftPx: [1910, 1580], size: 20 }, { text: '삼학동', draftPx: [230, 2120], size: 20 }],
  zones: [
    { id: 'Z3', num: '③', type: '주거생활형', place: '목포종합버스터미널 인근 공동주택단지', safety: 'suicide', markers: [{ label: '3', at: M(1004, 147) }], polygons: [{ draftPx: ringOf(F, 1, 12) }],
      box: { x: 60, top: 150, w: 440 }, items: items(['중장년 1인 가구 찾아가는 마음건강 검진', '마트 연계 고위험군·위기징후 조기 발견 (호남마트 / 광장마트 / 코시마트 대신점·한일점 / 에스마트 상동점)', '효성병원 장례식장 뒤 푸른공원 마음쉼터 (따뜻한 색온도 야간조명·벤치·SOS 상담전화)']) },
    { id: 'Z6', num: '⑥', type: '주거생활형', place: '비파1·2·3차 아파트', safety: 'fire', markers: [{ label: '6', at: M(1686, 900) }], polygons: [{ draftPx: ringOf(F, 2, 12) }],
      box: { x: 60, below: 'Z3', gap: 10, w: 440 }, items: items(['세대별 소화기·간이 소화용구 보급', '주방 자동소화장치 설치 지원', '가스 자동차단기(타이머 콕) 보급', '노후 가스·전기설비·소방시설 점검', '취약가구 방문점검·대피 교육·훈련']) },
    { id: 'Z7', num: '⑦', type: '상업·유흥 밀집형', place: '부흥로 25 인근 상가', safety: 'fire', markers: [{ label: '7', at: M(1877, 1340) }], polygons: [{ draftPx: circle(1892, 1449, 53) }],
      box: { x: 60, below: 'Z6', gap: 10, w: 440 }, items: items(['피난유도등·비상조명·층별 피난안내도 지원', '상층부 의원·학원 피난기구(완강기) 점검·보강', '종사자 대피 유도 교육 및 합동 대피훈련']) },
    { id: 'Z2', num: '②', type: '주거생활형', place: '부영사랑으로·하당현대아파트 인근', safety: 'crime', markers: [{ label: '2', at: M(2475, 1201) }], polygons: [{ draftPx: ringOf(F, 0, 12) }],
      box: { x: 1420, top: 150, w: 440 }, items: items(['아파트 사이 통학로 골목 CCTV 설치', '통학로 주요 지점 안심비상벨 설치', '비상벨 안내표지·로고 라이트 설치', '주민 참여 자율방범 순찰대 운영', '통합관제센터·경찰 연계 출동체계']) },
    { id: 'Z4', num: '④', type: '상업·유흥 밀집형', place: '평화광장 숙박시설', safety: 'suicide', markers: [{ label: '4', at: M(2268, 1600) }], polygons: [{ draftPx: ringOf(F, 3, 14) }],
      box: { x: 1420, below: 'Z2', gap: 10, w: 440 }, items: items(['숙박시설 일산화탄소 감지기 보급', '업주·종사자 위기징후 발견 시 경찰·정신건강복지센터 연계']) },
    { id: 'Z1', num: '①', type: '상업·유흥 밀집형', place: '평화로73번길 일대 식당거리', safety: 'crime', markers: [{ label: '1', at: M(2494, 1798) }], polygons: [{ draftPx: ringOf(F, 3, 14), dashed: true }],
      box: { x: 1420, below: 'Z4', gap: 10, w: 440 }, items: items(['평화로73번길·인근 골목 비상벨·위치 안내표지', '73번길·61번길·원형동로53 이면골목 CCTV', '공용화장실 출입구 감시 안내 로고젝터', '화장실 포함 심야 순찰동선 지정', '불법촬영 기기·화장실 비상벨 정기 점검', '신설 비상벨·CCTV 통합관제센터·경찰 연계']) },
    { id: 'Z5', num: '⑤', type: '자연환경형', place: '목포오시길 1구간 데크길', safety: 'suicide', markers: [{ label: '5', at: M(2224, 2093) }], polygons: [{ draftPx: ringOf(F, 4, 14) }],
      box: { x: 520, bottom: 1050, w: 400 }, items: items(['SOS 신고·상담전화 설치', '생명존중 문구 로고젝터', '수변접근·배회 감지 지능형 CCTV 설치', '야간·새벽 순찰동선, 관제·해경·경찰 출동체계']) },
  ],
  pois: [{ name: '푸른공원', draftPx: [1242, 241] }, { name: '에스마트상동점', draftPx: [1165, 278], side: 'left' }, { name: '효성병원 장례식장', draftPx: [1273, 291] }, { name: '목포종합버스터미널', draftPx: [1385, 392] },
    { name: '목포제일여고', draftPx: [2331, 877], side: 'left' }, { name: '목포부영초', draftPx: [2553, 1291], side: 'left' }, { name: '하당현대아파트', draftPx: [2055, 1502], side: 'left' }, { name: '호텔야자', draftPx: [2292, 1500] },
    { name: '파라오모텔', draftPx: [2390, 1621] }, { name: '평화광장 공중화장실', draftPx: [2495, 1901] }, { name: '달맞이공원 공중화장실', draftPx: [2052, 2046], side: 'left' }],
  routes: [],
  keymap: { x: 60, y: 0, below: 'Z7', gap: 10, w: 440, h: 110, name: '목포시', label: '목포시 전체 · 지도 범위' },
  legend: LEGEND(['crime', 'suicide', 'fire'], ['범죄', '자살', '화재']),
  legendPos: { x: 940, bottom: 1050, w: 440, rowH: 22, fs: 13 },
};
write('mokpo', cfg);
