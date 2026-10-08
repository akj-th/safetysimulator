/* ════════════════════════════════════════════════════════════════════
   사업 아이템별 아이콘 — 종합도 상자 안 항목 하나하나에 붙는 기호

   회사 예시(231120 당진·보령·서산·천안)처럼 항목마다 "짙은 둥근 사각 + 흰 선 기호"
   를 둡니다. 40×40 칸, 선 2.2px. 기호 이름으로 불러 쓰고 모양은 여기서만 고칩니다.

   2026-10-06 담당자가 일러스트레이터에서 고친 3종(mirror · reflector · emergency-bell)을
   시트(48px 칸)에서 40×40 좌표로 되돌려 넣었습니다. 나머지는 그 톤에 맞춰 좌우대칭·
   비례를 정리했습니다(가로등류는 기둥을 가운데에, 곡선 동선은 같은 S자).

   시안 확인:  node tools/overview-map/build-icon-sheet.mjs namhae
              → output/overview-map/icons/<지역>_아이템아이콘.svg
   ════════════════════════════════════════════════════════════════════ */

const S = 'fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const BG = '#1F2A33';
const dot = (x, y, r = 1.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="none"/>`;
/* 순찰·동선 공용 S자 점선 + 화살머리 (저녁/야간 아이콘이 같은 곡선을 씀) */
const ROUTE = `<path d="M8 33C14 23 20 31 26 23S32 15 33 15" stroke-dasharray="3 3"/><path d="M29 11l4 4-4 4"/>`;

export const ITEM_ICONS = {
  /* ── 시설·설비 ───────────────────────────────────────────────── */
  /* 반사경·안심거울 (담당자 수정본) */
  mirror: `<g ${S}><circle cx="20" cy="14" r="8"/><path d="M18.71 9.17C20.38 8.72 22.23 9.15 23.54 10.46S25.28 13.62 24.83 15.29"/><path d="M20 22L20 33M15 33L25 33"/></g>`,
  /* 안심 유도 반사판 (담당자 수정본) — 흰 판 위 빗금 */
  reflector: `<g ${S}><rect x="7.5" y="7.5" width="25" height="25" rx="4.17"/><rect x="10.63" y="10.63" width="18.75" height="18.75" rx="1.67" fill="#fff" stroke="none"/><path d="M15.28 24.72L24.72 15.28M14.31 19.03L19.02 14.31M20.98 25.69L25.69 20.97" stroke="${BG}"/></g>`,
  /* 안심 비상벨·비상 호출시설 (담당자 수정본) — 벨 + 양쪽 소리 */
  'emergency-bell': `<g ${S}><path d="M11 24C11 17 12 12 20 12S29 17 29 24L11 24Z"/><path d="M9 24L31 24"/><path d="M17 28C17 29.66 18.34 31 20 31S23 29.66 23 28"/><path d="M20 9L20 12"/><path d="M7.77 15C7.77 13.73 8.35 12.53 9.37 11.77"/><path d="M4.13 15C4.12 12.77 5.16 10.67 6.93 9.32"/><path d="M30.63 11.77C31.64 12.53 32.23 13.73 32.23 15"/><path d="M33.07 9.32C34.84 10.67 35.88 12.77 35.88 15"/></g>`,
  /* 건물 외벽 주소 안내사인: 집 외곽 + 번지 명판 (가운데 정렬) */
  'address-sign': `<g ${S}><path d="M7 33V13l13-6 13 6v20"/><path d="M7 33h26"/><rect x="14" y="17" width="12" height="8" rx="1"/><path d="M17 21h6"/></g>`,
  /* 저녁 시간대 순찰 동선 지정: 시계 + S자 동선 */
  'patrol-evening': `<g ${S}><circle cx="12" cy="12" r="6.5"/><path d="M12 8.5V12l2.5 1.8"/>${ROUTE}</g>`,
  /* 야간 순찰 동선 지정: 달 + S자 동선 */
  'patrol-night': `<g ${S}><path d="M14 5.5a7 7 0 1 0 6.5 9.5 6 6 0 0 1-6.5-9.5z"/>${ROUTE}</g>`,
  /* 긴급신고 안내표지: 표지판 + 느낌표·전화 */
  'report-sign': `<g ${S}><rect x="9" y="8" width="22" height="16" rx="1.5"/><path d="M20 24v9M15 33h10"/><path d="M15 12v6"/>${dot(15, 21, 1.1)}<path d="M21 13h5l-1 3 2 3-2 2"/></g>`,
  /* 보안등·벽부등: 벽면 브래킷 조명 */
  'wall-lamp': `<g ${S}><path d="M9 6v28"/><path d="M9 12h9l3 4h-6"/><path d="M21 16l4 5"/><path d="M19 23l-2 4M27 23l2 4M23 25v5" stroke-width="1.6"/></g>`,
  /* 골목길 CCTV 일체형 보안등: 가운데 기둥 + 등 + 카메라 */
  'cctv-lamp': `<g ${S}><path d="M20 33V8"/><path d="M15 8h10l2 4H13z"/><path d="M20 12v3"/><path d="M16 19h8l3 3-3 3h-8z"/>${dot(19, 22, 1.2)}<path d="M15 33h10"/><path d="M9 14l2 3M31 14l-2 3M7 20h3M33 20h-3" stroke-width="1.6"/></g>`,
  /* 야간 보행로 태양광 바닥조명: 바닥선 + 매립등 3개 + 해 */
  'ground-light': `<g ${S}><path d="M5 31h30"/><rect x="8" y="27" width="6" height="4" rx="1"/><rect x="17" y="27" width="6" height="4" rx="1"/><rect x="26" y="27" width="6" height="4" rx="1"/><path d="M11 24v-3M20 24v-3M29 24v-3" stroke-width="1.6"/><circle cx="20" cy="11" r="3.5"/><path d="M20 4.5v2M26.5 11h-2M13.5 11h2M24.6 6.4l-1.4 1.4M15.4 6.4l1.4 1.4" stroke-width="1.6"/></g>`,
  /* 골목길 LED 가로등·보행등: 가운데 기둥 + 등 + 대칭 빛 */
  'led-streetlight': `<g ${S}><path d="M20 33V9"/><path d="M15 9h10l3 4H12z"/><path d="M20 13v3"/><path d="M15 33h10"/><path d="M12 19l2 3M20 20v3.5M28 19l-2 3" stroke-width="1.6"/></g>`,
  /* 다목적 CCTV: 카메라 + 여러 방향 시야 */
  'cctv-multi': `<g ${S}><path d="M9 15h15l4 4-4 4H9z"/><path d="M9 15v8"/>${dot(14, 19, 1.5)}<path d="M9 25v7h6"/><path d="M28 13l5-4M30 19h6M28 25l5 4" stroke-width="1.6"/></g>`,
  /* 기존 항만 CCTV 사각지대 점검·관제센터 연계: 카메라 + 모니터 */
  'cctv-control': `<g ${S}><path d="M6 10h12l3 3-3 3H6z"/>${dot(10, 13, 1.3)}<path d="M6 16v5h5"/><rect x="18" y="19" width="16" height="11" rx="1.5"/><path d="M22 34h8M26 30v4"/><path d="M21 24h6M21 27h4" stroke-width="1.6"/></g>`,
  /* 긴급구조 위치표지판: 표지판 + 위치핀 */
  'location-sign': `<g ${S}><rect x="9" y="7" width="22" height="18" rx="1.5"/><path d="M20 25v8M15 33h10"/><path d="M20 21s-5-4-5-8a5 5 0 0 1 10 0c0 4-5 8-5 8z"/>${dot(20, 13, 1.4)}</g>`,
  /* 비상벨·상담전화: 수화기 + 소리 */
  'emergency-phone': `<g ${S}><path d="M9 9h5l2 5-2 2c1 3 4 6 7 7l2-2 5 2v5c0 1-1 2-2 2C15 30 8 20 8 10c0-1 1-1 1-1z"/><path d="M26 7c3 0 5 2 5 5"/><path d="M26 12c1 0 2 1 2 2" stroke-width="1.6"/></g>`,
  /* 위기상담 안내 전광판: 기둥 위 전광판 */
  billboard: `<g ${S}><rect x="6" y="9" width="28" height="14" rx="1.5"/><path d="M13 23v10M27 23v10"/><path d="M11 16h5M19 16h10M11 19h14" stroke-width="1.6"/>${dot(29, 12.5, 1.2)}</g>`,
  /* 안심 유도표시: 바닥 화살표 유도선 */
  'guide-mark': `<g ${S}><path d="M7 32h26"/><path d="M11 27l9-9 9 9"/><path d="M20 18v9"/><path d="M8 13l4-4 4 4M24 13l4-4 4 4" stroke-width="1.6"/></g>`,
  /* 상가 연계형 안심거점: 상점 차양 + 방패 */
  'safe-shop': `<g ${S}><path d="M7 15l2-6h22l2 6"/><path d="M7 15c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3"/><path d="M9 18v15h22V18"/><path d="M20 21l4 1.5v3c0 2.5-2 4-4 4.5-2-.5-4-2-4-4.5v-3z"/></g>`,
  /* ── 사람·운영 ───────────────────────────────────────────────── */
  /* 사회적 고립 위험가구 정기 안부 확인: 집 + 체크 */
  'visit-check': `<g ${S}><path d="M7 19l13-10 13 10"/><path d="M10 17v15h20V17"/><path d="M15 25l3 3 7-7"/></g>`,
  /* 건강음료 배달 안부 확인: 가운데 병 + 하트 */
  'delivery-drink': `<g ${S}><path d="M16 7h8v4l2 3v17a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V14l2-3z"/><path d="M14 19h12"/><path d="M31 18s-4-2.5-4-5a2.2 2.2 0 0 1 4-1 2.2 2.2 0 0 1 4 1c0 2.5-4 5-4 5z"/></g>`,
  /* 우울·불안 예방 및 심리상담 지원: 말풍선 둘 + 하트 */
  counseling: `<g ${S}><path d="M6 9h16v10H12l-4 4v-4H6z"/><path d="M22 17h12v9h-3v4l-4-4h-5z"/><path d="M14 16s-3-2-3-3.8a1.6 1.6 0 0 1 3-.7 1.6 1.6 0 0 1 3 .7c0 1.8-3 3.8-3 3.8z" fill="#fff" stroke="none"/></g>`,
  /* 주민 참여 자살위험 조기 발견·신고: 사람들 + 경고 */
  'community-watch': `<g ${S}><circle cx="13" cy="12" r="3.5"/><circle cx="23" cy="12" r="3.5"/><path d="M5 29c0-6 3-9 8-9s8 3 8 9"/><path d="M17 29c0-6 3-9 8-9 2 0 3.5.5 5 1.5"/><path d="M32 21v6"/>${dot(32, 30.5, 1.2)}</g>`,
  /* ── 2026-10-08 남해 최종본에서 새로 필요한 것 ─────────────────────── */
  /* 수변 인명구조함·구명환 */
  lifebuoy: `<g ${S}><circle cx="20" cy="20" r="11"/><circle cx="20" cy="20" r="5"/><path d="M20 9v6M20 25v6M9 20h6M25 20h6"/></g>`,
  /* 안전난간 */
  railing: `<g ${S}><path d="M6 15h28"/><path d="M6 22h28"/><path d="M10 15v18M20 15v18M30 15v18"/><path d="M4 33h32"/></g>`,
  /* 교육·생명지킴이 */
  education: `<g ${S}><path d="M6 15l14-6 14 6-14 6z"/><path d="M12 18v7c0 2 4 4 8 4s8-2 8-4v-7"/><path d="M34 15v8"/></g>`,
  /* AED·구급 */
  aed: `<g ${S}><path d="M20 32s-11-7-11-15a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-11 15-11 15z"/><path d="M22 11l-4 8h5l-4 8" stroke-width="2"/></g>`,
  /* CO 경보기·안전키트 */
  'co-alarm': `<g ${S}><circle cx="20" cy="18" r="10"/><circle cx="20" cy="18" r="4"/><path d="M20 4v3M31 7l-2 2M9 7l2 2" stroke-width="1.6"/><path d="M14 31h12M16 34h8" stroke-width="1.6"/></g>`,
  /* 센서형 음성안내기·스피커 */
  speaker: `<g ${S}><path d="M8 16h6l8-6v20l-8-6H8z"/><path d="M26 15a6 6 0 0 1 0 10"/><path d="M29 11a11 11 0 0 1 0 18"/></g>`,
};
