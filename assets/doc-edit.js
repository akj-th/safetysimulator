/* ════════════════════════════════════════════════════════════════════
   문서의 빈칸 — 편집 가능한 칸 + AI 초안

   ── 왜 바꿨는가 ────────────────────────────────────────────────────
   전에는 "여기는 사람이 채우는 자리입니다"라는 **고정 안내문**이었습니다.
   웹에서 고칠 수도 없고, 인쇄하면 그 안내문이 보고서에 그대로 실렸습니다.

   이제는 **빈 입력칸**입니다. 안내문은 placeholder 로 들어가 화면에만
   보이고 인쇄에는 나오지 않습니다.

   ── AI 초안 ────────────────────────────────────────────────────────
   버튼을 눌렀을 때만 AI가 초안을 만듭니다. 평소에는 비어 있습니다.
   만들어진 글은 사람이 고칠 수 있고, **한 글자라도 고치면 AI 표시가
   사라집니다** — 그때부터는 사람이 쓴 글이기 때문입니다.

   AI 표시는 **화면에만** 보이고 인쇄에는 나오지 않습니다. 최종 문서에
   "AI가 썼다"고 적히면 행정 문서로 쓰기 어렵고, 어차피 사람이 검토해
   확정한 글이기 때문입니다. 다만 화면에서는 반드시 보여야 합니다.

   ── 판단 근거 ──────────────────────────────────────────────────────
   AI가 어떤 수치와 어떤 법령에 기대어 썼는지 함께 받아 폅니다.
   근거를 못 찾은 부분은 "확인 필요"로 나옵니다 (server/legal.js 참고).
   **인쇄물에도 본문 아래에 함께 실립니다** — 행정 문서라 무엇에 기대어
   쓴 글인지가 종이에 남아야 합니다 (담당자 확인 2026-09-07).

   ── 인쇄는 입력칸이 아니라 사본을 찍습니다 ─────────────────────────
   입력칸(textarea)을 그대로 인쇄하면 두 가지가 어긋납니다.
     · 글이 길면 칸 안에서 스크롤되어 **뒷부분이 잘립니다**
     · 서체·크기가 본문과 달라 이질적으로 보입니다
   그래서 같은 글을 담은 `.doc-fill-print` 사본을 옆에 두고, 인쇄할 때는
   입력칸을 감추고 사본을 보입니다. 사본은 그냥 글이라 잘릴 일이 없고
   본문과 같은 서식을 그대로 받습니다.

   법령은 **원문 대조를 마친 것만** 인용에 쓰입니다. 대조 전인 것은 AI에게
   보여 주지 않고, 화면에 "쓰지 않았다"고만 알립니다.

   ── 저장 ───────────────────────────────────────────────────────────
   sessionStorage 에 담습니다. 탭을 옮기거나 다시 그려도 남습니다.
   ════════════════════════════════════════════════════════════════════ */

