/* ════════════════════════════════════════════════════════════════════
   hwpx(한글 OWPML) → 블록 (2026-10-21)
   hwpx 는 zip 이고 본문은 Contents/section*.xml 입니다. 전에는 PowerShell 로 글만 뽑아(_text) 썼는데
   표의 행·셀 경계가 " | " 로만 남아 붙임의 표가 글과 뒤섞였습니다. 그래서 XML 을 직접 걸어
   문단 / 표(행·셀·병합·캡션) 를 그대로 블록으로 만듭니다. 라이브러리 없이 zip 도 직접 읽습니다.
     readZip(file)           → { 경로: Buffer }
     hwpxBlocks(file)        → [{type:'h2'|'h3'|'bullet'|'sub'|'caption'|'check'|'note'|'p', text} | {type:'table', caption, rows:[[{text,colSpan,rowSpan}]]}]
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import zlib from 'node:zlib';

export function readZip(file) {
  const b = fs.readFileSync(file);
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip 아님: ' + file);
  const n = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
  const out = {};
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), cmtLen = b.readUInt16LE(p + 32), lho = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    const lnLen = b.readUInt16LE(lho + 26), leLen = b.readUInt16LE(lho + 28);
    const start = lho + 30 + lnLen + leLen;
    const data = b.subarray(start, start + csize);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const clean = (s) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

/** 문단 글 → 블록 종류 (문단 밖 글머리 기호 기준) */
export function classify(c) {
  if (/^\d+\.\s/.test(c)) return { type: 'h2', text: c };
  if (/^<붙임\s*\d*>/.test(c)) return { type: 'h2', text: c };          // "<붙임2> 중점관리분야별 위험 특성 분석"
  if (/^□/.test(c)) return { type: 'h3', text: c.replace(/^□\s*/, '') };
  if (/^○/.test(c)) return { type: 'bullet', text: c.replace(/^○\s*/, '') };
  if (/^[-–]\s/.test(c)) return { type: 'sub', text: c.replace(/^[-–]\s*/, '') };
  if (/^(\[표|\[그림|<.*>$|\(.*\)$)/.test(c)) return { type: 'caption', text: c };
  if (/^[▸▶]/.test(c)) return { type: 'check', text: c.replace(/^[▸▶]\s*/, '') };
  if (/^[※*＊⇒→]/.test(c)) return { type: 'note', text: c };
  return { type: 'p', text: c };
}

/** section XML 하나 → 블록. 태그를 순서대로 걸으며 문단·표·셀 스택을 유지합니다 */
export function parseSectionXml(xml) {
  const blocks = [];
  const re = /<(\/?)(hp:[A-Za-z]+|hc:img)([^>]*?)(\/?)>|([^<]+)/g;
  const ctx = [{ kind: 'doc', blocks }];        // doc | table | caption | cell
  const paras = [];                              // 열린 문단의 글 버퍼
  let inT = false;
  const top = () => ctx[ctx.length - 1];
  const emitPara = (text) => {
    const c = clean(text);
    const t = top();
    if (t.kind === 'cell') { if (c || t.paras.length) t.paras.push(c); return; }
    if (t.kind === 'caption') { if (c) t.table.caption = (t.table.caption ? t.table.caption + '\n' : '') + c; return; }
    if (t.kind === 'table') return;              // 표 안인데 셀 밖(없어야 함)
    if (c) t.blocks.push(classify(c));
  };
  const emitTable = (table) => {
    const rows = table.rows.filter((r) => r.length).map((r) => r.map((cell) => ({ text: cell.paras.join('\n').replace(/\n{2,}/g, '\n').trim(), colSpan: cell.colSpan, rowSpan: cell.rowSpan, imgs: cell.imgs })));
    const t = top();
    const block = { type: 'table', caption: table.caption || '', rows };
    if (t.kind === 'cell') {                     // 표 안의 표 — 셀 글로 평탄화
      t.paras.push(rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n'));
    } else if (t.kind === 'doc') t.blocks.push(block);
  };
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) { if (inT && paras.length) paras[paras.length - 1] += unesc(m[5]); continue; }
    const close = m[1] === '/', tag = m[2], attrs = m[3] || '', self = m[4] === '/';
    if (tag === 'hp:t') { inT = !close && !self; continue; }
    if (tag === 'hc:img') {                       // 그림 — BinData 의 id 만 적어 두고 파일은 hwpxDoc 에서 꺼냅니다
      const idm = /binaryItemIDRef="([^"]+)"/.exec(attrs); if (!idm) continue;
      const t = top();
      if (t.kind === 'cell') t.imgs.push(idm[1]); else if (t.kind === 'doc') t.blocks.push({ type: 'img', id: idm[1] });
      continue;
    }
    if (tag === 'hp:lineBreak' && inT && paras.length) { paras[paras.length - 1] += '\n'; continue; }
    if (tag === 'hp:tab' && inT && paras.length) { paras[paras.length - 1] += ' '; continue; }
    if (tag === 'hp:p') {
      if (close) { emitPara(paras.pop() || ''); }
      else if (self) { emitPara(''); }
      else paras.push('');
      continue;
    }
    if (tag === 'hp:tbl') {
      if (close) { const t = ctx.pop(); emitTable(t); }
      else ctx.push({ kind: 'table', rows: [], caption: '' });
      continue;
    }
    if (tag === 'hp:caption') {
      if (close) ctx.pop();
      else { const tb = top(); ctx.push({ kind: 'caption', table: tb.kind === 'table' ? tb : { caption: '' } }); }
      continue;
    }
    if (tag === 'hp:tr') {
      if (!close) { const tb = top(); if (tb.kind === 'table') tb.rows.push([]); }
      continue;
    }
    if (tag === 'hp:tc') {
      if (close) ctx.pop();
      else { const tb = top(); const cell = { kind: 'cell', paras: [], imgs: [], colSpan: 1, rowSpan: 1 }; if (tb.kind === 'table' && tb.rows.length) tb.rows[tb.rows.length - 1].push(cell); ctx.push(cell); }
      continue;
    }
    if (tag === 'hp:cellSpan') {
      const c = top(); if (c.kind === 'cell') { const cs = /colSpan="(\d+)"/.exec(attrs), rs = /rowSpan="(\d+)"/.exec(attrs); if (cs) c.colSpan = +cs[1]; if (rs) c.rowSpan = +rs[1]; }
      continue;
    }
  }
  return blocks;
}

