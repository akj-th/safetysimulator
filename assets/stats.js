/* ════════════════════════════════════════════════════════════════════
   119 출동자료 통계 → 리포트 문장

   ★ 이 파일은 숫자를 문장으로 바꾸기만 합니다. 계산은 하지 않습니다.
     계산은 전부 tools/build-stats.mjs 가 미리 해서 data/stats/ 에
     넣어 두었고, 여기서는 그 값을 골라 문장 틀에 끼웁니다.

   ── 왜 이렇게 하는가 ────────────────────────────────────────────────
   행안부가 요구한 서술은 "구체적 수치 + 비교 기준"입니다.

     (인적요인) 조사지 내 20~49세 비율이 69.9%로,
                지역 전체 55.2% 대비 1.27배 높게 나타남

   이 문장을 AI에게 쓰게 하면 숫자를 지어낼 수 있습니다(할루시네이션).
   행정 문서는 숫자가 근거이므로, **문장은 규칙으로 만들고** AI는
   사진 판독에만 씁니다. 시행계획서의 할루시네이션 방지 요건과 같은 이유입니다.

   ── 서술 6단 중 이 파일이 담당하는 곳 ───────────────────────────────
     ① 인적 특성      ← 여기 (연령·성별)
     ② 사고유형       ← 여기 (장소·유형·시간대)
     ③ 물적·공간환경  ← 사진 AI 진단 결과 (report.html)
     ④ 대응역량       ← 자료 미수신 (AURI 확인 중)
     ⑤ 현장확인 사항  ← 여기 + 사진 판독 결과를 합쳐서
     ⑥ 개선방향       ← 규칙 엔진 (assets/rules.js)
   ════════════════════════════════════════════════════════════════════ */

