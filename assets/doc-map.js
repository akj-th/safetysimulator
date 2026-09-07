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
    if (o.focus) {
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
      /* 배경 위에 그리면 선이 묻혀 흰 막을 아주 옅게 덮습니다 */
      if (baseOk) {
        ctx.fillStyle = 'rgba(255,255,255,.32)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* ③ 조사지 경계 */
    if (ring) {
      ctx.beginPath();
      ring.forEach(function (c, i) {
        const X = px(c[0]), Y = py(c[1]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(216,61,100,.07)';
      ctx.fill();
      ctx.strokeStyle = '#D83D64';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ④ 사고 지점 — 건수가 많을수록 큽니다 */
    (o.points || []).forEach(function (p) {
      const X = px(p.lng), Y = py(p.lat);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) return;
      const r = Math.min(6, 1.9 + Math.sqrt(p.weight || 1) * 1.1);
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#666666';
      ctx.globalAlpha = 0.78;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* ⑤ 진단 지점 — 십자 + 원 (점들과 확실히 구분되게) */
    if (o.marker) {
      const X = px(o.marker.lng), Y = py(o.marker.lat);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X, Y, 9, 0, Math.PI * 2);
      ctx.moveTo(X - 15, Y); ctx.lineTo(X - 11, Y);
      ctx.moveTo(X + 11, Y); ctx.lineTo(X + 15, Y);
      ctx.moveTo(X, Y - 15); ctx.lineTo(X, Y - 11);
      ctx.moveTo(X, Y + 11); ctx.lineTo(X, Y + 15);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(X, Y, 3.4, 0, Math.PI * 2); ctx.fill();
    }

    /* ⑥ 축척 막대 — 문서에 실리는 지도라 거리 기준이 있어야 합니다 */
    drawScale(ctx, W, H, z, yToLat(cy, z));

    /* ⑦ 출처 — 브이월드 이용 조건입니다 */
    const attr = baseOk ? '배경: 국토교통부 브이월드' : '배경 없음 (경계·지점만 표시)';
    ctx.font = '11px Pretendard, sans-serif';
    const tw = ctx.measureText(attr).width;
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fillRect(W - tw - 12, H - 18, tw + 12, 18);
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'left';
    ctx.fillText(attr, W - tw - 6, H - 5);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      zoom: z, baseOk: baseOk, attribution: attr,
      /* 사진 위치를 지도에서 찍을 때 쓰라고 되돌리는 함수도 넘깁니다 */
      toLatLng: function (canvasX, canvasY) {
        return {
          lat: yToLat((canvasY - H / 2) / TILE + cy, z),
          lng: xToLng((canvasX - W / 2) / TILE + cx, z),
        };
      },
    };
  }

  function drawScale(ctx, W, H, z, lat) {
    /* 이 확대 단계에서 1픽셀이 몇 m 인가 */
    const mPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    let m = nice[0];
    for (const v of nice) { if (v / mPerPx <= W * 0.28) m = v; }
    const w = m / mPerPx;
    const x = 12, y = H - 12;

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5);
    ctx.stroke();
    ctx.font = '11px Pretendard, sans-serif';
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText(m >= 1000 ? (m / 1000) + 'km' : m + 'm', x + w + 5, y);
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
