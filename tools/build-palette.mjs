/* ════════════════════════════════════════════════════════════════════
   AURI 사업 팔레트 엑셀 → 앱이 읽는 JSON

   실행:  node tools/build-palette.mjs   (또는 npm run palette --prefix tools)

   입력   data/raw/analysis_0901/7대유형_통합_HEA_성과증명_사업팔레트_0902.xlsx
   출력   assets/palette.json

   ── 이 스크립트가 하는 일 ──────────────────────────────────────────
   · 7개 분야 시트에서 사업 목록을 읽습니다 (요약 시트는 해설이라 건너뜁니다)
   · 셀 배경색으로 **신규/기존** 팔레트를 구분하고, 같은 사업명은 신규를 남깁니다
   · 금액 문구에서 **단가로 쓸 수 있는 것만** 숫자로 뽑습니다 (아래 설명)
   · HEA(피해대상/환경/행위)를 그대로 씁니다 — 8/25 협의의 3분류가 이것입니다

   ── 팔레트는 확정본이 아닙니다 ─────────────────────────────────────
   생활안전·감염병은 H·A 사업이 부족해 AURI가 재정리할 예정입니다.
   그래서 **데이터(이 JSON)와 로직(assets/rules.js)을 분리**해 두었습니다.
   새 엑셀을 받으면 이 스크립트만 다시 돌리면 됩니다.

   다만 "체크리스트 항목 → 사업" 연결(assets/rules.js 의 byItem)은
   사람이 정한 판단이라 자동으로 따라오지 않습니다. 사업명이 바뀌면
   tools/verify-rules.mjs 가 끊어진 연결을 잡아 줍니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const XLSX_PATH = path.join(ROOT, 'data/raw/analysis_0901/7대유형_통합_HEA_성과증명_사업팔레트_0902.xlsx');
const OUT_PATH = path.join(ROOT, 'assets/palette.json');

/* ── 시트 이름 → 앱의 분야 key ─────────────────────────────────────── */
const FIELD_BY_SHEET = {
  '교통사고': 'traffic', '화재': 'fire', '범죄': 'crime', '생활안전': 'life',
  '자살': 'suicide', '감염병': 'infection', '산업재해': 'industrial',
};

/* 규칙번호에 쓰는 짧은 코드 */
const CODE = {
  traffic: 'TRF', fire: 'FIR', crime: 'CRM', life: 'LIF',
  suicide: 'SUI', infection: 'INF', industrial: 'IND',
};

/* ── 신규 / 기존 구분 ──────────────────────────────────────────────
   시트마다 표가 두 덩어리 쌓여 있고, 위쪽만 셀에 배경색이 칠해져 있습니다.

     칠해진 쪽 (DCE6F2 파랑 · F2DCDB 분홍)  → 신규
     칠하지 않은 쪽                          → 기존

   ★ 이 판단의 근거 (엑셀에 설명이 없어 자료에서 역으로 확인한 것입니다)
     · 칠해진 표가 머리행 바로 아래에 오는 본 표입니다
     · 금액 기입률이 7개 시트 중 6개에서 칠해진 쪽이 더 높습니다
     · 요약 시트가 "모음집은 A(교육·홍보) 과잉, 고효과 E 개입 부족"이라고
       적었는데, 칠해진 표가 실제로 E 비중이 높습니다 (교통 E23:A11 vs E13:A17)

   ⚠️ 뒤집어야 하면 이 상수만 바꾸면 됩니다.                            */
const COLORED_IS_NEW = true;

