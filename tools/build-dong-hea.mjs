/* ════════════════════════════════════════════════════════════════════
   동별 HEA 취약도 산출 → data/dong/<지역>.json  (2026-09-15)

   실행:  node build-dong-hea.mjs                 41곳 전체
          node build-dong-hea.mjs bucheon         한 곳만
   (tools 폴더에서 npm run dong-hea)

   ── HEA 세 축 ────────────────────────────────────────────────────
     H 피해대상  "누가 다치는가"   — 연령×성별 편중 (119 출동자료)
     E 환경      "어떤 공간인가"   — 강원대 회귀분석 계수 × 동 평균 시설 밀도·거리 (TIF)
     A 행위·관리 "어떻게 되풀이되나" — 반복 발생 지점 · 야간 비중 · 장소 편중 (119)
     종합        세 축을 지자체 안 백분위로 맞춘 뒤 평균

   ★ 세 축의 점수와 근거는 **따로** 남깁니다. 종합 점수 하나만 보면 그 점수가
     어디서 왔는지 되짚을 수 없어서입니다(감사 추적 — CLAUDE.md 6절).

   ★ 판정 기준이 확정되지 않았습니다. **H·A 는 임시 기준**이고(담당자 결정
     2026-09-15), 아래 "임시 기준" 상수에 모았습니다. 확정 기준이 오면 그
     상수만 바꾸면 됩니다.

   ★ 자료가 없으면 비워 둡니다. 임의의 값으로 채우지 않습니다.
       E — 회귀분석이 없는 34곳        : "자료 없음" (평균값으로 대체하지 않음 — 담당자 결정)
       E — 동 경계 SHP 도착 전         : "경계 자료 대기"
       E — 유의 변수 중 TIF 가 없는 분야: "자료 없음 (미수신 변수)"
       표본이 적은 동·분야             : "표본 부족"

   ── 개인정보 ─────────────────────────────────────────────────────
   결과물에는 동 이름·점수·비율·건수만 남습니다. 지번주소는 반복 지점을
   세는 열쇠로만 쓰고 쓰지 않습니다. 동 위치 표시는 출동 좌표 **평균**이며
   표본이 적은 동(CENTER_MIN_N 미만)은 위치를 남기지 않습니다.
   ════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

import { openIncidents, ATYPE_AXIS, REPEAT_THRESHOLD } from './lib/incidents.mjs';
import { REGIONS, slugFor, CATEGORY_LABEL, CATEGORY_ORDER } from './lib/regions.mjs';
import { readPolygons, readDbf, pointInShape, inBBox } from './lib/shapefile.mjs';
import { zonalMeans } from './lib/zonal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'data/dong');

/* ════════════════════════════════════════════════════════════════════
   바꿀 수 있게 뺀 기준값
   ════════════════════════════════════════════════════════════════════ */

/* ── 동 단위 — 지금은 법정동 (담당자 결정 2026-09-15) ────────────────
   119 원자료의 `긴급_12` 칸이 법정동입니다(채움률 99.9%).
   ▶ 행정동으로 바꾸려면: 행정동 경계 SHP 를 받은 뒤 column 을 null 로 두고
     assign 을 'boundary' 로 바꾸면, 출동 좌표를 경계에 넣어 동을 정합니다
     (행정동 칸이 원자료에 없어서). label 도 '행정동'으로. */
const DONG_UNIT = { label: '법정동', column: '긴급_12', assign: 'column' };

/* ── 동 경계 SHP (2026-09-15 수신) ─────────────────────────────────────
   국토부 법정 읍면동 경계 LSMD_ADM_SECT_UMD — 시도별 폴더, 202606·202608 판.
     칸   EMD_NM 법정동 이름 · COL_ADM_SE 시군구 코드 · EMD_CD 법정동 코드
     좌표 Korea 2000 / Central Belt 2010 = EPSG:5186 (.prj 확인) — TIF·조사지와 같음
     글자 EUC-KR (.cst) — readDbf 'auto' 가 판별
   ★ 지자체 ↔ 시군구 코드를 **표로 적지 않고 출동 지점으로 고릅니다.**
     광주·전남은 옛 코드(202606)와 "전남광주통합특별시"(202608) 두 벌이 함께 와서
     코드가 바뀌었기 때문입니다. 그 지자체 출동 지점이 BOUNDARY_PICK_SHARE 이상
     떨어지는 시군구 묶음만 쓰고, 이름이 겹치는 두 벌은 최신 판을 씁니다.
   ⚠️ .prj 에 'Central Belt 2010' 이 없으면 좌표계가 달라 쓰지 않고 경고합니다. */
const BOUNDARY_DIR = path.join(ROOT, 'data/raw/admin_boundary');
const BOUNDARY_NAME_FIELD = 'EMD_NM';
const BOUNDARY_GROUP_FIELD = 'COL_ADM_SE';
const BOUNDARY_PICK_SHARE = 0.05;           // 출동 지점의 5% 이상이 떨어지는 시군구만 (경계 걸침·오지오코딩 무시)
const BOUNDARY_CRS = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';

/* ── 인구 통계 (2026-09-15 연령별 인구 수신) ─────────────────────────
   H 의 "편중"을 **인구 대비 출동률**끼리 비교합니다.
     그 동 20대 여성 출동 ÷ 그 동 20대 여성 인구   vs   지역 20대 여성 출동 ÷ 지역 20대 여성 인구
   → "20대 여성이 **사는 만큼보다** 이 동에서 출동이 몇 배 많은가".
   ⚠️ "출동 중 20대 여성 비중"(출동 구성비)과는 다른 값입니다. 구성비는 근거로만 함께 남깁니다.

   파일  주민등록 연령별인구현황(행정안전부) 202608 — 행정동 × 10세 구간 × 남녀, EUC-KR
   ★ 행정동 → 법정동 연계표가 없어 **이름으로 맞춥니다** (POPULATION_LINK_RULES).
     심곡1동·심곡2동 → 심곡동 / 돈암제1동 → 돈암동 / 숭의1.3동 → 숭의동 / 고강본동 → 고강동
     경계 파일에 그 법정동 이름이 있을 때만 붙이고, 못 붙인 행정동은 목록으로 남깁니다.
   ⚠️ 한 행정동이 여러 법정동에 걸치면(예: 공주 중학동 → 중동·반죽동 …) 이름으로는 못 나눕니다.
     그런 법정동은 인구가 없어 H 를 **비웁니다**("인구 매칭 불가"). 추정해 나누지 않습니다.
     반대로 이름이 같은 행정동이 옆 법정동 일부를 함께 품으면 인구가 조금 크게 잡힐 수 있습니다.
     → 행안부 행정동·법정동 연계표를 받으면 linkPopulation() 한 곳만 바꾸면 됩니다.
   ⚠️ 출동 위치 기준 집계라 **거주자가 아닌 방문자**의 출동도 들어갑니다(상업지 동은 배수가 커짐). */
const POPULATION_DIR = path.join(ROOT, 'data/raw/population');
const POPULATION_AGE_FILE = /연령별인구현황.*\.csv$/i;
/** 집단 인구가 이보다 적으면 그 집단은 편중 후보에서 뺍니다. 근거: 인구 수십 명 집단은
 *  출동 3건만으로 배수가 10배를 넘어 순위를 지배함 (임시 기준) */
