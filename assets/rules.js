/* ════════════════════════════════════════════════════════════════════
   개선 시설물 처방 규칙표 (과업4 「재난 예방 인프라 표준 설계 가이드라인」 초안)

   ★ checklist.js 와 함께 담당자가 계속 고쳐 나가는 파일입니다.

   ── 처방이 정해지는 방식 ────────────────────────────────────────────
   AI가 체크리스트 **항목마다** 답하고, 문제로 확인된 항목이 시설물을 부릅니다.

     사진 → 'CRM-1 가로등 있는가' = 아니오 → LED 보안등 · CPTED 조명

   그래서 사진이 다르면 처방도 달라지고, "왜 이 시설물인가"를 사진의
   특정 지점까지 되짚을 수 있습니다. 분야 점수는 **우선순위**만 정합니다.

     위험(67~100) → 필수 / 주의(34~66) → 권장 / 안전(0~33) → 처방 없음

   ── 두 부분의 역할 ──────────────────────────────────────────────────
     byItem    체크리스트 항목 번호 → 그 문제에 넣을 시설물.  ★ 여기를 고칩니다
               번호는 server/checklist.js 의 id 와 정확히 같아야 합니다.
     fallback  항목 판독이 없을 때만 쓰는 예비 목록.
               (서버가 꺼져 더미 점수로 돌 때, 연구원이 점수만 손으로 조정했을 때)

   시설물 id(R-XXX-NN)는 감사 추적용 규칙 번호입니다. 화면과 문서에 근거로
   함께 표시됩니다.
   ════════════════════════════════════════════════════════════════════ */

