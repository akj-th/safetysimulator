# AI 안전 진단 시스템 — 프로젝트 안내

> 이 파일은 Claude Code가 작업을 시작할 때 **자동으로 먼저 읽는** 프로젝트 안내문입니다. **지금 기준의 요약·규칙·결정**만 둡니다.
> 기능별 자세한 설명·검증 기록·회의별 반영 내역은 [notes/](notes/README.md) 에 주제별로 있습니다(2026-10-27 이 파일 2,141줄을 **내용 그대로** 옮김).
> 작업할 주제의 notes 파일을 먼저 읽고, 바꾼 것은 그 파일과 이 파일에 함께 적으세요. 둘이 다르면 이 파일이 먼저입니다.
> (근거 원문: AURI 위탁용역 시행계획서)

---

## 1. 한눈에 보기

- **우리(ATELIER-KJ)가 만드는 것**: 거리 이미지로 도시 공간의 안전 취약성을 진단하고, 규칙 기반으로 개선 시설물을 처방한 뒤, 개선 전/후 이미지와 행정 문서를 만들어주는 프로토타입 앱.
- **왜**: 공무원이 취약 공간을 빠르게 진단하고, 안전사업지구 지정을 위한 국비 신청·예산 배분을 지원하기 위해.
- **위상(10/14 확정)**: 완성형 시스템이 아니라 **연구진 내부 도구**. 데이터 분석 결과와 현장 의견을 잇고, 결과를 행안부 양식 문서로 내보내는 것이 목적.
- **담당자**: 태환 (건축 전공, 개발 비전공 — 설명은 쉬운 우리말로).

## 2. 과업 요약 (자세히: [notes/01_과업배경.md](notes/01_과업배경.md))

- 상위 과제 「안전사업지구 사업모델 개발 연구용역」 — 건축공간연구원(AURI) 주관, 행정안전부 예방안전제도과. 재난안전법 제66조의13. 2026.05.04 ~ 2027.01.29.
- 우리 과업 「7대 사회재난 다중취약 공간 진단 및 AI 맞춤형 안전솔루션 개발지원 연구」 — 6개월, 5천만원, Atelier KJ.
- **7대 사회재난**: 자살 · 교통사고 · 화재 · 범죄 · 생활안전 · 산업재해 · 감염병. 코드 열쇠 `suicide` `traffic` `fire` `crime` `life` `industrial` `infection`.
- 대상: 2026 지역안전진단 **41개 기초지자체**. 시험 지점: 인천 미추홀구 조사지 안 **위도 37.4596, 경도 126.6799**.
- 공식 4대 과업 중 이 앱은 과업 2(배분 시뮬레이터)·3(문서 생성)·4(표준 가이드)를 잇는 실행 수단입니다.

## 3. 반드시 지킬 설계 원칙

- **처방은 규칙 엔진이 정한다.** 어떤 시설물을 넣을지를 이미지 생성 모델이 결정하게 하지 말 것.
- **감사 가능성**: 최종 산출물은 예산 산출의 근거가 되는 행정 문서다. 모든 처방은 "왜 이 시설물인가"를 진단 근거로 역추적할 수 있어야 한다. (시행계획서의 할루시네이션 방지 요건과 직결)
- **규칙 기반 처방과 생성형 렌더링을 분리해서 유지**한다.
- **AI는 새로 학습시키지 않는다.** 기존 모델을 우리 규칙·기준으로 "설정해서" 쓴다. 핵심 가치는 AI 성능이 아니라 "문제 → 시설물" 규칙표(건축·도시설계 전문성)에 있다.
- AI 가 쓰는 것은 **문장**뿐입니다(판독 요약·서술형 초안·의견 초안). 사업 선정·개수·점수 계산은 규칙과 자료로 합니다.

## 4. 작업 방식 (중요)

