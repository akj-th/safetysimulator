/* ════════════════════════════════════════════════════════════════════
   1차 지역협의체 의견수렴 · 현장조사 결과 → data/stats/council/<지역>.json  (2026-11-25, AURI 11/24 이예린)

   AURI 가 이음(24곳)이 쓴 「2차 사전진단서」 3.2 파트 초안(hwpx 24개를 묶은 zip)을 보냈습니다.
   그 안의 "3.2 1차 지역협의체 의견수렴 및 현장조사 결과" 를 지자체마다 JSON 하나로 꺼냅니다.
     · intro       — ○ 문단(참여 기관·날짜)과 그 아래 "- …" 줄 · date(YYYY-MM-DD)
     · table       — <표 3-2> 지역협의체 의견수렴 및 현장 위험요인 발굴 결과
                     행마다 { fieldLabel(구분 그대로), field/fields(분야 열쇠), who(참여 주체), data[사전 데이터 분석], found[현장 발굴] }
                     구분 칸이 여러 행에 걸쳐 합쳐져 있으면(rowSpan) 각 행에 같은 구분을 붙입니다.
     · extraFields — 표의 구분 또는 사전질의서 문장("추가로 관리할 분야로 X" · "시급성 … X를 1위")에 나오지만
                     지금 중점관리분야(data/stats/safety-index.json focusByIndex)에 없는 분야와 그 근거
     · zones33     — 3.3 의 구역 제목("[❶구역 : …] ※ 범죄×생활안전/ 3개 사업·4.2억") — 참고용
   글은 AURI·이음이 쓴 문장 그대로입니다(AI 가 고치거나 요약하지 않음).

   ⚠ 개인정보: 이 JSON 은 커밋되어 웹에 올라갑니다. 기관·직책(보건소 · ○○파출소 · 마을 이장 · 주민)은 남기고
     사람 이름 · 전화번호 · 개인 지번은 남기지 않습니다 — 아래 maskPrivate() 가 지우고, 끝에 의심 문구를 출력합니다.

   실행 (tools/ 에서):
     node build-council.mjs                      ← zip 안 24곳 전부
     node build-council.mjs --only=goheung,mokpo
     node build-council.mjs --zip=<다른 zip 경로> [--out=<폴더>] [--verbose]
   zip 은 풀지 않고 필요한 hwpx 만 메모리에서 꺼냅니다(361MB). 항목 이름은 EUC-KR(UTF-8 표시가 있으면 UTF-8).
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseSectionXml } from './lib/hwpx.mjs';
import { REGIONS } from './lib/regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const ZIP = ARGS.zip ? path.resolve(ARGS.zip) : path.join(ROOT, 'docs/02_수신자료/20261124_AURI_이예린_2차사전진단서_3.2파트_이음24곳.zip');
const OUT = ARGS.out ? path.resolve(ARGS.out) : path.join(ROOT, 'data/stats/council');
const ONLY = ARGS.only ? new Set(String(ARGS.only).split(',')) : null;
const VERBOSE = !!ARGS.verbose;
const SOURCE = 'AURI 이예린 2026-11-24 「2차 사전진단서(3.2 파트)」 이음 작성';

/* ── zip 읽기 ─────────────────────────────────────────────────────── */
/** 바깥 zip(큰 파일) — 중앙 디렉터리만 읽고, 항목은 하나씩 꺼냅니다 */
function openOuterZip(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(65557, size)); fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error('zip 아님: ' + file);
  const n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
  const euckr = new TextDecoder('euc-kr'), entries = [];
  let p = 0;
  for (let i = 0; i < n; i++) {
    const flag = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20);
    const fl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), lho = cd.readUInt32LE(p + 42);
    const nb = cd.subarray(p + 46, p + 46 + fl);
    entries.push({ name: (flag & 0x800) ? nb.toString('utf8') : euckr.decode(nb), method, csize, lho });
    p += 46 + fl + xl + cl;
  }
  const read = (ent) => {
    const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, ent.lho);
    const off = ent.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = Buffer.alloc(ent.csize); fs.readSync(fd, data, 0, ent.csize, off);
    return ent.method === 8 ? zlib.inflateRawSync(data) : data;
  };
  return { entries, read, close: () => fs.closeSync(fd) };
}
/** 안쪽 zip(hwpx, 메모리) — 본문 section*.xml 만 풉니다(그림은 건너뜀) */
function hwpxSections(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('hwpx(zip) 아님');
  const n = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  const out = [];
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const fl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + fl);
    p += 46 + fl + xl + cl;
    const m = /^Contents\/section(\d+)\.xml$/i.exec(name); if (!m) continue;
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const data = buf.subarray(start, start + csize);
    out.push({ no: +m[1], xml: (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8') });
  }
  return out.sort((a, b) => a.no - b.no).map((s) => s.xml);
}

/* ── 지자체 이름 → 열쇠 ───────────────────────────────────────────── */
const ALIAS = { '제주시': 'jeju', '제주도': 'jeju', '세종시': 'sejong' };
function slugOf(entryName) {
  const m = /결과보고서_(.+?)_ieum/.exec(entryName); if (!m) return null;
  const nm = m[1].trim(), flat = nm.replace(/\s+/g, '');
  if (ALIAS[nm]) return ALIAS[nm];
  for (const [slug, r] of Object.entries(REGIONS)) {
    if (r.short === nm || r.short.replace(/\s+/g, '') === flat || r.label.endsWith(' ' + nm) || r.label.replace(/\s+/g, '').endsWith(flat)) return slug;
  }
  return null;
}

/* ── 분야 ─────────────────────────────────────────────────────────── */
const FIELD_WORDS = [['traffic', /교통/], ['fire', /화재/], ['crime', /범죄/], ['life', /생활\s*안전/], ['suicide', /자살/], ['infection', /감염/], ['industrial', /산업\s*재해|산재/]];
const FIELD_LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
/** 글 → 나온 순서대로 분야 열쇠 */
function fieldsIn(text) {
  const hits = [];
  for (const [k, re] of FIELD_WORDS) { const m = new RegExp(re.source, 'g').exec(text); if (m) hits.push([m.index, k]); }
  return hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]);
}

