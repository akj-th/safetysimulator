/* ════════════════════════════════════════════════════════════════════
   한글(hwpx) 내보내기 틀 만들기 (2026-10-27)
   AURI 사전분석 보고서 원본 hwpx 를 그대로 틀로 씁니다. 레이아웃은 AURI 원본이 정하고, 앱은 정해진 자리
   (분야 표 끝 진단 지점 행 · 2장 끝 개선 전/후 그림)에 내용만 끼워 넣습니다 — assets/hwpx-export.js.

   원본 그림(BMP·PNG, 지역당 수십 MB)은 사전진단서 탭이 쓰는 축소 JPEG(data/stats/auri-reports/img/<지역>/<id>.jpg,
   긴 변 1400px)로 바꿔 넣어 내려받기를 가볍게 합니다. 그림 크기·자르기 값은 문서에 그대로 있어 배치는 바뀌지 않습니다.

     node tools/build-hwpx-templates.mjs [지역 ...]      → data/hwpx/<지역>.hwpx + index.json
   순서: npm run auri-reports → node tools/shrink-images.mjs → 이 도구
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip } from './lib/hwpx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs', '사전진단 보고서 및 지도 작업본(AURI)');
const REP = path.join(ROOT, 'data', 'stats', 'auri-reports');
const OUT = path.join(ROOT, 'data', 'hwpx');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function findHwpx(dir, out = []) { if (!fs.existsSync(dir)) return out; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== '_text' && e.name !== '_pptx') findHwpx(p, out); } else if (/\.hwpx$/i.test(e.name)) out.push(p); } return out; }
const ALL = findHwpx(DOCS);
const norm = (s) => s.replace(/[\s_]+/g, '').replace(/\.hwpx$/i, '');

fs.mkdirSync(OUT, { recursive: true });
const index = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : {};
const files = fs.readdirSync(REP).filter((f) => f.endsWith('.json') && f !== 'index.json');
for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(REP, f), 'utf8'));
  const slug = rec.region; if (only.length && !only.includes(slug)) continue;
  const want = norm(rec.source || '');
  const src = ALL.find((p) => norm(path.basename(p)) === want);
  if (!src) { console.log(`${slug.padEnd(11)} 원본 hwpx 없음 (${rec.source}) — 건너뜀`); delete index[slug]; continue; }
  const z = readZip(src);
  let hpf = z['Contents/content.hpf'].toString('utf8');
  const imgDir = path.join(REP, 'img', slug);
  let swapped = 0, before = 0, after = 0;
  for (const name of Object.keys(z)) {
    const m = name.match(/^BinData\/([^/]+)\.(png|bmp|jpe?g|gif)$/i); if (!m) continue;
    before += z[name].length;
    const jpg = path.join(imgDir, m[1] + '.jpg');
    if (!fs.existsSync(jpg)) { after += z[name].length; continue; }
    const nn = `BinData/${m[1]}.jpg`;
    z[nn] = fs.readFileSync(jpg); if (nn !== name) delete z[name];
    hpf = hpf.replace(new RegExp(`href="${name.replace(/[.]/g, '\.')}" media-type="[^"]*"`), `href="${nn}" media-type="image/jpeg"`);
    after += z[nn].length; swapped++;
  }
  z['Contents/content.hpf'] = Buffer.from(hpf, 'utf8');
  const buf = writeZip(Object.entries(z).map(([name, data]) => ({ name, data })));
  fs.writeFileSync(path.join(OUT, slug + '.hwpx'), buf);
  index[slug] = { file: `data/hwpx/${slug}.hwpx`, source: path.basename(src), sourceDate: rec.sourceDate || null, bytes: buf.length };
  console.log(`${slug.padEnd(11)} ${path.basename(src)} → ${(buf.length / 1e6).toFixed(1)}MB (그림 ${swapped}장 축소 ${(before / 1e6).toFixed(1)}→${(after / 1e6).toFixed(1)}MB)`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log('틀', Object.keys(index).length, '곳 → data/hwpx/');
