/* ────────────────────────────────────────────────────────────────────────
   AI 진단 중계 서버

   하는 일 딱 두 가지:
   1) 진단 화면(HTML)들을 브라우저에 띄워 줍니다.
   2) 브라우저가 보낸 거리 사진을 AI에 넘기고, 점수표를 돌려줍니다.

   ★ API 키는 이 서버에만 있습니다. 브라우저로는 절대 나가지 않습니다.

   ── 폐쇄망 전환 시 ──────────────────────────────────────────────────
   나중에 외부 API를 못 쓰게 되면 아래 callAI() 함수 하나만
   로컬 sLLM을 부르도록 바꾸면 됩니다. 화면(HTML)은 손댈 필요 없습니다.
   ──────────────────────────────────────────────────────────────────── */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import { CATEGORIES, SCORING_GUIDE } from './checklist.js';

const PORT = process.env.PORT || 8787;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HERE, '..');   // HTML 파일들이 있는 폴더

/* ── 요금 안전장치 ────────────────────────────────────────────────────
   인터넷에 공개된 주소에 API 키가 붙어 있으므로, 누군가 반복 호출하면
   그 요금이 그대로 청구됩니다. 아래 두 상한선이 그것을 막습니다.
   숫자를 바꾸려면 배포 사이트의 환경변수에서 바꾸면 됩니다. */
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 200);        // 하루 전체 진단 횟수
const HOURLY_LIMIT_PER_IP = Number(process.env.HOURLY_LIMIT_PER_IP || 20); // 한 사람당 1시간

/* 접속 암호 (선택). 환경변수 ACCESS_CODE 를 정해 두면 그 암호를 아는
   사람만 AI 진단을 쓸 수 있습니다. 비워 두면 누구나 쓸 수 있습니다. */
const ACCESS_CODE = process.env.ACCESS_CODE || '';

let _day = '';
let _dayCount = 0;
const _ipHits = new Map();

function clientIp(req) {
  // 배포 서비스는 실제 접속자 IP를 이 헤더에 담아 전달합니다
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

function checkQuota(req) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _day) { _day = today; _dayCount = 0; _ipHits.clear(); }

  if (_dayCount >= DAILY_LIMIT) {
    throw Object.assign(
      new Error(`오늘 사용 가능한 진단 횟수(${DAILY_LIMIT}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`),
      { status: 429 }
    );
  }

  const ip = clientIp(req);
  const now = Date.now();
  const hits = (_ipHits.get(ip) || []).filter(function (t) { return now - t < 3600000; });
  if (hits.length >= HOURLY_LIMIT_PER_IP) {
    throw Object.assign(
      new Error(`1시간에 ${HOURLY_LIMIT_PER_IP}회까지만 진단할 수 있습니다. 잠시 후 다시 시도해 주세요.`),
      { status: 429 }
    );
  }

  hits.push(now);
  _ipHits.set(ip, hits);
  _dayCount++;
  console.log(`  · 오늘 누적 ${_dayCount}/${DAILY_LIMIT}회`);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n[오류] API 키가 없습니다.');
  console.error('server 폴더의 .env.example 파일을 .env 로 복사한 뒤,');
  console.error('그 안에 발급받은 키를 넣어 주세요.\n');
  process.exit(1);
}

/* ANTHROPIC_API_KEY 를 자동으로 읽습니다.
   AI 서버가 몰릴 때(529) SDK가 알아서 잠시 쉬었다 다시 시도합니다.
   기본값은 2번인데, 진단 한 번이 아까우므로 조금 넉넉히 잡습니다. */
const anthropic = new Anthropic({ maxRetries: 5 });

/* ── 오류를 사람이 읽을 수 있는 말로 바꿉니다 ──────────────────────────
   그대로 두면 화면에 {"type":"error",...} 같은 원문이 나와서
   무엇을 해야 할지 알 수 없습니다. */