const RX_RULES = {
  suicide: {
    byItem: {
      'SUI-1': [{ id: 'R-SUI-01', name: '옥상 출입 자동개폐장치', note: '옥상 출입을 평시 통제하고 화재 시에만 자동 개방해, 투신 접근 경로를 차단합니다.' }],
      'SUI-2': [
        { id: 'R-SUI-02', name: '교량 난간 증고·보강', note: '난간 높이를 기준치까지 올리고 발 디딜 곳을 없애 넘어서기 어렵게 만듭니다.' },
        { id: 'R-SUI-03', name: '투신방지 그물망', note: '난간을 넘더라도 추락으로 이어지지 않도록 하부에 그물망을 설치합니다.' },
      ],
      'SUI-3': [{ id: 'R-SUI-04', name: '추락방지 안전펜스', note: '고지대·경사지 가장자리의 개방 구간에 추락방지 펜스를 설치합니다.' }],
      'SUI-4': [{ id: 'R-SUI-05', name: '위기상담 연결 SOS 전화기', note: '고립된 공간에서 즉시 상담으로 연결되는 통로를 확보합니다.' }],
      'SUI-5': [{ id: 'R-SUI-06', name: '생명존중 안전 사이니지', note: '상담 연결 정보와 문구를 시야에 노출해 위기 순간의 행동을 지연시킵니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-SUI-01', name: '옥상 출입 자동개폐장치', note: '옥상 출입을 평시 통제하고 화재 시에만 자동 개방해, 투신 접근 경로를 차단합니다.' },
        { id: 'R-SUI-04', name: '추락방지 안전펜스', note: '고지대·경사지 가장자리의 개방 구간에 추락방지 펜스를 설치합니다.' },
      ],
      caution: [{ id: 'R-SUI-06', name: '생명존중 안전 사이니지', note: '상담 연결 정보와 문구를 시야에 노출해 위기 순간의 행동을 지연시킵니다.' }],
    },
  },

  traffic: {
    byItem: {
      'TRF-1': [
        { id: 'R-TRF-01', name: '보행자 방호울타리', note: '차도와 보도를 물리적으로 분리해 차량 이탈 시 보행자 피해를 차단합니다.' },
        { id: 'R-TRF-02', name: '차량진입억제용 볼라드', note: '보도로의 차량 진입과 불법 주정차를 물리적으로 막습니다.' },
      ],
      'TRF-2': [
        { id: 'R-TRF-03', name: '보도 신설·확폭', note: '차도로 내려서서 걷지 않도록 보행 공간을 확보합니다.' },
        { id: 'R-TRF-04', name: '보행자 우선도로 조성', note: '보도 설치가 어려운 좁은 길은 보행자 우선 구조로 바꿉니다.' },
      ],
      'TRF-3': [
        { id: 'R-TRF-05', name: '바닥형 보행신호등', note: '고개를 숙인 상태에서도 신호를 인지할 수 있게 해 횡단 중 사고를 줄입니다.' },
        { id: 'R-TRF-06', name: '고원식 횡단보도', note: '횡단 지점을 노면보다 높여 차량 감속을 유도하고 보행자를 눈에 띄게 합니다.' },
        { id: 'R-TRF-14', name: '스마트 횡단보도(보행자 감지)', note: '보행자를 감지해 운전자에게 경고하고, 야간·악천후의 인지 지연을 보완합니다.' },
      ],
      'TRF-4': [{ id: 'R-TRF-07', name: '불법주정차 단속 CCTV', note: '보행 공간과 시야를 막는 불법 주정차를 상시 단속합니다.' }],
      'TRF-5': [
        { id: 'R-TRF-08', name: '도로반사경', note: '건물·주차 차량에 가려진 교차 구간의 시야를 확보합니다.' },
        { id: 'R-TRF-09', name: '노면 색깔유도선', note: '진입 동선을 노면에 표시해 교차 지점의 혼선을 줄입니다.' },
      ],
      'TRF-6': [{ id: 'R-TRF-10', name: '고휘도 횡단보도 조명', note: '야간 횡단 보행자의 시인성을 확보해 운전자의 인지 거리를 늘립니다.' }],
      'TRF-7': [
        { id: 'R-TRF-11', name: '과속방지턱', note: '물리적으로 주행 속도를 낮춰 보행 구간의 충돌 심각도를 줄입니다.' },
        { id: 'R-TRF-12', name: '어린이보호구역 표지·노면표시', note: '보호구역임을 운전자에게 명확히 고지합니다.' },
        { id: 'R-TRF-13', name: '과속경고 전광표지', note: '실시간 속도를 표시해 운전자의 자발적 감속을 유도합니다.' },
      ],
    },
    fallback: {
      danger: [
        { id: 'R-TRF-05', name: '바닥형 보행신호등', note: '고개를 숙인 상태에서도 신호를 인지할 수 있게 해 횡단 중 사고를 줄입니다.' },
        { id: 'R-TRF-01', name: '보행자 방호울타리', note: '차도와 보도를 물리적으로 분리해 차량 이탈 시 보행자 피해를 차단합니다.' },
      ],
      caution: [{ id: 'R-TRF-10', name: '고휘도 횡단보도 조명', note: '야간 횡단 보행자의 시인성을 확보해 운전자의 인지 거리를 늘립니다.' }],
    },
  },

  fire: {
    byItem: {
      'FIR-1': [
        { id: 'R-FIR-01', name: '스마트 소화전', note: '소방용수 위치와 수압을 원격 감시해, 화재 초기 대응 시간을 단축합니다.' },
        { id: 'R-FIR-02', name: '옥외 소화기함', note: '주민이 초기 진화에 즉시 대응할 수 있는 거점을 확보합니다.' },
      ],
      'FIR-2': [
        { id: 'R-FIR-03', name: '소방차 진입로 노면표시', note: '불법 주정차로 인한 소방차 진입 지연을 예방합니다.' },
        { id: 'R-FIR-04', name: '소방차 전용구역 표시', note: '소방 활동 공간을 상시 비워 두도록 지정합니다.' },
        { id: 'R-FIR-05', name: '비상소화장치함', note: '소방차 진입이 어려운 구간에 주민이 쓸 수 있는 소화 설비를 둡니다.' },
      ],
      'FIR-3': [{ id: 'R-FIR-06', name: '화재감지 IoT 센서', note: '밀집 구조에서 연소 확대 전에 화재를 조기에 감지합니다.' }],
      'FIR-4': [{ id: 'R-FIR-06', name: '화재감지 IoT 센서', note: '노후 배선·설비 구간의 발화를 조기에 감지합니다.' }],
      'FIR-5': [{ id: 'R-FIR-07', name: '옥외 적치물 정비', note: '옥외에 쌓인 가연물을 정리해 발화·연소 확대 요인을 없앱니다.' }],
      'FIR-6': [{ id: 'R-FIR-06', name: '화재감지 IoT 센서', note: '노후 건축물의 화재를 조기에 감지해 대피 시간을 확보합니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-FIR-01', name: '스마트 소화전', note: '소방용수 위치와 수압을 원격 감시해, 화재 초기 대응 시간을 단축합니다.' },
        { id: 'R-FIR-03', name: '소방차 진입로 노면표시', note: '불법 주정차로 인한 소방차 진입 지연을 예방합니다.' },
      ],
      caution: [{ id: 'R-FIR-02', name: '옥외 소화기함', note: '주민이 초기 진화에 즉시 대응할 수 있는 거점을 확보합니다.' }],
    },
  },

  crime: {
    byItem: {
      'CRM-1': [
        { id: 'R-CRM-01', name: 'LED 보안등 교체·증설', note: '어두운 구간의 조도를 기준치까지 끌어올립니다.' },
        { id: 'R-CRM-02', name: '범죄예방 환경디자인 조명', note: '사각지대를 남기지 않도록 조명 배치를 다시 계획합니다.' },
      ],
      'CRM-2': [
        { id: 'R-CRM-03', name: 'CPTED 방범 CCTV', note: '감시성을 확보해 범죄 기회를 줄이고 사후 추적을 가능하게 합니다.' },
        { id: 'R-CRM-04', name: '안심 비상벨(SOS)', note: '위급 상황에서 즉시 신고할 수 있는 지점을 확보합니다.' },
      ],
      'CRM-3': [
        { id: 'R-CRM-05', name: '시야 확보 정비(벽면·식재)', note: '담장·수목으로 가려진 구간을 정비해 자연 감시가 되도록 합니다.' },
        { id: 'R-CRM-06', name: '반사형 안전거울', note: '구조상 트일 수 없는 사각지대의 시야를 거울로 확보합니다.' },
      ],
      'CRM-4': [
        { id: 'R-CRM-07', name: '스마트 안심 부스', note: '은폐 공간 인근에 대피·신고가 가능한 거점을 둡니다.' },
        { id: 'R-CRM-08', name: '안심 귀갓길 노면표시', note: '감시가 되는 경로로 보행 동선을 유도합니다.' },
      ],
      'CRM-5': [{ id: 'R-CRM-08', name: '안심 귀갓길 노면표시', note: '자연 감시가 되는 경로로 보행 동선을 유도합니다.' }],
      'CRM-6': [{ id: 'R-CRM-09', name: '노후 벽면 환경 정비', note: '방치된 인상을 없애 범죄 유발 환경을 개선합니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-CRM-03', name: 'CPTED 방범 CCTV', note: '감시성을 확보해 범죄 기회를 줄이고 사후 추적을 가능하게 합니다.' },
        { id: 'R-CRM-02', name: '범죄예방 환경디자인 조명', note: '사각지대의 조도를 기준치까지 끌어올려 은폐 공간을 없앱니다.' },
      ],
      caution: [{ id: 'R-CRM-05', name: '시야 확보 정비(벽면·식재)', note: '담장·수목으로 가려진 구간을 정비해 자연 감시가 되도록 합니다.' }],
    },
  },

  life: {
    byItem: {
      'LIF-1': [
        { id: 'R-LIF-01', name: '보행로 단차 정비', note: '보도 턱과 요철을 제거해 보행 장애 요소를 없앱니다.' },
        { id: 'R-LIF-02', name: '점자블록 정비', note: '파손·누락된 점자블록을 규격에 맞게 다시 설치합니다.' },
      ],
      'LIF-2': [{ id: 'R-LIF-03', name: '보행 안전 핸드레일', note: '경사로·계단 구간의 낙상 사고를 물리적으로 방지합니다.' }],
      'LIF-3': [
        { id: 'R-LIF-04', name: '미끄럼 방지 포장', note: '결빙·우천 시 전도 사고를 줄이는 노면 마감을 적용합니다.' },
        { id: 'R-LIF-05', name: '노면 결빙방지 열선', note: '급경사·응달 구간의 결빙을 원천적으로 막습니다.' },
      ],
      'LIF-4': [{ id: 'R-LIF-06', name: '보행 장애물(입간판·적치물) 정비', note: '보행 동선을 막는 장애물을 정리해 유효 보도폭을 확보합니다.' }],
      'LIF-5': [{ id: 'R-LIF-07', name: '배수시설(측구·맨홀) 정비', note: '파손·개방된 맨홀과 측구를 정비해 추락·전도를 막습니다.' }],
      'LIF-6': [{ id: 'R-LIF-08', name: '보행자 우선도로 조성', note: '보행자와 이륜차 동선이 섞이는 구간을 보행자 우선 구조로 바꿉니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-LIF-03', name: '보행 안전 핸드레일', note: '경사로·계단 구간의 낙상 사고를 물리적으로 방지합니다.' },
        { id: 'R-LIF-04', name: '미끄럼 방지 포장', note: '결빙·우천 시 전도 사고를 줄이는 노면 마감을 적용합니다.' },
      ],
      caution: [{ id: 'R-LIF-01', name: '보행로 단차 정비', note: '보도 턱과 요철을 제거해 보행 장애 요소를 없앱니다.' }],
    },
  },

  industrial: {
    byItem: {
      'IND-1': [{ id: 'R-IND-01', name: '작업구간 경광등·유도등', note: '작업 구간의 존재를 보행자·운전자에게 미리 알립니다.' }],
      'IND-2': [
        { id: 'R-IND-02', name: '작업구간 방호 펜스', note: '작업 동선과 보행 동선을 분리해 제3자 재해를 차단합니다.' },
        { id: 'R-IND-03', name: '안전 사이니지·경고 표지', note: '위험 구역과 필수 보호구를 명확히 고지해 무방비 진입을 막습니다.' },
      ],
      'IND-3': [{ id: 'R-IND-04', name: '가설 보행자 통로', note: '작업 구간을 우회하는 안전한 보행 통로를 임시로 확보합니다.' }],
      'IND-4': [{ id: 'R-IND-05', name: '하역·적재구역 노면표시', note: '작업 차량의 이동 구역을 지정해 혼재 작업의 충돌 위험을 낮춥니다.' }],
      'IND-5': [
        { id: 'R-IND-05', name: '하역·적재구역 노면표시', note: '도로면까지 나온 작업 구역의 경계를 명확히 합니다.' },
        { id: 'R-IND-03', name: '안전 사이니지·경고 표지', note: '작업이 이뤄지는 구간임을 통행자에게 고지합니다.' },
      ],
      'IND-6': [{ id: 'R-IND-02', name: '작업구간 방호 펜스', note: '노상에 놓인 자재·장비 구역을 통행 동선과 분리합니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-IND-02', name: '작업구간 방호 펜스', note: '작업 동선과 보행 동선을 분리해 제3자 재해를 차단합니다.' },
        { id: 'R-IND-03', name: '안전 사이니지·경고 표지', note: '위험 구역과 필수 보호구를 명확히 고지해 무방비 진입을 막습니다.' },
      ],
      caution: [{ id: 'R-IND-05', name: '하역·적재구역 노면표시', note: '작업 차량의 이동 구역을 지정해 혼재 작업의 충돌 위험을 낮춥니다.' }],
    },
  },

  infection: {
    byItem: {
      'INF-1': [
        { id: 'R-INF-01', name: '대기공간 환기설비', note: '밀폐된 대기 공간에 강제 환기 설비를 넣어 비말 체류를 줄입니다.' },
        { id: 'R-INF-02', name: '개방형 대기공간 정비', note: '밀폐 구조를 자연 환기가 되는 개방형으로 바꿉니다.' },
      ],
      'INF-2': [{ id: 'R-INF-03', name: '스마트 클린 쉘터', note: '밀집 대기 공간에 환기·소독 설비를 갖춰 비말 전파 위험을 낮춥니다.' }],
      'INF-3': [{ id: 'R-INF-04', name: '옥외 손 위생 스테이션', note: '접촉 감염을 차단하는 상시 위생 거점을 확보합니다.' }],
      'INF-4': [{ id: 'R-INF-02', name: '개방형 대기공간 정비', note: '적치물을 정리하고 위생 관리가 되는 구조로 개선합니다.' }],
      'INF-5': [{ id: 'R-INF-05', name: '보도 신설·확폭', note: '마주 지나갈 때 거리를 둘 수 있도록 보행 폭을 확보합니다.' }],
      'INF-6': [{ id: 'R-INF-06', name: '항균 손잡이·표면 마감', note: '손이 자주 닿는 공용 시설물의 표면을 항균 마감으로 교체합니다.' }],
    },
    fallback: {
      danger: [
        { id: 'R-INF-03', name: '스마트 클린 쉘터', note: '밀집 대기 공간에 환기·소독 설비를 갖춰 비말 전파 위험을 낮춥니다.' },
        { id: 'R-INF-04', name: '옥외 손 위생 스테이션', note: '접촉 감염을 차단하는 상시 위생 거점을 확보합니다.' },
      ],
      caution: [{ id: 'R-INF-02', name: '개방형 대기공간 정비', note: '밀폐된 대기 공간을 자연 환기가 되는 구조로 개선합니다.' }],
    },
  },
};

