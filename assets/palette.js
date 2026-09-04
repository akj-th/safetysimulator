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
        return _data;
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

  /** HEA 표시 이름 */
  function heaLabel(hea, short) {
    const table = (_data && _data.hea) || {};
    const item = table[hea];
    if (!item) return hea || '—';
    if (!short) return item.label;
    return { H: '피해대상', E: '환경', A: '행위' }[hea] || hea;
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

  /** 효과크기와 출처. 예산 근거 문서라 출처 표기가 중요합니다. */
  function evidence(program) {
    if (!program) return null;
    if (!program.effect && !program.source) return null;
    return { effect: program.effect || '', source: program.source || '' };
  }

  /** 출처가 URL이면 도메인만, 논문이면 앞부분만 — 한 줄에 들어가게 */
  function sourceShort(source) {
    const s = String(source || '').trim();
    if (!s) return '';
    const url = /^https?:\/\/([^/\s]+)/.exec(s);
    if (url) return url[1].replace(/^www\./, '');
    return s.length > 46 ? s.slice(0, 46) + '…' : s;
  }

  return {
    load, ready, byName, byId, byField,
    heaLabel, heaDesc, amountText, evidence, sourceShort,
    get data() { return _data; },
    get note() { return _data ? _data.note : ''; },
    get count() { return _data ? _data.programs.length : 0; },
  };
})();
