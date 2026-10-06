/* ════════════════════════════════════════════════════════════════════
   종합도 아이콘 — 40×40 칸 안에 흰 선으로 그린 단순 기호

   회사 예시(당진·보령·서산·천안)처럼 "짙은 둥근 사각 바탕 + 흰 기호" 로
   씁니다. 기호 이름으로 불러 쓰고, 모양을 바꾸려면 여기 한 곳만 고칩니다.
   ════════════════════════════════════════════════════════════════════ */

const S = 'fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  /* CCTV */
  cctv: `<g ${S}><path d="M8 14h17l4 4-4 4H8z"/><path d="M8 14v8"/><path d="M25 22l5 8"/><path d="M26 30h8"/><circle cx="13" cy="18" r="1.6" fill="#fff" stroke="none"/><path d="M8 24v7h5"/></g>`,
  /* 보안등·가로등 */
  lamp: `<g ${S}><path d="M14 33V11"/><path d="M14 11h10l3 4H11z"/><path d="M19 15v4"/><path d="M9 33h10"/><path d="M19 23l2 4M15 24l-2 4M23 23l4 2"/></g>`,
  /* 반사경·안심거울 */
  mirror: `<g ${S}><circle cx="20" cy="15" r="8"/><circle cx="20" cy="15" r="4.2"/><path d="M20 23v10"/><path d="M15 33h10"/></g>`,
  /* 비상벨 */
  bell: `<g ${S}><path d="M12 26c0-7 1-13 8-13s8 6 8 13z"/><path d="M10 26h20"/><path d="M17 30a3 3 0 0 0 6 0"/><path d="M20 9v4"/></g>`,
  /* 안내표지·사인 */
  sign: `<g ${S}><rect x="10" y="9" width="20" height="14" rx="1.5"/><path d="M20 23v10M15 33h10"/><path d="M20 12v5"/><circle cx="20" cy="20" r="0.9" fill="#fff" stroke="none"/></g>`,
  /* 보행자 */
  walk: `<g ${S}><circle cx="21" cy="9" r="3"/><path d="M17 33l3-9 4 3 1 6"/><path d="M20 24l-2-6 4-4 5 3 3 5"/><path d="M15 20l3-6"/></g>`,
  /* 순찰차 */
  car: `<g ${S}><path d="M8 25v-6l4-7h16l4 7v6z"/><circle cx="13" cy="28" r="2.5"/><circle cx="27" cy="28" r="2.5"/><path d="M8 19h24"/><path d="M17 9h6v3h-6z"/></g>`,
  /* 상담·안부 */
  heart: `<g ${S}><path d="M20 32s-11-7-11-15a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-11 15-11 15z"/></g>`,
  /* 구급·보건 */
  ambulance: `<g ${S}><rect x="7" y="13" width="26" height="14" rx="1.5"/><path d="M26 13l4-5"/><circle cx="13" cy="30" r="2.5"/><circle cx="27" cy="30" r="2.5"/><path d="M16 20h8M20 16v8"/></g>`,
  /* 주거·마을 */
  home: `<g ${S}><path d="M8 20l12-10 12 10"/><path d="M11 18v14h18V18"/><path d="M17 32v-8h6v8"/></g>`,
  /* 항만·선박 */
  ship: `<g ${S}><path d="M7 25h26l-4 7H11z"/><path d="M12 25v-7h16v7"/><path d="M20 18v-8"/><path d="M15 14h10"/></g>`,
  /* 산지 */
  mountain: `<g ${S}><path d="M6 31l9-15 6 9 4-5 9 11z"/><path d="M15 16l2 3"/></g>`,
  /* LED·조명 확충 */
  led: `<g ${S}><circle cx="20" cy="17" r="6"/><path d="M20 5v4M30 8l-3 3M10 8l3 3M8 17h4M28 17h4"/><path d="M16 26h8M17 30h6"/></g>`,
  /* 상담전화 */
  phone: `<g ${S}><path d="M12 8h6l3 7-3 3c2 4 5 7 9 9l3-3 7 3v6c0 1-1 2-2 2C21 35 5 19 5 9c0-1 1-1 1-1z" transform="translate(2 0) scale(.92)"/></g>`,
  /* 야간 시인성·시야 */
  eye: `<g ${S}><path d="M6 20s6-9 14-9 14 9 14 9-6 9-14 9S6 20 6 20z"/><circle cx="20" cy="20" r="4"/></g>`,
  /* 공동체·주민참여 */
  people: `<g ${S}><circle cx="14" cy="13" r="3.5"/><circle cx="26" cy="13" r="3.5"/><path d="M6 30c0-6 3-9 8-9s8 3 8 9"/><path d="M18 30c0-6 3-9 8-9s8 3 8 9"/></g>`,
  /* 전광판·안내 */
  board: `<g ${S}><rect x="7" y="10" width="26" height="14" rx="1.5"/><path d="M11 15h8M11 19h12"/><path d="M14 24v9M26 24v9"/></g>`,
};

/** <symbol> 묶음 — SVG <defs> 에 한 번 넣고 <use href="#ic-cctv"> 로 씁니다 */
export function iconDefs(bg = '#1F2A33') {
  return Object.entries(ICONS).map(([k, g]) =>
    `<symbol id="ic-${k}" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="${bg}"/>${g}</symbol>`).join('\n');
}
