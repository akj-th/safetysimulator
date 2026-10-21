/* ════════════════════════════════════════════════════════════════════
   output/auri-img-raw/<지역>/<id>.<png|bmp>  →  data/stats/auri-reports/img/<지역>/<id>.jpg  (2026-10-21)
   AURI 보고서에 든 위치도·종합도 원본은 BMP·PNG 라 지자체당 10~20MB 입니다. 저장소·화면용으로
   긴 변 1400px JPEG(품질 .82)로 줄입니다. 라이브러리 없이 **헤드리스 크롬**의 캔버스로 변환합니다.
   실행: node tools/shrink-images.mjs   (build-auri-reports.mjs 뒤에)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'output/auri-img-raw');
const OUT = path.join(ROOT, 'data/stats/auri-reports/img');
const MAX = 1400, Q = 0.82;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('크롬을 찾지 못했습니다'); process.exit(1); }
if (!fs.existsSync(RAW)) { console.error('원본 폴더 없음: ' + RAW + ' — build-auri-reports.mjs 를 먼저'); process.exit(1); }

const jobs = [];
for (const slug of fs.readdirSync(RAW)) for (const f of fs.readdirSync(path.join(RAW, slug))) jobs.push({ slug, f, src: path.join(RAW, slug, f), dst: path.join(OUT, slug, f.replace(/\.[^.]+$/, '.jpg')) });

const port = 9350;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(process.env.TEMP || '/tmp', 'cdp-shrink'), '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const page = (await (await fetch(`http://localhost:${port}/json`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m.result); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;
await send('Runtime.enable');

let n = 0, bytes = 0;
for (const j of jobs) {
  const b64 = fs.readFileSync(j.src).toString('base64');
  const mime = /\.bmp$/i.test(j.f) ? 'image/bmp' : 'image/png';
  const out = await ev(`new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.min(1, ${MAX} / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', ${Q})); }; im.onerror = () => res(null); im.src = 'data:${mime};base64,${b64}'; })`);
  if (!out) { console.warn('변환 실패:', j.slug, j.f); continue; }
  fs.mkdirSync(path.dirname(j.dst), { recursive: true });
  const buf = Buffer.from(out.split(',')[1], 'base64');
  fs.writeFileSync(j.dst, buf); n++; bytes += buf.length;
}
console.log(`그림 ${n}장 → ${path.relative(ROOT, OUT)} (${(bytes / 1048576).toFixed(1)}MB)`);
ws.close(); chrome.kill();
