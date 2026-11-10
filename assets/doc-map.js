/* ════════════════════════════════════════════════════════════════════
   문서에 넣을 지도 그림 — 캔버스에 직접 그립니다

   ── 왜 지도 라이브러리를 쓰지 않는가 ───────────────────────────────
   네이버 지도는 화면에 뜬 것을 **이미지로 저장할 수 없습니다.**
   타일이 다른 서버(pstatic.net)에서 오는데 그 서버가 "다른 사이트에서
   가져다 써도 된다"는 표시(CORS)를 붙여 주지 않기 때문입니다. 그러면
   캔버스가 "오염"되어 저장이 막힙니다. 스트리트뷰 캡처가 막힌 것과
   같은 이유입니다 (CLAUDE.md 7절 참고).

   html2canvas 같은 도구를 써도 마찬가지입니다. 그 도구도 결국 같은
   캔버스에 그려 넣기 때문에 막히는 지점이 같습니다.

   ── 그래서 브이월드입니다 ──────────────────────────────────────────
   국토교통부 공공 서비스입니다. 타일에 `Access-Control-Allow-Origin: *`
   가 붙어 있어 **가져다 캔버스에 그리고 저장할 수 있습니다.**
   인증키도 필요 없습니다 (2026-09-07 확인).

     https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png

   폐쇄망으로 갈 때도 이쪽이 낫습니다. 필요한 구간의 타일만 미리 받아
   두면 되고, 공공 자료라 반출 문제가 없습니다.

   ── 배경 없이도 됩니다 ─────────────────────────────────────────────
   `base: false` 로 두면 타일을 받지 않고 **조사지 경계선과 점만** 그립니다.
   배경이 없어도 문서용으로는 읽히고, 망이 끊겨도 그려집니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriDocMap = (function () {
  const TILE = 256;
  const TILE_URL = 'https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png';

  /* 타일 한 장을 못 받아도 지도 전체가 멈추면 안 됩니다.
     못 받은 자리는 비워 두고 나머지를 그립니다. */
  const TILE_TIMEOUT = 6000;

  /* ── 좌표 변환 (웹 메르카토르) ──────────────────────────────────── */

  function lngToX(lng, z) { return (lng + 180) / 360 * Math.pow(2, z); }
  function latToY(lat, z) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function xToLng(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function yToLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /** 밝은 색인가 — 노랑 점에 테두리를 두를지 (index.html isLightColor 와 같은 기준) */
  function isLight(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return false;
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.68;
  }

  /** 경위도 여러 개를 감싸는 범위 */
  function bounds(coords) {
    let n = -90, s = 90, e = -180, w = 180;
    coords.forEach(function (c) {
      if (c[0] > n) n = c[0];
      if (c[0] < s) s = c[0];
      if (c[1] > e) e = c[1];
      if (c[1] < w) w = c[1];
    });
    return { n: n, s: s, e: e, w: w };
  }

  /**
   * 범위가 캔버스에 들어가는 확대 단계를 고릅니다.
   * pad 는 가장자리 여백 비율 (0.1 = 10%)
   */
  function fitZoom(b, w, h, pad) {
    const p = 1 + (pad == null ? 0.12 : pad) * 2;
    for (let z = 18; z >= 6; z--) {
      const dx = (lngToX(b.e, z) - lngToX(b.w, z)) * TILE * p;
      const dy = (latToY(b.s, z) - latToY(b.n, z)) * TILE * p;
      if (dx <= w && dy <= h) return z;
    }
    return 6;
  }

  /* ── 타일 ───────────────────────────────────────────────────────── */

  function loadTile(z, x, y) {
    return new Promise(function (resolve) {
      const img = new Image();
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      img.crossOrigin = 'anonymous';   // ★ 이게 없으면 캔버스가 오염되어 저장이 막힙니다
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      setTimeout(() => finish(null), TILE_TIMEOUT);
      img.src = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });
  }

  /* ── 그리기 ─────────────────────────────────────────────────────── */

  /**
   * opts
   *   boundary  GeoJSON Polygon — 조사지 경계 (없어도 됨)
   *   points    [{lat, lng, color, weight}] — 사고 지점
   *   marker    {lat, lng} — 진단 지점 하나 (십자 표시)
   *   base      배경 타일을 받을지 (기본 true)
   *   pad       가장자리 여백 비율
   *   focus     {lat, lng, radiusM} — 경계 대신 이 반경에 맞춤
   *   bbox      {n, s, e, w} — 이 범위에 맞춤 (지자체 전체 지도, 2026-11-04 정호경 요청)
   *   outline   [[위도, 경도, 위도, 경도, …], …] — 지자체 경계 고리(region-bounds.json rings). 회색 실선
   *   pointScale 점 크기 배율 (기본 1 — 지자체 전체처럼 넓은 지도는 작게)
   *
   * 돌려주는 값: { dataUrl, zoom, attribution, baseOk }
   */
  async function draw(canvas, opts) {
    const o = opts || {};
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');

    /* 흰 바탕 — 투명하게 두면 인쇄에서 검게 나오는 경우가 있습니다 */
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    /* ① 어디를 그릴지 정합니다 */
    const ring = o.boundary && o.boundary.coordinates ? o.boundary.coordinates[0] : null;
    let b;
    if (o.bbox) {
      b = { n: o.bbox.n, s: o.bbox.s, e: o.bbox.e, w: o.bbox.w };
    } else if (o.focus) {
      /* 반경(m) → 위경도. 위도 1도 ≈ 111,320m */
      const dLat = o.focus.radiusM / 111320;
      const dLng = o.focus.radiusM / (111320 * Math.cos(o.focus.lat * Math.PI / 180));
      b = { n: o.focus.lat + dLat, s: o.focus.lat - dLat,
            e: o.focus.lng + dLng, w: o.focus.lng - dLng };
    } else if (ring) {
      b = bounds(ring.map((c) => [c[1], c[0]]));   // GeoJSON 은 [경도, 위도]
    } else if (o.marker) {
      const d = 0.004;
      b = { n: o.marker.lat + d, s: o.marker.lat - d,
            e: o.marker.lng + d, w: o.marker.lng - d };
    } else {
      return null;
    }

    const z = o.zoom || fitZoom(b, W, H, o.pad);
    const cx = (lngToX(b.w, z) + lngToX(b.e, z)) / 2;
    const cy = (latToY(b.n, z) + latToY(b.s, z)) / 2;

    /* 화면 좌표로 옮기는 함수 — 캔버스 한가운데가 범위의 한가운데 */
    const px = (lng) => (lngToX(lng, z) - cx) * TILE + W / 2;
    const py = (lat) => (latToY(lat, z) - cy) * TILE + H / 2;

    /* ② 배경 타일 */
    let baseOk = false;
    if (o.base !== false) {
      const x0 = Math.floor(cx - W / 2 / TILE), x1 = Math.floor(cx + W / 2 / TILE);
      const y0 = Math.floor(cy - H / 2 / TILE), y1 = Math.floor(cy + H / 2 / TILE);
      const jobs = [];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) jobs.push({ x: x, y: y });
      }
      const tiles = await Promise.all(jobs.map((j) => loadTile(z, j.x, j.y)));
      tiles.forEach(function (img, i) {
        if (!img) return;
        baseOk = true;
        ctx.drawImage(img, (jobs[i].x - cx) * TILE + W / 2, (jobs[i].y - cy) * TILE + H / 2);
      });
      /* 배경 위에 그리면 선이 묻혀 흰 막을 아주 옅게 덮습니다 (baseFade — 넓은 지도는 더 옅게) */
      if (baseOk) {
        ctx.fillStyle = `rgba(255,255,255,${o.baseFade == null ? 0.32 : o.baseFade})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    /* ②-0 지자체 밖을 하얗게 흐리게 — 시선을 경계 안으로 (outsideFade, 지자체 전체 지도 2026-11-10) */
    if (o.outline && o.outline.length && o.outsideFade) {
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      o.outline.forEach(function (g) { for (let i = 0; i + 1 < g.length; i += 2) { const X = px(g[i + 1]), Y = py(g[i]); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.closePath(); });
      ctx.fillStyle = `rgba(255,255,255,${o.outsideFade})`;
      ctx.fill('evenodd');
    }

    /* ②-1 밀도 히트맵 (강원대 커널밀도 PNG, data/heatmap) — 한 분야만. 2026-10-20 담당자: 격자 점보다 히트맵이 잘 보임.
       PNG 네 모서리(sw·ne 위경도)를 화면 좌표로 옮겨 그대로 덮습니다. 원본은 EPSG:5186 격자라 메르카토르와 미세하게 틀어지지만 지자체 크기에서는 몇 m 안입니다. */
    let heatOk = false;
    if (o.heat && o.heat.url && o.heat.bounds) {
      const img = await new Promise(function (res) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = o.heat.url; });
      if (img) {
        const hb = o.heat.bounds;
        const X0 = px(hb.sw[1]), X1 = px(hb.ne[1]), Y0 = py(hb.ne[0]), Y1 = py(hb.sw[0]);
        ctx.globalAlpha = o.heat.opacity == null ? 1 : o.heat.opacity;
        /* heatSpread(px): 지자체 전체처럼 넓은 지도에서 시가지에 몰린 밀도가 손톱만 하게 줄어 안 보여, 흐리게 퍼뜨려 두 번 겹침
           (넓게 볼 때 밀도를 넓은 반경으로 잡는 것과 같은 효과 — 2026-11-10 담당자 "전체 지도는 히트맵만") */
        if (o.heatSpread) { ctx.filter = `blur(${o.heatSpread}px)`; ctx.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0); ctx.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0); ctx.filter = 'none'; }
        ctx.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0);
        ctx.globalAlpha = 1;
        heatOk = true;
      }
    }

    /* ③-0 지자체 경계 — 회색 실선 (섬이 많은 옹진·진도는 고리가 여럿) */
    if (o.outline && o.outline.length) {
      ctx.beginPath();
      o.outline.forEach(function (g) {
        for (let i = 0; i + 1 < g.length; i += 2) {
          const X = px(g[i + 1]), Y = py(g[i]);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.closePath();
      });
      ctx.strokeStyle = 'rgba(51,51,51,.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    /* ③ 조사지 경계 — 원본이 격자 칸을 합친 것이라 계단 모양. 칸 반쯤(25m) 단순화한 뒤 모서리를 두 번 깎아 부드럽게 (2026-11-10 담당자) */
    if (ring) {
      const mpp = 156543.03392 * Math.cos(yToLat(cy, z) * Math.PI / 180) / Math.pow(2, z);
      const pts = smoothRing(simplifyRing(ring.map((c) => [px(c[0]), py(c[1])]), Math.max(1.5, 25 / mpp)), 2);
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      /* 안쪽 옅은 빨강 칠은 뺌 — 히트맵 색을 가림 (2026-11-10 담당자). 점선만 */
      ctx.strokeStyle = '#D83D64';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ④ 사고 지점 — 건수가 많을수록 큽니다. 테두리는 없음(2026-11-10 담당자) — 밝은 색(노랑)만 덜 투명하게 */
    const ps = o.pointScale || 1;
    (o.points || []).forEach(function (p) {
      const X = px(p.lng), Y = py(p.lat);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) return;
      const r = Math.min(6, 1.9 + Math.sqrt(p.weight || 1) * 1.1) * ps;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#666666';
      ctx.globalAlpha = isLight(p.color) ? 0.97 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* ⑤ 진단 지점 — 분홍 점 + 흰 테두리 (2026-11-10 담당자: 십자 표시가 어색함). 색은 앱 메인색 */
    if (o.marker) {
      const X = px(o.marker.lng), Y = py(o.marker.lat);
      ctx.beginPath(); ctx.arc(X, Y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#D83D64'; ctx.fill();
    }

    /* 글자 크기는 그림 폭에 비례 — 문서에서는 모든 지도가 같은 폭으로 실려, 760px 그림의 11px 글자가 1000px 그림보다 커 보였음 (2026-11-10) */
    const k = W / 1000;

    /* ⑥ 축척 막대 — 문서에 실리는 지도라 거리 기준이 있어야 합니다 */
    drawScale(ctx, W, H, z, yToLat(cy, z), k);

    /* ⑦ 출처 — 브이월드 이용 조건입니다. 배경 상자 없이 흰 테두리 글자로 (2026-11-10 담당자) */
    const attr = baseOk ? '배경: 국토교통부 브이월드' : '배경 없음 (경계·지점만 표시)';
    ctx.font = (11 * k).toFixed(1) + 'px Pretendard, sans-serif';
    const tw = ctx.measureText(attr).width;
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3 * k;
    ctx.strokeText(attr, W - tw - 8 * k, H - 7 * k);
    ctx.fillStyle = '#666666';
    ctx.fillText(attr, W - tw - 8 * k, H - 7 * k);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      zoom: z, baseOk: baseOk, heatOk: heatOk, attribution: attr,
      /* 사진 위치를 지도에서 찍을 때 쓰라고 되돌리는 함수도 넘깁니다 */
      toLatLng: function (canvasX, canvasY) {
        return {
          lat: yToLat((canvasY - H / 2) / TILE + cy, z),
          lng: xToLng((canvasX - W / 2) / TILE + cx, z),
        };
      },
    };
  }

  function drawScale(ctx, W, H, z, lat, k) {
    k = k || 1;
    /* 이 확대 단계에서 1픽셀이 몇 m 인가 */
    const mPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];   // 10·20km — 지자체 전체 지도
    let m = nice[0];
    for (const v of nice) { if (v / mPerPx <= W * 0.28) m = v; }
    const w = m / mPerPx;
    const x = 12 * k, y = H - 12 * k;

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.moveTo(x, y - 5 * k); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5 * k);
    ctx.stroke();
    ctx.font = (11 * k).toFixed(1) + 'px Pretendard, sans-serif';
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText(m >= 1000 ? (m / 1000) + 'km' : m + 'm', x + w + 5 * k, y);
  }

  /* 점 줄이기(더글러스–포커) — tol 픽셀보다 덜 튀어나온 점은 뺌. 닫힌 고리 [[x,y],…] 는 첫 점에서 가장 먼 점으로 둘로 나눠 각각 줄임 */
  function simplifyLine(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let best = -1, bi = -1;
      const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > best) { best = d; bi = i; } }
      if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function simplifyRing(pts, tol) {
    const p = pts.slice();
    if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
    if (p.length < 5) return p;
    let far = 0, fd = -1;
    p.forEach((q, i) => { const d = Math.hypot(q[0] - p[0][0], q[1] - p[0][1]); if (d > fd) { fd = d; far = i; } });
    const a = simplifyLine(p.slice(0, far + 1), tol), b = simplifyLine(p.slice(far).concat([p[0]]), tol);
    const out = a.concat(b.slice(1, -1));
    return out.length >= 3 ? out : p;
  }
  /* 모서리 깎기(차이킨) — 한 번에 각 변을 1/4·3/4 지점으로 바꿔 둥글게. 닫힌 고리 */
  function smoothRing(pts, times) {
    let p = pts;
    for (let t = 0; t < times; t++) {
      const q = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      p = q;
    }
    return p;
  }

  /**
   * 화면에 붙이지 않고 그림만 얻습니다 (문서에 <img> 로 넣을 때).
   * 돌려주는 값은 draw() 와 같습니다.
   */
  async function toImage(width, height, opts) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return draw(c, opts);
  }

  return { draw, toImage, bounds, fitZoom, lngToX, latToY, xToLng, yToLat };
})();