/** hwpx 파일 → { blocks, images } — blocks 는 모든 section 순서대로, images 는 본문이 참조한 그림만 { id: { href, buf, ext } } */
export function hwpxDoc(file) {
  const z = readZip(file);
  const secs = Object.keys(z).filter((k) => /^Contents\/section\d+\.xml$/i.test(k)).sort((a, b) => +a.match(/(\d+)/)[1] - +b.match(/(\d+)/)[1]);
  const blocks = [];
  for (const k of secs) blocks.push(...parseSectionXml(z[k].toString('utf8')));
  /* content.hpf 의 item id → BinData 경로 */
  const hpf = z['Contents/content.hpf'] ? z['Contents/content.hpf'].toString('utf8') : '';
  const href = {};
  for (const m of hpf.matchAll(/<opf:item\s+id="([^"]+)"\s+href="([^"]+)"/g)) href[m[1]] = m[2];
  const used = new Set();
  for (const b of blocks) { if (b.type === 'img') used.add(b.id); if (b.type === 'table') for (const r of b.rows) for (const c of r) for (const id of c.imgs || []) used.add(id); }
  const images = {};
  for (const id of used) { const h = href[id]; if (h && z[h]) images[id] = { href: h, buf: z[h], ext: (h.split('.').pop() || 'png').toLowerCase() }; }
  return { blocks, images };
}
export function hwpxBlocks(file) { return hwpxDoc(file).blocks; }