/* ── 금액 읽기 ─────────────────────────────────────────────────────
   금액 문구가 제각각이라 일괄로 숫자를 뽑으면 문서가 거짓말을 합니다.

     "개소당 2,500만원"              → 단가로 쓸 수 있음 (개소당 2,500만원)
     "안산시 노후관로 1,386km 대상 2,229억"  → 그 지자체 총액. 단가 아님
     "1개소당 5~10억 이내"           → 범위. 어느 쪽인지 알 수 없음
     "삼척시 기준 국비 30억원 + 지방비 20억원" → 합산 방식이 문서마다 다름

   그래서 **단위가 분명하고 숫자가 하나뿐인 것만** 단가로 뽑고,
   나머지는 원문만 남긴 뒤 "산출 근거 필요"로 표시합니다.
   ──────────────────────────────────────────────────────────────── */
const UNIT_WORDS = [
  ['개소', /(?:^|\s|기준\s*)(?:1\s*)?개소\s*당/],
  ['대',   /(?:^|\s|기준\s*)(?:1\s*)?대\s*당/],
  ['개',   /(?:^|\s|기준\s*)(?:1\s*)?개\s*당/],
  ['가구', /가구\s*당/],
  ['업소', /업소\s*당/],
  ['명',   /인\s*당/],
  ['병실', /병실\s*당/],
  ['단지', /단지\s*당/],
  ['마을', /마을\s*당/],
  ['교차로', /교차로\s*1?\s*개소\s*당/],
];

/* 자릿수 말 → 곱하는 값. 큰 것부터 작은 것 순으로 이어져야 한 금액입니다
   ("1억 5,000만원" = 억 다음에 만). 순서가 거꾸로면 금액이 두 개입니다. */
const SCALE = { '억': 1e8, '천만': 1e7, '백만': 1e6, '만': 1e4, '천': 1e3 };

/**
 * "약 1억 5,000만원" 같은 한국어 금액 → 원 단위 숫자
 * 자릿수가 큰 것 → 작은 것 순으로 이어질 때만 한 금액으로 봅니다.
 * 그렇지 않으면(예: "60만원 … 2억원") 금액이 둘이라는 뜻이라 null 을 돌려줍니다.
 */
function parseWon(text) {
  const tokens = [...String(text).matchAll(/([\d,]+(?:\.\d+)?)\s*(억|천만|백만|만|천)/g)];
  if (!tokens.length) return null;

  let won = 0, lastScale = Infinity;
  for (const t of tokens) {
    const scale = SCALE[t[2]];
    if (scale >= lastScale) return null;      // 자릿수가 커졌다 = 다음 금액이 시작됨
    lastScale = scale;
    won += parseFloat(t[1].replace(/,/g, '')) * scale;
  }
  return won > 0 ? Math.round(won) : null;
}

/**
 * 금액 문구 → { text, won, unit, reason }
 *   won 이 null 이면 합계에서 빠지고 "산출 근거 필요"로 표시됩니다.
 */
function readAmount(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { text: '', won: null, unit: null, reason: '금액 미기입' };

  /* 범위·복수 사례는 어느 값을 쓸지 사람이 정해야 합니다 */
  if (/[~〜]|최대|최소|이내|부터|이상|이하/.test(text)) {
    return { text, won: null, unit: null, reason: '범위로 적혀 있어 단가 확정 필요' };
  }
  /* "국비 30억 + 지방비 20억" 처럼 합산 방식이 문서마다 다른 경우 */
  if (/[+＋]|국비|지방비|시군비|군비|시비|도비/.test(text)) {
    return { text, won: null, unit: null, reason: '국비·지방비 분담이라 산출 방식 확인 필요' };
  }

  /* 금액이 두 번 이상 나오면 사례를 여러 개 적어 둔 것입니다 */
  if ((text.match(/원/g) || []).length > 1) {
    return { text, won: null, unit: null, reason: '사례가 여러 개라 어느 값을 쓸지 확인 필요' };
  }

  const unitHit = UNIT_WORDS.find(([, re]) => re.test(text));
  if (!unitHit) {
    return { text, won: null, unit: null, reason: '지자체 총액 등 — 격자 단가로 쓸 수 없음' };
  }

  /* 단위 표시 뒤부터 '원'까지를 금액으로 봅니다 ("개소 당 약 60만원" → "약 60만") */
  const at = text.search(unitHit[1]);
  const after = text.slice(at).replace(unitHit[1], ' ');
  const upToWon = after.includes('원') ? after.slice(0, after.indexOf('원')) : after;

  const won = parseWon(upToWon);
  if (!won) return { text, won: null, unit: null, reason: '금액 숫자를 읽지 못함' };

  return { text, won, unit: unitHit[0], reason: null };
}

