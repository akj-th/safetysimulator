/* ════════════════════════════════════════════════════════════════════
   지역안전지수 가중치 (2026-10-20 AURI 실무회의 ★)
   자료: data/stats/safety-index.json (tools/build-safety-index.mjs 가 만듦 — 강원대 엑셀의 2025·2024 등급)
   하는 일
     1. 등급표 HTML (첫 화면 상단 "지역안전지수 등급 현황")
     2. 동별 HEA 에 가중치를 곱한 점수 — 분야마다 (H·E·A 평균) × w, 동 종합 = Σ(분야점수×w) ÷ Σw → 지자체 안 백분위
     3. 복합위험지구 후보 — 119 출동 밀도(과거) × 가중 HEA(미래) → 지자체 안 백분위
   가중치 w = 등급 ÷ 5 (5등급 = 1.0). 자살은 모든 지자체 1.0 고정, 산업재해는 지수에 없어 0.6.
   점수는 모두 **지자체 안 상대 순위(0~100)** 입니다. 다른 지자체와 비교할 수 없습니다.
   ════════════════════════════════════════════════════════════════════ */
const AuriSafetyIndex = (function () {
  let _data = null;
  const FIELDS = ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection', 'industrial'];
  const LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
  const DISCLAIMER = '지역안전지수 가중치 반영 결과는 개발 중인 모델로 산출한 참고값으로, 정확하지 않을 수 있음';

  async function load() {
    if (_data) return _data;
    try {
      const res = await fetch('data/stats/safety-index.json', { cache: 'no-store' });
      _data = res.ok ? await res.json() : null;
    } catch (e) { _data = null; }
    return _data;
  }
  function forRegion(slug) { return (_data && _data.regions && _data.regions[slug]) || null; }
  function years() { return (_data && _data.years) || ['2025', '2024']; }

  /* 등급 → 글자색. 4·5등급(하위)만 메인 컬러, 나머지는 무채색 */
  function gradeColor(g) { return g >= 4 ? '#D83D64' : g <= 2 ? '#999999' : '#333333'; }

  /** 상단 등급 현황표 — 행: 연도, 열: 분야. 하위 등급(4·5)은 색, 지수 기준 중점 3분야에 ★.
   *  2023년은 자료를 받지 못해 열이 없습니다(회의 요청은 3개년). 받으면 build-safety-index.mjs 에 열만 더하면 됩니다. */
  function renderTable(si, opts) {
    opts = opts || {};
    if (!si) return '';
    const ys = years();
    const focus = new Set(si.focusByIndex || []);
    const cols = FIELDS.filter((f) => f !== 'industrial');
    const head = `<tr><th>연도</th>${cols.map((f) => `<th${focus.has(f) ? ' class="focus"' : ''}>${LABEL[f]}${focus.has(f) ? ' <b>★</b>' : ''}</th>`).join('')}</tr>`;
    const rows = ys.map((y) => `<tr><th>${y}</th>${cols.map((f) => {
      const g = si.grades && si.grades[y] ? si.grades[y][f] : null;
      return `<td${focus.has(f) ? ' class="focus"' : ''}><b style="color:${gradeColor(g)}">${g == null ? '-' : g + '등급'}</b></td>`;
    }).join('')}</tr>`).join('');
    const wrow = `<tr class="w"><th>가중치</th>${cols.map((f) => `<td${focus.has(f) ? ' class="focus"' : ''}>${si.weights[f].toFixed(1)}</td>`).join('')}</tr>`;
    const same = si.matchesKangwon;
    const foot = opts.foot === false ? '' : `<p class="si-foot">
      ★ 지수 기준 하위 3분야 — <b>${si.focusByIndex.map((f) => LABEL[f]).join(' · ')}</b>
      (자살 고정 + ${ys[0]} 등급 하위 2개, 동률이면 ${ys[1]})
      &nbsp;·&nbsp; 강원대 공간분석 확정 3분야 — ${(si.kangwonFocus || []).map((f) => LABEL[f]).join(' · ') || '-'}
      <b style="color:${same ? '#333' : '#D83D64'}">${same ? '(일치)' : '(불일치)'}</b><br>
      가중치 = 등급 ÷ 5 (5등급 = 1.0). 자살은 전 지자체 1.0 고정, 산업재해는 지수에 없어 ${si.weights.industrial}. 출처: 행정안전부 지역안전지수(강원대 정리본)</p>`;
    return `<table class="si-table"><thead>${head}</thead><tbody>${rows}${wrow}</tbody></table>${foot}`;
  }

  /* ── 동별 가중 점수 ──────────────────────────────────────────────── */
  function pctRank(values) {
    /* 값이 있는 동만 0~100 백분위(같은 값은 같은 순위). 3곳 미만이면 순위를 매기지 않음 (dong-hea 와 같은 기준) */
    const vals = values.filter((v) => v != null);
    if (vals.length < 3) return () => null;
    const sorted = vals.slice().sort((a, b) => a - b);
    return (v) => {
      if (v == null) return null;
      let below = 0, eq = 0;
      for (const s of sorted) { if (s < v) below++; else if (s === v) eq++; }
      return Math.round(100 * (below + (eq - 1) / 2) / Math.max(1, sorted.length - 1));
    };
  }
  function fieldBase(cat) {
    if (!cat) return null;
    const xs = ['H', 'E', 'A'].map((a) => cat[a] && cat[a].score).filter((v) => v != null);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  }
  /** 동별 HEA 자료(data/dong/<지역>.json)에 가중치를 곱합니다.
   *  돌려주는 것: { fields:[{key,label,w,dongs,regionScore}] (가중 점수 높은 순 = 재정렬된 분야),
   *               dongs:[{name, n, inside, center, geometry, byField:{key:{base,weighted,w,pct}}, axes:{H,E,A}, weak:[축], total, totalPct}] } */
  function weightDongs(dong, si) {
    if (!dong || !si) return null;
    const w = si.weights;
    const dongs = dong.dongs.map((d) => {
      const byField = {};
      let sw = 0, sum = 0;
      const ax = { H: [0, 0], E: [0, 0], A: [0, 0] };
      FIELDS.forEach((f) => {
        const cat = d.byCat && d.byCat[f];
        const base = fieldBase(cat);
        if (base == null) return;
        byField[f] = { base: Math.round(base), weighted: Math.round(base * w[f]), w: w[f] };
        sw += w[f]; sum += base * w[f];
        ['H', 'E', 'A'].forEach((a) => { const s = cat[a] && cat[a].score; if (s != null) { ax[a][0] += s * w[f]; ax[a][1] += w[f]; } });
      });
      const axes = {};
      ['H', 'E', 'A'].forEach((a) => { axes[a] = ax[a][1] ? Math.round(ax[a][0] / ax[a][1]) : null; });
      return { name: d.name, n: d.n, inside: d.inside, center: d.center, geometry: d.geometry, byField, axes,
               total: sw ? sum / sw : null, nFields: Object.keys(byField).length };
    });
    const rank = pctRank(dongs.map((d) => d.total));
    dongs.forEach((d) => {
      d.totalPct = rank(d.total);
      /* 취약 축 — 가중 평균이 67 이상(상위)인 축. 없으면 가장 높은 축 하나 */
      const have = ['H', 'E', 'A'].filter((a) => d.axes[a] != null);
      d.weak = have.filter((a) => d.axes[a] >= 67);
      if (!d.weak.length && have.length) d.weak = [have.slice().sort((a, b) => d.axes[b] - d.axes[a])[0]];
    });
    FIELDS.forEach((f) => {
      const r = pctRank(dongs.map((d) => d.byField[f] ? d.byField[f].weighted : null));
      dongs.forEach((d) => { if (d.byField[f]) d.byField[f].pct = r(d.byField[f].weighted); });
    });
    /* 분야 재정렬 — 지자체 전체에서 그 분야의 가중 점수 평균(출동 건수로 가중). 높은 순 */
    const fields = FIELDS.map((f) => {
      const xs = dongs.filter((d) => d.byField[f]);
      const n = xs.reduce((s, d) => s + d.n, 0);
      const score = xs.length ? xs.reduce((s, d) => s + d.byField[f].weighted * d.n, 0) / Math.max(1, n) : null;
      return { key: f, label: LABEL[f], w: w[f], dongs: xs.length, regionScore: score == null ? null : Math.round(score) };
    }).filter((x) => x.dongs > 0).sort((a, b) => (b.regionScore - a.regionScore) || (b.w - a.w));
    return { fields, dongs, weights: w };
  }

  /* ── 복합위험지구 후보 — 밀도 × 가중 HEA ─────────────────────────────
     밀도 = 그 동의 출동 건수 ÷ 면적(km²) 의 지자체 안 백분위 (과거·실제 발생)
     HEA  = 위 가중 종합 백분위 (미래·발생 가능성)
     결합 = √(밀도 × HEA) (기하평균 — 한쪽이 0이면 0, 둘 다 높아야 높음) → 백분위. 67 이상을 후보로 봅니다. */
  function areaKm2(geometry) {
    let a = 0;
    for (const poly of geometry || []) {
      const ring = poly[0] || [];
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const lat0 = (p[0] + q[0]) / 2 * Math.PI / 180;
        s += (p[1] * q[0] - q[1] * p[0]) * Math.cos(lat0);
      }
      a += Math.abs(s) / 2;
    }
    return a * 111.32 * 111.32;   // 위경도 1도 ≈ 111.32km
  }
  function compositeDistricts(weighted) {
    if (!weighted) return null;
    const dongs = weighted.dongs.map((d) => {
      const km2 = areaKm2(d.geometry);
      return Object.assign({}, d, { km2, density: km2 > 0 ? d.n / km2 : null });
    });
    const rd = pctRank(dongs.map((d) => d.density));
    dongs.forEach((d) => {
      d.densityPct = rd(d.density);
      d.composite = (d.densityPct != null && d.totalPct != null) ? Math.sqrt(d.densityPct * d.totalPct) : null;
    });
    const rc = pctRank(dongs.map((d) => d.composite));
    dongs.forEach((d) => { d.compositePct = rc(d.composite); d.candidate = d.compositePct != null && d.compositePct >= 67; });
    const cand = dongs.filter((d) => d.candidate);
    const existing = dongs.filter((d) => d.inside > 0);
    const hit = existing.filter((d) => d.candidate);
    return { dongs, candidates: cand, existing, hit,
      note: existing.length ? `기존 복합위험지구와 겹치는 동 ${existing.length}곳 중 후보로 나온 곳 ${hit.length}곳` : '기존 복합위험지구와 겹치는 동 없음' };
  }

  function band(score) {
    if (score == null) return { key: 'none', label: '-', color: '#999999' };
    if (score >= 67) return { key: 'high', label: '상위', color: '#D83D64' };
    if (score >= 34) return { key: 'mid', label: '중위', color: '#000000' };
    return { key: 'low', label: '하위', color: '#666666' };
  }

  /** 지점(위경도)이 어느 동에 드는가 — 동 경계로 판정 (붙임 거점 카드용) */
  function dongAt(dong, lat, lng) {
    if (!dong) return null;
    const inRing = (ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    for (const d of dong.dongs) for (const poly of d.geometry || []) if (poly[0] && inRing(poly[0])) return d;
    /* 경계 밖(해안 등)이면 가장 가까운 중심 */
    let best = null, bd = Infinity;
    for (const d of dong.dongs) { if (!d.center) continue; const v = (d.center[0] - lat) ** 2 + (d.center[1] - lng) ** 2; if (v < bd) { bd = v; best = d; } }
    return best;
  }

  return { load, forRegion, years, renderTable, weightDongs, compositeDistricts, dongAt, band, gradeColor, FIELDS, LABEL, DISCLAIMER };
})();
