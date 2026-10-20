/* ════════════════════════════════════════════════════════════════════
   종합도 SVG → 웹용 JPG (2026-10-20) — 사전진단서 [그림] 종합도 자리에 싣습니다.

   SVG 는 위성영상이 들어 있어 10MB 가 넘고 저장소에도 없습니다(output/). 그래서 크롬(헤드리스)으로
   화면 캡처해 JPG 로 줄여 data/overview/<지역>.jpg (1600px, 화질 80, 300~500KB) 에 둡니다.
   담당자 수정본(_종합도_최종.svg)이 있으면 그것을 씁니다.
   (캔버스에 그려 변환하는 방식은 file:// 그림을 캔버스에 못 올려 막힙니다 — 그래서 CDP 화면 캡처)

     node tools/overview-map/export-jpg.mjs            (22곳 전부)
     node tools/overview-map/export-jpg.mjs geumcheon  (한 곳)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'data/overview');
const WIDTH = 1600, QUALITY = 80;
const only = process.argv[2];
const mapDir = path.join(ROOT, 'output/overview-map');
const slugs = fs.readdirSync(mapDir).filter(d => fs.existsSync(path.join(mapDir, d, d + '_종합도.svg'))).filter(d => !only || d === only);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));
if (!chrome) { console.error('크롬 없음'); process.exit(1); }

const port = 9345;
const prof = path.join(process.env.TEMP || '/tmp', 'export-jpg-prof');
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3000));
const page = (await (await fetch('http://localhost:' + port + '/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: WIDTH / 1920, mobile: false });

let total = 0;
fs.mkdirSync(OUT, { recursive: true });
for (const slug of slugs) {
  const dir = path.join(mapDir, slug);
  const svg = [path.join(dir, slug + '_종합도_최종.svg'), path.join(dir, slug + '_종합도.svg')].find(f => fs.existsSync(f));
  const url = 'file:///' + svg.split(path.sep).join('/');
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 4500));
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY });
  const data = shot.result && shot.result.data;
  if (!data) { console.log('x ' + slug + ': 캡처 실패'); continue; }
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(path.join(OUT, slug + '.jpg'), buf);
  total += buf.length;
  console.log(slug.padEnd(11) + ' ' + path.basename(svg) + ' -> data/overview/' + slug + '.jpg (' + (buf.length / 1024).toFixed(0) + 'KB)');
}
console.log('합계 ' + (total / 1e6).toFixed(1) + 'MB · ' + slugs.length + '곳');
ws.close(); proc.kill();
