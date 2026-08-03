/* ════════════════════════════════════════════════════════════════════
   개선 시설물 처방 규칙표 (과업4 「재난 예방 인프라 표준 설계 가이드라인」 초안)

   ★ checklist.js 와 함께 담당자가 계속 고쳐 나가는 파일입니다.

   구조: 7대 분야별로 '위험' 판정일 때 / '주의' 판정일 때 넣을 시설물을 미리 정해 둠.
     danger  : 7~9단계 → 우선순위 '필수'
     caution : 4~6단계 → 우선순위 '권장'
     안전(1~3단계)은 처방 없음.

   각 시설물의 id는 감사 추적용 규칙 번호입니다. 화면과 문서에 근거로 함께
   표시되므로 "왜 이 시설물이 나왔는가"를 진단 점수까지 되짚을 수 있습니다.
   ※ 표준 단가·도면은 과업4 매뉴얼 확정 후 여기에 필드로 추가할 예정.
   ════════════════════════════════════════════════════════════════════ */

const RX_RULES = {
  suicide: {
    danger: [
      { id: 'R-SUI-01', name: '옥상 출입 자동개폐장치', note: '고층 건축물 옥상 출입을 평시 통제하고 화재 시에만 자동 개방해, 투신 접근 경로를 차단합니다.' },
      { id: 'R-SUI-02', name: '추락방지 안전펜스', note: '교량·옥상·고지대 난간의 높이와 형상을 보강해 넘어서기 어렵게 만듭니다.' }
    ],
    caution: [
      { id: 'R-SUI-03', name: '생명존중 안전 사이니지', note: '상담 연결 정보와 문구를 시야에 노출해 위기 순간의 행동을 지연시킵니다.' }
    ]
  },
  traffic: {
    danger: [
      { id: 'R-TRF-01', name: '바닥형 보행신호등', note: '보행자가 고개를 숙인 상태에서도 신호를 인지할 수 있게 해 횡단 중 사고를 줄입니다.' },
      { id: 'R-TRF-02', name: '보행자 방호울타리', note: '차도와 보도를 물리적으로 분리해 차량 이탈 시 보행자 피해를 차단합니다.' }
    ],
    caution: [
      { id: 'R-TRF-03', name: '고휘도 횡단보도 조명', note: '야간 횡단 보행자의 시인성을 확보해 운전자의 인지 거리를 늘립니다.' }
    ]
  },
  fire: {
    danger: [
      { id: 'R-FIR-01', name: '스마트 소화전', note: '소방용수 위치와 수압을 원격 감시해, 화재 초기 대응 시간을 단축합니다.' },
      { id: 'R-FIR-02', name: '소방차 진입로 노면표시', note: '불법 주정차로 인한 소방차 진입 지연을 예방합니다.' }
    ],
    caution: [
      { id: 'R-FIR-03', name: '옥외 소화기함', note: '주민이 초기 진화에 즉시 대응할 수 있는 거점을 확보합니다.' }
    ]
  },
  crime: {
    danger: [
      { id: 'R-CRM-01', name: 'CPTED 방범 CCTV·비상벨', note: '감시성을 확보하고 즉시 신고가 가능하게 해 범죄 기회를 줄입니다.' },
      { id: 'R-CRM-02', name: '범죄예방 환경디자인 조명', note: '사각지대의 조도를 기준치까지 끌어올려 은폐 공간을 없앱니다.' }
    ],
    caution: [
      { id: 'R-CRM-03', name: '시야 확보 정비 (벽면·식재)', note: '담장·수목으로 가려진 구간을 정비해 자연 감시가 되도록 합니다.' }
    ]
  },
  life: {
    danger: [
      { id: 'R-LIF-01', name: '보행 안전 핸드레일', note: '경사로·계단 구간의 낙상 사고를 물리적으로 방지합니다.' },
      { id: 'R-LIF-02', name: '미끄럼 방지 포장', note: '결빙·우천 시 전도 사고를 줄이는 노면 마감을 적용합니다.' }
    ],
    caution: [
      { id: 'R-LIF-03', name: '보행로 단차 정비', note: '보도 턱과 요철을 제거해 보행 장애 요소를 없앱니다.' }
    ]
  },
  industrial: {
    danger: [
      { id: 'R-IND-01', name: '작업구간 방호 펜스', note: '작업 동선과 보행 동선을 분리해 제3자 재해를 차단합니다.' },
      { id: 'R-IND-02', name: '안전 사이니지·경고 표지', note: '위험 구역과 필수 보호구를 명확히 고지해 무방비 진입을 막습니다.' }
    ],
    caution: [
      { id: 'R-IND-03', name: '하역·적재구역 노면표시', note: '작업 차량의 이동 구역을 지정해 혼재 작업의 충돌 위험을 낮춥니다.' }
    ]
  },
  infection: {
    danger: [
      { id: 'R-INF-01', name: '스마트 클린 쉘터', note: '밀집 대기 공간에 환기·소독 설비를 갖춰 비말 전파 위험을 낮춥니다.' },
      { id: 'R-INF-02', name: '옥외 손 위생 스테이션', note: '접촉 감염을 차단하는 상시 위생 거점을 확보합니다.' }
    ],
    caution: [
      { id: 'R-INF-03', name: '개방형 대기공간 정비', note: '밀폐된 대기 공간을 자연 환기가 되는 구조로 개선합니다.' }
    ]
  }
};

