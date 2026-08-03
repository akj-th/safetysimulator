/* ════════════════════════════════════════════════════════════════════
   공통 기능 — 단계 네비게이션 + 위험도 계산

   5개 화면이 이 파일 하나를 같이 씁니다.
   ════════════════════════════════════════════════════════════════════ */

/* 5단계 정의.
   needs = 그 단계로 넘어가려면 앞 단계에서 만들어져 있어야 하는 데이터.
   없으면 그 단계는 잠깁니다(회색). */
const AURI_STEPS = [
  { n: 1, name: '위치 선택', file: 'index.html',     needs: null },
  { n: 2, name: '진단',      file: 'diagnosis.html', needs: 'auri_picked_location' },
  { n: 3, name: '리포트',    file: 'report.html',    needs: 'auri_diagnosis_results' },
  { n: 4, name: '시각화',    file: 'visualize.html', needs: 'auri_prescriptions' },
  { n: 5, name: '진단서',    file: 'document.html',  needs: 'auri_prescriptions' },
];

/* 점수(0~100) → 9단계 + 안전/주의/위험 3구간

   9단계는 화면에 세밀하게 보여 주기 위한 것이고,
   3구간은 처방 규칙표가 쓰는 값입니다. 둘의 경계는 서로 맞물려 있습니다.
     1~3단계 = 안전 / 4~6단계 = 주의 / 7~9단계 = 위험 */
function auriLevel(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const step = Math.min(9, Math.floor(s / (100 / 9)) + 1);
  const tier = step <= 3 ? 'safe' : step <= 6 ? 'caution' : 'danger';
  return {
    step: step,
    key: 'lv-' + tier,
    label: tier === 'safe' ? '안전' : tier === 'caution' ? '주의' : '위험',
  };
}

/* 9단계 값(1~9) → 점수. 슬라이더로 보정할 때 각 단계의 대표 점수로 되돌립니다. */
function auriStepToScore(step) {
  const s = Math.max(1, Math.min(9, Math.round(Number(step) || 1)));
  return Math.round((s - 0.5) * (100 / 9));
}

/* 상단 단계 네비게이션을 그립니다.
   현재 단계는 <body data-step="2"> 처럼 지정해 둡니다. */
function auriRenderSteps() {
  const host = document.getElementById('steps');
  if (!host) return;

  const current = Number(document.body.dataset.step || 1);

  host.innerHTML = AURI_STEPS.map(function (s) {
    const ready = !s.needs || sessionStorage.getItem(s.needs);
    let cls = 'step';
    if (s.n === current) cls += ' is-current';
    else if (!ready) cls += ' is-locked';
    else if (s.n < current) cls += ' is-done';

    /* 잠긴 단계는 이동할 수 없으므로 버튼이 아니라 그냥 표시만 합니다 */
    if (!ready && s.n !== current) {
      return `<span class="${cls}"><span class="num">${s.n}</span>${s.name}</span>`;
    }
    return `<a class="${cls}" href="${s.file}"><span class="num">${s.n}</span>${s.name}</a>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', auriRenderSteps);