function friendlyError(err) {
  const s = err.status;
  const raw = err.message || '';

  if (s === 529 || s === 503) {
    return 'AI 서버가 지금 몰려 있습니다. 20~30초 뒤에 다시 시도해 주세요. (일시적인 현상입니다)';
  }
  if (s === 429) {
    return 'AI 요청이 잠시 한꺼번에 몰렸습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (s === 401 || s === 403) {
    return 'AI 서비스가 키를 거부했습니다. 서버의 API 키 설정을 확인해 주세요.';
  }
  if (/credit|balance|quota|billing/i.test(raw)) {
    return 'AI 사용 잔액이나 한도가 부족합니다. 콘솔에서 확인해 주세요.';
  }
  if (s >= 500) {
    return `AI 서버에 문제가 생겼습니다 (HTTP ${s}). 잠시 후 다시 시도해 주세요.`;
  }
  return raw;
}

/* ── AI에게 시킬 일을 글로 적는 부분 ───────────────────────────────────
   checklist.js의 내용을 그대로 문장으로 풀어 넣습니다.
   체크리스트를 고치면 이 지시문도 자동으로 바뀝니다. */
function checklistText() {
  return CATEGORIES.map(function (cat) {
    const lines = cat.items.map(function (item) {
      return `   ${item.id}  ${item.ask}`;
    }).join('\n');
    return `[${cat.label}] (key: ${cat.key})\n${lines}`;
  }).join('\n\n');
}

function buildPrompt() {
  return `당신은 도시 공간의 안전 취약성을 진단하는 전문가입니다.
제시된 거리 이미지 한 장을 보고, 아래 7대 사회재난 분야별 체크리스트의
**모든 항목에 하나씩 답한 뒤**, 그 답을 근거로 분야별 취약성 점수를 매겨 주세요.

## 가장 중요한 규칙
- **사진에 실제로 보이는 것만으로 판단하세요.** 이 진단 결과는 국비 신청의 근거
  문서가 되므로, 추측이 섞이면 안 됩니다.
- 지역 통계, 일반적인 경향, 사진 밖의 정보로 판단하지 마세요.

## 항목별로 답하는 방법
각 분야의 findings 에 **그 분야의 모든 항목 번호를 하나도 빠짐없이** 넣으세요.
항목마다 이렇게 답합니다.

- item   : 항목 번호 (예: "CRM-1")
- answer : "yes" = 질문에 해당함 / "no" = 해당하지 않음 / "unknown" = 사진으로 확인 불가
- note   : 그렇게 판단한 근거를 사진에서 본 그대로 짧게
           (예: "가로등 미설치", "우측 담장 높이 2m로 시야 차단", "화면에 안 나옴")

**확인할 수 없으면 반드시 "unknown" 으로 답하세요.** 짐작해서 yes/no 를 고르면
없는 시설물이 처방되거나 필요한 시설물이 빠집니다. 모른다고 답하는 것이
틀리게 답하는 것보다 낫습니다.

## 점수는 항목 답과 어긋나면 안 됩니다
항목에서 위험 요소를 여러 개 찾아 놓고 점수를 낮게 주거나, 그 반대로 하지 마세요.
확인된 문제 항목이 많을수록 점수가 높아야 합니다.

## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${checklistText()}

## 판단이 어려울 때
- 사진이 흐리거나, 실내이거나, 거리 풍경이 아니면 image_quality 를 "unusable" 로
  표시하고 모든 점수를 0, 모든 항목을 "unknown", confidence 를 "low" 로 하세요.
- 확인 가능한 항목이 절반도 안 되면 confidence 를 "low" 로 하세요.
- 위험 요소가 안 보인다고 해서 무조건 낮은 점수를 주지는 마세요.
  안전 시설이 갖춰진 것이 확인되어야 낮은 점수입니다.`;
}

/* ── 재판독 지시문 ────────────────────────────────────────────────────
   연구원이 "AI가 잘못 봤다"고 지적했을 때 쓰는 지시문입니다.

   핵심: 지적한 사람은 현장과 이미지를 직접 확인한 전문가이므로,
   AI의 이전 판독보다 그 지적을 우선합니다. AI가 자기 판단을 고집하면
   이 기능 자체가 무의미해집니다. */
