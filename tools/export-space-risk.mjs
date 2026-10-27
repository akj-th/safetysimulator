/* ════════════════════════════════════════════════════════════════════
   연계표(assets/space-risk.json) → 엑셀에서 여는 CSV 2장 (2026-10-27)

   AURI 에 "위험요인–개선사업 인과관계 자료"를 요청하면서, 우리가 임시로 만든 표를
   같은 칸 구성으로 보내 그 위에 고쳐 달라고 하기 위한 양식입니다.
     공간유형.csv          상위 분류 · 공간유형 · 정의(AKJ 임시) · 사진 단서 · 대표 위험요인
     위험요인-개선사업.csv  분야 · 위험요인 · 체크리스트 항목 · 연결 논리 · 사업 · HEA · 개입 단위 · 연결 근거 · 구분
   엑셀 한글이 깨지지 않게 UTF-8 BOM 을 붙입니다.

   실행: node tools/export-space-risk.mjs [출력 폴더]   (기본: output/space-risk)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeXlsx } from './lib/xlsx-write.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'output/space-risk'));
const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/space-risk.json'), 'utf8'));
const pal = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/palette.json'), 'utf8'));
const std = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/palette-std.json'), 'utf8'));
const { CATEGORIES } = await import('file://' + path.join(ROOT, 'server/checklist.js').replace(/\\/g, '/'));

const norm = (s) => String(s || '').replace(/[\s·()（）〔〕[\]'"]/g, '');
const P = new Map(pal.programs.map((p) => [norm(p.name), p]));
const S = new Map(std.programs.map((p) => [norm(p.name), p]));
const heaOf = (name) => { const s = S.get(norm(name)); if (s && s.hea) return s.hea; const p = P.get(norm(name)); return p ? p.hea : ''; };
const ITEM = new Map();
CATEGORIES.forEach((c) => c.items.forEach((i) => ITEM.set(i.id, { field: c.label, ask: i.ask })));
const FIELD = { crime: '범죄', suicide: '자살', traffic: '교통사고', fire: '화재', life: '생활안전', industrial: '산업재해', infection: '감염병' };
const RF = new Map(sr.riskFactors.map((r) => [r.id, r]));

const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const types = [['상위 분류', '세부 공간유형', '정의 (AKJ 임시)', '사진·현장 단서', '대표 위험요인 (AKJ 임시)', 'AURI 수정 의견']];
sr.spaceTypes.forEach((t) => types.push([t.group, t.name, t.def, t.cues, (t.risks || []).map((id) => (RF.get(id) || {}).name || id).join(' / '), '']));

const links = [['분야', '위험요인 ID', '위험요인', '체크리스트 항목(번호·질문)', '연결 논리 (현황 → 위험 → 개입 방향)', '구분', '개선사업', 'HEA', '개입 단위', '연결 근거 (AKJ 임시)', 'AURI 수정 의견']];
sr.riskFactors.forEach((r) => {
  const items = (r.items || []).map((id) => `${id} ${(ITEM.get(id) || {}).ask || ''}`).join(' / ');
  const rows = (r.projects || []).map((p) => ['처방 규칙', p]).concat((r.companions || []).map((p) => ['연계 검토', p]));
  rows.forEach(([kind, p], i) => {
    links.push([i === 0 ? FIELD[r.field] || r.field : '', i === 0 ? r.id : '', i === 0 ? r.name : '', i === 0 ? items : '', i === 0 ? r.logic : '',
      kind, p.name, heaOf(p.name), p.unit || '', p.why || '', '']);
  });
});

fs.mkdirSync(OUT, { recursive: true });
const guide = [['안내'], [`${sr.title} — ${sr.version}`], [sr.source],
  ['이 양식은 시뮬레이터가 지금 쓰고 있는 임시 자료입니다. "AURI 수정 의견" 칸에 적거나 내용을 직접 고쳐 보내 주시면, 화면 수정 없이 자료만 바꿔 반영합니다.'],
  ['위험요인-개선사업 시트: 한 위험요인에 사업이 여러 줄입니다. 구분 "처방 규칙" = 사진 판독 결과로 자동 선정되는 사업, "연계 검토" = 함께 검토할 사람 중심(H·A) 사업.'],
  ['연결 근거: 그 사업이 이 위험요인을 왜·어떻게 줄이는지 한 문장. 서술형 맞춤형 사업(2차 현장보고서) 문장의 근거로 씁니다.'],
  ['개입 단위: 점(지점 시설) · 선(구간) · 면(생활권 운영). 복합 맞춤형 사업의 점·선·면 서술에 씁니다.'],
  ...sr.basis.map((b) => ['근거: ' + b])];
writeXlsx(path.join(OUT, '위험요인-개선사업_연계표_AKJ임시.xlsx'), [
  { name: '안내', rows: guide, widths: [140] },
  { name: '위험요인-개선사업', rows: links, widths: [8, 10, 18, 34, 46, 10, 34, 6, 9, 50, 30] },
  { name: '공간유형', rows: types, widths: [14, 18, 46, 40, 40, 30] },
]);
fs.writeFileSync(path.join(OUT, '공간유형_AKJ임시.csv'), csv(types));
fs.writeFileSync(path.join(OUT, '위험요인-개선사업_연계표_AKJ임시.csv'), csv(links));
console.log(`공간유형 ${types.length - 1}행 · 연계표 ${links.length - 1}행 → ${path.relative(ROOT, OUT) || OUT} (xlsx + csv)`);
console.log(`판: ${sr.version} — ${sr.source}`);
