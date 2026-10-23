/* ════════════════════════════════════════════════════════════════════
   표준 맞춤형 사업팔레트 (AURI 2026-10-20, 분야별 30개 × 7 = 210) → assets/palette-std.json
     입력  data/raw/맞춤형사업팔레트_1021/<분야>_30개_예산실증출처_검증수정본_20261020.docx
     출력  assets/palette-std.json   (커밋 대상 · 사람이 손대지 않음)
   docx 마다 ① 요약표(번호·표준 사업명·대표 공간유형·개입단위·HEA(검토)·공고·근거 확인) ② 사업마다 상세카드(3칸 표)
     카드 왼칸: 공간유형 / 개입단위 / "NN번·분야"   가운데: 사업명 / HEA(검토) (원본 X) / 지역지수 위해지표
     오른칸: ▪ (개요) ▪ (대상) ▪ (주요내용) ▪ (주관/협력) ▪ (국내 실증·정책근거) ▪ (소요예산) ▪ (예산산정 기준) ▪ (적용·유의) ▪ (성과확인) ▪ (현장 시각화) ▪ (기초사례) ▪ (검증 원문)
   기존 팔레트(palette.json, 0902 엑셀 289종)와는 사업명이 56종만 겹칩니다. 그래서 **바꾸지 않고 덧붙입니다** —
   assets/palette.js 가 두 파일을 함께 읽어 같은 이름이면 상세를 붙이고, 새 이름은 사업으로 추가합니다(연결표 rules.js 는 그대로).
   실행: node tools/build-palette-std.mjs
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib/hwpx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/raw/맞춤형사업팔레트_1021');
const OUT = path.join(ROOT, 'assets/palette-std.json');
const KEY = { 교통사고: 'traffic', 화재: 'fire', 범죄: 'crime', 생활안전: 'life', 산업재해: 'industrial', 자살: 'suicide', 감염병: 'infection' };
const CARD_KEYS = { 개요: 'overview', 대상: 'target', 주요내용: 'content', '주관/협력': 'owner', '국내 실증·정책근거': 'evidence', 소요예산: 'budget', '예산산정 기준': 'budgetBasis', '적용·유의': 'caution', 성과확인: 'outcome', '현장 시각화': 'visual', 기초사례: 'caseRef', '검증 원문': 'sourceRef' };

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const cellText = (tc) => [...tc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => unesc(m[1])).join('')).map((t) => t.trim()).filter(Boolean).join('\n');
const tablesOf = (xml) => [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => [...m[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => cellText(c[0]))));

/* "▪ (개요) …\n▪ (대상) …" → { overview, target, … } */
function parseCard(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^[▪•]\s*\((.+?)\)\s*(.*)$/.exec(line.trim());
    if (m) { cur = CARD_KEYS[m[1]] || m[1]; out[cur] = (m[2] || '').replace(/\s*\[원문 열기 ↗\]\s*$/, '').trim(); continue; }
    if (cur && line.trim()) out[cur] += ' ' + line.trim().replace(/\s*\[원문 열기 ↗\]\s*$/, '');
  }
  return out;
}
/* 소요예산 글에서 단가로 쓸 수 있는 금액만 — "개소당 2,500만원" 꼴. 산식·범위·미확정은 null */
function readWon(text) {
  const t = String(text || '');
  if (/미확정|산식만/.test(t)) return null;
  const m = /(?:개소|대|식|건|㎡|m|km|명|기)당\s*(?:약\s*)?([\d,.]+)\s*(억|만)?\s*원/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return { won: Math.round(n * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : 1)), unit: /(.{1,3})당/.exec(m[0])[1] + '당' };
}

const programs = [];
for (const f of fs.readdirSync(SRC).filter((x) => /\.docx$/i.test(x)).sort()) {
  const catLabel = f.split('_')[0];
  const field = KEY[catLabel];
  if (!field) { console.warn('분야 모름:', f); continue; }
  const z = readZip(path.join(SRC, f));
  const tables = tablesOf(z['word/document.xml'].toString('utf8'));
  const summary = tables[0].slice(1).filter((r) => /^\d+$/.test(r[0]));
  const cards = tables.slice(1).filter((t) => t.length === 1 && t[0].length === 3);
  const byNo = {};
  cards.forEach((c, ci) => {
    const [left, mid, right] = c[0];
    /* 카드 번호: 왼쪽 칸 'NN번'. 교통사고·화재 docx 는 번호가 없어 카드 순서(요약표와 같은 순서)로 잇습니다 (2026-10-23 HEA '금' 오류 수정) */
    const no = (/(\d+)번/.exec(left) || [])[1] || (summary[ci] ? summary[ci][0] : null);
    const m = /HEA\s*([EHA])\s*(?:\(원본\s*([EHA])\))?/.exec(mid) || /분류\s*H·E·A\s*:\s*([EHA])/.exec(mid);
    const idx = (/지역지수\s*(.+)$/m.exec(mid) || [])[1];
    if (no != null) byNo[String(+no)] = { hea: m ? m[1] : null, heaOrig: m && m[2] ? m[2] : null, index: idx ? idx.trim() : '', card: parseCard(right) };
  });
  for (const r of summary) {
    const d = byNo[String(+r[0])] || { card: {} };
    const won = readWon(d.card.budget);
    programs.push({
      id: `S-${field.toUpperCase().slice(0, 3)}-${r[0]}`, no: +r[0], field, cat: catLabel, name: r[1].trim(),
      /* HEA 열이 없는 docx(교통사고·화재)는 r[4] 가 예산 문구라 카드의 HEA 를 씁니다 */
      spaceType: r[2], unit: r[3], hea: (/^[EHA]$/.test(String(r[4] || '').trim()) ? String(r[4]).trim() : d.hea) || null, heaOrig: d.heaOrig, note: r[r.length - 1], index: d.index,
      amount: won ? { text: d.card.budget || '', won: won.won, unit: won.unit, reason: null } : { text: d.card.budget || '', won: null, unit: null, reason: d.card.budget ? '산식·미확정 — 현장 산정 필요' : '금액 미기입' },
      card: d.card,
    });
  }
  console.log(`${catLabel.padEnd(4)} ${summary.length}종 · 카드 ${cards.length} · 단가 ${programs.filter((p) => p.field === field && p.amount.won).length}`);
}
fs.writeFileSync(OUT, JSON.stringify({ source: '맞춤형사업팔레트_1021 (AURI 2026-10-20 검증수정본, 분야별 30개)', generatedAt: new Date().toISOString().slice(0, 10), programs }, null, 1));
console.log(`→ ${path.relative(ROOT, OUT)} · ${programs.length}종 (HEA E ${programs.filter((p) => p.hea === 'E').length} · H ${programs.filter((p) => p.hea === 'H').length} · A ${programs.filter((p) => p.hea === 'A').length}) ${Math.round(fs.statSync(OUT).size / 1024)}KB`);