- **설명은 쉬운 우리말로.** 담당자는 개발 비전공 — 전문용어는 풀어서, 필요하면 비유로.
- **코드를 바꾸기 전에** 무엇을·왜 바꾸는지 한두 줄로 먼저 설명.
- **과하게 복잡하게 만들지 않는다.** 지금은 핵심 흐름을 먼저 검증하는 단계.
- **가장 위험한 가정을 먼저 검증**하고(예: 렌더링 품질) 단계적으로 확장.
- 큰 방향(전체 구조·설계) 판단은 담당자와 함께. 임의로 아키텍처를 크게 바꾸지 않는다.
- 작업이 끝나면 **커밋·푸시**(git 사용자 "th"). **렌더 배포는 담당자가 Manual Deploy** 합니다 — 푸시만으로는 배포되지 않습니다.
- 유료 API(AI 판독·이미지·서술형) 시험 호출은 꼭 필요한 만큼만.
- AURI 에 보내는 메일은 "제약 → 시도 → 안 될 수도 있음" 꼴로(다 된다고 하지 않기). 연구 내용(인과관계·공간유형 정의)은 AURI 몫.

### 이 컴퓨터에서 알아 둘 것
- `python` 은 MS 스토어 스텁이라 아무것도 안 합니다 — 스크립트는 **node** 로.
- 한글 2022 COM 변환(hwp→pdf)은 **한글이 들어간 경로**에서 멈춥니다 — 영문 경로로 복사한 뒤 변환.
- bash 로 node 스크립트를 heredoc 으로 넘길 때 정규식·`\n` 의 역슬래시가 풀리는 일이 잦습니다 — 정규식이 든 수정은 편집 도구로.
- `pdftoppm` 이 없어 PDF 를 그림으로 못 봅니다 — 헤드리스 크롬(CDP)으로 화면을 인쇄 모드로 찍어 확인.

## 5. 지금 기준의 큰 결정 (바꾸려면 담당자와)

| 무엇 | 지금 | 언제 · 자세히 |
|---|---|---|
| 폐쇄망 | **적용 안 함** — 외부 API(A안). 보안은 비식별화·승인제 로그인·사용량 상한 | 9/1 · notes/01 |
| 중점관리분야 | **지역안전지수 하위 등급** — 자살 고정 + 2025 하위 2(동률이면 2024 → 분야 순서, `tieBreak`). 지자체별 직접 지정(개수 제한 없음)은 `tools/config/focus-override.json` | 10/22 · 10/27 · notes/04 |
| 예외 | 사전진단서 2장은 **AURI 보고서 원문 분야**(강원대 확정 3분야, `focusTypesKangwon`). 종합도도 강원대 분야 | 10/22 · notes/06·09 |
| 동 단위 | **행정동** — vuski 경계, 출동 좌표로 배정. 시군구 묶음은 출동 좌표 **전부**의 5% 이상이 떨어지는 곳 | 10/21 · 10/27 · notes/04 |
| 지점 → 지자체 | **지자체 경계 안**인지로 판정(`assets/region-bounds.js`, 화면·서버 공용). 41곳 밖이면 리포트·문서·AI 중점 분야에 이웃 지자체를 빌려 오지 않음. 지자체 중심점(`index.json` lat·lng)은 예비용 | 10/28 · notes/04 |
| HEA·복합위험지수 | **지자체 안 상대값만**(전국 절대값 병행 안 함) | 10/21 |
| 복합위험지수 | **v4** = 가중 HEA 0.25 + 119 밀도 0.25 + 현장조사단 평가 0.5, 원점수 0~100. 색은 순위 3분위. 표시 동 = AURI 지구 동 수(최대 3) | 10/22 · 10/27 · notes/04 |
| 종합 위험도 | 사진 판독 10 : 주변 이력 90 (`RISK_BLEND_PHOTO`). 처방에는 안 씀(표기용) | 9/16 · notes/04 |
| 처방 | 사진에서 문제로 확인된 **체크리스트 항목**이 사업을 부름. 개수 = 판정(위험 2 · 주의 1 · 안전 0). 순서 = 적합도. 3단계에서 한 번만 돌림 | notes/02 |
| 사업 팔레트 | AURI 289종(9/02 엑셀) + **표준 팔레트 210종**(10/21 docx) 병합 = 443종 | notes/02 |
| 이미지 | **E(환경 개입)만** 그림. 4단계 "직접 입력한 사업만"(strict) 모드. 모델은 `IMAGE_MODELS` 목록만 | 10/27 · notes/05 |
| 문서 | 탭 4개: 현장용 리포트 → 사전진단서(AURI 원문 + 별첨) → 적용사례 카드 → 2차 현장보고서(서술형). 한글 내려받기 = AURI 원본 hwpx 틀 + 빈칸만 | notes/06 |
| 확정 결과 제시 | 화면·문서에 "후보·개발 중·참고값" 꼬리표를 쓰지 않음. 남긴 것: AI 이미지 면책(상시) · 대응역량 "확인 필요" · 임시 점수 · 연구원 보정 표시 | 10/22 |
| 로그인 | 렌더는 `AUTH_MODE=account`(승인제). 내 컴퓨터는 `AUTH_MODE=off` | 9/14 · notes/07 |
| 히트맵 | 1단계 지도에서는 **보류**(9/7). 사전진단서 분야별 지도에는 씀(10/20) | notes/09 |
| 통계 계산 | 연령 구간 20~49세(**20세 포함**) 유지 · 자살은 구급출동만(자살발생지점 좌표 대기) · 읍면동 = 행정동 · 장소는 강원대 A_type(화재·범죄·자살) | 9/8 · 9/15 · notes/03 |
| 보류 | 스케치 → AI 입력 (2026-11 2차 조사 즈음 다시 리마인드) | 10/21 |

