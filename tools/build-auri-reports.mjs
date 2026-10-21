/* ════════════════════════════════════════════════════════════════════
   AURI 사전진단(사전분석) 보고서 HWPX → data/stats/auri-reports/<지역>.json  (2026-10-20)

   웹 5단계 "사전진단서" 탭이 AURI 가 실제로 보낸 보고서와 같은 구조·같은 글이 되도록, 보고서 본문을
   구조화해 둡니다. 웹은 이 JSON 을 읽어 "2. 복합위험지구 사고 다발지 및 맞춤형 사업(안)" 표를 그대로 싣고,
   우리가 계산한 통계·진단 결과는 그 옆에 "시뮬레이터" 표시를 달아 붙입니다(섞이지 않게).

   입력  docs/사전진단 보고서 및 지도 작업본(AURI)/_text/<파일>.txt
         (hwpx 의 section*.xml 을 글로 푼 것 — 표 칸은 " | ", 표 줄·문단은 줄바꿈. PowerShell 추출, CLAUDE.md 참고)
   출력  data/stats/auri-reports/<slug>.json · data/stats/auri-reports/index.json
   실행  node tools/build-auri-reports.mjs

   보고서는 두 종류입니다.
     전체본(남해·사천·영천·부천): 1장(중점관리분야·복합위험지구 선정, HEA, 결합 분석) + 2장(분야별 사업안 표) + 붙임
     약식본(나머지):             2장의 분야별 사업안 표만 ("(안) □ 범죄 분야 …")
   어느 쪽이든 2장의 표를 같은 모양으로 뽑습니다:
     fields[] = { cat, key, figures[], groups[{ spaceType, place, issues[{ title, place, problem, measures[{ group, hea, text, notes[] }] }] }], checks[] }
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hwpxDoc } from './lib/hwpx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs/사전진단 보고서 및 지도 작업본(AURI)/_text');
const OUT = path.join(ROOT, 'data/stats/auri-reports');
fs.mkdirSync(OUT, { recursive: true });

/* 파일 이름 → 지자체 slug (data/stats/index.json) */
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats/index.json'), 'utf8'));
const regions = Array.isArray(idx) ? idx : idx.regions || Object.values(idx);
const NAME2SLUG = { 광주북구: 'bukgu', 북구: 'bukgu', 금천구: 'geumcheon', 미추홀구: 'michuhol' };
for (const r of regions) { NAME2SLUG[r.short] = r.region; NAME2SLUG[r.short.replace(/(시|군|구)$/, '')] = r.region; }
const KEY = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 산업재해: 'industrial', 산재: 'industrial', 자살: 'suicide', 감염병: 'infection' };
const slugOf = (file) => { const base = file.replace(/^\d{4}_/, '').replace(/_?(사전분석|사전진단)[_ ]?(보고서|서)?\.txt$/, '').replace(/_/g, ''); return NAME2SLUG[base] || NAME2SLUG[base.replace(/^(경기|경남|경북|전남|충남|강원|인천|서울)/, '')] || null; };