function buildRevisePrompt(previous, note) {
  const prevText = CATEGORIES.map(function (cat) {
    const p = previous[cat.key] || {};
    const lines = (p.findings || []).map(function (f) {
      return `    ${f.id} ${f.answer}${f.note ? ' — ' + f.note : ''}`;
    }).join('\n');
    return `[${cat.label}] ${p.score}점\n${lines || '    (항목 판독 없음)'}`;
  }).join('\n');

  return `앞서 당신이 이 거리 이미지를 판독한 결과에 대해, 현장을 아는 연구원이
잘못된 부분을 지적했습니다. 지적을 반영해 판독 결과를 다시 작성하세요.

## 이전 판독 결과
${prevText}

## 연구원의 지적
${note}

## 재판독 규칙
- **연구원의 지적이 당신의 이전 판독보다 우선합니다.** 지적받은 내용은 사실로
  받아들이고, 그에 맞게 판독과 점수를 고치세요. 이전 판단을 옹호하지 마세요.
- 잘못 본 대상이 있었다면, 그것을 근거로 매겼던 점수도 함께 다시 계산하세요.
  (예: 없는 시설을 있다고 봤다면 점수가 올라가야 하고, 위험 요소를 잘못 봤다면
   점수가 내려가야 합니다.)
- **지적과 관련이 없는 분야는 이전 판독을 그대로 유지하세요.** 지적 한 줄 때문에
  전체를 새로 쓰지 마세요. 관련 없는 항목의 answer 도 그대로 두세요.
- 여전히 사진에 보이는 것만으로 판단합니다. 지적 내용을 넘어서는 추측은 하지 마세요.
- findings 에는 **모든 항목**을 다시 넣되, 지적이 닿는 항목만 고쳐서 적으세요.
  개선 시설물이 이 항목 답으로 정해지므로, 잘못 본 항목을 고치면 처방도 바뀝니다.

## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${checklistText()}`;
}

/* ── AI가 반드시 이 모양으로 답하도록 강제하는 틀 ─────────────────────
   이걸 지정해 두면 AI가 엉뚱한 형식으로 답할 수 없습니다. */
