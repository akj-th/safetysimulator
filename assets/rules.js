/* ════════════════════════════════════════════════════════════════════
   진단 → 사업 연결표 + 처방 규칙 엔진

   ★ checklist.js 와 함께 담당자가 계속 고쳐 나가는 파일입니다.

   ── 데이터와 로직을 나눴습니다 ──────────────────────────────────────
     assets/palette.json  어떤 사업이 있는가   ← AURI 사업 팔레트 (자동 생성)
     assets/rules.js      언제 그 사업인가     ← 이 파일 (우리 판단)

   팔레트가 아직 확정본이 아니라서 나눠 두었습니다. 새 엑셀을 받으면
   `node tools/build-palette.mjs` 만 다시 돌리면 되고, 사업명이 바뀌어
   연결이 끊어진 곳은 `node tools/verify-rules.mjs` 가 잡아 줍니다.

   ── 처방이 정해지는 방식 ────────────────────────────────────────────
   AI가 체크리스트 **항목마다** 답하고, 문제로 확인된 항목이 사업을 부릅니다.

     사진 → 'CRM-1 가로등 있는가' = 아니오 → 스마트보안등 · 방범 블랙박스 보안등

   그래서 사진이 다르면 처방도 달라지고, "왜 이 사업인가"를 사진의
   특정 지점까지 되짚을 수 있습니다. 분야 점수는 **개수와 우선순위**만 정합니다.

     위험(67~100) → 2종·필수 / 주의(34~66) → 1종·권장 / 안전(0~33) → 없음

   ── 두 부분의 역할 ──────────────────────────────────────────────────
     byItem    체크리스트 항목 번호 → 그 문제에 넣을 사업.  ★ 여기를 고칩니다
               번호는 server/checklist.js 의 id 와, 이름은 팔레트의
               `세부사업` 과 정확히 같아야 합니다.
     fallback  항목 판독이 없을 때만 쓰는 예비 목록.
               (서버가 꺼져 더미 점수로 돌 때, 연구원이 점수만 손으로 조정했을 때)

   ⚠️ 연결이 약한 항목이 있습니다 (RX_WEAK 참고). 팔레트에 그 문제를
     직접 다루는 사업이 아직 없어서이며, AURI 재정리 때 채울 자리입니다.
   ════════════════════════════════════════════════════════════════════ */

