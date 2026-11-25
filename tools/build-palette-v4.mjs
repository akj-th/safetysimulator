/* ════════════════════════════════════════════════════════════════════
   AURI 「7대 안전유형 맞춤형 사업팔레트(안)」 v4 단위사업 편람(2026-11-24 이예린, 325쪽) → assets/palette-v4.json

   입력  data/raw/맞춤형사업팔레트_1124/7대안전유형_맞춤형사업팔레트_v4_단위사업편람.pdf
         ① p.6  사업군 코드표(46) — 코드 · 사업군 · 영문 · 사업 수
         ② p.7  공간유형 13종 — 이름 · 쉽게 말하면 · 대표 장소 · 사업 수
         ③ 제Ⅱ장 사업카드(쪽마다 1개, 280) — 머리띠(코드·사업명·분류 칩) · 대상·주요내용·주관·협력·성과지표
            · 설치 단가 · 선행·부대 작업 · 지역 여건별 총사업비(카드마다 다른 세 가지 경우) · 가능 재원 · 유지관리비 · 실증근거 · 국내 사례
         ④ 부록 1 단위사업 사업비 목록 — 이름 · 단위 · 설치 단가 · 근거 · ① 총사업비 · 연 유지관리(주 항목) : 카드 값과 맞춰 보기만(다르면 경고)
         ⑤ 부록 2 확인 사례 출처 목록 → items[].sources
   출력  { regionCases, spaceTypes, groups, items: [{ code, field, group, groupName, name, page, spaceTypes, spaceUnit, kind, link,
           target, content, org, kpi, basis, confirmed, unit, unitText, unitCost:{min,max}, unitCostText, unitCostNote,
           prepWork:[{work,when,basis}], cases:[{no,label,note,parts:[{item,calc}],total:{min,max}}], totals:{1,2,3},
           funding, procurement, standards, maintenance:{period,rows:[{item,amount,basis}],main,annual,fiveYear}, evidence, domesticCase, sources }] }
         금액은 모두 원 단위 숫자 {min, max}(한 값이면 min = max). 원문 글은 *Text 칸에 그대로.
         지역 여건 ①②③ 의 이름은 카드마다 다름(cases[].label) — ① 은 늘 기본 여건(예시 물량), 부록 1 「① 총사업비」 와 같음.
         maintenance.main = 첫 줄(부록 1 「주 항목」, 카드의 5년 총소요가 쓰는 값) · annual = ① 여건에 드는 줄 합(「(② 해당)」 줄 뺌)
   PDF 글 조각은 글자 하나씩 오는 일이 많아 x·y 위치로 이어 붙임(같은 y · 가까운 x = 한 덩어리) — 카드는 위치(열)로 칸을 나눔.
   새 판이 오면 SRC 만 바꾸고 다시 실행: node tools/build-palette-v4.mjs   (pdfjs-dist — tools/node_modules)
   쓰는 곳: (예정) 결과보고서 탭 3장 구역별 사업 후보 — 공간유형 × 안전유형으로 고름. 처방 엔진(palette.json · palette-std.json)은 그대로.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/raw/맞춤형사업팔레트_1124/7대안전유형_맞춤형사업팔레트_v4_단위사업편람.pdf');
const OUT = path.join(ROOT, 'assets/palette-v4.json');
const VERSION = 'v4 (2026-11-24 이예린)';
const FIELD_BY_LETTER = { T: 'traffic', F: 'fire', C: 'crime', L: 'life', S: 'suicide', D: 'infection', W: 'industrial' };
const FIELD_KO = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
const CODE = /^([TFCLSDW])-([A-Z]{2})(\d{2})$/;
const CIRCLED = { '①': 1, '②': 2, '③': 3 };

/* ── PDF → 쪽마다 글 조각 { s, x, y, w, h } ── */
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(SRC)), verbosity: 0 }).promise;
const PAGES = [null];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  PAGES.push(tc.items.filter((it) => it.str !== '').map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height })));
}

/* 글 조각 → 덩어리(run): 같은 y(±2) 에서 x 가 10pt 넘게 떨어지거나 넓은 빈칸이 끼면 끊음. y 내림차순 · x 오름차순 */
function runs(items) {
  const rows = [];
  for (const it of items) {
    let r = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  const out = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let run = null, endX = -1e9;
    for (const it of r.items) {
      if (/^\s+$/.test(it.s) && it.w > 12) { if (run) out.push(run); run = null; endX = it.x + it.w; continue; }
      if (!run || it.x - endX > 10) { if (run) out.push(run); run = { x: it.x, y: r.y, h: it.h, t: '' }; }
      run.t += it.s; run.h = Math.max(run.h, it.h); endX = it.x + it.w;
    }
    if (run) out.push(run);
  }
  return out.map((r) => ({ ...r, t: r.t.replace(/\s+/g, ' ').trim() })).filter((r) => r.t);
}
/* 줄바꿈된 글을 한 줄로 — 가운뎃점·괄호 뒤에서 끊긴 곳은 붙이고 나머지는 한 칸 */
const joinLines = (arr) => arr.map((s) => String(s).trim()).filter(Boolean).reduce((a, b) => (!a ? b : /[·(「\/~-]$/.test(a) || /^[)」,.·]/.test(b) ? a + b : a + ' ' + b), '');
const inBox = (items, { x0 = -1, x1 = 1e9, y0 = -1, y1 = 1e9 }) => items.filter((it) => it.x >= x0 && it.x < x1 && it.y >= y0 && it.y < y1);
const BADGE = (it) => it.x > 575;   // 쪽 오른쪽 유형 글자(T·F·C…) 띠

