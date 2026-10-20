/* ════════════════════════════════════════════════════════════════════
   종합도 v3 — 담당자 금천구 수정본(2026-10-20, geumcheon_종합도_최종.svg)에서 읽어 낸 규칙

   수정본과 생성본을 맞대어 본 차이:
     ① 사업지 구역: AURI 가 그린 다각형을 그대로 쓰지 않고, **도로로 둘러싸인 블록(대지)** 단위로
        그 유형에 엮이는 땅을 다시 그림 (병원 블록·상가 블록·아파트 단지·교차로 모퉁이). 칠 40%.
     ② 번호: 상자 읽는 순서 — 왼쪽 열 위→아래 1·2·3·4, 오른쪽 열 위→아래 5·6·7.
        번호 원은 구역 **가장자리**, 상자 쪽 변의 제목 줄 높이에. 지시선은 거기서 수평(필요하면 한 번 꺾음).
     ③ 상자는 좌·우 두 열만(바닥 줄 없음). 키맵·범례는 **우하단**에 위아래로.
     ④ 방위표: 원 + 세로선 + N (우상단).
     ⑤ 시설 이름은 점 **아래 가운데**, 지명은 큰 글자(자간 .3em)로 **구역·상자·시설과 겹치지 않는 자리**에.
        상자에 가리는 지명은 뺌(미성동).

   이 파일은 순수 계산만 합니다(픽셀 단위). SVG 는 build-overview-map.mjs 가 그립니다.
   켜는 법: regions/<지역>.json 의 "style": {"v3": true} 또는 --v3.
   ════════════════════════════════════════════════════════════════════ */