const RX_RULES = {
  suicide: {
    /* ⚠️ 자살은 시설 중심이 아니라 사람 중심입니다 (2026-08-25 행안부 협의).
       "옥상 개폐장치·CCTV·펜스 등 단순 시설사업은 고립·우울·사회적 단절 등
       근본 위험요인을 직접 줄이는 데 한계가 있다"는 지적에 따라,
       각 항목마다 사람 개입을 함께 두고 RX_REQUIRE_HEA 로 최소 1개를 보장합니다. */
    byItem: {
      'SUI-1': ['옥상 출입문 자동개폐 장치 설치', '고위험군 조기발굴·상담관리'],
      'SUI-2': ['교량 난간 설치', '자살방지 교량 난간 설치(안전펜스 설치)', '교량 난간 내 장력 센서 설치'],
      'SUI-3': ['자살방지 교량 난간 설치(안전펜스 설치)', '교량 추락위험구간 CCTV 설치'],
      'SUI-4': ['교량·수변지역 비상벨·SOS 상담전화 설치', 'AI 기반 고독사 예방·대응 서비스',
                '우리동네돌봄단(중장년·어르신·1인가구 안부 확인, 전화통화사업)'],
      'SUI-5': ['생명존중안심마을 운영', '생명지킴이 제도', '편의점 연계 자살예방'],
    },
    fallback: {
      danger: ['고위험군 조기발굴·상담관리', '옥상 출입문 자동개폐 장치 설치',
               '우리동네돌봄단(중장년·어르신·1인가구 안부 확인, 전화통화사업)'],
      caution: ['자살예방 전문상담', '생명존중안심마을 운영'],
    },
  },

  traffic: {
    byItem: {
      'TRF-1': ['안전펜스 설치 및 정비', '보행자 우선도로 표시'],
      'TRF-2': ['보행자 우선도로 표시', '교통정온화'],
      'TRF-3': ['바닥형 신호등 설치', '고원식 횡단보도 설치', '스마트 보행안전시스템 설치'],
      'TRF-4': ['불법주정차 및 과속 무인단속시스템 설치', '교통단속 CCTV 신규설치'],
      'TRF-5': ['회전교차로 설치', '차선 색깔 유도선 설치사업', '사고 빈발 위험지역 발굴 개선사업'],
      'TRF-6': ['야간 조명타워 설치', '스마트 보행안전시스템 설치'],
      'TRF-7': ['교통정온화', '어린이 보호구역 개선사업', '제한속도 하향 추진'],
    },
    fallback: {
      danger: ['교통사고 잦은 곳 개선사업', '바닥형 신호등 설치'],
      caution: ['야간 조명타워 설치', '교통정온화'],
    },
  },

  fire: {
    byItem: {
      'FIR-1': ['보이는 소화기 설치', '소방용수시설 확충 및 정비', '주택용 소방시설 지원'],
      'FIR-2': ['소방차 진입로 확보 시스템 구축', '소방차 자동 진출입 시스템 개선 및 구축'],
      'FIR-3': ['IoT 기반 무선 화재 감지기 설치', '자동소화장치 설치'],
      'FIR-4': ['실외기 무상 안전점검 활동', '전선 정비사업 지원', '아크차단기(AFCI) 설치 지원'],
      'FIR-5': ['쓰레기 불법소각·투기 집중 단속', '화재안전컨설팅 실시'],
      'FIR-6': ['주택용 소방시설 지원', '노후시설 개선 및 스프링클러 설치', '방화문·완강기 설치 지원'],
    },
    fallback: {
      danger: ['주택용 소방시설 지원', '보이는 소화기 설치'],
      caution: ['IoT 기반 무선 화재 감지기 설치', '찾아가는 소방안전교육'],
    },
  },

  crime: {
    byItem: {
      'CRM-1': ['안심이 앱 연동 스마트보안등 설치', '가로등형 방범 블랙박스 보안등 설치'],
      'CRM-2': ['기존 CCTV 교체 및 재배치', '고위험시설 안전비상벨 설치 지원', '안심경광등 설치'],
      'CRM-3': ['범죄예방 도시환경디자인(CPTED) 적용한 주거환경개선사업 실시', '안심거울 설치'],
      'CRM-4': ['안심거울 설치', '자율방범대 출범', '합동순찰 실시'],
      'CRM-5': ['범죄예방 도시환경디자인(CPTED) 적용한 주거환경개선사업 실시', '공원보안관 채용 및 배치'],
      'CRM-6': ['범죄예방 도시환경디자인(CPTED) 적용한 주거환경개선사업 실시', '특수형광물질 도포사업'],
    },
    fallback: {
      danger: ['기존 CCTV 교체 및 재배치', '안심이 앱 연동 스마트보안등 설치'],
      caution: ['자율방범대 출범', "휴대용 '안심벨' 안심헬프미"],
    },
  },

  life: {
    byItem: {
      'LIF-1': ['주거환경 개선사업', '안전마을 조성사업'],
      'LIF-2': ['경사로 안전 손잡이 설치(핸드레일)', '마을안길 안전난간 설치사업', '취약 어르신 낙상방지 안심홈 지원'],
      'LIF-3': ['노후 하수관로 정비', '차수판 설치 지원', '해빙기 취약시설 안전 점검'],
      'LIF-4': ['안전마을 조성사업', '안전보안관 및 안전신고 포상제 운영'],
      'LIF-5': ['맨홀 추락방지망 설치', '노후 하수관로 정비'],
      'LIF-6': ['안전마을 조성사업', '안전보안관 및 안전신고 포상제 운영'],
    },
    fallback: {
      danger: ['주거환경 개선사업', '경사로 안전 손잡이 설치(핸드레일)'],
      caution: ['안전마을 조성사업', '응급안전안심서비스'],
    },
  },

  industrial: {
    byItem: {
      'IND-1': ['지역 소규모 건설현장 안전지킴이 활동', '안전관리 불량현장 단속'],
      'IND-2': ['소규모 사업장 방호장치 설치 지원', '안전일터 조성지원(건설업 산재예방 안전시설)'],
      'IND-3': ['지역 소규모 건설현장 안전지킴이 활동', '위험공종 사전작업 허가제'],
      'IND-4': ['물류·하역시설 내 지게차 안전관리 실태 점검', '안전관리 불량현장 단속'],
      'IND-5': ['안전관리 불량현장 단속', '소규모 특화 안전일터 조성지원(끼임, 부딪힘)'],
      'IND-6': ['소규모 사업장 방호장치 설치 지원', '소규모 건설공사장 추락사고 예방 안전용품 지원'],
    },
    fallback: {
      danger: ['소규모 사업장 방호장치 설치 지원', '안전관리 불량현장 단속'],
      caution: ['찾아가는 안전보건교육', '클린사업장 조성 지원'],
    },
  },

  infection: {
    byItem: {
      'INF-1': ['맑은숨터 조성 및 돌봄사업 (실내 공기질 개선 사업)', '장기 요양기관 환기설비 설치 지원'],
      'INF-2': ['맑은숨터 조성 및 돌봄사업 (실내 공기질 개선 사업)', '다중이용시설 레지오넬라균 환경검사'],
      'INF-3': ['주민참여 환경정비 사업', '찾아가는 또는 무료 건강검진 실시'],
      'INF-4': ['쪽방촌 방역 및 소독', '주민참여 환경정비 사업', '취약지역 방역소독'],
      'INF-5': ['주민참여 환경정비 사업', '다중이용시설 레지오넬라균 환경검사'],
      'INF-6': ['다중이용시설 레지오넬라균 환경검사', '주민참여 환경정비 사업'],
    },
    fallback: {
      danger: ['쪽방촌 방역 및 소독', '맑은숨터 조성 및 돌봄사업 (실내 공기질 개선 사업)'],
      caution: ['취약지역 방역소독', '찾아가는 또는 무료 건강검진 실시'],
    },
  },
};

