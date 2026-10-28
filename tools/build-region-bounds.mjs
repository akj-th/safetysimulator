/* ════════════════════════════════════════════════════════════════════
   지자체 경계 → data/stats/region-bounds.json (2026-10-28)

   "이 지점은 41개 지자체 중 어디인가"를 **행정 경계 안에 드는지**로 판정하기 위한 가벼운 경계 파일입니다.
   화면(assets/region-bounds.js — 1단계 지도·리포트·문서·진단 안내)과 서버(AI 판독 중점 분야·진단 기록·프로젝트)가
   모두 이 파일 하나로 판정합니다.

   ── 왜 ──────────────────────────────────────────────────────────────
   예전에는 지자체마다 출동 지점 평균(중심점) 하나를 두고 **가장 가까운 중심점**을 골랐습니다.
   섬이 흩어진 옹진군은 중심점이 바다 위(덕적도 쪽)에 찍혀 조사지(영흥도)가 미추홀구로,
   함양군 조사지는 리포트에서 장수군으로 나왔습니다. 붙어 있는 지자체 경계 근처(관악↔금천, 남원↔함양,
   안동↔청송, 정선↔태백 …)도 출동 지점의 2~10% 가 이웃 지자체로 갔습니다 (10/28 이은석 박사 지적 → 41곳 점검).

   ── 입력 ────────────────────────────────────────────────────────────
   - data/dong/<지역>.json 의 boundary.sggCodes · boundary.files — 그 지자체의 시군구 코드.
     build-dong-hea.mjs 가 출동 좌표 전부의 5% 이상이 떨어지는 시군구로 고른 것(build-stats 와 같은 규칙)이라 여기서 다시 고르지 않습니다.
   - data/raw/admin_boundary_hjd/<그 파일> — vuski 행정동 경계(WGS84, 🔴 원본은 커밋 안 함).
     출동이 0건인 행정동도 포함해 **시군구 전체**를 씁니다(data/dong 은 출동 0 인 동을 빼므로 그대로 쓰면 구멍이 남).

   ── 출력 ────────────────────────────────────────────────────────────
   regions.<지역> = { label, sggCodes, dongs, bbox: [남, 서, 북, 동], rings: [고리, …] }
   고리는 [위도, 경도, 위도, 경도, …] 납작한 배열(첫 점 = 끝 점). 바깥 경계·섬·구멍을 가리지 않고 한 목록에 둡니다 —
   판정은 **홀짝**(점에서 그은 반직선이 고리들과 몇 번 만나는가)이라 고리의 종류를 몰라도 됩니다.

   ── 동 경계 지우기 (지자체 바깥 경계만) ─────────────────────────────
   이웃한 두 행정동이 함께 쓰는 선분은 두 번 나오므로 짝을 지워 없애고, 남은 선분을 이어 고리로 만듭니다.
   홀짝 판정은 선분 집합에만 달려 있어서, 짝이 맞지 않아 안쪽 선이 남더라도(꼭짓점이 조금 다른 경우) 판정은 그대로입니다 —
   크기만 조금 커질 뿐입니다.

   ── 단순화 (더글러스-포이커) ────────────────────────────────────────
   판정이 갈리는 곳은 **41곳끼리 맞닿은 경계**(관악↔금천, 함양↔남원, 정선↔태백 …)뿐이라 거기만 촘촘하게 둡니다.
     TOL_SHARED (15m) — 다른 대상 지자체와 맞닿은 경계. 양쪽이 같은 점을 남기므로 두 지자체 사이에 틈·겹침이 없습니다.
     TOL_OTHER (100m) — 해안선·대상이 아닌 지자체와의 경계. 여기서 조금 비켜도 "가장 가까운 경계"(NEAR_KM) 로 같은 결과.
   너무 작아져 고리가 안 되는 섬은 원래 꼭짓점에서 고르게 5점을 뽑아 남깁니다(섬 자체를 잃지 않게).

   npm run region-bounds --prefix tools      (dong-hea 뒤 · 경계 파일이나 시군구 코드가 바뀌면)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const HJD_DIR = path.join(ROOT, 'data/raw/admin_boundary_hjd');
const OUT = path.join(ROOT, 'data/stats/region-bounds.json');

const TOL_SHARED = 15;     // 다른 대상 지자체와 맞닿은 경계(m)
const TOL_OTHER = 100;     // 그 밖의 경계 — 해안선·대상 밖 지자체(m)
const DIGITS = 5;          // 위경도 소수 자리(5 = 약 1m)

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* 위경도 → 지역 중심 기준 평면 m (단순화 거리 계산용) */
function projector(lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  return ([lng, lat]) => [lng * kx, lat * ky];
}