const H_MIN_GROUP_POP = 100;
/** 출동자료 기간(2023~2025) — 인구 1천 명당 연간 출동 표기용 */
const INCIDENT_YEARS = 3;
/** 행정동 이름 → 법정동 이름 후보. 앞에서부터 시도해 경계 파일에 있는 첫 이름을 씁니다 */
const POPULATION_LINK_RULES = [
  (n) => n,
  (n) => n.replace(/제?\d[\d.,·]*동$/, '동'),              // 심곡1동 · 돈암제1동 · 숭의1.3동 → ○○동
  (n) => n.replace(/제?\d[\d.,·]*동$/, '동').replace(/본동$/, '동'), // 고강본동 → 고강동
];

/* ── 임시 기준 (H) ── 확정 기준 오면 교체 ─────────────────────────── */
/** 동의 그 분야에서 연령·성별이 모두 있는 건수가 이보다 적으면 "표본 부족".
 *  근거: 10건 미만이면 한두 건에 구성비가 수십 %p 흔들림 (리포트 MIN_SAMPLE 30 보다 낮춘 것은
 *  동 단위 표본이 원래 작아 30 을 쓰면 대부분 동이 비기 때문) */
const H_MIN_DONG_N = 10;
/** 편중 집단으로 인정할 최소 건수. 근거: 1~2건짜리 집단은 "5배" 같은 우연한 배수가 쉽게 나옴 */
const H_MIN_GROUP_N = 3;
/** 연령 구간 — 리포트와 같은 10년 단위 */
const H_AGE_BANDS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const bandOf = (age) => (age >= 80 ? '80+' : `${Math.floor(age / 10) * 10}-${Math.floor(age / 10) * 10 + 9}`);
const bandLabel = (b) => (b === '80+' ? '80세 이상' : b === '0-9' ? '10세 미만' : `${b.split('-')[0]}대`);

/* ── 임시 기준 (A) ── 확정 기준 오면 교체 ─────────────────────────── */
/** 야간 시간대. 근거: 리포트 현장 확인사항의 야간 구간(stats.js HOUR_CHECKS)과 같게 */
const NIGHT = { from: 22, to: 6 };
/** 야간 비중·장소 편중을 낼 최소 건수 (H 와 같은 이유) */
const A_MIN_DONG_N = 10;
/** 장소 편중에서 뺄 이름 — "기타"가 1위면 어디에 몰렸는지 말해 주지 못함 */
const A_PLACE_EXCLUDE = ['기타'];

/* ── 동 위치 표시 ─────────────────────────────────────────────────── */
/** 경계가 없을 때 점수 글자를 놓을 위치 = 그 동 출동 좌표 평균.
 *  건수가 이보다 적으면 평균이 개별 지점에 가까워 위치를 남기지 않음 */
const CENTER_MIN_N = 10;

/* ── 종합 점수 ───────────────────────────────────────────────────────
   축이 하나뿐인 동(예: 출동 6건이라 H·A 가 "표본 부족"이고 E 만 있는 동)은
   그 한 축이 곧 종합이 되어 오해를 부릅니다. 이보다 적은 축이면 종합을 비웁니다. (임시 기준) */
const TOTAL_MIN_AXES = 2;

/* ── 백분위를 낼 최소 동 수 ───────────────────────────────────────────
   값이 있는 동이 1곳이면 무조건 50, 2곳이면 0 과 100 만 나옵니다. 순위라고 부를 수 없는
   숫자이므로 이보다 적으면 점수를 비우고 "비교 동 부족"으로 적습니다. (임시 기준)
   예) 남해군 — 중점 분야 출동이 10건 넘는 동이 1곳뿐 */
const PERCENTILE_MIN_DONGS = 3;

/* ── 경계선 단순화 ───────────────────────────────────────────────────
   지도·문서에 선으로만 그리므로 원본 꼭짓점이 다 필요 없습니다.
   이 거리(m)보다 작게 꺾이는 점은 지웁니다(더글러스-포커). 점수 계산(E 집계)에는
   **단순화 전 원본 경계**를 씁니다 — 결과 파일의 선 모양에만 적용됩니다. */
const GEOMETRY_TOLERANCE_M = 8;

/* ── 어느 분야로 동 점수를 내는가 ────────────────────────────────────
   'focus' = 강원대 확정 중점 3분야 (리포트·사전진단서가 서술하는 분야와 같게).
   분야별 점수는 7개 모두 byCat 에 남기므로 나중에 바꿔도 다시 계산할 필요가 없습니다. */
const HEA_CATEGORY_SCOPE = 'focus';

/* ════════════════════════════════════════════════════════════════════
   E(환경) — 강원대 회귀분석 × TIF
   ════════════════════════════════════════════════════════════════════ */

/* 회귀분석 결과 — 지역 전체 모형을 씁니다 (담당자 결정: 동 점수는 지자체 전체를 다루므로) */
const PHYSICAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/physical.json'), 'utf8'));
const REGRESSION_SCOPE = 'region';

const TIF_DIR = path.join(ROOT, 'data/raw/density_0909');
/* 회귀 변수 약어 → TIF 폴더·파일 꼬리.
   ⚠️ 이름이 조금씩 다릅니다(DBF 10자 잘림 등) — 확인해 손으로 맞춘 표입니다.
     School_z_d ↔ School_z_dist · LULC_F_dis ↔ LULC_F_dist · FAC_MID_de ↔ FAC_MID_den
     ACC_DEN ↔ ACC_den_KDE · 박물관·미술관 거리 파일은 약어 없이 <지역>_dist.tif
   ⚠️ CULT_dist("전국 문화·여가+체육시설 거리")는 값이 0~0.027 로 거리가 아닌 밀도처럼
     보입니다 — 강원대 확인 중. 확인 전까지 받은 그대로 씁니다(부호는 계수가 정함). */
