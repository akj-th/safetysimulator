/* ════════════════════════════════════════════════════════════════════
   현장 확인사항 — 4개 범주로 묶기

   나열식으로 열 몇 개를 늘어놓으면 현장에서 무엇부터 볼지 알 수 없습니다.
   **무엇을 고쳐야 하는 일인가**를 기준으로 묶었습니다.

     물리적 공간 특성  공간의 생김새 — 폭·경사·시야·동선·밀착
                       → 고치려면 공간을 다시 짜야 합니다 (설계·정비 사업)
     시설·설비         설치물의 유무와 상태 — 조명·CCTV·난간·소화전·표지
                       → 고치려면 물건을 놓거나 갈면 됩니다 (설치 사업)
     운영·관리         사람이 치우고 단속해야 할 것 — 적치물·불법주정차·방치
                       → 예산보다 관리 주체와 주기의 문제입니다
     인적 특성         누가 언제 다치는가 — 연령대·시간대
                       → 사진이 아니라 119 출동자료에서 나옵니다

   앞의 셋은 **사진 판독**에서, 마지막 하나는 **출동자료**에서 옵니다.
   현장에서 눈으로 볼 것(1~3)과 배경 지식(4)이 섞이지 않게 나눈 것이기도 합니다.

   ★ 어느 항목을 어느 범주에 넣을지는 판단입니다. 이 표만 고치면 됩니다.
     server/checklist.js 는 "무엇을 볼 것인가"만 다루므로 건드리지 않습니다.
   ════════════════════════════════════════════════════════════════════ */

const CHECK_GROUPS = [
  { key: 'space',    label: '물리적 공간 특성', desc: '폭·경사·시야·동선 등 공간의 생김새' },
  { key: 'facility', label: '시설·설비',        desc: '조명·CCTV·난간·소화전 등 설치물의 유무와 상태' },
  { key: 'manage',   label: '운영·관리',        desc: '적치물·불법주정차·방치 등 치우고 단속할 것' },
  { key: 'people',   label: '인적 특성',        desc: '연령대·시간대 — 119 출동자료에서 나옵니다' },
];

/* 체크리스트 항목 번호 → 범주 (server/checklist.js 의 id 와 짝입니다) */
const CHECK_GROUP_BY_ITEM = {
  /* 자살 */
  'SUI-1': 'space',    // 옥상 접근 경로 — 건물 구조의 문제
  'SUI-2': 'facility', // 난간 높이·형태
  'SUI-3': 'facility', // 추락방지 펜스
  'SUI-4': 'space',    // 시선에서 차단된 고립 공간
  'SUI-5': 'facility', // 생명존중 사이니지

  /* 교통사고 */
  'TRF-1': 'facility', // 연석·방호울타리·볼라드
  'TRF-2': 'space',    // 보도 폭
  'TRF-3': 'facility', // 노면표시·신호기
  'TRF-4': 'manage',   // 불법 주정차
  'TRF-5': 'space',    // 교차로 시야
  'TRF-6': 'facility', // 가로등
  'TRF-7': 'facility', // 과속방지턱·보호구역 표지

  /* 화재 */
  'FIR-1': 'facility', // 소화전·소화기함
  'FIR-2': 'space',    // 소방차 진입 폭
  'FIR-3': 'space',    // 건물 밀착
  'FIR-4': 'facility', // 외벽·배관·실외기 상태
  'FIR-5': 'manage',   // 옥외 가연물 적치
  'FIR-6': 'space',    // 건축물 노후도

  /* 범죄 */
  'CRM-1': 'facility', // 가로등
  'CRM-2': 'facility', // CCTV·비상벨
  'CRM-3': 'space',    // 담장·수목이 막는 시야
  'CRM-4': 'space',    // 은폐 가능한 공간
  'CRM-5': 'space',    // 창문 방향(자연 감시)
  'CRM-6': 'manage',   // 낙서·폐기물·파손 방치

  /* 생활안전 */
  'LIF-1': 'facility', // 보도 포장·점자블록 상태
  'LIF-2': 'facility', // 핸드레일
  'LIF-3': 'space',    // 경사·배수
  'LIF-4': 'manage',   // 적치물이 막는 보행 동선
  'LIF-5': 'facility', // 맨홀·배수구 파손
  'LIF-6': 'space',    // 보행·자전거 동선 혼재

  /* 산업재해 */
  'IND-1': 'manage',   // 옥외 작업 진행 상태
  'IND-2': 'facility', // 방호 펜스·안전 표지
  'IND-3': 'space',    // 보행·작업 동선 분리
  'IND-4': 'manage',   // 하역이 보도 침범
  'IND-5': 'manage',   // 작업이 도로면까지
  'IND-6': 'manage',   // 자재·중장비 노상 방치

  /* 감염병 */
  'INF-1': 'space',    // 밀폐형 대기 공간
  'INF-2': 'space',    // 좁은 밀집 공간
  'INF-3': 'facility', // 손 위생 시설
  'INF-4': 'manage',   // 폐기물 적치·위생 관리
  'INF-5': 'space',    // 보행로 폭
  'INF-6': 'manage',   // 공용 시설물 오염·파손 방치
};