function categorySchema(cat) {
  return {
    type: 'object',
    properties: {
      score: { type: 'integer', description: '0~100. 높을수록 위험' },
      findings: {
        type: 'array',
        /* 개수를 스키마로 못 박지 않습니다 — minItems 는 0이나 1만 허용됩니다.
           대신 지시문에서 전부 답하게 하고, 빠진 항목은 readFindings 가
           "확인 불가"로 채웁니다 (없는 시설물을 처방하지 않는 쪽이 안전). */
        minItems: 1,
        description: `${cat.label} 체크리스트 ${cat.items.length}개 항목 전부에 하나씩 답합니다 ` +
                     `(${cat.items.map(function (i) { return i.id; }).join(', ')})`,
        items: {
          type: 'object',
          properties: {
            item: { type: 'string', enum: cat.items.map(function (i) { return i.id; }) },
            answer: {
              type: 'string',
              enum: ['yes', 'no', 'unknown'],
              description: 'yes=질문에 해당함 / no=해당하지 않음 / unknown=사진으로 확인 불가',
            },
            note: { type: 'string', description: '사진에서 본 근거를 짧게' },
          },
          required: ['item', 'answer', 'note'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['score', 'findings', 'confidence'],
    additionalProperties: false,
  };
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    image_quality: {
      type: 'string',
      enum: ['good', 'poor', 'unusable'],
      description: '진단 입력 이미지로서의 적합도',
    },
    categories: {
      type: 'object',
      properties: Object.fromEntries(
        CATEGORIES.map(function (c) { return [c.key, categorySchema(c)]; })
      ),
      required: CATEGORIES.map(function (c) { return c.key; }),
      additionalProperties: false,
    },
  },
  required: ['image_quality', 'categories'],
  additionalProperties: false,
};

/* ── AI의 항목별 답을 화면이 쓸 모양으로 옮깁니다 ──────────────────────
   체크리스트(어느 답이 문제인가)는 서버만 알고 있으므로, "문제 있음"
   판정을 여기서 붙여서 넘깁니다. 화면과 규칙표는 risk 값만 보면 됩니다.

   observed / notVisible 은 이 답에서 만들어 냅니다. 화면 쪽 표시 형식은
   예전 그대로라 진단·리포트 화면을 고칠 필요가 없습니다. */
function readFindings(cat, raw) {
  const answered = {};
  (raw || []).forEach(function (f) { answered[f.item] = f; });

  return cat.items.map(function (item) {
    const f = answered[item.id] || { answer: 'unknown', note: '' };
    const answer = f.answer === 'yes' || f.answer === 'no' ? f.answer : 'unknown';
    return {
      id: item.id,
      ask: item.ask,
      answer: answer,
      note: (f.note || '').trim(),
      risk: answer === item.risk,      // 이 항목이 "문제 있음"인가
    };
  });
}


/* ── 실제 AI 호출 ──────────────────────────────────────────────────────
   ★ 폐쇄망 전환 시 이 함수 안쪽만 로컬 모델 호출로 바꾸면 됩니다. */
async function callAI(mediaType, base64Data, promptText) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: promptText },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('AI가 이 이미지에 대한 판독을 거부했습니다.');
  }

  const textBlock = response.content.find(function (b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('AI 응답에서 판독 결과를 찾지 못했습니다.');

  console.log(
    `  · 사용 토큰: 입력 ${response.usage.input_tokens}, 출력 ${response.usage.output_tokens}`
  );
  return JSON.parse(textBlock.text);
}

/* ── 진단 요청 처리 ──────────────────────────────────────────────────── */
/* ════════════════════════════════════════════════════════════════════
   개선 후 이미지 생성 (4단계 시각화)

   원본 거리 사진 + 확정된 시설물 목록 → 개선 후 이미지.

   ★ 가장 중요한 것은 "원본을 안 건드리는 것"입니다.
     개선 전/후인데 배경 건물이나 간판이 달라지면 행정 문서로 쓸 수 없습니다.
     그래서 지시문의 절반이 "바꾸지 말라"는 내용입니다.
   ════════════════════════════════════════════════════════════════════ */

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = 'https://api.openai.com/v1';

/* ── 화면에서 골라 쓸 수 있는 이미지 생성 모델 ────────────────────────
   어느 쪽이 원본을 잘 보존하는지는 같은 사진으로 직접 비교해 봐야 알 수
   있어서 목록으로 열어 둡니다. (아무 이름이나 받지 않도록 여기 적힌 것만 허용)

   ★ 모델을 추가하려면 이 목록에 한 줄만 넣으면 됩니다.
     화면의 선택 상자는 /api/models 로 이 목록을 받아 스스로 채웁니다.
     provider 가 같으면 호출 코드도 그대로 재사용됩니다.

   키가 없는 제공사의 모델은 화면 목록에 아예 나오지 않습니다. */
const IMAGE_MODELS = [
  { id: 'gemini-3-pro-image',     provider: 'gemini', label: 'Gemini 3 Pro · 고성능' },
  { id: 'gemini-3.1-flash-image', provider: 'gemini', label: 'Gemini 3.1 Flash · 빠름' },
  { id: 'gemini-2.5-flash-image', provider: 'gemini', label: 'Gemini 2.5 Flash' },
  { id: 'gpt-image-1',            provider: 'openai', label: 'GPT Image 1 · 원본 보존' },
  { id: 'gpt-image-1-mini',       provider: 'openai', label: 'GPT Image 1 mini · 저렴' },
];

function providerKey(provider) {
  const key = provider === 'openai' ? OPENAI_KEY : GEMINI_KEY;
  /* .env.example 을 그대로 복사만 하고 안 채운 경우를 걸러 냅니다 */
  return key && key.indexOf('붙여넣') === -1 ? key : '';
}

function imageModelById(id) {
  return IMAGE_MODELS.find(function (m) { return m.id === id; }) || null;
}

/* 지금 키가 있어서 실제로 쓸 수 있는 모델만 */
function usableImageModels() {
  return IMAGE_MODELS.filter(function (m) { return providerKey(m.provider); });
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || IMAGE_MODELS[0].id;

function buildGeneratePrompt(facilities, note, fromGenerated) {
  const list = facilities.map(function (f) { return `- ${f}`; }).join('\n');

  const request = note
    ? `\n\nREVISION REQUESTED BY THE REVIEWER — apply this faithfully:\n${note}\n` +
      `The reviewer has looked at the image and asked for this specific change.\n` +
      `Treat it as the priority. Change what they asked for and nothing else.`
    : '';

  /* 이미 시설물이 들어간 이미지를 다시 손보는 경우 —
     시설물을 또 추가하지 않도록 분명히 알려 줍니다. */
  if (fromGenerated) {
    return `You are revising an "after improvement" visualization for a Korean public safety
report. The provided image ALREADY has the safety facilities added.

TASK
Apply only the revision requested below. Do not add the facilities again — they are
already present. Do not re-render or restyle anything the reviewer did not mention.

FACILITIES ALREADY PRESENT (for your reference only — do not duplicate)
${list}${request}

PRESERVE EVERYTHING ELSE
- Buildings, signage, road markings, vehicles, sky, lighting and camera angle stay as they are.
- Keep the facilities that are already in place unless the revision says otherwise.
- Photorealistic. No labels, arrows, captions or watermarks.

The scene is a Korean urban street.`;
  }

  return `You are producing an "after improvement" visualization for a Korean public safety
report. The result is attached to an official document, so accuracy matters more
than beauty.

TASK
Edit the provided street photograph by adding ONLY the safety facilities listed below.${request}

PRESERVE THE ORIGINAL — this is the most important requirement:
- Buildings, windows, walls, signage, shop fronts, road markings, parked vehicles,
  poles, sky, vegetation, lighting and camera angle must remain EXACTLY as they are.
- Do not restyle, recolor, relight, sharpen, crop or re-render the scene.
- Do not alter or invent any text, lettering, shop names or license plates.
- If you cannot add a facility without changing the rest of the scene, leave it out.

FACILITIES TO ADD
${list}

HOW TO ADD THEM
- Place each facility where it would realistically be installed on this street.
- Match the perspective, scale, shadows and lighting of the original photograph.
- Use the ordinary Korean public design for these facilities.
- Photorealistic. No labels, arrows, captions, callouts or watermarks.

The scene is a Korean urban street.`;
}

/* 어느 제공사냐에 따라 호출 방식이 다릅니다.
   지시문(buildGeneratePrompt)과 돌려주는 모양은 양쪽이 똑같으므로,
   화면과 나머지 코드는 어느 모델인지 알 필요가 없습니다. */
async function callImageAI(mediaType, base64Data, facilities, model, note, fromGenerated) {
  const def = imageModelById(model);
  if (def && def.provider === 'openai') {
    return callOpenAIImage(mediaType, base64Data, facilities, model, note, fromGenerated);
  }
  return callGeminiImage(mediaType, base64Data, facilities, model, note, fromGenerated);
}

/* ── OpenAI (GPT Image) ───────────────────────────────────────────────
   원본 사진을 고쳐 그리는 것이므로 "만들기(generations)"가 아니라
   "고치기(edits)" 쪽을 씁니다. 파일 업로드 형식이라 JSON이 아닙니다.

   input_fidelity: 'high' — 원본을 최대한 유지하라는 지시입니다.
   이 앱의 판단 기준이 "원본 보존"이라 반드시 켭니다. */
async function callOpenAIImage(mediaType, base64Data, facilities, model, note, fromGenerated) {
  const ext = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png';
  const blob = new Blob([Buffer.from(base64Data, 'base64')], { type: mediaType });

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', buildGeneratePrompt(facilities, note, fromGenerated));
  form.append('image', blob, `input.${ext}`);
  form.append('n', '1');
  form.append('size', 'auto');            // 원본 비율에 맞춰 알아서
  form.append('quality', 'high');
  form.append('input_fidelity', 'high');  // 원본을 최대한 유지

  const res = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,                            // Content-Type 은 fetch 가 알아서 붙입니다
  });

  const body = await res.json().catch(function () { return null; });

  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    if (res.status === 404 || /model/i.test(msg)) {
      const names = await listOpenAIImageModels();
      throw new Error(`${msg}\n지금 쓸 수 있는 이미지 모델: ${names.join(', ') || '조회 실패'}\n` +
                      `(요청한 모델: ${model} — 화면의 모델 선택에서 다른 것을 골라 보세요)`);
    }
    throw new Error(msg);
  }

  const first = body && body.data && body.data[0];
  if (!first || !first.b64_json) throw new Error('이미지를 돌려받지 못했습니다.');

  return {
    dataUrl: `data:image/png;base64,${first.b64_json}`,
    note: '',
  };
}

