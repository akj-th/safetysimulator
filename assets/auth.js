/* ════════════════════════════════════════════════════════════════════
   로그인 계정 줄 — 모든 화면 공통 (2026-09-14)

   상단 바 위에 한 줄로 보여 줍니다.
     홍길동 (hong01) · AURI   남은 시간 28:41   로그인 유지 · 계정 관리 · 로그아웃

   ★ 실제 문지기는 서버입니다. 로그인하지 않으면 서버가 화면 자체를 내주지
     않습니다(server.js serveStatic). 이 파일은 **보여 주기와 시간 알림**만 합니다.

   세션 — 마지막 활동 후 30분
   ──────────────────────────
   화면을 열거나 AI 기능을 쓰면 서버가 만료를 30분 뒤로 밉니다.
   가만히 두면 줄어들고, **5분 남으면** 이 줄이 경고로 바뀌며 "로그인 유지"를
   누를 수 있습니다. 0이 되면 로그인 화면으로 갑니다.

   1분마다 서버에 남은 시간을 다시 묻습니다 — 다른 탭에서 연장했을 수 있기
   때문입니다. 묻는 것 자체로는 시간이 늘지 않습니다(창만 열어 두면 끝나야 하므로).
   ════════════════════════════════════════════════════════════════════ */

const AuriAuth = (function () {
  const WARN_SEC = 5 * 60;
  let _me = null;
  let _expiresAt = 0;          // 브라우저 시계 기준으로 고친 만료 시각(ms)
  let _bar = null;
  let _tick = null;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 서버 시계와 내 컴퓨터 시계가 어긋나도 남은 시간이 맞게 보이도록 차이만큼 보정 */
  function setExpiry(expiresAt, serverNow) {
    const skew = serverNow ? Date.now() - new Date(serverNow).getTime() : 0;
    _expiresAt = new Date(expiresAt).getTime() + skew;
  }

  function goLogin(reason) {
    const next = location.pathname + location.search;
    location.href = 'login.html?' + (reason ? reason + '=1&' : '') + 'next=' + encodeURIComponent(next);
  }

  async function fetchMe() {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    return res.json();
  }

  /** 서버에 남은 시간을 다시 묻습니다 (AI 기능을 쓴 뒤에도 부릅니다) */
  async function refresh() {
    try {
      const me = await fetchMe();
      if (me.mode !== 'account') return;
      if (!me.user) { goLogin('expired'); return; }
      setExpiry(me.expiresAt, me.serverNow);
      render();
    } catch (e) { /* 잠깐 끊긴 것은 넘어갑니다 — 다음 확인 때 다시 봅니다 */ }
  }

  async function extend() {
    const res = await fetch('/api/auth/extend', { method: 'POST' });
    if (res.status === 401) { goLogin('expired'); return; }
    const data = await res.json();
    setExpiry(data.expiresAt, data.serverNow);
    render();
  }

  /* 로그아웃 — 이 탭에 남은 진단 자료(auri_*)도 지웁니다.
     같은 컴퓨터를 다음 사람이 쓰면 앞사람의 진단 결과가 보이면 안 되기 때문입니다. */
  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* 그래도 나갑니다 */ }
    Object.keys(sessionStorage).filter((k) => k.startsWith('auri_')).forEach((k) => sessionStorage.removeItem(k));
    location.href = 'login.html?logout=1';
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function render() {
    if (!_me || !_bar) return;
    const left = Math.max(0, Math.round((_expiresAt - Date.now()) / 1000));
    if (left <= 0) { goLogin('expired'); return; }

    const warn = left <= WARN_SEC;
    _bar.classList.toggle('is-warn', warn);
    _bar.querySelector('.acc-timer').textContent = fmt(left);
    _bar.querySelector('.acc-warn').hidden = !warn;
  }

  function mount(me) {
    const host = document.getElementById('topbar');
    _bar = document.createElement('div');
    _bar.className = 'account-bar';
    _bar.innerHTML =
      '<div class="account-inner">' +
        `<span class="acc-who"><b>${esc(me.user.name)}</b> (${esc(me.user.username)}) · ${esc(me.user.org)}</span>` +
        '<span class="acc-warn" hidden>잠시 후 자동으로 로그아웃됩니다 — 계속 쓰려면 로그인 유지를 누르세요</span>' +
        '<span>남은 시간 <span class="acc-timer">--:--</span></span>' +
        '<button type="button" class="btn-text" data-act="extend">로그인 유지</button>' +
        (me.user.role === 'admin' ? '<a class="btn-text" href="admin.html">계정 관리</a>' : '') +
        '<button type="button" class="btn-text" data-act="logout">로그아웃</button>' +
      '</div>';
    _bar.addEventListener('click', function (e) {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'extend') extend();
      if (act.dataset.act === 'logout') logout();
    });
    /* 상단 바가 있는 화면은 그 위에, 없는 화면은 맨 위에 붙입니다 */
    if (host && host.parentNode) host.parentNode.insertBefore(_bar, host);
    else document.body.prepend(_bar);

    render();
    _tick = setInterval(render, 1000);
    setInterval(refresh, 60 * 1000);
  }

  async function start() {
    let me;
    try { me = await fetchMe(); } catch (e) { return; }   // 서버 없이 열린 화면(파일 직접 열기 등)
    if (me.mode !== 'account') return;                    // 접속 암호·꺼짐 방식이면 표시하지 않음
    if (!me.user) { goLogin('expired'); return; }
    _me = me;
    setExpiry(me.expiresAt, me.serverNow);
    mount(me);
  }

  document.addEventListener('DOMContentLoaded', start);

  return { refresh, extend, logout, goLogin, get user() { return _me ? _me.user : null; } };
})();

if (typeof window !== 'undefined') window.AuriAuth = AuriAuth;
