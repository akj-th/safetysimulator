/* ════════════════════════════════════════════════════════════════════
   119 출동자료 CSV 열기 — 통계(build-stats) · 동별 HEA(build-dong-hea) 공용

   ── 2026-09-15: 강원대 분류(A_type)가 붙은 판으로 교체 ───────────────
   0909 에 강원대가 "사고유형 분류 기준"과 함께 A_type 칸을 붙인 CSV 를
   보냈습니다. 행은 0826 판과 **줄 순서까지 같고** 칸 하나가 늘었을 뿐이라
   (생활안전만 줄 순서가 다르고 내용은 같음 — 순서 무관 대조로 확인)
   건수·연령·성별·시간대 집계는 바뀌지 않습니다.

   A_type 이 무엇을 나눈 것인지는 분야마다 다릅니다 (구급출동자료_행위분류.xlsx).
     화재·범죄·자살      장소       공동주택 · 단독주택 · 교통지역 · 상업시설 …
     생활안전·산재·감염병 사고유형   낙상 · 기계 · 전신증상 …
     교통사고            교통수단   자동차 · 오토바이 · 차대사람 …

   일부는 건축물대장·카카오맵으로 **사람이 재분류**한 값이라 규칙으로 재현할 수
   없습니다. 우리는 이 값을 그대로 옮겨 씁니다.

   ── ⚠️ 화재 파일만 모양이 다릅니다 ──────────────────────────────────
   0826화재_유형.csv 에는 A_type 칸이 없고, **원래 type 칸(연기흡입·화염·화재)에
   장소 분류가 덮어써져** 있습니다. 그래서 0826화재_최종.csv(원래 type)와
   줄 단위로 맞대어, **type 을 뺀 모든 칸이 같을 때만** 두 파일을 결합합니다.
     새 파일 type 칸 → 장소 분류(A_type)
     옛 파일 type 칸 → 원래 사고유형
   한 칸이라도 어긋나면 결합하지 않고 옛 파일만 쓰며(A_type 없음) 경고를 남깁니다.
   강원대가 두 칸을 모두 담은 화재 파일을 다시 보내 주면 이 결합은 필요 없어집니다.
   ════════════════════════════════════════════════════════════════════ */

import path from 'node:path';
import { readCsvFile } from './csv.mjs';

export const INCIDENT_DIR = 'data/raw/analysis_0909/0909_사고유형분류기준/분류 후 구굽출동 결과';
export const LEGACY_DIR = 'data/raw/incidents_0826';

/* 분야 → 파일. 자살·교통사고는 "구급출동만" 파일을 씁니다.
   (자살발생지점은 좌표가 없고, 교통사고 다발지역은 가중치 방식이 달라
    격자·조사지·동 집계에 섞을 수 없습니다) */
export const INCIDENT_FILES = {
  infection: '0826감염병_유형.csv',
  traffic: '0826교통사고_유형.csv',
  crime: '0826범죄_유형.csv',
  industrial: '0826산업재해_유형.csv',
  life: '0826생활안전_유형.csv',
  suicide: '0826자살_유형.csv',
  fire: '0826화재_유형.csv',
};
export const LEGACY_FILES = {
  infection: '0826감염병_최종.csv',
  traffic: '0826교통사고_최종.csv',
  crime: '0826범죄_최종.csv',
  industrial: '0826산업재해_최종.csv',
  life: '0826생활안전_최종.csv',
  suicide: '0826자살_최종.csv',
  fire: '0826화재_최종.csv',
};

/* A_type 이 무엇을 나눈 것인가 — 화면이 "장소"로 읽을지 "유형"으로 읽을지 정합니다 */
export const ATYPE_AXIS = {
  fire: 'place', crime: 'place', suicide: 'place',
  life: 'type', industrial: 'type', infection: 'type',
  traffic: 'vehicle',
};
export const ATYPE_AXIS_LABEL = { place: '발생장소', type: '사고유형', vehicle: '교통수단' };

