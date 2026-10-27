# AI 안전 진단 시뮬레이터 (safetysimulator)

거리 사진으로 도시 공간의 안전 취약성(7대 사회재난)을 진단하고, 규칙 기반으로 개선 사업을 처방한 뒤,
개선 전/후 이미지와 행정 문서를 만드는 연구용 프로토타입입니다.
건축공간연구원(AURI) 「안전사업지구 사업모델 개발 연구용역」의 위탁과업으로 ATELIER KJ 가 만듭니다.

## 실행 (내 컴퓨터)

1. Node.js 22 이상
2. `server/.env.example` 을 `server/.env` 로 복사하고 API 키와 `AUTH_MODE=off` 를 적습니다(이 파일은 커밋되지 않습니다)
3. `cd server && npm install && npm start` → http://localhost:8787

## 폴더

| 폴더 | 무엇 |
|---|---|
| 최상단 `*.html` | 화면 — 위치 선택 → 진단 → 리포트 → 개선 이미지 → 문서 · 로그인·관리·프로젝트 |
| `assets/` | 화면 공통 스크립트·디자인·사업 팔레트 |
| `server/` | 화면 서빙 · AI 판독 중계 · 로그인·프로젝트 저장 |
| `data/` | 앱이 읽는 집계·비식별 자료 ([data/README.md](data/README.md)) |
| `tools/` | 원본 → 자료 만들기·점검 도구 ([tools/README.md](tools/README.md)) |
| `notes/` | 기능별 자세한 기록 ([notes/README.md](notes/README.md)) |

작업 규칙·지금 기준의 결정은 [CLAUDE.md](CLAUDE.md) 에 있습니다.
원본 자료(`data/raw/`)·내부 문서(`docs/`)·큰 결과물(`output/`)은 개인정보·내부 논의가 있어 저장소에 넣지 않습니다.