/* ── 연결이 약한 항목 ──────────────────────────────────────────────
   팔레트에 그 문제를 직접 다루는 사업이 아직 없어서, 가장 가까운 것으로
   이어 둔 자리입니다. AURI가 생활안전·감염병의 H·A 사업을 재정리하기로
   했으므로 그때 채워 넣어야 합니다. 화면에 "연결 보완 필요"로 표시됩니다. */
const RX_WEAK = {
  'INF-3': '옥외 손 위생 시설(세면대·손소독제)에 해당하는 사업이 팔레트에 없습니다',
  'INF-5': '보행로 폭·밀접 접촉을 직접 다루는 사업이 팔레트에 없습니다',
  'LIF-6': '보행자와 자전거·이륜차 동선 분리를 직접 다루는 사업이 팔레트에 없습니다',
  'SUI-3': '고지대·경사지 추락방지에 해당하는 사업이 교량 기준으로만 있습니다',
};

/* ════════════════════════════════════════════════════════════════════
   통계 → 사업 연결표 (RX_BY_STAT)

   행안부 주무관 보완의견의 핵심은 "인적요인·사고유형 분석 결과에 맞는
   개선사업"입니다.

     (인적요인) 고령자 64.3%  ┐
     (사고유형) 낙상 58%      ├→ 보행환경 개선 · 낙상예방 · 시야확보
     (물적환경) 경사도 12%    ┘

   사진 판독(byItem)이 "지금 이 자리에 무엇이 없는가"를 본다면,
   여기는 "이 일대에서 누가 어떻게 다쳐 왔는가"를 봅니다.

   ── 일부러 작게 유지합니다 ──────────────────────────────────────────
   조건은 **연령 · 시간대 · 발생장소** 셋뿐입니다. 규칙이 늘어나면
   "왜 이 사업인가"를 되짚기가 오히려 어려워집니다.

   ── 감사 추적 ───────────────────────────────────────────────────────
   여기서 나온 사업은 근거 줄이 `출동자료 —` 로 시작해 사진 판독과
   구분됩니다. 조건에 쓰인 실제 수치도 함께 찍힙니다.

     근거: 출동자료 — 조사지 내 65세 이상 41.2% (지역 28.5% 대비 1.4배)

   ── 적용 범위 ───────────────────────────────────────────────────────
   **중점 3분야에만** 적용하고, 분야당 **1종**만 더합니다.
   (사진 판독 처방 2종 + 통계 1종 = 사전진단서의 분야당 3종과 비슷합니다)
   ════════════════════════════════════════════════════════════════════ */

/** 조사지 안 값을 쓰되, 조사지 밖 지점이면 지자체 전체 값을 봅니다 */
function rxStatSide(cat, inside) { return (inside === false ? cat.region : cat.inside) || cat.region; }

