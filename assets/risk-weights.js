/* ════════════════════════════════════════════════════════════════════
   분야별 중요도 가중치 + 발생 밀도 정규화

   왜 필요한가
   ───────────
   119 신고 건수를 그대로 겹쳐 보면 지도가 거짓말을 합니다.
   생활안전은 3년간 1만 건이 넘고 자살은 수백 건뿐이라, 함께 켜면
   생활안전 점이 화면을 덮어 자살 밀집 구간이 보이지 않습니다.

   여기엔 성격이 다른 두 가지 왜곡이 섞여 있습니다.

     ① 빈도 차이 — 분야마다 신고가 쌓이는 규모 자체가 다르다
     ② 심각도 차이 — 신고 1건이 갖는 무게가 다르다

   ①에 심각도 배수만 곱해서는 풀리지 않습니다. 자살에 10을 곱해도
   수백 × 10 은 여전히 1만보다 작습니다. 그래서 순서를 나눕니다.

     1단계  분야 안에서 0~1로 정규화한다        → 빈도 차이를 없앤다
     2단계  거기에 분야 가중치를 곱한다          → 심각도 차이를 반영한다
     3단계  한 칸의 7분야 값을 더한다            → 종합 위험지수

   이렇게 하면 "생활안전 상위 구간"과 "자살 상위 구간"이 같은 자로
   비교되고, 그 위에 정책적 중요도가 얹힙니다.

   ── 이 파일은 담당자가 고치는 파일입니다 ────────────────────────────
   아래 W 값을 바꾸면 지도 표시와 종합 위험지수가 함께 바뀝니다.
   ════════════════════════════════════════════════════════════════════ */

/* 분야 가중치 — 생활안전 1을 기준으로 한 상대 배수.
   ※ 지금 값은 통계에서 계산한 것이 아니라 정책적 판단입니다.
      "이 분야 신고 1건을 얼마나 무겁게 볼 것인가"를 정한 값이며,
      근거를 함께 적어 두는 이유는 나중에 이 숫자를 방어해야 하기
      때문입니다. 지역안전지수 산식이나 사회재난 피해 통계를 받으면
      그 값으로 교체하는 것이 맞습니다. */
const RISK_WEIGHTS = {
  suicide:    { w: 10, why: '신고 1건이 곧 인명 손실. 옥상 개폐장치·안전펜스 등 물리적 예방 인프라의 효과가 가장 직접적으로 연결되는 분야' },
  fire:       { w:  6, why: '인명과 재산 피해가 동시에 발생하고 주변으로 번짐. 소화전·사이니지 등 생활권 인프라로 대응 가능' },
  crime:      { w:  5, why: '피해 자체에 더해 지역 기피·공동화를 유발. CPTED 시설의 개선 여지가 큼' },
  traffic:    { w:  4, why: '발생 건수 대비 중상·사망 비율이 높고, 보행신호등·핸드레일 등으로 개선 지점이 명확' },
  industrial: { w:  3, why: '중대재해 비중은 높지만 발생 공간이 사업장 내부로 한정되어 생활권 인프라로 줄일 여지가 상대적으로 작음' },
  infection:  { w:  2, why: '확산 경로가 접촉이라 발생 지점의 공간적 귀속성이 약함. 다만 쉘터 등 거점 시설 배치 근거는 됨' },
  life:       { w:  1, why: '기준값. 대부분 경상·단순 구조 신고로 개별 1건의 위험 수준이 가장 낮음' },
};

/* 종합 위험지수를 3구간으로 자를 때 쓰는 색.
   위험도 9단계·처방 규칙표의 경계(0~33 / 34~66 / 67~100)와 같은 값입니다.
   한쪽만 바꾸면 지도와 처방이 어긋나므로 함께 고쳐야 합니다. */
const RISK_BANDS = [
  { upTo: 0.34, color: '#666666', label: '안전' },
  { upTo: 0.67, color: '#000000', label: '주의' },
  { upTo: 1.01, color: '#D83D64', label: '위험' },
];

