# data — 앱이 읽는 자료

| 폴더 | GitHub | 무엇 |
|---|---|---|
| `raw/` | 🔴 **절대 올리지 않음** (.gitignore) | AURI·강원대·공공 원본. 119 출동자료에는 환자 연령·성별·지번주소가 들어 있어 **외부 반출 금지** |
| 나머지 | ✅ 커밋 | `tools/` 가 원본에서 만든 **집계·비식별 결과**. 개별 신고를 되짚을 수 없는 값만 남깁니다 |

결과 파일은 손으로 고치지 않습니다 — 원본이나 `tools/` 를 고치고 다시 만듭니다(순서는 [CLAUDE.md](../CLAUDE.md) 8절, 도구는 [tools/README.md](../tools/README.md)).
서버는 화이트리스트에 있는 폴더·확장자만 내주고 `raw/` 는 403 입니다(`server/server.js ALLOW_DIRS`).

## 폴더

| 폴더 | 무엇 | 만드는 도구 |
|---|---|---|
| `incidents/<지역>.json` | 119 출동 **50m 격자** 건수(분야별) — 1단계 지도 레이어 | `build-stats.mjs` |
| `stats/regions/<지역>.json` | 지자체 통계 — 조사지 내/전체 연령·성별·장소·유형·시간대 · 행정동별 · 반복 발생 지점 수 | `build-stats.mjs` |
| `stats/index.json` · `stats/national.json` | 41개 지자체 목록·중점분야 · 전국 합계 | `build-stats.mjs` |
| `stats/safety-index.json` | 지역안전지수 등급(2025·2024, 전체본 4곳은 5개년) · 가중치 · 중점분야 | `build-safety-index.mjs` |
| `stats/field-survey.json` | 현장조사단 평가(복합위험지수의 0.5) | `build-field-survey.mjs` |
| `stats/hotspots.json` | 주요 거점 A~J | `build-hotspots.mjs` |
| `stats/region-types.json` | 지자체 유형(도심/도농복합/농촌) 1차 | `classify-regions.mjs` |
| `stats/auri-reports/` | AURI 사전분석 보고서 39곳 글·표 + `img/` 그림(1400px) | `build-auri-reports.mjs` · `shrink-images.mjs` |
| `dong/<지역>.json` | 동별(행정동) HEA 취약도 · 경계선 · 근거 | `build-dong-hea.mjs` |
| `heatmap/` | 분야별 커널밀도 PNG(중점분야) — 사전진단서 분야별 지도 | `build-heatmap.mjs --focus` |
| `overview/<지역>.jpg·json` | 맞춤형 사업 종합도 그림 · 웹 지도 오버레이 | `tools/overview-map/` |
| `hwpx/<지역>.hwpx` | 한글 내려받기 틀(AURI 원본, 그림만 축소) | `build-hwpx-templates.mjs` |

## 7대 분야 열쇠

`suicide` 자살 · `traffic` 교통사고 · `fire` 화재 · `crime` 범죄 · `life` 생활안전 · `industrial` 산업재해 · `infection` 감염병

## 좌표

원본은 EPSG:5186(중부원점)·5179(UTM-K)가 섞여 있고, 결과 파일은 모두 WGS84 위경도입니다(네이버 지도용).
