/* ════════════════════════════════════════════════════════════════════
   개선 이미지 일괄 생성 (2026-10-20, 10/14 AURI 회의 — 123~250장을 11월 2차 조사 전에 미리)

   현장조사팀 사진이 수십 장씩 오면 4단계 화면에서 한 장씩 누를 수 없습니다(200장 × 20분).
   이 도구는 **작업표(CSV)** 를 읽어 켜 둔 로컬 서버의 /api/generate 를 순서대로 부르고,
   개선 전/후 이미지와 기록을 폴더에 남깁니다. 화면과 **같은 지시문·같은 모델**을 쓰므로 결과 품질은 같습니다.

   준비
     1) 서버를 로그인 없이, 상한을 올려서 켭니다 (내 컴퓨터에서만):
          cd server && AUTH_MODE=off DAILY_LIMIT=1000 HOURLY_LIMIT_PER_IP=1000 node server.js
        이미지 생성도 진단과 같은 하루 200회·시간당 20회 상한(checkQuota)에 걸리므로 올려야 합니다.
     2) 작업표 CSV (UTF-8, 머리글 필수):
          id, photo, model, facilities, note
          M-01, photos/michuhol_01.jpg, gpt-image-2.5-sunburst, 골목 진입부 다목적 CCTV; 안심비상벨, (비우면 됨)
        - photo      : 현장 사진 경로 (CSV 파일 기준 상대경로)
        - model      : 서버 IMAGE_MODELS 의 id (비우면 --model 기본값)
        - facilities : 이미지에 넣을 사업 이름들, 세미콜론(;) 구분 — **E(환경 개선)만** 적으세요. 교육·상담은 사진에 안 나옵니다
        - note       : 고칠 점(선택). 화면의 "고칠 점을 적어 다시" 와 같은 칸
   실행
     node tools/batch-generate.mjs <작업표.csv> --out=<결과 폴더> [--server=http://localhost:8787] [--model=gpt-image-2.5-sunburst] [--go] [--retry=1]
     --go 가 없으면 **시험 실행**(어떤 사진·사업으로 몇 장 만들지만 보여 주고 API 를 부르지 않음). 요금이 드는 일이라 기본은 시험입니다.
   결과
     <out>/<id>_before.<ext> · <id>_after.png · <out>/log.csv (id, 모델, 사업, 소요초, 결과/오류)
     이미 <id>_after.png 가 있으면 건너뜁니다 — 중간에 끊겨도 다시 돌리면 이어집니다.
   ⚠ 요금은 모델 가격표로 미리 가늠하세요 (gpt-image-2 high 1024² 약 $0.21/장 → 200장 ≈ $42, 2.5 는 미공개).
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const csvFile = process.argv[2];
const ARGS = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!csvFile || !ARGS.out) { console.error('사용법: node tools/batch-generate.mjs <작업표.csv> --out=<폴더> [--server=] [--model=] [--go]'); process.exit(1); }
const SERVER = String(ARGS.server || 'http://localhost:8787').replace(/\/$/, '');
const DEFAULT_MODEL = String(ARGS.model || 'gpt-image-2.5-sunburst');
const OUT = path.resolve(String(ARGS.out)); fs.mkdirSync(OUT, { recursive: true });
const base = path.dirname(path.resolve(csvFile));

/* CSV (따옴표 안 쉼표 허용) */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const jobs = parseCsv(fs.readFileSync(csvFile, 'utf8').replace(/^﻿/, ''));
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/* 서버·모델 확인 */
let models = [];
try { const r = await fetch(SERVER + '/api/models'); const j = await r.json(); models = (j.models || []).map(m => m.id); }
catch (e) { console.error(`서버에 못 붙음 (${SERVER}): ${e.message}\n  cd server && AUTH_MODE=off node server.js 로 켜 두세요`); process.exit(1); }
console.log(`서버 ${SERVER} · 쓸 수 있는 모델: ${models.join(', ') || '없음(.env 키 확인)'}`);

const logFile = path.join(OUT, 'log.csv');
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '﻿id,model,facilities,seconds,result\n');
const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
let ok = 0, skip = 0, fail = 0;
for (const j of jobs) {
  const id = j.id || path.basename(j.photo, path.extname(j.photo));
  const photo = path.resolve(base, j.photo); const ext = path.extname(photo).toLowerCase();
  const model = j.model || DEFAULT_MODEL;
  const facilities = (j.facilities || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
  const after = path.join(OUT, `${id}_after.png`);
  if (!fs.existsSync(photo)) { console.log(`✗ ${id}: 사진 없음 ${photo}`); fail++; continue; }
  if (!MIME[ext]) { console.log(`✗ ${id}: 지원하지 않는 형식 ${ext}`); fail++; continue; }
  if (!facilities.length) { console.log(`✗ ${id}: facilities 비어 있음`); fail++; continue; }
  if (fs.existsSync(after)) { console.log(`· ${id}: 이미 있음 — 건너뜀`); skip++; continue; }
  if (models.length && !models.includes(model)) { console.log(`✗ ${id}: 모델 ${model} 은 이 서버에서 못 씀`); fail++; continue; }
  console.log(`${ARGS.go ? '▶' : '○'} ${id}: ${path.basename(photo)} · ${model} · ${facilities.join(' / ')}${j.note ? ' · 고칠 점: ' + j.note : ''}`);
  if (!ARGS.go) continue;
  const dataUrl = `data:${MIME[ext]};base64,` + fs.readFileSync(photo).toString('base64');
  const t0 = Date.now(); let result = '';
  for (let attempt = 0; attempt <= +(ARGS.retry || 1); attempt++) {
    try {
      const r = await fetch(SERVER + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl: dataUrl, facilities, model, note: j.note || '', fromGenerated: false }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.dataUrl) throw new Error(body.error || `HTTP ${r.status}`);
      const m = body.dataUrl.match(/^data:(image\/\w+);base64,(.*)$/s); if (!m) throw new Error('응답 형식 이상');
      fs.writeFileSync(after, Buffer.from(m[2], 'base64'));
      fs.copyFileSync(photo, path.join(OUT, `${id}_before${ext}`));
      result = '성공'; ok++; break;
    } catch (e) { result = '오류: ' + e.message.replace(/\s+/g, ' ').slice(0, 200); if (attempt < +(ARGS.retry || 1)) { console.log(`   재시도 (${e.message.slice(0, 80)})`); await new Promise(r => setTimeout(r, 5000)); } else fail++; }
  }
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`   → ${result} (${sec}s)`);
  fs.appendFileSync(logFile, [id, model, facilities.join('; '), sec, result].map(esc).join(',') + '\n');
}
console.log(`\n${ARGS.go ? '완료' : '시험 실행(실제 호출 없음 — --go 를 붙이면 생성)'}: 성공 ${ok} · 건너뜀 ${skip} · 실패/제외 ${fail} / 전체 ${jobs.length}`);