const TIF_LAYERS = {
  ACC_DEN: ['건물용도-숙박업소 밀도', 'ACC_den_KDE'],
  BDU_COM: ['건물용도-판매시설 밀도', 'BDU_COM_KDE'],
  REL_DEN: ['건축용도-종교시설 밀도', 'REL_DEN_KDE'],
  Perf_dist: ['공연장 거리', 'Perf_dist'],
  CONST_den: ['공장 및 건설현장 밀도', 'CONST_den'],
  FAC_L_den: ['공장규모_대기업 밀도', 'FAC_L_den'],
  FAC_S_den: ['공장규모_소기업 밀도', 'FAC_S_den'],
  FAC_MID_de: ['공장규모_중견기업 밀도', 'FAC_MID_den'],
  FAC_M_den: ['공장규모_중기업 밀도', 'FAC_M_den'],
  BRIDG_dist: ['교량 거리', 'BRIDG_dist'],
  INTSCT_den: ['교차로 밀도', 'INTSCT_den'],
  BIG_DEN: ['대규모 점포 밀도', 'BIG_DEN'],
  SUB_dist: ['도시철도역 거리', 'SUB_dist'],
  SUB_den: ['도시철도역 밀도', 'SUB_den'],
  MUSE_dist: ['박물관·미술관 거리', 'dist'],
  BUS_dist: ['버스정류장 거리', 'BUS_dist'],
  BUS_den: ['버스정류장 밀도', 'BUS_den'],
  CLINIC_den: ['병원 밀도', 'CLINIC_den'],
  SWF_dist: ['사회복지시설 거리', 'SWF_dist'],
  SWF_den: ['사회복지시설 밀도', 'SWF_den'],
  School_z_d: ['어린이보호구역 거리', 'School_z_dist'],
  movie_dist: ['영화관 거리', 'movie_dist'],
  BAR_den: ['유흥주점 밀도', 'BAR_den'],
  REST_den: ['일반음식점 밀도', 'REST_den'],
  CULT_dist: ['전국 문화·여가 + 체육시설 거리', 'CULT_dist'],
  LULC_F_dis: ['토지피복-산림 거리', 'LULC_F_dist'],
  LULC_W_dis: ['토지피복-수역 거리', 'LULC_W_dist'],
  school_den: ['학교 밀도', 'school_den'],
};

/* 사전진단서 HEA 표의 E 칸 묶음 — 노후도 · 도로 · 시설밀도.
   회귀 변수를 성격대로 나눈 것입니다. 여기 없는 변수는 모두 "시설밀도"로 갑니다.
   ⚠️ 노후도 변수는 TIF 가 하나도 없고, 도로는 교차로 밀도 하나뿐입니다(미수신 32종). */
const E_GROUPS = {
  old: { label: '노후도', vars: ['BD_OLD_R', 'FLOOR_AVG', 'ST_BL_AR', 'ST_CON_AR', 'ST_W_AR', 'Facto_0', 'Facto_10', 'Facto_20', 'Facto_YEAR'] },
  road: { label: '도로', vars: ['ROAD_1', 'ROAD_1_P', 'ROAD_2', 'ROAD_2_P', 'ROAD_3', 'ROAD_3_P', 'ROAD_4', 'ROAD_4_P', 'ROAD_ALL', 'ALLEY', 'INTSCT_den', 'MAXSPD_AVG', 'SLOPE'] },
  facility: { label: '시설밀도', vars: null },
};
const groupOf = (v) => (E_GROUPS.old.vars.includes(v) ? 'old' : E_GROUPS.road.vars.includes(v) ? 'road' : 'facility');

/* ════════════════════════════════════════════════════════════════════
   도우미
   ════════════════════════════════════════════════════════════════════ */

const r1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(1)));
const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2)));
const r3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3)));
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const mean = (arr) => { const a = arr.filter((v) => v !== null && v !== undefined && Number.isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };

/** 선 단순화 (더글러스-포커). pts: [[x,y]…] 미터 좌표 */
function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  /* 닫힌 고리(시작점 = 끝점)는 첫 선분 길이가 0 이라 그대로는 못 줄입니다.
     시작점에서 가장 먼 점에서 둘로 나눠 각각 줄인 뒤 잇습니다. */
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  if (sx === ex && sy === ey) {
    let m = 1, md = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i][0] - sx, pts[i][1] - sy);
      if (d > md) { md = d; m = i; }
    }
    const a = simplifyOpen(pts.slice(0, m + 1), tol);
    const b = simplifyOpen(pts.slice(m), tol);
    const out = a.concat(b.slice(1));
    return out.length >= 4 ? out : pts;
  }
  return simplifyOpen(pts, tol);
}
function simplifyOpen(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0 && fd > tol) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 지자체 안 백분위(0~100). 같은 값은 같은 점수(중간 순위). 값이 없는 동은 빠짐 */
function percentile(map) {
  const entries = Object.entries(map).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v));
  const out = {};
  const n = entries.length;
  if (n < PERCENTILE_MIN_DONGS) return out;
  const vals = entries.map(([, v]) => v).sort((a, b) => a - b);
  for (const [k, v] of entries) {
    let lo = 0; while (lo < n && vals[lo] < v) lo++;
    let hi = lo; while (hi < n && vals[hi] === v) hi++;
    const rank = (lo + hi - 1) / 2;                  // 동점이면 가운데 순위
    out[k] = Math.round(rank / (n - 1) * 100);
  }
  return out;
}

/* ── 인구 통계 (2026-09-15 수신) — **H 에는 아직 쓰지 않습니다** ─────────
   202608 주민등록인구및세대현황_월간.csv 를 받았으나 두 가지가 맞지 않습니다.
     ① 단위가 **행정동**입니다(심곡1동·심곡2동…). 우리 동은 법정동(심곡동)이고
        행정동 경계는 법정동과 일치하지 않아 이름으로 합칠 수 없습니다.
     ② **총인구·남녀 인구만** 있고 연령별 인구가 없습니다. H 는 연령×성별
        집단의 발생률을 비교해야 해서 연령이 없으면 계산할 수 없습니다.
   그래서 결과 파일에 "받았으나 적용 불가"와 이유를 적고 출동자료 기준을 유지합니다.
   ▶ 연령별 · 법정동(또는 행정동 경계와 함께) 인구가 오면 이 함수에서 읽어
     H 편중 계산을 발생률 비교로 바꾸면 됩니다. */
function loadPopulation() {
  const none = { status: 'none', note: '연령별 인구 통계 없음 — H 는 출동자료 구성비 기준(인구 대비 아님)' };
  if (!fs.existsSync(POPULATION_DIR)) return none;
  const file = fs.readdirSync(POPULATION_DIR).find((f) => POPULATION_AGE_FILE.test(f));
  if (!file) return none;
  const buf = fs.readFileSync(path.join(POPULATION_DIR, file));
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const cells = (l) => l.replace(/^﻿/, '').replace(/^"|"$/g, '').split('","').map((c) => c.trim());
  const head = cells(lines[0]);
  /* "2026년08월_남_20~29세" → { sex:'남', band:'20-29' } — 80세 이상은 80~89·90~99·100세 이상을 합칩니다 */
  const cols = [];
  head.forEach((h, i) => {
    const m = /_(남|여)_(\d+)~\d+세$/.exec(h) || /_(남|여)_(100)세 이상$/.exec(h);
    if (!m) return;
    const lo = Number(m[2]);
    cols.push({ i, sex: m[1], band: lo >= 80 ? '80+' : `${lo}-${lo + 9}` });
  });
  if (cols.length < 18) return { ...none, note: `${file} 머리글에서 남녀·연령 칸을 찾지 못함 — H 는 출동자료 구성비 기준` };
  const rows = [];
  for (const l of lines.slice(1)) {
    const c = cells(l);
    const m = /^(.*?)\s*\((\d{10})\)$/.exec(c[0]);
    if (!m || m[2].slice(5) === '00000') continue;       // 시도·시군구·구 합계 줄은 건너뜀 (행정동 줄만)
    const pop = {};
    for (const col of cols) {
      const k = `${col.band}|${col.sex}`;
      pop[k] = (pop[k] || 0) + (Number(c[col.i].replace(/,/g, '')) || 0);
    }
    rows.push({ code: m[2], name: m[1].split(/\s+/).pop(), pop });
  }
  return {
    status: 'ok', files: [file], rows,
    note: `주민등록 연령별 인구(${file.slice(0, 6)}, 행정동) — 행정동 이름을 법정동에 맞춰 인구 대비 출동률로 H 산출`,
  };
}

