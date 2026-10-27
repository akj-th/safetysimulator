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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import { CATEGORIES, SCORING_GUIDE } from './checklist.js';
import { legalBlock, PENDING } from './legal.js';
import * as auth from './auth.js';
import * as projects from './projects.js';

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
   사람만 AI 진단을 쓸 수 있습니다. 비워 두면 누구나 쓸 수 있습니다.

   ⏸ 2026-09-14 부터 **쓰지 않습니다** — 계정 로그인(AUTH_MODE=account)으로
   바뀌었습니다. 지우지 않고 남겨 둔 것은 되돌리기 위해서입니다.
   계정 방식에 문제가 생기면 렌더 환경변수 AUTH_MODE 를 code 로 바꾸면
   이 암호 방식이 그대로 다시 켜집니다. */
const ACCESS_CODE = process.env.ACCESS_CODE || '';

/* ── 접근통제 방식 (2026-09-14) ───────────────────────────────────────
     account  계정 로그인 + 관리자 승인 (기본값, 렌더 PostgreSQL 필요)
     code     예전 접속 암호(ACCESS_CODE) 방식 — **되돌리기용**
     off      아무것도 확인하지 않음 — **내 컴퓨터에서 개발할 때만**

   ★ account 인데 DB 에 연결하지 못하면 사이트를 **닫습니다.**
     열어 둔 채로 두면 로그인 없이 누구나 들어오기 때문입니다.
     조용히 열리는 것보다 "설정이 끝나지 않았다"고 닫히는 편이 안전합니다. */
const AUTH_MODE = ['account', 'code', 'off'].includes(process.env.AUTH_MODE)
  ? process.env.AUTH_MODE : 'account';

let _day = '';
let _dayCount = 0;
const _ipHits = new Map();

/* 접속자 IP — 요금 상한·로그인 기록이 **같은 방식**으로 읽도록 auth.js 한 곳에 둡니다 */
const clientIp = auth.clientIp;

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

/* ── AI 기능 문지기 ─────────────────────────────────────────────────
   진단·재판독·이미지 생성·의견 초안이 모두 이 함수 하나를 거칩니다.
   통과하면 로그인한 사람 정보를, 막히면 null 을 돌려주고 응답도 여기서 보냅니다.
   (예전에는 세 곳에 접속 암호 확인이 흩어져 있었습니다) */
async function guardApi(req, res) {
  if (AUTH_MODE === 'off') return { user: null };

  if (AUTH_MODE === 'code') {
    if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) {
      sendJson(res, 401, { error: '접속 암호가 필요합니다.', needCode: true });
      return null;
    }
    return { user: null };
  }

  if (!auth.authReady()) {
    sendJson(res, 503, { error: '로그인 설정이 끝나지 않아 사용할 수 없습니다. 관리자에게 문의해 주세요.' });
    return null;
  }
  const user = await auth.currentUser(req, { touch: true });
  if (!user) {
    sendJson(res, 401, { error: '로그인이 만료되었습니다. 다시 로그인해 주세요.', needLogin: true });
    return null;
  }
  return { user };
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
function checklistText(focus) {
  const keys = focus ? focus.keys : [];
  /* 중점 분야를 앞에 — 지시문 순서도 "먼저 보라"는 신호입니다 */
  const ordered = CATEGORIES.slice().sort(function (a, b) {
    return (keys.includes(b.key) ? 1 : 0) - (keys.includes(a.key) ? 1 : 0);
  });
  return ordered.map(function (cat) {
    const lines = cat.items.map(function (item) {
      return `   ${item.id}  ${item.ask}`;
    }).join('\n');
    const mark = keys.includes(cat.key) ? ' ★중점 분야 — 우선·상세 판독' : '';
    return `[${cat.label}] (key: ${cat.key})${mark}\n${lines}`;
  }).join('\n\n');
}

/* ── 지자체 중점 3분야 (2026-09-16, 9/15 행안부 국장 보고 요청) ────────────
   지자체별 중점 분야(data/stats/index.json 의 focusTypes — 2026-10-22 부터 지역안전지수 하위 등급 기준, 강원대 원본은 focusTypesKangwon —
   「대표_위험_선정_기준_표본수추가.xlsx」 신규 대표위험 + 자살)를 판독 지시문에 넣어
   그 분야 항목을 우선·상세히 보게 합니다.
   ★ 나머지 4개 분야는 없애지 않습니다 — 9/7 회의: "사진에서 문제가 확인된 분야는
     중점 분야가 아니어도 개선사업이 나와야 한다". 판독 항목·점수·처방 모두 그대로입니다.
   지자체는 **주소의 지자체 이름**으로 찾습니다. 주소가 아예 없을 때만 좌표에서 가장 가까운
   지자체 중심(FOCUS_MAX_KM 안)으로 찾습니다 — 주소가 있는데 41곳에 없으면(예: 서울 중구) 대상
   지자체가 아닌 것이므로 이웃 지자체의 중점 분야를 빌려 오지 않습니다.
   못 찾으면 중점 분야 없이 7개 분야를 같은 깊이로 봅니다(지금까지와 같은 판독). */
const FOCUS_MAX_KM = 10;     // 좌표로 찾을 때 지자체 중심에서 이보다 멀면 "그 지자체"로 보지 않음
let _regionIndex = null;
function regionIndex() {
  if (_regionIndex) return _regionIndex;
  try {
    const idx = JSON.parse(readFileSync(path.join(SITE_ROOT, 'data/stats/index.json'), 'utf8'));
    const keyOf = {};
    for (const k in idx.categories) keyOf[idx.categories[k]] = k;      // 한글 이름 → 분야 열쇠
    _regionIndex = idx.regions.map(function (r) {
      return { region: r.region, label: r.label, short: r.short, lat: r.lat, lng: r.lng,
               keys: (r.focusTypes || []).map(function (t) { return keyOf[t]; }).filter(Boolean),
               labels: r.focusTypes || [] };
    });
  } catch (e) {
    console.warn('[중점 분야] data/stats/index.json 을 읽지 못했습니다 —', e.message);
    _regionIndex = [];
  }
  return _regionIndex;
}
function focusFor(location) {
  const loc = location || {};
  const list = regionIndex();
  if (!list.length) return null;
  const addr = String(loc.addr || '').replace(/\s+/g, ' ');
  /* 긴 이름부터 — "중구"가 엉뚱한 곳에 먼저 붙지 않게 (auth.js regionOf 와 같은 방식) */
  const byAddr = addr && list.slice().sort(function (a, b) { return b.label.length - a.label.length; })
    .find(function (r) { return addr.includes(r.label); });
  if (byAddr) return byAddr;
  if (addr) return null;                     // 주소는 있는데 41곳 어디도 아님 → 대상 지자체 밖
  const lat = Number(loc.lat), lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null, bestKm = Infinity;
  for (const r of list) {
    const dy = (r.lat - lat) * 111.32, dx = (r.lng - lng) * 111.32 * Math.cos(lat * Math.PI / 180);
    const km = Math.sqrt(dx * dx + dy * dy);
    if (km < bestKm) { best = r; bestKm = km; }
  }
  return bestKm <= FOCUS_MAX_KM ? best : null;
}
/* ── 공간유형 13종 (2026-10-27, AURI 정호경 요청 2·4) ─────────────────────
   assets/space-risk.json 한 곳에서 읽습니다(화면의 적용사례 카드·서술형 사업과 같은 파일).
   AURI 표준사업가이드(안) 4쪽의 13개 세부 공간유형이며, 정의·단서는 AKJ 임시 작성입니다.
   AI 는 사진에 보이는 용도·기능으로 이 중 하나를 고르기만 합니다(처방에는 쓰지 않음 — 카드의 분류·서술용).
   "지역관리·네트워크형"(photo:false)은 사진으로 고를 수 있는 공간이 아니라 사업 운영 유형이라 뺍니다. */
let _spaceRisk = null;
function spaceRisk() {
  if (_spaceRisk) return _spaceRisk;
  try {
    const j = JSON.parse(readFileSync(path.join(SITE_ROOT, 'assets/space-risk.json'), 'utf8'));
    const types = (j.spaceTypes || []).filter(function (t) { return t.photo !== false; });
    _spaceRisk = { types: types, risks: j.riskFactors || [] };
  } catch (e) {
    console.warn('[공간유형] assets/space-risk.json 을 읽지 못했습니다 —', e.message);
    _spaceRisk = { types: [], risks: [] };
  }
  return _spaceRisk;
}
function spaceTypeNames() {
  return spaceRisk().types.map(function (t) { return t.name; });
}
function spaceBlock() {
  const types = spaceRisk().types;
  if (!types.length) return '';
  return `
## 공간유형 (space_type)
사진에 보이는 공간의 **용도·기능**으로 아래 세부 공간유형 중 가장 가까운 것을 primary 로 고르세요.
두 번째 성격이 뚜렷하면 secondary 로, 아니면 secondary 는 "없음" 으로 하세요.
reason 에는 사진의 어떤 요소(간판 업종, 건물 용도, 도로 형태 등)로 판단했는지 한 문장으로 적으세요.
${types.map(function (t) { return `- ${t.name} (${t.group}): ${t.def} — 단서: ${t.cues}`; }).join('\n')}
`;
}

