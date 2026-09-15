/* ════════════════════════════════════════════════════════════════════
   동별 HEA 취약도 — 불러오기 · 표기 문구 (지도·진단서 공용, 2026-09-15)

   값은 tools/build-dong-hea.mjs 가 미리 계산해 data/dong/<지역>.json 에 둡니다.
   이 파일은 **읽고 문구로 바꾸기만** 합니다.

   ★ 점수는 **그 지자체 안의 상대 순위(백분위 0~100)** 입니다.
     "위험/안전" 같은 절대 판정이 아니므로 **상위 · 중위 · 하위**로 부릅니다.
     다른 지자체 점수와 비교할 수 없습니다.

   ★ H·A 는 임시 기준입니다(담당자 결정 2026-09-15). 화면·문서에 늘 적습니다.

   ★ 비어 있는 칸에는 이유를 적습니다 — "자료 없음 (회귀분석 대상 아님)",
     "미수신 변수", "표본 부족" 등. 빈칸을 숫자로 채우지 않습니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriDongHea = (function () {
  const _cache = {};

  async function load(region) {
    if (!region) return null;
    if (_cache[region] !== undefined) return _cache[region];
    try {
      const res = await fetch(`data/dong/${region}.json`, { cache: 'no-store' });
      _cache[region] = res.ok ? await res.json() : null;
    } catch (e) {
      _cache[region] = null;
    }
    return _cache[region];
  }

  const AXES = [
    { key: 'H', label: 'H 피해대상', short: 'H', desc: '누가 다치는가 — 연령×성별 편중' },
    { key: 'E', label: 'E 환경', short: 'E', desc: '어떤 공간인가 — 회귀분석 계수 × 시설 밀도·거리' },
    { key: 'A', label: 'A 행위·관리', short: 'A', desc: '어떻게 되풀이되나 — 반복 발생·야간·장소 편중' },
    { key: 'total', label: '종합', short: '종합', desc: 'H·E·A 를 지자체 안 백분위로 맞춘 뒤 평균' },
  ];

  /* 사전진단서 HEA 지표 표의 행 — 담당자 요청 구성 (H 연령·성별 / E 노후도·도로·시설밀도 / A 반복·야간·장소) */
  const INDICATORS = [
    { axis: 'H', key: 'hAge', label: '연령' },
    { axis: 'H', key: 'hSex', label: '성별' },
    { axis: 'E', key: 'eOld', label: '노후도' },
    { axis: 'E', key: 'eRoad', label: '도로' },
    { axis: 'E', key: 'eFacility', label: '시설밀도' },
    { axis: 'A', key: 'aRepeat', label: '반복발생' },
    { axis: 'A', key: 'aNight', label: '야간비중' },
    { axis: 'A', key: 'aPlace', label: '장소편중' },
  ];

  /** 점수 → 상위·중위·하위. 경계는 기존 3구간(0~33·34~66·67~100)과 같게 둡니다 */
  function band(score) {
    if (score === null || score === undefined) return { key: 'none', label: '—', color: '#999999' };
    if (score >= 67) return { key: 'high', label: '상위', color: '#D83D64' };
    if (score >= 34) return { key: 'mid', label: '중위', color: '#000000' };
    return { key: 'low', label: '하위', color: '#666666' };
  }

  const E_STATUS = {
    'no-regression': 'E 자료 없음 — 강원대 물적환경 회귀분석 대상 지자체(7곳)가 아닙니다',
    'no-boundary': 'E 계산 불가 — 동 경계 자료를 찾지 못했습니다',
    'no-tif': 'E 자료 없음 — 유의한 환경 변수 중 받은 TIF 가 없습니다(미수신 변수)',
    ok: null,
  };

  function eStatusText(data) {
    return data ? E_STATUS[data.eStatus] || null : null;
  }

  /** E 반영 변수 수 — 중점 분야(점수에 쓰는 분야)와 그 밖 분야를 나눠 적습니다.
   *  "유의 변수 중 TIF 가 있는 것 / 유의 변수" — 0 이면 그 분야 E 는 비어 있습니다.
   *  (담당자 요청: 어떤 분야의 E 가 비어 있는지 화면과 문서에 표기) */
  const CAT_ORDER = ['traffic', 'fire', 'crime', 'life', 'industrial', 'suicide', 'infection'];
  const CAT_LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', industrial: '산업재해', suicide: '자살', infection: '감염병' };
  function eCoverageText(data) {
    if (!data || data.eStatus === 'no-regression') return null;
    const cov = data.eCoverage || {};
    const focus = (data.heaCategories || []).map((c) => c.key);
    const fmt = (cat) => {
      const c = cov[cat];
      if (!c || c.total === undefined) return null;
      if (!c.total) return `${CAT_LABEL[cat]} 유의 변수 없음`;
      return `${CAT_LABEL[cat]} ${c.have}/${c.total}${c.have === 0 ? '(비어 있음)' : ''}`;
    };
    const used = focus.map(fmt).filter(Boolean);
    const others = CAT_ORDER.filter((k) => !focus.includes(k)).map(fmt).filter(Boolean);
    const empty = CAT_ORDER.filter((k) => cov[k] && cov[k].total > 0 && cov[k].have === 0).map((k) => CAT_LABEL[k]);
    return {
      used: used.length ? `E 반영 변수(유의 변수 중 TIF 있는 것) — 중점 분야: ${used.join(' · ')}` : null,
      others: others.length ? `그 밖 분야: ${others.join(' · ')}` : null,
      empty: empty.length ? `E 가 비어 있는 분야 — ${empty.join(' · ')} : 유의 변수의 TIF 미수신(노후건축물·도로폭·경사 등 32종)` : null,
    };
  }

  const MIN_N = (data) => (data && data.thresholds && data.thresholds.H_MIN_DONG_N) || 10;
  const MIN_DONGS = (data) => (data && data.comparison && data.comparison.minDongs) || 3;

  /** H 를 무엇으로 쟀는가 — 'population'(인구 대비 출동률) · 'composition'(출동 구성비) */
  function hBasis(data) {
    return data && data.population && data.population.hBasis === 'population' ? 'population' : 'composition';
  }

  /** 중점 분야에서 이 동의 H 가 "인구 매칭 불가"인가 */
  function noPopMatch(dong, data) {
    return !!(dong && dong.byCat && (data.heaCategories || []).some((c) => {
      const b = dong.byCat[c.key];
      return b && b.H && b.H.group && b.H.group.status === '인구 매칭 불가';
    }));
  }

  /** 지표 칸이 비어 있을 때의 이유 (진단서 표의 칸·지도 말풍선에 적음). dong 을 주면 그 동의 사정까지 봅니다 */
  function emptyReason(data, key, dong) {
    if (!data) return '자료 없음';
    /* 원값은 있는데 그런 동이 너무 적어 순위를 못 낸 경우 (PERCENTILE_MIN_DONGS) */
    const cmp = data.comparison && data.comparison.indicators && data.comparison.indicators[key];
    if (cmp && cmp.raw > 0 && !cmp.scored) return '비교 동 부족';
    if (key.startsWith('h') && noPopMatch(dong, data)) return '인구 매칭 불가';
    if (key.startsWith('e')) {
      if (data.eStatus === 'no-regression') return '자료 없음';
      if (data.eStatus === 'no-boundary') return '경계 없음';
      /* 그 묶음(노후도·도로)에 유의 변수가 있는데 TIF 가 없는가, 아예 변수가 없는가 */
      const group = { eOld: 'old', eRoad: 'road', eFacility: 'facility' }[key];
      const cats = (data.heaCategories || []).map((c) => c.key);
      const vars = cats.flatMap((c) => ((data.eCoverage[c] || {}).vars || []).filter((v) => v.group === group));
      if (vars.length && !vars.some((v) => v.tif)) return '미수신';
      if (!vars.length) return '해당 없음';
      return '자료 없음';
    }
    return '표본 부족';
  }

  /** 축 점수(H·E·A·종합)가 이 동에서 비어 있는 이유 — 지도 말풍선용 */
  function axisReason(dong, data, axis) {
    if (!dong || !data) return '자료 없음';
    if (axis === 'total') return `축 ${(data.thresholds && data.thresholds.TOTAL_MIN_AXES) || 2}개 미만`;
    if (axis === 'E') {
      if (data.eStatus !== 'ok') return data.eStatus === 'no-regression' ? '자료 없음(회귀분석 대상 아님)' : '자료 없음';
      return '해당 변수 없음';
    }
    const cmpAxis = data.comparison && data.comparison.axes && data.comparison.axes[axis];
    const inds = INDICATORS.filter((x) => x.axis === axis).map((x) => data.comparison && data.comparison.indicators[x.key]).filter(Boolean);
    if (inds.some((c) => c.raw > 0) && !inds.some((c) => c.scored)) return `비교 동 부족(값 있는 동 ${MIN_DONGS(data)}곳 미만)`;
    if (axis === 'H' && noPopMatch(dong, data)) return '인구 매칭 불가(행정동 이름이 이 법정동과 달라 인구를 붙이지 못함)';
    const maxN = Math.max(0, ...(data.heaCategories || []).map((c) => (dong.byCat && dong.byCat[c.key] ? dong.byCat[c.key].n : 0)));
    if (maxN < MIN_N(data)) return `표본 부족(중점 분야 출동 ${MIN_N(data)}건 미만)`;
    return cmpAxis && !cmpAxis.scored ? '비교 동 부족' : '편중 집단 없음';
  }

  /** 지금 보는 점수(H·E·A·종합)를 낸 동이 몇 곳인지 + 하나도 없으면 왜 없는지.
   *  ★ 빈 지도·빈 표가 오류로 보이지 않게 이유를 문장으로 돌려줍니다 (2026-09-15 담당자 요청) */
  function scoreSummary(data, axis) {
    if (!data) return null;
    const total = data.dongs.length;
    const scored = data.dongs.filter((d) => d.scores[axis] !== null && d.scores[axis] !== undefined).length;
    const name = axis === 'total' ? '종합' : axis;
    if (scored) return { scored, total, empty: false, text: `${name} 점수를 낸 읍면동 ${scored}/${total}곳 — 나머지는 동을 누르면 비어 있는 이유가 나옵니다` };
    let why;
    if (axis === 'E' && data.eStatus !== 'ok') why = eStatusText(data) || 'E 자료 없음';
    else {
      const inds = Object.values((data.comparison && data.comparison.indicators) || {});
      why = inds.some((c) => c.raw > 0) && !inds.some((c) => c.scored)
        ? `동별 중점 분야 출동이 ${MIN_N(data)}건 이상인 동이 ${MIN_DONGS(data)}곳 미만이라 순위를 매길 수 없어 산출하지 않았습니다`
        : `동별 중점 분야 출동이 ${MIN_N(data)}건 미만이라 산출하지 않았습니다`;
    }
    return { scored: 0, total, empty: true,
      text: `${data.shortLabel || data.label}에서는 ${name} 점수를 낸 읍면동이 없습니다 — ${why}. 기준에 못 미쳐 비워 둔 것이며 오류가 아닙니다.` };
  }

  /** H 근거 한 줄 — 무엇의 배수인지 반드시 드러나게 씁니다.
   *  인구 기준: "거주 인구 대비 출동률이 지역의 N배" / 구성비 기준: "출동 환자 중 비중이 지역 출동의 N배(인구 대비 아님)" */
  function hText(g, comp) {
    if (!g || g.status) return null;              // 산출 못 한 경우는 웹에 적지 않음 (2026-09-15 보고용)
    /* 2026-09-15 초과 건수 방식 — "나머지 지역 기준 기대 N건보다 M건 많은 K건" */
    if (g.excess !== undefined && g.expected !== undefined) {
      return g.basis === 'population'
        ? `H ${g.label} ${g.n}건 — 거주 인구·나머지 지역 발생률 기준 기대 ${g.expected}건보다 ${g.excess}건 많음 (인구 1천 명당 연 ${g.rate}건)`
        : `H ${g.label} ${g.n}건 — 나머지 지역 구성 기준 기대 ${g.expected}건보다 ${g.excess}건 많음 (출동 환자 중 ${g.incShare}%)`;
    }
    if (g.basis === 'population') {
      return `H ${g.label} — 거주 인구 대비 출동률이 지역 평균의 ${g.ratio}배 (인구 1천 명당 연 ${g.rate}건, 지역 ${g.regionRate}건)`
        + (comp ? ` · 참고: 출동 환자 중 ${comp.label} ${comp.incShare}%(지역 ${comp.regionIncShare}%)` : '');
    }
    return `H ${g.label} — 출동 환자 중 비중 ${g.incShare}%로 지역 출동 환자 중 비중(${g.regionIncShare}%)의 ${g.ratio}배 (출동 환자 기준)`;
  }

  /** 지도 말풍선·표 각주용 근거 몇 줄 */
  function evidence(dong, data) {
    const lines = [];
    const cats = (data.heaCategories || []);
    for (const c of cats) {
      const b = dong.byCat && dong.byCat[c.key];
      if (!b) continue;
      const bits = [];
      const g = b.H && b.H.group;
      const ht = hText(g, b.H && b.H.groupComp);
      if (ht) bits.push(ht);
      const a = b.A || {};
      if (a.repeat && a.repeat.spots !== undefined) bits.push(`반복 ${a.repeat.spots}곳(${a.repeat.threshold}회↑)`);
      if (a.night && a.night.share !== undefined && a.night.share !== null) bits.push(`야간 ${a.night.share}%`);
      if (a.place && a.place.name) bits.push(`${a.place.name} ${a.place.share}%`);
      if (b.E && b.E.parts && b.E.parts.length) {
        const top = b.E.parts.slice().sort((x, y) => Math.abs(y.contrib) - Math.abs(x.contrib))[0];
        bits.push(`E 주요 ${top.name}(${top.contrib > 0 ? '+' : ''}${top.contrib})`);
      }
      if (bits.length) lines.push(`${c.label} ${b.n}건 — ${bits.join(' · ')}`);
    }
    return lines;
  }

  /* ── 웹 표시용 산출 근거 (2026-09-15 담당자 지시 — 중간보고용) ─────────────
     웹에는 **무엇으로 계산했는가만** 적고, 비어 있는 자료·못 낸 이유는 적지 않습니다.
     빠진 자료 목록은 담당자에게 따로 전달했습니다(CLAUDE.md "동별 HEA").
     아래 caveats()·emptyReason()·axisReason()·scoreSummary() 는 나중에 다시 켤 수 있게 남겨 둡니다. */
  const DISCLAIMER = '* 해당 기능은 구현중이므로 정확하지 않을 수 있음';

  /** 산출 근거 몇 줄 + 마지막 줄 구현 중 문구 */
  function basisNotes(data) {
    if (!data) return [];
    const cats = data.heaCategories || [];
    const n = (data.dongs || []).reduce((s, d) => s + cats.reduce((t, c) => t + (d.byCat && d.byCat[c.key] ? d.byCat[c.key].n : 0), 0), 0);
    const out = [
      `출동자료: 119 구급출동 2023~2025 · 중점 분야 ${cats.map((c) => c.label).join('·')} ${n.toLocaleString()}건 · 강원대 사고유형 분류`,
      `공간 단위: 법정 읍면동 (국토교통부 행정구역 경계)`,
      hBasis(data) === 'population'
        ? 'H(피해대상): 연령×성별 집단별 초과 발생 건수(주민등록 인구 × 나머지 지역 발생률 기준)'
        : 'H(피해대상): 연령×성별 집단별 초과 발생 건수(나머지 지역 출동 구성 기준)',
    ];
    if (data.eStatus === 'ok') {
      const vars = new Set();
      for (const c of cats) for (const v of ((data.eCoverage[c.key] || {}).vars || [])) if (v.tif) vars.add(v.v);
      if (vars.size) out.push(`E(환경): 강원대 물적환경 회귀분석 유의 변수 ${vars.size}종의 계수 × 시설 밀도·거리`);
    }
    out.push('A(행위·관리): 반복 발생 지점 · 야간(22~06시) 비중 · 발생 장소 편중');
    out.push(`점수: ${data.shortLabel || data.label} 안의 상대 순위(0~100)`);
    out.push(DISCLAIMER);
    return out;
  }

  /** 지도 채움 — 축마다 색 하나, 진하기(투명도)로 점수를 보입니다. 색은 HEA 색 구분(theme.css)과 같게 */
  const FILL_COLOR = { H: '#D83D64', E: '#333333', A: '#2793C9', total: '#000000' };
  const FILL_MIN = 0.06, FILL_MAX = 0.62;
  function fillOf(mode, score) {
    if (score === null || score === undefined) return { color: FILL_COLOR[mode] || '#000000', opacity: 0 };
    return { color: FILL_COLOR[mode] || '#000000', opacity: FILL_MIN + (FILL_MAX - FILL_MIN) * Math.max(0, Math.min(100, score)) / 100 };
  }

  /** 이 지자체에 점수가 하나라도 있는가 — 없으면 화면에서 기능 자체를 감춥니다 */
  function hasAnyScore(data, axis) {
    return !!(data && data.dongs && data.dongs.some((d) => (axis ? [axis] : ['H', 'E', 'A', 'total']).some((k) => d.scores[k] !== null && d.scores[k] !== undefined)));
  }

  /* ── 읍면동별 HEA 취약도 지표 표 (2026-09-15) ─────────────────────────────
     처음엔 사전진단서 3.3 절이었으나 담당자 지시로 **위치 선택 화면(index.html)** 으로 옮겼습니다
     (H·E·A·종합 중 하나를 켜면 지도·스트리트뷰 아래에 표시). 사전진단서에서는 뺐습니다.
     행 = HEA 지표 8개(값 없는 칸은 "-"), 열 = 종합 점수가 있는 읍면동(조사지와 겹치는 동 먼저, 점수 높은 순).
     각주는 산출 방법 두 줄 + 개발 중 문구 한 줄 — 비어 있는 이유·한계 문구는 적지 않습니다(담당자 지시). */
  const TABLE_MAX_DONGS = 12;        // 한 번에 싣는 동 수 — 나머지는 지도에서
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** 표 + 각주 HTML. 실을 동이 없으면 ''. opts.mode = 지금 켠 축(해당 행을 강조), opts.perTable = 표 하나의 열 수 */
  function renderTable(data, opts) {
    opts = opts || {};
    if (!data) return '';
    const perTable = opts.perTable || TABLE_MAX_DONGS;
    const byScore = (a, b) => b.scores.total - a.scores.total || b.n - a.n;
    const scored = data.dongs.filter((d) => d.scores.total !== null && d.scores.total !== undefined);
    let dongs = scored.filter((d) => d.inside > 0).sort(byScore);
    const insideCount = dongs.length;
    dongs = dongs.concat(scored.filter((d) => !(d.inside > 0)).sort(byScore)).slice(0, TABLE_MAX_DONGS);
    if (!dongs.length) return '';

    const cell = (score) => {
      if (score === null || score === undefined) return '<td class="num hea-na">-</td>';
      const b = band(score);
      return `<td class="num" style="color:${b.color};${b.key === 'high' ? 'font-weight:700' : ''}">${score}</td>`;
    };
    const AXIS_LABEL = { H: 'H<br><span>피해대상</span>', E: 'E<br><span>환경</span>', A: 'A<br><span>행위·관리</span>' };
    /* 표를 나눌 때는 고르게 — 8곳이면 7+1 이 아니라 4+4 */
    const tableCount = Math.ceil(dongs.length / perTable);
    const per = Math.ceil(dongs.length / tableCount);
    const chunks = [];
    for (let i = 0; i < dongs.length; i += per) chunks.push(dongs.slice(i, i + per));

    const tables = chunks.map((cols) => {
      const rows = ['H', 'E', 'A'].map((axis) => {
        const inds = INDICATORS.filter((x) => x.axis === axis);
        return inds.map((ind, k) => `<tr class="ax-${axis}${k === 0 ? ' grp' : ''}${opts.mode === axis ? ' on' : ''}">
            ${k === 0 ? `<th rowspan="${inds.length}" class="hea-axis">${AXIS_LABEL[axis]}</th>` : ''}
            <th class="hea-ind">${ind.label}</th>
            ${cols.map((d) => cell(d.indicators[ind.key])).join('')}
          </tr>`).join('');
      }).join('');
      const total = `<tr class="hea-total${opts.mode === 'total' ? ' on' : ''}"><th colspan="2">종합</th>
          ${cols.map((d) => cell(d.scores.total)).join('')}</tr>`;
      return `<div class="hea-table-wrap"><table class="hea-table">
        <thead><tr><th colspan="2" class="hea-corner">지표</th>
          ${cols.map((d) => `<th class="num">${esc(d.name)}${d.inside > 0 ? '' : '<span class="hea-out">조사지 밖</span>'}</th>`).join('')}</tr></thead>
        <tbody>${rows}${total}</tbody>
      </table></div>`;
    }).join('');

    const label = data.shortLabel || data.label;
    const hNote = hBasis(data) === 'population'
      ? '연령×성별 집단 중 거주 인구 대비 기대 건수보다 가장 많이 발생한 초과 건수를'
      : '연령×성별 집단 중 나머지 지역 구성 대비 기대 건수보다 가장 많이 발생한 초과 건수를';
    return `
      <p class="hea-lead">조사지와 겹치는 읍면동${insideCount ? ` ${insideCount}곳` : ''}을 중심으로 H(피해대상)·E(환경)·A(행위·관리) 지표를 산출함</p>
      ${tables}
      <p class="hea-foot">* 119 구급출동자료(2023~2025)·강원대 물적환경 분석 결과를 바탕으로 읍면동별 지표를 산출하고, ${esc(label)} 안의 순위(0~100)로 환산함 — 67 이상 상위 · 34~66 중위 · 33 이하 하위<br>
        * H: ${hNote} 동끼리 비교 · E: 회귀분석 계수 × 시설 밀도·거리 · A: 반복 발생 지점 · 야간(22~06시) 비중 · 발생 장소 편중 · 종합: H·E·A 평균<br>
        * HEA 취약도 지표는 현재 개발 중인 모델로 산출한 참고값으로, 정확하지 않을 수 있음</p>`;
  }

  /** 화면·문서 공통 머리말 — 기준이 임시라는 사실과 자료 상태 (지금은 웹에 쓰지 않음) */
  function caveats(data) {
    if (!data) return [];
    const out = [
      `동 단위 ${data.dongUnit} · 점수는 ${data.label} 안의 상대 순위(0~100)이며 다른 지자체와 비교할 수 없습니다`,
      'H(피해대상)·A(행위·관리)는 확정 기준이 없어 임시 기준으로 산출했습니다',
      `분야: 중점 ${(data.heaCategories || []).map((c) => c.label).join('·')}`,
    ];
    const minD = data.comparison && data.comparison.minDongs;
    const inds = data.comparison ? INDICATORS.filter((x) => { const c = data.comparison.indicators[x.key]; return c && c.raw > 0 && !c.scored; }) : [];
    if (inds.length) out.push(`${inds.map((x) => `${x.axis} ${x.label}`).join('·')} 지표는 값이 있는 동이 ${minD}곳 미만이라 순위를 매기지 않았습니다(비교 동 부족)`);
    const pop = data.population || {};
    if (hBasis(data) === 'population' && pop.link) {
      const L = pop.link;
      out.push(`H 는 주민등록 연령별 인구 대비 출동률(행정동 인구를 법정동 이름에 맞춰 합산 · 인구가 붙은 법정동 ${L.dongsWithPop}/${L.dongsTotal}곳, 인구의 ${L.popShare}%)`
        + (L.unmatched && L.unmatched.length ? ` — 이름으로 못 붙인 행정동: ${L.unmatched.map((u) => u.name).join('·')}` : ''));
    } else {
      out.push(`H 는 출동 환자 구성비 비교(거주 인구 대비 아님) — ${pop.compositionReason || pop.note || '연령별 인구 없음'}`);
    }
    const e = eStatusText(data);
    if (e) out.push(e);
    const cov = eCoverageText(data);
    if (cov && cov.used) out.push(cov.used + (cov.others ? ` / ${cov.others}` : ''));
    if (cov && cov.empty) out.push(cov.empty);
    return out;
  }

  return { load, AXES, INDICATORS, band, eStatusText, eCoverageText, emptyReason, axisReason, scoreSummary, hBasis, hText, evidence, caveats,
    basisNotes, fillOf, FILL_COLOR, hasAnyScore, DISCLAIMER, renderTable };
})();

if (typeof window !== 'undefined') window.AuriDongHea = AuriDongHea;
