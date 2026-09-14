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

  /** 지표 칸이 비어 있을 때의 이유 (진단서 표의 칸에 적음) */
  function emptyReason(data, key) {
    if (!data) return '자료 없음';
    /* 원값은 있는데 그런 동이 너무 적어 순위를 못 낸 경우 (PERCENTILE_MIN_DONGS) */
    const cmp = data.comparison && data.comparison.indicators && data.comparison.indicators[key];
    if (cmp && cmp.raw > 0 && !cmp.scored) return '비교 동 부족';
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

  /** 지도 말풍선·표 각주용 근거 몇 줄 */
  function evidence(dong, data) {
    const lines = [];
    const cats = (data.heaCategories || []);
    for (const c of cats) {
      const b = dong.byCat && dong.byCat[c.key];
      if (!b) continue;
      const bits = [];
      const g = b.H && b.H.group;
      if (g && g.label) bits.push(`H ${g.label} ${g.ratio}배`);
      else if (g && g.status) bits.push(`H ${g.status}`);
      const a = b.A || {};
      if (a.repeat && a.repeat.spots !== undefined) bits.push(`반복 ${a.repeat.spots}곳(${a.repeat.threshold}회↑)`);
      if (a.night && a.night.share !== undefined && a.night.share !== null) bits.push(`야간 ${a.night.share}%`);
      if (a.place && a.place.name) bits.push(`${a.place.name} ${a.place.share}%`);
      if (b.E && b.E.parts && b.E.parts.length) {
        const top = b.E.parts.slice().sort((x, y) => Math.abs(y.contrib) - Math.abs(x.contrib))[0];
        bits.push(`E 주요 ${top.name}(${top.contrib > 0 ? '+' : ''}${top.contrib})`);
      }
      lines.push(`${c.label} ${b.n}건 — ${bits.join(' · ')}`);
    }
    return lines;
  }

  /** 화면·문서 공통 머리말 — 기준이 임시라는 사실과 자료 상태 */
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
    if (data.population && data.population.status !== 'ok') out.push(data.population.note);
    const e = eStatusText(data);
    if (e) out.push(e);
    const cov = eCoverageText(data);
    if (cov && cov.used) out.push(cov.used + (cov.others ? ` / ${cov.others}` : ''));
    if (cov && cov.empty) out.push(cov.empty);
    return out;
  }

  return { load, AXES, INDICATORS, band, eStatusText, eCoverageText, emptyReason, evidence, caveats };
})();

if (typeof window !== 'undefined') window.AuriDongHea = AuriDongHea;
