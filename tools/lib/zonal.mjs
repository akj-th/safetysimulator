/* ════════════════════════════════════════════════════════════════════
   래스터(TIF) → 구역(동) 평균 — 동별 HEA 의 E(환경) 계산용 (2026-09-15)

   강원대 밀도·거리 TIF 의 칸 값을 동 경계 안에서 모아 평균을 냅니다.

   ── 칸을 어느 동에 넣는가 ─────────────────────────────────────────
   **칸 중심점**이 동 폴리곤 안에 있으면 그 동의 칸입니다.
   칸 크기가 10m·약 32.7m 라 동(보통 수백 m ~ 수 km)에 비해 충분히 작아
   면적 비례 배분까지는 하지 않습니다. 아주 작은 동은 칸 수가 적으니
   결과에 칸 수(n)를 함께 남깁니다.

   ── 층마다 따로 ───────────────────────────────────────────────────
   TIF 는 층마다 칸 크기와 원점이 다릅니다(10m / 32.68m / 32.55m).
   서로 맞추지(재표본화) 않고 **층마다 따로** 동에 모읍니다. 평균만 필요해서
   맞출 이유가 없고, 맞추면 값이 흐려집니다.

   ── 빈칸 ─────────────────────────────────────────────────────────
   NoData 표기가 파일마다 부호가 달라(+3.4e38 / −3.4e38) 절댓값으로 봅니다
   (geotiff.mjs isNoData). 사각형 전체에 값이 있는 층도 있어, **동 경계
   안에 든 칸만** 셉니다 — 시 경계 밖 값이 섞이지 않습니다.

   ⚠️ 좌표계: TIF 에 좌표계 정보가 없습니다(.prj 없음). 좌표 범위로 보아
      EPSG:5186 으로 보고 동 경계도 5186 으로 맞춰 넘겨야 합니다. 강원대 확인 중.
   ════════════════════════════════════════════════════════════════════ */

import { readHeader, eachTile, isNoData, geoRef } from './geotiff.mjs';
import { pointInShape, inBBox } from './shapefile.mjs';

/**
 * @param tifPath  래스터 경로
 * @param zones    [{ id, shapes: [{ rings, bbox }] }]  (래스터와 같은 좌표계)
 * @returns { cellSize, zones: { id: { n, mean } }, all: { n, mean, sd } }
 *          all 은 **어느 구역에든 든 칸 전체**의 평균·표준편차 (지자체 기준값)
 */
export function zonalMeans(tifPath, zones) {
  const t = readHeader(tifPath);
  const g = geoRef(t);
  const tw = t.tileWidth, th = t.tileHeight;

  /* 구역마다 전체 bbox — 칸 하나를 여러 구역에 대 보기 전에 빨리 거릅니다 */
  const Z = zones.map((z) => {
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of z.shapes) {
      bb[0] = Math.min(bb[0], s.bbox[0]); bb[1] = Math.min(bb[1], s.bbox[1]);
      bb[2] = Math.max(bb[2], s.bbox[2]); bb[3] = Math.max(bb[3], s.bbox[3]);
    }
    return { id: z.id, shapes: z.shapes, bbox: bb, n: 0, sum: 0 };
  });
  const U = [Infinity, Infinity, -Infinity, -Infinity];
  for (const z of Z) {
    U[0] = Math.min(U[0], z.bbox[0]); U[1] = Math.min(U[1], z.bbox[1]);
    U[2] = Math.max(U[2], z.bbox[2]); U[3] = Math.max(U[3], z.bbox[3]);
  }

  let n = 0, sum = 0, sumSq = 0;
  let last = null;                                   // 바로 앞 칸이 든 구역 — 이웃 칸은 대개 같은 구역
  eachTile(tifPath, t, (tx, ty, vals) => {
    /* 타일 전체가 구역들 밖이면 건너뜁니다 */
    const x0 = g.originX + tx * tw * g.scaleX, x1 = x0 + tw * g.scaleX;
    const y1 = g.originY - ty * th * g.scaleY, y0 = y1 - th * g.scaleY;
    if (x1 < U[0] || x0 > U[2] || y1 < U[1] || y0 > U[3]) return;

    for (let i = 0; i < vals.length; i++) {
      const col = tx * tw + (i % tw);
      const row = ty * th + Math.floor(i / tw);
      if (col >= t.width || row >= t.height) continue;   // 타일 가장자리 채움 칸
      const v = vals[i];
      if (isNoData(v)) continue;
      const x = g.originX + (col + 0.5) * g.scaleX;
      const y = g.originY - (row + 0.5) * g.scaleY;
      if (x < U[0] || x > U[2] || y < U[1] || y > U[3]) continue;

      let hit = null;
      if (last && inBBox(x, y, last.bbox) && last.shapes.some((s) => inBBox(x, y, s.bbox) && pointInShape(x, y, s))) hit = last;
      else {
        for (const z of Z) {
          if (z === last || !inBBox(x, y, z.bbox)) continue;
          if (z.shapes.some((s) => inBBox(x, y, s.bbox) && pointInShape(x, y, s))) { hit = z; break; }
        }
      }
      if (!hit) continue;
      last = hit;
      hit.n++; hit.sum += v;
      n++; sum += v; sumSq += v * v;
    }
  });

  const mean = n ? sum / n : null;
  const sd = n > 1 ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : null;
  const out = {};
  for (const z of Z) out[z.id] = { n: z.n, mean: z.n ? z.sum / z.n : null };
  return { cellSize: g.scaleX, zones: out, all: { n, mean, sd } };
}