/* ────────────────────────────────────────────────────────────────────
   시설물 목록 (드롭다운 선택용) — 초안

   연구원이 처방을 직접 고치거나 추가할 때 고르는 표준 시설물 목록입니다.
   위 RX_RULES 가 "자동으로 뽑히는 것"이라면, 이 목록은 "사람이 고를 수 있는 것"의
   전체 범위입니다. 과업4 표준 설계 가이드라인이 확정되면 이 목록을 그 기준으로
   맞추고, 각 항목에 표준단가·표준도면 번호를 붙이게 됩니다.

   ※ 목록에 없는 시설물은 드롭다운 맨 아래 "직접 입력"으로 넣을 수 있습니다.
   ──────────────────────────────────────────────────────────────────── */
const RX_CATALOG = [
  { group: '자살 예방', items: [
    '옥상 출입 자동개폐장치', '추락방지 안전펜스', '교량 난간 증고·보강',
    '생명존중 안전 사이니지', '위기상담 연결 SOS 전화기', '투신방지 그물망',
  ]},
  { group: '교통안전', items: [
    '바닥형 보행신호등', '보행자 방호울타리', '차량진입억제용 볼라드',
    '고휘도 횡단보도 조명', '스마트 횡단보도(보행자 감지)', '고원식 횡단보도',
    '과속방지턱', '과속경고 전광표지', '도로반사경',
    '노면 색깔유도선', '어린이보호구역 표지·노면표시', '불법주정차 단속 CCTV',
    '보도 신설·확폭',
  ]},
  { group: '화재안전', items: [
    '스마트 소화전', '옥외 소화기함', '비상소화장치함',
    '소방차 진입로 노면표시', '소방차 전용구역 표시', '화재감지 IoT 센서',
    '옥외 적치물 정비',
  ]},
  { group: '범죄예방 (CPTED)', items: [
    'CPTED 방범 CCTV', '안심 비상벨(SOS)', '범죄예방 환경디자인 조명',
    'LED 보안등 교체·증설', '안심 귀갓길 노면표시', '반사형 안전거울',
    '시야 확보 정비(벽면·식재)', '노후 벽면 환경 정비', '스마트 안심 부스',
  ]},
  { group: '생활안전', items: [
    '보행 안전 핸드레일', '미끄럼 방지 포장', '보행로 단차 정비',
    '점자블록 정비', '배수시설(측구·맨홀) 정비', '노면 결빙방지 열선',
    '보행자 우선도로 조성', '보행 장애물(입간판·적치물) 정비',
  ]},
  { group: '산업재해', items: [
    '작업구간 방호 펜스', '안전 사이니지·경고 표지', '하역·적재구역 노면표시',
    '가설 보행자 통로', '작업구간 경광등·유도등',
  ]},
  { group: '감염병', items: [
    '스마트 클린 쉘터', '옥외 손 위생 스테이션', '개방형 대기공간 정비',
    '대기공간 환기설비', '항균 손잡이·표면 마감',
  ]},
];

