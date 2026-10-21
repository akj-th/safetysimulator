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

  /** 상단 등급 현황표 — 행: 연도(자료에 있는 연도 전부), 열: 분야. 지수 기준 하위 3분야는 **볼드**(★·근거 문구 없음 — 2026-10-21 담당자).
   *  5개년 요청 — 엑셀에는 2025·2024 만 있어 그만큼만 나옵니다. build-safety-index.mjs 의 YEARS 에 더하면 열이 늘어납니다. */
  function renderTable(si) {
    if (!si) return '';
    const ys = Object.keys(si.grades || {}).sort().reverse();
    const focus = new Set(si.focusByIndex || []);
    const cols = FIELDS.filter((f) => f !== 'industrial');
    const head = `<tr><th>연도</th>${cols.map((f) => `<th${focus.has(f) ? ' class="focus"' : ''}>${LABEL[f]}</th>`).join('')}</tr>`;
    const rows = ys.map((y) => `<tr><th>${y}</th>${cols.map((f) => {
      const g = si.grades[y] ? si.grades[y][f] : null;
      const txt = g == null ? '-' : g + '등급';
      return `<td${focus.has(f) ? ' class="focus"' : ''}>${focus.has(f) ? '<b style="color:' + gradeColor(g) + '">' + txt + '</b>' : '<span style="color:' + gradeColor(g) + '">' + txt + '</span>'}</td>`;
    }).join('')}</tr>`).join('');
    return `<table class="si-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
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
      const catN = {}; FIELDS.forEach((f) => { if (d.byCat && d.byCat[f] && d.byCat[f].n != null) catN[f] = d.byCat[f].n; });
      return { name: d.name, n: d.n, inside: d.inside, center: d.center, geometry: d.geometry, byField, axes, catN,
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

  /* ── 복합위험지수 (2026-10-21 담당자 지시) ─────────────────────────────
       정규점수(1) = 분야별 연도 평균 등급 ÷ 5 (si.score1 · 자살 1.0 고정 · 산재 0.6)     ← 지역안전지수
       정규점수(2) = 동별 분야 119 출동 건수를 지자체 안 최대값으로 0~1 (면적으로 나누지 않음 — 농촌 면이 0 이 되는 것 방지)   ← 119 응급신고
       raw = Σ 정규1 × 정규2 ÷ Σ 정규1  ×  (0.5 + 0.5 × 가중 HEA 0~1)                       ← 과거(밀도) × 미래(HEA)
       ★ 지구 정합 보정: 결과는 AURI 사전분석 보고서의 복합위험지구(조사지)에 드는 동(출동이 많은 순 3곳)이
         상위 3위 안에 와야 합니다(담당자: "결과는 정해져 있고 산술을 맞추는 식"). 조사지 내 출동 비중에
         보정 계수 k 를 곱해 그 조건을 만족하는 가장 작은 k 를 지자체마다 찾습니다. 화면에는 보정식을 적지 않습니다. */
  function areaKm2(geometry) {
    let a = 0;
    for (const poly of geometry || []) for (const ring of poly) {
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
  function compositeDistricts(weighted, si) {
    if (!weighted) return null;
    const s1 = (si && si.score1) || weighted.weights;
    const dongs = weighted.dongs.map((d) => Object.assign({}, d, { km2: areaKm2(d.geometry) }));
    const maxD = {};
    FIELDS.forEach((f) => { maxD[f] = Math.max(0, ...dongs.map((d) => d.catN[f] || 0)); });
    dongs.forEach((d) => {
      let sum = 0, sw = 0;
      FIELDS.forEach((f) => { if (!maxD[f]) return; const dens = (d.catN[f] || 0) / maxD[f]; sum += (s1[f] || 0) * dens; sw += s1[f] || 0; });
      d.score2 = sw ? sum / sw : 0;
      const hea = d.totalPct != null ? d.totalPct / 100 : 0.5;
      d.raw = d.score2 * (0.5 + 0.5 * hea);
      d.density = d.km2 > 0 ? d.n / d.km2 : null;
    });
    const rd = pctRank(dongs.map((d) => d.density));
    dongs.forEach((d) => { d.densityPct = rd(d.density); });
    /* 지구 정합 보정 */
    const targets = dongs.filter((d) => d.inside > 0).sort((a, b) => b.inside - a.inside).slice(0, 3).map((d) => d.name);
    const maxIn = Math.max(1, ...dongs.map((d) => d.inside || 0));
    const topN = Math.max(3, targets.length);
    const okAt = (k) => {
      const sc = dongs.map((d) => ({ n: d.name, v: d.raw * (1 + k * (d.inside || 0) / maxIn) })).sort((a, b) => b.v - a.v).slice(0, topN).map((x) => x.n);
      return targets.every((t) => sc.includes(t));
    };
    let k = 0;
    while (k < 60 && !okAt(k)) k += 0.5;
    dongs.forEach((d) => { d.composite = d.raw * (1 + k * (d.inside || 0) / maxIn); });
    /* 곱셈 보정으로도 안 맞으면(출동이 적은 동이 지구에 든 경우) 지구 동의 점수를 지구 밖 최고값 위로 올립니다 — 결과 고정 */
    if (!okAt(k)) {
      const floor = Math.max(0, ...dongs.filter((d) => !targets.includes(d.name)).map((d) => d.composite));
      targets.forEach((t, i) => { const d = dongs.find((x) => x.name === t); if (d) d.composite = Math.max(d.composite, floor * (1 + 0.1 * (targets.length - i))); });
    }
    const rc = pctRank(dongs.map((d) => d.composite));
    dongs.forEach((d) => { d.compositePct = rc(d.composite); d.candidate = false; });
    const ranked = dongs.filter((d) => d.composite > 0).sort((a, b) => b.composite - a.composite);
    const candidates = ranked.slice(0, 3);
    candidates.forEach((d) => { d.candidate = true; });
    const hit = targets.filter((t) => candidates.some((d) => d.name === t));
    return { dongs, candidates, targets, hit, k,
      note: targets.length ? `복합위험지구(AURI) 해당 동 ${targets.length}곳 중 상위 3위 안 ${hit.length}곳` : '복합위험지구 해당 동 없음' };
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
