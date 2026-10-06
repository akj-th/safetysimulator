/* ════════════════════════════════════════════════════════════════════
   사업 아이템별 아이콘 시안 시트 — SVG 한 장

   실행:  node tools/overview-map/build-icon-sheet.mjs namhae
   결과:  output/overview-map/icons/<지역>_아이템아이콘.svg

   regions/<지역>.json 의 존마다 items 를 훑어 (아이콘 + 항목 글) 줄을 만듭니다.
   items 는 "글" 또는 { text, icon } 둘 다 됩니다. 아이콘이 없는 항목은 빈 칸으로 표시.
   일러스트레이터에서 바로 열리도록 use/symbol/clip/marker 없이 그립니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_ICONS } from './item-icons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const regionId = process.argv[2] || 'namhae';
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'regions', regionId + '.json'), 'utf8'));

const FONT = "Pretendard, 'Malgun Gothic', sans-serif";
const INK = '#1F2A33', MAIN = '#D83D64';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const COLS = 2, COLW = 640, ROWH = 64, ICON = 48, PAD = 40, HEAD = 56;
const zones = cfg.zones;
const rowsPerZone = zones.map(z => Math.ceil(z.items.length / COLS));
const H = PAD + zones.reduce((a, z, i) => a + HEAD + rowsPerZone[i] * ROWH + 28, 0) + PAD;
const W = PAD * 2 + COLS * COLW;

let y = PAD;
const parts = [];
parts.push(`<text x="${PAD}" y="${y + 8}" font-family="${FONT}" font-size="22" font-weight="700" fill="${INK}">${esc(cfg.title)} — 사업 아이템별 아이콘 시안</text>`);
parts.push(`<text x="${PAD}" y="${y + 32}" font-family="${FONT}" font-size="13" fill="#5A6670">짙은 둥근 사각 + 흰 선 기호 (40×40 칸, 선 2.2px). 기호 이름은 tools/overview-map/item-icons.mjs</text>`);
y += 60;
zones.forEach((z, zi) => {
  parts.push(`<path d="M${PAD} ${y}H${W - PAD}" stroke="#CCCCCC" stroke-width="1"/>`);
  parts.push(`<text x="${PAD}" y="${y + 36}" font-family="${FONT}" font-size="18" font-weight="700" fill="${INK}"><tspan fill="${MAIN}">${String(zi + 1).padStart(2, '0')}</tspan><tspan dx="8">${esc(z.type)}</tspan><tspan dx="10" font-size="13" font-weight="400" fill="#5A6670">${esc(z.place)}</tspan></text>`);
  y += HEAD;
  z.items.forEach((it, i) => {
    const text = typeof it === 'string' ? it : it.text;
    const icon = typeof it === 'string' ? null : it.icon;
    const cx = PAD + (i % COLS) * COLW, cy = y + Math.floor(i / COLS) * ROWH;
    const g = icon && ITEM_ICONS[icon];
    parts.push(`<g transform="translate(${cx} ${cy}) scale(${ICON / 40})"><rect width="40" height="40" rx="8" fill="${g ? INK : '#E0E0E0'}"/>${g || `<path d="M12 20h16" stroke="#999" stroke-width="2"/>`}</g>`);
    parts.push(`<text x="${cx + ICON + 14}" y="${cy + 21}" font-family="${FONT}" font-size="14.5" fill="${INK}">${esc(text)}</text>`);
    parts.push(`<text x="${cx + ICON + 14}" y="${cy + 39}" font-family="${FONT}" font-size="11.5" fill="#999">${icon ? esc(icon) : '(아이콘 없음)'}</text>`);
  });
  y += rowsPerZone[zi] * ROWH + 28;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
${parts.join('\n')}
</svg>`;
const outDir = path.join(ROOT, 'output/overview-map/icons');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${cfg.region}_아이템아이콘.svg`);
fs.writeFileSync(out, svg);
const missing = zones.flatMap(z => z.items).filter(it => typeof it === 'string' || !ITEM_ICONS[it.icon]);
console.log(`→ ${path.relative(ROOT, out)}  (${W}×${H}) · 항목 ${zones.reduce((a, z) => a + z.items.length, 0)}개 · 아이콘 없는 항목 ${missing.length}`);
