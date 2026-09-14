/* ════════════════════════════════════════════════════════════════════
   프로젝트 저장 · 불러오기 (2026-09-15)

   진단 한 건은 브라우저 탭 안(sessionStorage)에만 있어서 탭을 닫으면
   사라집니다. 그 내용을 **계정별로 DB 에 저장**해 두었다가 다시 엽니다.

   무엇을 저장하나 — 진단 한 건을 이루는 열 가지 (SAVE_KEYS)
   ──────────────────────────────────────────────────────────
     위치 · 입력 사진 · 판독 결과 · 재판독 이력 · 처방 수정 · 처방 목록 ·
     지자체 통계 요약 · 개선 후 이미지 · 문서 빈칸 글 · 현장 사진

   누가 무엇을 할 수 있나
   ──────────────────────
                     내 프로젝트     남의 프로젝트
     일반 사용자      열기·저장·삭제   ✗ (목록에도 안 보임)
     관리자           열기·저장·삭제   **열기만** — 저장하면 관리자 이름으로 새로 복사

   ★ 관리자가 남의 프로젝트를 고쳐 덮어쓰지 못하게 한 이유: 그 프로젝트의
     판독 보정·문서 글은 **작성자의 판단 기록**입니다. 관리자가 덮어쓰면
     누가 무엇을 판단했는지 되짚을 수 없게 됩니다(감사 추적).

   ⚠️ 이미지가 들어 있어 한 건이 수백 KB ~ 수 MB 입니다. 렌더 무료 DB 는 1GB라
      대략 수백 건이 한도입니다. 목록에 크기가 함께 나옵니다.
   ════════════════════════════════════════════════════════════════════ */

import * as auth from './auth.js';

/* 진단 한 건을 이루는 브라우저 저장 칸 — 여기 적힌 것만 저장·복원합니다.
   ★ 앱에 새 저장 칸이 생기면 여기에도 넣어야 저장됩니다(안 넣으면 조용히 빠짐). */
export const SAVE_KEYS = [
  'auri_picked_location', 'auri_input_image', 'auri_diagnosis_results',
  'auri_revision_log', 'auri_rx_overrides', 'auri_prescriptions',
  'auri_region_stats', 'auri_after_image', 'auri_doc_notes', 'auri_site_photos',
];

const MAX_BYTES = 25 * 1024 * 1024;   // 한 건 25MB — 서버가 받는 요청 한도(30MB) 안쪽

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  addr       TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  region     TEXT,
  step       INTEGER NOT NULL DEFAULT 1,
  summary    TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let _ready = false;
export const projectsReady = () => _ready;

export async function initProjects() {
  const pool = auth.db();
  if (!pool) return false;
  try {
    await pool.query(SCHEMA);
    await pool.query('CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, updated_at)');
    _ready = true;
  } catch (e) {
    _ready = false;
    console.error('[프로젝트] 표 준비 실패 —', e.message);
  }
  return _ready;
}

/* ── 저장할 내용 정리 ─────────────────────────────────────────────────
   브라우저가 보낸 것 중 SAVE_KEYS 에 있는 **문자열**만 남깁니다.
   아무 칸이나 받으면 로그인 열쇠 같은 것이 섞여 들어올 수 있습니다.   */
function cleanData(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of SAVE_KEYS) {
    if (typeof raw[k] === 'string' && raw[k].length) out[k] = raw[k];
  }
  return out;
}

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

/* 어디까지 진행했는지 — 목록에 "3 리포트" 처럼 보여 줍니다 */
function stepOf(d) {
  if (d.auri_after_image) return 4;
  if (d.auri_prescriptions) return 3;
  if (d.auri_diagnosis_results) return 2;
  return 1;
}

/* 판독 결과 한 줄 요약 — "위험 2 · 주의 4 · 안전 1"
   경계는 처방 규칙표와 같은 67 / 34 입니다. */
function summaryOf(d) {
  const results = parse(d.auri_diagnosis_results);
  if (!Array.isArray(results) || !results.length) return null;
  let danger = 0; let caution = 0; let safe = 0;
  for (const r of results) {
    const s = Number(r.score) || 0;
    if (s >= 67) danger++; else if (s >= 34) caution++; else safe++;
  }
  return `위험 ${danger} · 주의 ${caution} · 안전 ${safe}`;
}

const idOf = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/* ── 목록 ────────────────────────────────────────────────────────────
   scope=mine  내 것만 (누구나)
   scope=all   모든 사용자 (관리자만) · userId 로 한 사람만 거를 수 있음
   ★ 목록에는 data(이미지 등 본문)를 싣지 않습니다 — 수십 MB 가 오갑니다. */
export async function listProjects(user, scope, userId) {
  const pool = auth.db();
  const cols = `p.id, p.title, p.addr, p.lat, p.lng, p.region, p.step, p.summary, p.size_bytes,
                p.created_at, p.updated_at, p.user_id, u.username AS owner_username, u.name AS owner_name, u.org AS owner_org`;
  if (scope === 'all') {
    if (user.role !== 'admin') return { status: 403, error: '전체 프로젝트는 관리자만 볼 수 있습니다.' };
    const uid = idOf(userId);
    const { rows } = uid
      ? await pool.query(`SELECT ${cols} FROM projects p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 ORDER BY p.updated_at DESC`, [uid])
      : await pool.query(`SELECT ${cols} FROM projects p JOIN users u ON u.id = p.user_id ORDER BY p.updated_at DESC`);
    return { status: 200, projects: rows };
  }
  const { rows } = await pool.query(
    `SELECT ${cols} FROM projects p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 ORDER BY p.updated_at DESC`,
    [user.id]);
  return { status: 200, projects: rows };
}