/* ── 개인정보 가리기 ─────────────────────────────────────────────────
   전화번호는 자동으로 지웁니다. 사람 이름은 자동으로 고르기 어려워(“마을 이장”·“우두마을 이장” 같은 직책과 섞임)
   확인된 것만 NAME_MASKS 에 적습니다 — 실행 끝의 "개인정보 의심" 목록을 보고 더하세요. */
const NAME_MASKS = [
  // [정규식, 바꿀 글] — 예: [/홍길동\s*이장/g, '마을 이장']   (2026-11-25 24곳 확인: 사람 이름 없음)
];
const PHONE = /(?<!\d)(0\d{1,2})[-.)\s]?\d{3,4}[-.\s]\d{4}(?!\d)/g;
/* 지번(번지) — 안동 "그중 3명은 974번지 단지에서 매년 1명씩"(자살 사망 지점) 처럼 특정 건물을 가리키므로 숫자를 가림.
   도로명(○○로33번길)·행정동 이름은 그대로 둡니다(zones JSON 과 같은 기준: 지번·건물 목록은 웹에 올리지 않음) */
const LOT = /\d+(?:-\d+)?(?:\s*[·,]\s*\d+(?:-\d+)?)*\s*번지/g;
function maskPrivate(s) {
  let t = String(s).replace(PHONE, '(전화번호 생략)').replace(LOT, '○○번지');
  for (const [re, to] of NAME_MASKS) t = t.replace(re, to);
  return t;
}
/* 의심 문구 — 성씨로 시작하는 2~3글자 + 직함 · ○○/OO 가림 · 지번 */
const SURNAME = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경';
const TITLE = '이장|통장|반장|주무관|팀장|과장|계장|소장|서장|국장|위원장|회장|부녀회장|노인회장|씨|님|의원|대표|경위|경사|경장|순경|경감|경정|주임|대장|센터장|원장|교장|목사|선생';
const SUSPECT = [
  ['이름+직함', new RegExp(`(?<![가-힣])[${SURNAME}][가-힣]{1,2}\\s?(?:${TITLE})(?![가-힣])`, 'g')],
  ['가린 이름', /[가-힣][○OＯoㅇ*]{2}/g],
  ['전화번호', /0\d{1,2}[-.)\s]?\d{3,4}[-.\s]\d{4}/g],
  ['지번', /\d+(?:-\d+)?\s*번지|[가-힣]{1,5}(?:동|리|가)\s?\d{1,4}-\d{1,4}(?![\d,.~%])/g],
  ['호수', /\d{2,4}\s?호(?![가-힣])/g],
];
/* 직함 앞이 이름이 아닌 흔한 말(“마을 이장” 등) — 의심 목록에서 뺌 */
const NOT_NAME = /^(마을|지역|해당|각|면|동|읍|리|통|반|담당|관계|현장|우리|전임|현직|당시|부|총|소방|경찰|보건|복지|주민|상인|여성|남성|노인|청년|시설|센터|학교|시장|군|구|시|도)/;