const clean = (s) => s.replace(/ /g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();

/* 대책 칸: "[인프라 개선]\n(E) …\n→ …" → measures */
function parseMeasures(cell) {
  const out = []; let group = '';
  for (const raw of cell.split('\n')) { const l = clean(raw); if (!l) continue;
    const g = l.match(/^\[(.+?)\]$/); if (g) { group = g[1]; continue; }
    const m = l.match(/^[·•]?\s*\(([EHA])\)\s*(.*)$/); if (m) { out.push({ group, hea: m[1], text: m[2].trim(), notes: [] }); continue; }
    if (/^[→⇒]/.test(l)) { if (out.length) out[out.length - 1].notes.push(l.replace(/^[→⇒]\s*/, '')); continue; }
    if (out.length) out[out.length - 1].text += ' ' + l; }
  return out;
}
/* 문제 칸: "[제목]\n- (장소) …\n- (현황 및 문제점) …" */
function parseIssue(cell) {
  const o = { title: '', place: '', problem: '', extra: [] }; let cur = null;
  for (const raw of cell.split('\n')) { const l = clean(raw); if (!l) continue;
    const t = l.match(/^\[(.+?)\]$/); if (t && !o.title) { o.title = t[1]; continue; }
    const p = l.match(/^-?\s*\(장소\)\s*(.*)$/); if (p) { o.place = p[1]; cur = 'place'; continue; }
    const q = l.match(/^-?\s*\(현황 및 문제점\)\s*(.*)$/); if (q) { o.problem = q[1]; cur = 'problem'; continue; }
    if (cur === 'place') o.place += ' ' + l; else if (cur === 'problem') o.problem += ' ' + l; else o.extra.push(l); }
  return o;
}
const isIssue = (c) => /^\s*\[.+?\]\s*\n/.test(c) || /\(장소\)|\(현황 및 문제점\)/.test(c);
const isMeasure = (c) => /\[(인프라 개선|운영·관리 대책|운영 · 관리 대책|인식 개선|제도 개선)\]/.test(c) || /^\s*[·•]?\s*\([EHA]\)/.test(c);
const isSpace = (c) => /형/.test(c.split('\n')[0]) && c.length < 120 && !isIssue(c) && !isMeasure(c);

function parseField(catLabel, text) {
  const key = KEY[catLabel] || catLabel;
  const field = { cat: catLabel, key, figures: [], groups: [], checks: [] };
  /* [그림 N] … · 사전 체크 ▸ … 는 표 밖 줄 */
  for (const l of text.split('\n')) { const c = clean(l); const f = c.match(/^\[그림\s*\d*\]\s*(.+)$/); if (f) field.figures.push(f[1].replace(/\s*\|\s*$/, '').trim()); }
  const ci = text.indexOf('사전 체크'); if (ci >= 0) for (const l of text.slice(ci).split('\n')) { const c = clean(l); if (/^[▸▶•·-]\s*/.test(c)) field.checks.push(c.replace(/^[▸▶•·-]\s*/, '').replace(/\s*\|\s*$/, '')); }
  const body = ci >= 0 ? text.slice(0, ci) : text;
  const cells = body.split(' | ').map(s => s.replace(/^\s*\n/, '').replace(/\n\s*$/, '')).filter(s => clean(s));
  let group = null, issue = null;
  for (const c of cells) {
    const first = clean(c.split('\n')[0]);
    if (/^공간 유형|^맞춤형 사업|^\[그림|^\[표/.test(first)) continue;
    if (isMeasure(c)) { if (issue) issue.measures.push(...parseMeasures(c)); else if (group) { issue = { title: '', place: '', problem: '', measures: parseMeasures(c) }; group.issues.push(issue); } continue; }
    if (isIssue(c)) { if (!group) { group = { spaceType: '', place: '', issues: [] }; field.groups.push(group); } issue = { ...parseIssue(c), measures: [] }; group.issues.push(issue); continue; }
    if (isSpace(c)) { const s = clean(c.replace(/\n/g, ' ')); const m = s.match(/^(.+?형)\s*\(?(.*?)\)?$/); group = { spaceType: m ? m[1].trim() : s, place: m && m[2] ? m[2].replace(/\)$/, '').trim() : '', issues: [] }; field.groups.push(group); issue = null; continue; }
  }
  field.groups = field.groups.filter(g => g.issues.length);
  return field;
}

/* 전체본 1장: "○ (범죄) …" 글머리 + 결합 분석 표 */
function parseCh1(text) {
  const bullets = []; let cur = null;
  for (const l of text.split('\n')) { const c = clean(l);
    const m = c.match(/^○\s*\((.+?)\)\s*(.*)$/); if (m) { cur = { tag: m[1], text: m[2] }; bullets.push(cur); continue; }
    const s = c.match(/^\*\s*(.+)$/); if (s && cur) { cur.note = (cur.note ? cur.note + ' ' : '') + s[1]; continue; }
    if (cur && c && !/^\[|^□|^\d\.|^\||^※|^\s*\|/.test(c) && !c.includes(' | ')) cur.text += ' ' + c; else if (/^\[|^□|^\d\./.test(c)) cur = null; }
  const hea = []; const hi = text.indexOf('잠재 취약성 분석(HEA'); const ci = text.indexOf('결합 분석');
  if (hi >= 0) for (const l of text.slice(hi, ci >= 0 ? ci : undefined).split('\n')) { const c = clean(l); if (/^○|^※|^⇒/.test(c)) hea.push(c); }
  const combined = [];
  if (ci >= 0) { const seg = text.slice(ci).split('\n').slice(1).join('\n').split(/\n2\. /)[0]; const cells = seg.split(' | ').map(clean).filter(Boolean); let g1 = '', g2 = ''; let row = [];
    for (const c of cells) { if (c === '구분' || c === '행정동' || c === '읍면' || /^위험 분야/.test(c)) continue; row.push(c); }
    /* 4칸(그룹1·그룹2·동·위험) / 3칸(그룹2·동·위험) / 2칸(동·위험) 섞임 — 동 이름에 '동|읍|면|리' 가 들어간 칸을 기준으로 자름 */
    let buf = []; for (const c of row) { buf.push(c); if (buf.length >= 2 && /(동|읍|면|리|지구|일대)/.test(buf[buf.length - 2]) && !/(형$|내$|외$)/.test(buf[buf.length - 2])) { const risk = buf.pop(), dong = buf.pop(); if (buf.length >= 2) { g1 = buf[buf.length - 2]; g2 = buf[buf.length - 1]; } else if (buf.length === 1) g2 = buf[0]; combined.push({ group: g1, type: g2, dongs: dong, risk }); buf = []; } } }
  return { bullets, hea, combined };
}

/* ★ 보고서 전체를 블록으로 (2026-10-21 담당자: "pdf 에 있는 내용이 다 들어가야 하고 붙임도 동일")
   글(h2·h3·bullet·sub·caption·check·note·p)과 표(rows[][])로만 나눕니다. 2장(분야별 표)은 위 parseField 가 구조화하므로
   document.html 은 2장 구간(ch2Start~ch2End)을 건너뛰고 그 밖(1장·붙임)을 이 블록으로 그립니다.
   표 규칙: hwpx 추출문에서 셀 끝은 " | ", 행 끝은 " | " 만 있는 줄 다음에 " | " 로 시작하지 않는 줄. 빈 줄이 오면 표 끝. */
function parseBlocks(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n');
  const isCell = (l) => /^\s?\| ?/.test(l);
  const blocks = [];
  let i = 0;
  const tableAhead = (j) => { for (let k = j; k < lines.length && k < j + 12; k++) { if (lines[k].trim() === '' && k > j) return false; if (isCell(lines[k])) return true; } return false; };
  const readTable = (j) => {
    const rows = []; let row = []; let cell = [];
    const push = () => { row.push(clean(cell.join('\n').replace(/\n{2,}/g, '\n'))); cell = []; };
    while (j < lines.length) {
      const l = lines[j];
      if (isCell(l)) {
        push();
        const rest = l.replace(/^\s?\| ?/, '');
        if (rest.trim() === '') {
          const next = lines[j + 1];
          if (next === undefined || !isCell(next)) {
            rows.push(row); row = [];
            if (next === undefined || next.trim() === '') { j++; break; }
          }
        } else cell.push(rest);
        j++;
      } else { cell.push(l); j++; }
    }
    if (cell.join('').trim()) push();
    if (row.length) rows.push(row);
    return { rows: rows.filter((r) => r.some(Boolean)), end: j };
  };
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) { i++; continue; }
    if (tableAhead(i)) { const t = readTable(i); if (t.rows.length) blocks.push({ type: 'table', rows: t.rows }); i = t.end; continue; }
    const c = clean(raw);
    if (!c) { i++; continue; }
    if (/^\d+\.\s/.test(c)) blocks.push({ type: 'h2', text: c });
    else if (/^□/.test(c)) blocks.push({ type: 'h3', text: c.replace(/^□\s*/, '') });
    else if (/^○/.test(c)) blocks.push({ type: 'bullet', text: c.replace(/^○\s*/, '') });
    else if (/^[-–]\s/.test(c)) blocks.push({ type: 'sub', text: c.replace(/^[-–]\s*/, '') });
    else if (/^(\[표|\[그림|<.*>$|\(.*\)$)/.test(c)) blocks.push({ type: 'caption', text: c });
    else if (/^[▸▶]/.test(c)) blocks.push({ type: 'check', text: c.replace(/^[▸▶]\s*/, '') });
    else if (/^[※*＊⇒→]/.test(c)) blocks.push({ type: 'note', text: c });
    else blocks.push({ type: 'p', text: c });
    i++;
  }
  return blocks;
}

/* ★ hwpx 원본 찾기 — _text/<이름>.txt ↔ docs/…/<이름 공백>.hwpx (2026-10-21). 있으면 XML 로 블록을 만들어 표가 깨지지 않습니다 */
const DOCS = path.join(ROOT, 'docs/사전진단 보고서 및 지도 작업본(AURI)');
function findHwpx(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== '_text') findHwpx(p, out); } else if (/\.hwpx$/i.test(e.name)) out.push(p); } return out; }
const HWPX = fs.existsSync(DOCS) ? findHwpx(DOCS) : [];
const hwpxFor = (txtFile) => { const want = txtFile.replace(/\.txt$/, '').replace(/_/g, ' ').replace(/\s+/g, ''); return HWPX.find((p) => path.basename(p, '.hwpx').replace(/\s+/g, '') === want) || null; };

const index = [];
for (const file of fs.readdirSync(SRC).filter(f => f.endsWith('.txt'))) {
  const slug = slugOf(file); if (!slug) { console.warn('지자체 못 찾음:', file); continue; }
  const text = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/^﻿/, '');
  const full = /^\s*\(?.*\)?\s*\n?1\.\s.*중점관리분야/m.test(text) && /2\.\s*(복합위험지구|중점관리분야)/.test(text);
  /* 2장 범위: "□ X 분야" 들 — 끝은 "[그림 N] … 종합도" 또는 "1. 개요"(붙임) */
  let body = text; const endM = body.search(/\[그림\s*\d*\]\s*[^\n]*종합도|\n1\. 개요/); const startM = body.search(/\n\s*2\.\s*(복합위험지구|중점관리분야)[^\n]*(사업|다발)/);
  if (endM >= 0) body = body.slice(0, endM); if (startM >= 0) body = body.slice(startM);
  const parts = body.split(/\n\s*□\s*(?=\S+\s*분야)/).slice(1);
  const fields = parts.map(p => { const m = p.match(/^(\S+?)\s*분야/); return parseField(m ? m[1] : '?', p); }).filter(f => f.groups.length);
  const ch1 = full ? parseCh1(text.slice(0, startM >= 0 ? startM : undefined)) : null;
  const date = (file.match(/^(\d{4})_/) || [])[1];
  const hw = hwpxFor(file);
  let blocks;
  let imgCount = 0;
  try {
    if (hw) {
      const doc = hwpxDoc(hw);
      blocks = doc.blocks;
      /* 본문 그림(위치도·종합도 등) → data/stats/auri-reports/img/<지역>/<id>.<ext> (커밋 대상). 블록에는 경로만 */
      /* 원본(PNG·BMP, 지자체당 10~20MB)은 output/auri-img-raw/ 에만 두고(커밋 안 함), 화면이 읽는 것은
         tools/shrink-images.mjs 가 만든 JPEG(data/stats/auri-reports/img/<지역>/<id>.jpg, 긴 변 1400px) 입니다. 빌드 뒤 그 스크립트를 꼭 돌리세요 */
      const rawDir = path.join(ROOT, 'output/auri-img-raw', slug);
      const srcOf = (id) => { const im = doc.images[id]; if (!im) return null; fs.mkdirSync(rawDir, { recursive: true }); fs.writeFileSync(path.join(rawDir, id + '.' + im.ext), im.buf); imgCount++; return 'data/stats/auri-reports/img/' + slug + '/' + id + '.jpg'; };
      for (const b of blocks) {
        if (b.type === 'img') { b.src = srcOf(b.id); }
        if (b.type === 'table') for (const r of b.rows) for (const c of r) { c.imgs = (c.imgs || []).map(srcOf).filter(Boolean); }
      }
    } else blocks = parseBlocks(text);
  } catch (e) { console.warn('hwpx 읽기 실패 → 글 추출 사용:', file, e.message); blocks = parseBlocks(text); }
  let ch2Start = blocks.findIndex((b) => b.type === 'h2' && /^2\.\s*(복합위험지구|중점관리분야)/.test(b.text));
  let ch2End = ch2Start >= 0 ? blocks.findIndex((b, k) => k > ch2Start && ((b.type === 'caption' && /종합도/.test(b.text)) || (b.type === 'table' && /종합도/.test(b.caption || '')) || (b.type === 'h2' && /^1\.\s*개요|^<붙임/.test(b.text)))) : -1;
  if (ch2Start >= 0 && ch2End < 0) ch2End = blocks.length - 1;
  else if (ch2End >= 0 && blocks[ch2End].type === 'h2') ch2End -= 1;
  if (ch2Start < 0) { ch2Start = 0; ch2End = blocks.length - 1; }   // 약식본: 문서 전체가 2장
  const rec = { region: slug, label: (regions.find(r => r.region === slug) || {}).label, source: file.replace(/\.txt$/, '.hwpx'), sourceDate: date ? `2026-${date.slice(0, 2)}-${date.slice(2)}` : null, full, ch1, fields, blocks, ch2Start, ch2End };
  fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(rec, null, 1));
  const n = fields.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.issues.length, 0), 0), m = fields.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.issues.reduce((c, i) => c + i.measures.length, 0), 0), 0);
  index.push({ region: slug, full, sourceDate: rec.sourceDate, fields: fields.map(f => f.key), issues: n, measures: m });
  console.log(`${slug.padEnd(11)} ${full ? '전체' : '약식'} 블록 ${blocks.length}(표 ${blocks.filter((b) => b.type === 'table').length}${hw ? ' hwpx 그림 ' + imgCount : ' txt'}) 2장 ${ch2Start}~${ch2End} ${rec.sourceDate || '-'} · 분야 ${fields.map(f => f.cat + '(' + f.groups.length + '유형/' + f.groups.reduce((b, g) => b + g.issues.length, 0) + '문제)').join(' ')} · 대책 ${m} · 확인사항 ${fields.reduce((a, f) => a + f.checks.length, 0)}${ch1 ? ' · 1장 글머리 ' + ch1.bullets.length + ' 결합표 ' + ch1.combined.length : ''}`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), regions: index }, null, 1));
console.log(`→ ${OUT} (${index.length}곳)`);
