/* ════════════════════════════════════════════════════════════════════
   계정 · 로그인 · 기록 (2026-09-14 AURI 요청 — 승인제 로그인)

   8/25 행안부 협의에서 "승인제 회원가입 + 로그인 기반 접근통제"로
   정리된 것을 구현합니다. 누가 언제 어느 지점을 진단했는지 남깁니다.

   흐름
   ────
     가입 신청(아이디·비밀번호·이름·소속)  →  status = pending
     관리자 승인                            →  status = active   → 로그인 가능
     관리자 거부                            →  status = rejected
     관리자 비활성화                        →  status = disabled → 즉시 로그아웃

   저장 위치 — 렌더 PostgreSQL (DATABASE_URL)
   ─────────────────────────────────────────
   렌더 무료 요금제는 서버를 다시 켤 때 디스크가 지워집니다. 파일에 적으면
   계정이 매번 사라지므로 DB 에 둡니다.

   ★ 비밀번호는 bcrypt 해시만 저장합니다 ────────────────────────────
   원문은 DB·로그·화면 어디에도 남기지 않습니다. 해시는 되돌릴 수 없어서
   DB 가 통째로 새도 비밀번호가 드러나지 않습니다.
   부품은 `bcryptjs` — bcrypt 알고리즘을 순수 자바스크립트로 구현한 것이라
   해시 형식($2b$12$…)이 같고, 윈도우·렌더 어디서든 컴파일 없이 설치됩니다.

   ★ 세션 — 마지막 활동 후 30분 ─────────────────────────────────────
   브라우저에는 무작위 열쇠(쿠키)만 주고, DB 에는 그 열쇠의 **해시**를
   둡니다. DB 가 새도 그 값으로 남의 세션을 흉내 낼 수 없습니다.
   화면을 열거나 AI 기능을 쓸 때마다 만료가 30분 뒤로 밀리고,
   "로그인 유지" 버튼도 같은 일을 합니다.
   ════════════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

export const SESSION_MINUTES = Number(process.env.SESSION_MINUTES || 30);
const COOKIE = 'auri_sid';
const BCRYPT_COST = 12;
/* 없는 아이디로 로그인할 때 비교할 대상 — 응답 시간을 맞추는 용도일 뿐입니다 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

/* 로그인 실패가 몰리면 잠시 막습니다 — 비밀번호 대입 공격 방지 */
const FAIL_LIMIT = 10;                // 이 횟수만큼 틀리면
const FAIL_WINDOW_MS = 15 * 60000;    // 15분 동안 그 IP 의 로그인을 막음
const _fails = new Map();

let _pool = null;
let _ready = false;
let _initError = null;

/* ── DB 연결 ─────────────────────────────────────────────────────────
   렌더 **내부 주소**(Internal Database URL)는 암호화 없이 연결되고,
   **외부 주소**(External — 내 컴퓨터에서 붙을 때)는 암호화(SSL)가 필요합니다.
   외부 주소에는 `.render.com` 이 붙어 있어 그것으로 구분합니다.       */
function makePool(url) {
  const needSsl = process.env.PGSSL === 'true' || /\.render\.com/i.test(url);
  return new pg.Pool({
    connectionString: url,
    ssl: needSsl ? { rejectUnauthorized: false } : false,
    max: 5,
  });
}

/* ── 표 만들기 ───────────────────────────────────────────────────────
   서버가 켜질 때마다 돌지만 `IF NOT EXISTS` 라 이미 있으면 건드리지 않습니다.
   따로 DB 에 들어가 표를 만들 필요가 없습니다.                         */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  org           TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    TEXT,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip         TEXT
);

CREATE TABLE IF NOT EXISTS login_log (
  id       SERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT,
  user_id  INTEGER,
  ip       TEXT,
  success  BOOLEAN NOT NULL,
  reason   TEXT
);

