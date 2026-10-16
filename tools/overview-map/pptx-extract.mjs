/* ════════════════════════════════════════════════════════════════════
   AURI 종합도 PPTX(풀어 둔 폴더) → 도형·글·좌표 JSON

   2026-10-15 판부터 AURI 가 pptx 를 함께 보냅니다. 슬라이드 안에 구역 윤곽(custGeom 다각형)·번호 원·
   시설 점(이름 붙음)·설명 상자·범례 글이 전부 도형으로 들어 있어 색으로 뽑을 필요가 없습니다.
   최종 PNG 는 이 슬라이드를 그대로 내보낸 것이라  px = EMU × (PNG 폭 ÷ 12,192,000) 입니다.

   실행:  node tools/overview-map/pptx-extract.mjs <풀어둔 pptx 폴더> <PNG 폭> [out.json]
   결과:  { slide:{cx,cy}, scale, map:{x,y,w,h,file}, shapes:[{name, kind, x,y,w,h, pts, line, fill, dash, text:[…]}] }
          좌표는 전부 PNG px. pts 는 다각형 꼭짓점(닫힘). kind: zone | marker | poi | box | text | pic | other
   ⚠ 지자체마다 만든 사람이 달라 도형 이름·구성이 제각각입니다(미추홀 "타겟구역_…"/"대상지1"/"지점_…",
     옹진·서천 "자유형: 도형"/"구역번호③"/"Shape 38"). 그래서 이름보다 **모양·글·색**으로 분류합니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2], pngW = +process.argv[3], outFile = process.argv[4] || path.join(dir, 'shapes.json');
if (!dir || !pngW) { console.error('사용법: pptx-extract.mjs <pptx 폴더> <PNG 폭> [out.json]'); process.exit(1); }
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const slide = read('ppt/slides/slide1.xml');
const pres = read('ppt/presentation.xml');
const [cx, cy] = (pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/) || [0, 12192000, 6858000]).slice(1).map(Number);
const S = pngW / cx;

/* 테마 색 (schemeClr accent1… → RGB) */
const theme = fs.existsSync(path.join(dir, 'ppt/theme/theme1.xml')) ? read('ppt/theme/theme1.xml') : '';
const THEME = {};
for (const m of theme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>(.*?)<\/a:\1>/gs)) { const c = m[2].match(/(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/); if (c) THEME[m[1]] = c[1].toUpperCase(); }
THEME.bg1 = THEME.lt1; THEME.tx1 = THEME.dk1; THEME.bg2 = THEME.lt2; THEME.tx2 = THEME.dk2;
const rels = fs.existsSync(path.join(dir, 'ppt/slides/_rels/slide1.xml.rels')) ? read('ppt/slides/_rels/slide1.xml.rels') : '';
const REL = {}; for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) REL[m[1]] = m[2].replace('../', 'ppt/');

const color = (xml) => { if (!xml) return null; const s = xml.match(/srgbClr val="([0-9A-Fa-f]{6})"/); if (s) return s[1].toUpperCase(); const t = xml.match(/schemeClr val="(\w+)"/); return t ? (THEME[t[1]] || t[1]) : null; };
const text = (xml) => [...xml.matchAll(/<a:p>(.*?)<\/a:p>/gs)].map(p => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('').trim()).filter(Boolean);

/* 가장 큰 그림(지도) 범위 — "지도 안" 판정에 씀 */
let pics0 = null;
{ const pm = [...slide.matchAll(/<p:pic>.*?<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/gs)].map(m => m.slice(1, 5).map(Number)).sort((a, b) => b[2] * b[3] - a[2] * a[3]); if (pm[0]) pics0 = { x: pm[0][0] * S, y: pm[0][1] * S, w: pm[0][2] * S, h: pm[0][3] * S }; }

/* 같은 깊이의 <p:sp>/<p:pic>/<p:grpSp> 블록으로 나누기 (중첩 그룹은 바깥 그룹이 통째로 가져감) */
function splitTop(xml) {
  const out = []; const re = /<p:(sp|pic|grpSp)>/g; let m;
  while ((m = re.exec(xml))) {
    const tag = m[1]; let depth = 1, i = m.index + m[0].length;
    const open = new RegExp('<p:' + tag + '>', 'g'), close = new RegExp('</p:' + tag + '>', 'g');
    while (depth > 0) { open.lastIndex = i; close.lastIndex = i; const o = open.exec(xml), c = close.exec(xml); if (!c) { i = xml.length; break; } if (o && o.index < c.index) { depth++; i = o.index + o[0].length; } else { depth--; i = c.index + c[0].length; } }
    out.push({ tag, body: xml.slice(m.index, i) }); re.lastIndex = i;
  }
  return out;
}

