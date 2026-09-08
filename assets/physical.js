/* ════════════════════════════════════════════════════════════════════
   물적환경 회귀분석 불러오기 · 문장 만들기

   실제 값은 `assets/physical.json` 에 있습니다. 강원대가 보낸 회귀분석
   결과를 `tools/build-physical.mjs` 로 바꾼 것이며 **사람이 손대지 않습니다.**

   무엇에 쓰는가
   ────────────
   사전진단서 4장의 `(물적환경)` 줄은 지금까지 **사진 판독 결과만** 담았습니다.
   사진은 "지금 이 자리에 무엇이 있는가"는 알려 주지만, 그것이 실제로 사고와
   이어지는지는 말해 주지 못합니다. 회귀분석이 그 자리를 채웁니다.

     사진 판독   이 자리에 가로등이 없다              ← 눈으로 본 것
     회귀분석    이 지자체에서 노후건축물 비율이 높을수록
                 범죄 건수가 늘어난다                  ← 통계로 확인된 것

   ⚠️ **7개 지자체에만 있습니다** — 부천·광주북구·공주·관악·홍천·남원·영천.
      나머지 34곳에서는 `top()` 이 빈 배열을 돌려주고, 문서에서 이 줄이
      아예 나오지 않습니다. 없는 것을 "없음"이라고 적지도 않습니다.

   ⚠️ **상관이지 인과가 아닙니다.** "관련성이 높은 요인" 이라고만 쓰고
      "때문에" 라고 쓰지 않습니다. 문구를 고칠 때 이 선을 넘지 마세요.
   ════════════════════════════════════════════════════════════════════ */