/* ── 금액: "4억 1,500만 원" "33만 3,300원 ~ 150만 원" "3,000만~8,000만 원" "0원 ~ 50만 원" → { min, max } (원) ── */
const MULT = { 억: 1e8, 천만: 1e7, 만: 1e4, 천: 1e3 };
function wonOne(s, inheritUnit) {
  const t = String(s).replace(/\s+/g, '').replace(/원$/, '');
  if (!/^\d/.test(t)) return null;
  let v = 0, any = false, lastUnit = null;
  const re = /(\d[\d,]*(?:\.\d+)?)(억|천만|만|천)?/g; let m, pos = 0;
  while ((m = re.exec(t))) {
    if (m.index !== pos) return null;   // 숫자·단위 말고 다른 글이 끼면 금액 아님
    const n = Number(m[1].replace(/,/g, '')); if (!Number.isFinite(n)) return null;
    v += n * (m[2] ? MULT[m[2]] : 1); any = true; lastUnit = m[2] || null; pos = re.lastIndex;
  }
  if (pos !== t.length || !any) return null;
  if (!/[억만천]/.test(t) && inheritUnit) v = Number(t.replace(/,/g, '')) * MULT[inheritUnit];   // "2~4만 원" 의 앞쪽
  return Math.round(v);
}
const MONEY_RE = /(\d[\d,.억천만\s]*원?)\s*~\s*(\d[\d,.억천만\s]*원)|(\d[\d,.억천만\s]*원)/;
function won(text) {
  if (text == null) return null;
  const m = String(text).match(MONEY_RE); if (!m) return null;
  if (m[3]) { const v = wonOne(m[3]); return v == null ? null : { min: v, max: v }; }
  const hiUnit = (m[2].replace(/\s+/g, '').match(/(억|천만|만|천)원?$/) || [])[1];
  const lo = wonOne(m[1], hiUnit), hi = wonOne(m[2]);
  return lo == null || hi == null ? null : { min: lo, max: hi };
}
/* 금액으로 시작하는 글 → [금액 글, 나머지] */
function splitMoney(text) {
  const t = String(text || '').trim(); const m = t.match(MONEY_RE);
  if (!m || m.index !== 0) return [null, t];
  return [m[0].trim(), t.slice(m[0].length).trim()];
}

/* ── ① 사업군(p.6) — 표가 좌우 두 벌. 코드 덩어리 y 를 줄 중심으로, 줄바꿈된 칸은 가까운 줄에 붙임 ── */
function pageOf(re, from = 1, to = 20) { for (let p = from; p <= to; p++) if (runs(PAGES[p]).some((r) => re.test(r.t))) return p; return null; }
const groups = [];
{
  const p = pageOf(/^사업군 코드 — 영문 표기$/);
  const R = runs(PAGES[p]);
  for (const [xa, xb] of [[0, 296], [296, 575]]) {
    const sub = R.filter((r) => r.x >= xa && r.x < xb);
    const codeRuns = sub.filter((r) => /^[TFCLSDW]-[A-Z]{2}$/.test(r.t));
    const hx = sub.filter((r) => /^(사업군|영문 표기|수)$/.test(r.t)).map((r) => r.x);   // 머리줄 x — 칸 경계
    const colOf = (x) => (x < xa + 40 ? 0 : x < hx[1] - 25 ? 1 : x < hx[2] - 10 ? 2 : 3);
    for (const c of codeRuns) {
      const near = sub.filter((r) => r !== c && Math.abs(r.y - c.y) <= 8 && codeRuns.every((o) => Math.abs(r.y - c.y) <= Math.abs(r.y - o.y)));
      const col = (k) => joinLines(near.filter((r) => colOf(r.x) === k).sort((a, b) => b.y - a.y).map((r) => r.t));
      let en = col(2), count = col(3);
      const tail = en.match(/^(.*\S)\s+(\d+)$/); if (!count && tail) [, en, count] = tail;   // 영문이 길면 「수」 칸과 한 덩어리로 옴
      groups.push({ code: c.t, name: col(1), en, field: FIELD_BY_LETTER[c.t[0]], count: Number(count) || 0 });
    }
  }
}