## 6. 화면과 흐름

5단계가 한 줄로 이어지고, 페이지 사이 자료는 브라우저 `sessionStorage` 의 `auri_*` 칸으로 넘깁니다(키 목록: [notes/02](notes/02_진단-처방.md) 끝 + 아래 "조용히 깨지는 연결").

| 단계 | 파일 | 하는 일 |
|---|---|---|
| 1. 입력 | `index.html` | 네이버 지도에서 지점 선택 · 지역안전지수 등급표 · 행정동별 위험도(분야·복합위험지구) · 119 이력 레이어 · 주요 거점 · 맞춤형 사업 종합도 오버레이 · 동별 HEA 표 |
| 2. 진단 | `diagnosis.html` | 스트리트뷰 캡처·사진 업로드 → AI 판독(항목 43개 · 분야별 판독 요약 · 공간유형) · 재판독 · 연구원 보정. **서버에 닿지 못할 때만** 임시 점수 |
| 3. 리포트 | `report.html` | 읍면동 종합 분석 · 6단 리포트(인적·사고유형·물적환경·대응역량·현장확인·개선방향) · **처방 규칙 엔진** · 처방 편집 |
| 4. 시각화 | `visualize.html` | 개선 후 이미지 생성(처방 E 사업 / 직접 입력한 사업만) · 번호 태그 · 다시 만들기 |
| 5. 문서 | `document.html` | 문서 4탭 · 빈칸 AI 초안 · 수정 모드(탭 전체 편집 → `auri_doc_html`) · 인쇄 · 한글(hwpx) 내려받기 |
| 계정 | `login.html` · `admin.html` · `projects.html` | 승인제 로그인 · 관리자 계정·기록 · 프로젝트 저장/열기 |

## 7. 파일 지도

### 화면 공통 (`assets/`)
| 파일 | 역할 |
|---|---|
| `ui.js` | 상단 바·단계 이동 · 9단계(`auriLevel`) · `auriCallServer`(서버 호출·오류 구분 `offline`) · `auriEsc` · **`AURI_AI_DISCLAIMER`(면책 문구 한 곳)** · 로고(`AURI_BRAND_LOGO`) |
| `theme.css` | 전 화면 디자인. 색·여백·글자 크기는 맨 위 `:root` 토큰만 |
| `rules.js` | **연결표(`RX_RULES.byItem`: 항목 → 사업) + 처방 규칙 엔진(`auriPrescribe`)** — 담당자가 고치는 파일 |
| `palette.json` · `palette-std.json` · `palette.js` | 사업 팔레트(자동 생성, 손대지 않음) · 불러오기·병합·공간분류(`SPACE_GROUPS`) |
| `space-risk.json` · `space-risk.js` | 공간유형 13종 · 위험요인 26개 연계표(**AKJ 임시** draft1 — AURI 인과 자료 오면 이 파일만 교체) |
| `stats.js` | 119 통계 → 리포트 문장 · `PLACE_CHECKS`·`AGE_CHECKS`·`HOUR_CHECKS` |
| `field-check.js` | 현장 확인사항 4범주(항목 43개 전부 배정) |
| `risk-weights.js` | 분야 가중치·종합 위험지수·`RISK_BLEND_PHOTO` |
| `safety-index.js` | 지역안전지수 등급표 · 가중 HEA · 복합위험지수(`COMPOSITE_W`) · `dongAt` |
| `region-bounds.js` | **지점 → 41개 지자체 판정**(`AuriRegion.near`·`at`) — 화면 4곳과 서버(`server/region.js`)가 함께 씀 |
| `dong-hea.js` | 동별 HEA 불러오기·표(`renderTable`)·색 |
| `physical.json` · `physical.js` | 강원대 물적환경 회귀분석(7곳만, 자동 생성) |
| `rx-editor.js` | 처방 목록 표시·편집(리포트·시각화 공용) |
| `doc-edit.js` · `doc-map.js` · `site-photo.js` · `hwpx-export.js` | 문서 빈칸·AI 초안 · 문서 지도(브이월드) · 현장 사진(EXIF) · 한글 내려받기 |
| `auth.js` · `projects.js` | 계정 줄 · 프로젝트 저장 창/열기(`SAVE_KEYS`, 열 때 `cleanValue` 로 이미지 칸 확인) |
| `logo-auri.svg` · `logo.svg` | AURI 로고(지금) · ATELIER KJ 로고 |

