/* ════════════════════════════════════════════════════════════════════
   사업 팔레트 불러오기

   실제 목록은 `assets/palette.json` 에 있습니다. AURI가 준 엑셀을
   `tools/build-palette.mjs` 로 바꾼 것이며, **사람이 손대지 않습니다.**

     팔레트(무엇을 할 수 있는가)   assets/palette.json   ← AURI 자료
     연결표(언제 그것을 하는가)     assets/rules.js       ← 우리 판단

   둘을 나눠 둔 이유는 팔레트가 아직 확정본이 아니기 때문입니다.
   새 엑셀을 받으면 build-palette.mjs 만 다시 돌리면 되고, 연결이
   끊어진 곳은 tools/verify-rules.mjs 가 잡아 줍니다.

   ── HEA 3분류 (2026-08-25 행안부 협의의 3분류가 이것입니다) ─────────
     H  피해대상 보호·지원   위험에 노출된 사람을 직접 보호·지원
     E  환경적 개입          공간·시설을 바꿈
     A  행위 개입            사람의 행동을 바꿈 (단속·교육·홍보)
   ════════════════════════════════════════════════════════════════════ */

const AuriPalette = (function () {
  let _data = null;
  let _byName = new Map();     // 정규화한 사업명 → 사업
  let _byId = new Map();
  let _loading = null;

  /* 이름을 맞출 때만 쓰는 정규화 — 띄어쓰기·괄호 차이를 무시합니다 */
  const norm = (s) => String(s || '').replace(/[\s·()（）〔〕[\]]/g, '').trim();

  /** 팔레트를 한 번만 받아 옵니다. 화면마다 호출해도 됩니다. */
  function load() {
    if (_data) return Promise.resolve(_data);
    if (_loading) return _loading;

    _loading = fetch('assets/palette.json')
      .then(function (res) {
        if (!res.ok) throw new Error('palette.json 을 받지 못했습니다 (' + res.status + ')');
        return res.json();
      })
      .then(function (json) {
        _data = json;
        _byName = new Map();
        _byId = new Map();
        (json.programs || []).forEach(function (p) {
          _byName.set(norm(p.name), p);
          _byId.set(p.id, p);
        });
        /* ★ 표준 팔레트 210종 (AURI 2026-10-20, assets/palette-std.json — tools/build-palette-std.mjs) 을 덧붙입니다.
           같은 이름(56종)은 기존 사업에 상세카드(std)를 붙이고 검토 HEA 를 반영, 새 이름(154종)은 사업으로 추가.
           연결표(rules.js)는 기존 이름을 가리키므로 처방 규칙은 그대로이고, 목록·드롭다운·효과·예산 글만 풍부해집니다. */
        return fetch('assets/palette-std.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
          .then(function (std) {
            if (!std || !std.programs) return _data;
            std.programs.forEach(function (sp) {
              const ex = _byName.get(norm(sp.name));
              const card = sp.card || {};
              if (ex) {
                ex.std = sp;
                if (sp.hea && sp.hea !== ex.hea) { ex.heaOrig = ex.hea; ex.hea = sp.hea; }   // AURI 검토 HEA 반영
                /* ★ 10/21 표준이 기준 (2026-10-30 담당자: 표준 → 10/06 → 9/02) — 근거·출처는 표준 상세카드 글, 바탕(palette.json) 글은 *Base 로 남김.
                   금액은 표준에 단가가 있으면 표준, 없으면(지금 210종 모두 산식만) 바탕의 금액 문구(10/06 사례 금액), 그것도 없으면 표준 산식 */
                const sref = card.sourceRef || card.caseRef;
                if (card.evidence && card.evidence !== ex.effect) { ex.effectBase = ex.effect; ex.effect = card.evidence; }
                if (sref && sref !== ex.source) { ex.sourceBase = ex.source; ex.source = sref; }
                const baseHasAmount = ex.amount && (ex.amount.won || ex.amount.text);
                if (sp.amount && (sp.amount.won || (!baseHasAmount && sp.amount.text))) ex.amount = sp.amount;
                return;
              }
              const p = { id: sp.id, field: sp.field, name: sp.name, hea: sp.hea, effect: card.evidence || '', source: card.sourceRef || card.caseRef || '',
                          amount: sp.amount, group: 'std1021', row: sp.no, std: sp };
              _data.programs.push(p);
              _byName.set(norm(p.name), p);
              _byId.set(p.id, p);
            });
            _data.stdSource = std.source;
            return _data;
          });
      })
      .catch(function (e) {
        /* 팔레트가 없어도 화면이 통째로 죽지는 않게 합니다.
           처방이 비고, 왜 비었는지는 화면에 표시됩니다. */
        console.error('[팔레트] ' + e.message);
        _data = { programs: [], hea: {}, note: '팔레트를 불러오지 못했습니다.' };
        return _data;
      });
    return _loading;
  }

  const ready = () => !!(_data && _data.programs && _data.programs.length);

  /** 사업명으로 찾기 (연결표가 이름으로 가리킵니다) */
  function byName(name) { return _byName.get(norm(name)) || null; }
  function byId(id) { return _byId.get(id) || null; }

  /** 한 분야의 사업 목록 */
  function byField(field) {
    return (_data ? _data.programs : []).filter(function (p) { return p.field === field; });
  }

  /* HEA 는 알파벳을 함께 적습니다. "환경"만 있으면 무슨 분류 체계인지
     알 수 없고, 팔레트·회의록·보고서가 모두 E/A/H 로 부르기 때문입니다. */
  const HEA_SHORT = { E: '환경', A: '행위', H: '피해대상' };

  /** HEA 표시 이름. short 면 "[E] 환경", 아니면 "환경적 개입" */
  function heaLabel(hea, short) {
    const table = (_data && _data.hea) || {};
    const item = table[hea];
    if (!short) return item ? item.label : (hea || '—');
    return HEA_SHORT[hea] ? `[${hea}] ${HEA_SHORT[hea]}` : (hea || '—');
  }

  /** 목록 아래에 붙이는 한 줄 범례 */
  function heaLegend() {
    return 'E = 환경 개선 · A = 행동 개입 · H = 피해대상 보호·지원';
  }
  function heaDesc(hea) {
    const item = ((_data && _data.hea) || {})[hea];
    return item ? item.desc : '';
  }

  /**
   * 금액 한 줄. 단가로 쓸 수 있으면 금액을, 아니면 왜 못 쓰는지 적습니다.
   * 예산 근거 문서라 "얼마인지 모른다"를 감추면 안 됩니다.
   */
  function amountText(program) {
    if (!program || !program.amount) return '산출 근거 필요';
    const a = program.amount;
    if (a.won) return auriWon(a.won) + (a.unit ? ' / ' + a.unit : '');
    if (a.text) return '산출 근거 필요 — 참고: ' + a.text;
    return '산출 근거 필요';
  }

  /** 표준 팔레트 상세카드 (없으면 null) — 공간유형·개입단위·개요·대상·소요예산 산식·성과확인 … */
  function std(nameOrProgram) {
    const p = typeof nameOrProgram === 'string' ? byName(nameOrProgram) : nameOrProgram;
    return p && p.std ? p.std : null;
  }

  /** 효과크기와 출처. 예산 근거 문서라 출처 표기가 중요합니다. */
  function evidence(program) {
    if (!program) return null;
    if (!program.effect && !program.source) {
      /* 10/06 팔레트의 구성항목(예: 교통정온화 → 과속방지턱 설치)은 효과·출처가 종합사업 줄에만 있습니다 — 그 글을 종합사업 근거라고 밝혀서 씁니다 */
      const parent = program.parent ? byName(program.parent) : null;
      if (parent && (parent.effect || parent.source)) return { effect: '「' + parent.name + '」 종합사업 근거: ' + (parent.effect || ''), source: parent.source || '' };
      return null;
    }
    return { effect: program.effect || '', source: program.source || '' };
  }

  /** ★ 효과 레퍼런스 한 줄 (2026-10-20 실무회의) — "가로등 조도 개선 사업으로 ○○지자체 자살 발생률 20% 감소" 꼴.
   *  AURI 가 보도자료 기반 정량 수치를 정리해 보내면 팔레트 엑셀의 효과 칸을 그 문구로 바꾸면 됩니다.
   *  그전까지는 효과 칸 원문에서 **숫자 + 감소·증가·%** 가 있는 짧은 구절**만** 뽑습니다. 못 찾으면 앞 60자. */
  function effectLabel(program) {
    /* 표준 팔레트 상세카드의 (국내 실증·정책근거) 가 있으면 그 첫 문장 */
    const ev = program && program.std && program.std.card && program.std.card.evidence;
    if (ev) { const first = ev.split(/(?<=[.다음])\s+/)[0] || ev; return first.length > 110 ? first.slice(0, 110) + '…' : first; }
    const t = String(program && program.effect || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const m = /((?:[^\s]+\s){0,7}\d[\d,.]*\s*(?:%|％|배|건|명|p)?[^\s]*\s*(?:감소|줄어|하락|감축|증가|향상|개선|상승)[^\s]*)/.exec(t);
    if (m) return m[1].trim();
    const m2 = /((?:[^\s]+\s){0,6}\d[\d,.]*\s*(?:%|％)[^\s]*(?:\s[^\s]+){0,3})/.exec(t);
    if (m2) return m2[1].trim();
    return t.length > 60 ? t.slice(0, 60) + '…' : t;
  }

  /** 출처가 URL이면 도메인만, 논문이면 앞부분만 — 한 줄에 들어가게 */
  function sourceShort(source) {
    const s = String(source || '').trim();
    if (!s) return '';
    const url = /^https?:\/\/([^/\s]+)/.exec(s);
    if (url) return url[1].replace(/^www\./, '');
    return s.length > 46 ? s.slice(0, 46) + '…' : s;
  }

  /* ★ AURI 「표준사업가이드 개발(안)」(2026-10-26 자료, 4쪽) — 210개 표준사업의 13개 세부 공간유형을
     4개 물리적 사업공간군 + 1개 서비스·관리체계로 묶은 표. palette-std.json 의 spaceType 값과 글자 그대로 같습니다. */
  const SPACE_GROUPS = [
    { group: '주거·생활시설',   types: ['주거생활형', '의료·복지거점형', '교육·돌봄시설형', '다중이용·공공시설형'], check: '노후도, 취약인구, 시설안전, 서비스 접근', apply: '생활권·시설 개선' },
    { group: '교통·이동',       types: ['도로·보행축형', '주요 교차로형', '교통결절·승하차형'], check: '사고유형, 도로구조, 보행·차량 상충', apply: '도로축·교차로 개선' },
    { group: '상업·산업·생산활동', types: ['산업·사업장형', '상업·유흥 밀집형', '농촌·농작업형', '관광산업 밀집형'], check: '시설·작업 위험, 이용·작업 동선', apply: '활동공간 및 접점 개선' },
    { group: '자연·연안·옥외',   types: ['자연환경형'], check: '추락·익수 등 위험지점, 구조접근', apply: '위험시설·접근구간 개선' },
    { group: '지역관리·서비스',  types: ['지역관리·네트워크형'], check: '예방·상담·신고·대응체계 공백', apply: '서비스·기관연계 보완' },
  ];
  /** 세부 공간유형 → 상위 공간분류 이름 (모르면 '') */
  function spaceGroupOf(type) {
    const t = String(type || '').replace(/\s+/g, '');
    const hit = SPACE_GROUPS.find(function (g) { return g.types.some(function (x) { return x.replace(/\s+/g, '') === t; }); });
    return hit ? hit.group : '';
  }
  /** 어느 공간유형(세부) 또는 상위 분류에 드는 사업 목록 — 표준 팔레트 상세가 있는 사업만 */
  function bySpace(typeOrGroup) {
    const want = String(typeOrGroup || '').replace(/\s+/g, '');
    if (!want) return _data ? _data.programs : [];
    return (_data ? _data.programs : []).filter(function (p) {
      const sp = p.std ? String(p.std.spaceType || '').replace(/\s+/g, '') : '';
      return sp && (sp === want || spaceGroupOf(sp).replace(/\s+/g, '') === want);
    });
  }

  return {
    load, ready, byName, byId, byField, bySpace, spaceGroupOf, SPACE_GROUPS,
    heaLabel, heaLegend, heaDesc, amountText, evidence, sourceShort, effectLabel, std,
    get data() { return _data; },
    get note() { return _data ? _data.note : ''; },
    get count() { return _data ? _data.programs.length : 0; },
  };
})();
