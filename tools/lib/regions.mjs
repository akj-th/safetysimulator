/* ════════════════════════════════════════════════════════════════════
   지자체 매칭표 — 119 CSV / 조사지 SHP / 강원대 엑셀을 하나로 잇습니다

   세 자료가 지역을 서로 다르게 적어 놓아서 표가 필요합니다.

     119 CSV      "경기도" + "부천시 원미구"   ← 일반구까지 쪼개져 있음
     조사지 SHP   bucheon_OverlapUnion_1.shp   ← 영문 슬러그
     강원대 엑셀   "부천시"                     ← 시 단위

   ── 합치는 규칙 ────────────────────────────────────────────────────
   · 부천시  = 부천시 + 원미구 + 소사구 + 오정구 (일반구 4개를 하나로)
   · 제주도  = 제주시 + 서귀포시 (조사지가 도 전체 기준으로 1개)
   · 중구 3개는 시도로 구분 — 대구 / 대전 / 울산
     (조사지 면적으로 교차 확인했습니다: 대구 75ha · 대전 208ha · 울산 185ha)
   ════════════════════════════════════════════════════════════════════ */

/* slug: { 표시명, 짧은이름, 엑셀 지자체명, 119 CSV 의 [시도, 긴급_1] 목록 } */
export const REGIONS = {
  andong:     { label: '경상북도 안동시',       short: '안동시',    xlsx: '안동시',    match: [['경상북도', '안동시']] },
  bucheon:    { label: '경기도 부천시',         short: '부천시',    xlsx: '부천시',    match: [['경기도', '부천시'], ['경기도', '부천시 원미구'], ['경기도', '부천시 소사구'], ['경기도', '부천시 오정구']] },
  bukgu:      { label: '광주광역시 북구',       short: '광주 북구',  xlsx: '광주 북구', match: [['광주광역시', '북구']] },
  cheongsong: { label: '경상북도 청송군',       short: '청송군',    xlsx: '청송군',    match: [['경상북도', '청송군']] },
  dangjin:    { label: '충청남도 당진시',       short: '당진시',    xlsx: '당진시',    match: [['충청남도', '당진시']] },
  danyang:    { label: '충청북도 단양군',       short: '단양군',    xlsx: '단양군',    match: [['충청북도', '단양군']] },
  donggu:     { label: '부산광역시 동구',       short: '부산 동구',  xlsx: '동구',      match: [['부산광역시', '동구']] },
  gangjin:    { label: '전라남도 강진군',       short: '강진군',    xlsx: '강진군',    match: [['전라남도', '강진군']] },
  geumcheon:  { label: '서울특별시 금천구',     short: '금천구',    xlsx: '금천구',    match: [['서울특별시', '금천구']] },
  gjunggu:    { label: '대구광역시 중구',       short: '대구 중구',  xlsx: '대구 중구', match: [['대구광역시', '중구']] },
  goheung:    { label: '전라남도 고흥군',       short: '고흥군',    xlsx: '고흥군',    match: [['전라남도', '고흥군']] },
  gongju:     { label: '충청남도 공주시',       short: '공주시',    xlsx: '공주시',    match: [['충청남도', '공주시']] },
  gwanak:     { label: '서울특별시 관악구',     short: '관악구',    xlsx: '관악구',    match: [['서울특별시', '관악구']] },
  hamyang:    { label: '경상남도 함양군',       short: '함양군',    xlsx: '함양군',    match: [['경상남도', '함양군']] },
  hongcheon:  { label: '강원특별자치도 홍천군', short: '홍천군',    xlsx: '홍천군',    match: [['강원특별자치도', '홍천군']] },
  jangheung:  { label: '전라남도 장흥군',       short: '장흥군',    xlsx: '장흥군',    match: [['전라남도', '장흥군']] },
  jangsu:     { label: '전북특별자치도 장수군', short: '장수군',    xlsx: '장수군',    match: [['전북특별자치도', '장수군']] },
  jecheon:    { label: '충청북도 제천시',       short: '제천시',    xlsx: '제천시',    match: [['충청북도', '제천시']] },
  jeju:       { label: '제주특별자치도',        short: '제주도',    xlsx: '제주도',    match: [['제주특별자치도', '제주시'], ['제주특별자치도', '서귀포시']] },
  jeongeup:   { label: '전북특별자치도 정읍시', short: '정읍시',    xlsx: '정읍시',    match: [['전북특별자치도', '정읍시']] },
  jeongseon:  { label: '강원특별자치도 정선군', short: '정선군',    xlsx: '정선군',    match: [['강원특별자치도', '정선군']] },
  jinan:      { label: '전북특별자치도 진안군', short: '진안군',    xlsx: '진안군',    match: [['전북특별자치도', '진안군']] },
  jindo:      { label: '전라남도 진도군',       short: '진도군',    xlsx: '진도군',    match: [['전라남도', '진도군']] },
  jjunggu:    { label: '대전광역시 중구',       short: '대전 중구',  xlsx: '대전 중구', match: [['대전광역시', '중구']] },
  michuhol:   { label: '인천광역시 미추홀구',   short: '미추홀구',  xlsx: '미추홀구',  match: [['인천광역시', '미추홀구']] },
  miryang:    { label: '경상남도 밀양시',       short: '밀양시',    xlsx: '밀양시',    match: [['경상남도', '밀양시']] },
  mokpo:      { label: '전라남도 목포시',       short: '목포시',    xlsx: '목포시',    match: [['전라남도', '목포시']] },
  naju:       { label: '전라남도 나주시',       short: '나주시',    xlsx: '나주시',    match: [['전라남도', '나주시']] },
  namhae:     { label: '경상남도 남해군',       short: '남해군',    xlsx: '남해군',    match: [['경상남도', '남해군']] },
  namwon:     { label: '전북특별자치도 남원시', short: '남원시',    xlsx: '남원시',    match: [['전북특별자치도', '남원시']] },
  ongjin:     { label: '인천광역시 옹진군',     short: '옹진군',    xlsx: '옹진군',    match: [['인천광역시', '옹진군']] },
  pocheon:    { label: '경기도 포천시',         short: '포천시',    xlsx: '포천시',    match: [['경기도', '포천시']] },
  sacheon:    { label: '경상남도 사천시',       short: '사천시',    xlsx: '사천시',    match: [['경상남도', '사천시']] },
  sasanggu:   { label: '부산광역시 사상구',     short: '사상구',    xlsx: '사상구',    match: [['부산광역시', '사상구']] },
  sejong:     { label: '세종특별자치시',        short: '세종시',    xlsx: '세종시',    match: [['세종특별자치시', '세종특별자치시']] },
  seocheon:   { label: '충청남도 서천군',       short: '서천군',    xlsx: '서천군',    match: [['충청남도', '서천군']] },
  taebaek:    { label: '강원특별자치도 태백시', short: '태백시',    xlsx: '태백시',    match: [['강원특별자치도', '태백시']] },
  ujunggu:    { label: '울산광역시 중구',       short: '울산 중구',  xlsx: '울산 중구', match: [['울산광역시', '중구']] },
  yeongcheon: { label: '경상북도 영천시',       short: '영천시',    xlsx: '영천시',    match: [['경상북도', '영천시']] },
  yeongdogu:  { label: '부산광역시 영도구',     short: '영도구',    xlsx: '영도구',    match: [['부산광역시', '영도구']] },
  yeongju:    { label: '경상북도 영주시',       short: '영주시',    xlsx: '영주시',    match: [['경상북도', '영주시']] },
};