/* ── 한 건 열기 ──────────────────────────────────────────────────── */
export async function getProject(user, id) {
  const pid = idOf(id);
  if (!pid) return { status: 400, error: '프로젝트 번호가 올바르지 않습니다.' };
  const { rows } = await auth.db().query(
    `SELECT p.*, u.username AS owner_username, u.name AS owner_name
     FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1`, [pid]);
  const p = rows[0];
  /* 남의 것은 "없음"과 같은 답을 줍니다 — 번호를 바꿔 가며 남의 프로젝트가
     있는지 떠볼 수 없게 */
  if (!p || (p.user_id !== user.id && user.role !== 'admin')) {
    return { status: 404, error: '프로젝트를 찾지 못했습니다.' };
  }
  return {
    status: 200,
    project: {
      id: p.id, title: p.title, addr: p.addr, region: p.region, step: p.step,
      createdAt: p.created_at, updatedAt: p.updated_at,
      owner: { id: p.user_id, username: p.owner_username, name: p.owner_name },
      mine: p.user_id === user.id,
      data: cleanData(parse(p.data)),
    },
  };
}

/* ── 저장 ────────────────────────────────────────────────────────────
   body.id 가 있고 **내 것**이면 덮어쓰기, 아니면 새로 만듭니다.
   남의 프로젝트 번호를 보내면 덮어쓰지 않고 거절합니다.               */
export async function saveProject(user, body, siteRoot) {
  const data = cleanData(body && body.data);
  if (!data.auri_picked_location) {
    return { status: 400, error: '저장할 진단이 없습니다. 먼저 지도에서 위치를 선택해 주세요.' };
  }
  const text = JSON.stringify(data);
  const size = Buffer.byteLength(text, 'utf8');
  if (size > MAX_BYTES) {
    return { status: 413, error: `프로젝트가 너무 큽니다 (${Math.round(size / 1048576)}MB). 현장 사진을 빼고 저장해 보세요.` };
  }

  const picked = parse(data.auri_picked_location) || {};
  const addr = picked.addr ? String(picked.addr).slice(0, 200) : null;
  const lat = Number.isFinite(Number(picked.lat)) ? Number(picked.lat) : null;
  const lng = Number.isFinite(Number(picked.lng)) ? Number(picked.lng) : null;
  const region = auth.regionOf(addr, siteRoot);
  const title = String((body && body.title) || '').trim().slice(0, 100)
    || [region, addr].filter(Boolean)[0] || '이름 없는 프로젝트';
  const pool = auth.db();

  const pid = idOf(body && body.id);
  if (pid) {
    const { rows } = await pool.query('SELECT user_id FROM projects WHERE id = $1', [pid]);
    if (!rows.length) return { status: 404, error: '덮어쓸 프로젝트를 찾지 못했습니다. 새 프로젝트로 저장해 주세요.' };
    if (rows[0].user_id !== user.id) {
      return { status: 403, error: '다른 사람의 프로젝트는 덮어쓸 수 없습니다. 새 프로젝트로 저장해 주세요.' };
    }
    await pool.query(
      `UPDATE projects SET title=$1, addr=$2, lat=$3, lng=$4, region=$5, step=$6, summary=$7,
         size_bytes=$8, data=$9, updated_at=now() WHERE id=$10`,
      [title, addr, lat, lng, region, stepOf(data), summaryOf(data), size, text, pid]);
    console.log(`[프로젝트] ${user.username} 덮어쓰기 #${pid} (${Math.round(size / 1024)}KB)`);
    return { status: 200, ok: true, id: pid, title, created: false };
  }

  const { rows } = await pool.query(
    `INSERT INTO projects (user_id, title, addr, lat, lng, region, step, summary, size_bytes, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [user.id, title, addr, lat, lng, region, stepOf(data), summaryOf(data), size, text]);
  console.log(`[프로젝트] ${user.username} 새로 저장 #${rows[0].id} (${Math.round(size / 1024)}KB)`);
  return { status: 200, ok: true, id: rows[0].id, title, created: true };
}

/* ── 삭제 — 자기 것만 ────────────────────────────────────────────────
   관리자도 남의 것은 지우지 못합니다. 요청이 "열람"까지였고,
   지우면 되돌릴 수 없기 때문입니다. */
export async function deleteProject(user, id) {
  const pid = idOf(id);
  if (!pid) return { status: 400, error: '프로젝트 번호가 올바르지 않습니다.' };
  const { rows } = await auth.db().query('SELECT user_id FROM projects WHERE id = $1', [pid]);
  if (!rows.length || rows[0].user_id !== user.id) {
    return { status: 404, error: '삭제할 수 있는 프로젝트가 아닙니다.' };
  }
  await auth.db().query('DELETE FROM projects WHERE id = $1', [pid]);
  console.log(`[프로젝트] ${user.username} 삭제 #${pid}`);
  return { status: 200, ok: true };
}