const AuriPhysical = (function () {
  let _data = null;
  let _loading = null;

  /** 한 번만 받아 옵니다. 화면마다 호출해도 됩니다. */
  function load() {
    if (_data) return Promise.resolve(_data);
    if (_loading) return _loading;

    _loading = fetch('assets/physical.json')
      .then(function (res) {
        if (!res.ok) throw new Error('physical.json 을 받지 못했습니다 (' + res.status + ')');
        return res.json();
      })
      .then(function (json) { _data = json; return _data; })
      .catch(function (e) {
        /* 이 자료가 없어도 문서는 그대로 나와야 합니다 —
           원래 7개 지자체 말고는 없는 자료이므로, 못 받은 것과
           원래 없는 것이 화면에서 같은 모습이 됩니다. */
        console.error('[물적환경] ' + e.message);
        _data = { vars: {}, regions: {} };
        return _data;
      });
    return _loading;
  }

  const ready = () => !!(_data && _data.regions);

  /** 이 지자체에 회귀분석 자료가 있는가 */
  function has(region) {
    return !!(_data && _data.regions && _data.regions[region]);
  }

  /** 약어 → 한글 이름 (없으면 약어 그대로) */
  function varName(v) {
    return (_data && _data.vars && _data.vars[v]) || v;
  }

  /**
   * 영향이 큰 요인 목록
   *   region  지자체 열쇠 (bucheon …)
   *   cat     분야 열쇠 (crime …)
   *   opts.scope  'inside' 조사지 내(기본) · 'region' 지역 전체
   *   opts.limit  최대 몇 개 (기본 4)
   *
   * ★ 조사지 내를 기본으로 두는 이유 — 우리 문서는 그 조사지를 다룹니다.
   *   다만 조사지는 표본이 작아 유의한 요인이 아예 없는 분야가 많습니다.
   *   그럴 때 `fallback` 을 켜면 지역 전체 결과로 대신합니다(어느 쪽인지
   *   돌려주는 값에 `scope` 로 표시되므로 문서에 그대로 적을 수 있습니다).
   */
  function top(region, cat, opts) {
    const o = opts || {};
    const limit = o.limit == null ? 4 : o.limit;
    const r = _data && _data.regions ? _data.regions[region] : null;
    if (!r) return { scope: null, items: [] };

    const want = o.scope === 'region' ? 'region' : 'inside';
    let list = (r[want] && r[want][cat]) || [];
    let scope = want;

    if (!list.length && o.fallback && want === 'inside') {
      list = (r.region && r.region[cat]) || [];
      scope = list.length ? 'region' : scope;
    }

    const picked = list.slice(0, limit);

    /* ── 같은 이름이 두 번 나오는 것 막기 ────────────────────────
       약어표는 `ROAD_2/ROAD_2_P` 처럼 **두 약어를 한 줄에** 적어 두어
       한글 이름이 같습니다. 그런데 회귀분석에는 둘이 따로 들어가고,
       영향 방향이 서로 반대인 경우도 있습니다.

         영천 교통사고 — 도로폭_대로 길이 비율(+111.8%)
                        도로폭_대로 길이 비율(-53.2%)   ← 같은 이름, 반대 방향

       이대로 문서에 실으면 스스로 모순된 문장이 됩니다. 그래서 **이 목록
       안에서 이름이 겹칠 때만** 약어를 괄호로 덧붙여 구분합니다. 겹치지
       않으면 붙이지 않습니다 — 평소에는 한글 이름만 깔끔하게 나옵니다.

       ⚠️ 두 변수가 실제로 무엇이 다른지(길이 vs 비율로 짐작됩니다)는
          약어표에 적혀 있지 않습니다. 우리가 지어내지 않고 약어를 그대로
          보여 줍니다. AURI 회신이 오면 이름을 나눠 적으면 됩니다.
       ──────────────────────────────────────────────────────── */
    const seen = {};
    for (const it of picked) {
      const n = varName(it.v);
      seen[n] = (seen[n] || 0) + 1;
    }

    return {
      scope: picked.length ? scope : null,
      items: picked.map(function (it) {
        const n = varName(it.v);
        return {
          v: it.v,
          name: seen[n] > 1 ? n + ' (' + it.v + ')' : n,
          pct: it.pct, irr: it.irr, p: it.p, up: it.up,
        };
      }),
    };
  }

  const SCOPE_LABEL = { inside: '조사지 내', region: '지자체 전체' };

  /**
   * 문서에 그대로 넣는 한 문장.
   * 없으면 null 을 돌려줍니다 — 부르는 쪽에서 줄 자체를 빼면 됩니다.
   *
   * 보기)
   *   조사지 내 범죄 발생과 관련성이 높은 물적환경 요인은
   *   토지피복-상업지역 면적(+65.1%), 건물용도-음식점 밀도(+73.6%) …
   *   [강원대 회귀분석]
   */
  function narrate(region, cat, opts) {
    const o = opts || {};
    const t = top(region, cat, o);
    if (!t.items.length) return null;

    const label = o.catLabel || '해당 분야';
    const parts = t.items.map(function (it) {
      return it.name + '(' + (it.pct > 0 ? '+' : '') + it.pct.toFixed(1) + '%)';
    });

    return {
      scope: t.scope,
      items: t.items,
      text: SCOPE_LABEL[t.scope] + ' ' + label + ' 발생과 관련성이 높은 물적환경 요인은 '
          + parts.join(', ') + ' 입니다.',
      /* 숫자가 무엇을 뜻하는지 — 문서에 각주로 함께 답니다.
         이 설명 없이 퍼센트만 적으면 읽는 사람이 "그 시설이 있으면
         사고가 65% 늘어난다"로 잘못 읽습니다. */
      basis: '설명변수가 1 표준편차 늘어날 때 사고 건수의 변화율입니다. '
           + '상관관계이며 인과관계가 아닙니다.',
    };
  }

  /** 이 지자체에서 자료가 있는 분야 목록 */
  function fields(region, scope) {
    const r = _data && _data.regions ? _data.regions[region] : null;
    if (!r) return [];
    return Object.keys(r[scope === 'region' ? 'region' : 'inside'] || {});
  }

  function source() { return _data ? _data.source : ''; }

  return { load, ready, has, top, narrate, fields, varName, source };
})();

if (typeof window !== 'undefined') window.AuriPhysical = AuriPhysical;
