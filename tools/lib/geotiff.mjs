/* ════════════════════════════════════════════════════════════════════
   GeoTIFF 읽기 — 강원대가 QGIS로 만든 위험도 히트맵 전용

   라이브러리를 쓰지 않는 이유는 다른 도구와 같습니다(비전공자 유지보수).
   대신 **이 자료에 실제로 들어 있는 형식만** 지원합니다.

   ── 자료에 들어 있는 두 형식 (직접 확인) ───────────────────────────
     교통사고_최종 (…_TrafficRisk.tif)
        float64 · 압축 없음 · 128×128 타일 · NoData = **음수** -3.4e38
     나머지 6개 분야 (…_kd.tif)
        float32 · **LZW 압축** · 128×128 타일 · NoData = **양수** +3.4e38

   NoData 부호가 서로 다릅니다. 한쪽 기준만 쓰면 다른 쪽이 전부
   "값 있음"으로 들어와 지도가 새까매집니다. 절댓값으로 판정합니다.

   지원: 리틀엔디언 · 타일 방식 · 압축 없음/LZW · float32/64 · 1밴드
   미지원: 스트립 방식, BigTIFF, Deflate, Predictor — 이 자료엔 없습니다
           (만나면 예외를 던지므로 조용히 틀리지 않습니다)
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const TAG = {
  256: 'width', 257: 'height', 258: 'bits', 259: 'compression', 277: 'samples',
  273: 'stripOffsets', 279: 'stripByteCounts',
  322: 'tileWidth', 323: 'tileHeight', 324: 'tileOffsets', 325: 'tileByteCounts',
  317: 'predictor', 339: 'sampleFormat',
  33550: 'pixelScale', 33922: 'tiepoint', 42113: 'noData',
};

/** IFD(머리표)를 읽어 우리가 쓰는 태그만 뽑습니다 */
export function readHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    if (head.toString('latin1', 0, 2) !== 'II') throw new Error('리틀엔디언 TIFF가 아닙니다');
    if (head.readUInt16LE(2) !== 42) throw new Error('BigTIFF는 지원하지 않습니다');

    const ifdOff = head.readUInt32LE(4);
    const cnt = Buffer.alloc(2);
    fs.readSync(fd, cnt, 0, 2, ifdOff);
    const n = cnt.readUInt16LE(0);

    const ents = Buffer.alloc(n * 12);
    fs.readSync(fd, ents, 0, n * 12, ifdOff + 2);

    const t = {};
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const tag = ents.readUInt16LE(o);
      const name = TAG[tag];
      if (!name) continue;
      const type = ents.readUInt16LE(o + 2);
      const count = ents.readUInt32LE(o + 4);
      const bytes = (TYPE_SIZE[type] || 1) * count;

      let buf;
      if (bytes <= 4) buf = ents.subarray(o + 8, o + 8 + bytes);
      else {
        buf = Buffer.alloc(bytes);
        fs.readSync(fd, buf, 0, bytes, ents.readUInt32LE(o + 8));
      }

      if (type === 2) t[name] = buf.toString('latin1').replace(/\0+$/, '');
      else if (type === 12) { t[name] = []; for (let k = 0; k < count; k++) t[name].push(buf.readDoubleLE(k * 8)); }
      else if (type === 3) { t[name] = []; for (let k = 0; k < count; k++) t[name].push(buf.readUInt16LE(k * 2)); }
      else if (type === 4) { t[name] = []; for (let k = 0; k < count; k++) t[name].push(buf.readUInt32LE(k * 4)); }
      if (Array.isArray(t[name]) && t[name].length === 1) t[name] = t[name][0];
    }
    return t;
  } finally { fs.closeSync(fd); }
}

/* ── TIFF 방식 LZW 풀기 ────────────────────────────────────────────
   GIF 의 LZW 와 두 가지가 다릅니다.
     · 비트를 **위쪽부터(MSB first)** 채웁니다
     · 코드 길이를 한 칸 **일찍** 늘립니다 (511·1023·2047에서)
   이 두 가지를 놓치면 그림이 조금씩 어긋난 채로 나옵니다.        */
