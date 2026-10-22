/* ════════════════════════════════════════════════════════════════════
   hwpx → _text/<이름>.txt  (2026-10-22)

   build-auri-reports.mjs 가 읽는 글 추출본을 만듭니다. 전에는 PowerShell 로 했던 것을 node 로 옮긴 것입니다.
   규칙은 그대로: </hp:p> → 줄바꿈 · </hp:tc>(셀 끝) → " | " · </hp:tr>(행 끝) → 줄바꿈 · 나머지 태그 제거.
   파일 이름은 hwpx 이름의 공백을 _ 로 바꾼 것 (build-auri-reports 의 hwpxFor 가 이 규칙으로 원본을 다시 찾습니다).

   실행:  node tools/hwpx-to-text.mjs <hwpx 또는 폴더> [...]
         폴더를 주면 그 아래 hwpx 를 전부 처리합니다. 이미 있는 txt 는 덮어씁니다.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib/hwpx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/사전진단 보고서 및 지도 작업본(AURI)/_text');
fs.mkdirSync(OUT, { recursive: true });

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');

export function hwpxText(file) {
  const z = readZip(file);
  const names = Object.keys(z).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)/)[1] - +b.match(/(\d+)/)[1]);
  let out = '';
  for (const n of names) {
    let x = z[n].toString('utf8');
    x = x.replace(/<\/hp:tc>/g, ' | ').replace(/<\/hp:tr>/g, '\n').replace(/<\/hp:p>/g, '\n').replace(/<hp:lineBreak\b[^>]*\/>/g, '\n');
    x = x.replace(/<[^>]+>/g, '');
    out += unesc(x);
  }
  return out;
}

function collect(p, acc = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (e !== '_text') collect(path.join(p, e), acc); }
  else if (/\.hwpx$/i.test(p)) acc.push(p);
  return acc;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).flatMap((a) => collect(path.resolve(a)));
  if (!files.length) { console.error('사용법: node tools/hwpx-to-text.mjs <hwpx 또는 폴더> ...'); process.exit(1); }
  for (const f of files) {
    const name = path.basename(f, path.extname(f)).replace(/\s+/g, '_') + '.txt';
    const t = hwpxText(f);
    fs.writeFileSync(path.join(OUT, name), '﻿' + t);
    console.log(name.padEnd(44), (t.length / 1000).toFixed(1) + 'k자');
  }
}