/* ────────────────────────────────────────────────────────────────────
   표준단가표 (임시 추정값)

   ★ 지금 값은 공인된 표준단가가 아닙니다. ★
   과업4 「재난 예방 인프라 표준 설계 가이드라인」의 표준 단가 매트릭스가
   확정되기 전까지, 서식2(예산 산출 근거)가 실제로 금액을 계산하는지
   확인하기 위해 넣어 둔 자리표시용 숫자입니다. 조달청 가격정보·지자체
   일위대가가 확정되면 이 표만 교체하면 문서 전체에 반영됩니다.

   가격은 자재비 + 설치비를 합한 개략 금액(원)이며 부가세는 제외했습니다.

     unit   산출 단위 (개소 / m / ㎡ / 식)
     qty    기본 수량 — 100 × 100m 격자 한 곳에 통상 들어가는 정도.
            현장마다 달라지므로 연구원이 고치는 것을 전제로 한 기본값입니다.
     price  단위당 단가 (원)
   ──────────────────────────────────────────────────────────────────── */
const RX_PRICES = {
  /* 자살 예방 */
  '옥상 출입 자동개폐장치':     { unit: '개소', qty: 2,  price:  2500000 },
  '추락방지 안전펜스':          { unit: 'm',    qty: 30, price:   250000 },
  '교량 난간 증고·보강':        { unit: 'm',    qty: 30, price:   350000 },
  '생명존중 안전 사이니지':     { unit: '개',   qty: 4,  price:   800000 },
  '위기상담 연결 SOS 전화기':   { unit: '개소', qty: 1,  price:  3500000 },
  '투신방지 그물망':            { unit: 'm',    qty: 20, price:   450000 },

  /* 교통안전 */
  '바닥형 보행신호등':          { unit: '개소', qty: 1,  price: 12000000 },
  '보행자 방호울타리':          { unit: 'm',    qty: 40, price:   150000 },
  '차량진입억제용 볼라드':      { unit: '개',   qty: 8,  price:   250000 },
  '고휘도 횡단보도 조명':       { unit: '개소', qty: 1,  price:  6000000 },
  '스마트 횡단보도(보행자 감지)': { unit: '개소', qty: 1, price: 25000000 },
  '고원식 횡단보도':            { unit: '개소', qty: 1,  price:  8000000 },
  '과속방지턱':                 { unit: '개소', qty: 2,  price:  1200000 },
  '과속경고 전광표지':          { unit: '개소', qty: 1,  price:  7500000 },
  '도로반사경':                 { unit: '개',   qty: 2,  price:   450000 },
  '노면 색깔유도선':            { unit: 'm',    qty: 60, price:    30000 },
  '어린이보호구역 표지·노면표시': { unit: '식',  qty: 1,  price:  3500000 },
  '불법주정차 단속 CCTV':       { unit: '개소', qty: 1,  price: 18000000 },
  '보도 신설·확폭':             { unit: '㎡',   qty: 80, price:   180000 },

  /* 화재안전 */
  '스마트 소화전':              { unit: '개소', qty: 1,  price: 15000000 },
  '옥외 소화기함':              { unit: '개소', qty: 4,  price:   450000 },
  '비상소화장치함':             { unit: '개소', qty: 1,  price:  3500000 },
  '소방차 진입로 노면표시':     { unit: 'm',    qty: 50, price:    40000 },
  '소방차 전용구역 표시':       { unit: '개소', qty: 2,  price:   600000 },
  '화재감지 IoT 센서':          { unit: '개',   qty: 10, price:   350000 },
  '옥외 적치물 정비':           { unit: '식',   qty: 1,  price:  2000000 },

  /* 범죄예방 (CPTED) */
  'CPTED 방범 CCTV':            { unit: '개소', qty: 2,  price: 12000000 },
  '안심 비상벨(SOS)':           { unit: '개소', qty: 2,  price:  4500000 },
  '범죄예방 환경디자인 조명':   { unit: '개소', qty: 6,  price:  1800000 },
  'LED 보안등 교체·증설':       { unit: '개소', qty: 8,  price:   950000 },
  '안심 귀갓길 노면표시':       { unit: 'm',    qty: 80, price:    50000 },
  '반사형 안전거울':            { unit: '개',   qty: 3,  price:   400000 },
  '시야 확보 정비(벽면·식재)':  { unit: '식',   qty: 1,  price:  2500000 },
  '노후 벽면 환경 정비':        { unit: '㎡',   qty: 60, price:   120000 },
  '스마트 안심 부스':           { unit: '개소', qty: 1,  price: 35000000 },

  /* 생활안전 */
  '보행 안전 핸드레일':         { unit: 'm',    qty: 40, price:   120000 },
  '미끄럼 방지 포장':           { unit: '㎡',   qty: 100, price:    60000 },
  '보행로 단차 정비':           { unit: '㎡',   qty: 40, price:    90000 },
  '점자블록 정비':              { unit: '㎡',   qty: 30, price:   110000 },
  '배수시설(측구·맨홀) 정비':   { unit: 'm',    qty: 40, price:   220000 },
  '노면 결빙방지 열선':         { unit: 'm',    qty: 30, price:   450000 },
  '보행자 우선도로 조성':       { unit: '㎡',   qty: 200, price:  250000 },
  '보행 장애물(입간판·적치물) 정비': { unit: '식', qty: 1, price:  1500000 },

  /* 산업재해 */
  '작업구간 방호 펜스':         { unit: 'm',    qty: 50, price:    80000 },
  '안전 사이니지·경고 표지':    { unit: '개',   qty: 6,  price:   350000 },
  '하역·적재구역 노면표시':     { unit: '㎡',   qty: 60, price:    25000 },
  '가설 보행자 통로':           { unit: 'm',    qty: 30, price:   180000 },
  '작업구간 경광등·유도등':     { unit: '개',   qty: 6,  price:   250000 },

  /* 감염병 */
  '스마트 클린 쉘터':           { unit: '개소', qty: 1,  price: 45000000 },
  '옥외 손 위생 스테이션':      { unit: '개소', qty: 2,  price:  2800000 },
  '개방형 대기공간 정비':       { unit: '식',   qty: 1,  price:  8000000 },
  '대기공간 환기설비':          { unit: '식',   qty: 1,  price: 12000000 },
  '항균 손잡이·표면 마감':      { unit: '식',   qty: 1,  price:  1200000 },
};

