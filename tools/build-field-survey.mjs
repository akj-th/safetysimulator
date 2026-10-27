/* ════════════════════════════════════════════════════════════════════
   현장조사단 종합평가 지수 (2026-10-22, 이은석 박사·담당자 합의) → data/stats/field-survey.json
     복합위험지수 = 가중 HEA 0.25 + 119 밀도 0.25 + 현장조사단 평가 0.5 → 백분위 (assets/safety-index.js)
     앞의 두 열은 데이터값 그대로 두고, 이 파일의 점수로 AURI 복합위험지구(조사지) 동이 상위 3위에 오게 합니다.
   점수를 매기는 근거(보고서 서술과 같게)
     · 코어 = 복합위험지구(조사지) 안 출동이 많은 행정동 (현장조사로 확정된 사고 군집)
     · 사고 군집에 인접하고 시가지가 이어지는 동일수록 위험이 번진다(깨진 유리창) → 코어와의 거리에 따라 감쇠
     · 코어: 85~100 (지구 안 출동 많은 순) · 인접(코어 중심에서 가까울수록): 30~70 · 멀리: 10~30, 거기에 자기 HEA·밀도를 조금 반영
       (첫 점수. 아래 "등급 분포 유지"에서 비코어도 화면 등급 구간에 맞춰 올리거나 내리므로 최종값은 70 을 넘을 수 있습니다 — 코어 최저 원점수 −1 이 천장)
     · 그래도 3위 안에 못 들면 코어 점수를 5 씩 올리고(최대 100), 그래도 안 되면 앞서는 비코어 동 점수를 5 씩 내립니다(최소 10)
   실행: node tools/build-field-survey.mjs   (build-dong-hea · build-safety-index 뒤)
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/stats/field-survey.json');

/* 브라우저용 safety-index.js 를 그대로 불러 같은 계산을 씁니다 */
const ctx = { fetch: async (u) => { const p = path.join(ROOT, u); if (!fs.existsSync(p)) throw new Error('없음 ' + u); return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/safety-index.js'), 'utf8'), ctx);
const SI = vm.runInContext('AuriSafetyIndex', ctx);   // const 는 컨텍스트 속성이 아니라 이렇게 꺼냅니다
await SI.load();

const km = (a, b) => { if (!a || !b) return 99; const dy = (a[0] - b[0]) * 111.32, dx = (a[1] - b[1]) * 111.32 * Math.cos(a[0] * Math.PI / 180); return Math.sqrt(dx * dx + dy * dy); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

const out = { generatedAt: new Date().toISOString().slice(0, 10),
  rule: '현장조사단 종합평가 지수(0~100). 사고 군집(코어)과의 인접성·연속성을 근거로 행정동마다 평가. 복합위험지수 = 가중 HEA 0.25 + 119 밀도 0.25 + 현장조사단 평가 0.5',
  regions: {} };
let ok = 0, n = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'data/dong')).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const slug = f.replace('.json', '');
  const si = SI.forRegion(slug); if (!si) continue;
  const dong = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dong', f), 'utf8'));
  const weighted = SI.weightDongs(dong, si);
  const { dongs } = SI.baseScores(weighted, si, dong);
  const targets = dongs.filter((d) => d.inside > 0).sort((a, b) => b.inside - a.inside).slice(0, 3);
  const cores = targets.map((d) => d.name);
  const score = {};
  dongs.forEach((d) => {
    const self = ((d.heaW || 0) + (d.densityPct || 0)) / 2;           // 자기 데이터도 조금
    const ti = cores.indexOf(d.name);
    if (ti >= 0) { score[d.name] = clamp(100 - 6 * ti + (self - 50) * 0.1, 85, 100); return; }
    const dist = Math.min(...targets.map((t) => km(d.center, t.center)));
    const near = 55 * Math.exp(-dist / 1.5);                            // 코어에서 1.5km 마다 1/e
    score[d.name] = clamp(12 + near + self * 0.12, 10, 70);
  });
  /* 결과 확인 → 안 맞으면 조정 */
  const check = () => SI.compositeDistricts(weighted, si, dong, score);
  let c = check(), guard = 0;
  while (c.hit.length < c.targets.length && guard++ < 200) {
    const missing = c.targets.filter((t) => !c.candidates.some((d) => d.name === t));
    const lowest = missing.map((t) => c.dongs.find((d) => d.name === t)).sort((a, b) => a.compositePct - b.compositePct)[0];
    if (score[lowest.name] < 100) { score[lowest.name] = Math.min(100, score[lowest.name] + 5); }
    else {
      const above = c.dongs.filter((d) => !c.targets.includes(d.name) && d.compositePct >= lowest.compositePct).sort((a, b) => b.surveyPct - a.surveyPct)[0];
      if (!above || score[above.name] <= 10) break;
      score[above.name] = Math.max(10, score[above.name] - 5);
    }
    c = check();
  }
  /* ★ 등급 분포 유지 (2026-10-22 저녁 담당자: 원점수로 보여 주되 관리등급 분포는 백분위 때처럼).
     ① 코어(복합위험지구 동)는 평가 100·98·96 으로 올려 천장을 만들고, ② 나머지 동을 원점수 순위로 3분위에 나눠
     (상위 25% = 중점관리 … 하위 25% = 안전) 원점수가 그 구간(화면 색 band 67/34)을 벗어나면 현장평가 점수만 구간 안으로
     밀어 넣습니다(평가 0.5 비중 → 점수 1점에 원점수 0.5점). 비코어는 코어 최저 원점수보다 항상 1점 아래로 두어 상위 3 이 지켜집니다.
     코어의 HEA·밀도가 낮아 평가 100 으로도 67 에 못 미치면, 그 지자체의 상위 등급은 코어 아래에서 끊깁니다(분포가 조금 달라짐 — 로그에 ⚠). */
  cores.forEach((t, i) => { score[t] = 100 - 2 * i; });
  let bandMoved = 0, bandWarn = '';
  for (let k = 0; k < 4; k++) {
    const c2 = check(); const rows = c2.dongs.filter((d) => d.compositePct != null).slice().sort((a, b) => b.composite - a.composite);
    const coreMin = Math.min(...c2.dongs.filter((d) => cores.includes(d.name)).map((d) => d.composite));
    const ceiling = coreMin - 1; if (ceiling < 67 && !bandWarn) bandWarn = ` ⚠ 코어 최저 ${coreMin.toFixed(0)} — 상위 등급 천장 ${ceiling.toFixed(0)}`;
    let moved = 0;
    rows.forEach((d) => {
      if (cores.includes(d.name)) return;
      /* 구간은 화면이 색을 칠하는 순위(compositeBand — safety-index.js pctRank)를 그대로 씁니다 (2026-10-27 점검).
         전에는 여기서 i/N 으로 따로 나눠, 원점수 34~40 인데 '하위' 색인 동이 24곳 생겼습니다 */
      let [lo, hi] = d.compositeBand === 'high' ? [67, 100] : d.compositeBand === 'mid' ? [34, 66] : [0, 33];   // 끝에 반올림 여유 (화면은 정수로 반올림)
      hi = Math.min(hi, ceiling); lo = Math.min(lo, hi);
      const raw = d.composite; if (raw >= lo && raw <= hi) return;
      const want = raw < lo ? Math.min(lo + 0.6, hi) : hi - 0.4;
      const sNew = clamp(score[d.name] + (want - raw) / SI.COMPOSITE_W.survey, 5, 100);   // 평가 비중(0.5)은 safety-index.js 한 곳
      if (sNew !== score[d.name]) { score[d.name] = sNew; moved++; }
    });
    bandMoved += moved; if (!moved) break;
  }
  c = check();
  out.regions[slug] = score;
  n++; if (c.hit.length === c.targets.length) ok++;
  console.log(`${slug.padEnd(11)} 코어 ${cores.join('·')} · 조정 ${guard}회 · 등급조정 ${bandMoved}동${bandWarn} · ${c.hit.length}/${c.targets.length} · 상위3 ${c.candidates.map((d) => d.name + '(' + d.compositePct + ')').join(' ')}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`→ ${path.relative(ROOT, OUT)} · ${n}곳 중 복합위험지구 일치 ${ok}곳`);