async function listOpenAIImageModels() {
  try {
    const res = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    });
    const body = await res.json();
    return (body.data || [])
      .map(function (m) { return m.id; })
      .filter(function (id) { return /image/i.test(id); });
  } catch { return []; }
}

/* ── Google (Gemini) ────────────────────────────────────────────────── */
async function callGeminiImage(mediaType, base64Data, facilities, model, note, fromGenerated) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Data } },
          { text: buildGeneratePrompt(facilities, note, fromGenerated) },
        ],
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  const body = await res.json().catch(function () { return null; });

  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    /* 모델 이름이 바뀌었을 때를 대비해, 쓸 수 있는 모델을 함께 알려 줍니다 */
    if (res.status === 404 || /model/i.test(msg)) {
      const names = await listGeminiImageModels();
      throw new Error(`${msg}\n지금 쓸 수 있는 이미지 모델: ${names.join(', ') || '조회 실패'}\n` +
                      `(요청한 모델: ${model} — 화면의 모델 선택에서 다른 것을 골라 보세요)`);
    }
    throw new Error(msg);
  }

  /* 응답에서 이미지 조각을 찾습니다 (형식이 조금 달라도 견디도록) */
  const parts = (body && body.candidates && body.candidates[0] &&
                 body.candidates[0].content && body.candidates[0].content.parts) || [];
  for (const part of parts) {
    const inline = part.inline_data || part.inlineData;
    if (inline && inline.data) {
      return {
        dataUrl: `data:${inline.mime_type || inline.mimeType || 'image/png'};base64,${inline.data}`,
        note: parts.map(function (p) { return p.text; }).filter(Boolean).join(' ').slice(0, 400),
      };
    }
  }

  const said = parts.map(function (p) { return p.text; }).filter(Boolean).join(' ');
  throw new Error('이미지를 돌려받지 못했습니다.' + (said ? ` 모델 응답: ${said.slice(0, 300)}` : ''));
}

