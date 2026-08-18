/* ════════════════════════════════════════════════════════════════════
   개선 시설물 목록 — 표시 + 편집(수정·삭제·추가)

   리포트 화면과 시각화 화면이 같은 목록을 다루므로 이 파일을 함께 씁니다.
   (rules.js 가 먼저 불러와져 있어야 합니다)
   ════════════════════════════════════════════════════════════════════ */

const AuriRx = {
  opts: null,
  draft: null,

  /* 화면마다 버튼 id가 다르므로 여기서 알려 줍니다.
     onChange: 목록이 바뀔 때마다 호출 (다음 단계 갱신 등에 사용) */
  init(opts) {
    this.opts = opts;
    const edit = document.getElementById(opts.editBtnId);
    if (edit) edit.innerHTML = AURI_ICON_EDIT + '수정';
    this.toggle(false);
  },

  toggle(editing) {
    const o = this.opts;
    const show = function (id, on) {
      const el = document.getElementById(id);
      if (el) el.style.display = on ? 'inline-flex' : 'none';
    };
    show(o.editBtnId, !editing);
    show(o.saveBtnId, editing);
    show(o.cancelBtnId, editing);
    show(o.addBtnId, editing);
  },

  current() {
    return JSON.parse(sessionStorage.getItem('auri_prescriptions') || '[]');
  },

  /* 진단 점수 + 연구원 수정 → 최종 목록을 다시 계산하고 저장합니다 */
  recompute() {
    const results = JSON.parse(sessionStorage.getItem('auri_diagnosis_results') || '[]');
    const items = auriPrescribe(results);
    auriSavePrescriptions(items);
    this.render(items);
    this.showCap();
    if (this.opts.onChange) this.opts.onChange(items);
    return items;
  },

  /* 상한 때문에 빠진 시설물이 있으면 알립니다.
     빠진 것도 사진에서 확인된 문제라, 조용히 없애면 근거가 사라집니다. */
  showCap() {
    if (!this.opts.capId) return;
    const el = document.getElementById(this.opts.capId);
    if (!el) return;
    const n = auriRxDropped();
    el.innerHTML = n
      ? `진단에서 확인된 개선 항목이 더 있지만, 한 지점에 넣을 수 있는 규모를 고려해 ` +
        `<b>급한 순으로 ${RX_MAX_TOTAL}종</b>만 골랐습니다 (제외 ${n}종). ` +
        `필요하면 <b>수정 → 항목 추가</b>로 직접 넣을 수 있습니다.`
      : '';
  },

  /* ── 보기 모드 ─────────────────────────────────────────────── */
  render(items) {
    const list = document.getElementById(this.opts.listId);
    this.toggle(false);

    if (!items.length) {
      list.innerHTML = '<div class="empty">처방된 시설물이 없습니다.<br>수정을 눌러 직접 추가할 수 있습니다.</div>';
      return;
    }

    list.innerHTML = items.map(function (it) {
      const mark = it.custom ? '<span class="mark-edited">직접 추가</span>'
                 : it.edited ? '<span class="mark-edited">수정됨</span>' : '';
      const note = AuriRx.opts.showNote && it.note
        ? `<div class="rx-note">${it.note}</div>` : '';
      return `
        <div class="rx-item">
          <span class="rx-priority ${it.priority.cls}">${it.priority.label}</span>
          <div class="rx-body">
            <div class="rx-name">${it.name}<span class="rx-cat">${it.category}</span>${mark}</div>
            ${note}
            <div class="rx-basis">${auriRxBasis(it)}</div>
          </div>
        </div>`;
    }).join('');
  },

  /* ── 편집 모드 ─────────────────────────────────────────────── */
  start() {
    this.draft = this.current().map(function (it) {
      return Object.assign({}, it, { deleted: false });
    });
    this.toggle(true);
    this.renderEditor();
  },

  renderEditor() {
    const rows = this.draft.map(function (it, i) {
      if (it.deleted) return '';
      /* 목록에 없는 이름(규칙표에서 온 것이거나 이전에 직접 넣은 것)이면
         "직접 입력"이 선택된 상태로 그리고, 아래 입력칸을 열어 둡니다. */
      const isCustomName = !!it.name && !auriCatalogHas(it.name);
      const safeName = (it.name || '').replace(/"/g, '&quot;');
      return `
        <div class="rx-item">
          <div class="rx-edit">
            <div class="line">
              <select class="grow" id="rx-name-${i}" onchange="AuriRx.onNameChange(${i})">
                ${auriCatalogOptions(it.name)}
              </select>
              <select id="rx-pri-${i}">
                <option value="must" ${it.priority.cls === 'must' ? 'selected' : ''}>필수</option>
                <option value="recommend" ${it.priority.cls === 'recommend' ? 'selected' : ''}>권장</option>
              </select>
              <button class="btn-text danger" onclick="AuriRx.remove(${i})">삭제</button>
            </div>
            <input type="text" id="rx-custom-${i}" placeholder="시설물 이름 직접 입력"
                   value="${isCustomName ? safeName : ''}" style="display:${isCustomName ? 'block' : 'none'}">
            <textarea id="rx-note-${i}" placeholder="이 시설물이 왜 필요한지">${it.note || ''}</textarea>
            <div class="rx-basis">${it.custom ? '연구원 직접 추가' : `${it.category} · 규칙 ${it.id}`}</div>
          </div>
        </div>`;
    }).join('');

    document.getElementById(this.opts.listId).innerHTML = rows.trim()
      ? rows
      : '<div class="empty">시설물이 모두 삭제되었습니다. 항목 추가로 직접 넣을 수 있습니다.</div>';
  },

  /* 드롭다운에서 "직접 입력…"을 고르면 아래 입력칸을 엽니다 */
  onNameChange(i) {
    const sel = document.getElementById('rx-name-' + i);
    const custom = document.getElementById('rx-custom-' + i);
    const isCustom = sel.value === '__custom__';
    custom.style.display = isCustom ? 'block' : 'none';
    if (isCustom) custom.focus();
  },

  /* 입력창에 쳐 둔 값을 임시 목록으로 옮깁니다 (다시 그리기 전에 호출) */
  sync() {
    this.draft.forEach(function (it, i) {
      if (it.deleted) return;
      const sel = document.getElementById('rx-name-' + i);
      if (!sel) return;
      const custom = document.getElementById('rx-custom-' + i);
      it.name = sel.value === '__custom__' ? custom.value.trim() : sel.value;
      it.note = document.getElementById('rx-note-' + i).value.trim();
      it.priority = RX_PRIORITY[document.getElementById('rx-pri-' + i).value];
    });
  },

  remove(i) {
    this.sync();
    this.draft[i].deleted = true;
    this.renderEditor();
  },

  add() {
    this.sync();
    this.draft.push({
      id: 'U-' + Date.now(),
      name: '', note: '', category: '직접 지정',
      priority: RX_PRIORITY.recommend, custom: true, deleted: false,
    });
    this.renderEditor();
  },

  cancel() {
    this.render(this.current());
  },

  /* 연구원이 손댄 내용만 골라 저장합니다. 규칙표 원본과 같으면 기록하지 않습니다. */
  save() {
    this.sync();
    const ov = { removed: [], edits: {}, added: [] };

    this.draft.forEach(function (it) {
      if (it.custom) {
        if (!it.deleted && it.name) {
          ov.added.push({
            id: it.id, name: it.name, note: it.note,
            category: it.category, priorityCls: it.priority.cls,
          });
        }
        return;
      }
      if (it.deleted) { ov.removed.push(it.id); return; }

      const origin = auriFindRule(it.id);
      const e = {};
      if (origin && it.name !== origin.name) e.name = it.name;
      if (origin && it.note !== origin.note) e.note = it.note;
      const originPri = (it.score !== null && auriLevel(it.score).key === 'lv-danger') ? 'must' : 'recommend';
      if (it.priority.cls !== originPri) e.priorityCls = it.priority.cls;
      if (Object.keys(e).length) ov.edits[it.id] = e;
    });

    auriSaveOverrides(ov);
    this.recompute();
  },
};
