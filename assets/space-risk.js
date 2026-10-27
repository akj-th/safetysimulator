/* ════════════════════════════════════════════════════════════════════
   공간유형 · 위험요인 · 개선사업 연계표 (2026-10-27)

   자료는 assets/space-risk.json 한 곳입니다(서버의 진단 지시문도 같은 파일을 읽습니다).
     spaceTypes   AURI 표준 공간분류 13종 + 정의·사진 단서·대표 위험요인   ← 정의는 AKJ 임시
     riskFactors  위험요인 → 체크리스트 항목 → 개선사업(연결 근거·개입 단위) ← AKJ 임시
   AURI 가 공간유형 분류체계·위험요인–개선사업 인과관계 자료를 주면 그 json 만 바꾸면 됩니다.

   ★ 처방(어떤 사업인가)은 여전히 rules.js 규칙 엔진이 정합니다. 이 표는
     ① 진단 문제 항목을 "위험요인" 단위로 묶고 ② 그 위험요인과 사업을 잇는 근거 문장을 대고
     ③ 처방이 비어 있는 위험요인에 검토할 후보를 보여 주는 데만 씁니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriSpaceRisk = (function () {
  let _data = null;
  let _loading = null;
  const norm = (s) => String(s || '').replace(/[\s·()（）〔〕[\]'"]/g, '').trim();

  function load() {
    if (_data) return Promise.resolve(_data);
    if (_loading) return _loading;
    _loading = fetch('assets/space-risk.json')
      .then(function (r) { if (!r.ok) throw new Error('space-risk.json ' + r.status); return r.json(); })
      .then(function (j) { _data = j; return j; })
      .catch(function (e) { console.error('[연계표] ' + e.message); _data = { spaceTypes: [], riskFactors: [] }; return _data; });
    return _loading;
  }
  const ready = () => !!(_data && _data.riskFactors && _data.riskFactors.length);

  function spaceType(name) {
    const n = norm(name);
    return (_data ? _data.spaceTypes : []).find(function (t) { return norm(t.name) === n; }) || null;
  }
  function riskFactor(id) {
    return (_data ? _data.riskFactors : []).find(function (r) { return r.id === id; }) || null;
  }
  /** 한 분야의 위험요인들 (연계표 순서) */
  function byField(field) {
    return (_data ? _data.riskFactors : []).filter(function (r) { return r.field === field; });
  }

  /**
   * 사진 판독 결과 → 위험요인 묶음.
   *   results  auri_diagnosis_results (분야별 { key, name, score, findings:[{id, ask, note, risk}] })
   *   order    분야 정렬 순서(중점 분야 먼저 등) — 넘긴 순서를 그대로 따릅니다
   * 돌려주는 값: [{ rf, field, fieldName, result, findings:[문제 항목] }]
   *   한 문제 항목이 여러 위험요인에 들 수 있습니다(연계표의 items 가 겹치면).
   *   분야 안에서는 문제 항목이 많이 걸린 위험요인 먼저, 같으면 연계표 순서.
   */
  function groupFindings(results) {
    const out = [];
    (results || []).forEach(function (r) {
      const problems = (r.findings || []).filter(function (f) { return f.risk; });
      if (!problems.length) return;
      const groups = byField(r.key).map(function (rf, i) {
        return { rf: rf, i: i, field: r.key, fieldName: r.name, result: r,
                 findings: problems.filter(function (f) { return (rf.items || []).includes(f.id); }) };
      }).filter(function (g) { return g.findings.length; });
      groups.sort(function (a, b) { return (b.findings.length - a.findings.length) || (a.i - b.i); });
      groups.forEach(function (g) { delete g.i; out.push(g); });
    });
    return out;
  }

  /**
   * 카드의 사업 후보 — 처방 목록(규칙 엔진)이 먼저입니다.
   *   ① 처방 중 이 위험요인의 항목이 부른 것(trigger.id)          kind '처방'
   *   ② 그래도 2개가 안 되면 연계표의 이 위험요인 사업              kind '연계표'
   *   ③ 사람 중심(H·A)이 하나도 없으면 연계 검토 사업 하나          kind '연계 검토'
   *   최대 3개. hea 는 팔레트(AuriPalette)에서, unit·why 는 표준 팔레트 → 연계표 순으로.
   */
  function measuresFor(group, prescriptions) {
    const rf = group.rf;
    const items = rf.items || [];
    const out = [];
    const has = (name) => out.some(function (m) { return norm(m.name) === norm(name); });
    const linkOf = (name) => (rf.projects || []).concat(rf.companions || []).find(function (p) { return norm(p.name) === norm(name); }) || null;
    const make = function (name, kind, extra) {
      const p = typeof AuriPalette !== 'undefined' ? AuriPalette.byName(name) : null;
      const sp = p && p.std ? p.std : null;
      const link = linkOf(name);
      return Object.assign({
        name: name, kind: kind, hea: (extra && extra.hea) || (p ? p.hea : '') || '',
        unit: (sp && sp.unit) || (link && link.unit) || '',
        why: (link && link.why) || '',
        overview: sp && sp.card ? (sp.card.overview || '') : '',
      }, extra || {});
    };
    (prescriptions || []).forEach(function (it) {
      if (out.length >= 3) return;
      if (it.trigger && items.includes(it.trigger.id) && !has(it.name)) out.push(make(it.name, '처방', { hea: it.hea || '' }));
    });
    (rf.projects || []).forEach(function (p) {
      if (out.length >= 2 || has(p.name)) return;
      if (typeof AuriPalette !== 'undefined' && !AuriPalette.byName(p.name)) return;   // 팔레트에 없는 이름은 건너뜀
      out.push(make(p.name, '연계표'));
    });
    const people = out.some(function (m) { return m.hea === 'H' || m.hea === 'A'; });
    if (!people && out.length < 3) {
      const c = (rf.companions || []).concat(rf.projects || []).find(function (p) {
        const pp = typeof AuriPalette !== 'undefined' ? AuriPalette.byName(p.name) : null;
        return pp && (pp.hea === 'H' || pp.hea === 'A') && !has(p.name);
      });
      if (c) out.push(make(c.name, '연계 검토'));
    }
    return out;
  }

  return {
    load, ready, spaceType, riskFactor, byField, groupFindings, measuresFor,
    get data() { return _data; },
    get source() { return _data ? _data.source : ''; },
    get version() { return _data ? _data.version : ''; },
  };
})();
