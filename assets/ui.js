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

/* ── 진단 서버 호출 (진단·재판독·이미지 생성 공통) ──────────────────
   접속 암호 처리와 오류 안내를 한 곳에서 합니다.
   화면마다 따로 만들면 서로 다르게 동작해 혼란스러워집니다. */
async function auriCallServer(path, payload, retried) {
  const headers = { 'Content-Type': 'application/json' };
  const saved = localStorage.getItem('auri_access_code');
  if (saved) headers['x-access-code'] = saved;

  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
  } catch (e) {
    throw Object.assign(new Error('서버에 연결하지 못했습니다. 인터넷 연결이나 서버 상태를 확인해 주세요.'), { shown: true });
  }

  /* JSON이 아니면 원인을 상태 코드로 구분합니다.
     404 = 주소가 틀림 / 5xx = 서버가 응답을 못 함(오래 걸려 끊긴 경우 포함) */
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (res.status === 404 || location.protocol === 'file:') {
      throw Object.assign(new Error(
        '이 페이지는 진단 서버가 아닌 곳에서 열렸습니다' +
        (location.protocol === 'file:' ? ' (파일 직접 열기)' : ` (${location.origin})`) +
        '. 진단 서버가 실행 중인 주소로 접속해 주세요.'), { shown: true });
    }
    throw Object.assign(new Error(
      `서버가 응답을 마치지 못했습니다 (HTTP ${res.status}). ` +
      'AI 처리에 시간이 오래 걸리면 중간에 연결이 끊길 수 있습니다. 다시 시도해 주세요.'), { shown: true });
  }

  const data = await res.json();

  /* 접속 암호를 쓰는 서버면 한 번만 물어보고 저장합니다 */
  if (res.status === 401 && data.needCode) {
    localStorage.removeItem('auri_access_code');
    if (retried) throw Object.assign(new Error('접속 암호가 올바르지 않습니다.'), { shown: true });
    const code = prompt('AI 기능 접속 암호를 입력해 주세요.');
    if (!code) throw Object.assign(new Error('접속 암호가 필요합니다.'), { shown: true });
    localStorage.setItem('auri_access_code', code.trim());
    return auriCallServer(path, payload, true);
  }

  if (!res.ok) throw Object.assign(new Error(data.error || `서버 오류 (HTTP ${res.status})`), { shown: true });
  return data;
}

/* 9단계 눈금 그리기. 채워진 칸 수가 단계입니다. */
function auriScaleHTML(step) {
  let html = '';
  for (let i = 1; i <= 9; i++) html += `<i class="${i <= step ? 'on' : ''}"></i>`;
  return `<span class="scale">${html}</span>`;
}

/* 연필 아이콘 (수정 버튼용) */
const AURI_ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';

/* 상단 바(로고 + 단계)를 그립니다.
   각 화면에는 <header class="topbar" id="topbar"></header> 만 두면 됩니다.

   ── 로고 바꾸기 ───────────────────────────────────────────────────
   발표 주관 기관에 따라 아래 한 줄만 바꾸면 5개 화면에 모두 반영됩니다.

     AURI 주관    'assets/logo_auri.svg'   가로형 6.46 : 1
     ATELIER KJ   'assets/logo.svg'        정사각  1 : 1

   ⚠ 두 로고는 가로세로비가 크게 달라서, 파일을 바꿀 때는
     assets/theme.css 의 --logo-h(로고 높이)도 함께 맞춰야 합니다.
     AURI 로고는 국문·영문 2단 구성이라 아랫줄이 뭉개지지 않도록
     정사각 로고보다 높게 잡습니다. (현재 32px / 정사각일 때는 22px)

   지정한 파일을 못 찾으면 같은 이름의 .png → 글자 로고 순으로 대체됩니다. */
const AURI_BRAND_LOGO = 'assets/logo_auri.svg';
const AURI_BRAND_TEXT = '건축공간연구원 AURI';
const AURI_BRAND_SUB = '안전사업지구 진단 시뮬레이터';

function auriRenderTopbar() {
  const host = document.getElementById('topbar');
  if (!host) return;

  host.innerHTML =
    '<div class="topbar-inner">' +
      '<a class="brand" href="index.html">' +
        `<img class="brand-logo" src="${AURI_BRAND_LOGO}" alt="${AURI_BRAND_TEXT}">` +
        `<span class="brand-sub">${AURI_BRAND_SUB}</span>` +
      '</a>' +
      '<nav class="steps" id="steps"></nav>' +
    '</div>';

  const logo = host.querySelector('.brand-logo');
  let tried = 0;
  logo.addEventListener('error', function () {
    tried++;
    if (tried === 1) { logo.src = AURI_BRAND_LOGO.replace(/\.svg$/, '.png'); return; }
    const text = document.createElement('span');
    text.className = 'brand-text';
    text.textContent = AURI_BRAND_TEXT;
    logo.replaceWith(text);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  auriRenderTopbar();
  auriRenderSteps();
});