### 서버 (`server/`)
| 파일 | 역할 |
|---|---|
| `server.js` | 화면 파일 서빙(**화이트리스트**) · AI 판독(`/api/diagnose`·`/api/revise`) · 의견 초안(`/api/opinion`) · 서술형(`/api/narrative`) · 이미지(`/api/generate`·`/api/models`) · 요금 상한 · 폐쇄망 전환 시 `callAI()` 안쪽만 교체 |
| `checklist.js` | **7대 분야 체크리스트 43항목** — 이 프로젝트에서 가장 중요한 파일. 질문은 예/아니오로 답할 수 있어야 함(`risk: 'yes'\|'no'`) |
| `legal.js` | AI 가 인용할 수 있는 근거(대조 마친 `verified: true` 만 지시문에) |
| `auth.js` · `projects.js` | 계정·세션·기록 · 프로젝트·거점 보정(PostgreSQL) |
| `region.js` | 지점 → 지자체(`regionAt`) — `assets/region-bounds.js` 를 `require` 해 화면과 같은 판정. AI 판독 중점 분야·진단 기록·프로젝트 지자체 |

AI 모델: 진단·재판독·의견 초안 `claude-opus-5`(adaptive thinking) · 서술형 `claude-opus-5-5`(fallbacks default). 이미지 `gemini-3-pro-image` · `gpt-image-2.5-sunburst`(기본) · `gpt-image-2.5-flare` · `gpt-image-2`.

### 자료 (`data/`) — 앱이 읽는 가공 결과, 커밋 대상
| 폴더 | 무엇 | 만드는 도구 |
|---|---|---|
| `incidents/` | 119 출동 50m 격자 | `build-stats.mjs` |
| `stats/regions/` · `stats/index.json` · `stats/national.json` | 지자체 통계(조사지 내/전체 · 행정동별) | `build-stats.mjs` (+ `apply-focus-index.mjs`) |
| `stats/safety-index.json` | 지역안전지수 등급·가중치·중점분야 | `build-safety-index.mjs` |
| `stats/field-survey.json` | 현장조사단 평가(복합위험지수 0.5) | `build-field-survey.mjs` |
| `stats/hotspots.json` | 주요 거점 A~J | `build-hotspots.mjs` |
| `stats/region-types.json` | 지자체 유형(도심/도농복합/농촌) | `classify-regions.mjs` |
| `stats/region-bounds.json` | 41개 지자체 바깥 경계(지점 판정용, 235KB) | `build-region-bounds.mjs` |
| `stats/auri-reports/` | AURI 사전분석 보고서 39곳 글·표·그림 | `build-auri-reports.mjs` · `shrink-images.mjs` |
| `dong/` | 동별 HEA(행정동) | `build-dong-hea.mjs` |
| `heatmap/` | 분야별 커널밀도 PNG(중점 분야) | `build-heatmap.mjs --focus` |
| `overview/` | 종합도 JPG · 웹 오버레이 JSON(39곳) | `tools/overview-map/` |
| `hwpx/` | 한글 내려받기 틀(AURI 원본, 그림만 축소) | `build-hwpx-templates.mjs` |

