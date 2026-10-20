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
  const rec = { region: slug, label: (regions.find(r => r.region === slug) || {}).label, source: file.replace(/\.txt$/, '.hwpx'), sourceDate: date ? `2026-${date.slice(0, 2)}-${date.slice(2)}` : null, full, ch1, fields };
  fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(rec, null, 1));
  const n = fields.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.issues.length, 0), 0), m = fields.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.issues.reduce((c, i) => c + i.measures.length, 0), 0), 0);
  index.push({ region: slug, full, sourceDate: rec.sourceDate, fields: fields.map(f => f.key), issues: n, measures: m });
  console.log(`${slug.padEnd(11)} ${full ? '전체' : '약식'} ${rec.sourceDate || '-'} · 분야 ${fields.map(f => f.cat + '(' + f.groups.length + '유형/' + f.groups.reduce((b, g) => b + g.issues.length, 0) + '문제)').join(' ')} · 대책 ${m} · 확인사항 ${fields.reduce((a, f) => a + f.checks.length, 0)}${ch1 ? ' · 1장 글머리 ' + ch1.bullets.length + ' 결합표 ' + ch1.combined.length : ''}`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), regions: index }, null, 1));
console.log(`→ ${OUT} (${index.length}곳)`);
