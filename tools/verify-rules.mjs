/* ────────────────────────────────────────────────────────────────────────
   진단 → 처방 파이프라인 정합성 점검

   세 파일이 이름·번호로 서로 맞물려 있습니다. 하나만 고치면 조용히
   끊깁니다 — 이 스크립트가 그걸 잡아냅니다.

     server/checklist.js    항목 번호 (CRM-1 …)
     assets/rules.js        항목 번호 → 사업명  (연결표)
     assets/palette.json    사업명 → HEA·효과크기·출처·금액 (AURI 자료)

   팔레트는 확정본이 아니라 계속 바뀝니다. 사업명이 바뀌거나 빠지면
   연결표가 가리키는 곳이 사라지므로, **팔레트를 새로 받을 때마다**
   이 점검을 돌려야 합니다.

   실행: node tools/verify-rules.mjs
   ──────────────────────────────────────────────────────────────────────── */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { CATEGORIES } = await import('file://' + path.join(ROOT, 'server/checklist.js').replace(/\\/g, '/'));

const PALETTE_PATH = path.join(ROOT, 'assets/palette.json');
if (!existsSync(PALETTE_PATH)) {
  console.error('assets/palette.json 이 없습니다. 먼저 `node tools/build-palette.mjs` 를 돌리세요.');
  process.exit(1);
}
const palette = JSON.parse(readFileSync(PALETTE_PATH, 'utf8'));

/* rules.js·palette.js 는 브라우저 전역 스크립트라 vm 샌드박스에 올립니다.
   fetch 는 **요청한 주소의 실제 파일**을 돌려줍니다 (2026-10-27 점검 — 전에는 어떤 주소든 palette.json 을 돌려줘서
   palette-std.json 병합(표준 팔레트 154종 추가 · HEA 16종 덮어쓰기)이 점검 중에는 일어나지 않았습니다). */
const sandbox = {
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  console,
  fetch: async (u) => {
    const p = path.join(ROOT, String(u).split('?')[0]);
    if (!existsSync(p)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) };
  },
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(ROOT, 'assets/palette.js'), 'utf8'), sandbox);
await vm.runInContext('AuriPalette.load()', sandbox);
vm.runInContext(readFileSync(path.join(ROOT, 'assets/rules.js'), 'utf8')
  + '\nthis.__exports = { RX_RULES, RX_WEAK, RX_REQUIRE_HEA, RX_MAX_BY_LEVEL, auriPrescribe, auriCatalogHas, auriRxIsVisual };',
  sandbox);
const { RX_RULES, RX_WEAK, RX_REQUIRE_HEA, auriPrescribe, auriCatalogHas, auriRxIsVisual } = sandbox.__exports;

const errors = [];
const warnings = [];

/* ── ① 체크리스트 ↔ 연결표 번호가 양방향으로 맞는지 ─────────────── */
for (const cat of CATEGORIES) {
  const rule = RX_RULES[cat.key];
  if (!rule) { errors.push(`[누락] rules.js에 분야 '${cat.key}' 가 없음`); continue; }
  const checklistIds = new Set(cat.items.map((i) => i.id));
  const byItemIds = new Set(Object.keys(rule.byItem));

  for (const id of byItemIds) {
    if (!checklistIds.has(id)) errors.push(`[불일치] rules.js '${cat.key}.byItem.${id}' 가 checklist.js에 없음`);
  }
  for (const id of checklistIds) {
    if (!byItemIds.has(id)) warnings.push(`[미연결] checklist.js '${id}' 가 연결표에 없음 (점수에만 반영, 처방 안 됨)`);
  }
}

/* ── ② 연결표가 가리키는 사업이 팔레트에 실제로 있는지 ──────────── */
const used = new Map();          // 사업명 → 어디서 불렀는지
for (const key in RX_RULES) {
  const rule = RX_RULES[key];
  for (const [itemId, names] of Object.entries(rule.byItem)) {
    names.forEach((n) => {
      if (!used.has(n)) used.set(n, []);
      used.get(n).push(`${key}.byItem.${itemId}`);
    });
  }
  for (const b of ['danger', 'caution']) {
    rule.fallback[b].forEach((n) => {
      if (!used.has(n)) used.set(n, []);
      used.get(n).push(`${key}.fallback.${b}`);
    });
  }
}
for (const [name, where] of used) {
  if (!auriCatalogHas(name)) {
    errors.push(`[끊김] '${name}' 이 팔레트에 없음 — ${where[0]}${where.length > 1 ? ` 외 ${where.length - 1}곳` : ''}`);
  }
}