/* ── 격자 래스터 ─────────────────────────────────────────────────── */
export function makeGrid(W, H, g) {
  const GW = Math.ceil(W / g), GH = Math.ceil(H / g);
  return { W, H, g, GW, GH, idx: (i, j) => j * GW + i };
}
/** 다각형(px 링들)을 격자에 칠합니다 (각 링 독립 OR, 구멍 무시). */
export function fillRings(grid, rings, mask, value = 1) {
  const { g, GW, GH } = grid;
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    let minY = Infinity, maxY = -Infinity;
    for (const p of ring) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const j0 = Math.max(0, Math.floor(minY / g)), j1 = Math.min(GH - 1, Math.ceil(maxY / g));
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * g; const xs = [];
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const p = ring[a], q = ring[b];
        if ((p[1] > y) !== (q[1] > y)) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.round(xs[k] / g)), i1 = Math.min(GW - 1, Math.round(xs[k + 1] / g) - 1);
        for (let i = i0; i <= i1; i++) mask[j * GW + i] = value;
      }
    }
  }
  return mask;
}
/** 1 인 칸의 4-이웃 연결 성분 번호 (0 = 막힘). labels[cell] = 1.. */
export function components(grid, free) {
  const { GW, GH } = grid; const n = GW * GH;
  const labels = new Int32Array(n); const area = [0]; let L = 0;
  const q = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!free[s] || labels[s]) continue;
    L++; let h = 0, t = 0; q[t++] = s; labels[s] = L; let cnt = 0;
    while (h < t) {
      const c = q[h++]; cnt++;
      const i = c % GW, j = (c / GW) | 0;
      if (i > 0 && free[c - 1] && !labels[c - 1]) { labels[c - 1] = L; q[t++] = c - 1; }
      if (i < GW - 1 && free[c + 1] && !labels[c + 1]) { labels[c + 1] = L; q[t++] = c + 1; }
      if (j > 0 && free[c - GW] && !labels[c - GW]) { labels[c - GW] = L; q[t++] = c - GW; }
      if (j < GH - 1 && free[c + GW] && !labels[c + GW]) { labels[c + GW] = L; q[t++] = c + GW; }
    }
    area[L] = cnt;
  }
  return { labels, area, count: L };
}
function dilate(grid, mask, r) {
  const { GW, GH } = grid; const out = new Uint8Array(mask);
  const r2 = r * r;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!mask[j * GW + i]) continue;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r2) continue;
      const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      out[y * GW + x] = 1;
    }
  }
  return out;
}
function fillHoles(grid, mask) {
  const { GW, GH } = grid; const n = GW * GH;
  const outside = new Uint8Array(n); const q = new Int32Array(n); let h = 0, t = 0;
  const push = (c) => { if (!mask[c] && !outside[c]) { outside[c] = 1; q[t++] = c; } };
  for (let i = 0; i < GW; i++) { push(i); push((GH - 1) * GW + i); }
  for (let j = 0; j < GH; j++) { push(j * GW); push(j * GW + GW - 1); }
  while (h < t) { const c = q[h++]; const i = c % GW, j = (c / GW) | 0; if (i > 0) push(c - 1); if (i < GW - 1) push(c + 1); if (j > 0) push(c - GW); if (j < GH - 1) push(c + GW); }
  const out = new Uint8Array(n); for (let c = 0; c < n; c++) out[c] = mask[c] || !outside[c] ? 1 : 0;
  return out;
}
/** 1 영역의 테두리를 칸 모서리를 따라 닫힌 링으로 (화면 px) */
export function traceRings(grid, mask) {
  const { GW, GH, g } = grid;
  const at = (i, j) => (i < 0 || j < 0 || i >= GW || j >= GH) ? 0 : mask[j * GW + i];
  const edges = new Map();            // 시작 꼭짓점 → [끝 꼭짓점…]  (시계 방향: 위→오른→아래→왼)
  const key = (i, j) => i + ',' + j;
  const add = (a, b) => { const k = key(a[0], a[1]); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!mask[j * GW + i]) continue;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]);
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const rings = [];
  for (const [k0, list0] of edges) {
    while (list0.length) {
      const start = k0.split(',').map(Number); let cur = list0.pop(); const ring = [start];
      let guard = 0;
      while (!(cur[0] === start[0] && cur[1] === start[1]) && guard++ < 1e6) {
        ring.push(cur);
        const nk = key(cur[0], cur[1]); const nl = edges.get(nk); if (!nl || !nl.length) break;
        /* 꼭짓점에 나가는 변이 둘이면(대각선 접촉) 방금 온 방향에서 오른쪽으로 도는 쪽을 고릅니다 */
        let next = nl.pop();
        if (nl.length) { const prev = ring[ring.length - 2]; const dx = cur[0] - prev[0], dy = cur[1] - prev[1]; const want = [cur[0] + dy, cur[1] - dx]; const alt = nl.findIndex(p => p[0] === want[0] && p[1] === want[1]); if (alt >= 0) { nl.push(next); next = nl.splice(alt, 1)[0]; } }
        cur = next;
      }
      if (ring.length >= 4) rings.push(ring.map(p => [p[0] * g, p[1] * g]));
    }
  }
  return rings;
}
export const ringArea = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
export const centroidOf = (rings) => { let sx = 0, sy = 0, n = 0; for (const r of rings) for (const p of r) { sx += p[0]; sy += p[1]; n++; } return n ? [sx / n, sy / n] : [0, 0]; };
export const pointIn = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/* ── ① 구역을 도로 블록으로 다시 그리기 ───────────────────────────── */
/**
 * @param zones  [{ rings:[px ring…], markers:[px…], pois:[px…] }]
 * @param base   { roads:[px ring…], water:[px ring…], land:[px ring…] (비면 전부 육지) }
 * @param opt    { g:2, minRatio:.35, maxMul:3, dilatePx:7, simplifyPx:3, minPartRatio:.08 }
 * @returns      zones 와 같은 길이 [{ rings, fitted:boolean, note }]
 */
function erode(grid, mask, r) { const n = mask.length; const inv = new Uint8Array(n); for (let c = 0; c < n; c++) inv[c] = mask[c] ? 0 : 1; const d = dilate(grid, inv, r); const out = new Uint8Array(n); for (let c = 0; c < n; c++) out[c] = d[c] ? 0 : 1; return out; }
function maskToRings(grid, m, simplifyFn, tol, minPartRatio) {
  let rings = traceRings(grid, m).map(r => simplifyFn ? simplifyFn(r, tol) : r).filter(r => r.length >= 3);
  if (!rings.length) return [];
  const maxA = Math.max(...rings.map(ringArea));
  rings = rings.filter(r => ringArea(r) >= (minPartRatio ?? 0.08) * maxA);
  return rings.filter(r => !rings.some(o => o !== r && ringArea(o) > ringArea(r) && pointIn(r[0], o)));   // 구멍(안쪽 링)은 버림
}
/**
 * zones[i].kind === 'intersection' 이면 교차로형: 중심 반경 crossR 안의 도로를 양옆으로 넓혀 십자 모양.
 * opt.closePx: 이보다 좁은 길은 블록 경계로 치지 않음(골목으로 나뉜 블록을 큰 가구 단위로 합침).
 * 블록은 가장 많이 덮는 사업지 하나에만 갑니다(구역이 서로 겹치지 않게).
 */
