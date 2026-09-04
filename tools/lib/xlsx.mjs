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

/* ── 셀 배경색 읽기 ───────────────────────────────────────────────
   사업 팔레트가 **셀 배경색으로 기존/신규를 구분**해 놓아서 필요합니다.
   값만 읽으면 두 목록이 구분되지 않습니다.

   엑셀에서 색은 세 파일에 나뉘어 있습니다.
     styles.xml  cellXfs[셀의 s번호] → fillId → fills[fillId] → 색
     theme1.xml  fills 가 theme="4" 처럼 번호로 가리키는 실제 색
   ──────────────────────────────────────────────────────────────── */

/** 테마 색 12개를 순서대로 뽑습니다 (theme="N" 의 N 이 이 배열의 자리) */
function readThemeColors(themeXml) {
  if (!themeXml) return [];
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(themeXml);
  if (!scheme) return [];

  const colors = [];
  for (const m of scheme[0].matchAll(/<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g)) {
    colors.push((m[1] || m[2]).toUpperCase());
  }
  /* 파일에는 dk1,lt1,dk2,lt2 순으로 적히지만 theme 번호는 lt1,dk1,lt2,dk2 순입니다 */
  if (colors.length >= 4) {
    [colors[0], colors[1]] = [colors[1], colors[0]];
    [colors[2], colors[3]] = [colors[3], colors[2]];
  }
  return colors;
}

/** 테마 색에 tint(밝기 보정)를 적용합니다 */
function applyTint(hex, tint) {
  if (!tint) return hex;
  const ch = (v) => {
    let x = parseInt(v, 16);
    x = tint < 0 ? x * (1 + tint) : x * (1 - tint) + 255 * tint;
    return Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0').toUpperCase();
  };
  return ch(hex.slice(0, 2)) + ch(hex.slice(2, 4)) + ch(hex.slice(4, 6));
}

/** styles.xml → [셀 s번호 → { fillId, rgb }] */
function readCellFills(stylesXml, themeColors) {
  if (!stylesXml) return [];

  /* fills 목록 — 각 fill 의 실제 색을 구합니다 */
  const fillsBlock = /<fills[\s\S]*?<\/fills>/.exec(stylesXml);
  const fillColors = [];
  if (fillsBlock) {
    for (const f of fillsBlock[0].matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
      const body = f[1];
      if (!/patternType="solid"/.test(body)) { fillColors.push(null); continue; }
      const fg = /<fgColor([^>]*)\/>/.exec(body);
      if (!fg) { fillColors.push(null); continue; }
      const rgb = /rgb="([0-9A-Fa-f]{6,8})"/.exec(fg[1]);
      const theme = /theme="(\d+)"/.exec(fg[1]);
      const tint = /tint="(-?[\d.]+)"/.exec(fg[1]);
      if (rgb) fillColors.push(rgb[1].slice(-6).toUpperCase());
      else if (theme && themeColors[+theme[1]]) {
        fillColors.push(applyTint(themeColors[+theme[1]], tint ? parseFloat(tint[1]) : 0));
      } else fillColors.push(null);
    }
  }

  /* cellXfs — 셀의 s="N" 이 이 배열의 N 번째를 가리킵니다 */
  const xfsBlock = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(stylesXml);
  const out = [];
  if (xfsBlock) {
    for (const xf of xfsBlock[0].matchAll(/<xf\b([^>]*?)\/?>/g)) {
      const id = /fillId="(\d+)"/.exec(xf[1]);
      const fillId = id ? +id[1] : 0;
      out.push({ fillId, rgb: fillColors[fillId] || null });
    }
  }
  return out;
}

/**
 * .xlsx → [{ name: 시트이름, rows: [[셀, 셀, …], …] }, …]
 * 빈 칸은 undefined 로 남습니다.
 *
 * opts.fills 를 켜면 각 시트에 `fills` 가 함께 옵니다 — rows 와 같은 모양의
 * 2차원 배열이고, 칸마다 { fillId, rgb } 또는 null 입니다.
 * (사업 팔레트가 배경색으로 기존/신규를 구분해 놓아서 필요합니다)
 */
export function readXlsx(xlsxPath, opts) {
  const wantFills = !!(opts && opts.fills);
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

  const themeColors = wantFills
    ? readThemeColors(z['xl/theme/theme1.xml'] && z['xl/theme/theme1.xml'].toString('utf8'))
    : [];
  const cellFills = wantFills
    ? readCellFills(z['xl/styles.xml'] && z['xl/styles.xml'].toString('utf8'), themeColors)
    : [];

  const sheetFiles = Object.keys(z)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return sheetFiles.map((key, si) => {
    const x = z[key].toString('utf8');
    const rows = [];
    const fills = [];
    /* 빈 칸도 <c s="…"/> 로 서식만 적혀 있을 수 있어 자기닫힘 태그까지 받습니다 */
    for (const rm of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      const cellFillRow = [];
      for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        /* "AB" 같은 열 이름을 0부터 시작하는 번호로 바꿉니다 */
        const idx = cm[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const attrs = cm[2];
        const body = cm[3] || '';
        const type = /t="([^"]*)"/.exec(attrs);
        const value = /<v>([\s\S]*?)<\/v>/.exec(body);
        let v = value ? value[1] : '';
        if (type && type[1] === 's') v = shared[+v];
        else if (type && type[1] === 'inlineStr') {
          const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
          v = im ? unescapeXml(im[1]) : '';
        }
        cells[idx] = v;

        if (wantFills) {
          const s = /\bs="(\d+)"/.exec(attrs);
          const f = s ? cellFills[+s[1]] : null;
          cellFillRow[idx] = f && f.fillId ? f : null;
        }
      }
      rows.push(cells);
      if (wantFills) fills.push(cellFillRow);
    }
    const sheet = { name: names[si] || key, rows };
    if (wantFills) sheet.fills = fills;
    return sheet;
  });
}