/** 한 지자체의 행정동 인구를 법정동으로 모읍니다 (이름 대응). 경계가 없으면 null */
function linkPopulation(boundary) {
  if (population.status !== 'ok' || !boundary) return null;
  const codes = boundary.sggCodes;
  /* 시 코드(끝자리 0)는 그 아래 일반구(41192·41194…)까지 포함 */
  const inRegion = (code) => codes.some((c) => code.startsWith(c) || (c.endsWith('0') && code.slice(0, 4) === c.slice(0, 4)));
  const names = new Set(Object.keys(boundary.byName));
  const region = {}, byDong = {}, links = {}, unmatched = [];
  let adminTotal = 0, adminMatched = 0, popTotal = 0, popMatched = 0;
  const add = (to, pop) => { for (const [k, v] of Object.entries(pop)) to[k] = (to[k] || 0) + v; };
  for (const row of population.rows) {
    if (!inRegion(row.code)) continue;
    const total = Object.values(row.pop).reduce((a, b) => a + b, 0);
    adminTotal++; popTotal += total;
    add(region, row.pop);
    const hit = POPULATION_LINK_RULES.map((f) => f(row.name)).find((n) => names.has(n));
    if (!hit) { unmatched.push({ name: row.name, pop: total }); continue; }
    adminMatched++; popMatched += total;
    add((byDong[hit] ||= {}), row.pop);
    (links[hit] ||= []).push(row.name);
  }
  if (!adminTotal) return null;
  return {
    region, byDong, links, unmatched,
    summary: { adminTotal, adminMatched, dongsWithPop: Object.keys(byDong).length, dongsTotal: names.size, popShare: r1(popMatched / popTotal * 100) },
  };
}
const popOf = (P, keys) => keys.reduce((s, k) => s + (P[k] || 0), 0);
const sumPop = (P) => Object.values(P).reduce((a, b) => a + b, 0);

/* 경계 파일 전체를 한 번만 읽어 시군구 묶음으로 정리합니다 */
let _boundaryGroups = null;
function boundaryGroups() {
  if (_boundaryGroups) return _boundaryGroups;
  _boundaryGroups = [];
  if (!fs.existsSync(BOUNDARY_DIR)) return _boundaryGroups;
  const shps = [];
  for (const d of fs.readdirSync(BOUNDARY_DIR)) {
    const full = path.join(BOUNDARY_DIR, d);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) if (/\.shp$/i.test(f)) shps.push(path.join(full, f));
  }
  for (const shp of shps) {
    const prj = shp.replace(/\.shp$/i, '.prj');
    if (!fs.existsSync(prj) || !/Central Belt 2010/.test(fs.readFileSync(prj, 'utf8'))) {
      console.warn(`  ⚠ ${path.basename(shp)} 좌표계가 EPSG:5186 이 아니거나 .prj 가 없어 건너뜀`);
      continue;
    }
    const version = (/_(\d{6})\.shp$/i.exec(shp) || [])[1] || '000000';
    const shapes = readPolygons(shp);
    const attrs = readDbf(shp.replace(/\.shp$/i, '.dbf'), { encoding: 'auto' });
    const by = {};
    shapes.forEach((sh, i) => {
      const a = attrs[i] || {};
      const code = String(a[BOUNDARY_GROUP_FIELD] || '').trim();
      const name = String(a[BOUNDARY_NAME_FIELD] || '').trim();
      if (!code || !name) return;
      const g = (by[code] ||= { code, file: path.basename(shp), version, byName: {}, bbox: [Infinity, Infinity, -Infinity, -Infinity] });
      (g.byName[name] ||= []).push(sh);
      g.bbox = [Math.min(g.bbox[0], sh.bbox[0]), Math.min(g.bbox[1], sh.bbox[1]), Math.max(g.bbox[2], sh.bbox[2]), Math.max(g.bbox[3], sh.bbox[3])];
    });
    _boundaryGroups.push(...Object.values(by));
  }
  return _boundaryGroups;
}

/** 이 지자체 출동 지점(5186 좌표)이 떨어지는 시군구 묶음을 골라 { 동이름: [shape…] } 로 */
function loadBoundary(slug, samplePts) {
  const groups = boundaryGroups();
  if (!groups.length || !samplePts.length) return null;
  const hits = [];
  for (const g of groups) {
    let c = 0;
    for (const [x, y] of samplePts) {
      if (x < g.bbox[0] || x > g.bbox[2] || y < g.bbox[1] || y > g.bbox[3]) continue;
      if (Object.values(g.byName).some((shs) => shs.some((sh) => inBBox(x, y, sh.bbox) && pointInShape(x, y, sh)))) c++;
    }
    if (c / samplePts.length >= BOUNDARY_PICK_SHARE) hits.push({ g, share: c / samplePts.length });
  }
  if (!hits.length) return null;
  /* 같은 곳을 담은 두 벌(옛 코드·새 코드)은 최신 판만 — 이름이 80% 이상 겹치면 같은 곳으로 봄 */
  hits.sort((a, b) => b.g.version.localeCompare(a.g.version) || b.share - a.share);
  const picked = [];
  for (const h of hits) {
    const names = Object.keys(h.g.byName);
    const dup = picked.some((p) => names.filter((n) => p.g.byName[n]).length >= names.length * 0.8);
    if (!dup) picked.push(h);
  }
  const byName = {};
  for (const { g } of picked) for (const [n, shs] of Object.entries(g.byName)) (byName[n] ||= []).push(...shs);
  return {
    status: 'ok',
    files: [...new Set(picked.map((p) => p.g.file))],
    sggCodes: picked.map((p) => p.g.code),
    share: picked.map((p) => Number(p.share.toFixed(3))),
    byName,
  };
}

/* ════════════════════════════════════════════════════════════════════
   ① 출동자료 모으기 — 지역 → 동 → 분야
   ════════════════════════════════════════════════════════════════════ */

const onlyRegion = process.argv.slice(2).find((a) => !a.startsWith('--'));
const toLatLng = proj4(BOUNDARY_CRS, 'WGS84');
const toGrid = proj4('WGS84', BOUNDARY_CRS);

function newBag() {
  return {
    n: 0,
    ageSexN: 0, ageSex: {},          // "20-29|여" → 건수 (연령·성별 모두 있는 것)
    ageN: 0, age: {}, a65: 0, u19: 0,
    sexN: 0, sex: {},
    hourN: 0, night: 0,
    placeN: 0, place: {},
    addr: new Map(),
    lat: 0, lng: 0, ll: 0,
  };
}

