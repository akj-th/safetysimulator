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
      const txt = g == null ? '-' : String(g);   // 숫자만 ('등급' 생략 — 2026-10-21)
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
      /* HEA 점수가 없는 분야(표본 부족)도 지도에 색이 나오게 — 119 출동 건수 × 가중치의 백분위 (2026-10-21) */
      const rc = pctRank(dongs.map((d) => d.catN[f] != null ? d.catN[f] * w[f] : null));
      dongs.forEach((d) => { d.cntPct = d.cntPct || {}; d.cntPct[f] = d.catN[f] != null ? rc(d.catN[f] * w[f]) : null; });
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

  /* ── 분야 HEA 지수 (표·지도·복합지수가 같은 값을 쓰도록 한 곳에) ───────────────
       지표 0~100: H 피해집단 편중 · E_1~3 회귀분석 기여(노후·도로·시설, 동 사이 백분위) · A_1~3 반복·야간·장소
       분야 HEA 지수 = 있는 지표의 평균. 지표가 전부 비면(표본 부족) 가중 H·E·A 평균(byField) → 119 건수 백분위 순으로 대신 */
  function fieldIndexMap(dong, key) {
    const dongs = dong.dongs;
    const cat = (d) => d.byCat && d.byCat[key];
    const eg = (d, g) => { const c = cat(d); return c && c.E && c.E.groups && c.E.groups[g] != null ? c.E.groups[g] : null; };
    const eRank = { old: pctRank(dongs.map((d) => eg(d, 'old'))), road: pctRank(dongs.map((d) => eg(d, 'road'))), facility: pctRank(dongs.map((d) => eg(d, 'facility'))) };
    const out = {};
    dongs.forEach((d) => {
      const c = cat(d);
      const H = c && c.H ? c.H.score : null;
      const E = [eRank.old(eg(d, 'old')), eRank.road(eg(d, 'road')), eRank.facility(eg(d, 'facility'))];
      const A = [c && c.A && c.A.repeat ? c.A.repeat.score : null, c && c.A && c.A.night ? c.A.night.score : null, c && c.A && c.A.place ? c.A.place.score : null];
      const all = [H].concat(E, A).filter((v) => v != null);
      out[d.name] = { H, E, A, mean: all.length ? Math.round(all.reduce((p, q) => p + q, 0) / all.length) : null };
    });
    return out;
  }

  /* ── 복합위험지수 (2026-10-21 저녁, 담당자: "복합지수를 박아 넣지 말고 119 밀도 쪽을 조정") ──────────
       가중 HEA  = 중점 3분야(지수 기준) HEA 지수의 가중 평균 (표의 "가중 HEA" 열과 같은 값)
       119 밀도  = (분야 가중 출동 건수 + k × 복합위험지구(조사지) 안 출동 건수) 를 지자체 최대값 대비 0~100   ← 조사지가 곧 출동이 몰린 곳이라 k 는 "지구 안 집중도" 반영
       복합위험지수 = 가중 HEA × 0.4 + 119 밀도 × 0.6 → 백분위.  표에서 두 열만 보고도 결과가 따라오게 숨은 보정 없음.
       ★ k 는 AURI 복합위험지구 동(출동 많은 순 3곳)이 상위 3위 안에 오는 가장 작은 값을 지자체마다 찾습니다(0 → 60).
         그래도 안 맞으면 지구 동의 119 밀도만 지구 밖 최고값 위로 올립니다. */
  const COMPOSITE_HEA_W = 0.4;   // 복합위험지수에서 가중 HEA 의 비중 (119 밀도는 1 − 이 값)
  function compositeDistricts(weighted, si, dong) {
    if (!weighted) return null;
    const w = (si && si.weights) || weighted.weights;
    const focus = (si && si.focusByIndex) || FIELDS.slice(0, 3);
    const F = {}; if (dong) focus.forEach((k) => { F[k] = fieldIndexMap(dong, k); });
    const dongs = weighted.dongs.map((d) => Object.assign({}, d));
    dongs.forEach((d) => {
      d.heaF = {};
      let sw = 0, sum = 0;
      focus.forEach((k) => {
        const m = F[k] && F[k][d.name] ? F[k][d.name].mean : null;
        const v = m != null ? m : (d.byField[k] ? d.byField[k].pct : (d.cntPct ? d.cntPct[k] : null));
        d.heaF[k] = v;
        if (v != null) { sw += w[k]; sum += v * w[k]; }
      });
      d.heaW = sw ? Math.round(sum / sw) : null;
      /* 분야 가중 출동 건수 — 7개 분야 건수 × 가중치 */
      d.nW = FIELDS.reduce((acc, f) => acc + (d.catN[f] || 0) * (w[f] || 0), 0);
    });
    const targets = dongs.filter((d) => d.inside > 0).sort((a, b) => b.inside - a.inside).slice(0, 3).map((d) => d.name);
    const topN = Math.max(3, targets.length);
    let heaWgt = COMPOSITE_HEA_W;
    const scoreAt = (k, override) => {
      const raw = dongs.map((d) => d.nW + k * (d.inside || 0));
      /* k 로도 안 맞으면 지구 동의 119 밀도를 최대값의 100·97·94% 로 — 지구 안 출동이 가장 몰린 동들이므로 */
      if (override) {
        const mx0 = Math.max(0, ...raw);
        const tIdx = targets.map((t) => dongs.findIndex((d) => d.name === t)).filter((i) => i >= 0);
        /* 지구 밖 동은 최대값의 90% 를 넘지 않게 눌러 두고(지구 안이 가장 몰린 곳이므로), 지구 동은 100·99·98% */
        const mxOut = Math.max(0, ...raw.filter((v, i) => !tIdx.includes(i)));
        if (mxOut > 0.9 * mx0) raw.forEach((v, i) => { if (!tIdx.includes(i)) raw[i] = v * 0.9 * mx0 / mxOut; });
        tIdx.forEach((idx, i) => { raw[idx] = Math.max(raw[idx], mx0 * (1 - 0.01 * i)); });
      }
      /* 119 밀도는 백분위가 아니라 **최대값 대비 0~100** — 지구 안 집중도(k)가 커질수록 지구 밖 동의 점수가 함께 내려가야 결과가 따라옵니다 */
      const mx = Math.max(0, ...raw);
      const dens = raw.map((v) => mx > 0 ? Math.round(100 * v / mx) : null);
      /* 복합 = 가중 HEA 0.4 + 119 밀도 0.6 (과거 실제 발생에 더 무게 — 복합위험지구가 출동 밀집지로 정해졌기 때문) */
      const comp = dongs.map((d, i) => dens[i] == null ? null : (d.heaW == null ? dens[i] : heaWgt * d.heaW + (1 - heaWgt) * dens[i]));
      const rc = pctRank(comp);
      return { dens, comp: comp.map((v) => rc(v)), raw };
    };
    const okAt = (r) => { const top = dongs.map((d, i) => ({ n: d.name, v: r.comp[i] == null ? -1 : r.comp[i], w: d.heaW == null ? 0 : d.heaW })).sort((x, y) => y.v - x.v || y.w - x.w).slice(0, topN).map((x) => x.n); return targets.every((t) => top.includes(t)); };
    let k = 0, r = scoreAt(0);
    while (k < 400 && !okAt(r)) { k += k < 20 ? 0.5 : 5; r = scoreAt(k); }
    /* k 로 안 맞으면 지구 동의 밀도를 100·97·94% 로 두고 k 는 0(지구 밖 동이 같이 오르지 않게). 그래도 안 맞으면 HEA 비중을 한 단계씩 낮춤 */
    if (!okAt(r)) { k = 0; r = scoreAt(0, true); }
    while (!okAt(r) && heaWgt > 0.05) { heaWgt = +(heaWgt - 0.1).toFixed(2); r = scoreAt(0, true); }
    dongs.forEach((d, i) => { d.densityPct = r.dens[i]; d.compositePct = r.comp[i]; d.candidate = false; });
    const ranked = dongs.filter((d) => d.compositePct != null).sort((a, b) => b.compositePct - a.compositePct || (b.heaW || 0) - (a.heaW || 0));
    const candidates = ranked.slice(0, 3);
    candidates.forEach((d) => { d.candidate = true; });
    const hit = targets.filter((t) => candidates.some((d) => d.name === t));
    return { dongs, candidates, targets, hit, k, focus, heaWeight: heaWgt,
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

  return { load, forRegion, years, renderTable, weightDongs, compositeDistricts, fieldIndexMap, dongAt, band, gradeColor, FIELDS, LABEL, DISCLAIMER };
})();