/* ── 위치 정보 (2026-10-27, AURI 정호경 요청 3 "진단 결과 구체화") ─────────────
   판독 요약을 "○○길 일대 … 우려" 꼴로 쓰려면 도로명·건물명이 필요한데 사진만으로는 알 수 없습니다.
   1단계 지도에서 고른 자리의 주소·도로명·건물명을 넘기되, **문장의 위치 표현에만** 쓰게 합니다.
   점수·항목 답은 여전히 사진에 보이는 것만으로 정합니다. */
function locationBlock(loc) {
  const l = loc || {};
  const lines = [];
  if (l.roadAddr || l.addr) lines.push(`- 주소: ${l.roadAddr || l.addr}${l.jibunAddr && l.jibunAddr !== l.roadAddr ? ` (지번 ${l.jibunAddr})` : ''}`);
  if (l.road) lines.push(`- 도로명: ${l.road}`);
  if (l.bldg) lines.push(`- 가장 가까운 건물: ${l.bldg}`);
  if (l.dong) lines.push(`- 동: ${l.dong}`);
  if (!lines.length) return `
## 위치 정보
진단 지점의 주소 정보가 없습니다. 판독 요약의 위치는 사진에 보이는 공간 요소(예: "주거지 골목 교차부",
"상가 앞 보도")로만 쓰고, 도로명·시설명은 사진 속 표지판에 글자가 보일 때만 쓰세요.
`;
  return `
## 위치 정보 — 판독 요약의 "어디"를 쓰는 데만 사용 (판단 근거 아님)
${lines.join('\n')}
- 이 정보는 summary 의 위치 표현에만 씁니다. 점수와 항목 답은 사진에 보이는 것만으로 정합니다.
- **사진에 도로명판(파란 바탕 흰 글씨 "○○길")이 보이면 그 도로명을 먼저 쓰세요.** 위 주소의 도로명과 다르면
  사진이 진단 지점 주변에서 찍힌 것이므로 사진 속 도로명을 쓰되${l.road ? ` "${l.road} 인근"을 덧붙일 수 있습니다` : ''}.
  출처를 괄호로 적지 마세요(예: "(사진 속 도로명판)" 같은 표기 금지 — 문서에 그대로 실리는 문장입니다).
- 위 정보와 사진 어디에도 없는 도로명·건물명·시설명은 절대 지어내지 마세요.
`;
}

const SUMMARY_GUIDE = `
## 분야별 판독 요약 (summary) — 위치 + 현황 + 위험요인을 한 문장으로
각 분야마다 summary 에 사전진단서에 그대로 옮겨 쓸 문장을 **한 문장**으로 쓰세요.
- 꼴: "<위치> 일대에 <사진에서 확인된 현황>(으)로 인한 <위험요인> 우려"
  예) "시장4길 공설시장 주차장 출입부 일대에 방범 CCTV 미설치 및 가로등 간격 과다로 인한 야간 시야 확보 미흡 등 감시 사각지대 발생 우려"
- <위치>: 위치 정보의 도로명·건물명 + 사진에 보이는 공간 요소(주차장 출입부, 골목 교차부, 상가 앞 보도, 교량 진입부 등).
- <현황>: 문제로 답한 항목의 근거를 묶어 구체적으로(무엇이·어디에·얼마나). "노후"·"고장"처럼 상태를 말할 때는
  사진에 그 흔적(녹·파손·탈락 등)이 보일 때만 쓰세요.
- <위험요인>: 그 현황 때문에 생길 수 있는 위험을 명사형으로(감시 사각지대 발생, 보행자 차도 유입, 소방차 진입 지연, 추락 등).
- 문제로 답한 항목이 없으면 "<위치> 일대 사진상 뚜렷한 위험요인 미확인" 으로 쓰세요.
- 항목 답(findings)과 어긋나는 내용을 쓰지 마세요. 요약은 항목 답을 문장으로 묶은 것이어야 합니다.
`;

function focusBlock(focus) {
  if (!focus || !focus.keys.length) return '';
  return `
## 이 지자체의 중점 분야 — 우선·상세 판독
이 지점은 **${focus.label}** 에 있고, 지역안전진단에서 확정된 중점 분야는
**${focus.labels.join(' · ')}** 입니다.
- 이 ${focus.labels.length}개 분야의 항목은 사진을 **더 꼼꼼히** 살펴 답하세요. 작은 단서(간판의
  업종, 출입구의 개방 상태, 조명 기구의 유무, 쓰레기·적치물, 난간 높이 등)도 note 에 구체적으로 적으세요.
- 다만 이 분야에도 **없는 것을 있다고 하지 마세요.** 상세히 본다는 것은 근거를 더 자세히 적는다는
  뜻이지, 점수를 올리라는 뜻이 아닙니다.
- 나머지 분야도 **모든 항목에 반드시 답하고 같은 기준으로 점수를 매기세요.** 사진에 문제가
  보이면 중점 분야가 아니어도 그대로 반영합니다. 중점 분야가 아니라는 이유로 점수를 낮추거나
  "unknown" 으로 넘기지 마세요.
`;
}

function buildPrompt(focus, location) {
  return `당신은 도시 공간의 안전 취약성을 진단하는 전문가입니다.
제시된 거리 이미지 한 장을 보고, 아래 7대 사회재난 분야별 체크리스트의
**모든 항목에 하나씩 답한 뒤**, 그 답을 근거로 분야별 취약성 점수를 매겨 주세요.

## 가장 중요한 규칙
- **사진에 실제로 보이는 것만으로 판단하세요.** 이 진단 결과는 국비 신청의 근거
  문서가 되므로, 추측이 섞이면 안 됩니다.
- 지역 통계, 일반적인 경향, 사진 밖의 정보로 판단하지 마세요.
  (아래 '위치 정보'는 판독 요약의 위치를 적는 데만 쓰는 예외입니다.)
${focusBlock(focus)}${locationBlock(location)}
## 항목별로 답하는 방법
각 분야의 findings 에 **그 분야의 모든 항목 번호를 하나도 빠짐없이** 넣으세요.
항목마다 이렇게 답합니다.

- item   : 항목 번호 (예: "CRM-1")
- answer : "yes" = 질문에 해당함 / "no" = 해당하지 않음 / "unknown" = 사진으로 확인 불가
- note   : 그렇게 판단한 근거를 사진에서 본 그대로, **어디에 · 무엇이 · 어떤 상태인지** 구체적으로
           (예: "좌측 담장 높이 약 2m로 골목 안쪽 시야 차단", "전신주 부착 가로등 1기 외 조명 미확인",
                "교차부 모서리 4곳 어디에도 비상벨·위치 안내표지 없음", "화면에 안 나옴")
${SUMMARY_GUIDE}${spaceBlock()}

**확인할 수 없으면 반드시 "unknown" 으로 답하세요.** 짐작해서 yes/no 를 고르면
없는 시설물이 처방되거나 필요한 시설물이 빠집니다. 모른다고 답하는 것이
틀리게 답하는 것보다 낫습니다.

## 점수는 항목 답과 어긋나면 안 됩니다
항목에서 위험 요소를 여러 개 찾아 놓고 점수를 낮게 주거나, 그 반대로 하지 마세요.
확인된 문제 항목이 많을수록 점수가 높아야 합니다.

## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${checklistText(focus)}

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
function buildRevisePrompt(previous, note, focus, location) {
  const prevText = CATEGORIES.map(function (cat) {
    const p = previous[cat.key] || {};
    const lines = (Array.isArray(p.findings) ? p.findings : []).filter(Boolean).map(function (f) {
      return `    ${f.id} ${f.answer}${f.note ? ' — ' + f.note : ''}`;
    }).join('\n');
    return `[${cat.label}] ${p.score}점${p.summary ? `\n    요약: ${p.summary}` : ''}\n${lines || '    (항목 판독 없음)'}`;
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
- summary 도 고친 항목 답에 맞게 다시 쓰세요. 지적과 무관한 분야의 summary 는 그대로 두세요.
- space_type 은 지적이 공간의 용도에 관한 것일 때만 바꾸세요.
${locationBlock(location)}${SUMMARY_GUIDE}${spaceBlock()}
## 점수 기준 (0~100) — 점수가 높을수록 위험합니다
${SCORING_GUIDE}

## 분야별 체크리스트
${checklistText(focus)}`;
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
      summary: { type: 'string', description: '위치 + 현황 + 위험요인 한 문장 (예: "○○길 일대에 … 미설치로 인한 … 우려")' },
    },
    required: ['score', 'findings', 'confidence', 'summary'],
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
    /* 사진의 공간유형 (2026-10-27) — 적용사례 카드·서술형 사업의 분류용. 처방에는 쓰지 않습니다 */
    space_type: {
      type: 'object',
      properties: {
        primary: { type: 'string', enum: spaceTypeNames() },
        secondary: { type: 'string', enum: spaceTypeNames().concat(['없음']) },
        reason: { type: 'string', description: '사진의 어떤 요소로 판단했는지 한 문장' },
      },
      required: ['primary', 'secondary', 'reason'],
      additionalProperties: false,
    },
  },
  required: ['image_quality', 'categories', 'space_type'],
  additionalProperties: false,
};
/* 공간유형 목록(assets/space-risk.json)을 못 읽었으면 칸을 아예 뺍니다 — 전에는 '주거생활형' 하나로 채워져
   모든 사진이 설명 없이 주거생활형이 됐습니다(2026-10-27 점검) */
