/* ════════════════════════════════════════════════════════════════════
   AURI 「7대 안전유형 맞춤형 사업팔레트」(2026-11-18, 220종) → assets/palette-220.json

   입력  data/raw/맞춤형사업팔레트_1118/7대안전유형_맞춤형사업팔레트.pdf (189쪽 · 김가은 11/18 메일)
         ① 부록 2 「사업코드 마스터 목록(220)」 — 코드 · 유형 · 번호 · 사업명 · 공간단위 · 개입범위 · 중점분야(단일/복합) · HW/SW · HEA
         ② 제1~7장 사업카드 — 공간유형 · 역할 · 개요 · 대상 · 주요내용 · 주관·협력 · 실증근거 · 유의사항 · 성과측정 · 국내 선례(사업비 · 단가 산출)
   출력  { items: [{ code, field, fields, no, name, unit, scope, focus, kind, hea, spaceType, role, card:{…}, precedent:{…}, unitCost }] }
         unitCost = 카드 「단가 산출」 줄에서 "○○당 약 N 원"을 읽은 값(만 원) — 사례가 있는 사업만(나머지는 null, 결과보고서 탭에서 직접 입력)
         legacy  = 지금 앱 표준 팔레트(10/21, assets/palette-std.json) 같은 이름 사업의 id — 처방(rules.js)과 잇는 다리
   쓰는 곳: 결과보고서 탭 3·4장 맞춤형 사업 후보·총괄표. 지금 처방 엔진(palette.json · palette-std.json)은 그대로.
   실행: node tools/build-palette-220.mjs   (pdfjs-dist — tools/node_modules)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/raw/맞춤형사업팔레트_1118/7대안전유형_맞춤형사업팔레트.pdf');
const OUT = path.join(ROOT, 'assets/palette-220.json');
const FIELD = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 자살: 'suicide', 감염병: 'infection', 산업재해: 'industrial' };
const SHORT = { 교통: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 자살: 'suicide', 감염병: 'infection', 산재: 'industrial', 산업재해: 'industrial' };
const CODE = /^([PLAS]-(?:MX-)?[A-Z]{1,3}\d{2})/;

/* PDF → 쪽마다 줄 (같은 y 의 글 조각을 한 줄로) */
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(SRC)), verbosity: 0 }).promise;
const pages = [];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  const lines = []; let line = '', lastY = null;
  for (const it of tc.items) { const y = Math.round(it.transform[5]); if (lastY != null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; } line += it.str; lastY = y; }
  lines.push(line);
  pages.push(lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .filter((l) => !/^7 대 안전유형 맞춤형 사업팔레트/.test(l) && !/^— \d+ —$/.test(l)));
}
const all = pages.flat();

/* ① 사업코드 마스터 */
const a = all.findIndex((l) => /^부록 2 · 사업코드 마스터 목록/.test(l)), b = all.findIndex((l, i) => i > a && /^부록 3 ·/.test(l));
const ROW = /^([PLAS]-(?:MX-)?[A-Z]{1,3}\d{2}) (교통사고|화재|범죄|생활안전|자살|감염병|산업재해) (\d{2}) (.+) ([PLAS]) (점\(Point\)|선\(Line\)|면\(Area\)|운영\(SW\)) (\S+) ((?:단일|복합)\([^)]+\)) (HW\+SW|HW|SW) ([HEA/·+]+|—)$/;
const items = [], bad = [];
for (const l of all.slice(a + 1, b)) {
  if (!CODE.test(l)) continue;
  const m = l.match(ROW);
  if (!m) { bad.push(l); continue; }
  const focusFields = m[8].replace(/^(단일|복합)\(|\)$/g, '').split(/[×x·]/).map((s) => SHORT[s.trim()]).filter(Boolean);
  const isNew = /\(신규[^)]*\)/.test(m[4]);   // 제8장 복합위험지구 사업모델에서 새로 등재된 10종
  items.push({ code: m[1], field: FIELD[m[2]], no: +m[3], name: m[4].replace(/\s*\(신규[^)]*\)\s*/, '').trim(), ...(isNew ? { isNew: true } : {}),
    unit: m[5], unitLabel: m[6], scope: m[7], focus: m[8], fields: focusFields.length ? focusFields : [FIELD[m[2]]], kind: m[9], hea: m[10] === '—' ? null : m[10] });
}