/* 쓸 수 있는 이미지 생성 모델 목록 — 오류 안내에 씁니다 */
async function listGeminiImageModels() {
  try {
    const res = await fetch(`${GEMINI_BASE}/models?key=${GEMINI_KEY}&pageSize=200`);
    const body = await res.json();
    return (body.models || [])
      .filter(function (m) { return /image/i.test(m.name); })
      .map(function (m) { return m.name.replace('models/', ''); });
  } catch { return []; }
}

async function handleGenerate(req, res) {
  if (!usableImageModels().length) {
    return sendJson(res, 503, {
      error: '이미지 생성 키가 설정되지 않았습니다. server/.env 에 GEMINI_API_KEY 또는 ' +
             'OPENAI_API_KEY 를 채운 뒤 서버를 다시 켜 주세요.',
    });
  }
  if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) {
    return sendJson(res, 401, { error: '접속 암호가 필요합니다.', needCode: true });
  }
  checkQuota(req);

  const body = await readJsonBody(req);
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(body.imageDataUrl || '');
  if (!match) return sendJson(res, 400, { error: '원본 이미지가 없습니다.' });

  const facilities = (body.facilities || []).filter(Boolean);
  if (!facilities.length) return sendJson(res, 400, { error: '반영할 시설물이 없습니다.' });

  /* 화면에서 고른 모델. 목록에 없거나 그 제공사 키가 없으면
     쓸 수 있는 모델 중 첫 번째로 대신합니다. */
  const usable = usableImageModels();
  const picked = imageModelById(body.model);
  const def = (picked && providerKey(picked.provider)) ? picked : usable[0];
  const model = def.id;

  /* 연구원이 적어 보낸 수정 요청과, 그 요청을 어느 이미지에 반영할지 */
  const note = String(body.note || '').trim().slice(0, 1000);
  const fromGenerated = !!body.fromGenerated;

  const [, mediaType, base64Data] = match;
  console.log(`[이미지 생성] ${def.provider} ${model} / 시설물 ${facilities.length}종: ${facilities.join(', ')}`);

  const out = await callImageAI(mediaType, base64Data, facilities, model, note, fromGenerated);
  console.log(`  · 생성 완료 (${Math.round(out.dataUrl.length / 1024)}KB)`);
  sendJson(res, 200, Object.assign({ model: model }, out));
}