/* 점 p 와 선분 ab 의 거리(평면) */
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* 꼭짓점 번호 목록 idx(평면 좌표 P 의 번호, 처음·끝 포함)를 더글러스-포이커로 — 남길 번호를 keep 에 표시 */
function dpMark(P, idx, tol, keep) {
  const stack = [[0, idx.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const d = segDist(P[idx[i]], P[idx[a]], P[idx[b]]); if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[idx[best]] = true; stack.push([a, best], [best, b]); }
  }
}

/* 닫힌 고리(위경도 [lng, lat], 첫 점 = 끝 점) → 단순화한 납작 고리 [lat, lng, …]
   edgeTag(a, b) = 그 변이 맞닿은 다른 대상 지자체(없으면 '') — 맞닿은 상대가 바뀌는 꼭짓점에서 끊어 구간마다 따로 단순화합니다.
   같은 구간을 이웃 지자체도 똑같이 끊어 단순화하므로 두 쪽이 같은 점을 남깁니다. */
function simplifyRing(ring, proj, edgeTag) {
  const pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const n = pts.length;
  if (n < 3) return null;
  let kept;
  if (n <= 5) kept = pts;
  else {
    const P = pts.map(proj);
    const tag = pts.map((p, i) => edgeTag(p, pts[(i + 1) % n]));          // tag[i] = 변 i → i+1
    const tolOf = (t) => (t ? TOL_SHARED : TOL_OTHER);
    const keep = new Array(n).fill(false);
    const breaks = [];
    for (let i = 0; i < n; i++) if (tag[(i - 1 + n) % n] !== tag[i]) breaks.push(i);
    const run = (a, b) => { const idx = [a]; for (let i = a; i !== b;) { i = (i + 1) % n; idx.push(i); } return idx; };
    if (!breaks.length) {
      /* 한 종류로만 된 고리 — 첫 점에서 가장 먼 점으로 둘로 나눠 각각 */
      let far = 0, fd = -1;
      for (let i = 1; i < n; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > fd) { fd = d; far = i; } }
      keep[0] = keep[far] = true;
      dpMark(P, run(0, far), tolOf(tag[0]), keep);
      dpMark(P, run(far, 0), tolOf(tag[0]), keep);
    } else {
      for (const b of breaks) keep[b] = true;
      for (let j = 0; j < breaks.length; j++) {
        const a = breaks[j], b = breaks[(j + 1) % breaks.length];
        dpMark(P, run(a, b), tolOf(tag[a]), keep);
      }
    }
    kept = pts.filter((_, i) => keep[i]);
    if (kept.length < 3) kept = [0, 1, 2, 3, 4].map((j) => pts[Math.floor(j * n / 5)]);
  }
  const f = 10 ** DIGITS;
  const flat = [];
  for (const [lng, lat] of kept.concat([kept[0]])) flat.push(Math.round(lat * f) / f, Math.round(lng * f) / f);
  return flat;
}

const vkey = (p) => p[0] + ',' + p[1];
const ekey = (ka, kb) => (ka < kb ? ka + '|' + kb : kb + '|' + ka);

/* 행정동 고리들(GeoJSON [경도, 위도], 닫힘) → 함께 쓰는 선분을 지운 바깥 경계 고리들 */
function dissolve(rings) {
  const edges = new Map();
  for (const ring of rings) for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1], ka = vkey(a), kb = vkey(b);
    if (ka === kb) continue;
    const ek = ekey(ka, kb);
    const e = edges.get(ek);
    if (e) e.n++; else edges.set(ek, { a, b, ka, kb, ek, n: 1 });
  }
  const adj = new Map();
  const live = [];
  for (const e of edges.values()) {
    if (e.n % 2 === 0) continue;                       // 두 동이 함께 쓰는 선분 — 지움
    live.push(e);
    for (const k of [e.ka, e.kb]) { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); }
  }
  /* 남은 선분은 모든 꼭짓점에서 짝수 개씩 만나므로 언제나 닫힌 고리로 나뉩니다 */
  const used = new Set();
  const out = [];
  let open = 0;
  for (const e0 of live) {
    if (used.has(e0)) continue;
    used.add(e0);
    const ring = [e0.a, e0.b];
    const start = e0.ka;
    let cur = e0.kb;
    while (cur !== start) {
      const next = (adj.get(cur) || []).find((e) => !used.has(e));
      if (!next) break;
      used.add(next);
      const fwd = next.ka === cur;
      ring.push(fwd ? next.b : next.a);
      cur = fwd ? next.kb : next.ka;
    }
    if (cur !== start) { open++; ring.push(ring[0]); }
    out.push(ring);
  }
  return { rings: out, open, liveKeys: live.map((e) => e.ek) };
}