### 커밋하지 않는 것 (내 컴퓨터에만)
| 폴더 | 무엇 |
|---|---|
| `data/raw/` | **원본** — 119 출동자료(환자 연령·성별·주소, 🔴 외부 반출 금지) · 경계·인구·TIF·SHP·팔레트 엑셀 등. 폴더 안내: `data/raw/README.md` |
| `docs/` | 회의록·받은 자료·작업 노트·보낸 자료(실명·내부 논의). 이름 규칙 `YYYYMMDD_출처_내용` · 안내 `docs/README.md`. ⚠ `docs/사전진단 보고서 및 지도 작업본(AURI)/` 은 **이름·구조를 바꾸지 말 것**(도구가 이 경로를 씀) |
| `output/` | 종합도 SVG(위성영상 포함, 4MB+) · AURI 원본 그림. 안내: `output/README.md` |

### 이름 규칙
- 코드·자료 파일: 영문 소문자 + 하이픈(`palette-std.json`, `build-dong-hea.mjs`). 지자체 열쇠(`geumcheon`, `jjunggu` …)는 DB·파일 이름이 쓰므로 **그대로**.
- `docs/` 파일: `YYYYMMDD_출처_내용.확장자`(예: `20261026_행안부_합동회의록.pdf`) — 자세히 `docs/README.md`. `notes/` 는 `NN_주제.md`.
- `data/raw/` 폴더: `내용_MMDD`(수신일) — 도구가 경로로 쓰므로 이미 있는 폴더 이름은 바꾸지 않음.

### 도구 (`tools/`) — 안내: [tools/README.md](tools/README.md)
`build-*.mjs`(자료 만들기) · `verify-*.mjs` · `compare-kangwon*.mjs`(점검) · `lib/`(CSV·SHP·TIF·xlsx·hwpx 읽기) · `overview-map/`(종합도) · `config/`(중점분야 직접 지정) · `legacy/`(옛 SHP 변환기 — `--force` 없이는 안 돎 · 카카오 캡처 시험 페이지).

## 8. 명령과 순서 (`tools/` 폴더에서)

| 명령 | 하는 일 | 언제 |
|---|---|---|
| `npm run build` | 119 CSV → `data/incidents/` + `data/stats/` (끝에 중점분야 적용) | 새 119 자료 |
| `npm run verify` | AURI 값 295건 대조 + **⑤ 파일 사이 일치**(지수 = 통계 = 동별 HEA = 거점 분야, 현장평가 = 동 이름) + **⑥ 지점 → 지자체**(41곳 조사지·거점이 제 지자체로) | build 뒤 · 자료를 다시 만든 뒤 |
| `npm run focus` | 지역안전지수 → 중점분야 적용 | 등급·`focus-override.json` 이 바뀌면 |
| `npm run focus-all` | focus + 동별 HEA + 현장평가 + 거점 | **중점분야가 바뀌면 이것**(그다음 `npm run heatmap -- --focus`) |
| `npm run dong-hea` | 동별 HEA → `data/dong/` (지자체 하나만: `node build-dong-hea.mjs <지역>`) | build 뒤 · 경계·인구·TIF 가 바뀌면 |
| `npm run region-bounds` | 지자체 경계 → `data/stats/region-bounds.json` (지점 판정용) | dong-hea 뒤 · 행정동 경계 판이 바뀌면 (verify ⑥ 이 잡음) |
| `node build-field-survey.mjs` | 현장조사단 평가 → AURI 지구 동이 상위에 오는지 확인(41곳 일치가 정상) | dong-hea 뒤 |
| `npm run palette` · `node build-palette-std.mjs` | 팔레트 289종 · 표준 팔레트 210종 | 새 팔레트 |
| `npm run verify-rules` | 체크리스트 ↔ 연결표 ↔ 팔레트(병합 443종) ↔ 연계표 정합 | **checklist.js · rules.js · space-risk.json 을 고친 뒤 항상** |
| `node hwpx-to-text.mjs <hwpx·폴더>` → `npm run auri-reports` → `node shrink-images.mjs` → `node build-hwpx-templates.mjs` | AURI 사전분석 보고서 반영 | 새 보고서 |
| `npm run space-risk-export` | 연계표 엑셀·CSV(AURI 검토용) | 연계표를 고친 뒤 |
| 종합도 | `run-pptx-region` → `refit-norot` → **`check-pois --write`(필수)** → `reframe` → build → `export-jpg` → `overlay` | 자세히 notes/09 |

