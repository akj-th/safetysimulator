/* ════════════════════════════════════════════════════════════════════
   현장 사진 — 업로드 + EXIF 좌표·촬영시각 읽기

   사전진단서 4장은 왼쪽에 지도, 오른쪽에 현장 사진을 놓습니다.
   사진에 찍힌 위치를 사람이 다시 입력하지 않도록 EXIF 를 읽습니다.

   ── 브라우저에서만 처리합니다 ──────────────────────────────────────
   사진을 서버로 보내지 않습니다. 현장 사진에는 위치와 사람이 찍히므로
   보낼 이유가 없으면 안 보내는 편이 낫습니다.

   ── 좌표가 없는 경우가 많습니다 ────────────────────────────────────
   카카오톡·메신저로 주고받은 사진은 EXIF 가 지워집니다.
   그럴 때는 "지도에서 위치를 지정해 주세요"로 안내하고, 지정한 좌표를
   사진에 붙입니다.

   ── EXIF 를 직접 읽는 이유 ─────────────────────────────────────────
   라이브러리를 쓰지 않는 다른 도구와 같은 이유입니다. JPEG 의 APP1
   구역만 훑으면 되고, 필요한 태그는 GPS 4개와 촬영시각 하나뿐입니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriSitePhoto = (function () {
  const STORE_KEY = 'auri_site_photos';

  /* ── EXIF 읽기 ──────────────────────────────────────────────────── */

  const TAG = {
    0x9003: 'DateTimeOriginal',
    0x0132: 'DateTime',
    0x8825: 'GPSIFD',
  };
  const GPS_TAG = {
    0x0001: 'LatRef', 0x0002: 'Lat', 0x0003: 'LngRef', 0x0004: 'Lng',
  };

  /** JPEG 안에서 EXIF(APP1) 구역을 찾습니다 */
  function findExif(buf) {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;        // JPEG 가 아님
    let o = 2;
    while (o + 4 <= v.byteLength) {
      const marker = v.getUint16(o);
      if ((marker & 0xff00) !== 0xff00) return null;
      const size = v.getUint16(o + 2);
      if (marker === 0xffe1) {
        /* "Exif\0\0" 확인 */
        if (v.getUint32(o + 4) === 0x45786966) return o + 10;
      }
      if (marker === 0xffda) return null;              // 이미지 데이터 시작
      o += 2 + size;
    }
    return null;
  }

  function readIfd(v, tiff, offset, little, want, out) {
    const count = v.getUint16(offset, little);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      const tag = v.getUint16(e, little);
      const name = want[tag];
      if (!name) continue;
      const type = v.getUint16(e + 2, little);
      const num = v.getUint32(e + 4, little);
      const valOff = (type === 5 || type === 10 || num * typeSize(type) > 4)
        ? tiff + v.getUint32(e + 8, little) : e + 8;

      if (type === 2) {                                 // 문자열
        let s = '';
        for (let k = 0; k < num - 1; k++) s += String.fromCharCode(v.getUint8(valOff + k));
        out[name] = s;
      } else if (type === 5) {                          // 분수 (GPS 도·분·초)
        const parts = [];
        for (let k = 0; k < num; k++) {
          const n = v.getUint32(valOff + k * 8, little);
          const d = v.getUint32(valOff + k * 8 + 4, little);
          parts.push(d ? n / d : 0);
        }
        out[name] = parts.length === 1 ? parts[0] : parts;
      } else if (type === 4) {
        out[name] = v.getUint32(valOff, little);
      }
    }
  }
  const typeSize = (t) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[t] || 1);

  /** 파일 → { lat, lng, takenAt } (없으면 각각 null) */
  async function readExif(file) {
    const out = { lat: null, lng: null, takenAt: null };
    try {
      const head = await file.slice(0, 256 * 1024).arrayBuffer();
      const tiff = findExif(head);
      if (tiff === null) return out;

      const v = new DataView(head);
      const little = v.getUint16(tiff) === 0x4949;
      const ifd0 = tiff + v.getUint32(tiff + 4, little);

      const main = {};
      readIfd(v, tiff, ifd0, little, TAG, main);

      /* 촬영시각은 ExifIFD 안에 있는 경우가 많아 한 단계 더 들어갑니다 */
      const exifPtr = (function () {
        const cnt = v.getUint16(ifd0, little);
        for (let i = 0; i < cnt; i++) {
          const e = ifd0 + 2 + i * 12;
          if (v.getUint16(e, little) === 0x8769) return tiff + v.getUint32(e + 8, little);
        }
        return null;
      })();
      if (exifPtr) readIfd(v, tiff, exifPtr, little, TAG, main);

      if (main.GPSIFD) {
        const gps = {};
        readIfd(v, tiff, tiff + main.GPSIFD, little, GPS_TAG, gps);
        const dms = (a) => (Array.isArray(a) ? a[0] + a[1] / 60 + a[2] / 3600 : null);
        const lat = dms(gps.Lat), lng = dms(gps.Lng);
        if (lat !== null && lng !== null) {
          out.lat = gps.LatRef === 'S' ? -lat : lat;
          out.lng = gps.LngRef === 'W' ? -lng : lng;
        }
      }

      const when = main.DateTimeOriginal || main.DateTime;
      if (when) {
        /* EXIF 는 "2026:09:04 14:32:10" 형식입니다 */
        const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(when);
        if (m) out.takenAt = `${m[1]}. ${m[2]}. ${m[3]}. ${m[4]}:${m[5]}`;
      }
    } catch (e) { /* EXIF 가 없거나 형식이 달라도 사진은 씁니다 */ }
    return out;
  }

  /* ── 저장 ───────────────────────────────────────────────────────── */

  function all() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(list) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(list)); }
    catch (e) { alert('사진이 너무 커서 저장하지 못했습니다. 장수를 줄여 주세요.'); }
  }

  /** 긴 변을 이 크기로 줄여 담습니다 — 원본을 그대로 두면 저장 한도를 넘습니다 */
  const MAX_EDGE = 1400;

  function shrink(file) {
    return new Promise(function (resolve) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /** 파일 여러 장을 받아 저장하고, 새로 담긴 목록을 돌려줍니다 */
  async function add(files) {
    const list = all();
    for (const file of files) {
      if (!/^image\//.test(file.type)) continue;
      const [exif, dataUrl] = await Promise.all([readExif(file), shrink(file)]);
      if (!dataUrl) continue;
      list.push({
        id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: file.name,
        dataUrl: dataUrl,
        lat: exif.lat, lng: exif.lng,
        takenAt: exif.takenAt,
        note: '',
        field: null,   // 어느 절에 실을지 — 부르는 쪽이 정합니다 (setField)
      });
    }
    save(list);
    return list;
  }

  function remove(id) {
    save(all().filter(function (p) { return p.id !== id; }));
  }

  /** 좌표가 없던 사진에 사람이 지정한 위치를 붙입니다 */
  function setPosition(id, lat, lng) {
    const list = all();
    const p = list.find(function (x) { return x.id === id; });
    if (!p) return;
    p.lat = lat; p.lng = lng; p.manual = true;
    save(list);
  }

  function setNote(id, note) {
    const list = all();
    const p = list.find(function (x) { return x.id === id; });
    if (!p) return;
    p.note = note;
    save(list);
  }

  /**
   * 사전진단서 4장의 어느 절에 실을지 (분야 열쇠 — crime/fire/suicide …).
   * 사진 자체는 분야를 모르므로 부르는 쪽이 정합니다.
   */
  function setField(id, field) {
    const list = all();
    const p = list.find(function (x) { return x.id === id; });
    if (!p) return;
    p.field = field || null;
    save(list);
  }

  /** 그 절에 실릴 사진들 */
  function byField(field) {
    return all().filter(function (p) { return p.field === field; });
  }

  /** 캡션 한 줄 — 촬영시각과 좌표 출처를 적습니다 */
  function caption(p) {
    const parts = [];
    if (p.takenAt) parts.push(`촬영 ${p.takenAt}`);
    if (p.lat !== null && p.lng !== null) {
      parts.push(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}${p.manual ? ' (지도에서 지정)' : ''}`);
    } else {
      parts.push('위치 정보 없음');
    }
    return parts.join(' · ');
  }

  return { all, add, remove, setPosition, setNote, setField, byField, caption, readExif };
})();