function main() {
  const idx = readJson(path.join(ROOT, 'data/stats/index.json'));
  const need = {};          // 경계 파일 이름 → { 시군구 코드 → [지역…] }
  const plan = [];
  for (const r of idx.regions) {
    const p = path.join(ROOT, 'data/dong', r.region + '.json');
    if (!fs.existsSync(p)) { console.warn(`⚠ ${r.region}: data/dong 없음 — 경계를 만들지 못함`); continue; }
    const b = readJson(p).boundary || {};
    const codes = (b.sggCodes || []).map(String);
    const file = (b.files || [])[0];
    if (!codes.length || !file) { console.warn(`⚠ ${r.region}: 동 자료에 시군구 코드가 없음 (boundary.status=${b.status})`); continue; }
    plan.push({ region: r.region, label: r.label, codes, file });
    const m = (need[file] ||= {});
    for (const c of codes) (m[c] ||= []).push(r.region);
  }

  const ringsOf = {};        // 지역 → 행정동 고리들(원본 해상도)
  const dongsOf = {};
  for (const [file, byCode] of Object.entries(need)) {
    const fp = path.join(HJD_DIR, file);
    if (!fs.existsSync(fp)) throw new Error(`행정동 경계 파일이 없습니다: ${fp}`);
    const gj = readJson(fp);
    for (const ft of gj.features || []) {
      const code = String((ft.properties || {}).sgg || '').trim();
      const regions = byCode[code];
      if (!regions || !ft.geometry) continue;
      const g = ft.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const region of regions) {
        dongsOf[region] = (dongsOf[region] || 0) + 1;
        for (const poly of polys) for (const ring of poly) (ringsOf[region] ||= []).push(ring);
      }
    }
  }

  const out = { generatedAt: new Date().toISOString().slice(0, 10),
    source: 'vuski/admdongkor 행정동 경계 · 시군구 코드는 data/dong/<지역>.json boundary.sggCodes',
    rule: `지점이 든 지자체 경계(행정동 합, 홀짝 판정) — 경계 밖이면 가장 가까운 경계. 단순화: 다른 대상 지자체와 맞닿은 경계 ${TOL_SHARED}m · 그 밖 ${TOL_OTHER}m`,
    tolSharedM: TOL_SHARED, tolOtherM: TOL_OTHER, regions: {} };

  /* 1차 — 지자체마다 동 경계 지우기 + 어느 변이 어느 지자체 것인지 */
  const dissolved = {};
  const owners = new Map();                    // 변 → 그 변을 바깥 경계로 가진 지자체들
  for (const p of plan) {
    const src = ringsOf[p.region] || [];
    if (!src.length) { console.warn(`⚠ ${p.region}: 경계 파일에서 시군구 ${p.codes.join(',')} 를 찾지 못함`); continue; }
    const d = dissolve(src);
    if (d.open) console.warn(`⚠ ${p.region}: 닫히지 않은 경계 ${d.open}개 (판정에는 영향 없음 — 확인 권장)`);
    dissolved[p.region] = d;
    for (const ek of d.liveKeys) { if (!owners.has(ek)) owners.set(ek, []); owners.get(ek).push(p.region); }
  }
  const sharedPairs = {};
  for (const regs of owners.values()) if (regs.length > 1) { const k = regs.slice().sort().join('↔'); sharedPairs[k] = (sharedPairs[k] || 0) + 1; }

  /* 2차 — 단순화 (맞닿은 경계는 촘촘하게) */
  let vertices = 0, rings = 0;
  for (const p of plan) {
    const d = dissolved[p.region];
    if (!d) continue;
    const edgeTag = (a, b) => {
      const regs = owners.get(ekey(vkey(a), vkey(b)));
      return regs && regs.length > 1 ? regs.filter((r) => r !== p.region).sort().join(',') : '';
    };
    const proj = projector(d.rings[0][0][1]);
    const flat = d.rings.map((ring) => simplifyRing(ring, proj, edgeTag)).filter(Boolean);
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const ring of flat) for (let i = 0; i < ring.length; i += 2) {
      const la = ring[i], ln = ring[i + 1];
      if (la < s) s = la; if (la > n) n = la; if (ln < w) w = ln; if (ln > e) e = ln;
      vertices++;
    }
    rings += flat.length;
    out.regions[p.region] = { label: p.label, sggCodes: p.codes, dongs: dongsOf[p.region], bbox: [s, w, n, e], rings: flat };
  }
  const text = JSON.stringify(out);
  fs.writeFileSync(OUT, text);
  console.log(`✓ ${path.relative(ROOT, OUT)} — ${Object.keys(out.regions).length}곳 · 고리 ${rings.toLocaleString()} · 꼭짓점 ${vertices.toLocaleString()} · ${(text.length / 1024).toFixed(0)}KB`);
  console.log(`  맞닿은 대상 지자체 ${Object.keys(sharedPairs).length}쌍 (변 수): ${Object.entries(sharedPairs).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
}

main();