const RX_BY_STAT = [
  {
    id: 'ST-AGE-65',
    label: '고령자 비중이 높음',
    /* 조사지 안 65세 이상이 40% 넘고, 지자체 전체보다 뚜렷이 높을 때 */
    test: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      const r = cat.compare && cat.compare.ratio ? cat.compare.ratio.a65 : null;
      return a && a.age.a65 !== null && a.age.a65 >= 40 && (inside === false || r === null || r >= 1.1);
    },
    say: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      const b = cat.region;
      const r = cat.compare && cat.compare.ratio ? cat.compare.ratio.a65 : null;
      return `65세 이상 ${a.age.a65}%` + (r && inside !== false ? ` (지역 ${b.age.a65}% 대비 ${r}배)` : '');
    },
    programs: {
      life: ['취약 어르신 낙상방지 안심홈 지원', '경사로 안전 손잡이 설치(핸드레일)'],
      traffic: ['고령보행자 교통안전용품 지원', '고령운전자 운전면허 자진반납지원'],
      infection: ['65세 이상 어르신 폐렴구균 예방접종 지원', '찾아가는 또는 무료 건강검진 실시'],
      suicide: ['우리동네돌봄단(중장년·어르신·1인가구 안부 확인, 전화통화사업)', '인공지능(AI) 활용 노인말벗 서비스'],
      fire: ['거동불편자 대상 자동소화패치 지원', '주택용 소방시설 지원'],
      crime: ['1인가구 안심 장비 지원사업'],
      industrial: ['농작업 안전재해예방 지원체계 구축'],
    },
  },
  {
    id: 'ST-AGE-U20',
    label: '아동·청소년 비중이 높음',
    test: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      return a && a.age.u20 !== null && a.age.u20 >= 25;
    },
    say: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      return `20세 이하 ${a.age.u20}%`;
    },
    programs: {
      traffic: ['어린이 보호구역 개선사업', '어린이 교통안전용품지원'],
      life: ['어린이 놀이시설 개선지원', '어린이집 손끼임 방지장치 설치 지원'],
      infection: ['어린이 국가예방접종 지원', '돌봄시설(어린이집·유치원·아동복지시설 등) 종사자 잠복결핵감염 무료 검진'],
      suicide: ['청소년 모바일 상담 다들어줄개', '청년마음건강지원사업'],
      crime: ['청소년 쉼터 운영'],
      fire: ['찾아가는 소방안전교육'],
    },
  },
  {
    id: 'ST-HOUR-NIGHT',
    label: '야간 시간대에 몰림',
    /* 가장 몰린 4시간대가 22시~06시 사이에서 시작하고 30% 이상일 때 */
    test: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      const p = a && a.hour ? a.hour.peak : null;
      return !!(p && p.share >= 30 && (p.from >= 22 || p.from < 6));
    },
    say: function (cat, inside) {
      const p = rxStatSide(cat, inside).hour.peak;
      return `${p.from}~${p.to}시에 ${p.share}% 집중`;
    },
    programs: {
      crime: ['안심이 앱 연동 스마트보안등 설치', '가로등형 방범 블랙박스 보안등 설치'],
      traffic: ['야간 조명타워 설치', '고휘도 횡단보도 조명'],
      suicide: ['교량·수변지역 비상벨·SOS 상담전화 설치', '생명사랑택시 운영'],
      life: ['장마철 가로등 점검'],
      fire: ['IoT 기반 무선 화재 감지기 설치'],
    },
  },
  {
    id: 'ST-PLACE-BIZ',
    label: '상업시설에서 많이 발생',
    test: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      const top = a && a.placeGrouped ? a.placeGrouped.top : [];
      const hit = top.find(function (x) { return x[0] === '상업시설'; });
      return !!(hit && hit[1] >= 25);
    },
    say: function (cat, inside) {
      const hit = rxStatSide(cat, inside).placeGrouped.top.find(function (x) { return x[0] === '상업시설'; });
      return `발생 장소 상업시설 ${hit[1]}%`;
    },
    programs: {
      crime: ['고위험시설 안전비상벨 설치 지원', '공중화장실 안심환경 개선사업 실시'],
      fire: ['음식점 주방 화재안전컨설팅 실시', 'K급 소화기 비치 안내 및 지원'],
      life: ['안전보안관 및 안전신고 포상제 운영'],
      traffic: ['불법주정차 및 과속 무인단속시스템 설치'],
      infection: ['다중이용시설 레지오넬라균 환경검사'],
    },
  },
  {
    id: 'ST-PLACE-HOME',
    label: '주거공간에서 많이 발생',
    test: function (cat, inside) {
      const a = rxStatSide(cat, inside);
      const top = a && a.placeGrouped ? a.placeGrouped.top : [];
      const hit = top.find(function (x) { return x[0] === '집'; });
      return !!(hit && hit[1] >= 50);
    },
    say: function (cat, inside) {
      const hit = rxStatSide(cat, inside).placeGrouped.top.find(function (x) { return x[0] === '집'; });
      return `발생 장소 주거공간 ${hit[1]}%`;
    },
    programs: {
      suicide: ['고위험군 조기발굴·상담관리', 'AI 기반 고독사 예방·대응 서비스'],
      fire: ['주택용 소방시설 지원', '공동주택 전기설비 안전진단 지원'],
      life: ['주거환경 개선사업', '응급안전안심서비스'],
      infection: ['저장강박 의심가구 주거환경 개선사업'],
      crime: ['주거 안전취약가구 안심도어 지원사업'],
    },
  },
];

/** 통계에서 사업을 뽑을 때 한 분야에 더할 최대 개수 */
const RX_STAT_MAX_PER_FIELD = 1;

/* ── 반드시 포함해야 하는 개입 유형 ────────────────────────────────
   자살은 8/25 협의에서 "시설 설치 중심보다 인적 요인과 자연스러운 접촉
   기반의 사전예방사업을 강화"하기로 정해졌습니다. HEA 로 옮기면
   **E(환경)만으로 채우지 말고 H(피해대상 보호·지원) 또는 A(행위 개입)를
   최소 하나 넣으라**는 뜻입니다. */