/* ② 사업카드 — "코드 │ 유형 NN" 줄부터 다음 카드 전까지 */
const LABELS = ['적용현장', '개요', '대상', '주요내용', '주관·협력', '실증근거', '유의사항', '성과측정', '지역·시기', '효과·산출', '사업비', '단가 산출', '선례 출처', '근거문헌'];
const KEY = { 적용현장: 'site', 개요: 'overview', 대상: 'target', 주요내용: 'content', '주관·협력': 'org', 실증근거: 'evidence', 유의사항: 'caution', 성과측정: 'measure', '지역·시기': 'where', '효과·산출': 'effect', 사업비: 'budget', '단가 산출': 'unitCostText', '선례 출처': 'source', 근거문헌: 'refs' };
const byCode = Object.fromEntries(items.map((it) => [it.code, it]));
const cardStarts = [];
all.forEach((l, i) => { const m = l.match(/^([PLAS]-(?:MX-)?[A-Z]{1,3}\d{2}) │ (교통사고|화재|범죄|생활안전|자살|감염병|산업재해) \d{2}(?: 표준화 사업명)?$/); if (m && byCode[m[1]] && i < a) cardStarts.push([i, m[1]]); });
let cards = 0;
cardStarts.forEach(([i, code], k) => {
  const end = Math.min(k + 1 < cardStarts.length ? cardStarts[k + 1][0] : a, a);
  const block = all.slice(i + 1, end).filter((l) => !/^(제 \d 장|0\d$|.*맞춤형 사업팔레트$|표준사업 30 선|No 사업코드)/.test(l));
  const it = byCode[code]; if (it.card) return;   // 같은 코드 카드가 두 번이면 첫 것
  const head = block.find((l) => /^공간유형 /.test(l)) || '';
  const hm = head.match(/^공간유형 (.+?) │ 개입 (.+?) │ HEA (.+?) │ 근거 (.+?)(?: │ (역할|지수) ?(.*))?$/);
  if (hm) { it.spaceType = hm[1].trim(); it.basis = hm[4].trim(); if (hm[5] === '역할') it.role = hm[6].trim() || null; else if (hm[5] === '지수') it.index = hm[6].trim() || null; }
  const card = {}, prec = {}; let cur = null;
  for (const l of block) {
    if (/^공간유형 |^사업코드 /.test(l)) { cur = null; continue; }
    const pm = l.match(/^■ 국내 선례 (.+?)(?: \[(.+)\])?$/);
    if (pm) { prec.title = pm[1].trim(); prec.tag = pm[2] || null; cur = null; continue; }
    const lab = LABELS.find((x) => l === x || l.startsWith(x + ' '));
    if (lab) { cur = KEY[lab]; const v = l.slice(lab.length).trim(); const tgt = ['where', 'effect', 'budget', 'unitCostText', 'source'].includes(cur) ? prec : card; tgt[cur] = v; continue; }
    if (cur) { const tgt = ['where', 'effect', 'budget', 'unitCostText', 'source'].includes(cur) ? prec : card; tgt[cur] = (tgt[cur] ? tgt[cur] + ' ' : '') + l; }
    else if (!it.name.includes(l) && !card.overview) { /* 사업명 줄 — 마스터 이름과 같으면 건너뜀 */ }
  }
  /* 한 줄로 이어 붙이며 생긴 "약 1 억 원" 같은 띄어쓰기는 그대로 둠(원문 표기) */
  it.card = card; it.precedent = Object.keys(prec).length ? prec : null; cards++;
});