/* ── 주소가 잘못 붙은 행 바로잡기 ──────────────────────────────────
   원본에서 시도·시군구가 틀리게 적힌 85건입니다. 좌표는 멀쩡하므로
   좌표를 근거로 제자리를 찾아 주었습니다. 이 85건을 되돌려 놓아야
   강원대 표본수 표와 숫자가 정확히 맞습니다(tools/verify-stats.mjs).

   ① 서울특별시 중구 → 대구광역시 중구 (83건)
      주소가 "서울특별시 중구 태평로1·2가"로 적혀 있으나 좌표는
      전부 동경 128.59 / 북위 35.87 — 대구 중구 태평로입니다.
      서울과 대구에 같은 이름의 동이 있어 지오코딩이 서울로 붙은 것.
      83건 중 32건은 대구 조사지 안에 들어갑니다.

   ② 시군구가 비어 있는 충청남도 2건
      주소에 시군구가 없어 좌표로만 판별했습니다.                    */
export const RELABELLED = {
  '서울특별시|중구': 'gjunggu',
};

/** 시군구가 비어 있어 좌표로만 찾을 수 있는 행 (허용 오차 약 100m) */
export const BY_COORD = [
  { lng: 127.1512943, lat: 36.33323713, slug: 'gongju' },   // 교통사고 1건
  { lng: 126.5343009, lat: 36.96210678, slug: 'dangjin' },  // 산업재해 1건
];

