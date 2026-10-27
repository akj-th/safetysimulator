# tools — 자료 만들기·점검 도구

원본(`data/raw/`, 커밋 안 됨)을 읽어 앱이 쓰는 가공 결과(`data/`·`assets/*.json`, 커밋 대상)를 만듭니다.
**결과 파일은 손으로 고치지 않습니다** — 원본이나 도구를 고치고 다시 돌립니다. 처음 한 번 `npm install`(proj4).
명령은 이 폴더에서 `npm run <이름>` 또는 `node <파일>`. 순서·언제 돌리는지는 [CLAUDE.md](../CLAUDE.md) 8절.

## 자료 만들기

| 파일 | npm | 무엇을 → 어디로 |
|---|---|---|
| `build-stats.mjs` | `build` | 119 출동 CSV → `data/incidents/`(50m 격자) · `data/stats/regions/`(조사지 내/전체 · 행정동별 통계). 끝에 `apply-focus-index` 를 부름 |
| `build-safety-index.mjs` | `focus` | 강원대 등급 엑셀(수정본) + AURI 5개년 표 → `data/stats/safety-index.json`(등급·가중치·중점분야·`tieBreak`) |
| `apply-focus-index.mjs` | `focus` | 중점분야(지수 기준 또는 `config/focus-override.json`)를 `data/stats/` 에 적용 |
| `build-dong-hea.mjs` | `dong-hea` | 출동 + 행정동 경계 + 인구 + TIF + 회귀분석 → `data/dong/`(동별 H·E·A). 지자체 하나만: `node build-dong-hea.mjs <지역>` |
| `build-field-survey.mjs` | — | 현장조사단 평가 → `data/stats/field-survey.json` (AURI 복합위험지구 동이 상위에 오게, 41곳 일치 확인) |
| `build-hotspots.mjs` | `hotspots` | 중점분야 커널밀도 TIF → `data/stats/hotspots.json`(거점 A~J). ⚠ 다시 뽑으면 글자가 바뀌어 DB 거점 보정을 정리해야 함 |
| `build-heatmap.mjs` | `heatmap` | 커널밀도 TIF → `data/heatmap/` PNG (`-- --focus` 면 중점분야만) |
| `classify-regions.mjs` | `classify` | 인구·면적 → `data/stats/region-types.json`(도심/도농복합/농촌 1차) |
| `classify-regions-ai.mjs` | — | 같은 지표로 AI 가 따로 분류 → region-types.json 의 `ai` 칸(유료 1회, `node --env-file=server/.env tools/classify-regions-ai.mjs`) |
| `build-palette.mjs` | `palette` | AURI 사업 팔레트 엑셀(9/02) → `assets/palette.json`(289종) |
| `build-palette-std.mjs` | — | 표준 맞춤형 사업팔레트 docx 7개(10/21) → `assets/palette-std.json`(210종) |
| `build-physical.mjs` | `physical` | 강원대 물적환경 회귀분석 → `assets/physical.json`(7곳) |
| `hwpx-to-text.mjs` | — | AURI 사전분석 보고서 hwpx → `_text/<이름>.txt` |
| `build-auri-reports.mjs` | `auri-reports` | 보고서 글·표·그림 → `data/stats/auri-reports/<지역>.json` |
| `shrink-images.mjs` | — | 보고서 원본 그림(`output/auri-img-raw/`) → 1400px JPEG |
| `build-hwpx-templates.mjs` | — | 한글 내려받기 틀 → `data/hwpx/`(그림만 축소한 AURI 원본) |
| `export-space-risk.mjs` | `space-risk-export` | 연계표(`assets/space-risk.json`) → 엑셀 1개 + CSV 2개(AURI 검토용) |
| `batch-generate.mjs` | `batch-generate` | 작업표 CSV → 켜 둔 로컬 서버로 개선 이미지 일괄 생성(`--go` 없으면 시험 실행) |

## 점검

| 파일 | npm | 무엇 |
|---|---|---|
| `verify-stats.mjs` | `verify` | AURI·강원대 값 295건 대조 + ⑤ 파일 사이 일치(중점분야 · 현장평가 동 이름) |
| `verify-rules.mjs` | `verify-rules` | 체크리스트 ↔ 연결표 ↔ 팔레트(병합 443종) ↔ 현장 확인 범주 ↔ 공간유형 연계표 |
| `compare-kangwon.mjs` | `compare-kangwon` | 강원대 연령·성별 산출값 ↔ 우리 계산 |
| `compare-kangwon-type.mjs` | `compare-kangwon-type` | 강원대 A_type 분류 ↔ 0904 사고유형 표 (시트 정렬 오류 자동 점검) |

## 공용 (`lib/`)

| 파일 | 무엇 |
|---|---|
| `incidents.mjs` | 119 CSV 열기 — 파일 이름 · 화재 결합 · A_type · 반복 임계값 한 곳 |
| `regions.mjs` | 지자체 매칭표(119 · 조사지 SHP · 강원대 엑셀) + **원본 바로잡은 곳**(되돌리지 말 것) |
| `hjd.mjs` | 행정동 경계(vuski geojson) 묶음·시군구 고르기·좌표 → 동 |
| `csv.mjs` · `xlsx.mjs` · `xlsx-write.mjs` · `shapefile.mjs` · `geotiff.mjs` · `png.mjs` · `hwpx.mjs` · `zonal.mjs` | 파일 읽기·쓰기(라이브러리 없이) · TIF → 동 평균 |

## 종합도 (`overview-map/`) — 자세히 [notes/09_종합도-히트맵.md](../notes/09_종합도-히트맵.md)

`regions/<지역>.json`(사업지·글·정합값) → `build-overview-map.mjs`(SVG) → `export-jpg.mjs`(웹 JPG) · `svg-to-overlay.mjs`(웹 오버레이).
pptx 판: `pptx-extract.mjs` → `run-pptx-region.mjs` → `refit-norot.mjs` → **`check-pois.mjs --write`(필수)** → `reframe.mjs`.
그 밖: `v3.mjs`(담당자 수정본 규칙) · `risk.mjs`(히트맵·대상지·거점) · `fit-*.mjs`(옛 정합) · `extract-final.mjs` · `compose/`(9개 지자체 설정 조립) · 아이콘 2종.

## 설정 · 옛 도구

- `config/focus-override.json` — 지자체별 중점분야 직접 지정(개수 제한 없음). 비어 있으면 지역안전지수 기준.
- `legacy/` — 쓰지 않는 옛 도구. `convert-gis.js`(옛 SHP 변환기 — 지금 `data/incidents/` 를 덮어쓰므로 `--force` 없이는 안 돎) · `kakao-capture-test.html`(카카오 로드뷰 캡처 불가 확인용) · `ui.css`(그 페이지의 옛 디자인).
