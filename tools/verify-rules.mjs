/* ────────────────────────────────────────────────────────────────────────
   진단 → 처방 파이프라인 정합성 점검

   server/checklist.js (항목) · assets/rules.js (처방 규칙 + 시설물 목록 +
   표준단가) 세 파일은 번호로 서로 맞물려 있습니다. 하나만 고치면 조용히
   끊깁니다 — 이 스크립트가 그걸 잡아냅니다.

   실행: node tools/verify-rules.mjs
   ──────────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { CATEGORIES } = await import('file://' + path.join(ROOT, 'server/checklist.js').replace(/\\/g, '/'));

// rules.js는 브라우저 전역 스크립트라 vm 샌드박스에 로드합니다 (import 불가)
const rulesSrc = readFileSync(path.join(ROOT, 'assets/rules.js'), 'utf8');
const sandbox = { sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, console };
vm.createContext(sandbox);
vm.runInContext(rulesSrc + '\nthis.__exports = { RX_RULES, RX_CATALOG, RX_PRICES, RX_INTERVENTION, RX_REQUIRE_KIND, auriPrescribe, auriCatalogHas, auriRxKind };', sandbox);
const { RX_RULES, RX_CATALOG, RX_PRICES, RX_INTERVENTION, RX_REQUIRE_KIND, auriPrescribe, auriCatalogHas, auriRxKind } = sandbox.__exports;

const errors = [];
const warnings = [];

// checklist.js ↔ rules.js byItem 번호가 양방향으로 맞는지
for (const cat of CATEGORIES) {
  const rule = RX_RULES[cat.key];
  if (!rule) { errors.push(`[누락] rules.js에 분야 '${cat.key}' 가 없음`); continue; }
  const checklistIds = new Set(cat.items.map((i) => i.id));
  const byItemIds = new Set(Object.keys(rule.byItem));

  for (const id of byItemIds) {
    if (!checklistIds.has(id)) errors.push(`[불일치] rules.js '${cat.key}.byItem.${id}' 가 checklist.js에 없음`);
  }
  for (const id of checklistIds) {
    if (!byItemIds.has(id)) warnings.push(`[미연결] checklist.js '${id}' 가 rules.js byItem에 없음 (점수에만 반영, 처방 안 됨)`);
  }
}

// RX_RULES(byItem + fallback)에 등장하는 모든 시설물이 카탈로그·단가표에 있는지
const allRuleItems = new Map(); // name -> id
for (const key in RX_RULES) {
  const rule = RX_RULES[key];
  Object.values(rule.byItem).forEach((list) => list.forEach((it) => allRuleItems.set(it.name, it.id)));
  ['danger', 'caution'].forEach((b) => rule.fallback[b].forEach((it) => allRuleItems.set(it.name, it.id)));
}
for (const [name, id] of allRuleItems) {
  if (!auriCatalogHas(name)) errors.push(`[누락] '${name}' (${id}) 이 RX_CATALOG에 없음`);
  if (!RX_PRICES[name]) errors.push(`[누락] '${name}' (${id}) 의 표준단가(RX_PRICES)가 없음`);
}

// RX_CATALOG ↔ RX_PRICES가 양방향으로 맞는지
let catalogCount = 0;
const catalogNames = [];
RX_CATALOG.forEach((g) => g.items.forEach((name) => {
  catalogCount++;
  catalogNames.push(name);
  if (!RX_PRICES[name]) errors.push(`[누락] RX_CATALOG '${name}' 의 단가가 RX_PRICES에 없음`);
}));
Object.keys(RX_PRICES).forEach((name) => {
  if (!catalogNames.includes(name)) warnings.push(`[유령] RX_PRICES '${name}' 이 RX_CATALOG에 없음`);
});

// 개입 유형 3분류(RX_INTERVENTION)가 카탈로그 전체를 덮는지.
// 빠지면 조용히 '환경적 개입'으로 처리되므로 경고가 아니라 오류로 잡습니다.
const KINDS = ['human', 'environment', 'direct'];
catalogNames.forEach((name) => {
  if (!RX_INTERVENTION[name]) errors.push(`[누락] '${name}' 의 개입 유형(RX_INTERVENTION)이 없음`);
  else if (!KINDS.includes(RX_INTERVENTION[name])) {
    errors.push(`[오값] '${name}' 의 개입 유형 '${RX_INTERVENTION[name]}' 은 human/environment/direct 중 하나여야 함`);
  }
});
Object.keys(RX_INTERVENTION).forEach((name) => {
  if (!catalogNames.includes(name)) warnings.push(`[유령] RX_INTERVENTION '${name}' 이 RX_CATALOG에 없음`);
});

// 반드시 포함해야 하는 개입 유형이 그 분야에서 실제로 뽑힐 수 있는지
Object.entries(RX_REQUIRE_KIND).forEach(([field, kind]) => {
  const rule = RX_RULES[field];
  if (!rule) { errors.push(`[누락] RX_REQUIRE_KIND 의 분야 '${field}' 가 RX_RULES에 없음`); return; }
  const names = new Set();
  Object.values(rule.byItem).forEach((list) => list.forEach((it) => names.add(it.name)));
  ['danger', 'caution'].forEach((b) => rule.fallback[b].forEach((it) => names.add(it.name)));
  if (![...names].some((n) => auriRxKind(n) === kind)) {
    errors.push(`[불가] '${field}' 는 ${kind} 개입을 반드시 넣게 되어 있는데 후보에 하나도 없음`);
  }
  // 예비 목록에도 있어야 합니다 — 항목 판독이 없을 때도 규칙이 지켜져야 하므로
  ['danger', 'caution'].forEach((b) => {
    if (!rule.fallback[b].some((it) => auriRxKind(it.name) === kind)) {
      warnings.push(`[예비목록] '${field}.fallback.${b}' 에 ${kind} 개입이 없어, 항목 판독이 없으면 규칙이 지켜지지 않음`);
    }
  });
});

// 실행 테스트 — auriPrescribe가 실제로 돌아가고, 처방이 항상 카탈로그 안의 것만 나오는지
function fakeResult(cat, level, withFindings) {
  const score = level === 'danger' ? 90 : level === 'caution' ? 50 : 10;
  const findings = withFindings
    ? cat.items.map((i) => ({ id: i.id, ask: i.ask, risk: true, note: '점검용' }))
    : [];
  return {
    key: cat.key,
    name: cat.label,
    score,
    level: {
      key: 'lv-' + level,
      label: level === 'danger' ? '위험' : level === 'caution' ? '주의' : '안전',
      step: level === 'danger' ? 8 : level === 'caution' ? 5 : 2,
    },
    findings,
  };
}

try {
  const rx1 = auriPrescribe(CATEGORIES.map((c) => fakeResult(c, 'danger', true)), { removed: [], edits: {}, added: [] });
  rx1.forEach((it) => { if (!auriCatalogHas(it.name)) errors.push(`[실행] 처방 '${it.name}' 이 카탈로그 밖`); });
  console.log(`[실행] 전분야 위험(항목판독 O) → 처방 ${rx1.length}건`);

  const rx2 = auriPrescribe(CATEGORIES.map((c) => fakeResult(c, 'caution', false)), { removed: [], edits: {}, added: [] });
  console.log(`[실행] 전분야 주의(항목판독 X, 예비목록) → 처방 ${rx2.length}건`);

  const rx3 = auriPrescribe(CATEGORIES.map((c, i) => fakeResult(c, ['danger', 'caution', 'safe'][i % 3], i % 2 === 0)), { removed: [], edits: {}, added: [] });
  console.log(`[실행] 혼합 판정 → 처방 ${rx3.length}건`);
} catch (e) {
  errors.push(`[실행 오류] auriPrescribe 실행 중 예외: ${e.message}`);
}

console.log(`\n체크리스트 항목 수: ${CATEGORIES.reduce((s, c) => s + c.items.length, 0)}개`);
console.log(`카탈로그 시설물 수: ${catalogCount}종`);

console.log(`\n=== 경고 ${warnings.length}건 ===`);
warnings.forEach((w) => console.log(' - ' + w));
console.log(`\n=== 오류 ${errors.length}건 ===`);
errors.forEach((e) => console.log(' - ' + e));

if (errors.length) process.exit(1);
console.log('\n정합성 이상 없음.');
