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

const anthropic = new Anthropic();  // ANTHROPIC_API_KEY 를 자동으로 읽습니다

/* ── AI에게 시킬 일을 글로 적는 부분 ───────────────────────────────────
   checklist.js의 내용을 그대로 문장으로 풀어 넣습니다.
   체크리스트를 고치면 이 지시문도 자동으로 바뀝니다. */
function buildPrompt() {
  const checklistText = CATEGORIES.map(function (cat) {
    const lines = cat.items.map(function (item) { return `   - ${item}`; }).join('\n');
    return `[${cat.label}] (key: ${cat.key})\n${lines}`;
  }).join('\n\n');

  return `당신은 도시 공간의 안전 취약성을 진단하는 전문가입니다.
제시된 거리 이미지 한 장을 보고, 아래 7대 사회재난 분야별 체크리스트에 따라
취약성 점수를 매겨 주세요.

## 가장 중요한 규칙
- **사진에 실제로 보이는 것만으로 판단하세요.** 이 진단 결과는 국비 신청의 근거
  문서가 되므로, 추측이 섞이면 안 됩니다.
- 지역 통계, 일반적인 경향, 사진 밖의 정보로 점수를 매기지 마세요.
- 체크리스트 항목 중 사진으로 확인할 수 없는 것은 추측하지 말고
  not_visible 목록에 넣으세요.
- observed 에는 **사진에서 실제로 본 것**만 짧은 문장으로 적으세요.
  (예: "가로등 없음", "보도와 차도 미분리", "담장 높이 2m 이상")

## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${checklistText}

## 판단이 어려울 때
- 사진이 흐리거나, 실내이거나, 거리 풍경이 아니면 image_quality 를 "unusable" 로
  표시하고 모든 점수를 0, confidence 를 "low" 로 하세요.
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
    return `[${cat.label}] ${p.score}점\n  판독: ${(p.observed || []).join(' / ') || '없음'}`;
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
  전체를 새로 쓰지 마세요.
- 여전히 사진에 보이는 것만으로 판단합니다. 지적 내용을 넘어서는 추측은 하지 마세요.
- observed 에는 고쳐진 최종 판독 내용을 적으세요.

## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${CATEGORIES.map(function (cat) {
  return `[${cat.label}] (key: ${cat.key})\n` + cat.items.map(function (i) { return `   - ${i}`; }).join('\n');
}).join('\n\n')}`;
}

/* ── AI가 반드시 이 모양으로 답하도록 강제하는 틀 ─────────────────────
   이걸 지정해 두면 AI가 엉뚱한 형식으로 답할 수 없습니다. */
const categorySchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: '0~100. 높을수록 위험' },
    observed: {
      type: 'array',
      items: { type: 'string' },
      description: '사진에서 실제로 확인한 것들 (짧은 문장)',
    },
    not_visible: {
      type: 'array',
      items: { type: 'string' },
      description: '체크리스트 항목 중 사진으로 확인 불가한 것들',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['score', 'observed', 'not_visible', 'confidence'],
  additionalProperties: false,
};

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
        CATEGORIES.map(function (c) { return [c.key, categorySchema]; })
      ),
      required: CATEGORIES.map(function (c) { return c.key; }),
      additionalProperties: false,
    },
  },
  required: ['image_quality', 'categories'],
  additionalProperties: false,
};

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
    categories[cat.key] = {
      score: Math.max(0, Math.min(100, Math.round(r.score))),
      observed: r.observed,
      notVisible: r.not_visible,
      confidence: r.confidence,
    };
  }

  console.log(
    '  · 결과: ' +
    CATEGORIES.map(function (c) { return `${c.label} ${categories[c.key].score}`; }).join(', ')
  );
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
    } else if (req.method === 'GET') {
      await serveStatic(req, res);
    } else {
      res.writeHead(405).end('Method Not Allowed');
    }
  } catch (err) {
    console.error('[오류]', err.message);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
  }
});

server.listen(PORT, function () {
  console.log('');
  console.log('  AI 안전진단 서버가 켜졌습니다.');
  console.log(`  브라우저에서 이 주소를 여세요 →  http://localhost:${PORT}`);
  console.log('');
  console.log(`  요금 상한: 하루 ${DAILY_LIMIT}회 / 한 사람당 1시간 ${HOURLY_LIMIT_PER_IP}회`);
  console.log(`  접속 암호: ${ACCESS_CODE ? '사용 중' : '없음 (누구나 사용 가능)'}`);
  console.log('');
  console.log('  (끄려면 이 창에서 Ctrl+C)');
  console.log('');
});