/* ── ② 공간유형 13종(p.7) ── */
const spaceTypes = [];
{
  const p = pageOf(/^공간유형 13종$/);
  const R = runs(PAGES[p]);
  const top = R.find((r) => r.t === '공간유형 13종').y, bottom = (R.find((r) => /^특성연계 3구분/.test(r.t)) || { y: 0 }).y;
  const body = R.filter((r) => r.y < top - 25 && r.y > bottom);   // 머리줄(공간유형 · 쉽게 말하면 …) 아래
  for (const r of body.filter((r) => r.x < 100 && /형$/.test(r.t))) {
    const cell = (x0, x1) => joinLines(body.filter((o) => Math.abs(o.y - r.y) <= 2 && o.x >= x0 && o.x < x1).map((o) => o.t));
    spaceTypes.push({ name: r.t, plain: cell(140, 300), places: cell(300, 515), count: Number(cell(515, 575)) || 0 });
  }
}

/* ── ③ 사업카드 ── */
const CARD_LABELS = { 대상: 'target', 주요내용: 'content', '주관·협력': 'org', 성과지표: 'kpi' };
function parseCard(p) {
  const I = PAGES[p].filter((it) => !BADGE(it));
  const R = runs(I);
  const at = (re, f = () => true) => R.find((r) => re.test(r.t) && f(r));
  const codeR = at(CODE, (r) => r.y > 700); if (!codeR) return null;
  const chipR = at(/^공간유형 /, (r) => r.y < codeR.y); if (!chipR) return null;
  const costR = at(/^사업비$/, (r) => r.x < 70 && r.y < chipR.y);
  const prepR = at(/^설계용역에 함께 반영할 선행·부대 작업/);
  const caseR = at(/^지역 여건별 총사업비/);
  const fundR = at(/^가능 재원$/);
  const maintR = at(/^유지관리비$/, (r) => r.x < 70);
  const evidR = at(/^실증근거$/);
  const miss = Object.entries({ costR, prepR, caseR, fundR, maintR, evidR }).filter(([, v]) => !v).map(([k]) => k);
  const warn = [];
  if (miss.length) warn.push('칸 못 찾음 ' + miss.join(','));
  const code = codeR.t, [, letter, gcode] = code.match(CODE);
  const it = { code, field: FIELD_BY_LETTER[letter], group: `${letter}-${gcode}`, groupName: null, name: null, page: p };
  const gl = R.find((r) => Math.abs(r.y - codeR.y) <= 2 && r.x > codeR.x + 20);
  if (gl) it.groupName = gl.t.split(' · ').slice(1).join(' · ') || null;
  it.name = joinLines(R.filter((r) => r.h >= 13 && r.y < codeR.y && r.y > chipR.y).map((r) => r.t));

  /* 분류 칩: 공간유형 · 공간단위 · 사업유형 · 특성연계 */
  const chip = R.filter((r) => Math.abs(r.y - chipR.y) <= 2).map((r) => r.t).join(' ');
  const cm = chip.match(/^공간유형 (.+?) 공간단위 (.+?) 사업유형 (HW\+SW|HW|SW) (.+)$/);
  if (cm) { it.spaceTypes = cm[1].split(/\s*[,/]\s*/).filter(Boolean); it.spaceUnit = cm[2]; it.kind = cm[3]; it.link = cm[4]; }
  else { warn.push('분류 칩 ' + chip); it.spaceTypes = []; it.spaceUnit = it.kind = it.link = null; }

  /* 대상 · 주요내용 · 주관·협력 · 성과지표 (오른쪽 칸) */
  if (costR) {
    let cur = null; const acc = {};
    for (const r of R.filter((r) => r.x >= 250 && r.y < chipR.y - 3 && r.y > costR.y + 5)) {
      if (CARD_LABELS[r.t]) { cur = CARD_LABELS[r.t]; acc[cur] = []; continue; }
      if (cur) acc[cur].push(r.t);
    }
    for (const k of Object.values(CARD_LABELS)) it[k] = acc[k] ? joinLines(acc[k]) : null;
    it.photo = joinLines(R.filter((r) => r.x < 250 && r.h < 7 && r.y < chipR.y && r.y > costR.y + 5).map((r) => r.t)) || null;
  }

  /* 사업비 근거 · 산정단위 · 설치 단가 */
  if (costR && prepR) {
    const row = R.filter((r) => Math.abs(r.y - costR.y) <= 2 && r !== costR);
    const basisR = row.find((r) => r.x < 300 && !/^산정단위/.test(r.t)), unitR = row.find((r) => /^산정단위 /.test(r.t));
    it.basis = basisR ? basisR.t : null;
    it.confirmed = /확인 사례/.test(it.basis || '');
    it.unitText = unitR ? unitR.t.replace(/^산정단위 /, '') : null;   // 카드 「산정단위」 그대로 — 예: 개소(접근로) · 채널(카메라 1대)
    it.unit = it.unitText ? it.unitText.replace(/\s*\(.*\)$/, '') : null;  // 괄호 풀이를 뗀 단위 = 부록 1 「단위」
    const uc = joinLines(R.filter((r) => r.x < 250 && r.h >= 13 && r.y < costR.y && r.y > prepR.y).map((r) => r.t));
    it.unitCostText = uc || null;
    const [ucMoney, ucPer] = uc.split(/\s+\/\s+/);
    it.unitCost = won(ucMoney);
    it.unitCostPer = ucPer || null;
    if (ucPer && it.unit && !it.unit.startsWith(ucPer)) warn.push(`단가 단위 ${ucPer} ≠ 산정단위 ${it.unit}`);
    it.unitCostNote = joinLines(R.filter((r) => r.x >= 250 && r.y < costR.y + 3 && r.y > prepR.y + 3 && r !== unitR).map((r) => r.t)) || null;
  }

  /* 선행·부대 작업: 작업 | 언제(적용 조건) | 산출 기준 — 세 칸 */
  it.prepWork = [];
  if (prepR && caseR) {
    const box = inBox(I, { y0: caseR.y + 4, y1: prepR.y - 3 });
    const c0 = runs(box.filter((t) => t.x < 180)), c1 = runs(box.filter((t) => t.x >= 180 && t.x < 378)), c2 = runs(box.filter((t) => t.x >= 378));
    const rows = [];
    for (const r of c0) { const last = rows[rows.length - 1]; if (last && last.yLast - r.y < 11) { last.work.push(r.t); last.yLast = r.y; } else rows.push({ y: r.y, yLast: r.y, work: [r.t], when: [], basis: [] }); }
    const nearest = (y) => rows.filter((r) => r.y >= y - 3).pop() || rows[0];   // 칸 위쪽 맞춤 — 그 줄 위에서 가장 가까운 작업 줄
    for (const r of c1) if (rows.length) nearest(r.y).when.push(r.t);
    for (const r of c2) if (rows.length) nearest(r.y).basis.push(r.t);
    it.prepWork = rows.map((r) => ({ work: joinLines(r.work), when: joinLines(r.when) || null, basis: joinLines(r.basis) || null }));
  }

  /* 지역 여건별 총사업비 — 세 칸(①②③). 칸마다: 이름(굵은 줄) → 설명 → [항목, 산출식]… → 총사업비 */
  it.cases = [];
  if (caseR && fundR) {
    const box = inBox(I, { y0: fundR.y + 4, y1: caseR.y - 3 });
    const heads = runs(box).filter((r) => /^[①②③]/.test(r.t)).sort((a, b) => a.x - b.x);
    if (heads.length !== 3) warn.push(`여건 칸 ${heads.length}개`);
    heads.forEach((h, k) => {
      const x0 = k === 0 ? -1 : h.x - 8, x1 = k + 1 < heads.length ? heads[k + 1].x - 8 : 1e9;
      const col = runs(box.filter((t) => t.x >= x0 && t.x < x1));
      const i0 = col.findIndex((r) => r.t === h.t && Math.abs(r.y - h.y) < 1);
      let i = i0 + 1; const label = [h.t];
      while (i < col.length && Math.abs(col[i].h - h.h) < 0.25 && h.y - col[i].y < 20 && !/^총사업비$/.test(col[i].t)) label.push(col[i++].t);
      const totI = col.findIndex((r) => r.t === '총사업비');
      const mid = col.slice(i, totI < 0 ? col.length : totI);
      /* 줄 짜임으로 나눔: [설명] → ([항목 이름] → 산출식)… → [덧붙임]. 글자 크기는 카드마다 맞춰 줄어들어 기준으로 못 씀(같은 칸 안 비교만).
         "지원"의 '원' 처럼 낱말 속 글자에 속지 않게 산출식은 숫자 + 원/×/%/● 로 봄 */
      const isVal = (s) => /×|●|합계|\d\s*(?:억|천만|만|천)?\s*원(?![가-힣])|(?<!\()\d+(?:~\d+)?%(?!\))/.test(s);   // 「보조액(80%)」 같은 괄호 속 %는 이름
      const V = (k) => !!mid[k] && isVal(mid[k].t), N = (k) => !!mid[k] && !isVal(mid[k].t);
      const sameH = (a, b) => !!mid[a] && !!mid[b] && Math.abs(mid[a].h - mid[b].h) < 0.05;
      const startsItem = (k) => N(k) && (V(k + 1) || (N(k + 1) && V(k + 2) && sameH(k, k + 1)));   // 다음 줄(또는 두 줄 이름 뒤)이 산출식
      const noteL = []; let j = 0;
      while (j < mid.length && !startsItem(j) && (j === 0 || sameH(j, 0))) noteL.push(mid[j++].t);   // 맨 앞 설명(한두 줄)
      const parts = []; const remarks = []; let pend = null, lastVal = false;
      for (; j < mid.length; j++) {
        const r = mid[j];
        if (isVal(r.t)) {
          if (pend != null) { parts.push({ item: pend, calc: r.t }); pend = null; }
          else if (lastVal && parts.length) parts[parts.length - 1].calc += ' ' + r.t;   // 산출식이 두 줄로 꺾임
          else parts.push({ item: null, calc: r.t });
          lastVal = true; continue;
        }
        lastVal = false;
        if (pend != null) pend = joinLines([pend, r.t]);   // 항목 이름 둘째 줄
        else if (startsItem(j)) pend = r.t;
        else remarks.push(r.t);
      }
      if (pend != null) remarks.push(pend);
      const note = joinLines(noteL) || null;
      const totalText = totI < 0 ? null : joinLines(col.slice(totI + 1).filter((r) => r.h >= 9).map((r) => r.t)) || null;
      const c = { no: CIRCLED[h.t[0]], label: joinLines(label).replace(/^[①②③]\s*/, ''), note, parts, remarks: remarks.length ? remarks : undefined, totalText, total: won(totalText) };
      if (!c.total) warn.push(`${h.t[0]} 총사업비 못 읽음 "${totalText}"`);
      it.cases.push(c);
    });
  }
  it.totals = Object.fromEntries(it.cases.map((c) => [c.no, c.total]));

  /* 가능 재원 · 발주·계약 · 관련 기준 */
  if (fundR && maintR) {
    const box = inBox(I, { y0: maintR.y + 6, y1: fundR.y + 3 });
    const hx = runs(box).filter((r) => /^(가능 재원|발주·계약|관련 기준)$/.test(r.t)).sort((a, b) => a.x - b.x).map((r) => r.x);
    const cell = (k) => joinLines(runs(box.filter((t) => t.x >= (k ? hx[k] - 5 : -1) && t.x < (hx[k + 1] != null ? hx[k + 1] - 5 : 1e9))).slice(1).map((r) => r.t).filter((t) => !/^① 기준 5년 총소요/.test(t))) || null;   // 5년 총소요 머리가 이 칸 밑에 걸침
    if (hx.length === 3) { it.funding = cell(0); it.procurement = cell(1); it.standards = cell(2); } else warn.push('재원 칸');
  }

  /* 유지관리비: [항목 | 금액 산출식] 줄(여럿일 수 있음) + ① 기준 5년 총소요 */
  if (maintR && evidR) {
    const box = inBox(I, { y0: evidR.y + 8, y1: maintR.y + 12 });   // 「① 기준 5년 총소요」 머리가 「유지관리비」보다 조금 위
    const fiveR = runs(box).find((r) => /^① 기준 5년 총소요/.test(r.t));
    const xFive = fiveR ? fiveR.x - 5 : 430;
    /* 칸: 항목 x 105~200 · 금액 200~283 · 산출식 283~(5년 총소요). 금액이 두 줄로 꺾이면 산출식과 한 덩어리가 되므로 글자 단위로 나눔 */
    const item = runs(box.filter((t) => t.x >= 105 && t.x < 200)), amt = runs(box.filter((t) => t.x >= 200 && t.x < 283)), bas = runs(box.filter((t) => t.x >= 283 && t.x < xFive));
    const rows = [];
    for (const r of item) {
      const hasVal = amt.some((v) => Math.abs(v.y - r.y) <= 3);
      if (hasVal || !rows.length) rows.push({ y: r.y, item: [r.t], amt: [], bas: [] }); else rows[rows.length - 1].item.push(r.t);
    }
    const rowAt = (y) => rows.filter((r) => r.y >= y - 3).pop() || rows[0];
    for (const v of amt) { const row = rowAt(v.y); if (row) row.amt.push(v.t); }
    for (const v of bas) { const row = rowAt(v.y); if (row) row.bas.push(v.t); }
    const mrows = rows.map((r) => { const m = joinLines(r.amt); return { item: joinLines(r.item), amountText: m || null, amount: won(m), basis: joinLines(r.bas) || null }; });
    const label = joinLines(runs(box.filter((t) => t.x < 105)).map((r) => r.t).filter((t) => t !== '유지관리비'));
    const fiveText = fiveR ? joinLines(runs(box.filter((t) => t.x >= xFive)).filter((r) => r !== fiveR && !/^① 기준 5년 총소요/.test(r.t)).map((r) => r.t)) : null;
    /* annual = ① 여건에 드는 줄의 합 — 「임대회선료(② 해당)」「(②·③)」 처럼 다른 여건에만 붙은 줄은 뺌 */
    mrows.forEach((r) => { if (/\([②③][^)]*\)/.test(r.item)) r.cases = [...r.item.matchAll(/[②③]/g)].map((m) => CIRCLED[m[0]]); });
    const sum = mrows.filter((r) => !r.cases).reduce((a, r) => (a && r.amount ? { min: a.min + r.amount.min, max: a.max + r.amount.max } : null), { min: 0, max: 0 });
    it.maintenance = { period: label || null, rows: mrows, main: mrows[0] ? mrows[0].amount : null, annual: mrows.length ? sum : null, fiveYearText: fiveText || null, fiveYear: won(fiveText) };
    if (!mrows.length) warn.push('유지관리비 줄 없음');
    else if (mrows.some((r) => !r.amount)) warn.push('유지관리비 금액 못 읽음 ' + mrows.filter((r) => !r.amount).map((r) => r.item + ':' + r.amountText).join(' / '));
  }

  /* 실증근거 · 국내 사례 */
  if (evidR) {
    const box = inBox(I, { y1: evidR.y + 3, y0: 35 });
    const left = runs(box.filter((t) => t.x < 320)).filter((r) => r.t !== '실증근거'), right = runs(box.filter((t) => t.x >= 320));
    it.evidence = joinLines(left.map((r) => r.t)) || null;
    const head = right.find((r) => /^국내 사례/.test(r.t));
    it.domesticCase = { ref: head ? head.t.replace(/^국내 사례\s*·?\s*/, '') : null, text: joinLines(right.filter((r) => r !== head).map((r) => r.t)) || null };
  }
  if (warn.length) it.warn = warn;
  return it;
}