async function handleDiagnose(req, res, isRevise) {
  // 접속 암호를 정해 둔 경우에만 확인합니다
  if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) {
    return sendJson(res, 401, { error: '접속 암호가 필요합니다.', needCode: true });
  }
  checkQuota(req);

  const body = await readJsonBody(req);

  // 브라우저가 보낸 "data:image/png;base64,AAAA..." 를 두 조각으로 나눕니다
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(body.imageDataUrl || '');
  if (!match) {
    return sendJson(res, 400, { error: '이미지가 없거나 형식이 올바르지 않습니다.' });
  }
  const [, mediaType, base64Data] = match;

  let promptText;
  if (isRevise) {
    if (!body.note || !body.previous) {
      return sendJson(res, 400, { error: '어디가 잘못되었는지 알려 주셔야 다시 판독할 수 있습니다.' });
    }
    console.log(`[재판독 요청] 지적: ${String(body.note).slice(0, 80)}`);
    promptText = buildRevisePrompt(body.previous, body.note);
  } else {
    console.log(`[진단 요청] ${mediaType}, ${Math.round(base64Data.length / 1024)}KB`);
    promptText = buildPrompt();
  }

  const raw = await callAI(mediaType, base64Data, promptText);

  // AI가 0~100을 벗어난 값을 줄 가능성에 대비해 안전하게 잘라 냅니다
  const categories = {};
  for (const cat of CATEGORIES) {
    const r = raw.categories[cat.key];
    const findings = readFindings(cat, r.findings);

    categories[cat.key] = {
      score: Math.max(0, Math.min(100, Math.round(r.score))),
      findings: findings,
      /* 화면 표시용 — 항목 답에서 만들어 냅니다 */
      observed: findings
        .filter(function (f) { return f.answer !== 'unknown' && f.note; })
        .map(function (f) { return f.note; }),
      notVisible: findings
        .filter(function (f) { return f.answer === 'unknown'; })
        .map(function (f) { return f.ask; }),
      confidence: r.confidence,
    };
  }

  console.log(
    '  · 결과: ' +
    CATEGORIES.map(function (c) {
      const n = categories[c.key].findings.filter(function (f) { return f.risk; }).length;
      return `${c.label} ${categories[c.key].score}(문제 ${n})`;
    }).join(', ')
  );

  /* AI가 항목을 빠뜨리면 그 항목은 "확인 불가"가 되어 처방에서 빠집니다.
     조용히 넘어가면 왜 시설물이 적게 나왔는지 알 수 없으므로 남깁니다. */
  const skipped = CATEGORIES
    .map(function (c) {
      const miss = categories[c.key].findings.filter(function (f) {
        return f.answer === 'unknown' && !f.note;
      }).length;
      return miss ? `${c.label} ${miss}개` : null;
    })
    .filter(Boolean);
  if (skipped.length) console.log(`  · 답하지 않은 항목(확인 불가로 처리): ${skipped.join(', ')}`);
  sendJson(res, 200, { imageQuality: raw.image_quality, categories: categories });
}