const store = {};                     // slug → { dongs: {name: {cat: bag}}, region: {cat: bag} }
console.log('119 출동자료를 읽습니다…');
for (const cat of CATEGORY_ORDER) {
  const csv = openIncidents(fs, ROOT, cat);
  if (csv.note) console.log(`  · ${csv.note}`);
  const C = {
    sido: csv.col('긴급구'), sgg: csv.col('긴급_1'), dong: DONG_UNIT.column ? csv.col(DONG_UNIT.column) : -1,
    age: csv.col('환자연'), sex: csv.col('환자성'), time: csv.col('신고시'),
    place: csv.col('발생장'), x: csv.col('X'), y: csv.col('Y'), addr: csv.col('지번주'),
  };
  /* 장소 편중을 어디서 읽는가 — 문장·확인사항(stats.js placeTop)과 같은 규칙 */
  const placeFromAtype = csv.atypeOk && ATYPE_AXIS[cat] === 'place';

  let used = 0;
  for (let i = 0; i < csv.rows.length; i++) {
    const r = csv.rows[i];
    const lng = parseFloat(r[C.x]), lat = parseFloat(r[C.y]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const slug = slugFor(r[C.sido], r[C.sgg], lng, lat);
    if (!slug || (onlyRegion && slug !== onlyRegion)) continue;
    const dong = (C.dong >= 0 ? String(r[C.dong] || '').trim() : '') || '(미상)';

    const s = (store[slug] ||= { dongs: {}, region: {}, pts: [] });
    /* 경계 묶음을 고를 표본 — 50건에 1건꼴로 좌표를 남깁니다 (결과 파일에는 쓰지 않음) */
    if (s.pts.length < 2000 && (used % 50 === 0 || s.pts.length < 40)) s.pts.push(toGrid.forward([lng, lat]));
    const bags = [((s.dongs[dong] ||= {})[cat] ||= newBag()), (s.region[cat] ||= newBag())];

    const ageRaw = parseInt(r[C.age], 10);
    const age = Number.isInteger(ageRaw) && ageRaw >= 0 && ageRaw < 130 ? ageRaw : null;
    const sexRaw = String(r[C.sex] || '').trim();
    const sex = sexRaw === '남' || sexRaw === '여' ? sexRaw : null;
    const hour = parseInt(String(r[C.time] || '').slice(0, 2), 10);
    const place = placeFromAtype ? csv.atype(i) : String(r[C.place] || '').trim();
    const addr = String(r[C.addr] || '').replace(/\s+/g, ' ').trim();

    for (const b of bags) {
      b.n++;
      if (age !== null) {
        b.ageN++; bump(b.age, bandOf(age));
        if (age >= 65) b.a65++;
        if (age <= 19) b.u19++;
      }
      if (sex) { b.sexN++; bump(b.sex, sex); }
      if (age !== null && sex) { b.ageSexN++; bump(b.ageSex, `${bandOf(age)}|${sex}`); }
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
        b.hourN++;
        if (hour >= NIGHT.from || hour < NIGHT.to) b.night++;
      }
      if (place) { b.placeN++; bump(b.place, place); }
      if (addr) b.addr.set(addr, (b.addr.get(addr) || 0) + 1);
    }
    const d = bags[0];
    d.lat += lat; d.lng += lng; d.ll++;
    used++;
  }
  console.log(`  ${CATEGORY_LABEL[cat].padEnd(5)} ${used.toLocaleString()}건`);
}

/* ════════════════════════════════════════════════════════════════════
   ② 지역마다 점수 계산
   ════════════════════════════════════════════════════════════════════ */

fs.mkdirSync(OUT, { recursive: true });
const indexOut = [];
const population = loadPopulation();
console.log(`\n인구 통계: ${population.note}`);
console.log('동 경계를 읽습니다…');
console.log(`  시군구 묶음 ${boundaryGroups().length}개`);

