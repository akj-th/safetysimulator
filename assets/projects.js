/* ════════════════════════════════════════════════════════════════════
   프로젝트 저장 · 열기 — 모든 화면 공통 (2026-09-15)

   진단 한 건은 이 탭(sessionStorage)에만 있어서 탭을 닫으면 사라집니다.
   계정 줄의 **프로젝트 저장**을 누르면 서버 DB 에 계정별로 저장하고,
   **내 프로젝트**(projects.html)에서 다시 열 수 있습니다.

   지금 이 탭이 어느 프로젝트에서 왔는지는 `auri_project` 에 적어 둡니다.
     { id, title, mine, ownerName, lat, lng }
   - 내 프로젝트를 열었으면 저장할 때 **덮어쓰기**를 고를 수 있습니다.
   - 관리자가 남의 프로젝트를 열었으면(mine:false) 저장은 **항상 새 프로젝트**입니다.
     작성자의 판단 기록을 관리자가 덮어쓰지 않게 하려는 것입니다(서버도 막음).

   무엇을 저장하는지는 서버의 SAVE_KEYS(server/projects.js)와 **같은 목록**입니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriProjects = (function () {
  const SAVE_KEYS = [
    'auri_picked_location', 'auri_input_image', 'auri_diagnosis_results',
    'auri_revision_log', 'auri_rx_overrides', 'auri_prescriptions',
    'auri_region_stats', 'auri_after_image', 'auri_doc_notes', 'auri_site_photos',
  ];
  const META_KEY = 'auri_project';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  function current() { return parse(sessionStorage.getItem(META_KEY) || 'null'); }

  function sizeText(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
    return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  }

  /* 계정 줄에 "프로젝트: ○○" 표시를 맞춥니다 */
  function refreshLabel() {
    const el = document.querySelector('.account-bar .acc-proj');
    if (!el) return;
    const m = current();
    if (!m) { el.hidden = true; return; }
    el.hidden = false;
    el.title = m.title;
    el.innerHTML = '프로젝트: <b>' + esc(m.title) + '</b>'
      + (m.mine ? '' : ' <span class="ro">(' + esc(m.ownerName) + ' · 열람)</span>');
  }

  function snapshot(withPhotos) {
    const data = {};
    for (const k of SAVE_KEYS) {
      if (k === 'auri_site_photos' && !withPhotos) continue;
      const v = sessionStorage.getItem(k);
      if (v) data[k] = v;
    }
    return data;
  }

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({ cache: 'no-store' }, opts));
    const data = await res.json().catch(function () { return {}; });
    if (res.status === 401 && data.needLogin) {
      alert('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');
      if (window.AuriAuth) window.AuriAuth.goLogin('expired');
      throw new Error('로그인이 필요합니다.');
    }
    if (!res.ok) throw new Error(data.error || '서버 오류 (HTTP ' + res.status + ')');
    return data;
  }

  /* ── 저장 창 ─────────────────────────────────────────────────────── */
  function openSaveDialog() {
    const picked = parse(sessionStorage.getItem('auri_picked_location') || 'null');
    if (!picked) {
      alert('저장할 진단이 없습니다. 먼저 지도에서 위치를 선택해 주세요.');
      return;
    }
    const meta = current();
    const photos = parse(sessionStorage.getItem('auri_site_photos') || '[]') || [];
    const region = (parse(sessionStorage.getItem('auri_region_stats') || 'null') || {}).shortLabel;

    /* 덮어쓰기는 **내 프로젝트를 연 탭**에서만. 그사이 위치를 바꿨으면 새로 저장을 먼저 권합니다
       (다른 지점의 진단으로 예전 프로젝트를 덮어쓰는 실수 방지) */
    const canOverwrite = !!(meta && meta.mine);
    const moved = canOverwrite && (Math.abs(Number(meta.lat) - Number(picked.lat)) > 1e-6
                                || Math.abs(Number(meta.lng) - Number(picked.lng)) > 1e-6);
    const defaultTitle = canOverwrite ? meta.title
      : [region, picked.addr].filter(Boolean).join(' · ').slice(0, 80) || '진단 프로젝트';

    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pjTitleH">' +
        '<h2 id="pjTitleH">프로젝트 저장</h2>' +
        '<div class="fld"><label for="pjTitle">이름</label>' +
          '<input type="text" id="pjTitle" maxlength="100" value="' + esc(defaultTitle) + '"></div>' +
        (canOverwrite
          ? '<div class="fld">' +
              '<label class="opt"><input type="radio" name="pjMode" value="overwrite"' + (moved ? '' : ' checked') + '>' +
                '<span>지금 열린 프로젝트에 덮어쓰기<small>' + esc(meta.title) + '</small></span></label>' +
              '<label class="opt"><input type="radio" name="pjMode" value="new"' + (moved ? ' checked' : '') + '>' +
                '<span>새 프로젝트로 저장<small>원래 프로젝트는 그대로 남습니다</small></span></label>' +
              (moved ? '<p class="hint warn">프로젝트를 연 뒤 진단 위치가 바뀌었습니다. 다른 지점이면 새 프로젝트로 저장하세요.</p>' : '') +
            '</div>'
          : (meta && !meta.mine
            ? '<p class="hint">' + esc(meta.ownerName) + '님의 프로젝트를 열람 중입니다. 저장하면 <b>내 프로젝트로 새로</b> 만들어지고 원본은 바뀌지 않습니다.</p>'
            : '')) +
        (photos.length
          ? '<label class="opt"><input type="checkbox" id="pjPhotos" checked>' +
              '<span>현장 사진 ' + photos.length + '장 함께 저장' +
              '<small>사람·차량번호가 찍힌 사진은 서버에 그대로 저장됩니다. 필요 없으면 빼 주세요.</small></span></label>'
          : '') +
        '<p class="hint" id="pjSize"></p>' +
        '<div class="foot">' +
          '<button type="button" class="btn ghost sm" data-act="cancel">취소</button>' +
          '<button type="button" class="btn sm" data-act="save">저장</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    const photoBox = wrap.querySelector('#pjPhotos');
    const showSize = function () {
      const data = snapshot(photoBox ? photoBox.checked : false);
      const bytes = new Blob([JSON.stringify(data)]).size;
      wrap.querySelector('#pjSize').textContent = '저장 크기 약 ' + sizeText(bytes);
    };
    showSize();
    if (photoBox) photoBox.addEventListener('change', showSize);

    const close = function () { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const input = wrap.querySelector('#pjTitle');
    input.focus(); input.select();

    wrap.addEventListener('click', async function (e) {
      if (e.target === wrap) { close(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'cancel') { close(); return; }

      const modeEl = wrap.querySelector('input[name="pjMode"]:checked');
      const overwrite = canOverwrite && (!modeEl || modeEl.value === 'overwrite');
      btn.disabled = true;
      btn.textContent = '저장 중…';
      try {
        const r = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: overwrite ? meta.id : null,
            title: input.value.trim(),
            data: snapshot(photoBox ? photoBox.checked : false),
          }),
        });
        sessionStorage.setItem(META_KEY, JSON.stringify({
          id: r.id, title: r.title, mine: true,
          ownerName: window.AuriAuth && window.AuriAuth.user ? window.AuriAuth.user.name : '',
          lat: picked.lat, lng: picked.lng,
        }));
        refreshLabel();
        close();
        alert((r.created ? '새 프로젝트로 저장했습니다: ' : '덮어써 저장했습니다: ') + r.title);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = '저장';
      }
    });
  }

  /* ── 열기 ────────────────────────────────────────────────────────────
     지금 탭의 진단을 비우고 프로젝트 내용으로 채운 뒤, 진행한 만큼의 화면으로 갑니다.
     판독 결과가 있으면 리포트(3단계), 위치만 있으면 진단(2단계).                 */
  async function open(id) {
    const meta = current();
    const hasWork = !!sessionStorage.getItem('auri_picked_location');
    if (hasWork && !(meta && meta.id === id)
        && !confirm('지금 탭에서 보던 진단을 닫고 이 프로젝트를 엽니다.\n저장하지 않은 내용은 사라집니다. 계속할까요?')) {
      return false;
    }

    const { project } = await api('/api/projects/' + encodeURIComponent(id));

    /* 먼저 비우고 채웁니다 — 앞 진단의 개선 후 이미지 같은 것이 섞여 남지 않게 */
    SAVE_KEYS.forEach(function (k) { sessionStorage.removeItem(k); });
    sessionStorage.removeItem(META_KEY);
    const picked = parse(project.data.auri_picked_location || 'null') || {};
    try {
      for (const k of SAVE_KEYS) {
        if (project.data[k]) sessionStorage.setItem(k, project.data[k]);
      }
      /* "지금 열린 프로젝트" 표시도 같은 보호 안에서 씁니다 — 여기서 공간이 차도 반쯤 남지 않게 */
      sessionStorage.setItem(META_KEY, JSON.stringify({
        id: project.id, title: project.title, mine: project.mine,
        ownerName: project.owner.name, lat: picked.lat, lng: picked.lng,
      }));
    } catch (e) {
      /* 브라우저 저장 공간(보통 5MB)을 넘으면 반쯤 채워진 상태가 남지 않게 다시 비웁니다 */
      SAVE_KEYS.forEach(function (k) { sessionStorage.removeItem(k); });
      sessionStorage.removeItem(META_KEY);
      throw new Error('이 프로젝트가 브라우저 저장 공간보다 커서 열 수 없습니다. 현장 사진을 줄여 다시 저장해 주세요.');
    }

    location.href = project.data.auri_diagnosis_results ? 'report.html'
      : project.data.auri_picked_location ? 'diagnosis.html' : 'index.html';
    return true;
  }

  async function remove(id) {
    await api('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
    const meta = current();
    /* 지금 열린 프로젝트를 지웠으면 연결만 끊습니다(탭의 진단 내용은 그대로) */
    if (meta && meta.id === id) { sessionStorage.removeItem(META_KEY); refreshLabel(); }
  }

  return { openSaveDialog, open, remove, current, refreshLabel, api, sizeText, SAVE_KEYS };
})();

if (typeof window !== 'undefined') window.AuriProjects = AuriProjects;