/* ── 블록 → 3.2 / 3.3 ─────────────────────────────────────────────── */
const textOf = (b) => (b && typeof b.text === 'string' ? b.text : '');
const flat = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
const MARK = { bullet: '○ ', sub: '- ', note: '', check: '▸ ', caption: '', p: '', h2: '', h3: '□ ' };
const lineOf = (b) => (MARK[b.type] ?? '') + flat(b.text);

/** 셀 글 → 글머리(•) 줄들. • 가 없으면 문단 단위 */
function bullets(text) {
  const t = String(text || '').trim(); if (!t) return [];
  if (/•/.test(t)) return t.split(/•/).map(flat).filter(Boolean);
  return t.split(/\n+/).map(flat).filter(Boolean);
}

/** 표 행(셀 + 병합) → 칸 격자. g[행][열] = { cell, top(처음 행인지) } */
function toGrid(rows) {
  const g = [];
  rows.forEach((r, ri) => {
    g[ri] = g[ri] || [];
    let c = 0;
    for (const cell of r) {
      while (g[ri][c]) c++;
      const rs = Math.max(1, cell.rowSpan || 1), cs = Math.max(1, cell.colSpan || 1);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) { (g[ri + dr] = g[ri + dr] || [])[c + dc] = { cell, top: dr === 0, row: ri }; }
      c += cs;
    }
  });
  return g;
}