/* [시도, 긴급_1] → slug 를 한 번에 찾기 위한 색인 */
const INDEX = new Map();
for (const [slug, r] of Object.entries(REGIONS)) {
  for (const [sido, sgg] of r.match) INDEX.set(`${sido}|${sgg}`, slug);
}
for (const [key, slug] of Object.entries(RELABELLED)) INDEX.set(key, slug);

/**
 * 119 CSV 한 줄 → slug. 대상 지자체가 아니면 null
 * 시군구가 비어 있으면 좌표로 한 번 더 찾아봅니다.
 */
export function slugFor(sido, sigungu, lng, lat) {
  const key = `${(sido || '').trim()}|${(sigungu || '').trim()}`;
  const hit = INDEX.get(key);
  if (hit) return hit;

  if (isFinite(lng) && isFinite(lat)) {
    for (const c of BY_COORD) {
      if (Math.abs(c.lng - lng) < 0.002 && Math.abs(c.lat - lat) < 0.002) return c.slug;
    }
  }
  return null;
}

/** 원본 주소가 틀려서 우리가 옮겨 놓은 행인지 (로그에 표시하려고 씁니다) */
export function isRelabelled(sido, sigungu) {
  return Object.hasOwn(RELABELLED, `${(sido || '').trim()}|${(sigungu || '').trim()}`);
}

/** 강원대 엑셀의 지자체명 → slug. '*울산 중구' 처럼 앞에 붙은 표시는 떼어냅니다 */
export function slugForXlsx(name) {
  const clean = (name || '').replace(/^[*※\s]+/, '').trim();
  for (const [slug, r] of Object.entries(REGIONS)) if (r.xlsx === clean) return slug;
  return null;
}

/* ── 7대 사회재난 ────────────────────────────────────────────────── */

/** 원본 `분류기`(영문 코드) → 앱 key */
export const CATEGORY_BY_CODE = {
  SUICIDE: 'suicide', TRAFFIC: 'traffic', FIRE: 'fire', CRIME: 'crime',
  LIFE: 'life', INDUSTRIAL: 'industrial', INFECTIOUS: 'infection',
};

/** 앱 key → 화면에 쓰는 한글 이름 */
export const CATEGORY_LABEL = {
  suicide: '자살', traffic: '교통사고', fire: '화재', crime: '범죄',
  life: '생활안전', industrial: '산업재해', infection: '감염병',
};

/** 강원대 엑셀이 쓰는 한글 분야명 → 앱 key (표기가 조금씩 다릅니다) */
export const CATEGORY_BY_KOREAN = {
  '자살': 'suicide', '교통사고': 'traffic', '교통': 'traffic', '화재': 'fire',
  '범죄': 'crime', '생활안전': 'life', '산재': 'industrial', '산업재해': 'industrial',
  '감염병': 'infection',
};

/** 화면·문서에서 분야를 늘 같은 순서로 보여주기 위한 기준 순서 */
export const CATEGORY_ORDER = ['traffic', 'fire', 'crime', 'life', 'industrial', 'suicide', 'infection'];
