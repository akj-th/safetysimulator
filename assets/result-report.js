/* ════════════════════════════════════════════════════════════════════
   「지역 안전진단 결과 보고서(안)」 탭 — AURI 예시안(관악·남원·정읍, 2026-11-18 김가은) 목차 그대로 (2026-11-20 착수)

   장마다 채우는 방법
     요약 · 1장  자료로 자동 — 지역안전지수 5개년 등급(safety-index.json) · 세부지표(safety-detail.json) ·
                119 출동 연도별·인구 10만명당·동일유형 평균 대비(safety-detail.json rates) · 문장은 규칙으로 조립
     2장        공통 문구(report-common.json) + AURI 그림(분포도·중첩도) 자리 + 후보지 비교표(바운더리를 받으면)
     3장        구역별 사고 특성(data/stats/zones/<지역>.json — tools/build-zone-stats.mjs) · 종합도 · 현장사진·개선 후 시뮬레이션
     4·5장      AURI 자료를 받으면 채움(5.1 유관사업은 AURI 작성 표)
     붙임       지역안전지수 산출지표 분석(safety-detail.json)
   AI 가 숫자·사업을 정하지 않습니다 — 표의 숫자는 모두 자료에서, 문장은 규칙으로 조립(설계 원칙 3번).
   문장 규칙은 예시안 3곳을 대조해 맞춤(아래 각 함수 주석). 예시안 문구가 바뀌면 여기만 고칩니다.
   ════════════════════════════════════════════════════════════════════ */
