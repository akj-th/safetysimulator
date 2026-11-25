/* ════════════════════════════════════════════════════════════════════
   「지역 안전진단 결과 보고서(안)」 탭 — AURI 예시안(관악·남원·정읍, 2026-11-18 김가은) 목차 그대로 (2026-11-20 착수)

   장마다 채우는 방법
     요약 · 1장  자료로 자동 — 지역안전지수 5개년 등급(safety-index.json) · 세부지표(safety-detail.json) ·
                119 출동 연도별·인구 10만명당·동일유형 평균 대비(safety-detail.json rates) · 문장은 규칙으로 조립
     2장        공통 문구(report-common.json) + AURI 그림(분포도·중첩도) 자리 + 선정 문장(지구 안 비율) + 후보지 비교표(바운더리를 받으면)
     3장        복합위험지구 사고 특성(data/stats/zones/<지역>.json — tools/build-zone-stats.mjs, AURI 최종 경계 41곳 11/23) ·
                표 3-2 구역별은 세부 구역 SHP 를 받으면 · 종합도 · 현장사진·개선 후 시뮬레이션
     자살       사망지점(’22~’24, AURI 11/23) — 표 1-2·1-3·1-4(safety-detail.json rates.regions.<slug>.suicideDeath) · 표 3-1(zones deaths)
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
  let _detail = null, _common = null, _zones = null, _council = null, _palette = null;
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
    [_detail, _common, _zones, _council, _palette] = await Promise.all([
      _detail || getJson('data/stats/safety-detail.json'),
      _common || getJson('assets/report-common.json'),
      getJson('data/stats/zones/' + region + '.json'),     // 없으면 null — AURI 바운더리를 받은 지자체만
      getJson('data/stats/council/' + region + '.json'),   // 1차 지역협의체 의견(이음 3.2 파트, build-council.mjs) — 24곳
      _palette || getJson('assets/palette-v4.json'),        // 7대 안전유형 맞춤형 사업팔레트 v4(’26.11.24, 280개 단위사업 — build-palette-v4.mjs)
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
  /* 자살 사망지점(’22~’24, AURI 11/23) — build-safety-detail.mjs rates.regions.<slug>.suicideDeath */
  const deathOf = (region) => { const r = rateOf(region); return r && r.suicideDeath && r.suicideDeath.total ? r.suicideDeath : null; };
  /* 사망 진단 문장 — 예시안 "사망률 동일유형 시군구평균 하회(0.84배), 주택 내 사망 68.1%, 대학동·신림동 17.6% 집중" */
  function deathDiag(d) {
    if (d.total < 10) return [`자살 사망 3개년 ${nf(d.total)}명으로 지점 분석 한계`];
    const home = (d.place || []).find((p) => p[0] === '주택');
    return [d.ratio == null ? null : `사망률 동일유형 시군구평균 ${d.ratio >= 1 ? '상회' : '하회'}(${ratio(d.ratio)})`,
      home ? `주택 내 사망 ${pct1(home[1])}` : null,
      d.top2 ? `${d.top2.names.join('·')} ${pct1(d.top2.share)} 집중` : null].filter(Boolean);
  }
  /* 지자체 단위 이름 — "구 전체의 34.4%" */
  const unitOf = (label) => /구$/.test(label) ? '구' : /군$/.test(label) ? '군' : '시';
  /* 복합위험지구 안에 모인 중점분야 비율 — 예시안 2.3 "범죄 사고가 구 전체의 34.4%, 감염병 출동 19.7%, 자살 사망 15.4%가 집중" */
  function districtShares(z, focus) {
    return focus.map((k) => {
      if (k === 'suicide' && z.district.deaths && z.district.deaths.n) return `자살 사망 ${pct1(z.district.deaths.share)}`;
      const c = z.district.categories[k]; return c && c.n ? `${L[k]} ${pct1(c.share)}` : null;
    }).filter(Boolean);
  }
  const districtLabel = (z) => z.district.name || z.district.place || '복합위험지구';
  /* 비율이 모두 10% 미만이면 "집중" 대신 "발생" (장수 천천면 교통 3.1% 등 — 지구가 산재·다른 분야로 잡힌 곳) */
  const concentrated = (z, focus) => focus.some((k) => { const v = k === 'suicide' && z.district.deaths && z.district.deaths.n ? z.district.deaths.share : (z.district.categories[k] || {}).share; return v >= 10; });
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
      ${z ? `<p class="bullet"><span class="tag">(복합위험지구)</span> ${esc(districtLabel(z))}${z.district.areaKm2 ? `(약 ${nf(z.district.areaKm2, 1)}㎢)` : ''}${districtShares(z, focus).length ? `에 ${esc(unitOf(ctx.label))} 전체의 ${esc(districtShares(z, focus).join(', '))} ${concentrated(z, focus) ? '집중' : '발생'}` : ''}${z.zones.length ? ` · 사업구역 ${z.zones.length}곳` : ''} — 사고 특성은 본문 3.1</p>` : wait('복합위험지구 위치·구역별 위험요인 — AURI 복합위험지구 바운더리를 받으면 채워집니다')}
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
      else if (k === 'suicide') { const d = deathOf(region); text = `전 지역 공통 필수 선정${d && d.ratio != null ? `, 자살 사망률 동일유형 평균의 ${ratio(d.ratio)}` : kiTxt ? ', ' + kiTxt : ''}`; }
      else if (sel) text = `${CRIT_SHORT[ft[k]] || '중점관리분야'}${kiTxt ? ', ' + kiTxt : ''}`;
      else text = '선정기준 미충족' + (!ki ? '' : ki.weak && sev(ki) >= Math.log(1.5) ? `, 단 ${kiTxt}로 관찰 필요` : `, ${kiTxt}`);
      return `<tr${sel ? ' class="rr-focus"' : ''}><th>${L[k]}</th>${k === 'industrial' ? '<td>-</td><td>-</td><td>-</td><td>-</td><td>신규</td>' : g.map((v) => `<td class="rr-n">${v == null ? '-' : v}</td>`).join('')}<td>${esc(text)}</td><td>${condition(si, k)}</td></tr>`;
    }).join('');
    /* 표 1-3 — 중점관리분야만 */
    const death = deathOf(region);
    const rows13 = focus.map((k) => {
      const f = rate ? rate.fields[k] : null; if (!f) return '';
      const y = f.years || {}; const chg = change(y['2023'] || 0, y['2025'] || 0);
      /* 자살 — 사망지점(’22~’24) + 119 자해·자살시도(’23~’25) 한 줄 (예시안 "사망 93명 | 사망 115명 (시도 30건) | … | 시도 35건") */
      if (k === 'suicide' && death) {
        const dy = death.years, at = (yy) => y[yy] || 0;
        const cell = (yy) => [dy[yy] != null ? `사망 ${nf(dy[yy])}명` : null, yy >= '2023' ? (dy[yy] != null ? `(시도 ${nf(at(yy))}건)` : `시도 ${nf(at(yy))}건`) : null].filter(Boolean).join('<br>');
        return `<tr><th>${L[k]}<br><span class="rr-sub-l">(사망/시도)</span></th>${['2022', '2023', '2024', '2025'].map((yy) => `<td class="rr-n">${cell(yy)}</td>`).join('')}
          <td class="rr-n">사망 ${chgTxt(change(dy['2022'], dy['2024']))}<br><span class="rr-sub-l">(’22→’24)</span><br>(시도 ${chgTxt(chg)})</td><td class="rr-n">사망 ${nf(death.rate, 1)}명</td><td class="rr-n">${ratio(death.ratio)}<sup>2)</sup></td>
          <td>${esc(deathDiag(death).join(', '))}</td></tr>`;
      }
      const nb = notable(region, k);
      const diag = f.total < 10 ? `구급 출동 3개년 ${nf(f.total)}건으로 지점 분석 한계`
        : f.ratio == null ? '' : f.ratio >= 1
        ? `구급 발생률이 ${typeName} 평균의 ${ratio(f.ratio)}로 높아 공식통계 기반 선정 근거와 일치`
        : `구급 발생률은 ${typeName} 평균 이하(${ratio(f.ratio)})로 공식통계 기반 선정 근거와 차이, 현장 검증 필요`;
      /* 예시안의 분석 자료원 열은 뺌(아래 주석에) · ’22 열은 자살 사망지점용 — 119 는 ’23~’25 뿐이라 "-" */
      return `<tr><th>${L[k]}<br><span class="rr-sub-l">(${SUB13[k] || '구급 출동'})</span></th><td class="rr-n">-</td>${['2023', '2024', '2025'].map((yy) => `<td class="rr-n">${nf(y[yy] || 0)}건</td>`).join('')}
        <td class="rr-n">${chgTxt(chg)}</td><td class="rr-n">${nf(f.rate, 1)}건</td><td class="rr-n">${ratio(f.ratio)}<sup>1)</sup></td>
        <td>${esc(diag)}${nb.length ? '; ' + esc(nb.join(', ')) : ''}</td></tr>`;
    }).join('');
    /* 표 1-4 */
    const rows14 = focus.map((k, i) => {
      const f = rate ? rate.fields[k] : null; const y = f ? f.years || {} : {};
      const gradeTxt = k === 'suicide' ? '등급과 무관한 공통 필수 선정 (OECD 대비 높은 자살률)' : CRIT_LONG[ft[k]] || '중점관리분야';
      const facts = [];
      /* 자살 — 예시안 "자살 사망 ’22년 93명 → ’24년 127명(+36.6%), 자해·자살시도 출동 ’23년 30건 → ’25년 35건 / 사망 335명 중 주택 68.1%로 주거지 중심, 대학동·신림동(17.6%) 집중, 산·하천·교량 12.5%" */
      if (k === 'suicide' && death) {
        const dy = death.years;
        facts.push(`자살 사망 ’22년 ${nf(dy['2022'])}명 → ’24년 ${nf(dy['2024'])}명(${chgTxt(change(dy['2022'], dy['2024']))}), 인구 10만명당 ${nf(death.rate, 1)}명(동일유형 평균의 ${ratio(death.ratio)})` + (f ? `, 자해·자살시도 출동 ’23년 ${nf(y['2023'] || 0)}건 → ’25년 ${nf(y['2025'] || 0)}건` : ''));
        if (death.total < 10) facts.push(`자살 사망 3개년 ${nf(death.total)}명으로 지점 분석 한계`);
        else { const home = (death.place || []).find((p) => p[0] === '주택');
          facts.push([`사망 ${nf(death.total)}명 중 ${home ? `주택 ${pct1(home[1])}` : `${death.place[0][0]} ${pct1(death.place[0][1])}`}`, death.top2 ? `${death.top2.names.join('·')}(${pct1(death.top2.share)}) 집중` : null,
            death.outdoor && death.outdoor.share >= 5 ? `산·하천·교량 ${pct1(death.outdoor.share)}` : null].filter(Boolean).join(', ')); }
      } else if (f) {
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
        <thead><tr><th style="width:11%">취약분야</th><th>’22년</th><th>’23년</th><th>’24년</th><th>’25년</th><th>증감률<br>(’23→’25)</th><th>인구 10만명당<br>(연평균)</th><th>${esc(typeName)}<br>평균대비</th><th>핵심 위험 진단 결과</th></tr></thead><tbody>${rows13}</tbody></table>
      <p class="note-under">※ 자료원: 소방청 119 구급활동자료(’23~’25), 분야별 구급출동${death ? ' · 자살 사망지점 자료(’22~’24)' : ''} · 1) (구급출동) ’23~’25년 합계 ÷ 3 ÷ 주민등록인구(지역안전지수 산출 인구) × 10만, 41개 대상지 중 동일유형(${esc(typeName)} ${_detail && _detail.rates && _detail.rates.typeAvg[typeName] ? _detail.rates.typeAvg[typeName].n + '개' : ''}) 평균 대비 · 장소·연령 괄호 안 평균 = 같은 유형 평균${death ? ' · 2) (자살) 사망은 자살 사망지점 자료(’22~’24년) 합계 ÷ 3 ÷ 같은 인구 × 10만, 진단리포트 ’25년 동일유형 시군구평균(인구 만명당 × 10) 대비 / 시도는 119 자해·자살시도 출동(’23~’25년)' : ' · 자살은 119 자해·자살시도 출동 기준'}</p>
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
      ${selectSentence(ctx)}
      ${table21(ctx)}`);
  }
  /* 후보지 ②③ — AURI 4장 후보지 위치도 PPT 도형(build-ppt-zones → build-zone-stats candidates) */
  const candsOf = () => (_zones && _zones.candidates) || [];
  const areaTxt = (o) => o.areaNote ? `약 ${nf(o.areaNote, 1)}㎢` : o.areaKm2 ? `약 ${nf(o.areaKm2, 1)}㎢` : '';
  /* 중점분야가 지구·후보지 안에 있는지(자살은 사망 또는 시도) */
  const hasField = (o, k) => k === 'suicide' ? !!((o.deaths && o.deaths.n) || (o.categories.suicide && o.categories.suicide.n)) : !!(o.categories[k] && o.categories[k].n);
  function overlapTxt(o, focus) {
    const ins = focus.filter((k) => hasField(o, k));
    return ins.length === focus.length ? `${focus.length}개 중점분야 모두 중첩<br>(${focus.map((k) => L[k]).join('+')})` : `${focus.length}개 중 ${ins.length}개 중첩<br>(${ins.map((k) => L[k]).join('+') || '없음'})`;
  }
  /* 중점분야 사고 건수 — 예시안 "• 감염병: 14건 (관악구 전체 71건 중)" */
  function countLines(o, focus, label) {
    const tot = (_zones && _zones.regionTotals) || {};
    return focus.map((k) => {
      if (k === 'suicide') {
        const d = o.deaths, c = o.categories.suicide;
        return `• 자살: 사망 ${nf(d ? d.n : 0)}명${tot.suicideDeath ? ` (전체 ${nf(tot.suicideDeath.n)}명 중)` : ''} · 시도 ${nf(c ? c.n : 0)}건${tot.suicide ? ` (전체 ${nf(tot.suicide.n)}건 중)` : ''}`;
      }
      const c = o.categories[k];
      return `• ${L[k]}: ${nf(c ? c.n : 0)}${k === 'crime' ? '명' : '건'} (${esc(String(label).split(' ').pop())} 전체 ${nf(tot[k] ? tot[k].n : 0)}${k === 'crime' ? '명' : '건'} 중)`;
    }).join('<br>');
  }
  function density(o, focus) {
    const n = focus.reduce((s, k) => s + (k === 'suicide' ? ((o.deaths && o.deaths.n) || 0) + ((o.categories.suicide && o.categories.suicide.n) || 0) : (o.categories[k] && o.categories[k].n) || 0), 0);
    const a = o.areaKm2 || o.areaNote;
    return `${nf(n)}건${a ? ` · ㎢당 ${nf(n / a, 1)}건` : ''}`;
  }
  function table21(ctx) {
    const z = _zones, cs = candsOf();
    if (!z || !cs.length) return wait('<표 2-1> 후보지역 종합 비교 검토표 — AURI 후보지 위치도(PPT 도형)를 좌표로 옮기면 후보지별 사고 건수가 자동으로 채워집니다');
    const focus = focusOrder(ctx.si);
    const cols = [{ head: `① (최종 선정)<br>${esc(districtLabel(z))}`, o: { ...z.district, areaNote: null } }, ...cs.map((c) => ({ head: esc(c.name), o: { ...c, place: c.name.slice(1).trim() } }))];   // 후보지 위치 = AURI 가 붙인 이름
    const row = (h, f) => `<tr><th>${h}</th>${cols.map((c) => `<td>${f(c.o)}</td>`).join('')}</tr>`;
    /* PPT 도형이 바다 위에 놓인 후보지(옹진 ②, build-zone-stats warn) — 0건으로 보이지 않게 */
    const chk = (f) => (o) => o.warn ? '<span class="rr-sub-l">위치 확인 중(AURI)</span>' : f(o);
    return `<table class="tight rr-t"><caption>&lt;표 2-1&gt; 복합위험지구 후보지역(①~${'①②③④⑤'[cs.length]}) 종합 비교 검토표</caption>
      <thead><tr><th style="width:13%">구분</th>${cols.map((c) => `<th>${c.head}</th>`).join('')}</tr></thead>
      <tbody>${row('위치 및 면적', (o) => `${esc(o.place || '-')}${areaTxt(o) ? ` (${areaTxt(o)})` : ''}`)}
        ${row('중점관리분야', chk((o) => overlapTxt(o, focus)))}
        ${row('중점분야 사고 건수', chk((o) => countLines(o, focus, ctx.label)))}
        ${row('중점분야 사고 합계·밀도', chk((o) => density(o, focus)))}
        ${row('주요 공간·위험 특성', () => '<span class="rr-sub-l">연구진 작성</span>')}</tbody></table>
      <p class="note-under">※ 후보지 경계: AURI 4장 후보지 위치도(PPT 도형, 이예린 ’26.11.23)를 지도 좌표로 옮겨 집계(PPT 도형이라 경계 부근 수 건 차이 가능) · 위치 = 면적 20% 이상 걸친 행정동 · 119 구급출동(’23~’25)·자살 사망(’22~’24) · 자살 시도 = 119 자해·자살시도 출동 · 나머지 후보지는 본문 4장</p>`;
  }
  /* 2.3 선정 문장 — 예시안 "3개 중점분야(범죄·자살·감염병)가 모두 중첩되고 범죄 사고가 구 전체의 34.4%, 감염병 출동 19.7%, 자살 사망 15.4%가 집중되어 … 복합위험지구로 선정" */
  function selectSentence(ctx) {
    const z = _zones; if (!z) return '';
    const focus = focusOrder(ctx.si);
    const inside = focus.filter((k) => k === 'suicide' ? (z.district.deaths && z.district.deaths.n) || (z.district.categories.suicide && z.district.categories.suicide.n) : z.district.categories[k] && z.district.categories[k].n);
    const shares = districtShares(z, focus);
    const nm = `${focus.length}개 중점분야(${focus.map((k) => L[k]).join('·')})`;
    const overlap = inside.length === focus.length ? `${nm}가 모두 중첩되고` : `${nm} 중 ${inside.length}개(${inside.map((k) => L[k]).join('·')})가 중첩되고`;
    return `<p class="bullet rr-sub">${esc(overlap)} ${esc(unitOf(ctx.label))} 전체 대비 ${esc(shares.join(', '))}${shares.length ? josa(shares[shares.length - 1], '이', '가') : ''} ${concentrated(z, focus) ? '집중되어' : '발생하여'}, ‘${esc(districtLabel(z))}’${z.district.areaKm2 ? `(약 ${nf(z.district.areaKm2, 1)}㎢)` : ''}${josa(districtLabel(z), '을', '를')} 복합위험지구로 선정</p>
      <p class="note-under">※ 복합위험지구 경계: AURI 최종안(${esc(z.source || '')}) · 비율 = 복합위험지구 안 119 구급출동(’23~’25)·자살 사망(’22~’24) ÷ ${esc(ctx.label)} 전체${z.district.name ? '' : ' · 지구 이름은 걸친 행정동(면적 20% 이상)으로 적음'}</p>`;
  }

  /* ── 3장 ───────────────────────────────────────────────────────── */
  function zoneFacts(c, d) {
    if (!c && !(d && d.n)) return null;
    const ageTop = c ? Object.entries(c.age.buckets || {}).sort((a, b) => b[1][1] - a[1][1])[0] : null;
    const f = c ? {
      count: `${nf(c.n)}명${c.events !== c.n ? `(${nf(c.events)}건)` : ''} (${pct1(c.share)})`,
      person: [c.sex.male != null && c.sex.n ? (c.sex.male >= 50 ? `남성 ${nf(c.sex.maleN)}명(${c.sex.male}%)` : `여성 ${nf(c.sex.n - c.sex.maleN)}명(${+(100 - c.sex.male).toFixed(1)}%)`) : null, ageTop ? `${ageTop[0] === '80+' ? '80세 이상' : ageTop[0].replace('-', '~') + '세'} ${ageTop[1][1]}명(${ageTop[1][0]}%)` : null].filter(Boolean).join(' · '),
      time: [c.hour.n ? `22~05시 ${nf(c.hour.nightN)}건(${c.hour.night2205}%)` : null, c.weekday.n ? `금~일 ${nf(c.weekday.friSunN)}건(${c.weekday.friSun}%)` : null].filter(Boolean).join(' · '),
      place: [(c.place.top || []).slice(0, 3).map((p) => `${p[0]} ${p[2]}명`).join('·'), c.repeat && c.repeat.spots2 ? `같은 지번 2회 이상 ${c.repeat.spots2}곳(최대 ${c.repeat.maxAtOneSpot}명)` : null].filter(Boolean).join(' · '),
    } : { count: '', person: '', time: '', place: '' };
    if (!(d && d.n)) return f;
    /* 자살 — 사망지점(’22~’24) + 출동(자해·자살시도). 예시안 "사망 22명 (29.7%) 시도 6건 (26.1%)" · "사망 ’22년 8명, ’23년 8명, ’24년 6명" · "22명 모두 주택 내부 …"
       같은 건물·단지 반복은 개소 수만(건물명은 연구진 전달용 파일에) */
    const dPlace = d.place.slice(0, 3).map((p) => `${p[0]} ${p[2]}명`).join('·');
    return {
      count: `사망 ${nf(d.n)}명 (${pct1(d.share)})${c ? ` · 시도 ${nf(c.n)}건 (${pct1(c.share)})` : ''}`,
      person: c && f.person ? `(시도) ${f.person}` : '(사망지점 자료에 연령·성별 없음)',
      time: [`사망 ${['2022', '2023', '2024'].map((y) => `’${y.slice(2)} ${nf(d.years[y] || 0)}명`).join('·')}`, c && f.time ? `(시도) ${f.time}` : null].filter(Boolean).join(' · '),
      place: [`(사망) ${dPlace}${d.repeat && d.repeat.spots ? ` · 같은 건물·단지 2명 이상 ${d.repeat.spots}곳(최대 ${d.repeat.max}명)` : ''}`, c && f.place ? `(시도) ${f.place}` : null].filter(Boolean).join(' · '),
    };
  }
  const zfacts = (cats, deaths, k) => zoneFacts(cats[k], k === 'suicide' ? deaths : null);
  /* 지역협의체가 중점관리분야 밖에서 추가로 요청한 분야(표의 "(현장 추가)" 줄·사전질의서) — AURI 11/24: 건수 집계·현황 분석은 중점분야 기준, 추가 분야는 사업에만 */
  const extraFields = () => (_council && _council.extraFieldKeys) || [];
  /* 구역 사업 분야 = 구역 안에 사고가 있는 중점관리분야 + 지역협의체 추가 요청 분야 */
  const zoneFields = (zz, focus) => focus.filter((k) => hasField(zz, k)).concat(extraFields().filter((k) => !focus.includes(k)));
  /* 3.2 — 1차 지역협의체 의견수렴 및 현장조사 결과(이음 작성 2차 사전진단서 3.2 파트 그대로, build-council.mjs) */
  function council32(ctx) {
    const c = _council;
    if (!c) return `<h3 class="h-section">3.2 1차 지역협의체 의견수렴 및 현장조사 결과</h3>${wait('지역협의체 의견수렴 결과 — 이음 2차 사전진단서(3.2 파트)를 받은 24곳만 실립니다')}`;
    const cell = (arr) => (arr || []).map((t) => `<div>${esc(/^[•※\-(]/.test(t) ? t : '• ' + t)}</div>`).join('');
    const ex = extraFields().filter((k) => !(c.focus || []).includes(k));
    return `<h3 class="h-section">3.2 1차 지역협의체 의견수렴 및 현장조사 결과</h3>
      ${(c.intro || []).map((t) => `<p class="bullet${/^-/.test(t) ? ' rr-sub' : ''}">${esc(t.replace(/^[-○]\s*/, ''))}</p>`).join('')}
      <table class="tight rr-t"><caption>&lt;표 3-3&gt; 지역협의체 의견수렴 및 현장 위험요인 발굴 결과</caption>
        <thead><tr><th style="width:10%">구분</th><th style="width:12%">참여 주체</th><th style="width:28%">사전 데이터 분석 내용</th><th>현장조사 및 인터뷰를 통해 추가 발굴·확인된 핵심 위험요인</th></tr></thead>
        <tbody>${c.table.rows.map((r) => `<tr><th class="rr-wrap">${esc(r.fieldLabel)}</th><td>${esc(r.who || '')}</td><td>${cell(r.data)}</td><td>${cell(r.found)}</td></tr>`).join('')}</tbody></table>
      ${ex.length ? `<p class="bullet"><span class="tag">(추가 요청 분야)</span> 지역협의체가 중점관리분야 외에 ${esc(ex.map((k) => L[k]).join('·'))} 관리를 요청 → 3.3 구역별 맞춤형 사업에 해당 분야 사업을 함께 담음(사고 건수 집계·현황 분석은 중점관리분야 기준)</p>` : ''}
      <p class="note-under">※ 자료: 「2차 사전진단서(3.2 파트)」(이음 작성, AURI ’26.11.24 송부) 원문 그대로 · 지역협의체는 1차 현장조사 당시 조사지를 기준으로 진행되어, 최종 복합위험지구와 위치가 다른 의견은 분야만 사업에 반영</p>`;
  }
  /* 3.3 — 구역마다 장소별 위험요인(데이터) · 사업 분야 · 사업 후보(사업팔레트 v4) */
  function zones33(ctx) {
    const z = _zones, focus = focusOrder(ctx.si);
    if (!z || !z.zones.length) return wait('구역별 맞춤형 사업 — AURI 사업구역 위치도(PPT 도형)를 좌표로 옮기면 구역별로 채워집니다');
    const ex = extraFields().filter((k) => !focus.includes(k));
    return z.zones.map((zz, i) => {
      const ins = focus.filter((k) => hasField(zz, k)), fields = zoneFields(zz, focus);
      const risk = ins.map((k) => { const f = zfacts(zz.categories, zz.deaths, k); return f ? `<p class="bullet rr-sub">[${L[k]}] ${esc([f.count, f.time, f.place].filter(Boolean).join(' · '))}</p>` : ''; }).join('');
      return `<p class="bullet"><span class="tag">[${esc(zz.name.replace(/^구역\s*/, '구역 '))}]</span> ※ ${esc(ins.map((k) => L[k]).join('×') || '중점관리분야 사고 없음')}${ex.length ? ` + 지역협의체 추가 ${esc(ex.map((k) => L[k]).join('·'))}` : ''}${zz.areaKm2 ? ` · 약 ${nf(zz.areaKm2, 2)}㎢` : ''}</p>
        <p class="bullet rr-sub"><span class="tag">(장소별 위험요인 — 데이터)</span></p>${risk || '<p class="bullet rr-sub">구역 안 중점관리분야 사고 없음</p>'}
        ${projectTable(zz, fields, i + 1)}`;
    }).join('') + `<p class="note-under">※ 사업구역 경계: AURI 사업구역 위치도(PPT 도형, 이예린 ’26.11.24)를 지도 좌표로 옮겨 집계 · 사업 후보 = 7대 안전유형 맞춤형 사업팔레트 v4(’26.11.24) 중 구역 분야·공간유형에 맞는 단위사업(규칙으로 고름 — 최종 사업·물량은 연구진 선정)</p>`;
  }
  /* 구역 사업 후보표 — 사업팔레트 v4(_palette). 고르는 규칙(AI 아님):
       분야 = 구역 안에 사고가 있는 중점관리분야 + 지역협의체 추가 요청 분야
       공간유형 = AURI 사업구역 유형(PPT "① 주거생활형(…)")이 팔레트 카드 공간유형에 들어 있는 단위사업 — 없으면 지역관리·네트워크형
       순서 = 확인 사례 단가가 있는 사업 먼저, 그다음 팔레트 코드 순 · 분야마다 3개까지 싣고 나머지는 "외 N종" — 사업 선정·물량은 연구진 */
  const SPACE_ALIAS = { '산업시설형': '산업·사업장형' };
  const won = (v) => v >= 1e8 ? `${+(v / 1e8).toFixed(1)}억` : `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
  const wonRange = (r) => !r ? '-' : r.min === r.max ? won(r.min) + ' 원' : `${won(r.min)}~${won(r.max)} 원`;
  const PER_FIELD = 3;
  function pickProjects(field, type) {
    const items = ((_palette && _palette.items) || []).filter((it) => it.field === field);
    const want = SPACE_ALIAS[type] || type;
    let list = want ? items.filter((it) => (it.spaceTypes || []).includes(want)) : [];
    let basis = want ? `공간유형 ${want}` : '';
    if (!list.length) { list = items.filter((it) => (it.spaceTypes || []).includes('지역관리·네트워크형')); basis = '지역관리·네트워크형'; }
    list = list.slice().sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0) || a.code.localeCompare(b.code));
    return { shown: list.slice(0, PER_FIELD), rest: list.length - Math.min(list.length, PER_FIELD), basis };
  }
  function projectTable(zz, fields, n) {
    if (!_palette || !_palette.items) return wait('구역별 사업 후보(사업코드·사업명·단가) — 사업팔레트 v4 를 불러오지 못했습니다');
    const ex = extraFields();
    const rows = [], rest = [];
    for (const k of fields) {
      const p = pickProjects(k, zz.type);
      if (p.rest) rest.push(`${L[k]} ${p.rest}종`);
      p.shown.forEach((it, j) => {
        const c1 = (it.cases || [])[0];
        rows.push(`<tr>${j === 0 ? `<th rowspan="${p.shown.length}" class="rr-wrap">${L[k]}${ex.includes(k) ? '<br><span class="h-sub">지역협의체 요청</span>' : ''}</th>` : ''}<td style="white-space:nowrap">${esc(it.code)}</td><td class="rr-wrap">${esc(it.name)}${it.confirmed ? '' : ' <span class="h-sub">(단가 추정)</span>'}</td><td>${esc([it.spaceUnit, it.kind].filter(Boolean).join(' · '))}</td><td class="rr-n">${esc(it.unitCostText || '-')}</td><td class="rr-n">${esc(wonRange(it.totals && it.totals['1']))}${c1 && c1.label ? `<br><span class="h-sub">${esc(c1.label)}</span>` : ''}</td><td></td><td></td></tr>`);
      });
      if (!p.shown.length) rows.push(`<tr><th>${L[k]}</th><td colspan="7">팔레트에 맞는 단위사업 없음</td></tr>`);
    }
    return `<table class="tight rr-t" style="table-layout:fixed"><caption>&lt;표 3-${3 + n}&gt; ${esc(zz.name)} 맞춤형 사업 후보(사업팔레트 v4)</caption>
      <thead><tr><th style="width:10%">분야</th><th style="width:10%">사업코드</th><th>단위사업</th><th style="width:9%">공간단위·구분</th><th style="width:15%">설치 단가</th><th style="width:18%">① 기본 여건 사업비(예시 물량)</th><th style="width:6%">물량</th><th style="width:7%">사업비</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>
      <p class="note-under">※ 공간유형 ${esc(SPACE_ALIAS[zz.type] || zz.type || '-')} 기준 · 분야마다 확인 사례 단가가 있는 사업 먼저 3개${rest.length ? ` — 같은 조건의 다른 후보: ${esc(rest.join(', '))}` : ''} · 물량·사업비는 연구진 선정 뒤 기입 · 설치 단가 = 카드 단가(확인 사례 또는 추정) · ① 기본 여건 = 카드의 예시 물량 총사업비(선행·부대 포함, ②·③ 여건은 카드 참고)</p>`;
  }
  function ch3(ctx) {
    const focus = focusOrder(ctx.si);
    const z = _zones;
    let t31 = wait('<표 3-1> 복합위험지구 내 중점관리분야별 사고 데이터 핵심 특성 — AURI 복합위험지구 바운더리를 받으면 채워집니다');
    let t32 = wait('<표 3-2> 사업구역별 위험요인 총괄표 — AURI 세부 구역(구역 ❶❷ · 단일 ①) 바운더리를 받으면 채워집니다');
    if (z) {
      const tot = z.regionTotals || {};
      const totTxt = focus.map((k) => k === 'suicide' ? [tot.suicideDeath ? `자살 사망 ${nf(tot.suicideDeath.n)}명` : null, tot.suicide ? `자살 시도 ${nf(tot.suicide.n)}건` : null].filter(Boolean).join('·') : tot[k] ? `${L[k]} ${nf(tot[k].n)}명` : null).filter(Boolean).join(', ');
      t31 = `<table class="tight rr-t"><caption>&lt;표 3-1&gt; 복합위험지구 내 중점관리분야별 사고 데이터 핵심 특성</caption>
        <thead><tr><th style="width:9%">분야</th><th style="width:17%">사고발생건수 (${esc(ctx.label)} 내 비율)</th><th>인적 특성 (연령대·성별)</th><th>시간 특성 (시간대·요일)</th><th>장소 및 원인 특성 (주요 발생장소·반복성)</th></tr></thead>
        <tbody>${focus.map((k) => { const f = zfacts(z.district.categories, z.district.deaths, k); return `<tr><th>${L[k]}</th>${f ? `<td>${esc(f.count)}</td><td>${esc(f.person)}</td><td>${esc(f.time)}</td><td>${esc(f.place)}</td>` : '<td colspan="4">복합위험지구 안 출동 없음</td>'}</tr>`; }).join('')}</tbody></table>
        <p class="note-under">※ 119 구급활동자료(’23~’25)${z.district.deaths ? ', (자살 사망) 자살 사망지점 자료(’22~’24)' : ''} · 명 = 출동 기록(환자) 수, 괄호 건 = 같은 일시·장소 묶음 · 자살 시도 = 119 자해·자살시도 출동 · 비율 = ${esc(ctx.label)} 전체 대비${totTxt ? `(${esc(totTxt)})` : ''}</p>`;
      if (z.zones.length) t32 = `<table class="tight rr-t"><caption>&lt;표 3-2&gt; 복합위험지구 내 사업구역별 위험요인 총괄표</caption>
        <thead><tr><th style="width:20%">구역명</th><th>중점관리분야별 사고 특성</th><th style="width:24%">연계 사업</th></tr></thead>
        <tbody>${z.zones.map((zz) => `<tr><th class="rr-wrap">${esc(zz.name)}${zz.areaKm2 ? `<br><span class="h-sub">약 ${nf(zz.areaKm2, 2)}㎢</span>` : ''}</th><td>${focus.map((k) => { const f = zfacts(zz.categories, zz.deaths, k); return f ? `<b>[${L[k]}]</b> ${esc(f.count)} · ${esc(f.time)} · ${esc(f.place)}` : ''; }).filter(Boolean).join('<br>') || '중점관리분야 출동 없음'}</td><td>${esc(zoneFields(zz, focus).map((k) => L[k]).join('·'))}<br><span class="rr-sub-l">사업 후보 3.3</span></td></tr>`).join('')}</tbody></table>
        <p class="note-under">※ 지번·업소 단위 반복 지점은 개인정보 원칙상 화면에 싣지 않고 연구진 전달용 파일(구역별 반복 지번 목록)로 드립니다</p>`;
    }
    const before = ctx.beforeUrl, after = ctx.afterUrl;
    return chapter('3. 복합위험지구 심층 안전진단 및 맞춤형 사업 설계', `
      <h3 class="h-section">3.1 복합위험지구 사고 데이터 분석</h3>
      ${wait('<그림 3-1> 복합위험지구 사고지점 상세 지도 — AURI 지도그림을 받으면 실립니다')}
      ${t31}${t32}
      ${council32(ctx)}
      <h3 class="h-section">3.3 구역별 위험요인 진단 및 맞춤형 안전개선사업</h3>
      ${zones33(ctx)}
      ${before || after ? `<div class="ba-stack">${before ? `<figure><img src="${esc(before)}" alt="현장사진"><figcaption>현장사진 (진단 지점)</figcaption></figure>` : ''}${after ? `<figure><img src="${esc(after)}" alt="개선 후 시뮬레이션"><figcaption>개선 후 시뮬레이션</figcaption></figure><div class="ba-disclaimer">${esc(typeof AURI_AI_DISCLAIMER !== 'undefined' ? AURI_AI_DISCLAIMER : '')}</div>` : ''}</div>` : ''}
      <h3 class="h-section">3.4 복합위험지구 맞춤형 안전개선사업 종합도 및 총괄 산출근거표</h3>
      <figure class="doc-map" style="margin:0"><img src="data/overview/${esc(ctx.region)}.jpg" alt="${esc(ctx.label)} 맞춤형 사업 종합도" style="width:100%;display:block"><figcaption>맞춤형 사업 종합도 <span class="h-sub">AURI 사전분석 종합도 기준 — 3장 사업을 확정하면 다시 그림</span></figcaption></figure>`);
  }

  /* 4장 — 후보지마다 관리분야 · 데이터 특성 · 위험요인 도출표(예시안 4.1 꼴). 로드뷰 사진·사진 판독 줄은 연구진이 고른 사진을 받으면 */
  function ch4(ctx) {
    const cs = candsOf(), focus = focusOrder(ctx.si), tot = (_zones && _zones.regionTotals) || {}, unit = unitOf(ctx.label);
    if (!cs.length) return wait('후보지 ②·③ 위험요인 도출표·맞춤형 사업 — AURI 후보지 위치도(PPT 도형)를 좌표로 옮기면 3장과 같은 방식으로 채웁니다');
    return cs.map((c, i) => {
      if (c.warn) return `<h3 class="h-section">4.${i + 1} [후보지 ${esc(c.name.slice(0, 1))}] ${esc(c.name.slice(1).trim())}(${esc(areaTxt(c))})</h3>
        ${wait('후보지 위치 확인 중 — 위치도 PPT 의 후보지 도형이 섬(행정동 경계) 밖 바다 위에 놓여 있어 AURI 에 위치를 확인하고 있습니다. 확인되면 다른 후보지와 같은 방식으로 채웁니다')}`;
      const ins = focus.filter((k) => hasField(c, k));
      const lines = ins.map((k) => {
        const f = zfacts(c.categories, c.deaths, k);
        if (!f) return '';
        const whole = k === 'suicide' ? [tot.suicideDeath ? `자살 사망은 ${unit} 전체 ${nf(tot.suicideDeath.n)}명 중 ${nf(c.deaths ? c.deaths.n : 0)}명` : null, tot.suicide && c.categories.suicide ? `시도 출동은 ${nf(tot.suicide.n)}건 중 ${nf(c.categories.suicide.n)}건` : null].filter(Boolean).join(', ')
          : `${L[k]} ${k === 'crime' ? '부상자는' : '출동은'} ${unit} 전체 ${nf(tot[k] ? tot[k].n : 0)}${k === 'crime' ? '명' : '건'} 중 ${f.count}`;
        return `<p class="bullet rr-sub">${esc(whole)}${[f.time, f.place].filter(Boolean).length ? ` · ${esc([f.time, f.place].filter(Boolean).join(' · '))}` : ''}</p>`;
      }).join('');
      const rows = ins.map((k) => { const f = zfacts(c.categories, c.deaths, k); return f ? `<tr><td><b>(${L[k]} - ${k === 'suicide' ? '사망·구급' : '119구급'})</b> ${esc(f.count)}${f.person ? ' · ' + esc(f.person) : ''}${f.time ? ' · ' + esc(f.time) : ''}${f.place ? ' · ' + esc(f.place) : ''}</td></tr>` : ''; }).join('');
      return `<h3 class="h-section">4.${i + 1} [후보지 ${esc(c.name.slice(0, 1))}] ${esc(c.name.slice(1).trim())}(${esc(areaTxt(c))})</h3>
        <p class="bullet"><span class="tag">(관리분야)</span> ${esc(ins.map((k) => L[k]).join('×') || '중점관리분야 사고 없음')}</p>
        <p class="bullet"><span class="tag">(데이터 특성)</span> 후보지 안 중점관리분야 사고${c.place ? ` — 걸친 행정동 ${esc(c.place.replace(/ 일원$/, ''))}` : ''}</p>${lines}
        ${wait(`<그림 4-${i + 1}> 로드뷰 기반 현장 사진 — 연구진이 고른 사진을 넣으면 실립니다`)}
        <table class="tight rr-t"><caption>&lt;표 4-${i + 1}&gt; 위험요인 도출표(${esc(c.name.slice(1).trim())})</caption>
          <thead><tr><th>사고 지점 데이터 분석 결과(119 구급·자살사망)</th></tr></thead><tbody>${rows || '<tr><td>중점관리분야 사고 없음</td></tr>'}</tbody></table>`;
    }).join('') + `<p class="note-under">※ 후보지 경계: AURI 4장 후보지 위치도(PPT 도형)를 지도 좌표로 옮겨 집계 · 비율 = ${esc(ctx.label)} 전체 대비 · 후보지 맞춤형 사업은 3장 사업 구성을 확정한 뒤 같은 방식으로</p>`;
  }
  function ch45(ctx) {
    return chapter('4. 복합위험지구 외 ‘위험지구’ 분석 결과', ch4(ctx))
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