/** 통계에서 온 확인 항목의 범주 — 연령·시간대는 인적, 장소는 공간 */
function auriStatCheckGroup(text) {
  return /비중이 높음|시간대 집중/.test(text) ? 'people' : 'space';
}

/** 체크리스트 질문 → 현장에서 볼 문장 ("…있는가" → "…있는지 확인") */
function auriAskToCheck(ask) {
  if (!ask) return '';
  return String(ask)
    .replace(/인가\??$/, '인지 확인').replace(/있는가\??$/, '있는지 확인')
    .replace(/없는가\??$/, '없는지 확인').replace(/되는가\??$/, '되는지 확인')
    .replace(/막히는가\??$/, '막히는지 확인').replace(/보이는가\??$/, '보이는지 확인')
    .replace(/좁은가\??$/, '좁은지 확인').replace(/가\??$/, '지 확인');
}

/**
 * 진단 결과(+통계) → 범주별 현장 확인사항.
 *
 * results  분야별 점수와 항목별 판독 (auri_diagnosis_results)
 * stats    119 출동자료 통계 { data, inside } — 없어도 됩니다
 * focusKeys 통계를 붙일 분야 (중점 3분야). 없으면 통계는 붙이지 않습니다
 *
 * 돌려주는 값: [{ key, label, desc, items: [{ text, field, src }] }]
 */
function auriFieldChecks(results, stats, focusKeys) {
  const bucket = {};
  CHECK_GROUPS.forEach((g) => { bucket[g.key] = []; });
  const focus = focusKeys || new Set();

  (results || []).forEach(function (r) {
    /* ① 사진에서 문제로 확인된 항목 */
    (r.findings || []).forEach(function (f) {
      if (!f.risk) return;
      const g = CHECK_GROUP_BY_ITEM[f.id] || 'space';
      bucket[g].push({ text: auriAskToCheck(f.ask), field: r.name, src: f.id });
    });

    /* ② 출동자료가 가리키는 항목 — 중점 분야에만 붙입니다.
          ①②에서 서술하지 않은 분야에 통계 문장만 나오면 앞뒤가 어긋납니다. */
    if (!stats || !stats.data || !focus.has(r.key)) return;
    const cat = stats.data.categories[r.key];
    if (!cat || typeof AuriStats === 'undefined') return;
    AuriStats.fieldChecks(cat, { inside: stats.inside }).forEach(function (t) {
      bucket[auriStatCheckGroup(t)].push({ text: t, field: r.name, src: '출동자료' });
    });
  });

  /* 같은 문장이 여러 분야에서 나오면 한 번만 (분야는 모아서 표기) */
  return CHECK_GROUPS.map(function (g) {
    const seen = {};
    const items = [];
    bucket[g.key].forEach(function (it) {
      const k = it.text;
      if (seen[k]) { if (seen[k].fields.indexOf(it.field) < 0) seen[k].fields.push(it.field); return; }
      seen[k] = { text: it.text, fields: [it.field], src: it.src };
      items.push(seen[k]);
    });
    return { key: g.key, label: g.label, desc: g.desc, items: items };
  }).filter(function (g) { return g.items.length; });
}