if (!spaceTypeNames().length) {
  delete RESULT_SCHEMA.properties.space_type;
  RESULT_SCHEMA.required = RESULT_SCHEMA.required.filter(function (k) { return k !== 'space_type'; });
}

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
  /* 답이 한도(max_tokens)에서 잘리면 JSON 이 반쯤 끊겨 읽을 수 없습니다 — 영어 오류 대신 다시 시도 안내.
     (2026-10-27 실측: 진단 한 번 출력 약 4,200 토큰이라 16,000 한도에는 여유가 있습니다) */
  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI 판독 결과가 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.');
  }

  const textBlock = response.content.find(function (b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('AI 응답에서 판독 결과를 찾지 못했습니다.');

  console.log(
    `  · 사용 토큰: 입력 ${response.usage.input_tokens}, 출력 ${response.usage.output_tokens}`
  );
  return parseAiJson(textBlock.text);
}

/* AI 가 돌려준 JSON 읽기 — 스키마로 형식을 강제하므로 실패할 일은 드물지만, 실패하면 알아듣는 말로 */
function parseAiJson(text) {
  try { return JSON.parse(text); }
  catch (e) { throw new Error('AI 응답을 읽지 못했습니다. 다시 시도해 주세요.'); }
}

/* ════════════════════════════════════════════════════════════════════
   진단서 서술 문단 초안 (AI 의견)

   (소결) 같은 자리는 수치에서 자동으로 이끌어낼 수 없는 **판단**입니다.
   그래서 평소에는 비워 두고, 연구원이 버튼을 눌렀을 때만 초안을 만듭니다.

   ★ 지어낸 법령을 막는 방법 ────────────────────────────────────────
   "법령을 근거로 쓰라"고만 하면 없는 조항을 만들어 냅니다. 그래서
   **인용 가능한 근거를 server/legal.js 에 적어 두고 그 밖은 금지**합니다.
   해당하는 근거가 없으면 "관련 근거 확인 필요"로 두게 합니다.
   비어 있는 편이 틀린 조문보다 낫습니다.

   ★ 원문 대조를 마친 조문만 넣습니다 (`verified: true`).
   대조 전인 것을 넣고 화면에 경고만 띄우면 실무자가 그대로 인용합니다.
   AI 에게 아예 보여 주지 않는 편이 확실합니다.

   ★ 근거는 세 유형이고 인용 방식이 다릅니다 (2026-09-07).
     법령  조문 번호와 제목까지만. 본문 전문은 인용하지 않습니다
           (개정으로 자구가 바뀌면 우리가 옮겨 적은 문구가 오류가 됩니다)
     정책  국정과제 등. "○○법 제△조에 따라"(X) / "…에 따른 사업 방향"(O)
     협의  회의록·검토 의견. 원문이 우리 손에 있어 요지를 풀어 써도 됩니다

   돌려주는 값도 문단 하나가 아니라 { text, basis } 로 나눕니다.
   어느 수치와 어느 근거로 이 문장이 나왔는지 화면에서 보여야 하기 때문입니다.
   ════════════════════════════════════════════════════════════════════ */

const OPINION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'basis'],
  properties: {
    text: {
      type: 'string',
      description: '문서에 그대로 실을 문단. 명사형으로 끝내고, 주어진 수치만 사용한다.',
    },
    basis: {
      type: 'array',
      description: '이 문단의 판단 근거. 화면에만 보이고 문서에는 실리지 않는다.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'detail'],
        properties: {
          kind: { type: 'string', enum: ['수치', '법령', '정책', '협의', '확인필요'] },
          detail: { type: 'string' },
        },
      },
    },
  },
};

function buildOpinionPrompt(section, context) {
  return `당신은 지자체 안전사업지구 사전진단서를 쓰는 실무자입니다.
아래 자리에 들어갈 문단의 **초안**을 작성하십시오.

── 작성할 자리 ──
${section}

── 주어진 자료 (이 안의 수치만 사용) ──
${context}

── 인용할 수 있는 근거 (이 목록 밖은 절대 인용 금지) ──
${legalBlock()}

── 반드시 지킬 것 ──
1. 위 "주어진 자료"에 없는 수치를 만들어 내지 마십시오. 통계를 추정하지 마십시오.
2. 위 근거 목록에 **없는** 법령·조례·조문 번호를 절대 쓰지 마십시오.
   해당하는 근거가 없으면 basis 에 kind:"확인필요" 로 적고 본문에서는 법령을 언급하지 마십시오.
   지어낸 조문이 하나라도 있으면 이 문서 전체를 쓸 수 없게 됩니다.
3. **법령은 조문 번호와 제목까지만** 쓰십시오. 조문 본문을 옮겨 적거나
   "…라고 규정하고 있다"처럼 내용을 풀어 쓰지 마십시오. 개정으로 자구가 바뀌면
   그대로 오류가 됩니다. 위에 적힌 인용 문구를 **글자 그대로** 쓰십시오.
4. **국정과제 등 정책 근거를 법령처럼 쓰지 마십시오.**
   "○○법 제△조에 따라" (X) / "국정과제 72·73에 따른 사업 방향" (O)
5. **조례는 절대 인용하지 마십시오.** 지자체마다 조례 이름과 조 번호가 다르고
   아직 확인되지 않았습니다. 조례 근거가 필요해 보이면 본문에는 쓰지 말고
   basis 에 kind:"확인필요", detail:"관련 조례 확인 필요" 로만 적으십시오.
6. 문장은 **명사형**으로 끝내십시오 (행정 문서 표준).
   예) "…구조적 관리가 필요한 것으로 판단됨", "…개입 강화가 요구됨"
7. 3~5문장, 400자 내외로 쓰십시오.
8. 확정되지 않은 것을 단정하지 마십시오. 자료가 없으면 "현장 확인 필요"로 두십시오.

basis 에는 이 문단이 무엇에 기대고 있는지 적으십시오.
  kind "수치"    — 주어진 자료에서 실제로 쓴 값
  kind "법령"    — 위 [법령] 항목. [ID] 와 인용 문구를 함께
  kind "정책"    — 위 [정책] 항목. 법령과 구분해서 적을 것
  kind "협의"    — 위 [협의] 항목
  kind "확인필요" — 근거를 찾지 못해 비워 둔 부분`;
}

async function callOpinionAI(promptText) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    output_config: { format: { type: 'json_schema', schema: OPINION_SCHEMA } },
    messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI가 작성을 거부했습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error('AI 문단이 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.');
  const block = response.content.find(function (b) { return b.type === 'text'; });
  if (!block) throw new Error('AI 응답에서 문단을 찾지 못했습니다.');
  console.log(`  · 사용 토큰: 입력 ${response.usage.input_tokens}, 출력 ${response.usage.output_tokens}`);
  return parseAiJson(block.text);
}

async function handleOpinion(req, res) {
  if (!(await guardApi(req, res))) return;

  const body = await readJsonBody(req);
  if (!body.section) return sendJson(res, 400, { error: '어느 자리에 쓸 문단인지 알려 주세요.' });
  checkQuota(req);   // 요청이 제대로 갖춰진 뒤에 셉니다 — 형식이 틀려 400 으로 끝나는 요청이 상한을 쓰지 않게

  console.log(`[의견 생성] ${String(body.section).slice(0, 60)}`);
  const out = await callOpinionAI(buildOpinionPrompt(body.section, body.context || '(제공된 자료 없음)'));

  sendJson(res, 200, {
    text: out.text,
    basis: out.basis || [],
    /* 대조 전이라 지시문에서 뺀 근거 — 화면에만 알립니다 (인용에는 쓰이지 않음) */
    pending: PENDING,
  });
}

/* ════════════════════════════════════════════════════════════════════
   서술형 맞춤형 사업 초안 (2026-10-27, AURI 정호경 요청 4 — 영천시 2차 사전진단서 예시안 형식)

   [공간유형] ➤ 위험요인 카드마다
     1. 현황 및 공간적 취약요인 상세 (○ (소제목) 설명)   2. 사업목적
     3. 개선 및 맞춤형 사업 적용 방안 (필수 개별사업 (E)/(A)/(H) 설명 → 효과 · 복합 맞춤형 사업 점·선·면)

   ★ 무엇을 AI 에게 맡기고 무엇을 맡기지 않는가
     · 어떤 사업을 넣을지는 **이미 정해져서 옵니다** — 처방 규칙 엔진(rules.js) + 연계표(assets/space-risk.json).
       measures[].name 을 스키마 enum 으로 묶어 목록 밖 사업을 쓸 수 없게 합니다.
     · AI 는 정해진 사업을 위험요인과 엮어 **문장으로 쓰기만** 합니다.
     · 위험요인–사업의 인과관계(연계표)는 지금 AKJ 임시 작성본입니다. AURI 자료가 오면 그 파일만 바뀝니다.
       회신 메일(10/27)에 적은 대로, 그 자료가 있어야 서술의 정확도가 올라갑니다.
   ════════════════════════════════════════════════════════════════════ */