CREATE TABLE IF NOT EXISTS diagnosis_log (
  id       SERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id  INTEGER,
  username TEXT,
  kind     TEXT NOT NULL,
  lat      DOUBLE PRECISION,
  lng      DOUBLE PRECISION,
  region   TEXT,
  addr     TEXT,
  ip       TEXT
);
`;

/**
 * 서버가 켜질 때 한 번 부릅니다.
 *   opts.pool  시험할 때 가짜 DB 를 넣는 자리 (평소에는 비워 둠)
 */
export async function initAuth(opts) {
  const o = opts || {};
  try {
    if (o.pool) _pool = o.pool;
    else {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 없습니다.');
      _pool = makePool(process.env.DATABASE_URL);
    }
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
      await _pool.query(stmt);
    }
    await ensureAdmin();
    _ready = true;
    _initError = null;
  } catch (e) {
    _ready = false;
    _initError = e;
    console.error('[계정] DB 준비 실패 —', e.message);
  }
  return { ready: _ready, error: _initError };
}

export const authReady = () => _ready;
export const authError = () => _initError;

/* ── 관리자 계정 (ADMIN_ID / ADMIN_PW) ───────────────────────────────
   환경변수에 적힌 계정을 켤 때마다 맞춰 둡니다.
   - 없으면 만들고, 있으면 **비밀번호를 환경변수 값으로 다시 맞춥니다.**
   - 그래서 관리자 비밀번호를 잊으면 렌더 환경변수만 바꾸면 됩니다.
   비밀번호 원문은 여기서 해시로 바꾸는 순간 말고는 쓰지 않습니다.      */
async function ensureAdmin() {
  const id = String(process.env.ADMIN_ID || '').trim();
  const pw = String(process.env.ADMIN_PW || '');
  if (!id || !pw) {
    console.warn('[계정] ADMIN_ID · ADMIN_PW 가 없어 관리자 계정을 만들지 않았습니다.');
    return;
  }
  const { rows } = await _pool.query('SELECT id, password_hash FROM users WHERE username = $1', [id]);
  if (!rows.length) {
    const hash = await bcrypt.hash(pw, BCRYPT_COST);
    await _pool.query(
      `INSERT INTO users (username, password_hash, name, org, role, status, decided_at, decided_by)
       VALUES ($1, $2, '관리자', 'AURI', 'admin', 'active', now(), 'system')`,
      [id, hash],
    );
    console.log(`[계정] 관리자 계정을 만들었습니다: ${id}`);
    return;
  }
  const same = await bcrypt.compare(pw, rows[0].password_hash);
  if (!same) {
    await _pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(pw, BCRYPT_COST), rows[0].id]);
    console.log('[계정] 관리자 비밀번호를 환경변수 값으로 다시 맞췄습니다.');
  }
  await _pool.query(`UPDATE users SET role = 'admin', status = 'active' WHERE id = $1`, [rows[0].id]);
}

/* ── 작은 도구들 ─────────────────────────────────────────────────── */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* 접속자 IP — 기록과 로그인 실패 차단에 씁니다.
   `X-Forwarded-For` 첫 칸은 접속자가 마음대로 적어 보낼 수 있어서, 렌더 앞단
   (Cloudflare)이 **직접 덮어쓰는** 헤더가 있으면 그것을 먼저 믿습니다. */
export function clientIp(req) {
  const h = req.headers;
  const direct = h['cf-connecting-ip'] || h['true-client-ip'];
  if (direct) return String(direct).trim();
  const fwd = h['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/* 쿠키 속성
   HttpOnly  화면 스크립트가 읽지 못함 (스크립트가 털려도 열쇠는 안전)
   Secure    https 에서만 전송 — 렌더는 https 라 켜지고, 로컬(http)에서는 꺼짐
   SameSite  다른 사이트에서 몰래 보낸 요청에는 붙지 않음                */
function setCookie(req, res, value, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

const USERNAME_RX = /^[A-Za-z0-9_.-]{4,30}$/;

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, org: u.org, role: u.role };
}

/* ── 지금 로그인한 사람 ───────────────────────────────────────────────
   opts.touch  true 면 만료를 30분 뒤로 밉니다 (화면 열기·AI 기능·로그인 유지).
               상태 확인(/api/auth/me)은 밀지 않습니다 — 화면이 1분마다
               확인하는데 그때마다 밀면 창만 열어 두어도 영원히 안 끝납니다. */
export async function currentUser(req, opts) {
  if (!_ready) return null;
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const th = sha256(token);
  const { rows } = await _pool.query(
    `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`, [th]);
  if (!rows.length) return null;
  const r = rows[0];
  if (new Date(r.expires_at) <= new Date() || r.status !== 'active') {
    await _pool.query('DELETE FROM sessions WHERE token_hash = $1', [th]);
    return null;
  }
  let expiresAt = new Date(r.expires_at);
  if (opts && opts.touch) {
    expiresAt = new Date(Date.now() + SESSION_MINUTES * 60000);
    await _pool.query('UPDATE sessions SET expires_at = $1 WHERE token_hash = $2', [expiresAt, th]);
  }
  return Object.assign(publicUser(r), { expiresAt });
}

/* ── 가입 신청 ───────────────────────────────────────────────────── */
export async function signup(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 50);
  const org = String(body.org || '').trim().slice(0, 100);

  if (!USERNAME_RX.test(username)) {
    return { status: 400, error: '아이디는 영문·숫자·_ . - 로 4~30자여야 합니다.' };
  }
  if (password.length < 8) return { status: 400, error: '비밀번호는 8자 이상이어야 합니다.' };
  /* bcrypt 는 72바이트 뒤를 버립니다. 조용히 잘리지 않게 미리 막습니다 */
  if (Buffer.byteLength(password, 'utf8') > 72) return { status: 400, error: '비밀번호가 너무 깁니다 (영문 기준 72자 이하).' };
  if (!name) return { status: 400, error: '이름을 적어 주세요.' };
  if (!org) return { status: 400, error: '소속을 적어 주세요.' };

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    await _pool.query(
      'INSERT INTO users (username, password_hash, name, org) VALUES ($1, $2, $3, $4)',
      [username, hash, name, org]);
  } catch (e) {
    if (e.code === '23505' || /unique|duplicate/i.test(e.message)) {
      return { status: 409, error: '이미 쓰이고 있는 아이디입니다.' };
    }
    throw e;
  }
  console.log(`[계정] 가입 신청: ${username} (${org} ${name})`);
  return { status: 200, ok: true, message: '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.' };
}

/* ── 로그인 ──────────────────────────────────────────────────────────
   ★ 비밀번호를 **먼저** 확인하고, 맞을 때만 "승인 대기" 같은 상태를 알려 줍니다.
   순서를 거꾸로 하면 비밀번호를 몰라도 "이 아이디는 가입돼 있다"를
   알아낼 수 있습니다. 틀린 경우에는 아이디가 없든 비밀번호가 틀렸든
   같은 문구를 씁니다.                                                  */
async function logLogin(username, userId, ip, success, reason) {
  await _pool.query(
    'INSERT INTO login_log (username, user_id, ip, success, reason) VALUES ($1, $2, $3, $4, $5)',
    [username, userId, ip, success, reason]);
}

export async function login(req, res, body) {
  const ip = clientIp(req);
  const now = Date.now();
  const fails = (_fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (fails.length >= FAIL_LIMIT) {
    return { status: 429, error: '로그인 실패가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.' };
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const { rows } = await _pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const u = rows[0];

  /* 없는 아이디여도 해시 비교 시간만큼 기다립니다 — 응답 속도로 가입 여부를 알아내지 못하게 */
  const ok = u ? await bcrypt.compare(password, u.password_hash)
               : (await bcrypt.compare(password, DUMMY_HASH), false);

  if (!ok) {
    fails.push(now); _fails.set(ip, fails);
    await logLogin(username.slice(0, 60), u ? u.id : null, ip, false, 'bad_credentials');
    return { status: 401, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }
  _fails.delete(ip);

  const STATUS_MSG = {
    pending: '승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.',
    rejected: '가입 신청이 승인되지 않았습니다. 관리자에게 문의해 주세요.',
    disabled: '비활성화된 계정입니다. 관리자에게 문의해 주세요.',
  };
  if (u.status !== 'active') {
    await logLogin(username, u.id, ip, false, u.status);
    return { status: 403, error: STATUS_MSG[u.status] || '로그인할 수 없는 계정입니다.', accountStatus: u.status };
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + SESSION_MINUTES * 60000);
  await _pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, ip) VALUES ($1, $2, $3, $4)',
    [sha256(token), u.id, expiresAt, ip]);
  await _pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  /* 끝난 세션 청소 — 로그인할 때 겸사겸사 합니다 */
  await _pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await logLogin(username, u.id, ip, true, null);

  /* 쿠키 수명은 넉넉히(하루) 두고, 실제 만료는 DB 의 expires_at 이 정합니다 */
  setCookie(req, res, token, 24 * 3600);
  console.log(`[로그인] ${username} (${ip})`);
  return { status: 200, ok: true, user: publicUser(u), expiresAt };
}

export async function logout(req, res) {
  const token = readCookie(req, COOKIE);
  if (token && _ready) await _pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  setCookie(req, res, '', 0);
}

/* ── 진단 실행 기록 ──────────────────────────────────────────────────
   누가 · 언제 · 어느 좌표 · 어느 지자체를 진단했는지.
   지자체 이름은 화면이 보낸 주소를 41개 지자체 이름표와 맞대어 찾습니다
   (좌표만으로는 경계 판정이 필요해 주소를 씁니다). 못 찾으면 비워 둡니다. */
let _regionLabels = null;
function regionOf(addr, siteRoot) {
  if (!addr) return null;
  if (!_regionLabels) {
    try {
      const idx = JSON.parse(fs.readFileSync(path.join(siteRoot, 'data/stats/index.json'), 'utf8'));
      /* 긴 이름부터 맞춰야 "중구"가 엉뚱한 곳에 먼저 붙지 않습니다 */
      _regionLabels = idx.regions.map((r) => r.label).sort((a, b) => b.length - a.length);
    } catch { _regionLabels = []; }
  }
  const a = String(addr).replace(/\s+/g, ' ');
  return _regionLabels.find((label) => a.includes(label)) || null;
}

export async function logDiagnosis(req, user, kind, location, siteRoot) {
  if (!_ready) return;
  const loc = location || {};
  const lat = Number.isFinite(Number(loc.lat)) ? Number(loc.lat) : null;
  const lng = Number.isFinite(Number(loc.lng)) ? Number(loc.lng) : null;
  const addr = loc.addr ? String(loc.addr).slice(0, 200) : null;
  try {
    await _pool.query(
      `INSERT INTO diagnosis_log (user_id, username, kind, lat, lng, region, addr, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user ? user.id : null, user ? user.username : null, kind, lat, lng,
       regionOf(addr, siteRoot), addr, clientIp(req)]);
  } catch (e) {
    /* 기록 실패로 진단 자체가 막히면 안 됩니다. 서버 로그에만 남깁니다 */
    console.error('[기록] 진단 이력 저장 실패 —', e.message);
  }
}

