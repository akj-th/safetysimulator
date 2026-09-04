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
  const hea = item && (item.hea || (AuriPalette.byName(item.name) || {}).hea);
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
function auriPrescribe(results, overrides) {
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

    /* ⑤ 상위 N개만 */
    let taken = 0;
    for (let i = 0; i < pool.length && taken < limit; i++) {
      const c = pool[i];
      const p = c.program;
      if (ov.removed.indexOf(p.id) !== -1) continue;   // 연구원이 뺀 항목
      if (seen[p.id]) continue;                        // 다른 분야에서 이미 뽑힘
      seen[p.id] = true;
      taken++;

      const e = ov.edits[p.id] || {};
      const auto = c.fit >= RX_MUST_FIT ? RX_PRIORITY.must : RX_PRIORITY.recommend;
      const t = c.triggers[0];

      out.push({
        id: p.id,
        name: e.name || p.name,
        /* 설명은 팔레트의 효과크기를 그대로 씁니다 — 우리가 지어내지 않습니다 */
        note: e.note || p.effect || '',
        source: p.source || '',
        hea: p.hea,
        amount: p.amount,
        palette: p.group,                 // 'new' | 'existing'
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