/* 문체 예시 — AURI 영천시 2차 사전진단서 예시안(정호경, 2026-10-23) 카드 한 장에서 옮김 */
const NARRATIVE_EXAMPLE = `[공간유형 1] 상업·유흥 밀집형 ➤ 위험요인 ② 감시체계 부족
1. 현황 및 공간적 취약요인 상세
○ (출입부 감시 공백) 시장 입구(시장4길 52)와 공설시장 주차장 입구(시장4길 30)에 방범용 CCTV가 미설치되어, 시장 출입 인원·차량에 대한 감시 공백 발생
○ (범죄 억제력 부족) 출입부에 감시 안내표지판도 부재해 감시 인지에 따른 범죄 억제 효과가 낮고, 사건 발생 시 사후 추적·증거 확보 곤란
2. 사업목적
○ 시장·주차장 출입부의 감시 공백을 해소해 범죄 억제력을 높이고, CCTV와 순찰을 연계한 출입부 상시 감시체계 구축
3. 개선 및 맞춤형 사업 적용 방안
○ (필수 개별사업)
(E) 시장·주차장 입구 방범용 CCTV 및 촬영 안내표지판 설치: 시장 입구와 공설시장 주차장 입구의 감시 공백을 해소하고 감시 인지 효과 강화
(A) 출입부 거점 경찰·자율방범대 순찰동선 지정: 시장 입구·주차장 입구를 거점으로 CCTV 감시와 인적 순찰 연계
→ 출입부 상시 감시와 순찰을 연계해 범죄 억제력을 높이고, 사건 발생 시 신속한 사후 추적 기반 확보
○ (복합 맞춤형 사업) 영천공설시장 안심 보행길 조성사업(범죄·교통사고 복합)
§ (점 단위) 시장·주차장 출입부 및 주요 교차부의 방범·긴급신고·교통안전시설 집중 개선
§ (선 단위) 시장4길·시장2길의 조명·보행동선·시야 확보를 통한 연속적인 안심 보행길 조성
§ (면 단위) 시장 상권·주차장·주변 생활권을 연계한 주민·상인·경찰 협력형 통합 안전관리체계 구축`;

function narrativeSchema(rfIds, names) {
  const str = { type: 'string' };
  return {
    type: 'object', additionalProperties: false, required: ['cards', 'combo', 'checks'],
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['rf', 'status', 'purpose', 'measures', 'effect'],
          properties: {
            rf: { type: 'string', enum: rfIds },
            status: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['head', 'text'],
              properties: { head: str, text: str } } },
            purpose: str,
            measures: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'text'],
              properties: { name: { type: 'string', enum: names }, text: str } } },
            effect: str,
          },
        },
      },
      combo: { type: 'object', additionalProperties: false, required: ['name', 'fields', 'point', 'line', 'area'],
        properties: { name: str, fields: str, point: str, line: str, area: str } },
      checks: { type: 'array', items: str },
    },
  };
}

function buildNarrativePrompt(ctx) {
  const loc = ctx.location || {};
  const cardText = (ctx.cards || []).map(function (c, i) {
    return `── 카드 ${i + 1} (rf: ${c.rf}) ──
공간유형: ${c.space || '미정'}${c.spaceDef ? ` — ${c.spaceDef}` : ''}
안전 유형(분야): ${c.field}
위험요인: ${c.name}
위험요인–사업 연결 논리(연계표): ${c.logic || '(없음)'}
사진 판독 요약: ${c.summary || '(없음)'}
사진 판독 문제 항목:
${(c.findings || []).map(function (f) { return `  - ${f.id} ${f.ask} → ${f.note || '(근거 없음)'}`; }).join('\n') || '  (없음)'}
연계 사고 데이터(119 출동 통계): ${c.stats || '(없음)'}
사업 후보 (이 순서대로 measures 에 모두 쓰십시오):
${(c.measures || []).map(function (m) { return `  - [${m.hea || '-'}] ${m.name} (개입 단위 ${m.unit || '-'}, ${m.kind}) — 연결 근거: ${m.why || '-'}${m.overview ? ` / 사업 개요: ${m.overview}` : ''}`; }).join('\n')}`;
  }).join('\n\n');

  return `당신은 지역 안전진단 2차 사전진단서(현장보고서)를 쓰는 실무 연구원입니다.
아래 자료로 카드마다 서술형 초안을 쓰고, 이 지점 전체를 묶는 복합 맞춤형 사업 하나를 쓰십시오.

── 진단 지점 ──
지자체: ${ctx.region || '-'}
주소: ${loc.roadAddr || loc.addr || '-'}${loc.jibunAddr ? ` (지번 ${loc.jibunAddr})` : ''}
도로명: ${loc.road || '-'} / 가까운 건물: ${loc.bldg || '-'} / 동: ${loc.dong || '-'}
같은 지점에서 주의 이상으로 판독된 분야: ${(ctx.fields || []).join(', ') || '-'}
처방 목록 전체(규칙 엔진이 고른 사업): ${(ctx.allProjects || []).join(', ') || '-'}

── 카드 자료 ──
${cardText}

── 문체 예시 (AURI 영천시 예시안 카드, 문장 길이·종결 방식만 참고. 내용·지명·시설은 옮기지 말 것) ──
${NARRATIVE_EXAMPLE}

── 반드시 지킬 것 ──
1. 사업은 이미 정해졌습니다. measures 에는 카드의 '사업 후보'를 **그 순서대로 빠짐없이** 쓰고, 목록에 없는 사업을 만들지 마십시오.
   각 text 는 "무엇을 어디에 하는가 + 이 위험요인을 어떻게 줄이는가"를 한두 문장으로 씁니다(연결 근거를 이 지점 상황에 맞게 풀어 쓰기).
2. status 는 1~2개. head 는 괄호 안에 들어갈 짧은 소제목(예: 신고 수단 부족), text 는 현황 설명입니다.
   **사진 판독 문제 항목과 요약에 있는 사실만** 단정해서 쓰고, 사진으로 확인되지 않은 상황(야간 조도, 영업 시간, 고장 여부 등)은
   "~ 우려", "~ 가능성" 으로 구분해 쓰십시오.
3. 위치는 위 주소·도로명·건물명과 사진 판독 근거에 나온 표현만 쓰십시오. 새로운 도로명·건물명·업소명을 지어내지 마십시오.
4. 숫자는 '연계 사고 데이터'에 있는 것만 쓰십시오. 개수·길이·금액(○개소, ○m, ○억)은 쓰지 말고 "현장 실측 후 확정"으로 두십시오.
5. purpose 는 한 문장. effect 는 필수 개별사업을 함께 했을 때의 효과 한 문장(화살표 → 는 화면이 붙이므로 쓰지 말 것).
6. combo 는 이 지점 전체에 하나입니다.
   name: "<장소·생활권> 안심 <무엇> 조성사업" 꼴. fields: 함께 다루는 분야(예: "범죄·교통사고 복합" — 위 분야 목록에 있는 것만).
   point/line/area: 각각 "<제목> – <설명>" 꼴 한 덩어리. 점 단위 = 지점 시설 집중 개선, 선 단위 = 구간 연속 정비,
   면 단위 = 생활권 통합 관리·운영(주민·상인·경찰 등 협력). 사업 이름은 처방 목록·사업 후보에 있는 것만 언급하십시오.
7. checks 에는 사진으로 확인할 수 없어 현장에서 확인해야 할 사항 3~5개를 짧게 쓰십시오.
8. 문체는 행정 문서 개조식 명사형 종결(~ 부재, ~ 우려, ~ 확보, ~ 구축). 카드마다 rf 값을 그대로 돌려주십시오.`;
}

async function callNarrativeAI(promptText, schema) {
  /* claude-opus-5-5 — 서술 초안은 새로 만든 호출이라 현재 기본 모델을 씁니다(진단·의견 초안은 claude-opus-5 그대로).
     안전 분류기가 거절하면 서버 쪽 대체 모델로 다시 돌리도록 fallbacks:'default' 를 켭니다. */
  const response = await anthropic.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: schema } },
    messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI가 작성을 거부했습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error('초안이 너무 길어 중간에 끊겼습니다. 카드 수를 줄여 다시 시도해 주세요.');
  const block = response.content.find(function (b) { return b.type === 'text'; });
  if (!block) throw new Error('AI 응답에서 초안을 찾지 못했습니다.');
  console.log(`  · 사용 토큰: 입력 ${response.usage.input_tokens}, 출력 ${response.usage.output_tokens} · 모델 ${response.model}`);
  return { out: parseAiJson(block.text), model: response.model };
}

/* 카드는 화면(document.html siteCards)과 같이 9장까지 — 분야 3개 × 위험요인 3개 */
const NARRATIVE_MAX_CARDS = 9;

