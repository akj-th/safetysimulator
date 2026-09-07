/* ════════════════════════════════════════════════════════════════════
   PNG 쓰기 (RGBA 8비트)

   PNG 는 [머리표] + [zlib 로 압축한 픽셀] + [끝 표시] 로 된 단순한 형식이라
   Node 에 들어 있는 zlib 만으로 만들 수 있습니다. 라이브러리가 필요 없습니다.

   히트맵은 대부분이 투명(값 없음)이라 압축이 아주 잘 듣습니다.
   ════════════════════════════════════════════════════════════════════ */

import zlib from 'node:zlib';

/* CRC-32 — PNG 의 각 덩어리(chunk) 끝에 붙습니다 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * RGBA 픽셀 → PNG 버퍼
 * rgba: Uint8Array, 길이 width*height*4
 */
export function encodePng(rgba, width, height) {
  /* 각 줄 앞에 필터 바이트(0 = 필터 없음)를 붙입니다.
     히트맵은 투명 영역이 길게 이어져 필터 없이도 zlib 이 잘 줄입니다. */
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // 비트 깊이
  ihdr[9] = 6;      // 색 유형 6 = RGBA
  ihdr[10] = 0;     // 압축 방식 (zlib 고정)
  ihdr[11] = 0;     // 필터 방식 (고정)
  ihdr[12] = 0;     // 인터레이스 없음

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