로컬 서버: `cd server && npm install && npm start` → http://localhost:8787. `server/.env` 에 API 키(비밀 — 읽지도 커밋하지도 말 것)와 `AUTH_MODE=off`. 일괄 시험은 `DAILY_LIMIT=1000 HOURLY_LIMIT_PER_IP=1000` 으로.

## 9. 조용히 깨지는 연결 — 고칠 때 함께 고칠 곳

- **번호로 맞물린 세 파일**: `server/checklist.js`(항목 번호·질문·문제 답) ↔ `assets/rules.js` `byItem`(항목 → 사업) ↔ `assets/field-check.js`(항목 → 현장 확인 범주) ↔ `assets/space-risk.json`(항목 → 위험요인). 하나만 고치면 처방에서 조용히 빠집니다 → `npm run verify-rules`.
- **저장 칸 목록 `SAVE_KEYS` 는 두 곳**: `server/projects.js` · `assets/projects.js`. 새 `auri_*` 칸을 만들면 둘 다(안 넣으면 프로젝트 저장에서 조용히 빠짐). 지금 14개 — 10/20~27 추가: `auri_after_tags`(번호 태그) · `auri_doc_html`(수정본) · `auri_gen_custom`(직접 입력·`lastImage`) · `auri_narratives`(서술형).
- **서버 화이트리스트 `ALLOW_DIRS`**(server.js): 앱에 새 폴더·확장자가 필요하면 한 줄. `data/raw/`·`server/` 는 403.
- **지점 → 지자체는 `assets/region-bounds.js` 한 곳** — 1단계 지도·진단 안내·리포트·문서와 서버(AI 판독 중점 분야·진단 기록·프로젝트)가 같은 코드·같은 경계를 씁니다. 지자체 중심점 거리로 고르지 말 것(옹진 섬·함양·경계 근처가 틀렸던 방식, 10/28). 새 화면에서 지자체를 찾을 때도 이것으로.
- **규칙 엔진은 3단계에서 한 번만** — 4·5단계는 `auri_prescriptions` 를 그대로 받습니다. 연구원 보정은 `auri_rx_overrides` 에 따로(덮어쓰지 않음).
- **처방은 항목 답(`findings`)으로 정해집니다** — 연구원이 판독 근거 글(`observed`)을 고쳐도 처방은 안 바뀝니다. 처방을 바꾸려면 재판독(`/api/revise`).
- `RX_RULES[분야].fallback` 은 항목 판독이 없을 때(임시 점수·옛 세션)만 쓰는 예비 목록 — 지우지 말 것. 자살은 E 만으로 채우지 않습니다(`RX_REQUIRE_HEA`, 처방 1종인 '주의' 제외).
- `stats.js PLACE_CHECKS` 는 두 벌(강원대 A_type 장소값 + 발생장 값) — 발생장 열쇠를 지우면 교통·생활안전·산재·감염병의 현장 확인사항이 사라집니다.
- **3구간 경계 33/66**: 위험도 9단계 · 처방 개수 · 위험지수 · 동별 HEA 색이 같은 경계를 씁니다. 한쪽만 바꾸면 감사 추적이 깨집니다.
- **지자체 열쇠(slug)·거점 글자(A~J)를 바꾸지 말 것** — DB(`hotspot_edits`·`projects.hotspot_tag`)와 파일 이름이 이것을 씁니다. 거점을 다시 뽑으면(순위가 바뀌면) DB 거점 보정이 다른 거점에 붙습니다.
- **분야 색 두 벌**: 1단계 지도 점 색 `index.html INCIDENT_CATEGORIES` = 문서 지도 `doc-map.js MAP_COLORS`. 종합도·사전진단서 히트맵은 AURI 7색(`overview-map/risk.mjs AURI_COLORS`).
- **자동 생성 파일은 손대지 않음**: `assets/palette*.json` · `assets/physical.json` · `data/**`. 원본을 고치고 도구를 다시 돌립니다.
- **원본을 바로잡은 곳**(`tools/lib/regions.mjs`) — 서울 중구 → 대구 중구 83건, 시군구가 빈 충남 2건. 되돌리면 295건 대조가 깨집니다. 화재는 `0826화재_유형.csv` 에 A_type 이 없어 0826 판과 줄 단위로 결합(`tools/lib/incidents.mjs`).
- **문서 수정본**(`auri_doc_html`)은 남의 프로젝트에서도 오므로 `cleanSavedHtml` 로 거른 뒤 넣습니다. 문서에 새 인라인 버튼(`onclick="…"`)을 넣으면 `SAFE_HANDLER` 목록에도 넣어야 수정본에서 살아남습니다.
- **글은 이스케이프**: AI·사람이 쓴 글을 HTML 에 넣을 때 `auriEsc`(document.html 은 `esc` — 따옴표까지).
- **브라우저 저장 공간 약 260만 자(5MB)** — 이미지는 줄여 담습니다(진단 사진 1800px · 개선 후 1600px · 현장 사진 1400px JPEG).
- **면책 문구**는 `ui.js AURI_AI_DISCLAIMER` 한 곳. 개선 전/후 이미지 아래에 항상(인쇄 포함).
- **이미지 모델**: 목록은 `server.js IMAGE_MODELS` 한 곳(화면은 `/api/models` 로 받음, 키 없는 제공사는 안 보임). GPT Image 2 계열에는 `input_fidelity` 를 보내지 않음(오류). OpenAI 는 조직 인증이 있어야 이미지 모델이 열림(403).
- **법령**은 `server/legal.js` 에서 `verified: true` 인 것만 AI 지시문에. 조례는 지자체별 확인 전까지 인용 제외.
- 디자인: 색은 메인 `#D83D64` · 대조 `#2793C9` · 무채색만, 카드·박스·그림자 금지, 모서리 0, 글자 크기는 `--fs-*` 토큰만(자세히 notes/08). 로고를 바꾸면 `AURI_BRAND_LOGO` 와 `--logo-h` 를 함께.
- **종합도**: 정합(refit) 뒤 `check-pois --write` 필수. 생성기는 `_종합도.svg` 만 덮어쓰고 담당자 수정본(`_종합도_최종.svg`)은 그대로. SVG 를 다시 만들면 `export-jpg` · `overlay` 도.