/* ── 관리자 ──────────────────────────────────────────────────────── */
export async function listUsers() {
  const { rows } = await _pool.query(
    `SELECT id, username, name, org, role, status, created_at, decided_at, decided_by, last_login_at
     FROM users ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'disabled' THEN 2 ELSE 3 END,
       created_at DESC`);
  return rows;
}

/* 할 수 있는 일과 그 결과 상태 — 여기 없는 조합은 거절합니다 */
const ACTIONS = {
  approve: { from: ['pending', 'rejected'], to: 'active' },
  reject: { from: ['pending'], to: 'rejected' },
  disable: { from: ['active'], to: 'disabled' },
  enable: { from: ['disabled'], to: 'active' },
};

export async function decideUser(admin, id, action) {
  const rule = ACTIONS[action];
  if (!rule) return { status: 400, error: '알 수 없는 작업입니다.' };
  const { rows } = await _pool.query('SELECT id, username, role, status FROM users WHERE id = $1', [Number(id)]);
  const u = rows[0];
  if (!u) return { status: 404, error: '계정을 찾지 못했습니다.' };
  /* 관리자 계정은 화면에서 끌 수 없습니다 — 환경변수로만 관리 (실수로 모두 잠기는 것 방지) */
  if (u.role === 'admin') return { status: 400, error: '관리자 계정은 이 화면에서 바꿀 수 없습니다.' };
  if (!rule.from.includes(u.status)) {
    return { status: 400, error: `지금 상태(${u.status})에서는 할 수 없는 작업입니다.` };
  }
  await _pool.query('UPDATE users SET status = $1, decided_at = now(), decided_by = $2 WHERE id = $3',
    [rule.to, admin.username, u.id]);
  /* 비활성화하면 이미 열린 세션도 바로 끊습니다 */
  if (rule.to !== 'active') await _pool.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
  console.log(`[관리] ${admin.username} → ${u.username}: ${action}`);
  return { status: 200, ok: true };
}

export async function listLogs(type, limit) {
  const n = Math.max(1, Math.min(5000, Number(limit) || 300));
  if (type === 'login') {
    const { rows } = await _pool.query(
      'SELECT at, username, ip, success, reason FROM login_log ORDER BY at DESC LIMIT $1', [n]);
    return rows;
  }
  if (type === 'diagnosis') {
    const { rows } = await _pool.query(
      'SELECT at, username, kind, lat, lng, region, addr, ip FROM diagnosis_log ORDER BY at DESC LIMIT $1', [n]);
    return rows;
  }
  return null;
}