const AuriDocEdit = (function () {
  const STORE_KEY = 'auri_doc_notes';

  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function save(all) { sessionStorage.setItem(STORE_KEY, JSON.stringify(all)); }

  function get(id) { return load()[id] || null; }

  function set(id, value, byAi, basis) {
    const all = load();
    if (!value) delete all[id];
    else all[id] = { text: value, ai: !!byAi, basis: basis || null };
    save(all);
  }

  /**
   * 편집 가능한 칸 하나를 그립니다.
   *   id       저장 열쇠 (문서 안에서 고유해야 합니다)
   *   title    (소결) 처럼 앞에 붙는 이름
   *   hint     빈칸일 때 보이는 안내 — placeholder 로 들어갑니다
   *   context  AI에게 넘길 자료 (수치·판정 등). 없으면 버튼이 나오지 않습니다
   */
  function render(id, title, hint, context) {
    const saved = get(id);
    const safe = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return `
      <div class="doc-fill" id="fill-${id}" data-ctx="${safe(context || '')}" data-title="${safe(title)}">
        <div class="doc-fill-head screen-only">
          <span class="ttl">${safe(title)}</span>
          <span class="ai-mark" ${saved && saved.ai ? '' : 'hidden'}>AI 초안 — 검토 후 확정하세요</span>
          <span class="sp"></span>
          ${context ? `<button type="button" class="btn-text" onclick="AuriDocEdit.ask('${id}')">AI 의견 생성</button>` : ''}
        </div>
        <textarea class="doc-fill-in" id="in-${id}" rows="3"
          placeholder="${safe(hint)}"
          oninput="AuriDocEdit.onEdit('${id}')">${safe(saved ? saved.text : '')}</textarea>
        <!-- 인쇄용 사본 — 화면에서는 감춰져 있습니다 -->
        <div class="doc-fill-print" id="pr-${id}">${safe(saved ? saved.text : '')}</div>
        <div class="doc-basis" id="basis-${id}" ${saved && saved.basis ? '' : 'hidden'}>
          ${saved && saved.basis ? basisHtml(saved.basis) : ''}
        </div>
      </div>`;
  }

  function basisHtml(basis) {
    if (!basis || !basis.length) return '';
    return '<b>판단 근거</b>' + basis.map(function (b) {
      return `<span class="bi k-${b.kind === '확인필요' ? 'warn' : 'ok'}">${b.kind}</span> ${b.detail}`;
    }).map(function (s) { return `<div>${s}</div>`; }).join('');
  }

  /** 인쇄용 사본을 본문과 맞춥니다 (빈 칸은 인쇄에서 통째로 접힙니다) */
  function syncPrint(id, text) {
    const box = document.getElementById('fill-' + id);
    const pr = document.getElementById('pr-' + id);
    if (pr) pr.textContent = text || '';
    if (box) box.classList.toggle('empty', !String(text || '').trim());
  }

  /* 사람이 고치면 AI 표시를 뗍니다 — 그때부터는 사람이 쓴 글입니다 */
  function onEdit(id) {
    const el = document.getElementById('in-' + id);
    const prev = get(id);
    const changed = !prev || prev.text !== el.value;
    set(id, el.value, changed ? false : (prev && prev.ai), prev ? prev.basis : null);

    const box = document.getElementById('fill-' + id);
    if (changed && box) {
      const mark = box.querySelector('.ai-mark');
      if (mark) mark.hidden = true;
    }
    syncPrint(id, el.value);
    autoGrow(el);
  }

  /**
   * 내용에 맞춰 칸 높이를 늘립니다.
   * 감춰진 탭에서는 scrollHeight 가 0 이라 높이를 잘못 잡습니다.
   * 그때는 건드리지 않고, 탭을 열 때 refresh() 가 다시 부릅니다.
   */
  function autoGrow(el) {
    if (!el || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight + 2, 54) + 'px';
  }

  async function ask(id) {
    const box = document.getElementById('fill-' + id);
    const el = document.getElementById('in-' + id);
    const btn = box.querySelector('button');
    const mark = box.querySelector('.ai-mark');
    const basisBox = document.getElementById('basis-' + id);

    if (el.value.trim() && !confirm('이미 적힌 내용을 AI 초안으로 바꿉니다. 계속할까요?')) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '생성 중…';

    try {
      const data = await auriCallServer('/api/opinion', {
        section: box.dataset.title + ' — ' + (el.placeholder || ''),
        context: box.dataset.ctx,
      });
      el.value = data.text || '';
      syncPrint(id, el.value);
      autoGrow(el);
      set(id, el.value, true, data.basis || []);

      if (mark) mark.hidden = false;
      if (basisBox) {
        basisBox.innerHTML = basisHtml(data.basis)
          + (data.pending && data.pending.length
              ? `<div class="bi-note">원문 대조 전이라 <b>인용하지 않은</b> 근거 ${data.pending.length}건:
                 ${data.pending.map(function (p) {
                     return '[' + p.kindLabel + '] ' + p.where + ' ' + p.title;
                   }).join(' · ')}
                 — 원문을 확인한 뒤 server/legal.js 의 verified 를 true 로 바꾸면 쓰입니다.</div>`
              : '');
        basisBox.hidden = false;
      }
    } catch (e) {
      alert(e.message || 'AI 의견을 만들지 못했습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /** 문서를 다시 그린 뒤(또는 탭을 연 뒤) 칸 높이와 인쇄용 사본을 맞춥니다 */
  function refresh() {
    document.querySelectorAll('.doc-fill').forEach(function (box) {
      const id = box.id.replace(/^fill-/, '');
      const el = document.getElementById('in-' + id);
      if (!el) return;
      syncPrint(id, el.value);
      autoGrow(el);
    });
  }

  return { render, ask, onEdit, refresh, get, set };
})();