/* ── 반복 발생 지점 임계값 — 통계(build-stats)와 동별 HEA(build-dong-hea) 공용 ──
   같은 지번주소에서 이 횟수 이상 되풀이되면 "반복 발생 지점"입니다.
   사전진단서 부천시 원문: 범죄 5회 · 감염병 2회 · 자살 3회.
   원문에 없는 분야는 자살과 같은 3회 (담당자 조정 대상).
   ★ 두 도구가 같은 값을 써야 동별 A(반복발생) 와 리포트 2.2 가 어긋나지 않습니다. */
export const REPEAT_THRESHOLD = {
  crime: 5, infection: 2, suicide: 3,
  traffic: 3, fire: 3, life: 3, industrial: 3,
};

/**
 * 한 분야의 CSV 를 엽니다.
 * 돌려주는 것: { file, rows, col(name), type(i), atype(i), note, atypeOk }
 *   rows      원본 줄 배열 (i 번째 줄)
 *   type(i)   원래 사고유형 (type 칸)
 *   atype(i)  강원대 분류 (없으면 '')
 */
export function openIncidents(fs, root, category) {
  const file = INCIDENT_FILES[category];
  const full = path.join(root, INCIDENT_DIR, file);
  const csv = readCsvFile(fs, full);
  const t = csv.col('type');
  const a = csv.header.indexOf('A_type');

  if (a >= 0) {
    return {
      file, rows: csv.rows, col: (n) => csv.col(n), atypeOk: true, note: null,
      type: (i) => String(csv.rows[i][t] ?? '').trim(),
      atype: (i) => String(csv.rows[i][a] ?? '').trim(),
    };
  }

  /* A_type 칸이 없는 파일(화재) — 옛 파일과 줄 단위로 맞대어 결합 */
  const legacyName = LEGACY_FILES[category];
  const legacy = readCsvFile(fs, path.join(root, LEGACY_DIR, legacyName));
  const lt = legacy.col('type');
  const mismatch = alignmentProblem(csv, legacy);
  if (!mismatch) {
    return {
      file: `${file} + ${legacyName}`, rows: csv.rows, col: (n) => csv.col(n), atypeOk: true,
      note: `${file} 에 A_type 칸이 없어 type 칸을 장소 분류로 읽고, 원래 type 은 ${legacyName} 에서 가져왔습니다 (줄 ${csv.rows.length}개 전부 일치 확인)`,
      type: (i) => String(legacy.rows[i][lt] ?? '').trim(),
      atype: (i) => String(csv.rows[i][t] ?? '').trim(),
    };
  }
  return {
    file: legacyName, rows: legacy.rows, col: (n) => legacy.col(n), atypeOk: false,
    note: `⚠ ${file} 와 ${legacyName} 의 줄이 맞지 않아(${mismatch}) 결합하지 않았습니다. 이 분야는 A_type 없이 기존 방식으로 집계합니다`,
    type: (i) => String(legacy.rows[i][lt] ?? '').trim(),
    atype: () => '',
  };
}

/** type 을 뺀 공통 칸이 줄마다 모두 같은가. 같으면 null, 다르면 첫 문제 설명 */
function alignmentProblem(a, b) {
  if (a.rows.length !== b.rows.length) return `줄 수 ${a.rows.length} ≠ ${b.rows.length}`;
  const names = b.header.filter((h) => h && h !== 'type' && a.header.includes(h));
  if (names.length < 10) return `공통 칸이 ${names.length}개뿐`;
  const pairs = names.map((h) => [a.header.indexOf(h), b.header.indexOf(h), h]);
  for (let i = 0; i < a.rows.length; i++) {
    for (const [ia, ib, h] of pairs) {
      if (String(a.rows[i][ia] ?? '').trim() !== String(b.rows[i][ib] ?? '').trim()) {
        return `${i + 1}번째 줄 '${h}' 칸`;
      }
    }
  }
  return null;
}