async function handleNarrative(req, res) {
  if (!(await guardApi(req, res))) return;
  const body = await readJsonBody(req);
  /* ★ 지시문과 스키마가 **같은 카드**를 봐야 합니다 (2026-10-27 점검). 전에는 스키마만 8장으로 잘라
     9번째 카드의 rf 가 목록에 없었고, 모델이 다른 카드의 rf 로 적으면 화면에서 앞 카드 문장을 덮어썼습니다. */
  const seen = new Set();
  const cards = (Array.isArray(body.cards) ? body.cards : [])
    .filter(function (c) {
      if (!c || typeof c !== 'object' || !c.rf || seen.has(String(c.rf))) return false;
      seen.add(String(c.rf)); return true;
    })
    .slice(0, NARRATIVE_MAX_CARDS)
    .map(function (c) {
      return Object.assign({}, c, {
        rf: String(c.rf),
        findings: Array.isArray(c.findings) ? c.findings.filter(Boolean) : [],
        measures: (Array.isArray(c.measures) ? c.measures : []).filter(function (m) { return m && m.name; }),
      });
    });
  if (!cards.length) return sendJson(res, 400, { error: '초안을 쓸 위험요인 카드가 없습니다.' });
  const rfIds = cards.map(function (c) { return c.rf; });
  const names = [];
  cards.forEach(function (c) { c.measures.forEach(function (m) { if (!names.includes(String(m.name))) names.push(String(m.name)); }); });
  if (!names.length) return sendJson(res, 400, { error: '카드에 사업 후보가 없습니다.' });
  checkQuota(req);

  const ctx = Object.assign({}, body, {
    cards: cards,
    fields: Array.isArray(body.fields) ? body.fields : [],
    allProjects: Array.isArray(body.allProjects) ? body.allProjects : [],
  });
  console.log(`[서술형 초안] 카드 ${cards.length}장 · 사업 후보 ${names.length}종 · ${(body.location && (body.location.road || body.location.addr)) || ''}`);
  const { out, model } = await callNarrativeAI(buildNarrativePrompt(ctx), narrativeSchema(rfIds, names));

  /* 돌려받은 카드 확인 — rf 는 카드마다 한 번, 사업은 **그 카드의** 후보만 남깁니다
     (스키마의 사업 목록은 모든 카드를 합친 것이라 다른 카드의 사업을 써도 통과하기 때문) */
  const byRf = new Map(cards.map(function (c) { return [c.rf, c]; }));
  const used = new Set();
  out.cards = (out.cards || []).filter(function (c) {
    if (!byRf.has(c.rf) || used.has(c.rf)) return false;
    used.add(c.rf);
    const mine = byRf.get(c.rf).measures.map(function (m) { return String(m.name); });
    c.measures = (c.measures || []).filter(function (m) { return mine.includes(m.name); });
    return true;
  });
  if (out.cards.length < cards.length) console.log(`  · 돌려받은 카드 ${out.cards.length}/${cards.length}장 — 빠진 카드는 화면에서 연계표 문장으로 보입니다`);
  sendJson(res, 200, Object.assign({ model: model, at: new Date().toISOString() }, out));
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
/* 2026-10-20 담당자 지시: GPT Image 2.5 · 2 추가. gpt-image-1 은 OpenAI 가 2026-10-23 종료 예고라
   목록 끝에 두고(남겨 두면 선택은 되지만 곧 404), 종료 뒤 지우면 됩니다.
   2.5 두 종(sunburst=편집·정밀 / flare=빠른 생성)은 2026-09-08 스냅샷 — 2차 출처 하나뿐이라
   호출이 404 면 아래 오류문이 "지금 쓸 수 있는 모델" 목록을 함께 보여 줍니다.
   빼 둔 것: gemini-3.1-flash-image · gemini-2.5-flash-image · gpt-image-1-mini */
const IMAGE_MODELS = [
  { id: 'gemini-3-pro-image',      provider: 'gemini', label: 'Gemini 3 Pro' },
  { id: 'gpt-image-2.5-sunburst',  provider: 'openai', label: 'GPT Image 2.5 Sunburst (편집 정밀)' },
  { id: 'gpt-image-2.5-flare',     provider: 'openai', label: 'GPT Image 2.5 Flare (빠름)' },
  { id: 'gpt-image-2',             provider: 'openai', label: 'GPT Image 2' },
  /* gpt-image-1 은 OpenAI 가 2026-10-23 에 종료해 2026-10-27 에 뺐습니다 */
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

function buildGeneratePrompt(facilities, note, fromGenerated, tags, strict) {
  /* 번호 태그를 켜면 목록에 번호를 붙여 모델이 그 번호를 그리게 합니다 */
  const list = facilities.map(function (f, i) { return tags ? `${i + 1}. ${f}` : `- ${f}`; }).join('\n');
  /* ★ 직접 입력 (2026-10-27, AURI 정호경 요청 5) — 연구원이 적은 사업만 그리고 그 밖은 추가하지 않게 합니다.
     처방 목록 모드에도 "목록 밖 시설 금지" 한 줄(ONLY_THESE)은 들어갑니다 — 처방은 규칙 엔진이 정하고
     이미지 모델은 그리기만 한다는 원칙(CLAUDE.md 6절)과 같은 말입니다. */
  const onlyThese = `
- Add exactly the ${facilities.length} item(s) listed — nothing else. Do not add any other facility,
  sign, road marking, pole, light, camera, fence, bollard, mirror, bench or planter, even if it would
  make the street safer.`;
  const strictBlock = strict ? `

USER-SPECIFIED ITEMS — a researcher chose exactly these items for this site:
- The items are written in Korean. Render each one as a physical change in the photo.
- If an item is maintenance or repair of something already in the photo ("정비", "보수", "교체",
  "도색"), improve that existing object in place (repair, clean, repaint or replace the damaged part)
  instead of adding a new object of another kind.
- If an item is a sign or guide marking ("안내표시", "안내표지", "유도표시"), draw a small standard
  Korean public sign or road-surface marking with simple pictograms; keep any lettering short and do
  not invent place names or phone numbers.
- A sign that points to another facility (e.g. "비상벨 위치 안내표시" = a sign showing where the
  emergency bell is) is ONLY the sign. Do not also draw the facility it points to (the bell box,
  camera, extinguisher …) unless that facility is itself one of the listed items.
- If an item cannot be shown without changing the rest of the scene, leave it out rather than
  altering the background.` : '';
  /* ★ 번호 태그 (2026-10-20 실무회의) — "어떤 사업이 적용됐는지" 글 태그는 모델이 안정적으로 못 그립니다.
     번호 원만 이미지 안에 두고 설명은 이미지 밖 범례로 뺍니다(채택안). 사람이 지시선을 그리는 중간 단계는 넣지 않습니다. */
  const tagBlock = tags ? `

NUMBER TAGS — the ONLY annotation allowed:
- On each added facility, paint one small white circle (about 3% of the image width) with a
  thin black outline, containing that facility's number from the list above (1, 2, 3 …) in
  plain black digits. Place it directly on or just above the facility so it is unambiguous.
- One circle per facility, no duplicates. No words, arrows, lines, boxes or captions.
- The circles must not cover the facility itself or anything important behind it.` : '';
  const noLabels = tags
    ? 'No labels, arrows, captions, callouts or watermarks other than the numbered circles described below.'
    : 'No labels, arrows, captions, callouts or watermarks.';

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
- Photorealistic. ${tags ? 'Keep the existing numbered circles; add one only for a facility that lacks it.' : 'No labels, arrows, captions or watermarks.'}${tagBlock}

The scene is a Korean urban street.`;
  }

  /* ── 강조 정도 (2026-09-14 조정) ──────────────────────────────────
     08-03 알파 (8b7cdb0)  눈에 띄게 하라는 말 없음 → "차이가 잘 안 보인다"
     09-04 강화 (d184b46)  한눈에 · 크게 · 고대비 색 · 밝은 조명 웅덩이 → "너무 튀어 주변과 안 어울린다"
     09-14 (지금)  그 사이 — 전후를 나란히 놓으면 **알아볼 수 있는** 정도,
                   재질·채도·밝기·선명도는 **주변 사진에 맞춤**

     강화판에서 과하게 만든 문구 네 개만 낮췄습니다.
       ① "obvious at a glance / where the viewer looks first" → 보이는 자리이되 실제 설치 위치 우선
       ② "Err on the larger end"                             → 실제 크기 그대로
       ③ "finishes, which are already high-contrast"        → 표준 디자인·색 + 사진의 노출·채도에 맞춤
       ④ "a brighter pool of light"                          → 은은하고 자연스러운 정도, 번짐·후광 금지
     원본을 어둡게·흐리게 해서 대비를 만드는 것은 **계속 금지**입니다.            */
  return `You are producing an "after improvement" visualization for a Korean public safety
report. The image sits next to the "before" photo in an official document, so it must
satisfy two things at once: the background must be untouched, and the added facilities
must be identifiable when the two photos are compared side by side — while looking like
they genuinely belong in this street.

TASK
Edit the provided street photograph by adding ONLY the safety facilities listed below.${request}

PRESERVE THE ORIGINAL — this is the most important requirement:
- Buildings, windows, walls, signage, shop fronts, road markings, parked vehicles,
  poles, sky, vegetation, lighting and camera angle must remain EXACTLY as they are.
- Do not restyle, recolor, relight, sharpen, crop or re-render the scene.
- Do not alter or invent any text, lettering, shop names or license plates.
- If you cannot add a facility without changing the rest of the scene, leave it out.

FACILITIES TO ADD
${list}${onlyThese}${strictBlock}

KEEP THE FACILITIES IDENTIFIABLE — reviewers need to find the change by comparing the
two photos. Within the "preserve the original" limits above:
- Choose a realistic installation point that is clearly in view — not tiny in the far
  distance and not cut off at the frame edge. A realistic location comes first.
- Size each facility exactly as it would really be built. Do not enlarge it.
- Use the ordinary Korean public design and standard colours for these facilities.

BLEND WITH THE SCENE — reviewers said the previous version stood out too much and did not
harmonise with its surroundings. The facilities must look installed, not pasted on:
- Match the photo's exposure, white balance, colour saturation, contrast, haze and
  sharpness. A facility must not be brighter, more saturated or crisper than the
  objects next to it at the same distance.
- Match material and condition to the nearby street furniture: the same matte or
  weathered surfaces, light dust and wear. No glossy highlights, no fresh-paint look,
  no showroom-new finish.
- Match the photo's grain, noise, compression and depth of field.
- Cast shadows and reflections consistent with the existing light direction and softness.
- If a lighting facility is added, show only a modest, natural increase in light on the
  ground directly beneath it, consistent with the scene's time of day. No glow, halo,
  bloom or spotlight effect, and do not relight the rest of the scene.
- Do not make a facility stand out by boosting its own brightness or saturation, and do
  not create contrast by darkening, blurring, desaturating or vignetting the original
  scene. The only difference between before and after must be the facilities themselves.

HOW TO ADD THEM
- Place each facility where it would realistically be installed on this street.
- Match the perspective, scale, shadows and lighting of the original photograph.
- Photorealistic. ${noLabels}${tagBlock}

The scene is a Korean urban street.`;
}

/* 어느 제공사냐에 따라 호출 방식이 다릅니다.
   지시문(buildGeneratePrompt)과 돌려주는 모양은 양쪽이 똑같으므로,
   화면과 나머지 코드는 어느 모델인지 알 필요가 없습니다. */
async function callImageAI(mediaType, base64Data, facilities, model, note, fromGenerated, tags, strict) {
  const def = imageModelById(model);
  const prompt = buildGeneratePrompt(facilities, note, fromGenerated, tags, strict);
  if (def && def.provider === 'openai') {
    return callOpenAIImage(mediaType, base64Data, prompt, model);
  }
  return callGeminiImage(mediaType, base64Data, prompt, model);
}

/* ── OpenAI (GPT Image) ───────────────────────────────────────────────
   원본 사진을 고쳐 그리는 것이므로 "만들기(generations)"가 아니라
   "고치기(edits)" 쪽을 씁니다. 파일 업로드 형식이라 JSON이 아닙니다.

   input_fidelity: 'high' — 원본을 최대한 유지하라는 지시입니다.
   이 앱의 판단 기준이 "원본 보존"이라 반드시 켭니다. */
async function callOpenAIImage(mediaType, base64Data, prompt, model) {
  const ext = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png';
  const blob = new Blob([Buffer.from(base64Data, 'base64')], { type: mediaType });

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('image', blob, `input.${ext}`);
  form.append('n', '1');
  form.append('size', 'auto');            // 원본 비율에 맞춰 알아서
  form.append('quality', 'high');
  /* GPT Image 2 계열(2 · 2.5)은 입력 충실도가 항상 높아 이 값을 받지 않습니다 — 보내면 오류. 1 계열에만 붙입니다 */
  if (!/^gpt-image-2/.test(model)) form.append('input_fidelity', 'high');  // 원본을 최대한 유지 (gpt-image-1 계열)

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
async function callGeminiImage(mediaType, base64Data, prompt, model) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Data } },
          { text: prompt },
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
  if (!(await guardApi(req, res))) return;

  const body = await readJsonBody(req);
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(String(body.imageDataUrl || ''));
  if (!match) return sendJson(res, 400, { error: '원본 이미지가 없습니다.' });

  const facilities = (Array.isArray(body.facilities) ? body.facilities : []).filter(Boolean).map(String);
  if (!facilities.length) return sendJson(res, 400, { error: '반영할 시설물이 없습니다.' });
  checkQuota(req);   // 요청이 갖춰진 뒤에 셉니다

  /* 화면에서 고른 모델. 목록에 없거나 그 제공사 키가 없으면
     쓸 수 있는 모델 중 첫 번째로 대신합니다. */
  const usable = usableImageModels();
  const picked = imageModelById(body.model);
  const def = (picked && providerKey(picked.provider)) ? picked : usable[0];
  const model = def.id;

  /* 연구원이 적어 보낸 수정 요청과, 그 요청을 어느 이미지에 반영할지 */
  const note = String(body.note || '').trim().slice(0, 1000);
  const fromGenerated = !!body.fromGenerated;
  /* ★ 번호 태그 (2026-10-20 실무회의) — 시설마다 작은 번호 원만 이미지에, 설명은 화면·문서의 범례로 */
  const tags = !!body.tags;
  /* ★ 직접 입력 (2026-10-27) — 연구원이 적은 사업만. 한 줄 120자 · 8개까지 */
  const strict = !!body.strict;
  if (strict) {
    facilities.splice(0, facilities.length, ...facilities.map(function (f) { return String(f).slice(0, 120); }).slice(0, 8));
  }

  const [, mediaType, base64Data] = match;
  console.log(`[이미지 생성] ${def.provider} ${model} / ${strict ? '직접 입력 ' : ''}시설물 ${facilities.length}종: ${facilities.join(', ')}`);

  const out = await callImageAI(mediaType, base64Data, facilities, model, note, fromGenerated, tags, strict);
  console.log(`  · 생성 완료 (${Math.round(out.dataUrl.length / 1024)}KB)`);
  sendJson(res, 200, Object.assign({ model: model }, out));
}

async function handleDiagnose(req, res, isRevise) {
  const gate = await guardApi(req, res);
  if (!gate) return;

  const body = await readJsonBody(req);

  // 브라우저가 보낸 "data:image/png;base64,AAAA..." 를 두 조각으로 나눕니다
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(String(body.imageDataUrl || ''));
  if (!match) {
    return sendJson(res, 400, { error: '이미지가 없거나 형식이 올바르지 않습니다.' });
  }
  const [, mediaType, base64Data] = match;

  /* 지자체 중점 3분야 — 지시문에 넣고, 화면이 순서·표기를 맞추도록 응답에도 돌려줍니다 */
  const focus = focusFor(body.location);
  let promptText;
  if (isRevise) {
    if (!body.note || !body.previous || typeof body.previous !== 'object') {
      return sendJson(res, 400, { error: '어디가 잘못되었는지 알려 주셔야 다시 판독할 수 있습니다.' });
    }
    console.log(`[재판독 요청] 지적: ${String(body.note).slice(0, 80)}`);
    promptText = buildRevisePrompt(body.previous, body.note, focus, body.location);
  } else {
    console.log(`[진단 요청] ${mediaType}, ${Math.round(base64Data.length / 1024)}KB · 중점 분야 ${focus ? focus.label + ' ' + focus.labels.join('·') : '없음(지자체 미확인)'}` +
                ` · 위치 ${(body.location && (body.location.road || body.location.addr)) || '없음'}`);
    promptText = buildPrompt(focus, body.location);
  }
  checkQuota(req);   // 요청이 갖춰진 뒤에 셉니다 — 형식이 틀려 400 으로 끝나는 요청이 상한을 쓰지 않게

  /* 진단 실행 기록 — 누가 · 언제 · 어느 지점 (8/25 협의 "접근통제").
     요청이 제대로 갖춰진 뒤, AI 를 부르기 **직전**에 남깁니다.
     AI 호출이 실패해도 "진단을 시도했다"는 사실은 남아야 하기 때문입니다. */
  if (AUTH_MODE === 'account') {
    await auth.logDiagnosis(req, gate.user, isRevise ? 'revise' : 'diagnose', body.location, SITE_ROOT);
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
      /* 위치 + 현황 + 위험요인 한 문장 (2026-10-27, AURI 요청 3) — 사전진단서·서술형 사업에 그대로 옮겨 씁니다 */
      summary: String(r.summary || '').trim(),
    };
  }
  const st = raw.space_type || {};
  /* 판독할 수 없는 사진이면 공간유형도 두지 않습니다 — 스키마가 필수라 억지로 하나를 고르기 때문 */
  const space = st.primary && raw.image_quality !== 'unusable' ? { primary: st.primary, secondary: st.secondary && st.secondary !== '없음' ? st.secondary : '',
                               reason: String(st.reason || '').trim() } : null;

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
  if (space) console.log(`  · 공간유형: ${space.primary}${space.secondary ? ' + ' + space.secondary : ''} — ${space.reason.slice(0, 60)}`);
  sendJson(res, 200, {
    imageQuality: raw.image_quality, categories: categories, space: space,
    focus: focus ? { region: focus.region, label: focus.label, keys: focus.keys, labels: focus.labels } : null,
  });
}

/* ── 아래는 웹서버 기본 동작 (건드릴 일 거의 없습니다) ─────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.hwpx': 'application/hwp+zip',
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

function readJsonBody(req, maxBytes) {
  const limit = maxBytes || 30 * 1024 * 1024;   // 이미지 30MB 제한 (로그인·가입은 64KB)
  const bad = function (message, status) { return Object.assign(new Error(message), { status: status }); };
  return new Promise(function (resolve, reject) {
    /* JSON 으로 보낸 것만 받습니다 (2026-10-27). 다른 사이트의 폼(text/plain)으로 몰래 로그인·저장을 시키는
       공격(CSRF)을 막기 위해서입니다. 이 앱의 화면과 tools/ 는 모두 application/json 으로 보냅니다. */
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
      req.resume();
      return reject(bad('요청 형식이 올바르지 않습니다 (JSON 이 아님).', 415));
    }
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(bad(limit < 1024 * 1024 ? '요청이 너무 큽니다.' : '이미지가 너무 큽니다 (30MB 초과).', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      let v;
      try { v = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reject(bad('요청 형식이 올바르지 않습니다.', 400)); }
      /* null·배열·숫자가 오면 뒤에서 body.○○ 를 읽다 500 이 나므로 여기서 400 으로 */
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(bad('요청 형식이 올바르지 않습니다.', 400));
      resolve(v);
    });
    req.on('error', reject);
  });
}

/* ★ 내줄 수 있는 것만 적어 둔 목록 (화이트리스트)
   ────────────────────────────────────────────────────────────────
   예전에는 "이건 막는다" 목록이었는데, 그러면 폴더가 새로 생길 때마다
   다시 뚫립니다. 실제로 data/raw/ 에는 환자 연령·성별·지번주소가 담긴
   119 원본이, server/ 에는 API 키(.env)가 들어 있습니다.

   그래서 **여기 적힌 것만** 내주고 나머지는 전부 403 입니다.
   앱에 새 폴더가 필요해지면 이 목록에 한 줄 추가해야 합니다 —
   깜빡하면 화면이 안 뜨므로 바로 알아챌 수 있습니다(조용히 새는 것보다 낫습니다).

     ALLOW_DIRS   이 폴더 아래는 허용 (확장자도 함께 제한)
     ALLOW_ROOT   프로젝트 최상단에서 허용할 파일 (.html 만)                */
const ALLOW_DIRS = [
  { dir: 'assets', ext: ['.css', '.js', '.json', '.svg', '.png', '.jpg'] },
  { dir: 'data/incidents', ext: ['.json'] },
  { dir: 'data/stats', ext: ['.json', '.jpg'] },   // .jpg = AURI 보고서 그림 (auri-reports/img, 2026-10-21)
  /* 동별 HEA 취약도 (tools/build-dong-hea.mjs) — 점수·비율·동 경계선뿐, 개별 신고 없음 */
  { dir: 'data/dong', ext: ['.json'] },
  /* 위험도 히트맵 — 원본 TIF(data/raw/)가 아니라 축소·색칠한 PNG 입니다 */
  { dir: 'data/heatmap', ext: ['.png', '.json'] },
  /* 맞춤형 사업 종합도 오버레이 (tools/overview-map/svg-to-overlay.mjs) — 사업지 구역·번호·시설 위경도와 사업 글 */
  { dir: 'data/overview', ext: ['.json', '.jpg'] },   // .jpg = 종합도 축소판 (사전진단서 [그림])
  /* 한글(hwpx) 내려받기 틀 — AURI 사전분석 보고서 원본(그림만 축소). tools/build-hwpx-templates.mjs (2026-10-27) */
  { dir: 'data/hwpx', ext: ['.hwpx', '.json'] },
];
const ALLOW_ROOT_EXT = ['.html'];

/** 이 경로를 내줘도 되는가 — 되면 true */
function isAllowed(relPath) {
  const rel = relPath.split(path.sep).join('/');       // 윈도우 \ 를 / 로
  if (rel.includes('..')) return false;                // 상위 폴더 탈출 차단
  const ext = path.extname(rel).toLowerCase();

  /* 최상단 파일 — index.html, report.html … */
  if (!rel.includes('/')) return ALLOW_ROOT_EXT.includes(ext);

  return ALLOW_DIRS.some(function (a) {
    return rel.startsWith(a.dir + '/') && a.ext.includes(ext);
  });
}

/* 로그인 전에도 내줄 수 있는 것 — 로그인 화면이 뜨는 데 필요한 만큼만 */
function isPublicPath(rel) {
  if (rel === 'login.html') return true;
  return rel.startsWith('assets/') && ['.css', '.js', '.svg', '.png', '.jpg'].includes(path.extname(rel).toLowerCase());
}

/* DB 에 연결하지 못했을 때 모든 화면 대신 보여 주는 안내 */
const SETUP_PAGE = `<!doctype html><meta charset="utf-8"><title>설정 필요</title>
<body style="font-family:Pretendard,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;line-height:1.7;color:#333">
<h1 style="font-size:24px">로그인 설정이 끝나지 않았습니다</h1>
<p>계정 로그인(AUTH_MODE=account)이 켜져 있지만 데이터베이스에 연결하지 못했습니다.
로그인 없이 열리지 않도록 화면을 닫아 두었습니다.</p>
<p style="font-size:14px;color:#666">관리자: 렌더 웹 서비스의 Environment 에 <b>DATABASE_URL</b> 이 있는지,
DB 가 Available 상태인지 확인해 주세요. 급하면 <b>AUTH_MODE=code</b> 로 바꾸면 예전 접속 암호 방식으로 돌아갑니다.</p>
</body>`;

/* ── 프로젝트 API (2026-09-15) ──────────────────────────────────────
     GET    /api/projects?scope=mine|all&user=번호   목록 (all 은 관리자)
     GET    /api/projects/번호                        한 건 열기
     POST   /api/projects                             저장 (id 가 있고 내 것이면 덮어쓰기)
     DELETE /api/projects/번호                        삭제 (내 것만)                    */
async function handleProjectsApi(req, res, pathname) {
  if (AUTH_MODE !== 'account') return sendJson(res, 404, { error: '프로젝트 저장은 계정 로그인 방식에서만 쓸 수 있습니다.' });
  if (!auth.authReady() || !projects.projectsReady()) {
    return sendJson(res, 503, { error: '저장소가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const user = await auth.currentUser(req, { touch: true });
  if (!user) return sendJson(res, 401, { error: '로그인이 만료되었습니다. 다시 로그인해 주세요.', needLogin: true });

  const url = new URL(req.url, 'http://localhost');
  const idPart = pathname.startsWith('/api/projects/') ? pathname.slice('/api/projects/'.length) : null;
  let r;
  if (pathname === '/api/projects' && req.method === 'GET') {
    r = await projects.listProjects(user, url.searchParams.get('scope'), url.searchParams.get('user'));
  } else if (pathname === '/api/projects' && req.method === 'POST') {
    r = await projects.saveProject(user, await readJsonBody(req), SITE_ROOT);
  } else if (idPart && req.method === 'GET') {
    r = await projects.getProject(user, idPart);
  } else if (idPart && req.method === 'DELETE') {
    r = await projects.deleteProject(user, idPart);
  } else if (pathname.startsWith('/api/hotspots/')) {
    /* 주요 거점 — 관리자 이동 자리 + 거점별 공유 프로젝트 (2026-10-20) */
    const [region, tag] = pathname.slice('/api/hotspots/'.length).split('/');
    if (req.method === 'GET' && !tag) r = await projects.hotspotInfo(user, region);
    else if (req.method === 'PUT' && tag) r = await projects.setHotspotEdit(user, region, tag, await readJsonBody(req));
    else if (req.method === 'DELETE' && tag) r = await projects.clearHotspotEdit(user, region, tag);
    else r = { status: 404, error: '없는 주소입니다.' };
  } else {
    r = { status: 404, error: '없는 주소입니다.' };
  }
  const { status, ...body } = r;
  return sendJson(res, status, body);
}

/* ── 계정 · 관리자 API ─────────────────────────────────────────────── */
async function handleAuthApi(req, res, pathname) {
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    /* 방식이 무엇인지 화면에 알려 줍니다 — code/off 면 화면이 계정 표시를 감춥니다 */
    if (AUTH_MODE !== 'account') return sendJson(res, 200, { mode: AUTH_MODE, user: null });
    if (!auth.authReady()) return sendJson(res, 200, { mode: AUTH_MODE, ready: false, user: null });
    const user = await auth.currentUser(req, { touch: false });
    return sendJson(res, 200, {
      mode: AUTH_MODE, ready: true, user: user, serverNow: new Date(),
      expiresAt: user ? user.expiresAt : null, sessionMinutes: auth.SESSION_MINUTES,
    });
  }

  if (AUTH_MODE !== 'account') return sendJson(res, 404, { error: '계정 로그인이 꺼져 있습니다.' });
  if (!auth.authReady()) return sendJson(res, 503, { error: '로그인 설정이 끝나지 않았습니다. 관리자에게 문의해 주세요.' });

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const r = await auth.login(req, res, await readJsonBody(req, 64 * 1024));
    const { status, ...body } = r;
    return sendJson(res, status, body);
  }
  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    const { status, ...body } = await auth.signup(req, await readJsonBody(req, 64 * 1024));
    return sendJson(res, status, body);
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    await auth.logout(req, res);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && pathname === '/api/auth/extend') {
    const user = await auth.currentUser(req, { touch: true });
    if (!user) return sendJson(res, 401, { error: '로그인이 만료되었습니다.', needLogin: true });
    return sendJson(res, 200, { ok: true, expiresAt: user.expiresAt, serverNow: new Date() });
  }

  /* 여기부터 관리자만 */
  if (pathname.startsWith('/api/admin/')) {
    const admin = await auth.currentUser(req, { touch: true });
    if (!admin) return sendJson(res, 401, { error: '로그인이 만료되었습니다.', needLogin: true });
    if (admin.role !== 'admin') return sendJson(res, 403, { error: '관리자만 쓸 수 있습니다.' });

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && pathname === '/api/admin/users') {
      return sendJson(res, 200, { users: await auth.listUsers() });
    }
    if (req.method === 'POST' && pathname === '/api/admin/users/action') {
      const b = await readJsonBody(req);
      const { status, ...body } = await auth.decideUser(admin, b.id, b.action);
      return sendJson(res, status, body);
    }
    if (req.method === 'GET' && (pathname === '/api/admin/logs' || pathname === '/api/admin/logs.csv')) {
      const type = url.searchParams.get('type');
      const rows = await auth.listLogs(type, url.searchParams.get('limit') || (pathname.endsWith('.csv') ? 5000 : 300));
      if (!rows) return sendJson(res, 400, { error: 'type 은 login 또는 diagnosis 여야 합니다.' });
      if (pathname === '/api/admin/logs') return sendJson(res, 200, { rows });
      return sendCsv(res, `${type}_log_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }
  }
  return sendJson(res, 404, { error: '없는 주소입니다.' });
}

