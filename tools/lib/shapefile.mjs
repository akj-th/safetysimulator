/* ════════════════════════════════════════════════════════════════════
   조사지 SHP(경계 도형) + DBF(속성표) 읽기

   조사지 파일은 지자체당 폴리곤 **하나**뿐이고 경계선 점이 평균 600개라
   아주 가볍습니다. 라이브러리 없이 직접 읽습니다.

   ※ 점(point) SHP 를 읽는 코드는 convert-gis.js 에 따로 있습니다.
     이 파일은 폴리곤 전용입니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';

/** .dbf 속성표를 통째로 읽습니다 (조사지는 행이 1~2개뿐) */
export function readDbf(dbfPath) {
  const b = fs.readFileSync(dbfPath);
  const recordCount = b.readUInt32LE(4);
  const headerSize = b.readUInt16LE(8);
  const recordSize = b.readUInt16LE(10);

  const fields = [];
  for (let o = 32; o < headerSize && b[o] !== 0x0d; o += 32) {
    fields.push({
      name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''),
      type: String.fromCharCode(b[o + 11]),
      len: b[o + 16],
    });
  }

  const rows = [];
  for (let r = 0; r < recordCount; r++) {
    let o = headerSize + r * recordSize;
    if (b[o] === 0x2a) continue;            // 0x2A = 삭제 표시된 행
    o++;
    const rec = {};
    for (const f of fields) { rec[f.name] = b.toString('utf8', o, o + f.len).trim(); o += f.len; }
    rows.push(rec);
  }
  return rows;
}

/**
 * .shp 에서 폴리곤 링(경계선)을 읽습니다.
 * 돌려주는 값: [{ rings: [[[x,y], …], …], bbox: [minX,minY,maxX,maxY] }, …]
 * 좌표는 원본 좌표계(EPSG:5186) 그대로입니다.
 */
export function readPolygons(shpPath) {
  const b = fs.readFileSync(shpPath);
  const shapes = [];
  let off = 100;                             // 파일 머리말 100바이트

  while (off + 8 <= b.length) {
    const contentWords = b.readInt32BE(off + 4);
    const c = off + 8;
    const type = b.readInt32LE(c);

    /* 5=Polygon, 15=PolygonZ, 25=PolygonM — 셋 다 앞부분 구조가 같습니다 */
    if (type === 5 || type === 15 || type === 25) {
      const bbox = [b.readDoubleLE(c + 4), b.readDoubleLE(c + 12),
                    b.readDoubleLE(c + 20), b.readDoubleLE(c + 28)];
      const partCount = b.readInt32LE(c + 36);
      const pointCount = b.readInt32LE(c + 40);

      const starts = [];
      for (let i = 0; i < partCount; i++) starts.push(b.readInt32LE(c + 44 + i * 4));

      const ptsOff = c + 44 + partCount * 4;
      const pts = [];
      for (let i = 0; i < pointCount; i++) {
        pts.push([b.readDoubleLE(ptsOff + i * 16), b.readDoubleLE(ptsOff + i * 16 + 8)]);
      }

      const rings = [];
      for (let i = 0; i < partCount; i++) {
        rings.push(pts.slice(starts[i], i + 1 < partCount ? starts[i + 1] : pointCount));
      }
      shapes.push({ rings, bbox });
    }
    off = c + contentWords * 2;
  }
  return shapes;
}

/**
 * 점이 폴리곤 안에 있는가 — ray casting(반직선 교차) 판정.
 *
 * 링이 여러 개일 때는 교차 횟수를 모두 더해 **홀수면 안쪽**으로 봅니다.
 * 이렇게 하면 구멍(도넛)도, 떨어져 있는 두 덩어리도 함께 처리됩니다.
 */
export function pointInShape(x, y, shape) {
  let crossings = 0;
  for (const ring of shape.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) crossings++;
    }
  }
  return crossings % 2 === 1;
}

/** bbox 로 먼저 걸러 내면 대부분의 점은 링 계산을 건너뜁니다 */
export function inBBox(x, y, bbox) {
  return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
}