const RX_PRIORITY = {
  must:      { cls: 'must',      label: '필수' },
  recommend: { cls: 'recommend', label: '권장' },
};

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

/* 진단 점수 + 연구원 수정 → 최종 시설물 목록.
   같은 입력이면 언제나 같은 결과가 나오는 결정론적 함수입니다. */
function auriPrescribe(results, overrides) {
  const ov = overrides || auriLoadOverrides();
  const out = [];

  results.forEach(function (r) {
    const rule = RX_RULES[r.key];
    if (!rule) return;

    let bucket = null, priority = null;
    if (r.level.key === 'lv-danger')       { bucket = rule.danger;  priority = RX_PRIORITY.must; }
    else if (r.level.key === 'lv-caution') { bucket = rule.caution; priority = RX_PRIORITY.recommend; }
    if (!bucket) return;

    bucket.forEach(function (item) {
      if (ov.removed.indexOf(item.id) !== -1) return;   // 연구원이 뺀 항목
      const e = ov.edits[item.id] || {};
      out.push({
        id: item.id,
        name: e.name || item.name,
        note: e.note || item.note,
        category: r.name,
        score: r.score,
        levelLabel: r.level.label,
        priority: e.priorityCls ? RX_PRIORITY[e.priorityCls] : priority,
        edited: !!(e.name || e.note || e.priorityCls),
      });
    });
  });

  /* 연구원이 직접 추가한 시설물은 점수와 무관하게 항상 포함됩니다 */
  ov.added.forEach(function (item) {
    out.push({
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

  /* 필수 → 권장 순, 같은 우선순위 안에서는 점수 높은 분야부터 */
  out.sort(function (a, b) {
    if (a.priority.cls !== b.priority.cls) return a.priority.cls === 'must' ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });
  return out;
}

/* 규칙번호로 원래 시설물을 찾습니다. 연구원이 고친 내용이 원본과 다른지
   비교할 때 씁니다 (같으면 굳이 수정으로 기록하지 않습니다). */
function auriFindRule(id) {
  for (const key in RX_RULES) {
    for (const bucket of ['danger', 'caution']) {
      const found = RX_RULES[key][bucket].find(function (x) { return x.id === id; });
      if (found) return found;
    }
  }
  return null;
}

/* 처방의 근거 한 줄. 규칙이 뽑은 것과 사람이 넣은 것을 구분해 적습니다. */
function auriRxBasis(it) {
  if (it.custom) return '근거: 연구원 직접 추가';
  const edited = it.edited ? ' · 연구원 수정' : '';
  return `근거: ${it.category} ${it.score}점 · ${it.levelLabel} 판정 → 규칙 ${it.id}${edited}`;
}

/* 최종 목록을 다음 단계로 넘깁니다. 규칙 엔진은 리포트 단계에서만 돌리고,
   시각화·진단서는 이 결과를 그대로 받아 씁니다. */
function auriSavePrescriptions(items) {
  sessionStorage.setItem('auri_prescriptions', JSON.stringify(items));
}
