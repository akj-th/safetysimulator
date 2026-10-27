/* ════════════════════════════════════════════════════════════════════
   사전진단서 → 한글(hwpx) 내려받기 (2026-10-27)

   ★ 원리 — AURI 원본 hwpx 를 틀로 두고, 정해진 자리에만 내용을 끼워 넣습니다.
     웹 화면을 한글로 "변환"하지 않습니다(그러면 Word 때처럼 레이아웃이 깨집니다).
     배치·글꼴·쪽 구성은 전부 AURI 원본 그대로이고, 우리가 넣는 것은 아래 셋뿐입니다.

     ① 분야별 사업(안) 표 끝에 "진단 지점(시뮬레이터)" 행 — 표의 기존 칸 모양(테두리·글자 모양)을 그대로 씀
     ② 2장 끝에 "진단 지점 개선 전/후" 그림 — AURI 그림 칸을 복제해 사진만 바꿈 + 면책 문구
     ③ 원본 글 속 {{이름}} 자리표시 글자 → 값 (담당자가 한글에서 틀에 적어 두면 그 자리에 들어감)

   틀: data/hwpx/<지역>.hwpx (tools/build-hwpx-templates.mjs 가 만듦, 그림만 축소)
   브라우저와 Node 양쪽에서 돕니다(시험: 스크래치 test-hwpx.mjs). zip 풀기는 DecompressionStream.

     AuriHwpx.build(templateBytes, { tokens, fieldRows, figures }) → { bytes, report }
       fieldRows: [{ key, label, space, place, risk, measures:[{hea, text, note}] }]
       figures:   { heading, items:[{ caption, bytes(JPEG Uint8Array), w, h }], notes:[글] }
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── zip ─────────────────────────────────────────────────────────── */
  const td = new TextDecoder(), te = new TextEncoder();
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([data]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  async function readZip(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let eocd = b.length - 22;
    while (eocd >= 0 && u32(b, eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('hwpx(zip) 파일이 아닙니다');
    const n = u16(b, eocd + 10); let p = u32(b, eocd + 16);
    const files = [];
    for (let i = 0; i < n; i++) {
      const method = u16(b, p + 10), csize = u32(b, p + 20);
      const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), cmtLen = u16(b, p + 32), lho = u32(b, p + 42);
      const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
      const start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
      const raw = b.subarray(start, start + csize);
      files.push({ name, data: method === 8 ? await inflateRaw(raw) : raw.slice() });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  async function deflateRaw(data) {
    const cs = new CompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer());
  }
  /* 글(XML 등)은 압축, 그림·mimetype 은 그대로(이미 압축돼 있거나 hwpx 규칙상 무압축). mimetype 은 맨 앞 */
  async function writeZip(files) {
    const order = files.slice().sort((a, b) => (a.name === 'mimetype' ? -1 : b.name === 'mimetype' ? 1 : 0));
    const parts = [], central = []; let off = 0;
    const le = (n, len) => { const a = new Uint8Array(len); for (let i = 0; i < len; i++) a[i] = (n >>> (8 * i)) & 0xff; return a; };
    for (const f of order) {
      const name = te.encode(f.name), raw = f.data, crc = crc32(raw);
      const store = f.name === 'mimetype' || /\.(jpe?g|png|bmp|gif)$/i.test(f.name);
      const body = store ? raw : await deflateRaw(raw), method = store ? 0 : 8;
      const lh = [le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(method, 2), le(0, 4), le(crc, 4), le(body.length, 4), le(raw.length, 4), le(name.length, 2), le(0, 2)];
      parts.push(...lh, name, body);
      central.push(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(method, 2), le(0, 4), le(crc, 4), le(body.length, 4), le(raw.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), name);
      off += 30 + name.length + body.length;
    }
    const cdLen = central.reduce((s, a) => s + a.length, 0);
    const end = [le(0x06054b50, 4), le(0, 2), le(0, 2), le(order.length, 2), le(order.length, 2), le(cdLen, 4), le(off, 4), le(0, 2)];
    const all = [...parts, ...central, ...end];
    const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
    let q = 0; for (const a of all) { out.set(a, q); q += a.length; }
    return out;
  }

  /* ── XML 도우미 (문자열로 다룹니다 — DOM 으로 다시 쓰면 한글이 쓰는 이름공간 표기가 바뀔 수 있어서) ── */
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  function textOf(x) {
    let s = '';
    x.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (m, t) => { s += unesc(t.replace(/<hp:(fwSpace|tab|nbSpace)[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')); return m; });
    return s.replace(/\s+/g, ' ').trim();
  }
  /** start 에서 열린 <tag …> 의 짝 닫힘 끝 위치 */
  function blockEnd(x, start, tag) {
    const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, 'g'); re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(x))) {
      if (m[1]) { depth--; if (depth === 0) return re.lastIndex; }
      else if (!m[2]) depth++;
      else if (depth === 0) return re.lastIndex;
    }
    return -1;
  }
  /** 섹션 맨 위 문단들 [{s, e, xml, text(표 글 제외)}] */
  function topParas(x) {
    const out = []; let i = x.indexOf('<hs:sec');
    const re = /<hp:p(?=[\s>])/g; re.lastIndex = i;
    let m;
    while ((m = re.exec(x))) {
      const e = blockEnd(x, m.index, 'hp:p'); if (e < 0) break;
      const xml = x.slice(m.index, e);
      out.push({ s: m.index, e, xml, text: textOf(removeTables(xml)) });
      re.lastIndex = e;
    }
    return out;
  }
  function removeTables(x) {
    let i;
    while ((i = x.indexOf('<hp:tbl ')) >= 0) { const e = blockEnd(x, i, 'hp:tbl'); if (e < 0) break; x = x.slice(0, i) + x.slice(e); }
    return x;
  }
  /** 문단 안 첫 단계 표들 [{s, e}] (문단 기준 위치) */
  function tablesIn(x) {
    const out = []; let i = 0;
    while ((i = x.indexOf('<hp:tbl ', i)) >= 0) { const e = blockEnd(x, i, 'hp:tbl'); if (e < 0) break; out.push({ s: i, e }); i = e; }
    return out;
  }
  const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
  const setAttr = (tag, name, v) => tag.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${v}$2`);
  const stripLineseg = (x) => x.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');
  const rid = () => String(1000000000 + Math.floor(Math.random() * 1000000000));

  /* ── 표 행 덧붙이기 ─────────────────────────────────────────────── */
  function cellsOf(tbl) {
    const out = []; let i = 0;
    while ((i = tbl.indexOf('<hp:tc ', i)) >= 0) {
      const e = blockEnd(tbl, i, 'hp:tc'); if (e < 0) break;
      const xml = tbl.slice(i, e);
      const a = xml.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/), sp = xml.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"\/>/), sz = xml.match(/<hp:cellSz width="(\d+)" height="(\d+)"\/>/);
      const paras = []; xml.replace(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*>\s*<hp:run charPrIDRef="(\d+)">([\s\S]*?)<\/hp:p>/g, (m, pp, cp, body) => { paras.push({ pp, cp, text: textOf(body) }); return m; });
      out.push({ xml, col: a ? +a[1] : 0, row: a ? +a[2] : 0, colSpan: sp ? +sp[1] : 1, rowSpan: sp ? +sp[2] : 1, w: sz ? +sz[1] : 0, header: /\sheader="1"/.test(xml.slice(0, 200)), border: attr(xml.slice(0, 300), 'borderFillIDRef'), margin: (xml.match(/<hp:cellMargin [^>]*\/>/) || ['<hp:cellMargin left="510" right="510" top="141" bottom="141"/>'])[0], subList: (xml.match(/<hp:subList [^>]*>/) || [''])[0], paras });
      i = e;
    }
    return out;
  }

  function appendRow(tbl, cols) {
    const open = tbl.slice(0, tbl.indexOf('>') + 1);
    const rowCnt = +attr(open, 'rowCnt'), colCnt = +attr(open, 'colCnt');
    if (colCnt !== cols.length) return null;
    const cells = cellsOf(tbl);
    /* 칸 너비 — 한 칸씩(colSpan 1) 나뉜 줄에서 */
    const widths = []; cells.forEach((c) => { if (c.colSpan === 1 && !widths[c.col]) widths[c.col] = c.w; });
    if (widths.filter(Boolean).length !== colCnt) return null;
    const body = cells.filter((c) => !c.header);
    const pick = (test) => { for (const c of body) for (const p of c.paras) if (p.text && test(p.text, c)) return p; return null; };
    const any = body[0] && body[0].paras[0] || cells[0].paras[0];
    const S = {
      space: pick((t, c) => c.col === 0) || any,
      title: pick((t) => /^\[/.test(t)) || any,
      body: pick((t) => /^-\s*\(/.test(t)) || any,
      measure: pick((t) => /^\((E|H|A)\)/.test(t)) || pick((t) => /^-\s*\(/.test(t)) || any,
      note: pick((t) => /^→/.test(t)) || any,
    };
    const tcOf = (col) => body.filter((c) => c.col === col).pop() || cells.filter((c) => c.col === col).pop();
    let rowH = 0;
    const tcs = cols.map((paras, col) => {
      const t = tcOf(col), w = widths[col];
      const cpl = Math.max(8, Math.floor((w - 1020) / 1150));
      const lines = paras.reduce((s, p) => s + Math.max(1, Math.ceil(String(p.text).length / cpl)), 0);
      rowH = Math.max(rowH, lines * 1920 + 282);
      const px = paras.map((p) => { const st = S[p.style] || S.body; return `<hp:p id="2147483648" paraPrIDRef="${st.pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${st.cp}"><hp:t>${esc(p.text)}</hp:t></hp:run></hp:p>`; }).join('');
      const sub = (t.subList || '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">').replace(/vertAlign="[^"]*"/, 'vertAlign="TOP"');
      return { col, w, border: t.border || '1', margin: t.margin, sub, px };
    });
    const tr = '<hp:tr>' + tcs.map((c) => `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${c.border}">${c.sub}${c.px}</hp:subList><hp:cellAddr colAddr="${c.col}" rowAddr="${rowCnt}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${c.w}" height="${rowH}"/>${c.margin}</hp:tc>`).join('') + '</hp:tr>';
    let out = tbl.slice(0, tbl.lastIndexOf('</hp:tbl>')) + tr + '</hp:tbl>';
    out = setAttr(open, 'rowCnt', rowCnt + 1) + out.slice(open.length);
    out = out.replace(/(<hp:sz width="\d+" widthRelTo="[A-Z]+" height=")(\d+)/, (m, a, h) => a + (+h + rowH));
    return out;
  }

  /* ── 그림 칸 복제 ───────────────────────────────────────────────── */
  function figurePara(tplPara, binId, img, caption) {
    let x = stripLineseg(tplPara);
    const ti = x.indexOf('<hp:tbl '), te2 = blockEnd(x, ti, 'hp:tbl');
    let tbl = x.slice(ti, te2);
    /* 문단 여는 태그 + 그림 칸을 품은 글 조각(run) 여는 태그만 가져오고, 문단 안 다른 것(글·다른 표)은 버립니다 */
    const pOpen = noBreak(x.slice(0, x.indexOf('>') + 1));
    const runOpen = (x.slice(0, ti).match(/<hp:run [^>]*>(?![\s\S]*<hp:run )/) || ['<hp:run charPrIDRef="0">'])[0];
    tbl = tbl.replace(/^<hp:tbl [^>]*>/, (t) => setAttr(t, 'id', rid()));
    /* 캡션 글 */
    tbl = tbl.replace(/<hp:caption[\s\S]*?<\/hp:caption>/, (cap) => { let n = 0; return cap.replace(/<hp:t>[\s\S]*?<\/hp:t>|<hp:t\/>/g, () => (n++ === 0 ? `<hp:t>${esc(caption)}</hp:t>` : '<hp:t></hp:t>')); });
    /* 칸 안쪽 너비에 맞춰 그림 크기 */
    const cs = tbl.match(/<hp:cellSz width="(\d+)" height="(\d+)"\/>/), cm = tbl.match(/<hp:cellMargin left="(\d+)" right="(\d+)" top="(\d+)" bottom="(\d+)"\/>/);
    const inner = (cs ? +cs[1] : 45000) - (cm ? +cm[1] + +cm[2] : 1020);
    const { W, H } = fitSize(inner, img);
    tbl = tbl.replace(/<hp:pic [\s\S]*?<\/hp:pic>/, (pic) => sizePic(pic, binId, W, H, img, caption));
    const cellH = H + (cm ? +cm[3] + +cm[4] : 282);
    tbl = tbl.replace(/<hp:cellSz width="(\d+)" height="\d+"\/>/, `<hp:cellSz width="$1" height="${cellH}"/>`);
    tbl = tbl.replace(/(<hp:sz width="\d+" widthRelTo="[A-Z]+" height=")\d+/, `$1${cellH}`);
    return `${pOpen}${runOpen}${tbl}<hp:t/></hp:run></hp:p>`;
  }

  /** 너비 maxW 안에서 사진 비율대로. 세로는 약 12cm 까지 (세로가 긴 사진이 한 쪽을 다 차지하지 않게) */
  function fitSize(maxW, img) {
    let W = maxW, H = Math.round(W * img.h / img.w);
    const HMAX = 34000;
    if (H > HMAX) { H = HMAX; W = Math.round(H * img.w / img.h); }
    return { W, H };
  }

  /* AURI 그림이 하나도 없는 보고서(약식본)에 쓰는 그림 틀 — 부천 원본의 그림 요소에서 위치·크기 값만 비운 것 */
  const PIC_TPL = '<hp:pic id="0" zOrder="90" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="0" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="0" height="0"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hp:effects/><hp:sz width="0" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment></hp:shapeComment></hp:pic>';

  /** 그림 요소의 크기·자르기·참조를 새 사진에 맞춤 */
  function sizePic(pic, binId, W, H, img, caption) {
    const dimW = img.w * 75, dimH = img.h * 75;
    return pic
      .replace(/^<hp:pic [^>]*>/, (t) => setAttr(setAttr(t, 'id', rid()), 'instid', rid()))
      .replace(/<hp:offset [^>]*\/>/, '<hp:offset x="0" y="0"/>')
      .replace(/<hp:orgSz [^>]*\/>/, `<hp:orgSz width="${W}" height="${H}"/>`)
      .replace(/<hp:curSz [^>]*\/>/, `<hp:curSz width="${W}" height="${H}"/>`)
      .replace(/<hp:rotationInfo [^>]*\/>/, `<hp:rotationInfo angle="0" centerX="${W >> 1}" centerY="${H >> 1}" rotateimage="1"/>`)
      .replace(/<hp:renderingInfo>[\s\S]*?<\/hp:renderingInfo>/, '<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>')
      .replace(/(<hc:img [^>]*binaryItemIDRef=")[^"]*/, `$1${binId}`)
      .replace(/<hp:imgRect>[\s\S]*?<\/hp:imgRect>/, `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${W}" y="0"/><hc:pt2 x="${W}" y="${H}"/><hc:pt3 x="0" y="${H}"/></hp:imgRect>`)
      .replace(/<hp:imgClip [^>]*\/>/, `<hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/>`)
      .replace(/<hp:imgDim [^>]*\/>/, `<hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/>`)
      .replace(/<hp:sz width="\d+" widthRelTo="([A-Z]+)" height="\d+"/, `<hp:sz width="${W}" widthRelTo="$1" height="${H}"`)
      .replace(/<hp:pos [^>]*\/>/, '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>')
      .replace(/<hp:shapeComment>[\s\S]*?<\/hp:shapeComment>/, `<hp:shapeComment>${esc(caption)}</hp:shapeComment>`);
  }

  /** 그림 칸을 복제할 수 없을 때 — 가운데 정렬 문단 하나에 그림을 글자처럼 얹습니다 */
  function barePicPara(binId, img, caption, maxW, centerPP, charPr) {
    const { W, H } = fitSize(maxW, img);
    return `<hp:p id="2147483648" paraPrIDRef="${centerPP}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}">${sizePic(PIC_TPL, binId, W, H, img, caption)}<hp:t/></hp:run></hp:p>`;
  }

  /** 글 문단 복제 — 첫 글 조각에 새 글, 나머지 비움. 문단 안 표는 뺍니다 */
  function textPara(tplPara, text) {
    let x = stripLineseg(removeTables(tplPara)), n = 0;
    x = x.replace(/<hp:t>[\s\S]*?<\/hp:t>|<hp:t\/>/g, () => (n++ === 0 ? `<hp:t>${esc(text)}</hp:t>` : '<hp:t></hp:t>'));
    if (!n) x = x.replace(/<\/hp:run>/, `<hp:t>${esc(text)}</hp:t></hp:run>`);
    /* 문서 첫 문단은 용지·구역 정의(secPr)를 품고 있습니다 — 그대로 복제하면 넣을 때마다 새 구역(새 쪽)이 시작됩니다 */
    return noBreak(x.replace(/<hp:ctrl>[\s\S]*?<\/hp:ctrl>/g, '').replace(/<hp:secPr[\s\S]*?<\/hp:secPr>/g, ''));
  }
  /** 복제한 문단의 쪽·단 나눔을 끕니다 — "□ 분야" 제목처럼 새 쪽에서 시작하는 문단 모양을 빌려도 이어서 흐르게 */
  const noBreak = (x) => x.replace(/^<hp:p [^>]*>/, (t) => setAttr(setAttr(t, 'pageBreak', '0'), 'columnBreak', '0'));

  /* ── 2장 찾기 ───────────────────────────────────────────────────── */
  const FIELD_RE = { traffic: /교통/, fire: /화재/, crime: /범죄/, life: /생활\s*안전/, suicide: /자살/, infection: /감염/, industrial: /산업\s*재해|산재/ };
  function scanCh2(sections) {
    for (let si = 0; si < sections.length; si++) {
      const paras = topParas(sections[si].xml);
      let i0 = paras.findIndex((p) => /^2\.\s/.test(p.text) && /(다발지|맞춤형)/.test(p.text));
      /* 장 제목 없이 "□ 범죄 분야" 로 바로 시작하는 보고서(261022 판 12곳) — 첫 분야 제목부터 */
      if (i0 < 0) i0 = paras.findIndex((p) => /^□/.test(p.text) && Object.values(FIELD_RE).some((re) => re.test(p.text.slice(0, 14))));
      if (i0 < 0) continue;
      let i1 = paras.length;
      for (let i = i0 + 1; i < paras.length; i++) if (/^(\d+\.\s|<\s*붙임)/.test(paras[i].text)) { i1 = i; break; }
      const ch = paras.slice(i0, i1);
      const fields = []; let cur = null;
      for (const p of ch) {
        const h = p.text.match(/^□\s*(.+)/);
        if (h) { const key = Object.keys(FIELD_RE).find((k) => FIELD_RE[k].test(h[1].slice(0, 12))); cur = key ? { key, heading: p, plan: null, figs: [], check: null } : null; if (cur) fields.push(cur); continue; }
        if (!cur) continue;
        if (/^○\s*사전\s*체크/.test(p.text) && !cur.check) cur.check = p;
        for (const t of tablesIn(p.xml)) {
          const tx = p.xml.slice(t.s, t.e);
          const firstRow = tx.slice(tx.indexOf('<hp:tr>'), blockEnd(tx, tx.indexOf('<hp:tr>'), 'hp:tr'));
          if (!cur.plan && /사업/.test(textOf(firstRow)) && /공간|유형|지점/.test(textOf(firstRow))) cur.plan = { para: p, s: t.s, e: t.e };
          else if (/numberingType="PICTURE"/.test(tx.slice(0, 200)) && /<hp:pic /.test(tx)) cur.figs.push(p);
        }
      }
      return { si, paras, ch, fields, endPara: ch[ch.length - 1] };
    }
    return null;
  }

  /* ── 본체 ───────────────────────────────────────────────────────── */
  async function build(templateBytes, data) {
    data = data || {};
    const files = await readZip(templateBytes);
    const get = (n) => files.find((f) => f.name === n);
    const sections = files.filter((f) => /^Contents\/section\d+\.xml$/.test(f.name)).sort((a, b) => +a.name.match(/\d+/)[0] - +b.name.match(/\d+/)[0]).map((f) => ({ f, xml: td.decode(f.data) }));
    const report = { rows: [], figures: 0, tokens: 0, missing: [] };

    /* ③ 자리표시 글자 */
    const tokens = data.tokens || {};
    for (const s of sections) s.xml = s.xml.replace(/<hp:t>([^<]*)<\/hp:t>/g, (m, t) => (/\{\{[^}]+\}\}/.test(t) ? `<hp:t>${t.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (mm, k) => { if (k in tokens) { report.tokens++; return esc(tokens[k]); } return mm; })}</hp:t>` : m));

    const ch2 = scanCh2(sections);
    if (!ch2) { report.missing.push('2장(맞춤형 사업)을 찾지 못함'); }
    else {
      const sec = sections[ch2.si];
      const edits = [];   // { s, e, xml } — 뒤에서부터 바꿉니다
      /* ① 분야 표에 진단 지점 행 */
      for (const row of data.fieldRows || []) {
        const f = ch2.fields.find((x) => x.key === row.key);
        if (!f || !f.plan) { report.missing.push(`${row.label} 사업(안) 표`); continue; }
        const p = f.plan.para, tbl = p.xml.slice(f.plan.s, f.plan.e);
        const col0 = [{ style: 'space', text: row.space || '진단 지점(시뮬레이터)' }].concat(row.place ? [{ style: 'body', text: row.place }] : []);
        const col1 = [{ style: 'title', text: '[사진 판독]' }, { style: 'body', text: '- ' + (row.risk || '판독 결과 없음') }];
        /* 근거 줄은 본문 글자 모양으로 — AURI 표의 "→" 줄(굵게·가운데)을 쓰면 긴 근거 문장이 무겁게 보입니다 (2026-10-27) */
        const col2 = [{ style: 'title', text: '[시뮬레이터 처방]' }].concat(...row.measures.map((m) => [{ style: 'measure', text: `${m.hea ? '(' + m.hea + ') ' : ''}${m.text}` }].concat(m.note ? [{ style: 'body', text: '  · ' + m.note }] : [])));
        const cols = [col0, col1, col2];
        const tblCols = +attr(tbl.slice(0, tbl.indexOf('>')), 'colCnt');
        const fitted = tblCols === 3 ? cols : tblCols === 2 ? [col0.concat(col1), col2] : null;
        const nt = fitted && appendRow(tbl, fitted);
        if (!nt) { report.missing.push(`${row.label} 표 모양(칸 ${tblCols}개)`); continue; }
        const nx = p.xml.slice(0, f.plan.s) + stripLineseg(nt) + p.xml.slice(f.plan.e);
        edits.push({ s: p.s, e: p.e, xml: nx });
        report.rows.push(row.label);
      }
      /* ② 2장 끝에 개선 전/후 */
      const figs = (data.figures && data.figures.items) || [];
      const tplFig = ch2.fields.map((f) => f.figs[f.figs.length - 1]).filter(Boolean).pop();
      const tplHead = ch2.fields.map((f) => f.check).filter(Boolean)[0] || (ch2.fields[0] && ch2.fields[0].heading);
      /* 면책 문구는 본문 문단 모양으로 — 표가 없는 2장 글 문단 중 글머리(□○숫자[)가 아닌 것 */
      let tplNote = ch2.ch.find((p) => p.text && !/^(□|○|\d+\.|\[|<)/.test(p.text) && !tablesIn(p.xml).length);
      if (!tplNote) {
        /* 약식본엔 본문 문단이 없어 사업(안) 표 안 "- (장소)" 글 모양을 빌립니다(소제목 모양이면 크고 굵게 나옴) */
        const plan = ch2.fields.map((f) => f.plan).filter(Boolean)[0];
        const m = plan && plan.para.xml.slice(plan.s, plan.e).match(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*>\s*<hp:run charPrIDRef="(\d+)"><hp:t>-\s*\(/);
        tplNote = m ? { xml: `<hp:p id="2147483648" paraPrIDRef="${m[1]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${m[2]}"><hp:t></hp:t></hp:run></hp:p>` } : tplHead;
      }
      if (figs.length && (tplFig || tplHead)) {
        const manifestAdd = [];
        let add = '';
        if (data.figures.heading && tplHead) add += textPara(tplHead.xml, data.figures.heading);
        /* 복제할 AURI 그림 칸이 없는 약식본: 가운데 정렬 문단 + 그림. 너비는 사업(안) 표 너비의 92% */
        let bare = null;
        if (!tplFig) {
          const hx = td.decode(get('Contents/header.xml').data);
          const cpp = (hx.match(/<hh:paraPr id="(\d+)"[^>]*><hh:align horizontal="CENTER"/) || [])[1];
          const plan = ch2.fields.map((f) => f.plan).filter(Boolean)[0];
          const tw = plan ? +((plan.para.xml.slice(plan.s, plan.e).match(/<hp:sz width="(\d+)"/) || [])[1] || 0) : 0;
          const cp = ((tplNote || tplHead).xml.match(/<hp:run charPrIDRef="(\d+)"/) || [])[1] || '0';
          bare = { cpp: cpp || '0', maxW: Math.round((tw || 46000) * 0.92), cp };
        }
        figs.forEach((im, k) => {
          const id = 'simImg' + (k + 1);
          files.push({ name: `BinData/${id}.jpg`, data: im.bytes });
          manifestAdd.push(`<opf:item id="${id}" href="BinData/${id}.jpg" media-type="image/jpeg" isEmbeded="1"/>`);
          if (tplFig) add += figurePara(tplFig.xml, id, im, im.caption);
          else add += textPara((tplNote || tplHead).xml, im.caption).replace(/^<hp:p [^>]*>/, (t) => setAttr(t, 'paraPrIDRef', bare.cpp)) + barePicPara(id, im, im.caption, bare.maxW, bare.cpp, bare.cp);
          report.figures++;
        });
        for (const t of (data.figures.notes || [])) if (t && tplNote) add += textPara(tplNote.xml, t);
        const hpf = get('Contents/content.hpf');
        hpf.data = te.encode(td.decode(hpf.data).replace('</opf:manifest>', manifestAdd.join('') + '</opf:manifest>'));
        const endP = ch2.endPara;
        const prev = edits.find((x) => x.s === endP.s);
        if (prev) prev.xml += add; else edits.push({ s: endP.s, e: endP.e, xml: endP.xml + add });
      } else if (figs.length) report.missing.push('그림 칸 모양');
      edits.sort((a, b) => b.s - a.s).forEach((x) => { sec.xml = sec.xml.slice(0, x.s) + x.xml + sec.xml.slice(x.e); });
    }
    for (const s of sections) s.f.data = te.encode(s.xml);
    /* 미리보기 글(PrvText)은 원본 그대로 둡니다 — 한글이 저장할 때 다시 만듭니다 */
    return { bytes: await writeZip(files), report };
  }

  /** JPEG 머리에서 픽셀 크기 */
  function jpegSize(b) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
    return null;
  }

  root.AuriHwpx = { build, readZip, writeZip, jpegSize, _scanCh2: scanCh2, _topParas: topParas };
})(typeof window !== 'undefined' ? window : globalThis);
