/* ════════════════════════════════════════════════════════════════════
   41개 지자체 유형화 — AI 대조 (2026-10-27, 10/16 1차안의 남은 일 "AI 로 같은 표를 보고 분류해 기준을 역추적")

   규칙 1차안(tools/classify-regions.mjs → data/stats/region-types.json 의 type)과 **따로**, 같은 지표를 AI 에게 보여 주고
   도심형 / 도농복합형 / 농촌형 중 하나와 이유를 받습니다. 규칙 결과는 AI 에게 보여 주지 않습니다(따라가지 않게).
   결과는 region-types.json 의 각 지자체에 ai: { type, reason, confidence } 로 덧붙이고, 다른 곳을 표로 찍습니다.
   화면은 여전히 규칙 결과(type)만 씁니다 — AI 판단은 기준을 다듬는 참고 자료입니다.

   실행 (유료 호출 1회):  node --env-file=server/.env tools/classify-regions-ai.mjs
   먼저 node tools/classify-regions.mjs 로 지표를 새로 만들어 두세요.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* SDK 는 server/ 에 설치돼 있어 그쪽에서 불러옵니다 */
const require = createRequire(path.join(ROOT, 'server', 'package.json'));
const Anthropic = require('@anthropic-ai/sdk');
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 가 없습니다 — node --env-file=server/.env tools/classify-regions-ai.mjs'); process.exit(1); }

const FILE = path.join(ROOT, 'data/stats/region-types.json');
const rt = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const TYPES = ['도심형', '도농복합형', '농촌형'];

/* 행정동 중 읍·면·동 개수 — 도시/농촌을 가르는 데 가장 직접적인 단서 */
function dongMix(slug) {
  const f = path.join(ROOT, 'data/dong', slug + '.json');
  if (!fs.existsSync(f)) return null;
  const names = JSON.parse(fs.readFileSync(f, 'utf8')).dongs.map((d) => d.name);
  return { eup: names.filter((n) => /읍$/.test(n)).length, myeon: names.filter((n) => /면$/.test(n)).length, dong: names.filter((n) => /동$/.test(n)).length };
}

const rows = rt.regions.map((r) => ({ r, mix: dongMix(r.region) }));
const table = rows.map(({ r, mix }) => [
  r.region, r.label,
  r.population != null ? r.population.toLocaleString() : '-',
  r.areaKm2 ?? '-', r.densityPerKm2 ?? '-', r.elderlyShare ?? '-',
  mix ? `읍${mix.eup}·면${mix.myeon}·동${mix.dong}` : '-',
  r.surveyAreaHa ?? '-', r.insidePerHa ?? '-',
].join(' | ')).join('\n');

const prompt = `당신은 도시계획·지역개발 전문가입니다. 행정안전부 「안전사업지구」 표준사업가이드에서 41개 기초지자체를
공간 성격에 따라 세 유형으로 나누려 합니다. 유형에 따라 권장 안전사업 묶음이 달라집니다.

- 도심형: 시가지가 연속된 고밀 도시. 생활권 대부분이 동(洞) 지역
- 도농복합형: 도심(동) 지역과 농어촌(읍·면) 지역이 한 지자체 안에 섞인 곳
- 농촌형: 군 지역 또는 인구 밀도가 낮고 대부분이 읍·면인 농어촌

아래 지표와 당신이 아는 그 지역의 일반적 성격(시가지 규모, 산업, 섬·산지 등)을 함께 보고 지자체마다 하나를 고르십시오.
지표는 주민등록 2026.08 인구, 행정동 경계 합산 면적, 행정동 이름의 읍·면·동 개수, 복합위험지구(조사지) 면적과 그 안의 3개년 119 출동 밀도입니다.
reason 은 무엇을 보고 판단했는지 60자 안쪽 한 문장, confidence 는 판단이 확실한 정도입니다.

region | 지자체 | 인구 | 면적 km² | 인구밀도(명/km²) | 65세 이상 % | 행정동 구성 | 조사지 ha | 조사지 ha당 3개년 출동
${table}`;

const schema = {
  type: 'object', additionalProperties: false, required: ['regions'],
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['region', 'type', 'reason', 'confidence'],
        properties: {
          region: { type: 'string', enum: rt.regions.map((r) => r.region) },
          type: { type: 'string', enum: TYPES },
          reason: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

const anthropic = new Anthropic({ maxRetries: 3 });
console.log(`지자체 ${rows.length}곳 · AI 분류 요청…`);
const response = await anthropic.beta.messages.create({
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
  output_config: { effort: 'high', format: { type: 'json_schema', schema } },
  messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
});
if (response.stop_reason === 'refusal') { console.error('AI 가 거절했습니다.'); process.exit(1); }
if (response.stop_reason === 'max_tokens') { console.error('답이 한도에서 잘렸습니다.'); process.exit(1); }
const block = response.content.find((b) => b.type === 'text');
const out = JSON.parse(block.text);
console.log(`  · 사용 토큰: 입력 ${response.usage.input_tokens}, 출력 ${response.usage.output_tokens} · 모델 ${response.model}`);

const byRegion = Object.fromEntries(out.regions.map((x) => [x.region, x]));
let same = 0, missing = 0;
const diff = [];
for (const r of rt.regions) {
  const a = byRegion[r.region];
  if (!a) { missing++; r.ai = null; continue; }
  r.ai = { type: a.type, reason: String(a.reason).slice(0, 120), confidence: a.confidence };
  if (a.type === r.type) same++; else diff.push({ r, a });
}
rt.ai = { model: response.model, at: new Date().toISOString().slice(0, 10), agree: same, total: rt.regions.length - missing,
  note: '규칙 1차안(type)과 따로, 같은 지표 + 지역 일반 지식으로 AI 가 고른 유형. 화면은 type 만 씀 — 기준을 다듬는 참고 자료' };
fs.writeFileSync(FILE, JSON.stringify(rt, null, 2));

console.log(`\n규칙 1차안과 같은 곳 ${same}/${rt.regions.length - missing}${missing ? ` · 답이 빠진 곳 ${missing}` : ''}`);
console.log('\n| 지자체 | 규칙 1차안 | 규칙 근거 | AI | AI 이유 | 확신 |\n|---|---|---|---|---|---|');
for (const { r, a } of diff) console.log(`| ${r.label} | ${r.type} | ${r.why} | **${a.type}** | ${a.reason} | ${a.confidence} |`);
