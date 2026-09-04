/* ════════════════════════════════════════════════════════════════════
   CSV 읽기 — 따옴표 안의 쉼표·줄바꿈을 제대로 처리합니다.

   119 자료의 `분류근`·`합치기` 칸에는 쉼표가 그대로 들어 있어서
   줄을 split(',') 으로 자르면 칸이 밀립니다. 그래서 직접 훑습니다.
   ════════════════════════════════════════════════════════════════════ */

/** CSV 본문 → 2차원 배열 */
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }   // "" 는 따옴표 한 개
        else inQuote = false;
      } else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* 무시 */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/**
 * CSV 파일을 읽어 { header, rows, col } 로 돌려줍니다.
 * col('환자연') 처럼 칸 이름으로 위치를 찾을 수 있습니다.
 */
export function readCsvFile(fs, filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');  // 엑셀이 붙인 BOM 제거
  const rows = parseCsv(text);
  const header = rows[0] || [];
  return {
    header,
    rows: rows.slice(1),
    col(name) {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`CSV에 '${name}' 칸이 없습니다: ${filePath}`);
      return i;
    },
  };
}