const RX_REQUIRE_HEA = { suicide: ['H', 'A'] };

/* ── 판정별 처방 개수 ──────────────────────────────────────────────
   위험도 9단계·종합 위험지수와 같은 경계(0~33 / 34~66 / 67~100)입니다.
   한쪽만 바꾸면 감사 추적이 끊어집니다. */
const RX_MAX_BY_LEVEL = {
  'lv-danger': 2,
  'lv-caution': 1,
  'lv-safe': 0,
};

const RX_PRIORITY = {
  must: { cls: 'must', label: '필수' },
  recommend: { cls: 'recommend', label: '권장' },
};

/* 적합도가 이 점수 이상이면 '필수', 아래면 '권장'.
   위험/주의를 가르는 경계(67)와 같은 값입니다. */
const RX_MUST_FIT = 67;

/* ── 적합도(0~100) ────────────────────────────────────────────────
   "이 사진에 이 사업이 얼마나 들어맞는가"를 재는 값입니다.
   AI가 항목별로 판독한 결과에서 규칙으로 계산합니다.

     ① 그 분야 점수가 높을수록  — 문제가 심한 곳일수록 잘 들어맞음
     ② 그 문제의 1순위 대책일수록 — byItem 배열의 앞자리일수록
                                  (뒷자리는 같은 문제를 푸는 '대안')
     ③ 여러 항목에서 함께 확인될수록 — 근거가 겹치면 그만큼 확실함 */
function auriFitScore(fieldScore, rank, triggerCount) {
  const base = fieldScore / (rank + 1);
  const bonus = Math.min(15, Math.max(0, (triggerCount - 1) * 8));
  return Math.min(100, Math.round(base + bonus));
}

/* ── 금액 표시 ────────────────────────────────────────────────────── */

/** 1234567 → "123만원" 처럼 읽기 쉬운 금액 */
function auriWon(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e8) {
    const eok = n / 1e8;
    return (eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10) + '억원';
  }
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString() + '만원';
  return n.toLocaleString() + '원';
}

/** 이 사업이 단가를 갖고 있는가 (합계에 넣을 수 있는가) */
function auriHasPrice(program) {
  return !!(program && program.amount && program.amount.won);
}

/* ── 거리 이미지에 그릴 수 있는가 ──────────────────────────────────
   E(환경적 개입)만 사진에 나타납니다. H(보호·지원)·A(행위 개입)는
   안부확인·교육·단속이라 거리 사진에 그릴 것이 없습니다.
   넣으면 모델이 없는 시설을 지어내므로 이미지 생성에서 뺍니다.
   목록·예산·문서에는 그대로 남습니다. */
function auriRxIsVisual(item) {
  if (!item) return false;
  /* 처방 항목(객체)으로도, 사업 이름(문자열)으로도 부를 수 있게 합니다.
     ※ 문자열을 넘겼을 때 조용히 false 가 되어 "그릴 것이 하나도 없다"로
       판정되던 버그가 있었습니다. 화면에서는 생성 버튼이 늘 잠겨 보였습니다. */
  const name = typeof item === 'string' ? item : item.name;
  const hea = (typeof item === 'object' && item.hea) || (AuriPalette.byName(name) || {}).hea;
  return hea === 'E';
}

/* ── 팔레트에서 사업 찾기 ─────────────────────────────────────────── */

/** 연결표의 이름 → 팔레트 사업. 없으면 null (verify-rules 가 잡습니다) */
function auriFindProgram(name) {
  return AuriPalette.byName(name);
}

/** 규칙번호로 팔레트 사업 찾기 (연구원이 무엇을 고쳤는지 비교할 때 씁니다) */
function auriFindRule(id) { return AuriPalette.byId(id); }

function auriCatalogHas(name) { return !!AuriPalette.byName(name); }

/** 연구원이 드롭다운에서 고를 수 있는 전체 목록 (<select> 안에 넣는 HTML) */
function auriCatalogOptions(currentName) {
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  const fields = [
    ['traffic', '교통사고'], ['fire', '화재'], ['crime', '범죄'], ['life', '생활안전'],
    ['industrial', '산업재해'], ['suicide', '자살'], ['infection', '감염병'],
  ];
  const known = auriCatalogHas(currentName);

  let html = `<option value="__custom__" ${known || !currentName ? '' : 'selected'}>직접 입력…</option>`;
  fields.forEach(function (f) {
    const list = AuriPalette.byField(f[0]);
    if (!list.length) return;
    html += `<optgroup label="${esc(f[1])}">`;
    list.forEach(function (p) {
      /* HEA 를 함께 보여 줍니다 — 시설만 고르지 않게 하려는 것이 8/25 협의의 취지입니다 */
      const tag = p.hea ? `[${AuriPalette.heaLabel(p.hea, true)}] ` : '';
      html += `<option value="${esc(p.name)}" ${p.name === currentName ? 'selected' : ''}>${tag}${esc(p.name)}</option>`;
    });
    html += '</optgroup>';
  });
  return html;
}

