/* ════════════════════════════════════════════════════════════════════
   지점(위경도) → 41개 지자체 (2026-10-28)

   "이 지점이 어느 지자체 **안에** 있는가"를 지자체 경계로 판정합니다.
   경계: data/stats/region-bounds.json (tools/build-region-bounds.mjs — vuski 행정동을 시군구로 합친 것)

   화면(1단계 지도 · 진단 안내 · 리포트 · 문서)과 서버(server/region.js — AI 판독 중점 분야 · 진단 기록 · 프로젝트)가
   **이 파일 하나**를 함께 씁니다. 판정 규칙을 바꾸려면 여기만 고치면 됩니다.

   ── 왜 ──────────────────────────────────────────────────────────────
   예전에는 지자체마다 출동 지점 평균(중심점) 하나를 두고 가장 가까운 중심점을 골랐습니다.
   섬이 흩어진 옹진군은 중심점이 바다 위라 조사지(영흥도)가 미추홀구로 나왔고(10/28 이은석 박사 지적),
   함양군 조사지는 리포트·문서에서 장수군으로 나왔습니다. 맞닿은 지자체 경계 근처는 출동 지점의 2~10% 가
   이웃 지자체로 갔습니다(41곳 중 21곳).

   ── 쓰는 법 ─────────────────────────────────────────────────────────
     AuriRegion.near(lat, lng)  → { region, label, inside, km }  늘 한 곳 — 1단계 지도 레이어용
                                   (41곳 밖으로 지도를 옮겨도 가까운 지자체 자료를 보여 줌)
     AuriRegion.at(lat, lng)    → 같은 꼴 · 41곳 밖이면 null — 리포트·문서·진단 안내·AI 판독용
                                   (남의 지자체 통계를 빌려 오지 않음)
     둘 다 경계 파일을 못 받으면 undefined — 그때 부르는 쪽은 예전 방식으로 찾습니다.
     inside = 경계 안 · km = 경계 밖일 때 가장 가까운 경계까지(km)
   ════════════════════════════════════════════════════════════════════ */
const AuriRegion = (function () {

  /* 경계 밖이어도 이만큼 안이면 그 지자체로 봅니다 — 해안·부두, 경계 단순화(해안선 100m) 오차.
     이보다 멀면 41개 대상 지자체 밖입니다. */
  const NEAR_KM = 1;

  /* 홀짝 판정 — 점에서 그은 반직선이 고리들과 홀수 번 만나면 안. 고리는 [위도, 경도, …] 납작한 배열 */
  function inRings(rings, lat, lng) {
    let inside = false;
    for (const g of rings) {
      for (let i = 0, j = g.length - 2; i < g.length; j = i, i += 2) {
        const yi = g[i], xi = g[i + 1], yj = g[j], xj = g[j + 1];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }

  /* 점에서 고리들의 가장 가까운 변까지 거리(km) — 짧은 거리라 평면으로 계산 */
  function ringsKm(rings, lat, lng) {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    let best = Infinity;
    for (const g of rings) {
      for (let i = 2; i < g.length; i += 2) {
        const ax = (g[i - 1] - lng) * kx, ay = (g[i - 2] - lat) * ky;
        const bx = (g[i + 1] - lng) * kx, by = (g[i] - lat) * ky;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L ? -(ax * dx + ay * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + t * dx, py = ay + t * dy, d = px * px + py * py;
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  }

  /* 사각 범위(bbox)까지의 거리 — 멀리 있는 지자체는 고리를 보지 않고 건너뛰려고 */
  function bboxKm(b, lat, lng) {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    const dy = lat < b[0] ? b[0] - lat : lat > b[2] ? lat - b[2] : 0;
    const dx = lng < b[1] ? b[1] - lng : lng > b[3] ? lng - b[3] : 0;
    return Math.hypot(dx * kx, dy * ky);
  }

  /** 늘 한 곳 — 경계 안이면 그 지자체, 밖이면 가장 가까운 경계의 지자체 */
  function locate(data, lat, lng) {
    if (!data || !data.regions) return null;
    lat = Number(lat); lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const keys = Object.keys(data.regions);
    const out = (k, inside, km) => ({ region: k, label: data.regions[k].label, inside: inside, km: km });
    const hits = keys.filter((k) => {
      const r = data.regions[k], b = r.bbox;
      return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3] && inRings(r.rings, lat, lng);
    });
    if (hits.length === 1) return out(hits[0], true, 0);
    if (hits.length > 1) {
      /* 맞닿은 경계 바로 위 — 경계에서 더 안쪽인 지자체 */
      let best = hits[0], bd = -1;
      for (const k of hits) { const d = ringsKm(data.regions[k].rings, lat, lng); if (d > bd) { bd = d; best = k; } }
      return out(best, true, 0);
    }
    let best = null, bk = Infinity;
    for (const k of keys) {
      const r = data.regions[k];
      if (bboxKm(r.bbox, lat, lng) >= bk) continue;
      const d = ringsKm(r.rings, lat, lng);
      if (d < bk) { bk = d; best = k; }
    }
    return best ? out(best, false, Math.round(bk * 100) / 100) : null;
  }

  /** 41곳 안(또는 NEAR_KM 안)만 — 밖이면 null */
  function pick(data, lat, lng) {
    const hit = locate(data, lat, lng);
    return hit && (hit.inside || hit.km <= NEAR_KM) ? hit : null;
  }

  /* ── 브라우저 — 경계 파일은 한 번만 받습니다 ─────────────────────── */
  let _p = null;
  function load() {
    if (!_p) {
      _p = fetch('data/stats/region-bounds.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((d) => { if (!d) console.warn('[지자체 판정] 경계 파일을 받지 못해 예전 방식(가장 가까운 중심점)으로 찾습니다'); return d; });
    }
    return _p;
  }
  async function near(lat, lng) { const d = await load(); return d ? locate(d, lat, lng) : undefined; }
  async function at(lat, lng) { const d = await load(); return d ? pick(d, lat, lng) : undefined; }

  return { locate, pick, load, near, at, NEAR_KM };
})();

/* 서버(server/region.js)·점검 도구가 require 로 같은 코드를 씁니다 */
if (typeof module !== 'undefined' && module.exports) module.exports = AuriRegion;