function lzwDecode(input, expectedBytes) {
  const CLEAR = 256, EOI = 257;
  const out = Buffer.alloc(expectedBytes);
  let outPos = 0;

  /* 사전 — 각 항목은 [앞 코드, 마지막 바이트, 길이] 로 두고 거슬러 올라가며 씁니다.
     문자열을 통째로 들고 있으면 큰 타일에서 메모리가 크게 늘어납니다. */
  const prev = new Int32Array(4096);
  const last = new Uint8Array(4096);
  const len = new Int32Array(4096);
  const reset = () => {
    for (let i = 0; i < 256; i++) { prev[i] = -1; last[i] = i; len[i] = 1; }
    return 258;
  };

  let next = reset();
  let width = 9;
  let bitPos = 0;
  const totalBits = input.length * 8;

  const read = () => {
    if (bitPos + width > totalBits) return EOI;
    let v = 0;
    for (let i = 0; i < width; i++) {
      const b = bitPos + i;
      v = (v << 1) | ((input[b >> 3] >> (7 - (b & 7))) & 1);
    }
    bitPos += width;
    return v;
  };

  /* 코드 하나를 풀어 씁니다 (뒤에서부터 채우고 마지막에 뒤집습니다) */
  const scratch = Buffer.alloc(4096);
  const emit = (code) => {
    let n = 0, c = code;
    while (c >= 0 && n < 4096) { scratch[n++] = last[c]; c = prev[c]; }
    for (let i = n - 1; i >= 0; i--) { if (outPos < out.length) out[outPos++] = scratch[i]; }
    return scratch[n - 1];      // 첫 글자
  };

  let old = -1;
  for (;;) {
    const code = read();
    if (code === EOI) break;
    if (code === CLEAR) { next = reset(); width = 9; old = -1; continue; }

    let first;
    if (code < next && (code < 256 || len[code] > 0)) {
      first = emit(code);
      if (old >= 0 && next < 4096) {
        prev[next] = old; last[next] = first; len[next] = len[old] + 1; next++;
      }
    } else {
      /* 사전에 아직 없는 코드 — 직전 문자열 + 그 첫 글자 */
      if (old < 0) break;
      let c = old, n = 0;
      while (c >= 0 && n < 4096) { scratch[n++] = last[c]; c = prev[c]; }
      first = scratch[n - 1];
      for (let i = n - 1; i >= 0; i--) if (outPos < out.length) out[outPos++] = scratch[i];
      if (outPos < out.length) out[outPos++] = first;
      if (next < 4096) { prev[next] = old; last[next] = first; len[next] = len[old] + 1; next++; }
    }
    old = code;

    /* ★ 한 칸 일찍 늘립니다 (TIFF 규격) */
    if (next + 1 >= 512 && width === 9) width = 10;
    else if (next + 1 >= 1024 && width === 10) width = 11;
    else if (next + 1 >= 2048 && width === 11) width = 12;

    if (outPos >= out.length) break;
  }
  return out;
}

/**
 * 타일을 하나씩 읽어 콜백에 넘깁니다.
 * 전체를 메모리에 올리지 않습니다 — 안동 교통사고는 원본이 239MB 입니다.
 *
 * cb(tileX, tileY, values: Float64Array|Float32Array)
 */
export function eachTile(filePath, t, cb) {
  const tw = t.tileWidth, th = t.tileHeight;
  if (!tw || !th) throw new Error('타일 방식 TIFF가 아닙니다 (스트립 미지원)');
  if (t.predictor && t.predictor !== 1) throw new Error(`Predictor ${t.predictor} 는 지원하지 않습니다`);
  if (t.compression !== 1 && t.compression !== 5) {
    throw new Error(`압축 방식 ${t.compression} 는 지원하지 않습니다 (없음/LZW 만)`);
  }
  const bytesPer = t.bits / 8;
  if (bytesPer !== 4 && bytesPer !== 8) throw new Error(`${t.bits}비트 표본은 지원하지 않습니다`);

  const offsets = Array.isArray(t.tileOffsets) ? t.tileOffsets : [t.tileOffsets];
  const counts = Array.isArray(t.tileByteCounts) ? t.tileByteCounts : [t.tileByteCounts];
  const across = Math.ceil(t.width / tw);
  const down = Math.ceil(t.height / th);
  const raw = tw * th * bytesPer;

  const fd = fs.openSync(filePath, 'r');
  try {
    const packed = Buffer.alloc(Math.max(...counts));
    for (let ty = 0; ty < down; ty++) {
      for (let tx = 0; tx < across; tx++) {
        const i = ty * across + tx;
        const n = counts[i];
        fs.readSync(fd, packed, 0, n, offsets[i]);
        const bytes = t.compression === 5
          ? lzwDecode(packed.subarray(0, n), raw)
          : packed.subarray(0, n);
        const values = bytesPer === 8
          ? new Float64Array(bytes.buffer, bytes.byteOffset, tw * th)
          : new Float32Array(bytes.buffer, bytes.byteOffset, tw * th);
        cb(tx, ty, values);
      }
    }
  } finally { fs.closeSync(fd); }
}

/** NoData 인가 — 부호가 파일마다 달라 절댓값으로 봅니다 */
export const isNoData = (v) => !Number.isFinite(v) || Math.abs(v) > 1e30;

/** 래스터 좌상단의 EPSG:5186 좌표와 픽셀 크기 */
export function geoRef(t) {
  const tie = t.tiepoint || [];
  const sc = t.pixelScale || [];
  return { originX: tie[3], originY: tie[4], scaleX: sc[0] || 10, scaleY: sc[1] || 10 };
}
