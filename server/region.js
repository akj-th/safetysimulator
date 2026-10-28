/* ════════════════════════════════════════════════════════════════════
   지점(위경도) → 41개 지자체 — 화면과 같은 판정 (2026-10-28)

   판정 코드는 assets/region-bounds.js, 경계는 data/stats/region-bounds.json — 화면(1단계 지도·리포트·문서·진단 안내)과
   **같은 파일**을 씁니다. 쓰는 곳: AI 판독의 중점 분야(server.js focusFor) · 진단 기록·프로젝트의 지자체(auth.js regionOf).

   예전에는 주소 글자에 41곳 이름이 들어 있는지로 찾았습니다. 그 방식은 옹진군은 맞혔지만,
   주소 표기가 바뀌면(예: 광역 통합으로 시·도 이름이 바뀜) 조용히 못 찾고, 화면(중심점 방식)과 결과가 달랐습니다.
   ════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let _lib = null, _data = null, _failed = false;

/** → { region, label, inside, km } (지자체 경계 안 또는 1km 안) · null (41곳 밖)
      · undefined (좌표가 없거나 경계 파일을 못 읽음 — 부르는 쪽이 주소로 찾습니다) */
export function regionAt(siteRoot, lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return undefined;
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return undefined;
  if (!_data && !_failed) {
    try {
      _lib = require(path.join(siteRoot, 'assets/region-bounds.js'));
      _data = JSON.parse(readFileSync(path.join(siteRoot, 'data/stats/region-bounds.json'), 'utf8'));
    } catch (e) {
      _failed = true;
      console.warn('[지자체 판정] 경계 파일을 읽지 못해 주소 이름으로 찾습니다 —', e.message);
    }
  }
  return _data ? _lib.pick(_data, la, ln) : undefined;
}