/* ── ③ 연결표가 부르는 사업의 분야가 맞는지 ─────────────────────── */
const norm = (s) => String(s || '').replace(/[\s·()（）〔〕[\]]/g, '').trim();
const byName = new Map(palette.programs.map((p) => [norm(p.name), p]));
for (const key in RX_RULES) {
  const rule = RX_RULES[key];
  const check = (names, where) => names.forEach((n) => {
    const p = byName.get(norm(n));
    if (p && p.field !== key) {
      warnings.push(`[분야 다름] '${n}' 은 팔레트에서 ${p.field} 분야인데 ${where} 에서 부름`);
    }
  });
  for (const [itemId, names] of Object.entries(rule.byItem)) check(names, `${key}.byItem.${itemId}`);
  for (const b of ['danger', 'caution']) check(rule.fallback[b], `${key}.fallback.${b}`);
}

/* ── ④ HEA 값과 필수 개입 유형 ──────────────────────────────────── */
for (const p of palette.programs) {
  if (!['H', 'E', 'A'].includes(p.hea)) errors.push(`[HEA] '${p.name}' 의 HEA 값이 '${p.hea}'`);
}
for (const [field, kinds] of Object.entries(RX_REQUIRE_HEA)) {
  const rule = RX_RULES[field];
  if (!rule) { errors.push(`[누락] RX_REQUIRE_HEA 의 분야 '${field}' 가 RX_RULES에 없음`); continue; }
  const names = new Set();
  Object.values(rule.byItem).forEach((l) => l.forEach((n) => names.add(n)));
  ['danger', 'caution'].forEach((b) => rule.fallback[b].forEach((n) => names.add(n)));
  const has = [...names].some((n) => {
    const p = byName.get(norm(n));
    return p && kinds.includes(p.hea);
  });
  if (!has) errors.push(`[불가] '${field}' 는 ${kinds.join('/')} 개입을 반드시 넣게 되어 있는데 후보에 하나도 없음`);
  for (const b of ['danger', 'caution']) {
    const ok = rule.fallback[b].some((n) => {
      const p = byName.get(norm(n));
      return p && kinds.includes(p.hea);
    });
    if (!ok) warnings.push(`[예비목록] '${field}.fallback.${b}' 에 ${kinds.join('/')} 개입이 없어, 항목 판독이 없으면 규칙이 지켜지지 않음`);
  }
}

/* ── ⑤ 연결이 약하다고 적어 둔 항목이 실제 항목인지 ─────────────── */
const allItemIds = new Set(CATEGORIES.flatMap((c) => c.items.map((i) => i.id)));
for (const id of Object.keys(RX_WEAK)) {
  if (!allItemIds.has(id)) warnings.push(`[RX_WEAK] '${id}' 는 checklist.js 에 없는 항목입니다`);
}

/* ── ⑥ 실행 테스트 ──────────────────────────────────────────────── */
function fakeResult(cat, level, withFindings) {
  const score = level === 'danger' ? 90 : level === 'caution' ? 50 : 10;
  return {
    key: cat.key, name: cat.label, score,
    level: {
      key: 'lv-' + level,
      label: level === 'danger' ? '위험' : level === 'caution' ? '주의' : '안전',
      step: level === 'danger' ? 8 : level === 'caution' ? 5 : 2,
    },
    findings: withFindings ? cat.items.map((i) => ({ id: i.id, ask: i.ask, risk: true, note: '점검용' })) : [],
  };
}

try {
  const blank = { removed: [], edits: {}, added: [] };
  const rx1 = auriPrescribe(CATEGORIES.map((c) => fakeResult(c, 'danger', true)), blank);
  rx1.forEach((it) => { if (!auriCatalogHas(it.name)) errors.push(`[실행] 처방 '${it.name}' 이 팔레트 밖`); });

  const sui = rx1.filter((it) => it.field === 'suicide');
  if (sui.length && !sui.some((it) => ['H', 'A'].includes(it.hea))) {
    errors.push('[실행] 자살 위험 판정인데 사람 중심 개입(H·A)이 하나도 없음');
  }

  const priced = rx1.filter((it) => it.amount && it.amount.won).length;
  const visual = rx1.filter((it) => auriRxIsVisual(it)).length;
  console.log(`[실행] 전분야 위험(항목판독 O) → 처방 ${rx1.length}건 · 단가 있는 것 ${priced}건 · 이미지에 그릴 수 있는 것 ${visual}건`);

  const rx2 = auriPrescribe(CATEGORIES.map((c) => fakeResult(c, 'caution', false)), blank);
  console.log(`[실행] 전분야 주의(항목판독 X, 예비목록) → 처방 ${rx2.length}건`);
  rx2.forEach((it) => { if (!auriCatalogHas(it.name)) errors.push(`[실행] 예비목록 처방 '${it.name}' 이 팔레트 밖`); });

  const rx3 = auriPrescribe(CATEGORIES.map((c, i) => fakeResult(c, ['danger', 'caution', 'safe'][i % 3], i % 2 === 0)), blank);
  console.log(`[실행] 혼합 판정 → 처방 ${rx3.length}건`);
} catch (e) {
  errors.push(`[실행 오류] auriPrescribe 실행 중 예외: ${e.message}`);
}