const AuriResultReport = (function () {
  const L = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
  const ORDER = ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection', 'industrial'];
  const YEARS = ['2021', '2022', '2023', '2024', '2025'];
  /* 중점관리분야 선정 기준(focus-override.json ①~④) — 표 1-2 짧은 글 · 1.2 문장 · 표 1-4 긴 글 (예시안 표현) */
  const CRIT_SHORT = { '①': '5개년 연속 4·5등급', '②': '5개년 평균 4.0등급 이하', '③': '’25년 1.5등급 이상 급락', '④': '취약 여건 대비 위해지표 과다' };
  const CRIT_SENT = { '①': '5년 연속 4·5등급으로 만성 하위', '②': '5년 평균 4.0등급 이하로 지속 취약', '③': '최근 등급이 1.5등급 이상 급락', '④': '취약 여건 대비 위해지표(사고·사망)가 과다' };
  const CRIT_LONG = { '①': '최근 5개년(’21~’25년) 연속 4·5등급 (만성 하위 고착)', '②': '최근 5개년(’21~’25년) 평균 4.0등급 이하 (지속 취약)', '③': '’25년 등급 1.5등급 이상 급락 (최근 악화)', '④': '등급 기준(①~③) 미충족, ’25년 취약지표 대비 위해지표 과다' };
  const SIDO_SHORT = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남' };
  /* 119 발생장(묶음) → 예시안 표기 */
  const PLACE_NAME = { 집: '주거지(집)', '바다/강/산/논밭': '산·하천·논밭', 일차산업장: '농·축산 등 일차산업장', 도로외교통지역: '도로 외 교통지역', '오락/문화시설': '오락·문화시설', '공장/산업/건설시설': '공장·산업·건설시설', '학교/교육시설': '학교·교육시설' };
  const SUB13 = { crime: '폭력·상해 등', suicide: '자해·자살시도' };
  let _detail = null, _common = null, _zones = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 0) => v == null ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const ratio = (v) => v == null ? '-' : Number(v).toFixed(2) + '배';
  const pct1 = (v) => Number(v).toFixed(1) + '%';
  /* 받침 있으면 a(은·이), 없으면 b(는·가) */
  const josa = (w, a, b) => { const s = String(w); const c = s.charCodeAt(s.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b; };
  /* "서울특별시 관악구" → "서울 관악구" (예시안 요약·1.2 표기). 세종·제주는 한 단어 */
  const shortName = (label) => { const [s, ...rest] = String(label).split(' '); return rest.length ? (SIDO_SHORT[s] || s) + ' ' + rest.join(' ') : s.replace('특별자치시', '시').replace('특별자치도', '도'); };
  /* 중점관리분야 나열 순서 — 예시안은 분야 순서대로 쓰고 자살을 맨 뒤에 둠(관악 "범죄, 감염병, 자살") */
  const focusOrder = (si) => { const f = (si && si.focusByIndex) || []; return ORDER.filter((k) => k !== 'suicide' && f.includes(k)).concat(f.includes('suicide') ? ['suicide'] : []); };

  async function getJson(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function load(region) {
    [_detail, _common, _zones] = await Promise.all([
      _detail || getJson('data/stats/safety-detail.json'),
      _common || getJson('assets/report-common.json'),
      getJson('data/stats/zones/' + region + '.json'),     // 없으면 null — AURI 바운더리를 받은 지자체만
    ]);
  }
  /* 세부지표 줄(배열) → 객체 */
  function detailRows(region, year) {
    const r = _detail && _detail.regions[region]; if (!r || !r.years[year]) return [];
    return r.years[year].map((a) => Object.fromEntries(_detail.cols.map((c, i) => [c, a[i]])));
  }
  /* 표 1-2·1-4 에 쓰는 세부지표 연도 — 2025, 없으면 가장 최근 연도 (홍천 2025 시트가 정선 자료라 비움 → 2024) */
  const detailYear = (region) => ['2025', '2024', '2023', '2022'].find((y) => detailRows(region, y).length) || null;
  /* AURI 원본에서 같은 자료라 비운 시트(build-safety-detail.mjs excluded) — 화면에 "원자료 확인 중"으로 알림 */
  function detailNote(region) {
    const ex = (_detail && _detail.excluded || []).filter((e) => e.region === region); if (!ex.length) return '';
    const y = detailYear(region);
    return `※ 지역안전지수 핵심지표: AURI 제공 원자료 중 ${ex.map((e) => '’' + e.year.slice(2)).join('·')}년 시트가 다른 지자체 자료와 같아 비워 둠(원자료 확인 중)${y ? ` — ’${y.slice(2)}년 자료로 표시` : ' — 지표 배수는 원자료를 받으면 채워짐'}`;
  }
  const rateOf = (region) => (_detail && _detail.rates && _detail.rates.regions[region]) || null;
  const typeAvgOf = (region) => { const r = rateOf(region); return r && _detail.rates.typeAvg ? _detail.rates.typeAvg[r.type] || null : null; };
  /* 표 머리 "(자치구 평균 대비)" / "(전국 시 지역 평균 대비)" — 핵심지표의 같은 유형 평균(예시안 표기) */
  const indicatorBase = (type) => type === '자치구' ? '자치구 평균 대비' : type ? `전국 ${type} 지역 평균 대비` : '동일유형 평균 대비';

  /* ── 공통 조각 ─────────────────────────────────────────────────── */
  const para = (list, name) => (list || []).map(([k, t]) => {
    const s = esc(String(t).replace(/\{지자체\}/g, name));
    return k === 'bullet' ? `<p class="bullet">${s}</p>` : k === 'sub' ? `<p class="bullet rr-sub">${s}</p>` : `<p class="note-under">${s}</p>`;
  }).join('');
  const wait = (what) => `<div class="rr-wait">${esc(what)}</div>`;
  const chapter = (title, body) => `<section class="chapter"><h2 class="h-chapter">${esc(title)}</h2>${body}</section>`;
  const sev = (x) => Math.abs(Math.log(x.ratio));

  /* ── 규칙 문장 ─────────────────────────────────────────────────── */
  const avgGrade = (si, k) => { const v = YEARS.map((y) => (si.grades[y] || {})[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  /* 여건(표 1-2) — 예시안 3곳 대조:
       자살 필수 · ① 분야 중 5년 평균이 가장 나쁜 하나 최우선(같으면 ’25 등급) · 나머지 ①② 우선 · ③④ 관심
       미선정은 ’25 등급이 ’21~’24 평균보다 나쁘면 관심, 아니면 개선 · 산업재해(등급 없음) 관심 */
  function condition(si, k) {
    if (k === 'suicide') return '필수';
    const ft = si.focusType || {}; const t = ft[k];
    if (t === '①') {
      const top = Object.keys(ft).filter((x) => ft[x] === '①').sort((a, b) => (avgGrade(si, b) - avgGrade(si, a)) || (((si.grades['2025'] || {})[b] || 0) - ((si.grades['2025'] || {})[a] || 0)))[0];
      return top === k ? '최우선' : '우선';
    }
    if (t === '②') return '우선'; if (t === '③' || t === '④') return '관심';
    const g = YEARS.map((y) => (si.grades[y] || {})[k]);
    if (g[4] == null) return '관심';
    const prev = g.slice(0, 4).filter((v) => v != null); const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : g[4];
    return g[4] > avg ? '관심' : '개선';
  }
  /* 분야의 대표 지표(표 1-2) — 평균보다 나쁜 위해 → 취약 → 경감·의식 중 가장 두드러진 것, 없으면 위해 지표 (남원 "교통사고 사망자수 1.47배", 정읍 생활안전 "재난약자수 1.31배") */
  function keyIndicator(region, k) {
    const rows = detailRows(region, detailYear(region)).filter((x) => x.field === k && x.ratio != null && x.kind !== '환산');
    for (const kinds of [['위해'], ['취약'], ['경감', '의식']]) { const w = rows.filter((x) => x.weak && kinds.includes(x.kind)).sort((a, b) => sev(b) - sev(a)); if (w.length) return w[0]; }
    return rows.find((x) => x.kind === '위해') || null;
  }
  /* 핵심 부족·취약 지표(표 1-4) — 평균보다 나쁜 지표 중 차이가 큰 4개, 위해·취약·경감·의식 순 (관악 3분야 예시안과 같은 결과) */
  function weakLines(region, k, limit = 4) {
    const KIND = { 위해: 0, 취약: 1, 경감: 2, 의식: 3 };
    return detailRows(region, detailYear(region)).filter((x) => x.field === k && x.weak && x.ratio != null)
      .sort((a, b) => sev(b) - sev(a)).slice(0, limit)
      .sort((a, b) => KIND[a.kind] - KIND[b.kind])
      .map((x) => `(${x.kind}) ${x.name} ${ratio(x.ratio)} ${x.ratio > 1 ? '↑' : '↓'}`);
  }
  /* 평균보다 두드러진 장소·연령(표 1-3·1-4 "도로 22.3%(평균 9.0%) 집중") — 같은 유형 평균보다 4%p 이상·1.3배 이상 높은 장소, 60세 이상은 8%p 이상. 큰 차이 순 2개
     출동 3개년 10건 미만이면 비율이 흔들려 쓰지 않음(정읍 감염병 "구급 출동 3개년 4건으로 지점 분석 한계") */
  function notable(region, k) {
    const r = rateOf(region), ta = typeAvgOf(region); const f = r && r.fields[k];
    if (!f || !ta || f.total < 10) return [];
    const pa = (ta.place || {})[k] || {}, out = [];
    Object.entries(f.place || {}).forEach(([nm, s]) => { const a = pa[nm] || 0; if (nm !== '기타' && s >= 5 && s - a >= 4 && s >= a * 1.3) out.push({ d: s - a, t: `${PLACE_NAME[nm] || nm} ${pct1(s)}(평균 ${pct1(a)})` }); });
    const a60 = (ta.age60 || {})[k]; if (f.age60 != null && a60 != null && f.age60 - a60 >= 8) out.push({ d: f.age60 - a60, t: `60세 이상 ${pct1(f.age60)}(평균 ${pct1(a60)})` });
    return out.sort((x, y) => y.d - x.d).slice(0, 2).map((x) => x.t);
  }
  const change = (a, c) => a ? ((c - a) / a * 100) : null;
  const chgTxt = (v) => v == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';

  /* ── 요약 ──────────────────────────────────────────────────────── */
  function summary(ctx) {
    const si = ctx.si, focus = focusOrder(si), short = shortName(ctx.label);
    const z = _zones; const ft = (si && si.focusType) || {};
    const list = focus.map((k) => k === 'suicide' ? '자살*' : `${L[k]}${CRIT_SHORT[ft[k]] ? `(${CRIT_SHORT[ft[k]]})` : ''}`);
    return chapter('요약 — 지역 안전진단 결과', `
      <h3 class="h-section">1. 안전진단 목적 및 복합위험지구 선정 결과</h3>
      ${para(_common && _common.summary && _common.summary.purpose, short)}
      ${si ? `<p class="bullet"><span class="tag">(중점관리분야)</span> 지역안전지수 하위 등급과 기초통계 추세를 종합하여 ${esc(short)}${josa(short, '은', '는')} ${esc(list.join(', '))} ${focus.length}개 분야를 중점관리분야로 선정</p>
      ${focus.includes('suicide') ? '<p class="note-under">* OECD 대비 높은 자살률의 국가적 시급성을 감안해 41개 전 지역 필수 산정</p>' : ''}` : ''}
      <h3 class="h-section">2. 복합위험지구 구역별 위험요인 및 맞춤형 사업</h3>
      ${z ? `<p class="bullet"><span class="tag">(복합위험지구)</span> ‘${esc(z.district.name)}’${z.district.areaKm2 ? `(약 ${nf(z.district.areaKm2, 1)}㎢)` : ''} · 사업구역 ${z.zones.length}곳 — 구역별 사고 특성은 본문 3.1</p>` : wait('복합위험지구 위치·구역별 위험요인 — AURI 복합위험지구·세부 구역 바운더리를 받으면 채워집니다')}
      ${wait('<표 1> 복합위험지구 맞춤형 사업 요약표(대상 구역·핵심 위험요인·사업·소요 예산) — 3.2 사업 구성을 확정하면 채워집니다')}`);
  }

  /* ── 1장 ───────────────────────────────────────────────────────── */
  function ch1(ctx) {
    const si = ctx.si, region = ctx.region, name = ctx.label, short = shortName(name), rate = rateOf(region);
    if (!si) return chapter('1. 지역 안전현황 및 중점관리분야 선정', wait('지역안전지수 자료가 없는 지자체입니다'));
    const focus = focusOrder(si), ft = si.focusType || {};
    const typeName = rate ? rate.type : '동일유형', base = indicatorBase(rate && rate.type);
    const t11 = _common && _common.ch1.table11;
    /* 1.2 첫 문장 — 기준별로 묶어서 (관악 "범죄·감염병은 취약 여건 대비 위해지표(사고·사망)가 과다, 자살은 …") */
    const groups = {};
    focus.filter((k) => k !== 'suicide').forEach((k) => { const t = ft[k] || '?'; (groups[t] = groups[t] || []).push(L[k]); });
    const parts = Object.keys(groups).sort().map((t) => { const nm = groups[t].join('·'); return `${nm}${josa(nm, '은', '는')} ${CRIT_SENT[t] || '중점관리 필요'}`; });
    if (focus.includes('suicide')) parts.push('자살은 OECD 대비 높은 자살률로 국가적 집중 관리 필요');
    /* 표 1-2 */
    const rows12 = ORDER.map((k) => {
      const g = YEARS.map((y) => (si.grades[y] || {})[k]);
      const f = rate ? rate.fields[k] : null;
      const sel = focus.includes(k);
      const ki = k === 'industrial' ? null : keyIndicator(region, k);
      const kiTxt = ki ? `${ki.name} ${ratio(ki.ratio)}` : '';
      let text;
      if (k === 'industrial') text = `’26년 신규 도입(등급 미산출), 구급 출동 연평균 ${nf(f && f.perYear)}건(${typeName} 평균의 ${ratio(f && f.ratio)})`;
      else if (k === 'suicide') text = `전 지역 공통 필수 선정${kiTxt ? ', ' + kiTxt : ''}`;
      else if (sel) text = `${CRIT_SHORT[ft[k]] || '중점관리분야'}${kiTxt ? ', ' + kiTxt : ''}`;
      else text = '선정기준 미충족' + (!ki ? '' : ki.weak && sev(ki) >= Math.log(1.5) ? `, 단 ${kiTxt}로 관찰 필요` : `, ${kiTxt}`);
      return `<tr${sel ? ' class="rr-focus"' : ''}><th>${L[k]}</th>${k === 'industrial' ? '<td>-</td><td>-</td><td>-</td><td>-</td><td>신규</td>' : g.map((v) => `<td class="rr-n">${v == null ? '-' : v}</td>`).join('')}<td>${esc(text)}</td><td>${condition(si, k)}</td></tr>`;
    }).join('');
    /* 표 1-3 — 중점관리분야만 */
    const rows13 = focus.map((k) => {
      const f = rate ? rate.fields[k] : null; if (!f) return '';
      const y = f.years || {}; const chg = change(y['2023'] || 0, y['2025'] || 0);
      const nb = notable(region, k);
      const diag = f.total < 10 ? `구급 출동 3개년 ${nf(f.total)}건으로 지점 분석 한계`
        : f.ratio == null ? '' : f.ratio >= 1
        ? `구급 발생률이 ${typeName} 평균의 ${ratio(f.ratio)}로 높아 공식통계 기반 선정 근거와 일치`
        : `구급 발생률은 ${typeName} 평균 이하(${ratio(f.ratio)})로 공식통계 기반 선정 근거와 차이, 현장 검증 필요`;
      /* 예시안의 ’22년·분석 자료원 열은 뺌 — 119 자료는 ’23~’25 뿐이고(’22 는 자살 사망지점 자료용), 자료원은 아래 주석에 */
      return `<tr><th>${L[k]}<br><span class="rr-sub-l">(${SUB13[k] || '구급 출동'})</span></th>${['2023', '2024', '2025'].map((yy) => `<td class="rr-n">${nf(y[yy] || 0)}건</td>`).join('')}
        <td class="rr-n">${chgTxt(chg)}</td><td class="rr-n">${nf(f.rate, 1)}건</td><td class="rr-n">${ratio(f.ratio)}<sup>1)</sup></td>
        <td>${esc(diag)}${nb.length ? '; ' + esc(nb.join(', ')) : ''}</td></tr>`;
    }).join('');
    /* 표 1-4 */
    const rows14 = focus.map((k, i) => {
      const f = rate ? rate.fields[k] : null; const y = f ? f.years || {} : {};
      const gradeTxt = k === 'suicide' ? '등급과 무관한 공통 필수 선정 (OECD 대비 높은 자살률)' : CRIT_LONG[ft[k]] || '중점관리분야';
      const facts = [];
      if (f) {
        facts.push(`119 ${k === 'suicide' ? '자해·자살시도' : L[k]} 출동 ’23년 ${nf(y['2023'] || 0)}건 → ’25년 ${nf(y['2025'] || 0)}건(${chgTxt(change(y['2023'] || 0, y['2025'] || 0))}), 인구 10만명당 ${nf(f.rate, 1)}건(${typeName} 평균의 ${ratio(f.ratio)})`);
        const nb = notable(region, k);
        if (f.total < 10) facts.push(`구급 출동 3개년 ${nf(f.total)}건으로 지점 분석 한계`);
        else if (nb.length) facts.push(nb.join(', ') + ' 집중');
        else { const reg = ctx.data && ctx.data.categories && ctx.data.categories[k] ? ctx.data.categories[k].region : null; const pk = reg && reg.hour && reg.hour.peak;
          if (pk) facts.push(`${pk.from}~${pk.to}시 ${pk.share}% 집중`); }
      }
      const weak = weakLines(region, k);
      return `<tr><th>${i + 1}. ${L[k]}</th><td>${esc(gradeTxt)}</td><td>${weak.length ? weak.map((t) => '• ' + esc(t)).join('<br>') : detailYear(region) ? '-' : '<span class="rr-sub-l">AURI 원자료 확인 중</span>'}</td><td>${facts.map((t) => '• ' + esc(t)).join('<br>')}</td></tr>`;
    }).join('');
    return chapter('1. 지역 안전현황 및 중점관리분야 선정', `
      <h3 class="h-section">1.1 진단 목적 및 분석데이터 활용 범위</h3>
      ${para(_common && _common.ch1.purpose, short)}
      ${t11 ? `<table class="tight rr-t"><caption>${esc(t11.caption)}</caption><thead><tr>${t11.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${t11.rows.map((r) => `<tr>${r.map((c, j) => j === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(String(c).replace(/\{지자체\}/g, short))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      <h3 class="h-section">1.2 지역안전지수 등급 및 취약지표 진단</h3>
      ${parts.length ? `<p class="bullet">${esc(short)}의 ${esc(parts.join(', '))}</p>` : ''}
      <table class="tight rr-t"><caption>&lt;표 1-2&gt; 최근 5년간 분야별 지역안전지수 경향성 및 취약 특성</caption>
        <thead><tr><th>분야</th>${YEARS.map((y) => `<th>’${y.slice(2)}년</th>`).join('')}<th>취약 특성 요약(${esc(base)})</th><th>여건*</th></tr></thead><tbody>${rows12}</tbody></table>
      <p class="note-under">*여건 구분: 최우선(취약성 가장 높음), 우선(취약성 높음), 관심(취약성 증가추세), 개선(취약성 하향추세), 필수(국가관리) · 등급: 지역안전지수(1 좋음 ~ 5 나쁨) · 지표 배수: 지역안전지수 핵심지표(’${(detailYear(region) || '2025').slice(2)}) ÷ 같은 유형 평균</p>
      ${detailNote(region) ? `<p class="note-under">${esc(detailNote(region))}</p>` : ''}
      <h3 class="h-section">1.3 안전사고 발생 규모 및 추세 분석</h3>
      <p class="bullet">실제 지역 내에서 안전사고 데이터를 분석하여, 등급의 착시를 보정하고 인명피해가 집중·증가하는 분야를 검증</p>
      <table class="tight rr-t"><caption>&lt;표 1-3&gt; 지역안전지수 취약 분야의 연도별 119사고 출동 건수 추이 및 시군구 평균 대비 비교</caption>
        <thead><tr><th style="width:13%">취약분야</th><th>’23년</th><th>’24년</th><th>’25년</th><th>증감률<br>(’23→’25)</th><th>인구 10만명당<br>(연평균)</th><th>${esc(typeName)}<br>평균대비</th><th>핵심 위험 진단 결과</th></tr></thead><tbody>${rows13}</tbody></table>
      <p class="note-under">※ 자료원: 소방청 119 구급활동자료(’23~’25), 분야별 구급출동 · 1) (구급출동) ’23~’25년 합계 ÷ 3 ÷ 주민등록인구(지역안전지수 산출 인구) × 10만, 41개 대상지 중 동일유형(${esc(typeName)} ${_detail && _detail.rates && _detail.rates.typeAvg[typeName] ? _detail.rates.typeAvg[typeName].n + '개' : ''}) 평균 대비 · 장소·연령 괄호 안 평균 = 같은 유형 평균 · 자살은 119 자해·자살시도 출동 기준(자살 사망지점 자료 미반영)</p>
      <h3 class="h-section">1.4 중점관리분야 최종 선정</h3>
      <p class="bullet">지역안전지수 등급 추이와 실제 사고 데이터 검증을 종합하여 ${esc(name)}${josa(name, '은', '는')} ${focus.map((k) => L[k]).join(', ')} ${focus.length}개 분야를 중점관리분야로 최종 선정</p>
      <table class="tight rr-t"><caption>&lt;표 1-4&gt; 중점관리분야 최종 선정 근거 및 핵심 취약성 요약표</caption>
        <thead><tr><th style="width:12%">중점관리 분야</th><th style="width:22%">지역안전지수 등급 추이</th><th style="width:30%">핵심 부족·취약 지표 (${esc(base)})</th><th>실제 사고 발생 데이터 핵심 위험 특성</th></tr></thead><tbody>${rows14}</tbody></table>`);
  }

  /* ── 2장 ───────────────────────────────────────────────────────── */
  function ch2(ctx) {
    const c = _common && _common.ch2;
    return chapter('2. 공간분석 기반 복합위험지구 도출', `
      <h3 class="h-section">2.1 복합위험지구 도출 방법론</h3>
      ${para(c && c.method, ctx.label)}
      ${c ? `<div class="rr-box"><div class="rr-box-cap">${esc(c.methodBox.caption)}</div>${c.methodBox.items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
      <h3 class="h-section">2.2 복합위험지구 후보지 도출</h3>
      ${wait('<그림 2-1> 안전유형별 위험지역 분포 · <그림 2-2> 중첩도 — AURI(강원대) 그림을 받으면 실립니다')}
      <h3 class="h-section">2.3 후보지역 비교 검토 및 최종 대상지 선정</h3>
      ${wait('<표 2-1> 후보지역 종합 비교 검토표 — AURI 후보지 바운더리를 받으면 후보지별 사고 건수·특성이 자동으로 채워집니다')}`);
  }

  /* ── 3장 ───────────────────────────────────────────────────────── */
  function zoneFacts(c) {
    if (!c) return null;
    const ageTop = Object.entries(c.age.buckets || {}).sort((a, b) => b[1][1] - a[1][1])[0];
    return {
      count: `${nf(c.n)}명${c.events !== c.n ? `(${nf(c.events)}건)` : ''} (${c.share}%)`,
      person: [c.sex.male != null ? `남성 ${nf(c.sex.maleN)}명(${c.sex.male}%)` : null, ageTop ? `${ageTop[0].replace('-', '~')}세 ${ageTop[1][1]}명(${ageTop[1][0]}%)` : null].filter(Boolean).join(' · '),
      time: [c.hour.n ? `22~05시 ${nf(c.hour.nightN)}건(${c.hour.night2205}%)` : null, c.weekday.n ? `금~일 ${nf(c.weekday.friSunN)}건(${c.weekday.friSun}%)` : null].filter(Boolean).join(' · '),
      place: [(c.place.top || []).slice(0, 3).map((p) => `${p[0]} ${p[2]}명`).join('·'), c.repeat && c.repeat.spots2 ? `같은 지번 2회 이상 ${c.repeat.spots2}곳(최대 ${c.repeat.maxAtOneSpot}명)` : null].filter(Boolean).join(' · '),
    };
  }
  function ch3(ctx) {
    const focus = focusOrder(ctx.si);
    const z = _zones;
    let t31 = wait('<표 3-1> 복합위험지구 내 중점관리분야별 사고 데이터 핵심 특성 — AURI 복합위험지구 바운더리를 받으면 채워집니다');
    let t32 = wait('<표 3-2> 사업구역별 위험요인 총괄표 — AURI 세부 구역 바운더리를 받으면 채워집니다');
    if (z) {
      t31 = `<table class="tight rr-t"><caption>&lt;표 3-1&gt; 복합위험지구 내 중점관리분야별 사고 데이터 핵심 특성</caption>
        <thead><tr><th>분야</th><th>사고발생건수 (${esc(ctx.label)} 내 비율)</th><th>인적 특성 (연령대·성별)</th><th>시간 특성 (시간대·요일)</th><th>장소 및 원인 특성 (주요 발생장소·반복성)</th></tr></thead>
        <tbody>${focus.map((k) => { const f = zoneFacts(z.district.categories[k]); return `<tr><th>${L[k]}</th>${f ? `<td>${esc(f.count)}</td><td>${esc(f.person)}</td><td>${esc(f.time)}</td><td>${esc(f.place)}</td>` : '<td colspan="4">복합위험지구 안 출동 없음</td>'}</tr>`; }).join('')}</tbody></table>
        <p class="note-under">※ 119 구급활동자료(’23~’25) · 명 = 출동 기록(환자) 수, 괄호 건 = 같은 일시·장소 묶음 · 비율 = ${esc(ctx.label)} 전체 대비 · 자살은 자해·자살시도 출동</p>`;
      t32 = `<table class="tight rr-t"><caption>&lt;표 3-2&gt; 복합위험지구 내 사업구역별 위험요인 총괄표</caption>
        <thead><tr><th style="width:20%">구역명</th><th>중점관리분야별 사고 특성</th><th style="width:24%">연계 사업</th></tr></thead>
        <tbody>${z.zones.map((zz) => `<tr><th class="rr-wrap">${esc(zz.name)}${zz.areaKm2 ? `<br><span class="h-sub">약 ${nf(zz.areaKm2, 2)}㎢</span>` : ''}</th><td>${focus.map((k) => { const f = zoneFacts(zz.categories[k]); return f ? `<b>[${L[k]}]</b> ${esc(f.count)} · ${esc(f.time)} · ${esc(f.place)}` : ''; }).filter(Boolean).join('<br>') || '중점관리분야 출동 없음'}</td><td><span class="rr-sub-l">3.2 사업 구성 후</span></td></tr>`).join('')}</tbody></table>
        <p class="note-under">※ 지번·업소 단위 반복 지점은 개인정보 원칙상 화면에 싣지 않고 연구진 전달용 파일(구역별 반복 지번 목록)로 드립니다</p>`;
    }
    const before = ctx.beforeUrl, after = ctx.afterUrl;
    return chapter('3. 복합위험지구 심층 안전진단 및 맞춤형 사업 설계', `
      <h3 class="h-section">3.1 복합위험지구 사고 데이터 분석</h3>
      ${wait('<그림 3-1> 복합위험지구 사고지점 상세 지도 — AURI 지도그림을 받으면 실립니다')}
      ${t31}${t32}
      <h3 class="h-section">3.2 구역별 위험요인 진단 및 맞춤형 안전개선사업</h3>
      ${wait('구역별 맞춤형 사업표(사업코드·사업내용·단가×물량) — 220개 사업팔레트 기준 후보 제안·물량 입력 화면을 붙이는 중입니다')}
      ${before || after ? `<div class="ba-stack">${before ? `<figure><img src="${esc(before)}" alt="현장사진"><figcaption>현장사진 (진단 지점)</figcaption></figure>` : ''}${after ? `<figure><img src="${esc(after)}" alt="개선 후 시뮬레이션"><figcaption>개선 후 시뮬레이션</figcaption></figure><div class="ba-disclaimer">${esc(typeof AURI_AI_DISCLAIMER !== 'undefined' ? AURI_AI_DISCLAIMER : '')}</div>` : ''}</div>` : ''}
      <h3 class="h-section">3.3 복합위험지구 맞춤형 안전개선사업 종합도 및 총괄 산출근거표</h3>
      <figure class="doc-map" style="margin:0"><img src="data/overview/${esc(ctx.region)}.jpg" alt="${esc(ctx.label)} 맞춤형 사업 종합도" style="width:100%;display:block"><figcaption>맞춤형 사업 종합도 <span class="h-sub">AURI 사전분석 종합도 기준 — 3장 사업을 확정하면 다시 그림</span></figcaption></figure>`);
  }

  function ch45(ctx) {
    return chapter('4. 복합위험지구 외 ‘위험지구’ 분석 결과', wait('후보지 ②·③ 위험요인 도출표·맞춤형 사업 — AURI 후보지 자료를 받으면 3장과 같은 방식으로 채웁니다'))
      + chapter('5. 복합위험지구 사업추진을 위한 지방정부 거버넌스', `
        <h3 class="h-section">5.1 기존 안전관리계획·유관 사업 검토</h3>${wait('<표 5-1> — AURI 작성 표를 받아 그대로 싣습니다')}
        <h3 class="h-section">5.2 부서 간 협업 거버넌스(TF)</h3>${wait('<표 5-2> — 5.1 표를 받으면 협업TF 작업가이드(산출지표 매핑) 기준으로 초안을 만듭니다')}`);
  }

  /* ── 붙임 — 지역안전지수 산출지표 분석 ─────────────────────────── */
  function appendix(ctx) {
    const years = ['2022', '2023', '2024', '2025'];
    const by = Object.fromEntries(years.map((y) => [y, detailRows(ctx.region, y)]));
    const ly = detailYear(ctx.region), note = detailNote(ctx.region);
    const title = `붙임. 지역안전지수 분야별 산출지표 분석 — ${ctx.label}`;
    if (!ly) return note ? chapter(title, `<p class="note-under">${esc(note)}</p>`) : '';
    const rate = rateOf(ctx.region);
    const tables = ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection'].map((k) => {
      const rows = by[ly].filter((x) => x.field === k && x.kind !== '환산');
      return `<h3 class="h-section">${L[k]}</h3><table class="tight rr-t" style="table-layout:fixed"><thead><tr><th style="width:8%">지표분류</th><th>지표명</th><th style="width:13%">단위</th>${years.map((y) => `<th style="width:8.5%">’${y.slice(2)}</th>`).join('')}<th style="width:12%">${esc(rate ? rate.type : '동일유형')} 평균(’${ly.slice(2)})</th><th style="width:10%">평균 대비</th></tr></thead>
        <tbody>${rows.map((x) => { const past = years.map((y) => { const r = by[y].find((o) => o.field === k && o.name === x.name); return r ? r.value : null; });
          return `<tr${x.weak ? ' class="rr-weak"' : ''}><td>${esc(x.kind)}</td><td>${esc(x.name)}</td><td>${esc((x.base ? x.base + ' ' : '') + x.unit)}</td>${past.map((v) => `<td class="rr-n">${nf(v, 2)}</td>`).join('')}<td class="rr-n">${nf(x.avgType, 2)}</td><td class="rr-n">${x.ratio == null ? '-' : ratio(x.ratio) + (x.weak ? ' ⚠' : '')}</td></tr>`; }).join('')}</tbody></table>`;
    }).join('');
    return chapter(title, `
      <p class="bullet">지역안전지수 핵심지표(행정안전부·국립재난안전연구원)를 같은 유형 지자체 평균과 비교 — ⚠ 는 평균보다 나쁜 쪽(위해·취약은 높을수록, 경감·의식은 낮을수록)</p>${tables}
      <p class="note-under">※ 자료: AURI 제공 「안전진단 시스템」 지자체별 핵심지표(2022~2025) · 지표명은 연도별 산출지표 설명자료 표기 그대로</p>
      ${note ? `<p class="note-under">${esc(note)}</p>` : ''}`);
  }

  function render(ctx) {
    const now = new Date();
    const cover = `<section class="cover"><div class="kicker">안전사업지구 사업모델 개발 연구용역</div><h1>지역 안전진단 결과 보고서(안)</h1><div class="rule"></div>
      <p class="region">— ${esc(ctx.label)} —</p><div class="meta">${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, '0')}.<br>건축공간연구원 · Atelier KJ</div></section>`;
    return cover + summary(ctx) + ch1(ctx) + ch2(ctx) + ch3(ctx) + ch45(ctx) + appendix(ctx);
  }
  return { load, render, zones: () => _zones };
})();