export function fitZonesToBlocks(W, H, zones, base, opt = {}, simplifyFn) {
  const g = opt.g || 2, grid = makeGrid(W, H, g); const n = grid.GW * grid.GH;
  const roadMask = new Uint8Array(n); fillRings(grid, base.roads || [], roadMask, 1);
  let blocked = new Uint8Array(roadMask);
  fillRings(grid, base.water || [], blocked, 1);
  if (base.land && base.land.length) { const land = new Uint8Array(n); fillRings(grid, base.land, land, 1); for (let c = 0; c < n; c++) if (!land[c]) blocked[c] = 1; }
  const cr = Math.round((opt.closePx ?? 0) / g);
  if (cr > 0) blocked = dilate(grid, erode(grid, blocked, cr), cr);     // 열림: 좁은 길 제거
  const free = new Uint8Array(n); for (let c = 0; c < n; c++) free[c] = blocked[c] ? 0 : 1;
  const comp = components(grid, free);
  if (opt.debug) { const big = [...comp.area].map((a, i) => [i, a]).slice(1).sort((a, b) => b[1] - a[1]).slice(0, 6); console.log('    블록 ' + comp.count + '개 · 큰 것 ' + big.map(b => b[1]).join(',') + ' 칸 · 열림 r=' + cr); }
  const minRatio = opt.minRatio ?? 0.35, maxMul = opt.maxMul ?? 3, dil = Math.max(1, Math.round((opt.dilatePx ?? 7) / g)), tol = opt.simplifyPx ?? 3;

  /* 1) 사업지마다 블록별 덮는 칸 수 */
  const per = zones.map((z) => {
    if (!z.rings.length) return null;
    const pm = new Uint8Array(n); fillRings(grid, z.rings, pm, 1);
    const cnt = new Map(); let polyCells = 0;
    for (let c = 0; c < n; c++) if (pm[c]) { polyCells++; const l = comp.labels[c]; if (l) cnt.set(l, (cnt.get(l) || 0) + 1); }
    const want = new Set();
    /* 아주 큰 다각형(아파트 단지 하나가 아니라 동네 전체를 둘러친 것)은 기준점(번호 원·시설) 반경 안 블록만 — 담당자 수정본의 '단지 단위' 해석 */
    const big = polyCells * g * g > (opt.bigPolyPx ?? 60000);
    const anchors = [...(z.markers || []), ...(z.pois || [])];
    const near = (l) => { if (!big || !anchors.length) return true; let sx = 0, sy = 0, k = 0; for (let c = 0; c < n; c++) if (comp.labels[c] === l) { sx += (c % grid.GW) * g; sy += ((c / grid.GW) | 0) * g; k++; } const cx = sx / k, cy = sy / k; return anchors.some(a => Math.hypot(a[0] - cx, a[1] - cy) <= (opt.bigRadiusPx ?? 180)); };
    for (const [l, k] of cnt) { if (k / comp.area[l] >= minRatio && comp.area[l] <= maxMul * Math.max(polyCells, 1) && near(l)) want.add(l); }
    for (const p of [...(z.markers || []), ...(z.pois || [])]) {
      const i = Math.floor(p[0] / g), j = Math.floor(p[1] / g); if (i < 0 || j < 0 || i >= grid.GW || j >= grid.GH) continue;
      const l = comp.labels[j * grid.GW + i]; if (l && comp.area[l] <= maxMul * Math.max(polyCells, 1) && (cnt.get(l) || 0) / comp.area[l] >= (opt.minRatioPoi ?? 0.15)) want.add(l);
    }
    if (opt.debug) console.log('    후보 ' + [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, k]) => k + '/' + comp.area[l]).join(' ') + ' (poly ' + polyCells + ')');
    const anchored = new Set(); for (const p of anchors) { const i = Math.floor(p[0] / g), j = Math.floor(p[1] / g); if (i >= 0 && j >= 0 && i < grid.GW && j < grid.GH) { const l = comp.labels[j * grid.GW + i]; if (l && want.has(l)) anchored.add(l); } }
    return { cnt, polyCells, want, anchored };
  });
  /* 2) 블록은 비율이 가장 높은 사업지 하나에만 */
  const owner = new Map();
  per.forEach((p, zi) => { if (!p) return; for (const l of p.want) { const r = p.cnt.get(l) / comp.area[l]; const o = owner.get(l); const an = p.anchored.has(l), oan = o && per[o.zi].anchored.has(l); const better = !o || (an && !oan) || (an === oan && (r >= 0.5 && o.r >= 0.5 ? p.polyCells < per[o.zi].polyCells : r > o.r)); if (better) owner.set(l, { zi, r }); } });

  return zones.map((z, zi) => {
    const p = per[zi];
    if (!p) return { rings: [], fitted: false, note: '다각형 없음' };
    if (z.kind === 'intersection') {
      const c0 = z.markers && z.markers[0] ? z.markers[0] : centroidOf(z.rings);
      const R = Math.round((opt.crossR ?? 60) / g), ci = Math.round(c0[0] / g), cj = Math.round(c0[1] / g);
      const circ = new Uint8Array(n); for (let j = Math.max(0, cj - R); j <= Math.min(grid.GH - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(grid.GW - 1, ci + R); i++) if ((i - ci) ** 2 + (j - cj) ** 2 <= R * R) circ[j * grid.GW + i] = 1;
      const rc = new Uint8Array(n); for (let c = 0; c < n; c++) rc[c] = circ[c] && roadMask[c] ? 1 : 0;
      let m = dilate(grid, rc, Math.round((opt.crossArm ?? 20) / g));
      const circ2 = dilate(grid, circ, Math.round(10 / g)); for (let c = 0; c < n; c++) if (!circ2[c]) m[c] = 0;
      if (!m.some(v => v)) return { rings: z.rings, fitted: false, note: '교차로 주변에 도로 없음' };
      return { rings: maskToRings(grid, fillHoles(grid, m), simplifyFn, tol, 0.3), fitted: true, note: '교차로형 — 도로 십자' };
    }
    const picked = [...p.want].filter(l => owner.get(l).zi === zi);
    let sum = 0; for (const l of picked) sum += comp.area[l];
    if (!picked.length || sum < (opt.minCover ?? 0.3) * p.polyCells) return { rings: z.rings, fitted: false, note: `블록 못 찾음 (덮음 ${p.polyCells ? Math.round(sum / p.polyCells * 100) : 0}%)` };
    const ps = new Set(picked);
    let m = new Uint8Array(n); for (let c = 0; c < n; c++) if (ps.has(comp.labels[c])) m[c] = 1;
    const sr = Math.round((opt.smoothPx ?? 24) / g);                 // 닫힘: 골목·틈을 메워 큰 가구 모양으로
    if (sr > 0) m = erode(grid, dilate(grid, m, sr), sr);
    m = fillHoles(grid, dilate(grid, m, dil));
    return { rings: maskToRings(grid, m, simplifyFn, tol, opt.minPartRatio), fitted: true, note: `블록 ${picked.length}개 · 원 다각형 대비 ${Math.round(sum / p.polyCells * 100)}%` };
  });
}

