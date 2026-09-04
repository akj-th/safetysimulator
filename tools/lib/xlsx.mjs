/* ════════════════════════════════════════════════════════════════════
   엑셀(.xlsx) 읽기 — 라이브러리 없이

   xlsx 파일은 사실 XML 몇 개를 묶은 ZIP 입니다.
   Node 에 들어 있는 zlib 로 압축만 풀면 되므로 외부 라이브러리가 필요 없습니다.
   (숫자 서식·수식은 무시하고 **값만** 읽습니다 — 우리에겐 그것으로 충분합니다.)
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import zlib from 'node:zlib';

/** ZIP 압축을 풀어 { 파일이름: Buffer } 로 돌려줍니다 */
function unzip(zipPath) {
  const b = fs.readFileSync(zipPath);

  /* 파일 끝의 목차(EOCD) 를 뒤에서부터 찾습니다 */
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`ZIP 목차를 찾지 못했습니다: ${zipPath}`);

  const count = b.readUInt16LE(eocd + 10);
  let o = b.readUInt32LE(eocd + 16);
  const out = {};

  for (let i = 0; i < count; i++) {
    const nameLen = b.readUInt16LE(o + 28);
    const extraLen = b.readUInt16LE(o + 30);
    const commentLen = b.readUInt16LE(o + 32);
    const compressedSize = b.readUInt32LE(o + 20);
    const localOff = b.readUInt32LE(o + 42);
    const name = b.toString('utf8', o + 46, o + 46 + nameLen);

    const method = b.readUInt16LE(localOff + 8);
    const lNameLen = b.readUInt16LE(localOff + 26);
    const lExtraLen = b.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(start, start + compressedSize);

    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    o += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

/**
 * .xlsx → [{ name: 시트이름, rows: [[셀, 셀, …], …] }, …]
 * 빈 칸은 undefined 로 남습니다.
 */
export function readXlsx(xlsxPath) {
  const z = unzip(xlsxPath);

  /* 문자열은 sharedStrings.xml 에 한 번만 저장되고 시트는 번호로 참조합니다 */
  const shared = [];
  if (z['xl/sharedStrings.xml']) {
    const x = z['xl/sharedStrings.xml'].toString('utf8');
    for (const si of x.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let s = '';
      for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
      shared.push(unescapeXml(s));
    }
  }

  const workbook = z['xl/workbook.xml'].toString('utf8');
  const names = [...workbook.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => unescapeXml(m[1]));

  const sheetFiles = Object.keys(z)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return sheetFiles.map((key, si) => {
    const x = z[key].toString('utf8');
    const rows = [];
    for (const rm of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
        /* "AB" 같은 열 이름을 0부터 시작하는 번호로 바꿉니다 */
        const idx = cm[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const type = /t="([^"]*)"/.exec(cm[2]);
        const value = /<v>([\s\S]*?)<\/v>/.exec(cm[3]);
        let v = value ? value[1] : '';
        if (type && type[1] === 's') v = shared[+v];
        else if (type && type[1] === 'inlineStr') {
          const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[3]);
          v = im ? unescapeXml(im[1]) : '';
        }
        cells[idx] = v;
      }
      rows.push(cells);
    }
    return { name: names[si] || key, rows };
  });
}