const shapes = [];
function walk(xml, T) {   // T = { ox, oy, sx, sy } : 자식 EMU → 슬라이드 EMU
  for (const it of splitTop(xml)) {
    const tag = it.tag, body = it.body;
    const xf = body.match(/<a:xfrm[^>]*>\s*<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>(?:\s*<a:chOff x="(-?\d+)" y="(-?\d+)"\/>\s*<a:chExt cx="(\d+)" cy="(\d+)"\/>)?/);
    if (!xf) continue;
    const [ox, oy, ex, ey] = xf.slice(1, 5).map(Number);
    const toSlide = (x, y) => [T.ox + x * T.sx, T.oy + y * T.sy];
    const [X, Y] = toSlide(ox, oy), W = ex * T.sx, H = ey * T.sy;
    if (tag === 'grpSp') {
      const [chx, chy, chw, chh] = xf.slice(5, 9).map(Number);
      const inner = body.replace(/^.*?<\/p:grpSpPr>/s, '');
      const sx = chw ? W / chw : 1, sy = chh ? H / chh : 1;
      walk(inner, { ox: X - chx * sx, oy: Y - chy * sy, sx, sy });
      continue;
    }
    const name = (body.match(/<p:cNvPr id="\d+" name="([^"]*)"/) || [])[1] || '';
    const spPr = (body.match(/<p:spPr>(.*?)<\/p:spPr>/s) || [])[1] || '';
    const lnXml = (spPr.match(/<a:ln(?: [^>]*)?>(.*?)<\/a:ln>/s) || [])[1];         // <a:lnTo> 와 헷갈리지 않게 "<a:ln>" 또는 "<a:ln ..." 만
    const line = lnXml && !/<a:noFill\/>/.test(lnXml) ? color(lnXml) : null;
    const lnW = +((spPr.match(/<a:ln w="(\d+)"/) || [])[1] || 0);
    const dash = (lnXml && lnXml.match(/prstDash val="(\w+)"/) || [])[1] || 'solid';
    const fillXml = spPr.replace(/<a:ln(?: [^>]*)?>.*?<\/a:ln>/s, '').replace(/<a:custGeom>.*?<\/a:custGeom>/s, '').replace(/<a:prstGeom[^>]*>.*?<\/a:prstGeom>/s, '');
    const fill = /<a:noFill\/>/.test(fillXml) ? null : color((fillXml.match(/<a:solidFill>(.*?)<\/a:solidFill>/s) || [])[1]);
    const prst = (spPr.match(/<a:prstGeom prst="(\w+)"/) || [])[1];
    const px = (x, y) => [+(x * S).toFixed(1), +(y * S).toFixed(1)];
    let pts = null;
    const pathM = spPr.match(/<a:path w="(\d+)" h="(\d+)"[^>]*>(.*?)<\/a:path>/s);
    if (pathM) {
      const pw = +pathM[1] || ex, ph = +pathM[2] || ey; const kx = ex / pw, ky = ey / ph; pts = [];
      for (const p of pathM[3].matchAll(/<a:(moveTo|lnTo|cubicBezTo)>(.*?)<\/a:\1>/gs)) {
        const ps = [...p[2].matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"\/>/g)].map(q => [+q[1], +q[2]]);
        const use = p[1] === 'cubicBezTo' ? [ps[1], ps[2]] : ps;   // 곡선은 제어점 하나와 끝점만 (근사)
        for (const [qx, qy] of use) { const [sx, sy] = toSlide(ox + qx * kx, oy + qy * ky); pts.push(px(sx, sy)); }
      }
    } else if (prst === 'rect' || prst === 'roundRect') { pts = [px(X, Y), px(X + W, Y), px(X + W, Y + H), px(X, Y + H)]; }
    else if (prst === 'ellipse') { pts = []; const n = 28; for (let i = 0; i < n; i++) pts.push(px(X + W / 2 + W / 2 * Math.cos(2 * Math.PI * i / n), Y + H / 2 + H / 2 * Math.sin(2 * Math.PI * i / n))); }
    const txt = text(body);
    const rid = (body.match(/r:embed="(rId\d+)"/) || [])[1];
    const rec = { name, tag, x: +(X * S).toFixed(1), y: +(Y * S).toFixed(1), w: +(W * S).toFixed(1), h: +(H * S).toFixed(1), prst: prst || (pathM ? 'custom' : null), line, lnW, dash, fill, text: txt, pts };
    const small = Math.max(W, H) * S < 60;
    const inMap = !pics0 || (X * S < pics0.x + pics0.w - 20 && Y * S > pics0.y - 5);
    const redDot = prst === 'ellipse' && small && (fill === 'FF0000' || fill === 'E53935' || fill === 'C00000');
    if (tag === 'pic') { rec.file = rid ? REL[rid] : null; rec.kind = 'pic'; }
    else if (prst === 'ellipse' && txt.length === 1 && /^\d{1,2}$/.test(txt[0])) rec.kind = 'marker';                 // 번호 원
    else if (redDot || /^지점_|^시설_/.test(name)) rec.kind = 'poi';                                                    // 빨간 점 (글 'ㅋ' 하나 든 것도)
    else if (!txt.length && line && !fill && (pathM || prst === 'rect' || prst === 'roundRect' || prst === 'ellipse') && !small && inMap) rec.kind = 'zone';   // 선만 있는 다각형·사각·원
    else if (!txt.length && pathM && !small && inMap) rec.kind = 'zone';
    else if (txt.length >= 2 && (/^[①-⑳]/.test(txt[0]) || (fill === 'FFFFFF' && W * S > 350 && !/범례/.test(name) && !/^\[/.test(txt[0])))) rec.kind = 'box';
    else if (txt.length) rec.kind = 'text';
    else rec.kind = 'other';
    shapes.push(rec);
  }
}
walk(slide, { ox: 0, oy: 0, sx: 1, sy: 1 });

/* 지도 그림 = 가장 큰 pic. 키맵 = 그다음 */
const pics = shapes.filter(s => s.kind === 'pic').sort((a, b) => b.w * b.h - a.w * a.h);
const out = { slide: { cx, cy }, pngW, scale: S, map: pics[0] ? { x: pics[0].x, y: pics[0].y, w: pics[0].w, h: pics[0].h, file: pics[0].file } : null, keymap: pics[1] ? { x: pics[1].x, y: pics[1].y, w: pics[1].w, h: pics[1].h, file: pics[1].file } : null, theme: THEME, shapes };
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
const n = (k) => shapes.filter(s => s.kind === k).length;
console.log(`${path.basename(dir)}: 도형 ${shapes.length} — 구역 ${n('zone')} · 번호 ${n('marker')} · 시설 ${n('poi')} · 상자 ${n('box')} · 글 ${n('text')} · 그림 ${n('pic')} · 기타 ${n('other')}`);