/* 종합 지수를 지역 안에서 상대 평가할 때 쓰는 기준 분위수.
   0.99 = 그 지역 상위 1% 칸을 만점(위험)으로 봅니다.
   낮추면 위험 판정 구간이 넓어집니다. */
const RISK_TOP_QUANTILE = 0.99;

function auriRiskWeight(key) {
  return RISK_WEIGHTS[key] ? RISK_WEIGHTS[key].w : 0;
}

function auriRiskMaxWeight() {
  return Object.keys(RISK_WEIGHTS).reduce(function (m, k) {
    return Math.max(m, RISK_WEIGHTS[k].w);
  }, 1);
}

/* 정렬된 배열에서 분위수 하나를 꺼냅니다 */
function auriQuantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}

/* ── 1단계: 분야 안에서 0~1로 ─────────────────────────────────────
   한 칸에 10건과 1건의 차이는 "10배 위험"이 아닙니다. 로그를 써서
   건수가 늘어날수록 증가폭이 완만해지게 합니다.
   기준점은 최대값이 아니라 상위 1% 값입니다. 유난히 몰린 한 칸이
   나머지 전부를 0 근처로 눌러 버리는 것을 막기 위해서입니다. */
function auriDensityScale(points) {
  const counts = points.map(function (p) { return p[2]; }).sort(function (a, b) { return a - b; });
  const top = Math.max(2, auriQuantile(counts, RISK_TOP_QUANTILE));
  const denom = Math.log(1 + top);
  return function (n) {
    return Math.min(1, Math.log(1 + n) / denom);
  };
}

/* ── 2단계 + 3단계: 칸별 종합 위험지수 ────────────────────────────
   격자는 모든 분야가 같은 원점·같은 크기로 잘려 있어(convert-gis.js),
   분야가 달라도 같은 칸이면 좌표가 정확히 일치합니다. 그래서 좌표를
   열쇠 삼아 더할 수 있습니다.

   돌려주는 값: [[위도, 경도, 0~1 지수, {분야별 기여도}], ...]
   지수는 그 지역 안에서의 상대 순위입니다. 지역이 다르면 절대
   비교가 되지 않으므로, "이 지자체 안에서 어디부터 볼 것인가"에만
   씁니다. */
function auriCompositeCells(categories) {
  const cells = new Map();

  for (const key in categories) {
    const w = auriRiskWeight(key);
    const set = categories[key];
    if (!w || !set || !set.points.length) continue;

    const d = auriDensityScale(set.points);
    for (let i = 0; i < set.points.length; i++) {
      const p = set.points[i];
      const gk = p[0] + ',' + p[1];
      const add = w * d(p[2]);

      let cell = cells.get(gk);
      if (!cell) { cell = [p[0], p[1], 0, {}]; cells.set(gk, cell); }
      cell[2] += add;
      cell[3][key] = add;
    }
  }

  const arr = Array.from(cells.values());
  const sorted = arr.map(function (c) { return c[2]; }).sort(function (a, b) { return a - b; });
  const top = auriQuantile(sorted, RISK_TOP_QUANTILE) || 1;

  for (let i = 0; i < arr.length; i++) arr[i][2] = Math.min(1, arr[i][2] / top);
  return arr;
}

function auriRiskBand(t) {
  for (let i = 0; i < RISK_BANDS.length; i++) if (t < RISK_BANDS[i].upTo) return RISK_BANDS[i];
  return RISK_BANDS[RISK_BANDS.length - 1];
}

/* 선택한 지점이 속한 칸을 찾습니다 (격자 한 칸 반경 안에서 가장 가까운 칸).
   못 찾으면 null — 그 자리에는 3년간 신고 이력이 없다는 뜻입니다. */
function auriCellAt(cells, lat, lng, cellSize) {
  const deg = ((cellSize || 50) * 0.75) / 111000;   // m → 대략적인 위도 도수
  let best = null, bestD = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const dy = c[0] - lat, dx = (c[1] - lng) * 0.8;
    const d = dy * dy + dx * dx;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best && Math.sqrt(bestD) <= deg ? best : null;
}