/* ────────────────────────────────────────────────────────────────────
   연구원이 직접 손댄 내용 (auri_rx_overrides)

   규칙 엔진이 뽑은 결과를 그대로 덮어쓰지 않고 따로 보관합니다.
   그래야 점수를 다시 조정해도 연구원이 지우거나 추가한 항목이 살아남고,
   "규칙이 뽑은 것"과 "사람이 손댄 것"을 구분해 감사에 남길 수 있습니다.
   ──────────────────────────────────────────────────────────────────── */
function auriLoadOverrides() {
  try {
    const raw = sessionStorage.getItem('auri_rx_overrides');
    const o = raw ? JSON.parse(raw) : {};
    return { removed: o.removed || [], edits: o.edits || {}, added: o.added || [] };
  } catch {
    return { removed: [], edits: {}, added: [] };
  }
}
function auriSaveOverrides(o) {
  sessionStorage.setItem('auri_rx_overrides', JSON.stringify(o));
}

/* 진단 결과 + 연구원 수정 → 최종 사업 목록.
   같은 입력이면 언제나 같은 결과가 나오는 결정론적 함수입니다.
   ★ 팔레트가 먼저 로드돼 있어야 합니다 (AuriPalette.load()). */
function auriPrescribe(results, overrides, stats) {
  const ov = overrides || auriLoadOverrides();
  const out = [];
  const seen = {};

  results.forEach(function (r) {
    const rule = RX_RULES[r.key];
    if (!rule) return;

    const limit = RX_MAX_BY_LEVEL[r.level.key] || 0;
    if (!limit) return;                              // 안전 판정은 처방 없음

    /* ① 후보 모으기 — 확인된 문제가 부르는 사업마다 적합도를 냅니다.
          한 사업을 여러 항목이 부를 수 있으므로 사업으로 묶습니다. */
    const hits = (r.findings || []).filter(function (f) { return f.risk; });
    const cand = {};
    let order = 0;

    hits.forEach(function (f) {
      (rule.byItem[f.id] || []).forEach(function (name, rank) {
        const program = auriFindProgram(name);
        if (!program) return;                        // 팔레트에서 사라진 사업
        let c = cand[program.id];
        if (!c) c = cand[program.id] = { program: program, best: 0, triggers: [], order: order++ };
        /* 여러 항목이 부르면 가장 잘 들어맞는 자리(1순위)를 기준으로 */
        c.best = Math.max(c.best, auriFitScore(r.score, rank, 1));
        c.triggers.push(f);
      });
    });

    let pool = Object.keys(cand).map(function (k) { return cand[k]; });

    /* ② 항목 판독이 없으면 분야 단위 예비 목록으로 */
    if (!pool.length) {
      const bucket = r.level.key === 'lv-danger' ? rule.fallback.danger : rule.fallback.caution;
      pool = bucket.map(function (name, rank) {
        const program = auriFindProgram(name);
        return program
          ? { program: program, best: auriFitScore(r.score, rank, 1), triggers: [], order: rank }
          : null;
      }).filter(Boolean);
    }

    /* ③ 적합도 확정 → 높은 순으로 줄 세우기.
          점수가 같으면 연결표에 적힌 순서(담당자가 정한 우선순위)를 따릅니다. */
    pool.forEach(function (c) {
      c.fit = Math.min(100, c.best + Math.min(15, Math.max(0, (c.triggers.length - 1) * 8)));
    });
    pool.sort(function (a, b) { return b.fit - a.fit || a.order - b.order; });

    /* ④ 반드시 들어가야 하는 개입 유형이 있으면 자리를 하나 확보합니다.
          자살은 "옥상 개폐장치·펜스 같은 시설만으로는 고립·우울이라는
          근본 원인을 줄이지 못한다"는 8/25 결론에 따라 H 또는 A 를 넣습니다.

          적합도 순서를 뒤엎지 않고, 상위 N개 안에 그 유형이 없을 때만
          가장 적합도가 높은 해당 유형 후보를 맨 앞으로 끌어올립니다.

          처방이 1종뿐인 '주의' 판정에는 적용하지 않습니다. 취지가
          "시설과 사람 개입을 묶어 패키지로" 인데, 한 자리뿐일 때
          바꿔 버리면 물리적 대책이 통째로 빠지기 때문입니다. */
    const need = limit >= 2 ? RX_REQUIRE_HEA[r.key] : null;
    if (need) {
      const isNeed = function (c) { return need.indexOf(c.program.hea) !== -1; };
      if (!pool.slice(0, limit).some(isNeed)) {
        const idx = pool.findIndex(isNeed);
        if (idx >= limit) {
          const picked = pool.splice(idx, 1)[0];
          picked.required = need;         // 근거 줄에 왜 들어갔는지 남깁니다
          pool.unshift(picked);
        }
      }
    }

    /* ⑤ 상위 N개만.

       ★ 뽑은 **뒤에** 연구원이 뺀 항목을 걷어냅니다. 순서가 중요합니다.
         먼저 걸러 내고 N개를 채우면, 뺀 자리를 다음 후보가 밀고 들어와
         연구원이 본 적도 없는 사업이 새로 나타납니다. 실제로 "지우고
         저장해도 그대로"처럼 보이던 원인이 이것이었습니다.
         뺀다는 것은 "다른 걸 달라"가 아니라 "이건 필요 없다"는 판단이므로,
         자리는 비워 두고 개수만 줄입니다. 다른 사업을 넣고 싶으면
         '항목 추가'로 직접 넣습니다. */
    let taken = 0;
    for (let i = 0; i < pool.length && taken < limit; i++) {
      const c = pool[i];
      const p = c.program;
      if (seen[p.id]) continue;                        // 다른 분야에서 이미 뽑힘
      seen[p.id] = true;
      taken++;                                         // 뺀 항목도 자리는 차지합니다
      if (ov.removed.indexOf(p.id) !== -1) continue;   // 연구원이 뺀 항목 — 자리를 비워 둡니다

      const e = ov.edits[p.id] || {};
      const auto = c.fit >= RX_MUST_FIT ? RX_PRIORITY.must : RX_PRIORITY.recommend;
      const t = c.triggers[0];

      /* ★ 연구원이 드롭다운으로 다른 사업을 고르면 HEA·금액·출처도 그 사업을
         따라가야 합니다. 예전에는 이름만 바뀌고 나머지는 원래 사업 값이
         남아, A 사업으로 바꿔도 [E] 로 표시되고 이미지 생성 대상에 계속
         들어갔습니다. */
      const shown = (e.name && auriFindProgram(e.name)) || p;

      out.push({
        /* id 는 '어느 자리를 고쳤는가'를 가리키는 열쇠라 그대로 둡니다.
           실제로 무엇이 들어갔는지는 programId 로 따로 남깁니다. */
        id: p.id,
        programId: shown.id,
        name: e.name || p.name,
        /* 설명은 팔레트의 효과크기를 그대로 씁니다 — 우리가 지어내지 않습니다 */
        note: e.note || shown.effect || '',
        source: shown.source || '',
        hea: shown.hea,
        amount: shown.amount,
        palette: shown.group,             // 'new' | 'existing'
        category: r.name,
        field: r.key,
        score: r.score,
        levelLabel: r.level.label,
        fit: c.fit,
        required: c.required || null,
        priority: e.priorityCls ? RX_PRIORITY[e.priorityCls] : auto,
        edited: !!(e.name || e.note || e.priorityCls),
        /* 이 사업을 부른 체크리스트 항목 — 문서의 근거가 됩니다 */
        trigger: t ? { id: t.id, ask: t.ask, note: t.note, count: c.triggers.length,
                       weak: RX_WEAK[t.id] || null } : null,
      });
    }
  });

  /* ⑥ 통계에서 나오는 사업 — 사진에 안 보이지만 출동자료가 가리키는 것.
        중점 3분야에만, 분야당 RX_STAT_MAX_PER_FIELD 개만 더합니다.
        사진 판독 처방을 밀어내지 않고 **덧붙이는** 방식입니다. */
  if (stats && stats.data && stats.data.focusTypes) {
    const inside = stats.inside;
    for (const t of stats.data.focusTypes) {
      const cat = t.key && stats.data.categories ? stats.data.categories[t.key] : null;
      if (!cat) continue;

      /* 그 분야가 안전 판정이면 처방하지 않습니다 — 사진 판독과 같은 기준 */
      const r = results.find(function (x) { return x.key === t.key; });
      if (r && !RX_MAX_BY_LEVEL[r.level.key]) continue;

      let added = 0;
      for (const rule of RX_BY_STAT) {
        if (added >= RX_STAT_MAX_PER_FIELD) break;
        let ok = false;
        try { ok = rule.test(cat, inside); } catch (e) { ok = false; }
        if (!ok) continue;

        for (const name of (rule.programs[t.key] || [])) {
          const p = auriFindProgram(name);
          if (!p || seen[p.id] || ov.removed.indexOf(p.id) !== -1) continue;
          seen[p.id] = true;
          added++;

          const e = ov.edits[p.id] || {};
          out.push({
            id: p.id,
            name: e.name || p.name,
            note: e.note || p.effect || '',
            source: p.source || '',
            hea: p.hea,
            amount: p.amount,
            palette: p.group,
            category: cat.label,
            field: t.key,
            score: r ? r.score : null,
            levelLabel: r ? r.level.label : null,
            fit: null,
            /* ★ 사진이 아니라 출동자료에서 나왔다는 표시 — 감사 추적의 핵심 */
            statTrigger: { id: rule.id, label: rule.label, detail: rule.say(cat, inside), inside: inside },
            priority: e.priorityCls ? RX_PRIORITY[e.priorityCls] : RX_PRIORITY.recommend,
            edited: !!(e.name || e.note || e.priorityCls),
            trigger: null,
          });
          break;                       // 조건 하나당 사업 하나
        }
      }
    }
  }

  /* 연구원이 직접 추가한 사업은 적합도·개수와 무관하게 항상 포함됩니다 */
  const custom = [];
  ov.added.forEach(function (item) {
    const p = auriFindProgram(item.name);
    custom.push({
      id: item.id,
      name: item.name,
      note: item.note || (p ? p.effect : '') || '',
      source: p ? p.source : '',
      hea: p ? p.hea : null,
      amount: p ? p.amount : null,
      palette: p ? p.group : null,
      category: item.category || '직접 지정',
      score: null,
      levelLabel: null,
      priority: RX_PRIORITY[item.priorityCls] || RX_PRIORITY.recommend,
      custom: true,
    });
  });

  /* 필수 → 권장 순, 같은 우선순위 안에서는 적합도가 높은 것부터.
     연구원이 직접 넣은 것은 맨 뒤에 붙습니다. */
  out.sort(function (a, b) {
    if (a.priority.cls !== b.priority.cls) return a.priority.cls === 'must' ? -1 : 1;
    return (b.fit || 0) - (a.fit || 0);
  });

  return out.concat(custom);
}