/* ── 사업명 정규화 (같은 사업인지 판단할 때만 씁니다) ───────────────── */
const normName = (s) => String(s || '').replace(/[\s·()（）〔〕[\]]/g, '').trim();

/** 사업명에서 짧고 안정적인 id 를 만듭니다 — 순서가 바뀌어도 그대로입니다 */
function stableId(field, name) {
  let h = 0;
  const n = normName(name);
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return `P-${CODE[field]}-${h.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

/* ════════════════════════════════════════════════════════════════════
   읽기
   ════════════════════════════════════════════════════════════════════ */

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`팔레트 엑셀이 없습니다: ${XLSX_PATH}`);
  process.exit(1);
}

const sheets = readXlsx(XLSX_PATH, { fills: true });
const programs = [];
const stats = [];
const problems = [];

for (const sheet of sheets) {
  const field = FIELD_BY_SHEET[sheet.name.trim()];
  if (!field) continue;                       // 요약 시트 등

  /* 열 위치는 시트마다 다릅니다 (산업재해에는 '구분' 열이 하나 더 있습니다)
     그래서 자리가 아니라 **머리글 이름**으로 찾습니다. */
  const head = (sheet.rows[0] || []).map((v) => String(v || '').trim());
  const col = (prefix) => head.findIndex((h) => h.startsWith(prefix));
  const C = {
    name: col('세부사업'), hea: col('HEA'),
    effect: col('효과크기'), source: col('출처'), amount: col('금액'),
  };
  if (C.name < 0 || C.hea < 0) {
    problems.push(`[${sheet.name}] 머리글에서 '세부사업' 또는 'HEA' 열을 찾지 못했습니다`);
    continue;
  }

  const found = new Map();                    // 정규화 이름 → 사업
  let colored = 0, plain = 0, replaced = 0, dupSame = 0;

  sheet.rows.forEach((row, i) => {
    if (i === 0 || !row) return;
    const name = String(row[C.name] || '').replace(/\s+/g, ' ').trim();
    if (!name) return;

    const fill = (sheet.fills[i] || [])[C.name];
    /* fillId 0,1 은 '색 없음'과 회색 무늬라 실제 칠이 아닙니다 */
    const isColored = !!(fill && fill.fillId > 1);
    const group = (isColored === COLORED_IS_NEW) ? 'new' : 'existing';
    if (isColored) colored++; else plain++;

    const hea = String(row[C.hea] || '').trim().toUpperCase();
    if (!['H', 'E', 'A'].includes(hea)) {
      problems.push(`[${sheet.name}] '${name}' 의 HEA 값이 '${hea || '(빈칸)'}' 입니다`);
    }

    const entry = {
      id: stableId(field, name),
      field,
      name,
      hea: ['H', 'E', 'A'].includes(hea) ? hea : null,
      effect: String(row[C.effect] || '').replace(/\s+/g, ' ').trim(),
      source: String(row[C.source] || '').replace(/\s+/g, ' ').trim(),
      amount: readAmount(row[C.amount]),
      group,
      row: i + 1,                              // 엑셀 행 번호 (되짚어 볼 때)
    };

    const key = normName(name);
    const prev = found.get(key);
    if (!prev) { found.set(key, entry); return; }

    /* 같은 사업명이 두 번 나오면 — 신규 쪽을 남깁니다.
       같은 그룹이면 정보가 더 채워진 쪽을 남깁니다. */
    const filled = (e) => (e.effect ? 1 : 0) + (e.source ? 1 : 0) + (e.amount.won ? 2 : e.amount.text ? 1 : 0);
    const takeNew = (prev.group !== 'new' && entry.group === 'new')
                 || (prev.group === entry.group && filled(entry) > filled(prev));
    if (takeNew) { found.set(key, entry); replaced++; } else dupSame++;
  });

  const list = [...found.values()];
  programs.push(...list);
  stats.push({
    sheet: sheet.name, field,
    rows: colored + plain, colored, plain,
    unique: list.length, merged: replaced + dupSame,
    hea: ['H', 'E', 'A'].map((k) => `${k}:${list.filter((p) => p.hea === k).length}`).join(' '),
    priced: list.filter((p) => p.amount.won).length,
    hasText: list.filter((p) => !p.amount.won && p.amount.text).length,
  });
}

/* ── 결과 쓰기 ─────────────────────────────────────────────────────── */

/* 규칙번호가 겹치면 안 됩니다 (겹치면 처방이 서로 덮어씁니다) */
const byId = new Map();
for (const p of programs) {
  if (byId.has(p.id)) problems.push(`[중복 id] ${p.id} — '${byId.get(p.id).name}' 와 '${p.name}'`);
  byId.set(p.id, p);
}

const out = {
  source: '7대유형_통합_HEA_성과증명_사업팔레트_0902.xlsx (AURI 제공)',
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '⚠️ 확정본이 아닙니다. 생활안전·감염병은 H·A 사업이 부족해 AURI가 재정리할 예정입니다.',
  hea: {
    H: { label: '피해대상 보호·지원', desc: '위험에 노출된 사람을 직접 보호하거나 지원하는 사업 (검진·접종·용품 지원·상담)' },
    E: { label: '환경적 개입', desc: '사고가 나거나 피해가 커지기 쉬운 공간·시설을 바꾸는 사업 (시설 설치·정비)' },
    A: { label: '행위 개입', desc: '사람의 행동을 바꾸는 사업 (단속·교육·홍보·제도)' },
  },
  amountNote: '금액은 원문 문구를 그대로 싣고, 단위와 금액이 분명한 것만 단가(won)로 씁니다. '
            + '나머지는 "산출 근거 필요"로 표시하고 합계에서 뺍니다.',
  programs: programs.sort((a, b) => a.field.localeCompare(b.field) || a.name.localeCompare(b.name, 'ko')),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

/* ── 실행 결과 ────────────────────────────────────────────────────── */
console.log('시트      전체행  칠함  안칠함  중복정리  최종   HEA구성        단가O  문구만');
for (const s of stats) {
  console.log(
    s.sheet.padEnd(8),
    String(s.rows).padStart(6), String(s.colored).padStart(5), String(s.plain).padStart(6),
    String(s.merged).padStart(8), String(s.unique).padStart(6), ' ',
    s.hea.padEnd(14),
    String(s.priced).padStart(4), String(s.hasText).padStart(6),
  );
}

const priced = programs.filter((p) => p.amount.won).length;
const textOnly = programs.filter((p) => !p.amount.won && p.amount.text).length;
console.log(`\n사업 ${programs.length}종 · 단가로 쓸 수 있는 것 ${priced}종 · 금액 문구만 있는 것 ${textOnly}종 · 금액 없음 ${programs.length - priced - textOnly}종`);
console.log(`신규 ${programs.filter((p) => p.group === 'new').length}종 / 기존 ${programs.filter((p) => p.group === 'existing').length}종`);
console.log(`\n→ ${path.relative(ROOT, OUT_PATH)} (${Math.round(fs.statSync(OUT_PATH).size / 1024)}KB)`);

if (problems.length) {
  console.log(`\n⚠️ 확인이 필요한 것 ${problems.length}건`);
  for (const p of problems.slice(0, 20)) console.log('   ' + p);
  if (problems.length > 20) console.log(`   … 외 ${problems.length - 20}건`);
}