/* 단가 — "○○당 약 N 원 / N 만 원 / N 억 원" (카드 「단가 산출」 줄) */
const toManwon = (num, unit) => { const n = Number(String(num).replace(/,/g, '')); if (!Number.isFinite(n)) return null; return unit === '억' ? n * 10000 : unit === '만' ? n : n / 10000; };
let costN = 0;
for (const it of items) {
  const t = it.precedent && it.precedent.unitCostText;
  it.unitCost = null;
  if (!t) continue;
  const m = t.match(/([가-힣A-Za-z0-9·]+)당 (?:약 |최대 )?([\d,.]+) ?(억|천만|만)? ?원/);
  if (!m) { it.unitCost = { text: t, per: null, manwon: null }; continue; }
  const unit = m[3] === '천만' ? '만' : m[3]; let v = toManwon(m[2], unit); if (m[3] === '천만') v *= 1000;
  it.unitCost = { text: t, per: m[1], manwon: v != null ? +v.toFixed(1) : null }; costN++;
}

/* 붙임 「개별사업 소요예산 세부 산출근거」 — 코드로 시작하는 줄부터 다음 코드 전까지 한 사례. 카드에 단가가 없는 사업은 여기서 채움 */
const ap = all.findIndex((l) => /^붙임 · 개별사업 소요예산 세부 산출근거/.test(l));
let caseN = 0, fromAppendix = 0;
if (ap > 0) {
  const cases = []; let cur = null;
  for (const l of all.slice(ap + 1)) {
    if (/^사업코드 사업명 구분/.test(l)) continue;
    const m = l.match(CODE);
    if (m && byCode[m[1]]) { cur = { code: m[1], text: l }; cases.push(cur); } else if (cur) cur.text += ' ' + l;
  }
  for (const c of cases) {
    const it = byCode[c.code]; (it.costCases ||= []).push(c.text.replace(c.code + ' ', '')); caseN++;
    if (it.unitCost && it.unitCost.manwon != null) continue;
    const m = c.text.match(/([가-힣A-Za-z0-9·]+)당 (?:약 |최대 )?([\d,.]+) ?(억|천만|만)? ?원/);
    if (!m) continue;
    let v = toManwon(m[2], m[3] === '천만' ? '만' : m[3]); if (m[3] === '천만') v *= 1000;
    if (v != null) { it.unitCost = { text: c.text, per: m[1], manwon: +v.toFixed(1), from: '붙임' }; fromAppendix++; costN++; }
  }
}

/* 지금 표준 팔레트(10/21)와 같은 이름 → legacy id */
const norm = (s) => String(s || '').replace(/\s+|[·()'"「」]/g, '');
const std = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/palette-std.json'), 'utf8')).programs || [];
const stdBy = new Map(std.map((p) => [norm(p.name), p.id]));
let legacyN = 0; for (const it of items) { const id = stdBy.get(norm(it.name)); if (id) { it.legacy = id; legacyN++; } }

const out = { source: 'AURI 「7대 안전유형 맞춤형 사업팔레트」(2026-11-18 김가은, 189쪽) — 부록 2 사업코드 마스터 + 제1~7장 사업카드', generatedAt: new Date().toISOString().slice(0, 10),
  note: 'unitCost 는 카드 「단가 산출」 사례(총액 ÷ 수량)를 읽은 참고 단가(만 원) — 사례가 있는 사업만. 결과보고서 탭에서 연구원이 단가·물량을 확정', count: items.length, items };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const byField = {}; items.forEach((it) => { byField[it.field] = (byField[it.field] || 0) + 1; });
console.log(`팔레트 220 → ${path.relative(ROOT, OUT)} · 붙임 사례 ${caseN}(단가 보충 ${fromAppendix}) · 사업 ${items.length}(${Object.entries(byField).map(([k, v]) => k + ' ' + v).join(' · ')}) · 카드 ${cards} · 단가 읽음 ${costN} · 지금 표준 팔레트와 이름 같음 ${legacyN} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
if (bad.length) console.warn('⚠ 마스터 줄을 못 읽음:', bad.length, bad.slice(0, 3));
const noCard = items.filter((it) => !it.card).map((it) => it.code); if (noCard.length) console.warn('⚠ 카드 없음:', noCard.length, noCard.slice(0, 10).join(','));