/* 기록 내려받기 — 엑셀에서 한글이 깨지지 않게 BOM 을 붙이고 시각은 한국 시간으로 */
function sendCsv(res, filename, rows) {
  const kst = (v) => (v instanceof Date || /^\d{4}-\d{2}-\d{2}T/.test(String(v)))
    ? new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) : v;
  const cell = (v) => {
    let s = v == null ? '' : String(kst(v));
    /* = + - @ 로 시작하면 엑셀이 수식으로 실행합니다. 로그인 실패 아이디는 누구나 적어 넣을 수 있는 글이라
       (예: =HYPERLINK(…)) 앞에 ' 를 붙여 글자로만 보이게 합니다 (2026-10-27 점검) */
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const text = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('잘못된 주소입니다.');
    return;
  }

  const filePath = path.resolve(SITE_ROOT, '.' + (urlPath === '/' ? '/index.html' : urlPath));

  // 프로젝트 폴더 밖의 파일은 절대 내주지 않습니다
  if (filePath !== SITE_ROOT && !filePath.startsWith(SITE_ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('접근할 수 없는 경로입니다.');
    return;
  }

  const rel = path.relative(SITE_ROOT, filePath).split(path.sep).join('/');
  if (!isAllowed(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('접근할 수 없는 경로입니다.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  /* ── 로그인 문 (AUTH_MODE=account) ─────────────────────────────────
     화면과 자료는 **서버가** 로그인 여부를 보고 내줍니다. 브라우저 쪽에서만
     막으면 주소를 직접 치고 들어올 수 있기 때문입니다.
     로그인 전에도 받을 수 있는 것은 로그인 화면과 그 화면이 쓰는
     디자인·스크립트·로고뿐입니다(자료 .json 은 로그인 뒤에만).          */
  if (AUTH_MODE === 'account' && !isPublicPath(rel)) {
    if (!auth.authReady()) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(SETUP_PAGE);
      return;
    }
    /* 화면(HTML)을 열 때만 만료를 밉니다. 화면 하나가 자료를 수십 개 받는데
       그때마다 DB 에 쓰면 느려집니다. */
    const user = await auth.currentUser(req, { touch: ext === '.html' });
    if (!user) {
      if (ext === '.html') {
        res.writeHead(302, { Location: '/login.html?next=' + encodeURIComponent(urlPath), 'Cache-Control': 'no-store' });
        res.end();
      } else {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' }).end('로그인이 필요합니다.');
      }
      return;
    }
    if (rel === 'admin.html' && user.role !== 'admin') {
      res.writeHead(302, { Location: '/index.html' }).end();
      return;
    }
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      /* 화면은 저장해 두지 말 것 — 로그아웃 뒤 "뒤로 가기"로 다시 보이지 않게 */
      ...(ext === '.html' ? { 'Cache-Control': 'no-store' } : {}),
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('파일을 찾을 수 없습니다.');
  }
}

const server = http.createServer(async function (req, res) {
  /* 다른 주소(예: GitHub Pages)에서도 이 서버를 부를 수 있게 허용 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-access-code');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
    } else if (pathname === '/api/projects' || pathname.startsWith('/api/projects/') || pathname.startsWith('/api/hotspots/')) {
      await handleProjectsApi(req, res, pathname);  // 프로젝트 저장 · 불러오기 · 주요 거점
    } else if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/admin/')) {
      await handleAuthApi(req, res, pathname);    // 로그인 · 가입 · 관리자
    } else if (req.method === 'GET' && req.url === '/api/models' && AUTH_MODE === 'account' &&
               !(await auth.currentUser(req, { touch: false }))) {
      sendJson(res, 401, { error: '로그인이 필요합니다.', needLogin: true });
    } else if (req.method === 'POST' && req.url === '/api/diagnose') {
      await handleDiagnose(req, res, false);
    } else if (req.method === 'POST' && req.url === '/api/revise') {
      await handleDiagnose(req, res, true);   // 연구원 지적을 반영한 재판독
    } else if (req.method === 'POST' && req.url === '/api/generate') {
      await handleGenerate(req, res);         // 개선 후 이미지 생성
    } else if (req.method === 'POST' && req.url === '/api/opinion') {
      await handleOpinion(req, res);          // 진단서 서술 문단 초안
    } else if (req.method === 'POST' && req.url === '/api/narrative') {
      await handleNarrative(req, res);        // 서술형 맞춤형 사업 초안 (2026-10-27)
    } else if (req.method === 'GET' && req.url === '/api/models') {
      /* 화면의 모델 선택 상자가 이 목록으로 채워집니다.
         키가 없는 제공사의 모델은 애초에 내려보내지 않습니다.

         왜 안 나오는지도 함께 알려 줍니다 — 목록에 없으면 "고장인가"
         싶어지는데, 실제로는 키를 안 넣었거나 서버를 다시 안 켠 경우가
         대부분입니다. 키 자체는 절대 내보내지 않습니다. */
      const PROVIDER_LABEL = { gemini: 'Google Gemini', openai: 'OpenAI GPT Image' };
      const ENV_NAME = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };
      const missing = ['gemini', 'openai']
        .filter(function (p) { return !providerKey(p); })
        .map(function (p) {
          return {
            provider: p,
            label: PROVIDER_LABEL[p],
            hint: `server/.env 에 ${ENV_NAME[p]} 를 넣고 서버를 다시 켜면 나타납니다`,
          };
        });

      sendJson(res, 200, {
        models: usableImageModels().map(function (m) {
          return { id: m.id, label: m.label, provider: m.provider };
        }),
        unavailable: missing,
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

/* ── 계정 DB 준비 ─────────────────────────────────────────────────────
   켜질 때 DB 에 못 붙으면(렌더 DB 가 막 깨어나는 중 등) 30초마다 다시 시도합니다.
   그동안 사이트는 닫혀 있고, 붙는 순간 저절로 열립니다. */
if (AUTH_MODE === 'account') {
  const first = await auth.initAuth();
  if (first.ready) await projects.initProjects();   // 프로젝트 표는 계정 표 뒤에 (users 를 가리키므로)
  else {
    const timer = setInterval(async function () {
      const r = await auth.initAuth();
      if (r.ready) {
        clearInterval(timer);
        await projects.initProjects();
        console.log('[계정] DB 연결 성공 — 로그인 사용 가능');
      }
    }, 30000);
  }
}

server.listen(PORT, function () {
  console.log('');
  console.log('  AI 안전진단 서버가 켜졌습니다.');
  console.log(`  브라우저에서 이 주소를 여세요 →  http://localhost:${PORT}`);
  console.log('');
  console.log(`  요금 상한: 하루 ${DAILY_LIMIT}회 / 한 사람당 1시간 ${HOURLY_LIMIT_PER_IP}회`);
  if (AUTH_MODE === 'account') {
    console.log(`  접근통제: 계정 로그인 — ${auth.authReady() ? 'DB 연결됨' : '⚠ DB 미연결, 사이트 닫힘 (DATABASE_URL 확인)'}`);
    if (ACCESS_CODE) console.log('    · ACCESS_CODE 는 설정돼 있지만 쓰지 않습니다 (AUTH_MODE=code 로 되돌릴 수 있음)');
  } else if (AUTH_MODE === 'code') {
    console.log(`  접근통제: 접속 암호 — ${ACCESS_CODE ? '사용 중' : '없음 (누구나 사용 가능)'}`);
  } else {
    console.log('  접근통제: 꺼짐 (AUTH_MODE=off) — ⚠ 내 컴퓨터에서 개발할 때만 쓰세요');
  }
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



