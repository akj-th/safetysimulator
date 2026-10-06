/* ════════════════════════════════════════════════════════════════════
   사업 아이템별 아이콘 — 종합도 상자 안 항목 하나하나에 붙는 기호

   회사 예시(231120 당진·보령·서산·천안)처럼 항목마다 "짙은 둥근 사각 + 흰 선 기호"
   를 둡니다. 40×40 칸, 선 2.2px. 기호 이름으로 불러 쓰고 모양은 여기서만 고칩니다.

   시안 확인:  node tools/overview-map/build-icon-sheet.mjs namhae
              → output/overview-map/icons/<지역>_아이템아이콘.svg
   ════════════════════════════════════════════════════════════════════ */

const S = 'fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const dot = (x, y, r = 1.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="none"/>`;

export const ITEM_ICONS = {
  /* ── 시설·설비 ───────────────────────────────────────────────── */
  /* 반사경·안심거울: 기둥 위 볼록거울 */
  mirror: `<g ${S}><circle cx="20" cy="14" r="8"/><path d="M15 12a6 6 0 0 1 8-3"/><path d="M20 22v11M15 33h10"/></g>`,
  /* 건물 외벽 주소 안내사인: 벽면 + 번지 명판 */
  'address-sign': `<g ${S}><path d="M7 33V13l13-6 13 6v20"/><path d="M7 33h26"/><rect x="14" y="17" width="12" height="8" rx="1"/><path d="M17 21h6"/><path d="M23 29v4"/></g>`,
  /* 안심 유도 반사판: 기둥에 반사 마름모 3개 */
  reflector: `<g ${S}><path d="M20 7v26M14 33h12"/><path d="M20 9l5 4-5 4-5-4z"/><path d="M20 17l5 4-5 4-5-4z"/><path d="M20 25l4 3"/></g>`,
  /* 저녁 시간대 순찰 동선 지정: 시계 + 점선 경로 */
  'patrol-evening': `<g ${S}><circle cx="13" cy="13" r="7"/><path d="M13 9v4l3 2"/><path d="M8 33c6-7 10-3 14-8s6-6 10-4" stroke-dasharray="3 3"/><path d="M29 18l4 3-4 3"/></g>`,
  /* 안심 비상벨·비상 호출시설: 벨 + 누름 버튼 */
  'emergency-bell': `<g ${S}><path d="M11 24c0-7 1-12 9-12s9 5 9 12z"/><path d="M9 24h22"/><path d="M17 28a3 3 0 0 0 6 0"/><path d="M20 9v3"/><path d="M5 16l3-2M35 16l-3-2"/>${dot(20, 20, 1.6)}</g>`,
  /* 긴급신고 안내표지: 표지판 + 느낌표 + 전화 */
  'report-sign': `<g ${S}><rect x="9" y="8" width="22" height="16" rx="1.5"/><path d="M20 24v9M15 33h10"/><path d="M15 12v6"/>${dot(15, 21, 1.1)}<path d="M21 13h5l-1 3 2 3-2 2"/></g>`,
  /* 보안등·벽부등: 벽면 브래킷 조명 */
  'wall-lamp': `<g ${S}><path d="M9 6v28"/><path d="M9 12h9l3 4h-6"/><path d="M21 16l4 5"/><path d="M19 23l-2 4M27 23l2 4M23 25v5" stroke-width="1.6"/></g>`,
  /* 골목길 CCTV 일체형 보안등: 기둥 + 등 + 카메라 */
  'cctv-lamp': `<g ${S}><path d="M13 33V9"/><path d="M13 9h10l3 4H10z"/><path d="M18 13v3"/><path d="M15 20h8l3 3-3 3h-8z"/>${dot(18, 23, 1.2)}<path d="M9 33h8"/><path d="M27 17l2 3M30 23h3" stroke-width="1.6"/></g>`,
  /* 야간 보행로 태양광 바닥조명: 바닥선 + 매립등 + 해 */
  'ground-light': `<g ${S}><path d="M5 30h30"/><path d="M9 30v-3h5v3M18 30v-3h5v3M27 30v-3h5v3"/><circle cx="29" cy="12" r="4"/><path d="M29 5v2M36 12h-2M24 7l1 1M34 7l-1 1" stroke-width="1.6"/><path d="M11 24l1-2M20 24l0-2M29 24l-1-2" stroke-width="1.6"/></g>`,
  /* 골목길 LED 가로등·보행등: 가로등 + LED 빛 */
  'led-streetlight': `<g ${S}><path d="M15 33V10"/><path d="M15 10h9l3 4H12z"/><path d="M20 14v3"/><path d="M11 33h8"/><path d="M26 19l-1 3M20 20v3M14 19l1 3" stroke-width="1.6"/><path d="M27 8h6M30 5v6" stroke-width="1.6"/></g>`,
  /* 다목적 CCTV: 카메라 + 여러 방향 시야 */
  'cctv-multi': `<g ${S}><path d="M9 15h15l4 4-4 4H9z"/><path d="M9 15v8"/>${dot(14, 19, 1.5)}<path d="M9 25v7h6"/><path d="M28 13l5-4M30 19h6M28 25l5 4" stroke-width="1.6"/></g>`,
  /* 기존 항만 CCTV 사각지대 점검·관제센터 연계: 카메라 + 모니터 */
  'cctv-control': `<g ${S}><path d="M6 10h12l3 3-3 3H6z"/>${dot(10, 13, 1.3)}<path d="M6 16v5h5"/><rect x="18" y="19" width="16" height="11" rx="1.5"/><path d="M22 34h8M26 30v4"/><path d="M21 24h6M21 27h4" stroke-width="1.6"/></g>`,
  /* 긴급구조 위치표지판: 표지판 + 위치핀 */
  'location-sign': `<g ${S}><rect x="9" y="7" width="22" height="18" rx="1.5"/><path d="M20 25v8M15 33h10"/><path d="M20 21s-5-4-5-8a5 5 0 0 1 10 0c0 4-5 8-5 8z"/>${dot(20, 13, 1.4)}</g>`,
  /* 비상벨·상담전화: 수화기 + 벨 */
  'emergency-phone': `<g ${S}><path d="M9 9h5l2 5-2 2c1 3 4 6 7 7l2-2 5 2v5c0 1-1 2-2 2C15 30 8 20 8 10c0-1 1-1 1-1z"/><path d="M26 7c3 0 5 2 5 5"/><path d="M26 12c1 0 2 1 2 2" stroke-width="1.6"/></g>`,
  /* 위기상담 안내 전광판: 기둥 위 전광판 + 수화기 */
  billboard: `<g ${S}><rect x="6" y="9" width="28" height="14" rx="1.5"/><path d="M13 23v10M27 23v10"/><path d="M11 16h5M19 16h10M11 19h14" stroke-width="1.6"/>${dot(29, 12.5, 1.2)}</g>`,
  /* 안심 유도표시: 바닥 화살표 유도선 */
  'guide-mark': `<g ${S}><path d="M7 32h26"/><path d="M11 27l9-9 9 9"/><path d="M20 18v9"/><path d="M8 13l4-4 4 4M24 13l4-4 4 4" stroke-width="1.6"/></g>`,
  /* 상가 연계형 안심거점: 상점 차양 + 방패 */
  'safe-shop': `<g ${S}><path d="M7 15l2-6h22l2 6"/><path d="M7 15c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3"/><path d="M9 18v15h22V18"/><path d="M20 21l4 1.5v3c0 2.5-2 4-4 4.5-2-.5-4-2-4-4.5v-3z"/></g>`,
  /* 야간 순찰 동선 지정: 달 + 점선 경로 */
  'patrol-night': `<g ${S}><path d="M16 7a7 7 0 1 0 6 10 6 6 0 0 1-6-10z"/><path d="M8 33c6-7 10-3 14-8s6-6 10-4" stroke-dasharray="3 3"/><path d="M29 18l4 3-4 3"/></g>`,
  /* ── 사람·운영 ───────────────────────────────────────────────── */
  /* 사회적 고립 위험가구 정기 안부 확인: 집 + 체크 */
  'visit-check': `<g ${S}><path d="M7 19l13-10 13 10"/><path d="M10 17v15h20V17"/><path d="M15 25l3 3 7-7"/></g>`,
  /* 건강음료 배달을 통한 안부 확인: 병 + 하트 */
  'delivery-drink': `<g ${S}><path d="M15 7h6v4l2 3v18H13V14l2-3z"/><path d="M13 20h10"/><path d="M27 20s-4-2.5-4-5a2.2 2.2 0 0 1 4-1 2.2 2.2 0 0 1 4 1c0 2.5-4 5-4 5z"/><path d="M26 25l4 4M30 25l-4 4" stroke-width="1.6"/></g>`,
  /* 우울·불안 예방 및 심리상담 지원: 말풍선 둘 + 하트 */
  counseling: `<g ${S}><path d="M6 9h16v10H12l-4 4v-4H6z"/><path d="M22 17h12v9h-3v4l-4-4h-5z"/><path d="M14 16s-3-2-3-3.8a1.6 1.6 0 0 1 3-.7 1.6 1.6 0 0 1 3 .7c0 1.8-3 3.8-3 3.8z" fill="#fff" stroke="none"/></g>`,
  /* 주민 참여 자살위험 조기 발견·신고: 사람들 + 경고 */
  'community-watch': `<g ${S}><circle cx="13" cy="12" r="3.5"/><circle cx="23" cy="12" r="3.5"/><path d="M5 29c0-6 3-9 8-9s8 3 8 9"/><path d="M17 29c0-6 3-9 8-9 2 0 3.5.5 5 1.5"/><path d="M32 21v6"/>${dot(32, 30.5, 1.2)}</g>`,
};