/** 구역 링에서 막힌 사각형(상자·제목·키맵·범례) 안쪽을 떼어 냅니다. 다 가려지면 원래 링을 돌려줍니다. */
export function clipRingsOutside(W, H, rings, blockRects, simplifyFn, opt = {}) {
  if (!rings.length || !blockRects.length) return rings;
  const g = opt.g || 2, grid = makeGrid(W, H, g); const n = grid.GW * grid.GH;
  const m = new Uint8Array(n); fillRings(grid, rings, m, 1);
  let any = false;
  for (const r of blockRects) {
    const i0 = Math.max(0, Math.floor(r.x / g)), i1 = Math.min(grid.GW - 1, Math.ceil((r.x + r.w) / g)), j0 = Math.max(0, Math.floor(r.y / g)), j1 = Math.min(grid.GH - 1, Math.ceil((r.y + r.h) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * grid.GW + i; if (m[c]) { m[c] = 0; any = true; } }
  }
  if (!any) return rings;
  const out = maskToRings(grid, m, simplifyFn, opt.simplifyPx ?? 2, 0.08);
  return out.length ? out : rings;
}

/* ── ② 열 배치 · 번호 · 번호 원 자리 ─────────────────────────────── */
/**
 * @param zones  [{ rings, h(상자 높이) }]
 * @param opt    { W, H, boxW:440, margin:60, top:150, gap:11, bottom:30, keymapH:110, legendH }
 * @returns { boxes:[{x,y,w,h,col,num}], keymap:{x,y,w,h}, legend:{x,y,w}, overflow }
 */
export function layoutColumns(zones, opt) {
  const { W, H } = opt; const boxW = opt.boxW || 440, mg = opt.margin || 60, top = opt.top || 150, bottom = opt.bottom || 30;
  const cents = zones.map(z => centroidOf(z.rings));
  let col = cents.map(c => c[0] < W / 2 ? 'L' : 'R');
  /* 균형: 차이가 2 이상이면 가운데에 가까운 것부터 옮김 */
  const count = () => ({ L: col.filter(c => c === 'L').length, R: col.filter(c => c === 'R').length });
  for (let guard = 0; guard < zones.length; guard++) {
    const { L, R } = count(); if (Math.abs(L - R) <= 1) break;
    const from = L > R ? 'L' : 'R';
    const cand = col.map((c, i) => c === from ? i : -1).filter(i => i >= 0).sort((a, b) => Math.abs(cents[a][0] - W / 2) - Math.abs(cents[b][0] - W / 2))[0];
    col[cand] = from === 'L' ? 'R' : 'L';
  }
  const tops = zones.map(z => Math.min(...z.rings.flat().map(p => p[1]), Infinity));
  const order = (c) => zones.map((_, i) => i).filter(i => col[i] === c).sort((a, b) => tops[a] - tops[b]);
  const left = order('L'), right = order('R');
  const num = new Array(zones.length); [...left, ...right].forEach((zi, k) => { num[zi] = k + 1; });
  const rightX = W - mg - boxW;
  const legendH = opt.legendH || 130, keymapH = opt.keymapH || 110;
  const legend = { x: rightX, y: H - bottom - legendH, w: boxW, h: legendH };
  const keymap = { x: rightX, y: legend.y - (opt.gap || 11) - keymapH, w: boxW, h: keymapH };
  const stack = (ids, x, gap) => { let y = top; return ids.map(i => { const r = { x, y, w: boxW, h: zones[i].h, col: col[i], num: num[i], zi: i }; y += zones[i].h + gap; return r; }); };
  let gap = opt.gap || 11;
  let L = stack(left, mg, gap), R = stack(right, rightX, gap);
  const bottomOf = (arr) => arr.length ? arr[arr.length - 1].y + arr[arr.length - 1].h : top;
  let overflow = null;
  if (bottomOf(R) > keymap.y - gap || bottomOf(L) > H - bottom) {
    gap = 6; L = stack(left, mg, gap); R = stack(right, rightX, gap);
    if (bottomOf(R) > keymap.y - gap || bottomOf(L) > H - bottom) overflow = { right: bottomOf(R) - (keymap.y - gap), left: bottomOf(L) - (H - bottom) };
  }
  const boxes = new Array(zones.length); [...L, ...R].forEach(r => { boxes[r.zi] = r; });
  return { boxes, keymap, legend, col, num, overflow, cents };
}

/** 번호 원 자리: 상자 쪽 변의 제목 줄 높이에서 수평선이 구역과 만나는 가장 바깥 점.
    못 만나면 구역 무게중심 x 의 수직선이 상자 쪽(위/아래)으로 만나는 점. */
export function placeMarker(rings, box, titleDy = 20) {
  const left = box.col === 'L';
  const ys = rings.flat().map(p => p[1]); const minY = Math.min(...ys), maxY = Math.max(...ys);
  let yStar = Math.max(minY + 22, Math.min(maxY - 22, box.y + titleDy));
  const hitsAt = (y) => { const h = []; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y)) h.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } return h; };
  let hits = [];
  if (yStar >= box.y + 14 && yStar <= box.y + box.h - 14) { for (const dy of [0, -12, 12, -24, 24, -36, 36]) { hits = hitsAt(yStar + dy); if (hits.length) { yStar += dy; break; } } }
  if (hits.length) {
    let x = left ? Math.min(...hits) : Math.max(...hits);
    const lim = left ? box.x + box.w + 28 : box.x - 28;            // 상자 가장자리에서 28px 는 띄움
    if (left ? x < lim : x > lim) x = lim;
    return [x, yStar];
  }
  const [cx] = centroidOf(rings); const yv = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[0] > cx) !== (b[0] > cx)) yv.push(a[1] + (cx - a[0]) * (b[1] - a[1]) / (b[0] - a[0])); }
  if (!yv.length) return centroidOf(rings);
  const boxMid = box.y + box.h / 2; const above = Math.max(...yv) < boxMid;   // 구역이 상자보다 위면 아래 변, 아래면 위 변
  return [cx, above ? Math.max(...yv) : Math.min(...yv)];
}