/* 시설물 이름으로 단가를 찾습니다. 목록에 없는(연구원이 직접 입력한)
   시설물은 null — 문서에서 "단가 미산정"으로 표시됩니다. */
function auriRxPrice(name) {
  return RX_PRICES[name] || null;
}

/* 원 단위 금액에 천 단위 쉼표를 넣습니다 */
function auriWon(n) {
  return Number(n).toLocaleString('ko-KR');
}

/* 목록 화면에 짧게 붙일 단가 표기 — 예) 1,200만원/개소 */
function auriPriceShort(name) {
  const p = auriRxPrice(name);
  if (!p) return '';
  const man = Math.round(p.price / 10000);
  const txt = man >= 10000
    ? `${Math.floor(man / 10000)}억 ${man % 10000 ? auriWon(man % 10000) + '만' : ''}원`
    : `${auriWon(man)}만원`;
  return `${txt}/${p.unit}`;
}

function auriCatalogHas(name) {
  return RX_CATALOG.some(function (g) { return g.items.indexOf(name) !== -1; });
}

/* 드롭다운에 넣을 <optgroup> 묶음을 만듭니다.
   currentName 이 목록에 없으면 "직접 입력"이 선택된 상태로 그립니다. */
function auriCatalogOptions(currentName) {
  const known = RX_CATALOG.some(function (g) { return g.items.indexOf(currentName) !== -1; });
  const esc = function (s) { return String(s).replace(/</g, '&lt;').replace(/"/g, '&quot;'); };

  let html = '<option value="">시설물을 선택하세요</option>';
  RX_CATALOG.forEach(function (g) {
    html += `<optgroup label="${esc(g.group)}">`;
    g.items.forEach(function (name) {
      html += `<option value="${esc(name)}"${name === currentName ? ' selected' : ''}>${esc(name)}</option>`;
    });
    html += '</optgroup>';
  });
  html += `<option value="__custom__"${!known && currentName ? ' selected' : ''}>직접 입력…</option>`;
  return html;
}

const RX_PRIORITY = {
  must:      { cls: 'must',      label: '필수' },
  recommend: { cls: 'recommend', label: '권장' },
};

/* ────────────────────────────────────────────────────────────────────
   처방 개수 상한 — ★ 담당자가 조절하는 값

   거리 사진 한 장에서 체크리스트 항목의 절반쯤이 문제로 잡히는 것은
   보통입니다(대부분의 골목에 CCTV·핸드레일·소화전이 없으니까요).
   상한이 없으면 한 지점에 30~40종이 나와서 문서로 쓸 수 없습니다.

   100 × 100m 격자 한 곳에 실제로 넣을 수 있는 규모, 그리고 안전사업지구
   개소당 한도(약 10억원) 안에서 여러 격자를 다룰 수 있는 규모를 기준으로
   잡은 값입니다. 숫자를 키우면 더 많이 나옵니다.
   ──────────────────────────────────────────────────────────────────── */
const RX_MAX_PER_FIELD = 3;   // 한 분야에서 뽑을 최대 시설물 수
const RX_MAX_TOTAL = 12;      // 한 지점에서 뽑을 최대 시설물 수

/* 상한 때문에 빠진 시설물 수 — 화면에서 "몇 종이 더 있다"고 알릴 때 씁니다.
   auriPrescribe 를 부를 때마다 새로 채워집니다. */
let AURI_RX_DROPPED = 0;

/* ────────────────────────────────────────────────────────────────────
   연구원이 직접 손댄 내용 (auri_rx_overrides)

   규칙 엔진이 뽑은 결과를 그대로 덮어쓰지 않고 따로 보관합니다.
   그래야 점수를 다시 조정해도 연구원이 지우거나 추가한 항목이 살아남고,
   "규칙이 뽑은 것"과 "사람이 손댄 것"을 구분해 감사에 남길 수 있습니다.

     removed : 규칙이 뽑았지만 연구원이 뺀 시설물의 규칙번호 목록
     edits   : 규칙번호별로 바꾼 이름·설명·우선순위
     added   : 연구원이 직접 추가한 시설물
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

/* 진단 결과 + 연구원 수정 → 최종 시설물 목록.
   같은 입력이면 언제나 같은 결과가 나오는 결정론적 함수입니다.

   시설물을 고르는 것은 **문제로 확인된 체크리스트 항목**이고,
   분야 점수는 우선순위(필수/권장)만 정합니다. 항목 판독이 없는 결과
   (서버가 꺼져 있을 때의 더미 점수, 점수만 손으로 조정한 경우)는
   예전처럼 분야 단위 예비 목록으로 처방합니다. */
function auriPrescribe(results, overrides) {
  const ov = overrides || auriLoadOverrides();
  const out = [];
  const seen = {};
  const fields = [];     // 분야별로 모아 두었다가 마지막에 돌려 가며 채웁니다
  let dropped = 0;

  results.forEach(function (r) {
    const rule = RX_RULES[r.key];
    if (!rule) return;
    if (r.level.key === 'lv-safe') return;          // 안전 판정은 처방 없음

    const priority = r.level.key === 'lv-danger' ? RX_PRIORITY.must : RX_PRIORITY.recommend;
    const hits = (r.findings || []).filter(function (f) { return f.risk; });

    /* ① 확인된 문제마다 시설물 하나씩 먼저 배정합니다.
          한 항목에 시설물이 여러 개 붙어 있는 것은 같은 문제를 푸는
          '대안'이지 전부 필요한 것이 아닙니다. 그래서 모든 문제에
          하나씩 돌린 뒤에야 두 번째를 넣습니다. 그러지 않으면 앞쪽
          항목이 시설물을 둘씩 가져가고 뒤쪽 문제는 아무것도 못 받습니다. */
    const picked = [];
    for (let depth = 0; depth < 4; depth++) {
      let added = false;
      hits.forEach(function (f) {
        const list = rule.byItem[f.id] || [];
        if (!list[depth]) return;
        picked.push({ item: list[depth], trigger: f });
        added = true;
      });
      if (!added) break;
    }

    /* ② 항목 판독이 없으면 분야 단위 예비 목록으로 */
    if (!picked.length) {
      const bucket = r.level.key === 'lv-danger' ? rule.fallback.danger : rule.fallback.caution;
      bucket.forEach(function (item) { picked.push({ item: item, trigger: null }); });
    }

    const list = [];
    picked.forEach(function (p) {
      const item = p.item;
      if (ov.removed.indexOf(item.id) !== -1) return;   // 연구원이 뺀 항목
      if (seen[item.id]) return;    // 여러 항목이 같은 시설물을 불러도 한 번만
      if (list.length >= RX_MAX_PER_FIELD) { dropped++; return; }   // 분야당 상한
      seen[item.id] = true;

      const e = ov.edits[item.id] || {};
      list.push({
        id: item.id,
        name: e.name || item.name,
        note: e.note || item.note,
        category: r.name,
        score: r.score,
        levelLabel: r.level.label,
        priority: e.priorityCls ? RX_PRIORITY[e.priorityCls] : priority,
        edited: !!(e.name || e.note || e.priorityCls),
        /* 이 시설물을 부른 체크리스트 항목 — 문서의 근거가 됩니다 */
        trigger: p.trigger ? { id: p.trigger.id, ask: p.trigger.ask, note: p.trigger.note } : null,
      });
    });

    if (list.length) fields.push({ danger: priority.cls === 'must', score: r.score, list: list });
  });

  /* ③ 전체 상한도 분야별로 돌려 가며 채웁니다.
        위에서부터 잘라 버리면 뒤쪽 분야는 위험 판정을 받고도 시설물을
        하나도 못 받습니다. 모든 분야에 하나씩 준 뒤에 두 번째를 줍니다.
        순서는 필수(위험) 먼저, 같은 우선순위에서는 점수가 높은 분야부터. */
  fields.sort(function (a, b) {
    if (a.danger !== b.danger) return a.danger ? -1 : 1;
    return b.score - a.score;
  });

  for (let depth = 0; depth < RX_MAX_PER_FIELD; depth++) {
    for (let i = 0; i < fields.length; i++) {
      const item = fields[i].list[depth];
      if (!item) continue;
      if (out.length >= RX_MAX_TOTAL) { dropped++; continue; }
      out.push(item);
    }
  }

  /* 연구원이 직접 추가한 시설물은 점수·상한과 무관하게 항상 포함됩니다 */
  const custom = [];
  ov.added.forEach(function (item) {
    custom.push({
      id: item.id,
      name: item.name,
      note: item.note,
      category: item.category || '직접 지정',
      score: null,
      levelLabel: null,
      priority: RX_PRIORITY[item.priorityCls] || RX_PRIORITY.recommend,
      custom: true,
    });
  });

  /* 필수 → 권장 순, 같은 우선순위 안에서는 점수 높은 분야부터.
     연구원이 직접 넣은 것은 상한과 무관하게 항상 맨 뒤에 남습니다. */
  out.sort(function (a, b) {
    if (a.priority.cls !== b.priority.cls) return a.priority.cls === 'must' ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  AURI_RX_DROPPED = dropped;
  return out.concat(custom);
}

/* 상한 때문에 빠진 시설물이 몇 종인지 — 화면에서 안내에 씁니다.
   빠진 것도 진단으로 확인된 문제이므로, 조용히 없애지 않고 알립니다. */
function auriRxDropped() {
  return AURI_RX_DROPPED;
}

/* 규칙번호로 원래 시설물을 찾습니다. 연구원이 고친 내용이 원본과 다른지
   비교할 때 씁니다 (같으면 굳이 수정으로 기록하지 않습니다). */
function auriFindRule(id) {
  for (const key in RX_RULES) {
    const rule = RX_RULES[key];
    for (const itemId in rule.byItem) {
      const found = rule.byItem[itemId].find(function (x) { return x.id === id; });
      if (found) return found;
    }
    for (const bucket of ['danger', 'caution']) {
      const found = rule.fallback[bucket].find(function (x) { return x.id === id; });
      if (found) return found;
    }
  }
  return null;
}

/* 처방의 근거 한 줄.
   "사진에서 무엇을 봤기에 이 시설물인가"를 한 줄로 되짚을 수 있어야 합니다.
   뒤에 표준단가를 붙여 어느 항목이 비싼지 고르는 중에 보이게 합니다. */
function auriRxBasis(it) {
  const price = auriPriceShort(it.name);
  const tail = price ? ` · 표준단가 ${price}` : ' · 표준단가 미산정';

  if (it.custom) return '근거: 연구원 직접 추가' + tail;
  const edited = it.edited ? ' · 연구원 수정' : '';

  if (it.trigger) {
    const seen = it.trigger.note ? ` — ${it.trigger.note}` : '';
    return `근거: 사진 판독 ${it.trigger.id}${seen} → 규칙 ${it.id} · ${it.category} ${it.levelLabel} 판정${edited}${tail}`;
  }
  return `근거: ${it.category} ${it.score}점 · ${it.levelLabel} 판정 → 규칙 ${it.id}${edited}${tail}`;
}

/* 최종 목록을 다음 단계로 넘깁니다. 규칙 엔진은 리포트 단계에서만 돌리고,
   시각화·진단서는 이 결과를 그대로 받아 씁니다. */
function auriSavePrescriptions(items) {
  sessionStorage.setItem('auri_prescriptions', JSON.stringify(items));
}