## 10. 보안 · 개인정보

- `data/raw/`(119 원본: 연령·성별·주소) · `docs/` · `output/` 은 `.gitignore` — **커밋·외부 복사 금지**. 웹 자료는 집계·비식별 결과만.
- `AUTH_MODE=account` 인데 DB 에 못 붙으면 사이트를 **닫습니다**(503 "설정 필요") — 30초마다 다시 붙어 보고 붙으면 열림. 관리자 계정은 화면에서 끌 수 없고 `ADMIN_ID`·`ADMIN_PW` 환경변수로만(켤 때 비밀번호를 그 값으로 맞춤).
- 서버가 화면 파일까지 내주고, 로그인 전에는 `login.html` 과 assets 의 css·js·그림만. 비밀번호는 bcrypt 해시, 세션 30분. 가입 신청은 IP당 1시간 5건·대기 200건 상한. 본문은 JSON 만(CSRF).
- API 키는 `server/.env` 에만(브라우저 노출 금지). 사용량 상한 `DAILY_LIMIT`·`HOURLY_LIMIT_PER_IP`(요청 검증 뒤, AI 호출 전에 셈).
- ⚠ GitHub Pages 주소는 로그인으로 막히지 않습니다(파일만 내주는 곳). 렌더 무료 DB 는 30일 만료 · 1GB.
- 현장 사진은 "함께 저장"을 켜면 서버 DB 에 들어갑니다(사람·차량번호가 찍힐 수 있음 — 저장 창에 안내).

## 11. 외부 확인 대기 (값이 오면 바꿀 곳)