for (const [slug, meta] of Object.entries(REGIONS)) {
  if (onlyRegion && slug !== onlyRegion) continue;
  const s = store[slug];
  if (!s) { console.warn(`  ⚠ ${slug}: 출동자료 없음`); continue; }

  const statsPath = path.join(ROOT, 'data/stats/regions', `${slug}.json`);
  const stats = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : null;
  const focus = (stats && stats.focusTypes ? stats.focusTypes.map((t) => t.key).filter(Boolean) : []);
  const heaCats = HEA_CATEGORY_SCOPE === 'focus' && focus.length ? focus : CATEGORY_ORDER;

  const boundary = loadBoundary(slug, s.pts);
  const dongNames = Object.keys(s.dongs).filter((d) => d !== '(미상)').sort();
  /* 출동자료의 동 이름이 경계에 없는 경우 — 이름 표기가 다르거나 경계 밖 */
  const unmatched = boundary ? dongNames.filter((d) => !boundary.byName[d]) : [];
  /* 행정동 인구 → 법정동 (이름 대응). null 이면 H 는 출동 구성비 기준 */
  const link = linkPopulation(boundary);

  /* ── H · A 분야별 원점수 ──────────────────────────────────────── */
  const raw = {};                     // cat → indicator → {dong: value}
  const detail = {};                  // dong → cat → 근거
  for (const cat of CATEGORY_ORDER) {
    const R = s.region[cat];
    if (!R) continue;
    const ind = raw[cat] = { hGroup: {}, hAge: {}, hSex: {}, aRepeat: {}, aNight: {}, aPlace: {} };
    const thr = REPEAT_THRESHOLD[cat] || 3;

    for (const dong of dongNames) {
      const D = s.dongs[dong][cat];
      if (!D) continue;
      const det = ((detail[dong] ||= {})[cat] = { n: D.n });

      /* H — 연령×성별 중 지역 대비 가장 몰린 집단.
         인구가 이어진 동: 인구 대비 출동률 배수 (basis 'population')
         인구 자료 자체가 없는 지자체: 출동 구성비 배수 (basis 'composition')
         인구 자료는 있는데 이 법정동에 붙은 행정동이 없으면: 비움 ("인구 매칭 불가") */
      const P = link ? link.byDong[dong] : null;
      const basis = link ? (P ? 'population' : 'no-match') : 'composition';
      const PT = P ? sumPop(P) : 0;
      const sexLabel = (x) => (x === '남' ? '남성' : '여성');
      /* k 집단 하나의 배수와 근거. popKeys(k) = 그 집단에 해당하는 인구 칸들 */
      const measure = (cnt, dN, rCnt, rN, popKeys) => {
        if (basis === 'population') {
          const pd = popOf(P, popKeys), pr = popOf(link.region, popKeys);
          if (pd < H_MIN_GROUP_POP || !pr) return null;
          return {
            ratio: (cnt / pd) / (rCnt / pr),
            pop: pd,
            rate: r2(cnt / pd * 1000 / INCIDENT_YEARS),          // 인구 1천 명당 연간 출동
            regionRate: r2(rCnt / pr * 1000 / INCIDENT_YEARS),
            popShare: r1(pd / PT * 100),                          // 그 동 거주 인구 중 비중
            incShare: r1(cnt / dN * 100),                         // 그 동 출동 중 비중
          };
        }
        return { ratio: (cnt / dN) / (rCnt / rN), incShare: r1(cnt / dN * 100), regionIncShare: r1(rCnt / rN * 100) };
      };
      const bestOf = (dMap, dN, rMap, rN, popKeysOf) => {
        let best = null;
        for (const [k, cnt] of Object.entries(dMap)) {
          if (cnt < H_MIN_GROUP_N || !rMap[k]) continue;
          const m = measure(cnt, dN, rMap[k], rN, popKeysOf(k));
          if (m && (!best || m.ratio > best.ratio)) best = { k, cnt, ...m };
        }
        return best;
      };
      const out = (b, label) => { const { k, cnt, ratio, ...rest } = b; return { label, ratio: r2(ratio), n: cnt, basis, ...rest }; };
      const BANDS_OF_SEX = (x) => H_AGE_BANDS.map((b) => `${b}|${x}`);

      if (D.ageSexN < H_MIN_DONG_N || !R.ageSexN) det.hGroup = { status: '표본 부족' };
      else if (basis === 'no-match') det.hGroup = { status: '인구 매칭 불가' };
      else {
        const best = bestOf(D.ageSex, D.ageSexN, R.ageSex, R.ageSexN, (g) => [g]);
        if (best) {
          const [band, sex] = best.k.split('|');
          ind.hGroup[dong] = best.ratio;
          det.hGroup = out(best, `${bandLabel(band)} ${sexLabel(sex)}`);
        } else det.hGroup = { status: basis === 'population' ? `편중 집단 없음 (집단별 ${H_MIN_GROUP_N}건·인구 ${H_MIN_GROUP_POP}명 미만)` : `편중 집단 없음 (집단별 ${H_MIN_GROUP_N}건 미만)` };
      }
      /* 출동 구성비 배수 — 인구 기준으로 계산해도 "출동 중 비중"을 근거로 함께 남김 */
      if (D.ageSexN >= H_MIN_DONG_N && R.ageSexN && basis !== 'composition') {
        let comp = null;
        for (const [g, cnt] of Object.entries(D.ageSex)) {
          if (cnt < H_MIN_GROUP_N || !R.ageSex[g]) continue;
          const ratio = (cnt / D.ageSexN) / (R.ageSex[g] / R.ageSexN);
          if (!comp || ratio > comp.ratio) comp = { g, ratio, cnt };
        }
        if (comp) {
          const [band, sex] = comp.g.split('|');
          det.hGroupComp = { label: `${bandLabel(band)} ${sexLabel(sex)}`, ratio: r2(comp.ratio), n: comp.cnt,
            incShare: r1(comp.cnt / D.ageSexN * 100), regionIncShare: r1(R.ageSex[comp.g] / R.ageSexN * 100) };
        }
      }

      if (D.ageN >= H_MIN_DONG_N && R.ageN) {
        if (basis !== 'no-match') {
          const best = bestOf(D.age, D.ageN, R.age, R.ageN, (b) => [`${b}|남`, `${b}|여`]);
          if (best) { ind.hAge[dong] = best.ratio; det.hAge = out(best, bandLabel(best.k)); }
        }
        det.share65 = r1(D.a65 / D.ageN * 100); det.region65 = r1(R.a65 / R.ageN * 100);
        det.share19 = r1(D.u19 / D.ageN * 100); det.region19 = r1(R.u19 / R.ageN * 100);
      }
      if (D.sexN >= H_MIN_DONG_N && R.sexN && basis !== 'no-match') {
        const best = bestOf(D.sex, D.sexN, R.sex, R.sexN, (x) => BANDS_OF_SEX(x));
        if (best) { ind.hSex[dong] = best.ratio; det.hSex = out(best, sexLabel(best.k)); }
      }

      /* A — 반복 발생 지점 수 (그 동 안에서 같은 지번주소가 임계값 이상).
         출동이 몇 건 안 되는 동은 "0곳"이 당연히 나와 하위로 깔리므로 야간·장소와 같은 최소 건수를 둡니다 */
      if (D.n >= A_MIN_DONG_N) {
        let spots = 0;
        for (const c of D.addr.values()) if (c >= thr) spots++;
        ind.aRepeat[dong] = spots;
        det.repeat = { spots, threshold: thr };
      } else det.repeat = { status: '표본 부족', threshold: thr };

      /* A — 야간 비중 */
      if (D.hourN >= A_MIN_DONG_N) {
        const share = D.night / D.hourN * 100;
        ind.aNight[dong] = share;
        det.night = { share: r1(share), region: R.hourN ? r1(R.night / R.hourN * 100) : null };
      } else det.night = { status: '표본 부족' };

      /* A — 장소 편중: 1위 장소("기타" 제외)의 비중 */
      if (D.placeN >= A_MIN_DONG_N) {
        const top = Object.entries(D.place).filter(([k]) => !A_PLACE_EXCLUDE.includes(k)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
        if (top) {
          const share = top[1] / D.placeN * 100;
          ind.aPlace[dong] = share;
          det.place = { name: top[0], share: r1(share), source: ATYPE_AXIS[cat] === 'place' ? '강원대 분류' : '119 발생장' };
        }
      } else det.place = { status: '표본 부족' };
    }
  }

  /* ── E 분야별 원점수 ──────────────────────────────────────────── */
  const reg = PHYSICAL.regions[slug];
  const eCoverage = {};
  const eRaw = {};                    // cat → { total:{dong:v}, old:{}, road:{}, facility:{} }
  const eParts = {};                  // dong → cat → [{v,name,beta,z}]
  const zCache = {};                  // 변수 → { dong: z }
  for (const cat of CATEGORY_ORDER) {
    const list = reg && reg[REGRESSION_SCOPE] ? (reg[REGRESSION_SCOPE][cat] || []) : null;
    if (!reg) { eCoverage[cat] = { status: 'no-regression' }; continue; }
    const vars = (list || []).map((it) => ({
      v: it.v, name: PHYSICAL.vars[it.v] || it.v, beta: Math.log(it.irr), pct: it.pct, group: groupOf(it.v),
      tif: !!TIF_LAYERS[it.v] && fs.existsSync(path.join(TIF_DIR, TIF_LAYERS[it.v][0], `${slug}_${TIF_LAYERS[it.v][1]}.tif`)),
    }));
    const have = vars.filter((x) => x.tif);
    eCoverage[cat] = {
      status: !vars.length ? 'no-significant' : !have.length ? 'no-tif' : !boundary ? 'no-boundary' : 'ok',
      have: have.length, total: vars.length,
      vars: vars.map((x) => ({ v: x.v, name: x.name, pct: x.pct, group: x.group, tif: x.tif })),
    };
    if (eCoverage[cat].status !== 'ok') continue;

    for (const x of have) {
      if (!zCache[x.v]) {
        const file = path.join(TIF_DIR, TIF_LAYERS[x.v][0], `${slug}_${TIF_LAYERS[x.v][1]}.tif`);
        const zones = Object.entries(boundary.byName).map(([id, shapes]) => ({ id, shapes }));
        const zs = zonalMeans(file, zones);
        const z = {};
        for (const [id, o] of Object.entries(zs.zones)) {
          z[id] = o.mean !== null && zs.all.sd ? (o.mean - zs.all.mean) / zs.all.sd : null;
        }
        zCache[x.v] = z;
      }
    }
    const e = eRaw[cat] = { total: {}, old: {}, road: {}, facility: {} };
    for (const dong of Object.keys(boundary.byName)) {
      let tot = 0, any = false; const g = { old: null, road: null, facility: null }; const parts = [];
      for (const x of have) {
        const z = zCache[x.v][dong];
        if (z === null || z === undefined) continue;
        const c = x.beta * z;
        tot += c; any = true; g[x.group] = (g[x.group] || 0) + c;
        parts.push({ v: x.v, name: x.name, beta: r3(x.beta), z: r2(z), contrib: r3(c) });
      }
      if (!any) continue;
      e.total[dong] = tot;
      for (const k of Object.keys(g)) if (g[k] !== null) e[k][dong] = g[k];
      ((eParts[dong] ||= {})[cat] = parts);
    }
  }

  /* ── 백분위 → 분야별 축 점수 → 동 축 점수 → 종합 ───────────────── */
  const pct = {};                     // cat → indicator → {dong: 0~100}
  for (const cat of Object.keys(raw)) {
    pct[cat] = {};
    for (const [k, m] of Object.entries(raw[cat])) pct[cat][k] = percentile(m);
    if (eRaw[cat]) for (const [k, m] of Object.entries(eRaw[cat])) pct[cat][`e_${k}`] = percentile(m);
  }

  /* 경계가 있으면 경계의 동 + 경계에 없지만 출동이 충분한 이름(표기 차이 확인용).
     "부천시"처럼 동 칸에 잘못 적힌 한두 건짜리 이름은 뺍니다 (unmatched 목록에는 남김) */
  const countOf = (d) => (s.dongs[d] ? Object.values(s.dongs[d]).reduce((a, b) => a + b.n, 0) : 0);
  const allDongs = boundary
    ? [...new Set([...Object.keys(boundary.byName), ...unmatched.filter((d) => countOf(d) >= CENTER_MIN_N)])].sort()
    : dongNames;
  const axisRaw = { H: {}, E: {}, A: {} };
  const indRaw = { hAge: {}, hSex: {}, eOld: {}, eRoad: {}, eFacility: {}, aRepeat: {}, aNight: {}, aPlace: {} };
  const perDong = {};
  for (const dong of allDongs) {
    const byCat = {};
    const H = [], E = [], A = [];
    const acc = { hAge: [], hSex: [], eOld: [], eRoad: [], eFacility: [], aRepeat: [], aNight: [], aPlace: [] };
    for (const cat of CATEGORY_ORDER) {
      const P = pct[cat];
      const det = detail[dong] && detail[dong][cat];
      if (!P || (!det && !(eParts[dong] && eParts[dong][cat]))) continue;
      const h = P.hGroup[dong] ?? null;
      const aParts = [P.aRepeat[dong], P.aNight[dong], P.aPlace[dong]].filter((v) => v !== undefined);
      const a = aParts.length ? Math.round(mean(aParts)) : null;
      const e = P.e_total ? (P.e_total[dong] ?? null) : null;
      byCat[cat] = {
        n: det ? det.n : 0,
        H: { score: h, group: det && det.hGroup, groupComp: det ? det.hGroupComp || null : null, age: det && det.hAge ? { ...det.hAge, score: P.hAge[dong] ?? null } : null, sex: det && det.hSex ? { ...det.hSex, score: P.hSex[dong] ?? null } : null,
             share65: det ? det.share65 ?? null : null, region65: det ? det.region65 ?? null : null, share19: det ? det.share19 ?? null : null, region19: det ? det.region19 ?? null : null },
        A: { score: a, repeat: det && det.repeat ? { ...det.repeat, score: P.aRepeat[dong] ?? null } : null,
             night: det && det.night ? { ...det.night, score: P.aNight[dong] ?? null } : null,
             place: det && det.place ? { ...det.place, score: P.aPlace[dong] ?? null } : null },
        E: { score: e, status: eCoverage[cat] ? eCoverage[cat].status : 'no-regression',
             groups: P.e_old || P.e_road || P.e_facility ? { old: P.e_old ? P.e_old[dong] ?? null : null, road: P.e_road ? P.e_road[dong] ?? null : null, facility: P.e_facility ? P.e_facility[dong] ?? null : null } : null,
             parts: eParts[dong] && eParts[dong][cat] ? eParts[dong][cat] : null },
      };
      if (!heaCats.includes(cat)) continue;
      if (h !== null) H.push(h);
      if (a !== null) A.push(a);
      if (e !== null) E.push(e);
      const push = (k, v) => { if (v !== null && v !== undefined) acc[k].push(v); };
      push('hAge', P.hAge[dong]); push('hSex', P.hSex[dong]);
      push('aRepeat', P.aRepeat[dong]); push('aNight', P.aNight[dong]); push('aPlace', P.aPlace[dong]);
      if (P.e_old) push('eOld', P.e_old[dong]);
      if (P.e_road) push('eRoad', P.e_road[dong]);
      if (P.e_facility) push('eFacility', P.e_facility[dong]);
    }
    if (H.length) axisRaw.H[dong] = mean(H);
    if (E.length) axisRaw.E[dong] = mean(E);
    if (A.length) axisRaw.A[dong] = mean(A);
    for (const k of Object.keys(indRaw)) if (acc[k].length) indRaw[k][dong] = mean(acc[k]);
    perDong[dong] = byCat;
  }
  const axis = { H: percentile(axisRaw.H), E: percentile(axisRaw.E), A: percentile(axisRaw.A) };
  const ind = {};
  for (const k of Object.keys(indRaw)) ind[k] = percentile(indRaw[k]);

  /* 점수가 빈 이유가 "동마다 표본 부족"인지 "비교할 동이 모자람"인지 가르기 위한 수.
     raw = 중점 분야 중 원값이 있는 동이 가장 많은 분야의 동 수 */
  const countKeys = (m) => (m ? Object.keys(m).length : 0);
  const RAW_KEY = { hAge: 'hAge', hSex: 'hSex', aRepeat: 'aRepeat', aNight: 'aNight', aPlace: 'aPlace', eOld: 'old', eRoad: 'road', eFacility: 'facility' };
  const comparison = { minDongs: PERCENTILE_MIN_DONGS, axes: {}, indicators: {} };
  for (const k of Object.keys(indRaw)) {
    const rawN = Math.max(0, ...heaCats.map((c) => countKeys(k.startsWith('e') ? eRaw[c] && eRaw[c][RAW_KEY[k]] : raw[c] && raw[c][RAW_KEY[k]])));
    comparison.indicators[k] = { raw: rawN, scored: countKeys(ind[k]) };
  }
  for (const k of ['H', 'E', 'A']) comparison.axes[k] = { raw: countKeys(axisRaw[k]), scored: countKeys(axis[k]) };

  /* 이 지자체의 E 가 비어 있는 이유 (화면·문서에 그대로 적음) */
  const eStatusOfRegion = !reg ? 'no-regression' : !boundary ? 'no-boundary'
    : heaCats.every((c) => eCoverage[c] && eCoverage[c].status !== 'ok') ? 'no-tif' : 'ok';

  const dongs = allDongs.map((dong) => {
    const t = s.dongs[dong] ? Object.values(s.dongs[dong]).reduce((o, b) => ({ n: o.n + b.n, lat: o.lat + b.lat, lng: o.lng + b.lng, ll: o.ll + b.ll }), { n: 0, lat: 0, lng: 0, ll: 0 }) : { n: 0, ll: 0 };
    let center = null, centerFrom = null;
    if (boundary && boundary.byName[dong]) {
      /* 경계가 있으면 경계 bbox 가운데 (간단한 대표점) */
      const bb = boundary.byName[dong].reduce((b, sh) => [Math.min(b[0], sh.bbox[0]), Math.min(b[1], sh.bbox[1]), Math.max(b[2], sh.bbox[2]), Math.max(b[3], sh.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      const [lng, lat] = toLatLng.forward([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]);
      center = [Number(lat.toFixed(5)), Number(lng.toFixed(5))]; centerFrom = 'boundary';
    } else if (t.ll >= CENTER_MIN_N) {
      center = [Number((t.lat / t.ll).toFixed(4)), Number((t.lng / t.ll).toFixed(4))]; centerFrom = 'incidents';
    }
    const axes = ['H', 'E', 'A'].filter((k) => axis[k][dong] !== undefined);
    const total = axes.length >= TOTAL_MIN_AXES ? Math.round(mean(axes.map((k) => axis[k][dong]))) : null;
    const inside = stats && stats.byDong && stats.byDong[dong] ? stats.byDong[dong].total.inside : 0;
    return {
      name: dong,
      n: t.n, inside,
      center, centerFrom,
      geometry: boundary && boundary.byName[dong]
        ? boundary.byName[dong].map((sh) => sh.rings.map((ring) => simplify(ring, GEOMETRY_TOLERANCE_M).map(([x, y]) => { const [lng, lat] = toLatLng.forward([x, y]); return [Number(lat.toFixed(5)), Number(lng.toFixed(5))]; })))
        : null,
      scores: {
        H: axis.H[dong] ?? null, E: axis.E[dong] ?? null, A: axis.A[dong] ?? null, total,
        totalAxes: axes,
      },
      indicators: {
        hAge: ind.hAge[dong] ?? null, hSex: ind.hSex[dong] ?? null,
        eOld: ind.eOld[dong] ?? null, eRoad: ind.eRoad[dong] ?? null, eFacility: ind.eFacility[dong] ?? null,
        aRepeat: ind.aRepeat[dong] ?? null, aNight: ind.aNight[dong] ?? null, aPlace: ind.aPlace[dong] ?? null,
      },
      byCat: perDong[dong],
    };
  });

  const json = {
    region: slug, label: meta.label, shortLabel: meta.short,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: '119 출동자료 2023~2025 (강원대 분류 A_type 0909) · 물적환경 회귀분석(강원대 0904, 지역 전체 모형) · 밀도·거리 TIF(강원대 0909)',
    dongUnit: DONG_UNIT.label,
    boundary: boundary
      ? { status: 'ok', files: boundary.files, sggCodes: boundary.sggCodes, pointShare: boundary.share,
          dongs: Object.keys(boundary.byName).length,
          unmatched: unmatched.map((d) => ({ name: d, n: Object.values(s.dongs[d]).reduce((a, b) => a + b.n, 0) })) }
      : { status: 'none', note: '동 경계를 찾지 못함 — 점수 위치는 출동 좌표 평균, 경계선·E 없음' },
    population: {
      status: population.status, files: population.files || [], note: population.note,
      /* 이 지자체에서 H 를 무엇으로 쟀는가 — 문장·표가 이 값을 보고 기준을 적습니다 */
      hBasis: link ? 'population' : 'composition',
      link: link ? { ...link.summary, unmatched: link.unmatched, links: link.links } : null,
    },
    heaCategories: heaCats.map((k) => ({ key: k, label: CATEGORY_LABEL[k] })),
    eStatus: eStatusOfRegion,
    eCoverage,
    thresholds: {
      H_MIN_DONG_N, H_MIN_GROUP_N, H_MIN_GROUP_POP, INCIDENT_YEARS, A_MIN_DONG_N, NIGHT, A_PLACE_EXCLUDE, CENTER_MIN_N, REPEAT_THRESHOLD, TOTAL_MIN_AXES, PERCENTILE_MIN_DONGS,
      temporary: ['H', 'A'],
    },
    comparison,
    method: {
      H: link
        ? '분야별로 연령(10년 단위)×성별 집단 중 [동 출동 ÷ 동 거주 인구] ÷ [지역 출동 ÷ 지역 거주 인구] 가 가장 큰 집단의 배수(인구 대비 출동률 배수) → 지자체 안 백분위. 인구는 주민등록 행정동을 법정동 이름에 맞춰 합산. 출동 구성비 배수는 근거로만 표기 (임시 기준)'
        : '분야별로 연령(10년 단위)×성별 집단 중 동 출동 구성비 ÷ 지역 전체 출동 구성비가 가장 큰 집단의 배수(출동 중 비중 비교, 인구 대비 아님) → 지자체 안 백분위 (임시 기준)',
      E: 'Σ(회귀계수 β × 동 평균값의 표준점수 z). 강원대 지역 전체 회귀분석의 유의 변수 중 TIF 가 있는 것만 → 백분위',
      A: '반복 발생 지점 수 · 야간(22~06시) 비중 · 1위 장소 비중(기타 제외)을 각각 백분위로 바꿔 평균 (임시 기준)',
      total: '중점 3분야의 H·E·A 를 각각 평균해 지자체 안 백분위로 맞춘 뒤, 있는 축끼리 평균',
    },
    dongs,
  };
  fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(json));
  const kb = Math.round(fs.statSync(path.join(OUT, `${slug}.json`)).size / 1024);
  const scored = dongs.filter((d) => d.scores.total !== null).length;
  indexOut.push({ region: slug, label: meta.label, dongs: dongs.length, scored, eStatus: eStatusOfRegion, boundary: json.boundary.status });
  const cov = heaCats.map((c) => `${CATEGORY_LABEL[c]} E ${eCoverage[c] && eCoverage[c].total !== undefined ? `${eCoverage[c].have}/${eCoverage[c].total}` : '—'}`).join(' · ');
  const bnote = (boundary ? `경계 ${Object.keys(boundary.byName).length}동(${boundary.sggCodes.join('+')})${unmatched.length ? ` · 이름 불일치 ${unmatched.length}` : ''}` : '경계 없음')
    + (link ? ` · 인구 ${link.summary.dongsWithPop}동(행정동 ${link.summary.adminMatched}/${link.summary.adminTotal}, 인구 ${link.summary.popShare}%)` : ' · 인구 없음');
  console.log(`  ${slug.padEnd(11)} 동 ${String(dongs.length).padStart(3)}개 (점수 ${String(scored).padStart(3)}) · ${bnote} · E ${eStatusOfRegion.padEnd(13)} · ${cov} · ${kb}KB`);
}

if (!onlyRegion) {
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10), dongUnit: DONG_UNIT.label, regions: indexOut,
  }, null, 2));
}
console.log(`\n→ data/dong/ ${indexOut.length}개 지역`);