const items = [];
const appendixStart = pageOf(/^부록 1 · 단위사업 사업비 목록$/, 280, doc.numPages);
for (let p = 1; p < (appendixStart || doc.numPages + 1); p++) {
  const R = runs(PAGES[p]);
  if (!R.some((r) => CODE.test(r.t) && r.y > 700 && r.h >= 10) || !R.some((r) => /^공간유형 .+ 공간단위/.test(R.filter((o) => Math.abs(o.y - r.y) <= 2).map((o) => o.t).join(' ')))) continue;
  const it = parseCard(p); if (it) items.push(it);
}

/* ── ④ 부록 1 표 — 설치 단가 · ① 총사업비 · 연 유지관리(주 항목). 카드 값과 맞춰 봄 ── */
const appendix = {};
if (appendixStart) {
  for (let p = appendixStart; p <= doc.numPages; p++) {
    const R0 = runs(PAGES[p]);
    if (!R0.some((r) => /^부록 1 · 단위사업 사업비 목록/.test(r.t))) break;
    const hdr = Object.fromEntries(R0.filter((r) => /^(코드|단위사업명|단위|설치 단가|근거|① 총사업비|연 유지관리)/.test(r.t)).map((r) => [r.t.replace(/\(.*$/, ''), r.x]));
    /* 칸 경계 — 머리 글자는 가운데 정렬이라 값 칸 시작보다 오른쪽. 이름 칸은 x≈92 부터 */
    const bounds = [-1, 88, hdr['단위'] - 8, hdr['설치 단가'] - 23, hdr['근거'] - 13, hdr['① 총사업비'] - 15, hdr['연 유지관리'] - 6, 575];
    const top = Math.max(...R0.filter((r) => /^(코드|단위사업명)$/.test(r.t)).map((r) => r.y)) - 8;
    const cols = bounds.slice(0, -1).map((x0, k) => runs(PAGES[p].filter((t) => t.x >= x0 && t.x < bounds[k + 1] && t.y < top && t.y > 35)));
    const codes = cols[0].filter((r) => CODE.test(r.t));
    const rowOf = (y) => codes.reduce((b, c) => (Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b), codes[0]);
    for (const c of codes) appendix[c.t] = { name: [], unit: [], unitCost: [], basis: [], total1: [], maint: [] };
    ['name', 'unit', 'unitCost', 'basis', 'total1', 'maint'].forEach((k, j) => {
      for (const r of cols[j + 1]) { const c = rowOf(r.y); if (c && Math.abs(c.y - r.y) < 12) appendix[c.t][k].push(r.t); }
    });
  }
  for (const v of Object.values(appendix)) for (const k of Object.keys(v)) v[k] = joinLines(v[k]);
}

/* ── ⑤ 부록 2 확인 사례 출처 목록 — 코드 | 내용 | 출처 (한 코드에 여러 줄 가능) → items[].sources ── */
const sourcesByCode = {};
{
  const p0 = pageOf(/^부록 2 · 확인 사례 출처 목록$/, appendixStart || 280, doc.numPages);
  for (let p = p0; p0 && p <= doc.numPages; p++) {
    const R0 = runs(PAGES[p]);
    if (!R0.some((r) => /^부록 2 · 확인 사례 출처 목록/.test(r.t))) break;
    const hx = Object.fromEntries(R0.filter((r) => /^(코드|내용|출처)$/.test(r.t)).map((r) => [r.t, r]));
    if (!hx['내용'] || !hx['출처']) continue;
    const top = hx['코드'].y - 8, bounds = [-1, 88, hx['출처'].x - 76, 575];   // 내용 칸 x≈92 · 출처 칸 x≈388(머리 글자 x≈462)
    const cols = bounds.slice(0, -1).map((x0, k) => runs(PAGES[p].filter((t) => t.x >= x0 && t.x < bounds[k + 1] && t.y < top && t.y > 35)));
    const codeRows = cols[0].filter((r) => CODE.test(r.t)).map((r) => ({ ...r, text: [], src: [] }));
    const rowOf = (y) => codeRows.reduce((b, c) => (Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b), codeRows[0]);
    for (const r of cols[1]) { const c = rowOf(r.y); if (c && Math.abs(c.y - r.y) < 12) c.text.push(r.t); }
    for (const r of cols[2]) { const c = rowOf(r.y); if (c && Math.abs(c.y - r.y) < 12) c.src.push(r.t); }
    for (const c of codeRows) (sourcesByCode[c.t] ||= []).push({ text: joinLines(c.text), source: joinLines(c.src) });
  }
}
for (const it of items) it.sources = sourcesByCode[it.code] || [];
const same = (a, b) => a && b && a.min === b.min && a.max === b.max;
const fmt = (v) => (v ? (v.min === v.max ? `${v.min}` : `${v.min}~${v.max}`) : 'null');
const mismatch = [];
for (const it of items) {
  const a = appendix[it.code];
  if (!a) { mismatch.push(`${it.code} 부록 1 에 없음`); continue; }
  it.appendix1 = { unitCostText: a.unitCost || null, total1Text: a.total1 || null, maintText: a.maint || null };
  const chk = [['설치 단가', won(a.unitCost), it.unitCost], ['① 총사업비', won(a.total1), it.totals[1]], ['유지관리 주 항목', won(a.maint), it.maintenance && it.maintenance.rows[0] && it.maintenance.rows[0].amount]];
  for (const [k, x, y] of chk) if (!same(x, y)) mismatch.push(`${it.code} ${k}: 부록 ${fmt(x)} ↔ 카드 ${fmt(y)}`);
  if (a.basis && a.basis.replace(/\s+/g, '') !== String(it.basis || '').replace(/\s+/g, '')) mismatch.push(`${it.code} 근거: 부록 ${a.basis} ↔ 카드 ${it.basis}`);
  if (a.name && a.name.replace(/\s+/g, '') !== it.name.replace(/\s+/g, '')) mismatch.push(`${it.code} 이름: 부록 ${a.name} ↔ 카드 ${it.name}`);
  if (a.unit && a.unit !== it.unit) mismatch.push(`${it.code} 단위: 부록 ${a.unit} ↔ 카드 ${it.unit}`);
}
for (const code of Object.keys(appendix)) if (!items.some((it) => it.code === code)) mismatch.push(`${code} 카드 없음(부록 1 에만)`);

/* ── 저장 ── */
items.sort((a, b) => a.code.localeCompare(b.code));
const out = {
  source: 'AURI 「표준사업 가이드북 별책 — 7대 안전유형 맞춤형 사업팔레트(안)」 단위사업 편람(2026-11-24 이예린, 325쪽) — p.6 사업군 · p.7 공간유형 · 제Ⅱ장 사업카드 280장 · 부록 1(대조) · 부록 2(확인 사례 출처)',
  version: VERSION,
  generatedAt: new Date().toISOString().slice(0, 10),
  rule: '사업카드 한 장에서 위치(칸)로 읽음 — 금액은 원 단위 {min,max}(한 값이면 같음) · 총사업비는 카드의 세 경우(①②③, 이름은 카드마다 다름 — ① 이 기본 여건·예시 물량) · 유지관리비 main = 첫 줄(5년 총소요 기준), annual = ① 여건 줄 합 · 이름·단위·단가·근거·① 총사업비·주 항목은 부록 1 과 맞춰 봄(빌드 때 경고)',
  regionCases: [
    { no: 1, label: '①', meaning: '기본 여건(예시 물량) — 부록 1 「① 총사업비」 · 5년 총소요의 기준' },
    { no: 2, label: '②', meaning: '카드마다 다른 여건(선행·부대 작업이 더 드는 곳 등) — items[].cases[1].label' },
    { no: 3, label: '③', meaning: '카드마다 다른 여건 — items[].cases[2].label' },
  ],
  spaceTypes, groups, count: items.length, items,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

/* ── 점검 출력 ── */
const byField = {}; items.forEach((it) => { byField[it.field] = (byField[it.field] || 0) + 1; });
const codes = items.map((it) => it.code), dup = codes.filter((c, i) => codes.indexOf(c) !== i);
const expected = []; for (const g of groups) for (let n = 1; n <= g.count; n++) expected.push(`${g.code}${String(n).padStart(2, '0')}`);
const missing = expected.filter((c) => !codes.includes(c)), extra = codes.filter((c) => !expected.includes(c));
console.log(`팔레트 v4 → ${path.relative(ROOT, OUT)} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
console.log(`사업 ${items.length}(${Object.entries(byField).map(([k, v]) => FIELD_KO[k] + ' ' + v).join(' · ')}) · 분야 ${Object.keys(byField).length} · 사업군 ${groups.length}(사업 있는 곳 ${new Set(items.map((it) => it.group)).size}) · 확인 사례 ${items.filter((it) => it.confirmed).length} · 공간유형 ${spaceTypes.length}`);
const stCount = {}; items.forEach((it) => it.spaceTypes.forEach((s) => { stCount[s] = (stCount[s] || 0) + 1; }));
const stBad = spaceTypes.filter((s) => stCount[s.name] !== s.count).map((s) => `${s.name} p.7 ${s.count} ↔ 카드 ${stCount[s.name] || 0}`);
const stUnknown = Object.keys(stCount).filter((s) => !spaceTypes.some((t) => t.name === s));
const gBad = groups.filter((g) => items.filter((it) => it.group === g.code).length !== g.count).map((g) => `${g.code} ${g.count} ↔ ${items.filter((it) => it.group === g.code).length}`);
const gName = items.filter((it) => { const g = groups.find((g) => g.code === it.group); return !g || g.name !== it.groupName; }).map((it) => `${it.code} ${it.groupName}`);
if (dup.length) console.warn('⚠ 코드 중복:', dup.join(','));
if (missing.length) console.warn('⚠ 코드 빠짐(사업군 수 기준):', missing.join(','));
if (extra.length) console.warn('⚠ 사업군 표에 없는 코드:', extra.join(','));
if (stBad.length || stUnknown.length) console.warn('⚠ 공간유형 수:', stBad.join(' · '), stUnknown.length ? '· 모르는 이름 ' + stUnknown.join(',') : '');
if (gBad.length) console.warn('⚠ 사업군 수:', gBad.join(' · '));
if (gName.length) console.warn('⚠ 사업군 이름(카드 머리띠 ≠ p.6):', gName.length, gName.slice(0, 5).join(' / '));
const warned = items.filter((it) => it.warn);
if (warned.length) { console.warn(`⚠ 카드 경고 ${warned.length}`); warned.slice(0, 40).forEach((it) => console.warn('  ', it.code, 'p.' + it.page, it.warn.join(' | '))); }
const nulls = { 설치단가: items.filter((it) => !it.unitCost).length, '①': items.filter((it) => !it.totals[1]).length, '②': items.filter((it) => !it.totals[2]).length, '③': items.filter((it) => !it.totals[3]).length, 유지관리: items.filter((it) => !it.maintenance || !it.maintenance.annual).length, '5년': items.filter((it) => !it.maintenance || !it.maintenance.fiveYear).length };
console.log('빈 값(null):', Object.entries(nulls).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`부록 1 행 ${Object.keys(appendix).length} · 카드와 다른 값 ${mismatch.length}`);
mismatch.slice(0, 40).forEach((m) => console.warn('  ', m));
/* 확인 사례: 카드 「사업비 확인 사례」 ↔ 부록 2 에 코드가 있는지 */
const srcCodes = Object.keys(sourcesByCode);
const confNoSrc = items.filter((it) => it.confirmed && !it.sources.length).map((it) => it.code), srcNoConf = items.filter((it) => !it.confirmed && it.sources.length).map((it) => it.code);
console.log(`부록 2 코드 ${srcCodes.length}(줄 ${Object.values(sourcesByCode).flat().length})${confNoSrc.length ? ' · ⚠ 확인 사례인데 부록 2 없음 ' + confNoSrc.join(',') : ''}${srcNoConf.length ? ' · ⚠ 추정인데 부록 2 있음 ' + srcNoConf.join(',') : ''}`);
/* 카드 안 맞춤: 5년 총소요 = ① 총사업비 + 5 × 유지관리 주 항목 (운영형은 ① 이 해마다 드는 돈이라 5 × 주 항목) */
const near = (x, y) => Math.abs(x - y) <= Math.max(10000, Math.abs(y) * 0.01);
const fiveBad = items.filter((it) => { const t = it.totals[1], m = it.maintenance && it.maintenance.main, f = it.maintenance && it.maintenance.fiveYear; if (!t || !m || !f) return true;
  return !((near(t.min + 5 * m.min, f.min) && near(t.max + 5 * m.max, f.max)) || (near(5 * m.min, f.min) && near(5 * m.max, f.max))); }).map((it) => it.code);
console.log(`5년 총소요 = ① + 5×주 항목(또는 5×주 항목) 맞음 ${items.length - fiveBad.length}/${items.length}${fiveBad.length ? ' · 안 맞음 ' + fiveBad.join(',') : ''}`);
/* 보기 — 분야마다 첫 사업 */
const won0 = (v) => (v ? (v.min === v.max ? v.min.toLocaleString() : `${v.min.toLocaleString()}~${v.max.toLocaleString()}`) : '—');
for (const f of ['traffic', 'fire', 'crime', 'life', 'suicide', 'infection', 'industrial'].slice(0, process.argv.includes('--all-samples') ? 7 : 5)) {
  const it = items.find((x) => x.field === f && x.cases.length === 3 && x.prepWork.length) || items.find((x) => x.field === f);
  console.log(`  ${it.code} p.${it.page} ${it.name} [${it.spaceTypes.join(',')} · ${it.spaceUnit} · ${it.kind}] 단가 ${won0(it.unitCost)}/${it.unit}(${it.basis}) · ${it.cases.map((c) => `${c.no} ${c.label}: ${won0(c.total)}`).join(' | ')} · 유지 ${won0(it.maintenance.main)} · 5년 ${won0(it.maintenance.fiveYear)}`);
}
