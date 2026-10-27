# 작업 안내 (Codex 등 다른 AI 도구용)

이 저장소의 작업 안내는 **[CLAUDE.md](CLAUDE.md)** 한 곳에 있습니다. 작업을 시작하기 전에 CLAUDE.md 를 먼저 읽고,
작업할 주제의 자세한 기록은 [notes/](notes/README.md) 에서 읽으세요.

> 2026-10-27 — 예전 이 파일은 2026-09-04 판 CLAUDE.md 의 사본(58KB)이라 지금 코드와 맞지 않는 내용이 많았습니다.
> 두 곳을 따로 고치면 서로 어긋나므로, 안내는 CLAUDE.md 하나로 모으고 여기에는 꼭 지킬 것만 남깁니다.

## 꼭 지킬 것

- `data/raw/`(119 원본 — 환자 연령·성별·주소) · `docs/`(회의록·내부 자료) · `output/` · `server/.env`(API 키)는 **커밋·외부 복사 금지**.
- 처방(어떤 사업을 넣을지)은 규칙 엔진(`assets/rules.js`)이 정합니다. AI 는 판독과 문장만 씁니다.
- `server/checklist.js` · `assets/rules.js` · `assets/field-check.js` · `assets/space-risk.json` 은 항목 번호로 맞물립니다 — 고친 뒤 `npm run verify-rules --prefix tools`.
- 자료를 다시 만들면 `npm run verify --prefix tools` (295건 대조 + 파일 사이 일치).
- 설명은 쉬운 우리말로(담당자는 개발 비전공).