/* 처방의 근거 한 줄.
   "사진에서 무엇을 봤기에 이 사업인가"를 한 줄로 되짚을 수 있어야 합니다. */
function auriRxBasis(it) {
  const p = AuriPalette.byName(it.name);
  const price = ' · ' + AuriPalette.amountText(p);

  if (it.custom) return '근거: 연구원 직접 추가' + price;
  const edited = it.edited ? ' · 연구원 수정' : '';
  const fit = it.fit != null ? ` · 적합도 ${it.fit}` : '';

  /* ★ 출동자료에서 나온 사업 — 사진 판독과 근거가 다르므로 줄머리를 바꿉니다.
     "이 숫자가 사진에서 나왔는지 통계에서 나왔는지"를 되짚을 수 있어야 합니다. */
  if (it.statTrigger) {
    const where = it.statTrigger.inside === false ? '지자체 전체' : '조사지 내';
    return `근거: 출동자료 ${it.category} — ${where} ${it.statTrigger.detail}` +
           ` → ${it.statTrigger.label}${edited}${price}`;
  }

  /* 8/25 협의로 반드시 넣기로 한 개입 유형이면 그 사실을 남깁니다.
     "적합도가 낮은데 왜 들어갔나"를 되짚을 수 있어야 하기 때문입니다. */
  const req = it.required
    ? ` · 사람 중심 개입 필수 포함(2026-08-25 협의)` : '';

  if (it.trigger) {
    const seen = it.trigger.note ? ` — ${it.trigger.note}` : '';
    const also = it.trigger.count > 1 ? ` 외 ${it.trigger.count - 1}건` : '';
    return `근거: 사진 판독 ${it.trigger.id}${seen}${also} → ` +
           `${it.category} ${it.levelLabel} 판정${fit}${req}${edited}${price}`;
  }
  return `근거: ${it.category} ${it.score}점 · ${it.levelLabel} 판정${fit}${req}${edited}${price}`;
}

/* 효과크기와 출처 한 줄 — 예산 근거 문서라 출처 표기가 중요합니다.
   예) "476곳 분석 결과 사망자 76% 감소 (korea.kr)" */
function auriRxEvidence(it) {
  const p = AuriPalette.byName(it.name);
  const ev = AuriPalette.evidence(p);
  if (!ev) return null;
  return {
    effect: ev.effect,
    source: ev.source,
    sourceShort: AuriPalette.sourceShort(ev.source),
  };
}

/* 최종 목록을 다음 단계로 넘깁니다. 규칙 엔진은 리포트 단계에서만 돌리고,
   시각화·진단서는 이 결과를 그대로 받아 씁니다. */
function auriSavePrescriptions(items) {
  sessionStorage.setItem('auri_prescriptions', JSON.stringify(items));
}