| 무엇 | 누구 | 오면 할 일 |
|---|---|---|
| **41개 지자체 중점관리분야(안) 엑셀** (3개 고정 아님) | AURI | `tools/config/focus-override.json` → `npm run focus-all` → `npm run heatmap -- --focus` → `npm run verify` |
| **엑셀 2024 등급 열 행 섞임** (부천 값이 청송 행 등) | AURI | 확인되면 `build-safety-index.mjs` 의 2024 처리 — 위 엑셀이 오면 대부분 대체됨 |
| 공간유형 분류체계·정의 · 위험요인–사업 인과 연계표 | AURI(정호경) | `assets/space-risk.json` 교체 → `npm run verify-rules` · `space-risk-export` |
| 행안부 「지역안전진단 결과보고서(안)」 재송부본 | 행안부 → AURI | 2차 현장보고서·적용사례 카드를 그 양식으로(행안부 리포트 탭 `moisReport()` 는 함수만 남아 있음) |
| 강원대 2차 분석 — 복합위험지구 1곳 + 추가위험지구 최대 3곳, 2.5~3㎢ | 강원대 | 지도·복합위험지구·HEA 를 새 경계로 다시 산출, 추가위험지구 레이어 |
| 자살발생지점 좌표 (구급출동 + 발생지점 통합 분석 결정) | AURI·강원대 | 자살 통계 다시(지금은 구급출동만, 부천 926 vs 1,404) |
| TAAS 개별 사고지점 | 행안부 | 교통 분야 반영 |
| 사업 단가(나라장터 유사사업) | AURI | 팔레트 금액 칸 → 서식2 합계(지금 443종 중 15종만 단가) |
| 남원·밀양 사전분석 보고서 (39/41) | AURI | 위 "AURI 보고서 반영" 순서 |
| 영천 예시안 나머지 분야(자살·교통) 완성본 | AURI(정호경) | 서술형 지시문 예시 교체(`NARRATIVE_EXAMPLE`) |
| 그 밖의 오래된 확인 건 | — | 생활안전 편중(88%) · 화재 CSV 재전송 · 자살 62.0% 기준 · 0904 표 ↔ 0909 CSV 판 차이 · TIF 좌표계 · 미수신 변수 32종 · 대응역량 자료 · 강원대 분모 차이 · 겹치는 약어 6쌍 · 조사지내 교통사고 시트 오류 · 지자체 조례 · 물적환경 나머지 34곳 · 국정과제 72·73 원문 → notes/90 · notes/03 |

## 12. 남은 일 (AKJ)

1. **렌더 Manual Deploy** — 10/23 피드백 · 10/27 한글 내려받기 · 정호경 요청 5건 · 10/27 밤 점검 수정 · **10/28 지점 → 지자체 판정(옹진·함양)** 이 모두 배포 대기. 배포 뒤 정호경 연구원 후속 보고(초안·시험 자료: `docs/04_발신자료/20261028_AKJ_정호경_후속보고/`).
2. 이은석 박사님 회신 — 10/23 피드백 반영 결과 + **10/28 "옹진군이 미추홀구로 표출" 수정 결과**(배포 뒤).
3. 렌더에서 확인할 것: 로그인 후 진단 1회 · 프로젝트 저장/열기 · 관리자 거점 드래그 → 다른 계정 말풍선(DB 환경에서 아직 안 돌려 봄) · 렌더 DB 만료(30일) 여부.
4. **지자체 유형화 2차 기준 결정** — AI 대조(10/27): 41곳 중 28곳 같음, 다른 13곳은 모두 동 + 읍·면이 섞인 시를 규칙이 밀도로 농촌형으로 본 것. 제안: "동 + 읍·면이면 도농복합형"(`docs/03_작업노트/20261027_AKJ_지자체유형화_AI대조.md`). 결정 전까지 화면은 1차안.
5. 10/06 판 사업팔레트 엑셀(`data/raw/analysis_1006/`) 반영 여부 결정 — 10/21 표준 팔레트가 최신이라 지금은 반영 안 함(notes/90 10/27 밤).
6. 판단이 필요한 것(notes/90 10/27 밤 "그대로 둔 것"): 가중 HEA 의 절반이 119 건수로 대체되는 문제 · 중점분야 N개일 때 거점 점수 희석 · 예전 프로젝트 처방 재계산.
7. 자료가 오면: 위 11번 표.

## 13. 기술 스택

- 순수 HTML / CSS / JavaScript (프레임워크 없음 — 비전공자 유지보수 위해 단순 유지). 서버는 Node(22+, `server/package.json engines`) · PostgreSQL(`pg`) · `bcryptjs` · `@anthropic-ai/sdk` 0.115.
- 네이버 지도 API (NCP) — 배포 주소를 네이버 콘솔 "Web 서비스 URL" 에 등록해야 지도가 뜸. 문서 지도는 브이월드 타일(CORS 허용).
- 배포: 렌더(서버 + 화면, 담당자 Manual Deploy) · GitHub Pages(서버 없이 화면 흐름만). 저장소 `akj-th/safetysimulator`.