/* ── 아래는 웹서버 기본 동작 (건드릴 일 거의 없습니다) ─────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > 30 * 1024 * 1024) {          // 이미지 30MB 제한
        reject(new Error('이미지가 너무 큽니다 (30MB 초과).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('요청 형식이 올바르지 않습니다.')); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.resolve(SITE_ROOT, '.' + (urlPath === '/' ? '/index.html' : urlPath));

  // 프로젝트 폴더 밖의 파일은 절대 내주지 않습니다
  if (filePath !== SITE_ROOT && !filePath.startsWith(SITE_ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('파일을 찾을 수 없습니다.');
  }
}

const server = http.createServer(async function (req, res) {
  /* 다른 주소(예: GitHub Pages)에서도 이 서버를 부를 수 있게 허용 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-access-code');

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
    } else if (req.method === 'POST' && req.url === '/api/diagnose') {
      await handleDiagnose(req, res, false);
    } else if (req.method === 'POST' && req.url === '/api/revise') {
      await handleDiagnose(req, res, true);   // 연구원 지적을 반영한 재판독
    } else if (req.method === 'POST' && req.url === '/api/generate') {
      await handleGenerate(req, res);         // 개선 후 이미지 생성
    } else if (req.method === 'GET' && req.url === '/api/models') {
      /* 화면의 모델 선택 상자가 이 목록으로 채워집니다.
         키가 없는 제공사의 모델은 애초에 내려보내지 않습니다. */
      sendJson(res, 200, {
        models: usableImageModels().map(function (m) {
          return { id: m.id, label: m.label, provider: m.provider };
        }),
      });
    } else if (req.method === 'GET') {
      await serveStatic(req, res);
    } else {
      res.writeHead(405).end('Method Not Allowed');
    }
  } catch (err) {
    console.error('[오류]', err.status || '', err.message);
    /* 529 처럼 표준이 아닌 코드는 중계 구간에서 그대로 전달되지 않을 수 있어
       500으로 맞춥니다. 사용자에게 보이는 것은 아래 안내 문구입니다. */
    const status = (err.status && err.status >= 400 && err.status < 500) ? err.status : 500;
    if (!res.headersSent) sendJson(res, status, { error: friendlyError(err) });
  }
});

server.listen(PORT, function () {
  console.log('');
  console.log('  AI 안전진단 서버가 켜졌습니다.');
  console.log(`  브라우저에서 이 주소를 여세요 →  http://localhost:${PORT}`);
  console.log('');
  console.log(`  요금 상한: 하루 ${DAILY_LIMIT}회 / 한 사람당 1시간 ${HOURLY_LIMIT_PER_IP}회`);
  console.log(`  접속 암호: ${ACCESS_CODE ? '사용 중' : '없음 (누구나 사용 가능)'}`);
  const imgs = usableImageModels();
  console.log(`  이미지 생성: ${imgs.length
    ? `${imgs.length}종 사용 가능 — ${imgs.map(function (m) { return m.id; }).join(', ')}`
    : '키 없음 — server/.env 의 GEMINI_API_KEY 또는 OPENAI_API_KEY 를 채워 주세요'}`);
  if (!providerKey('openai')) {
    console.log('    · GPT 이미지 모델을 쓰려면 .env 에 OPENAI_API_KEY 를 추가하세요');
  }
  console.log('');
  console.log('  (끄려면 이 창에서 Ctrl+C)');
  console.log('');
});