/** 날짜 — (’26. 10. 21.) · (2026.10.21.) */
function datesIn(text) {
  const out = [];
  const re = /(?:[’‘'`]|20)(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/g;
  let m;
  while ((m = re.exec(text))) {
    const y = 2000 + +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return [...new Set(out)];
}

function parseTable(tb, problems) {
  const g = toGrid(tb.rows);
  const hi = g.findIndex((r) => r && r.some((x) => x && /구분/.test(flat(x.cell.text))));
  if (hi < 0) { problems.push('표 머리(구분) 없음'); return { caption: flat(tb.caption), columns: [], rows: [] }; }
  const head = g[hi].map((x) => flat(x && x.cell.text));
  const col = (re) => head.findIndex((h) => re.test(h));
  const C = { label: col(/구분/), who: col(/참여/), data: col(/사전|데이터/), found: col(/현장|인터뷰|발굴/) };
  for (const [k, v] of Object.entries(C)) if (v < 0) problems.push(`표 칸 없음: ${k} (머리 ${head.join(' | ')})`);
  const rows = [];
  for (let ri = hi + 1; ri < g.length; ri++) {
    const r = g[ri]; if (!r) continue;
    const get = (ci) => (ci >= 0 && r[ci] ? r[ci] : null);
    const lab = get(C.label), who = get(C.who), dat = get(C.data), fnd = get(C.found);
    const fieldLabel = flat(lab && lab.cell.text);
    /* 사전·현장 칸이 여러 행에 걸쳐 합쳐졌으면 첫 행에만 글을 넣고 나머지는 sameAsAbove 로 */
    const row = {
      fieldLabel: maskPrivate(fieldLabel),
      field: null, fields: fieldsIn(fieldLabel),
      who: maskPrivate(flat(who && who.cell.text)),
      data: dat && dat.top ? bullets(dat.cell.text).map(maskPrivate) : [],
      found: fnd && fnd.top ? bullets(fnd.cell.text).map(maskPrivate) : [],
    };
    row.field = row.fields.length === 1 ? row.fields[0] : null;
    if (/현장\s*추가/.test(fieldLabel)) row.addedOnSite = true;
    if (lab && !lab.top) row.labelMerged = true;               // 구분 칸이 위 행과 합쳐진 행
    const merged = []; if (dat && !dat.top) merged.push('data'); if (fnd && !fnd.top) merged.push('found');
    if (merged.length) row.sameAsAbove = merged;
    if (!row.fieldLabel && !row.who && !row.data.length && !row.found.length) continue;
    rows.push(row);
  }
  return { caption: flat(tb.caption), columns: head, rows };
}

/** 사전질의서 문장 → 응답자가 고른 분야. 24곳에서 쓰인 말투:
     추가 — "추가로 관리할 분야로 생활안전 3명, 범죄 2명이 선택" · "추가로 다룰 분야로 범죄를 꼽았고" ·
            "안전개선사업에 추가할 분야로 교통사고를 가장 많이 선택함"  (… "선택한 응답 없음" 은 뺌)
     시급 — "5명 모두 교통사고를 1위로 선택" · "7명이 범죄를 시급성 1위로" · "시급성 1순위로 범죄를 꼽음" ·
            "모두 범죄를 가장 시급한 분야로 꼽았고"
   문장 안의 다른 분야 이름("기존 3개 분야(범죄·자살·화재) 중 …")은 세지 않도록 고른 말만 잘라 봅니다 */
function questionnaireFields(line) {
  if (!/사전\s*질의서/.test(line)) return [];
  const out = [];
  for (const m of line.matchAll(/추가(?:로|할)\s*(?:관리할|다룰)?\s*분야(?:로|는)?\s*(.*?)(선택|꼽|[.。]|$)(.{0,12})/g)) {
    if (/^한?\s*응답\s*없|^하지\s*않|^없/.test(m[3].trim()) || /없음|없다/.test(m[1])) continue;
    out.push(...fieldsIn(m[1]));
  }
  if (/시급|1\s*순?위/.test(line)) {
    for (const m of line.matchAll(/([가-힣·]+?)(?:을|를)\s*(?:시급성\s*)?1\s*순?위/g)) out.push(...fieldsIn(m[1]));
    for (const m of line.matchAll(/시급성\s*1\s*순?위(?:로|는)?\s*([가-힣·]+?)(?:을|를|이|가)\s/g)) out.push(...fieldsIn(m[1]));
    for (const m of line.matchAll(/([가-힣·]+?)(?:을|를)\s*가장\s*시급한/g)) out.push(...fieldsIn(m[1]));
  }
  return [...new Set(out)];
}

/** 3.3 구역 제목 — "[❶구역 : 우두항 선착장·주차장 일대(금산면)] ※ 범죄×생활안전×감염병/ 3개 사업·4.2억" */
const CIRCLED = (ch) => {
  const c = ch.codePointAt(0);
  if (c >= 0x2776 && c <= 0x277f) return c - 0x2775;      // ❶~❿
  if (c >= 0x278a && c <= 0x2793) return c - 0x2789;      // ➊~➓
  if (c >= 0x2460 && c <= 0x2473) return c - 0x245f;      // ①~⑳
  if (/\d/.test(ch)) return +ch;
  return null;
};
function zoneHeading(text) {
  const t = flat(text).replace(/^○\s*/, '');
  const m = /^\[\s*([^\]:：]*?)\s*구역\s*[:：]?\s*([^\]]*)\]\s*(.*)$/.exec(t);
  if (!m) return null;
  const tag = m[1].trim(), rest = m[3].replace(/^※\s*/, '').trim();
  const [fieldsText, ...more] = rest.split('/');
  const no = tag ? CIRCLED([...tag][0]) : null;
  return { no, tag: tag || null, name: m[2].trim(), fieldsText: fieldsText.trim(), fields: fieldsIn(fieldsText), summary: more.join('/').trim() || null };
}

function extract(blocks, slug, problems) {
  const isH = (re) => (b) => b.type !== 'table' && re.test(flat(textOf(b)));
  const i32 = blocks.findIndex(isH(/^3\.\s?2\.?\s*1차\s*지역\s*협의체/));
  let start = i32;
  if (start < 0) { start = blocks.findIndex(isH(/^3\.\s?2\.?\s.*(지역\s*협의체|의견\s*수렴)/)); if (start >= 0) problems.push('3.2 제목이 다름: ' + flat(textOf(blocks[start]))); }
  if (start < 0) { problems.push('3.2 제목 없음'); return null; }
  let end = blocks.findIndex((b, i) => i > start && isH(/^3\.\s?3\.?\s/)(b));
  if (end < 0) { problems.push('3.3 제목 없음 — 다음 장 제목까지'); end = blocks.findIndex((b, i) => i > start && isH(/^(3\.\s?[4-9]|[4-9]\.)\s/)(b)); if (end < 0) end = blocks.length; }
  const part = blocks.slice(start + 1, end);
  const ti = part.findIndex((b) => b.type === 'table' && (/표\s*3-2|지역\s*협의체/.test(b.caption || '') || (b.rows[0] || []).some((c) => /구분/.test(c.text))));
  if (ti < 0) problems.push('표 3-2 없음');
  const introBlocks = (ti < 0 ? part : part.slice(0, ti)).filter((b) => b.type !== 'table' && b.type !== 'img' && flat(textOf(b)) && !/^<?\s*표\s*3-2/.test(flat(textOf(b))));
  const afterBlocks = ti < 0 ? [] : part.slice(ti + 1).filter((b) => b.type !== 'table' && b.type !== 'img' && flat(textOf(b)));
  const intro = introBlocks.map(lineOf).map(maskPrivate);
  const table = ti < 0 ? null : parseTable(part[ti], problems);
  if (part.filter((b) => b.type === 'table').length > 1) problems.push(`3.2 안 표 ${part.filter((b) => b.type === 'table').length}개 — 첫 표 3-2 만`);
  const dates = datesIn(intro.join(' '));

  /* 3.3 구역 제목 — 3.3 부터 다음 장(3.4 · 4.) 까지 */
  const zones33 = [];
  if (end < blocks.length && isH(/^3\.\s?3\.?\s/)(blocks[end])) {
    let e2 = blocks.findIndex((b, i) => i > end && isH(/^(3\.\s?[4-9]|[4-9]\.)\s/)(b)); if (e2 < 0) e2 = blocks.length;
    for (const b of blocks.slice(end + 1, e2)) {
      if (b.type === 'table') { for (const r of b.rows) for (const c of r) for (const ln of String(c.text || '').split('\n')) { const z = zoneHeading(ln); if (z) zones33.push(z); } continue; }
      const z = zoneHeading(textOf(b)); if (z) zones33.push(z);
    }
  }
  return { intro, dates, table, after: afterBlocks.map(lineOf).map(maskPrivate), zones33 };
}

/* ── 실행 ─────────────────────────────────────────────────────────── */
const si = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/safety-index.json'), 'utf8'));
const zip = openOuterZip(ZIP);
fs.mkdirSync(OUT, { recursive: true });
const summary = [], suspects = [], seen = new Set();
for (const ent of zip.entries) {
  if (!/\.hwpx$/i.test(ent.name)) continue;
  const slug = slugOf(ent.name);
  if (!slug) { console.warn('⚠ 지자체를 못 찾음:', ent.name); continue; }
  if (ONLY && !ONLY.has(slug)) continue;
  if (seen.has(slug)) console.warn('⚠ 같은 지자체 파일이 둘:', slug, ent.name);
  seen.add(slug);
  const problems = [];
  const blocks = hwpxSections(zip.read(ent)).flatMap((x) => parseSectionXml(x));
  const r = extract(blocks, slug, problems);
  const reg = si.regions[slug] || {};
  const focus = reg.focusByIndex || [];
  if (!si.regions[slug]) problems.push('safety-index.json 에 지자체 없음');

  /* 지금 중점관리분야에 없는 분야 — 표 구분 · 사전질의서 문장 */
  const extra = [];
  if (r && r.table) {
    for (const row of r.table.rows) for (const k of row.fields) if (!focus.includes(k)) extra.push({ field: k, reason: 'table-row', quote: row.fieldLabel });
    for (const row of r.table.rows) for (const ln of [...row.data, ...row.found]) for (const k of questionnaireFields(ln)) if (!focus.includes(k)) extra.push({ field: k, reason: 'questionnaire', quote: ln });
  }
  if (r) for (const ln of [...r.intro, ...r.after]) for (const k of questionnaireFields(ln)) if (!focus.includes(k)) extra.push({ field: k, reason: 'questionnaire', quote: ln });
  const ORDER = Object.keys(FIELD_LABEL);
  const extraFields = extra.filter((x, i) => extra.findIndex((y) => y.field === x.field && y.reason === x.reason && y.quote === x.quote) === i)
    .sort((a, b) => ORDER.indexOf(a.field) - ORDER.indexOf(b.field) || (a.reason === 'table-row' ? -1 : 1) - (b.reason === 'table-row' ? -1 : 1));

  const out = {
    region: slug,
    label: (REGIONS[slug] || {}).label || reg.label || slug,
    source: SOURCE,
    file: ent.name,
    date: r && r.dates[0] || null,
    ...(r && r.dates.length > 1 ? { dates: r.dates } : {}),
    focus,
    intro: r ? r.intro : [],
    table: r && r.table ? { caption: r.table.caption, columns: r.table.columns, rows: r.table.rows } : null,
    ...(r && r.after.length ? { notes: r.after } : {}),
    extraFields,
    extraFieldKeys: [...new Set(extraFields.map((x) => x.field))],
    zones33: r ? r.zones33.map((z) => ({ ...z, name: maskPrivate(z.name) })) : [],
    ...(problems.length ? { problems } : {}),
  };
  fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(out, null, 1) + '\n');

  /* 개인정보 의심 문구 모으기 */
  const walk = (v, where) => {
    if (typeof v === 'string') {
      for (const [kind, re] of SUSPECT) for (const m of v.matchAll(re)) {
        if (kind === '이름+직함' && NOT_NAME.test(m[0])) continue;
        suspects.push({ slug, kind, hit: m[0], where, ctx: v.slice(Math.max(0, m.index - 25), m.index + m[0].length + 15) });
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'file' && k !== 'source') walk(x, where ? `${where}.${k}` : k);
  };
  walk(out, '');

  const rows = out.table ? out.table.rows : [];
  summary.push({ slug, date: out.date, rows: rows.length, labels: rows.map((x) => x.fieldLabel || '(빈칸)').join(' / '), focus: focus.join(','), extra: out.extraFieldKeys.join(','), zones: out.zones33.length, problems: problems.join('; ') });
  if (VERBOSE) {
    console.log(`\n── ${slug} ${out.file}`);
    console.log(out.intro.join('\n'));
    for (const x of rows) console.log(`  [${x.fieldLabel}] ${x.fields.join(',')} | ${x.who} | 사전 ${x.data.length} · 현장 ${x.found.length}${x.sameAsAbove ? ' (합친 칸 ' + x.sameAsAbove + ')' : ''}`);
    for (const z of out.zones33) console.log(`  3.3 ${z.tag} ${z.name} ※ ${z.fieldsText} / ${z.summary}`);
  }
}
zip.close();

console.log('\n지자체 | 날짜 | 행 | 구분 | 중점 | 추가 분야 | 3.3 구역 | 문제');
for (const s of summary) console.log(`${s.slug} | ${s.date} | ${s.rows} | ${s.labels} | ${s.focus} | ${s.extra || '-'} | ${s.zones} | ${s.problems || ''}`);
console.log(`\n→ ${OUT} 에 ${summary.length}곳`);
if (suspects.length) {
  console.log(`\n개인정보 의심 ${suspects.length}건 (사람이 확인 — 이름이면 NAME_MASKS 에 추가):`);
  for (const x of suspects) console.log(`  ${x.slug} [${x.kind}] "${x.hit}" … ${x.ctx.replace(/\n/g, ' ')}`);
} else console.log('\n개인정보 의심 문구 없음');