/* ── ⑦ 공간유형·위험요인 연계표 (assets/space-risk.json, 2026-10-27) ─────────
   서술형 맞춤형 사업(2차 현장보고서)·적용사례 카드·진단 지시문의 공간유형이 이 파일 하나를 씁니다.
   AURI 자료로 바꿀 때 사업명·항목 번호가 어긋나면 카드가 조용히 비므로 여기서 잡습니다. */
const SR_PATH = path.join(ROOT, 'assets/space-risk.json');
let srCount = 0;
if (!existsSync(SR_PATH)) {
  warnings.push('[연계표] assets/space-risk.json 이 없습니다 — 2차 현장보고서·공간유형 표가 비게 됩니다');
} else {
  const sr = JSON.parse(readFileSync(SR_PATH, 'utf8'));
  const std = existsSync(path.join(ROOT, 'assets/palette-std.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'assets/palette-std.json'), 'utf8')) : { programs: [] };
  const normN = (s) => String(s || '').replace(/[\s·()（）〔〕[\]'"]/g, '');
  const names = new Set(palette.programs.map((p) => normN(p.name)).concat(std.programs.map((p) => normN(p.name))));
  const itemField = new Map();
  CATEGORIES.forEach((c) => c.items.forEach((i) => itemField.set(i.id, c.key)));
  const rfIds = new Set();
  const covered = new Set();
  (sr.riskFactors || []).forEach((rf) => {
    srCount++;
    if (rfIds.has(rf.id)) errors.push(`[연계표] 위험요인 id '${rf.id}' 가 두 번 있음`);
    rfIds.add(rf.id);
    (rf.items || []).forEach((id) => {
      if (!itemField.has(id)) errors.push(`[연계표] ${rf.id} 의 항목 '${id}' 가 checklist.js 에 없음`);
      else if (itemField.get(id) !== rf.field) errors.push(`[연계표] ${rf.id}(${rf.field}) 의 항목 '${id}' 는 ${itemField.get(id)} 분야`);
      covered.add(id);
    });
    (rf.projects || []).concat(rf.companions || []).forEach((p) => {
      if (!names.has(normN(p.name))) errors.push(`[연계표] ${rf.id} 의 사업 '${p.name}' 이 팔레트(289종·표준 210종)에 없음`);
    });
  });
  itemField.forEach((f, id) => { if (!covered.has(id)) warnings.push(`[연계표] 체크리스트 '${id}' 가 어느 위험요인에도 없음 — 2차 현장보고서 카드에 안 나옴`); });
  /* 공간유형 13종 — palette.js SPACE_GROUPS · 표준 팔레트 spaceType 과 글자 그대로 같아야 합니다 */
  const groups = vm.runInContext('AuriPalette.SPACE_GROUPS', sandbox) || [];
  const fromPalette = new Set(groups.flatMap((g) => g.types));
  const fromStd = new Set(std.programs.map((p) => p.spaceType).filter(Boolean));
  const fromSr = new Set((sr.spaceTypes || []).map((t) => t.name));
  fromPalette.forEach((t) => { if (!fromSr.has(t)) errors.push(`[연계표] 공간유형 '${t}' (palette.js) 가 space-risk.json 에 없음`); });
  fromSr.forEach((t) => { if (!fromPalette.has(t)) errors.push(`[연계표] 공간유형 '${t}' 가 palette.js SPACE_GROUPS 에 없음`); });
  fromStd.forEach((t) => { if (!fromSr.has(t)) warnings.push(`[연계표] 표준 팔레트 공간유형 '${t}' 가 space-risk.json 에 없음`); });
  (sr.spaceTypes || []).forEach((t) => (t.risks || []).forEach((id) => { if (!rfIds.has(id)) errors.push(`[연계표] 공간유형 '${t.name}' 의 위험요인 '${id}' 가 없음`); }));
}

/* ── 요약 ───────────────────────────────────────────────────────── */
const priced = palette.programs.filter((p) => p.amount && p.amount.won).length;
console.log(`\n체크리스트 항목 ${CATEGORIES.reduce((s, c) => s + c.items.length, 0)}개`);
console.log(`팔레트 사업 ${palette.programs.length}종 + 표준 팔레트 병합 뒤 ${vm.runInContext('AuriPalette.count', sandbox)}종 (연결표가 쓰는 것 ${used.size}종 · 단가 있는 것 ${priced}종)`);
console.log(`연결이 약하다고 적어 둔 항목 ${Object.keys(RX_WEAK).length}개`);
console.log(`공간유형·위험요인 연계표 위험요인 ${srCount}개 (assets/space-risk.json)`);

console.log(`\n=== 경고 ${warnings.length}건 ===`);
warnings.forEach((w) => console.log(' - ' + w));
console.log(`\n=== 오류 ${errors.length}건 ===`);
errors.forEach((e) => console.log(' - ' + e));

if (errors.length) process.exit(1);
console.log('\n정합성 이상 없음.');
