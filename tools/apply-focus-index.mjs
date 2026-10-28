/* ════════════════════════════════════════════════════════════════════
   중점 3분야를 지역안전지수 기준으로 통일 (2026-10-22, 이은석 박사 "첫 화면과 리포트의 기준이 다르다")

   첫 화면(index.html)은 지역안전지수 하위 등급 분야(safety-index.json 의 focusByIndex = 자살 + 하위 2)로
   HEA·복합위험지구를 보여 주는데, 리포트·문서·AI 판독 우선 분야·동별 HEA 는 data/stats 의 focusTypes
   (강원대 공간분석 확정 3분야)를 읽고 있었습니다. 41곳 중 38곳이 서로 달라 한 앱 안에서 기준이 섞였습니다.

   이 도구는 data/stats/regions/<지역>.json 과 index.json 의 focusTypes 를 focusByIndex 로 바꿔 씁니다.
   강원대 값은 focusTypesKangwon 에 남깁니다(사전분석 보고서 2장 — AURI 원문 — 는 여전히 이 분야 기준).
   build-stats.mjs 끝에서 자동으로 불리고, 따로도 돌릴 수 있습니다:  node tools/apply-focus-index.mjs

   순서: build-stats → build-safety-index → (이 도구) → build-dong-hea → build-field-survey → hotspots · heatmap --focus
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = { traffic: '교통사고', fire: '화재', crime: '범죄', life: '생활안전', suicide: '자살', infection: '감염병', industrial: '산업재해' };
/* 직접 지정 출처 (focus-override.json 의 source — AURI 중점관리분야, 2026-10-28~) — focusSource 글에 씁니다. '직접 지정' 글자는 verify-stats 가 개수 검사를 풀 때 봅니다 */
const OVR_FILE = path.join(ROOT, 'tools/config/focus-override.json');
const OVR_SOURCE = fs.existsSync(OVR_FILE) ? (JSON.parse(fs.readFileSync(OVR_FILE, 'utf8')).source || '') : '';

export function applyFocusIndex({ quiet = false } = {}) {
  const siPath = path.join(ROOT, 'data/stats/safety-index.json');
  if (!fs.existsSync(siPath)) { console.warn('safety-index.json 없음 — 중점 분야를 바꾸지 않습니다 (node tools/build-safety-index.mjs 먼저)'); return 0; }
  const si = JSON.parse(fs.readFileSync(siPath, 'utf8'));
  const idxPath = path.join(ROOT, 'data/stats/index.json');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  let changed = 0;
  for (const r of idx.regions) {
    const s = si.regions[r.region]; if (!s || !s.focusByIndex) continue;
    const regPath = path.join(ROOT, 'data/stats/regions', `${r.region}.json`);
    if (!fs.existsSync(regPath)) continue;
    const d = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    /* 강원대 값은 처음 한 번만 보관 (두 번 돌려도 지수값으로 덮어쓰지 않게) */
    if (!d.focusTypesKangwon) d.focusTypesKangwon = d.focusTypes;
    if (!r.focusTypesKangwon) r.focusTypesKangwon = r.focusTypes;
    d.focusTypes = s.focusByIndex.map((k) => { const c = d.categories && d.categories[k]; return { key: k, label: LABEL[k] || k, sample: c && c.count ? { n: c.count.inside, pct: c.count.share } : null }; });
    d.focusSource = s.focusSource === 'override'
      ? `직접 지정(${OVR_SOURCE || 'AURI 중점관리분야'} — tools/config/focus-override.json) — data/stats/safety-index.json`
      : '지역안전지수 하위 등급 기준(자살 고정 + 하위 2분야) — data/stats/safety-index.json';
    r.focusTypes = d.focusTypes.map((t) => t.label);
    fs.writeFileSync(regPath, JSON.stringify(d, null, 1));
    changed++;
    const kw = (d.focusTypesKangwon || []).map((t) => t.label).join('·'), nw = r.focusTypes.join('·');
    if (!quiet) console.log(`  ${r.region.padEnd(11)} ${nw.padEnd(16)}${kw !== nw ? ' (강원대 ' + kw + ')' : ''}`);
  }
  const nOvr = idx.regions.filter((r) => si.regions[r.region] && si.regions[r.region].focusSource === 'override').length;
  idx.focusSource = nOvr === idx.regions.length ? `직접 지정 — ${OVR_SOURCE || 'tools/config/focus-override.json'} (tools/apply-focus-index.mjs)`
    : nOvr ? `직접 지정 ${nOvr}곳 + 지역안전지수 하위 등급 기준 ${idx.regions.length - nOvr}곳 (tools/apply-focus-index.mjs)`
    : '지역안전지수 하위 등급 기준 (tools/apply-focus-index.mjs)';
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  if (!quiet) console.log(`→ 중점 분야를 지역안전지수 기준(또는 직접 지정)으로 ${changed}곳 갱신`);
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) applyFocusIndex();