const AuriStats = (function () {

  /* 조사지 내 표본이 이보다 적으면 비율 뒤에 "참고값"을 붙입니다.
     실제 값은 data/stats/index.json 의 minSample 을 따릅니다(기본 30). */
  let MIN_SAMPLE = 30;

  let _index = null;

  /* ── 불러오기 ─────────────────────────────────────────────────── */

  /** 선택한 지점에서 가장 가까운 지자체의 통계를 불러옵니다 */
  async function load(lat, lng) {
    try {
      if (!_index) {
        const res = await fetch('data/stats/index.json');
        if (!res.ok) return null;
        _index = await res.json();
        if (_index.minSample) MIN_SAMPLE = _index.minSample;
      }

      let best = null, bestD = Infinity;
      for (const r of _index.regions) {
        const d = (r.lat - lat) ** 2 + ((r.lng - lng) * 0.8) ** 2;   // 위도 보정 대략
        if (d < bestD) { bestD = d; best = r; }
      }
      if (!best) return null;

      const res = await fetch(`data/stats/regions/${best.region}.json`);
      if (!res.ok) return null;
      const data = await res.json();

      return {
        data: data,
        /* 선택 지점이 조사지(복합위험지역) 안인지 — 리포트 머리말에 씁니다 */
        inside: pointInGeometry(lat, lng, data.surveyArea && data.surveyArea.geometry),
      };
    } catch (e) {
      return null;   // 통계가 없어도 리포트의 나머지는 그대로 돌아갑니다
    }
  }

  /** 점이 조사지 폴리곤 안에 있는가 (링이 여러 개면 교차 홀짝으로 판정) */
  function pointInGeometry(lat, lng, geom) {
    if (!geom || !geom.coordinates) return false;
    let crossings = 0;
    for (const ring of geom.coordinates) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) crossings++;
      }
    }
    return crossings % 2 === 1;
  }

  /* ── 문장 만들기 도우미 ───────────────────────────────────────── */

  /* 비율은 늘 소수 한 자리로 적습니다. 57 과 57.0 이 섞이면
     같은 표에서 자릿수가 달라 보여 행정 문서로 어색합니다. */
  const pctText = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`);

  /* 앞말에 받침이 있으면 '이', 없으면 '가'.
     "자살시도이 93.9%" 같은 문장이 나오지 않게 합니다. */
  function josa(word, withBatchim, withoutBatchim) {
    const last = (word || '').trim().slice(-1);
    const code = last.charCodeAt(0);
    if (!(code >= 0xac00 && code <= 0xd7a3)) return withoutBatchim;   // 한글이 아니면 기본형
    return (code - 0xac00) % 28 !== 0 ? withBatchim : withoutBatchim;
  }

  /** 1.27 → "1.3배 높게", 0.71 → "0.7배 낮게", 1.0 근처 → "비슷한 수준으로"
      소수 한 자리는 사전진단서 표기("2.3배↑", "약 1.2배")에 맞춘 것입니다. */
  function ratioText(ratio) {
    if (ratio === null || ratio === undefined) return null;
    if (ratio >= 1.1) return `${ratio.toFixed(1)}배 높게`;
    if (ratio <= 0.9) return `${ratio.toFixed(1)}배 낮게`;
    return '비슷한 수준으로';
  }

  /** "상업시설 46.7%, 교통지역 30.0%" — 상위 몇 개를 이어 붙입니다 */
  function topText(list, n) {
    return (list || []).slice(0, n || 2)
      .filter((x) => x[1] !== null)
      .map((x) => `${x[0]} ${pctText(x[1])}`)
      .join(', ');
  }

  /** 상위 2개의 합 — "두 유형이 전체의 약 76.7%를 차지" 문장용 */
  function topSum(list, n) {
    const use = (list || []).slice(0, n || 2).filter((x) => x[1] !== null);
    if (use.length < 2) return null;
    return Number(use.reduce((s, x) => s + x[1], 0).toFixed(1));
  }

  const hourText = (peak) => (peak ? `${peak.from}~${peak.to}시` : null);

  /** 표본이 적을 때 붙일 꼬리말. 충분하면 빈 문자열.
      조사지 밖 지점은 지자체 전체 값을 쓰므로 이 경고가 필요 없습니다. */
  function sampleNote(cat, opts) {
    if (opts && opts.inside === false) return '';
    if (!cat || !cat.sample || cat.sample.reliable) return '';
    return ` (표본 ${cat.sample.n}건 — 참고값)`;
  }

  /* ── ① 인적 특성 ─────────────────────────────────────────────────
     연령과 성별을 조사지 안 / 지자체 전체로 비교합니다.
     비교 대상이 없으면(조사지 밖 지점) 지자체 전체 값만 씁니다. */
  function narrateHuman(cat, opts) {
    if (!cat || !cat.inside || !cat.region) return null;
    const useInside = !opts || opts.inside !== false;
    const A = useInside ? cat.inside : cat.region;   // 서술 대상
    const B = cat.region;                            // 비교 기준
    const cmp = cat.compare || { ratio: {}, diff: {} };
    const where = useInside ? '조사지 내' : '지자체 전체';

    /* 어느 연령대를 앞세울지는 "전체와 가장 크게 벌어진 쪽"으로 정합니다.
       고령자가 특징인 곳도, 청년층이 특징인 곳도 같은 규칙으로 잡힙니다. */
    const bands = [
      { key: 'a65', label: '65세 이상 고령자', v: A.age.a65, base: B.age.a65, ratio: cmp.ratio.a65, diff: cmp.diff.a65 },
      { key: 'a2049', label: '20~49세', v: A.age.a2049, base: B.age.a2049, ratio: cmp.ratio.a2049, diff: cmp.diff.a2049 },
      { key: 'u20', label: '20세 이하', v: A.age.u20, base: B.age.u20, ratio: cmp.ratio.u20, diff: cmp.diff.u20 },
    ].filter((b) => b.v !== null);
    if (!bands.length) return null;

    const lead = useInside
      ? bands.slice().sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0))[0]
      : bands.slice().sort((a, b) => b.v - a.v)[0];

    const parts = [];
    if (useInside && lead.ratio !== null && lead.base !== null) {
      parts.push(`${where}에서 ${lead.label} 비율이 <b>${pctText(lead.v)}</b>로 나타나, ` +
                 `지역 전체 ${pctText(lead.base)} 대비 <b>${ratioText(lead.ratio)}</b> 나타남`);
    } else {
      parts.push(`${where} ${lead.label} 비율이 <b>${pctText(lead.v)}</b>로 가장 높게 나타남`);
    }

    /* 성별은 한쪽으로 눈에 띄게 기울 때만 적습니다 — 55:45 정도는 특징이 아닙니다 */
    if (A.sex.male !== null) {
      const male = A.sex.male;
      if (male >= 60 || male <= 40) {
        const who = male >= 60 ? '남성' : '여성';
        const v = male >= 60 ? male : Number((100 - male).toFixed(1));
        const baseV = B.sex.male === null ? null : (male >= 60 ? B.sex.male : Number((100 - B.sex.male).toFixed(1)));
        if (baseV !== null && useInside) {
          /* 0.5%p 안쪽이면 조사지의 특징이 아니므로 아예 적지 않습니다.
             "69.1%로 지역 전체 69.1%보다 높음" 같은 빈 문장을 막습니다. */
          const gap = v - baseV;
          if (Math.abs(gap) >= 0.5) {
            parts.push(`${who} 비율도 ${where} <b>${pctText(v)}</b>로 ` +
                       `지역 전체 ${pctText(baseV)}보다 ${gap > 0 ? '높음' : '낮음'}`);
          }
        } else {
          parts.push(`${who} 비율이 <b>${pctText(v)}</b>로 두드러짐`);
        }
      }
    }

    return {
      text: parts.join('. ') + sampleNote(cat, opts),
      lead: lead,
      n: A.n,
    };
  }

  /* ── ② 사고유형 ─────────────────────────────────────────────────
     "어디서 · 어떤 유형으로 · 몇 시에" 를 한 문장으로 묶습니다. */
  function narrateType(cat, opts) {
    if (!cat || !cat.inside || !cat.region) return null;
    const useInside = !opts || opts.inside !== false;
    const A = useInside ? cat.inside : cat.region;
    const B = cat.region;
    const where = useInside ? '조사지 내' : '지자체 전체';

    const places = A.placeGrouped ? A.placeGrouped.top : [];
    const parts = [];

    if (places.length) {
      const sum2 = topSum(places, 2);
      parts.push(`${where} 발생 장소는 ${topText(places, 2)}` +
                 (sum2 !== null ? `로 두 유형이 전체의 약 <b>${pctText(sum2)}</b>를 차지` : ''));
    }

    /* 사고유형(type)은 분야마다 성격이 다릅니다.
       교통사고=자동차/오토바이, 감염병=전신증상/호흡기 … 그대로 씁니다. */
    if (A.type && A.type.top.length) {
      const t = A.type.top[0];
      const ga = josa(t[0], '이', '가');
      const baseT = (B.type.top.find((x) => x[0] === t[0]) || [])[1];
      parts.push(useInside && baseT !== undefined && baseT !== null
        ? `사고 유형은 ${t[0]}${ga} <b>${pctText(t[1])}</b>로 가장 많으며 지역 전체 ${pctText(baseT)}와 비교됨`
        : `사고 유형은 ${t[0]}${ga} <b>${pctText(t[1])}</b>로 가장 많음`);
    }

    if (A.hour && A.hour.peak && A.hour.peak.share !== null) {
      parts.push(`시간대는 <b>${hourText(A.hour.peak)}</b>에 <b>${pctText(A.hour.peak.share)}</b>가 몰림`);
    }

    if (!parts.length) return null;
    return { text: parts.join('. ') + sampleNote(cat, opts), n: A.n };
  }

  /* ── ⑤ 현장확인 사항 (통계에서 나오는 부분) ──────────────────────
     사진으로는 알 수 없지만 통계가 가리키는 확인 항목입니다.
     사진 판독에서 나오는 항목은 report.html 이 따로 붙입니다. */
  const HOUR_CHECKS = [
    { from: 22, to: 6, text: '야간 시간대 집중 — 가로등 점등 상태와 실제 조도(럭스), 소등 구간 확인' },
    { from: 6, to: 10, text: '출근 시간대 집중 — 통학·통근 동선의 보행 폭과 차량 상충 지점 확인' },
    { from: 10, to: 16, text: '주간 시간대 집중 — 보행 동선의 단차·미끄럼, 그늘·휴식 공간 확인' },
    { from: 16, to: 22, text: '퇴근·저녁 시간대 집중 — 상가 주변 적치물, 주정차, 조도 확인' },
  ];

  const PLACE_CHECKS = {
    '교통지역': '도로·정류장 주변 — 보도 폭, 횡단 지점 시야, 불법 주정차 상태 확인',
    '상업시설': '상가 일대 — 간판·적치물로 인한 보행 방해, 상가 후면부 관리 상태 확인',
    '집': '주거지 내부 — 계단·문턱 단차, 손잡이 유무, 공동현관 조도 확인',
    '집단거주시설': '집단거주시설 — 공용부 피난 동선, 소화설비 접근성 확인',
    '의료관련시설': '의료·돌봄시설 주변 — 출입 동선, 환기 상태, 대기 공간 밀집도 확인',
    '공장/산업/건설시설': '작업장 주변 — 추락·끼임 위험 지점, 안전난간·개구부 덮개 확인',
    '학교/교육시설': '학교 주변 — 어린이보호구역 표시, 통학로 분리, 과속 저감시설 확인',
    '오락/문화시설': '유흥·문화시설 일대 — 야간 조도, 자연감시, CCTV 사각지대 확인',
    '바다/강/산/논밭': '수변·산지·경작지 — 추락방지 난간, 접근 통제, 구조 접근로 확인',
  };

  const AGE_CHECKS = {
    a65: '고령자 비중이 높음 — 보행 손잡이, 경사로 기울기, 휴식 벤치, 야간 조도 확인',
    u20: '아동·청소년 비중이 높음 — 통학 동선, 보호구역 표시, 놀이·체육시설 상태 확인',
    a2049: '활동인구 비중이 높음 — 야간 통행 동선, 상가 주변 상충 지점, 이륜차 통행 확인',
  };

  /** 한 분야에 대해 통계가 가리키는 현장확인 항목 목록 */
  function fieldChecks(cat, opts) {
    if (!cat) return [];
    const A = (!opts || opts.inside !== false) ? cat.inside : cat.region;
    if (!A) return [];
    const out = [];

    const human = narrateHuman(cat, opts);
    if (human && AGE_CHECKS[human.lead.key]) out.push(AGE_CHECKS[human.lead.key]);

    for (const p of (A.placeGrouped ? A.placeGrouped.top : []).slice(0, 2)) {
      if (PLACE_CHECKS[p[0]] && !out.includes(PLACE_CHECKS[p[0]])) out.push(PLACE_CHECKS[p[0]]);
    }

    if (A.hour && A.hour.peak) {
      const h = A.hour.peak.from;
      const hit = HOUR_CHECKS.find((c) => (c.from <= c.to ? (h >= c.from && h < c.to) : (h >= c.from || h < c.to)));
      if (hit) out.push(hit.text);
    }

    return out;
  }

  /* ── 지자체 머리말 ──────────────────────────────────────────────── */

  /** "부천시 조사지는 254ha · 7개 분야 중첩 · 중점분야 범죄·감염병·자살" */
  function regionSummary(data) {
    if (!data) return null;
    const a = data.surveyArea;
    const focus = (data.focusTypes || []).map((t) => t.label).join(' · ');
    return {
      label: data.label,
      short: data.shortLabel,
      focus: focus,
      areaHa: a ? a.areaHa : null,
      overlapN: a ? a.overlapN : null,
      meanRisk: a ? a.meanRisk : null,
      shareText: data.totals
        ? `조사지 내 ${data.totals.inside.toLocaleString()}건 / 지자체 전체 ${data.totals.region.toLocaleString()}건 (${data.totals.share}%)`
        : null,
    };
  }

  /** 중점 3분야를 [{key, label, cat}] 로. 통계가 없는 분야는 걸러 냅니다 */
  function focusCategories(data) {
    if (!data || !data.focusTypes) return [];
    return data.focusTypes
      .filter((t) => t.key && data.categories[t.key])
      .map((t) => ({ key: t.key, label: t.label, cat: data.categories[t.key] }));
  }

  /** 이 지점이 속한 읍면동 통계 (동 이름을 아는 경우에만) */
  function dongSummary(data, dongName) {
    if (!data || !data.byDong || !dongName) return null;
    return data.byDong[dongName] || null;
  }

  return {
    load,
    narrateHuman, narrateType, fieldChecks,
    regionSummary, focusCategories, dongSummary,
    pointInGeometry, ratioText, topText, sampleNote, josa, pctText,
    get minSample() { return MIN_SAMPLE; },
    /* 화면·문서가 분야를 늘 같은 순서로 보여 주도록 기준 순서를 넘겨줍니다 */
    get categoryOrder() {
      return (_index && _index.categoryOrder)
        || ['traffic', 'fire', 'crime', 'life', 'industrial', 'suicide', 'infection'];
    },
  };
})();