/* ── ⑤ 라벨 자리 (겹침 회피) ───────────────────────────────────────── */
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inFrame = (r, W, H) => r.x >= 4 && r.y >= 4 && r.x + r.w <= W - 4 && r.y + r.h <= H - 4;
/** 시설 이름: 아래 가운데 → 위 → 오른쪽 → 왼쪽 순으로 비는 자리. */
export function placePoiLabels(pois, obstacles, textW, W, H, opt = {}) {
  const placed = []; const out = []; const fs = opt.fs || 13, gp = opt.gap || 10;
  for (const p of pois) {
    const w = textW(p.name, fs) + 4, h = fs + 3; const [x, y] = p.px;
    const cands = [
      { x: x - w / 2, y: y + gp, anchor: 'middle', tx: x, ty: y + gp + fs - 1 },
      { x: x - w / 2, y: y - gp - h, anchor: 'middle', tx: x, ty: y - gp - 3 },
      { x: x + gp + 1, y: y - h / 2, anchor: 'start', tx: x + gp + 2, ty: y + 4.5 },
      { x: x - gp - 1 - w, y: y - h / 2, anchor: 'end', tx: x - gp - 2, ty: y + 4.5 },
    ];
    const ovArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const cost = (c) => { const r = { x: c.x, y: c.y, w, h }; if (!inFrame(r, W, H)) return 1e9; return [...obstacles, ...placed].reduce((a, o) => a + ovArea(r, o), 0); };
    let pick = cands.map(c => ({ c, k: cost(c) })).sort((a, b) => a.k - b.k)[0].c;
    const rect = { x: pick.x, y: pick.y, w, h }; placed.push(rect);
    out.push({ ...p, label: { x: pick.tx, y: pick.ty, anchor: pick.anchor, rect } });
  }
  return out;
}
/** 지명: 구역 다각형·상자·시설 라벨·번호 원과 겹치지 않는 가장 가까운 자리. 못 찾으면 null. */
export function placeNameLabels(labels, zoneRings, hardRects, softRects, textW, W, H, opt = {}) {
  const fs = opt.fs || 20, ls = opt.letterSpacing ?? 6; const out = []; const placed = [];
  const hitsZone = (r) => zoneRings.some(ring => {
    const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]];
    return corners.some(c => pointIn(c, ring)) || ring.some(p => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h);
  });
  for (const l of labels) {
    const w = textW(l.text, fs) + ls * Math.max(0, l.text.length - 1), h = fs + 4;
    const [x0, y0] = l.px;
    const steps = [[0, 0]]; for (let d = 24; d <= (opt.maxShift || 200); d += 24) for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; steps.push([Math.round(Math.cos(t) * d), Math.round(Math.sin(t) * d)]); }
    let found = null;
    for (const [dx, dy] of steps) {
      const r = { x: x0 + dx - w / 2, y: y0 + dy - h + 4, w, h };
      if (!inFrame(r, W, H)) continue;
      if (hardRects.some(o => overlap(r, o))) continue;
      if (hitsZone(r)) continue;
      if (softRects.some(o => overlap(r, o)) || placed.some(o => overlap(r, o))) continue;
      found = { x: x0 + dx, y: y0 + dy, rect: r }; break;
    }
    if (found) { placed.push(found.rect); out.push({ ...l, at: [found.x, found.y], rect: found.rect, moved: Math.hypot(found.x - x0, found.y - y0) }); }
    else out.push({ ...l, at: null });
  }
  return out;
}
