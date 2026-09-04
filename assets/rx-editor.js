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
    if (this.opts.onChange) this.opts.onChange(items);
    return items;
  },

  /* ── 보기 모드 ─────────────────────────────────────────────── */
  render(items) {
    const list = document.getElementById(this.opts.listId);
    this.toggle(false);

    if (!items.length) {
      list.innerHTML = '<div class="empty">처방된 사업이 없습니다.<br>수정을 눌러 직접 추가할 수 있습니다.</div>';
      return;
    }

    list.innerHTML = items.map(function (it) {
      const mark = it.custom ? '<span class="mark-edited">직접 추가</span>'
                 : it.edited ? '<span class="mark-edited">수정됨</span>' : '';

      /* HEA — 8/25 협의의 3분류가 이것입니다 (피해대상·환경·행위).
         시설(E)만 나열하지 않는다는 것을 화면에서 바로 보이게 합니다. */
      const program = AuriPalette.byName(it.name);
      const hea = it.hea || (program || {}).hea;
      const heaTag = hea
        ? `<span class="rx-kind k-${hea}" title="${AuriPalette.heaDesc(hea)}">${AuriPalette.heaLabel(hea, true)}</span>`
        : '';

      /* 효과크기와 출처 — 예산 근거 문서라 출처 표기가 중요합니다.
         AURI 팔레트에 적힌 문장을 그대로 싣습니다(우리가 지어내지 않습니다).
         ★ 리포트와 시각화 양쪽에 모두 보여 줍니다. 근거만 있고 효과가
           없으면 "이 사업이 왜 효과가 있는가"를 화면에서 알 수 없습니다. */
      const ev = auriRxEvidence(it);
      const evidence = ev && ev.effect
        ? `<div class="rx-evidence">${ev.effect}` +
          (ev.sourceShort ? ` <span class="src">출처: ${ev.sourceShort}</span>` : '') + '</div>'
        /* 비어 있으면 비어 있다고 적습니다 — 조용히 빠지면 있는 줄 압니다 */
        : (it.custom ? '' : '<div class="rx-evidence none">성과증명 자료 없음 — 팔레트에 효과크기가 비어 있습니다</div>');

      /* 연구원이 직접 쓴 설명은 팔레트 문장과 별개로 남깁니다 */
      const userNote = (it.custom || it.edited) && it.note && (!program || it.note !== program.effect)
        ? `<div class="rx-note">${it.note}</div>` : '';

      return `
        <div class="rx-item">
          <span class="rx-priority ${it.priority.cls}">${it.priority.label}</span>
          <div class="rx-body">
            <div class="rx-name">${it.name}${heaTag}<span class="rx-cat">${it.category}</span>${mark}</div>
            ${userNote}
            ${evidence}
            <div class="rx-basis">${auriRxBasis(it)}</div>
          </div>
        </div>`;
    }).join('')
    /* HEA 범례 — 알파벳만 보고는 무슨 분류인지 알 수 없습니다 */
    + `<div class="rx-legend">${AuriPalette.heaLegend()}</div>`;
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
            <input type="text" id="rx-custom-${i}" placeholder="사업 이름 직접 입력"
                   value="${isCustomName ? safeName : ''}" style="display:${isCustomName ? 'block' : 'none'}">
            <textarea id="rx-note-${i}" placeholder="이 사업이 왜 필요한지 (비우면 팔레트의 효과크기가 쓰입니다)">${it.note || ''}</textarea>
            <div class="rx-basis" id="rx-meta-${i}"></div>
            <div class="rx-basis">${it.custom ? '연구원 직접 추가' : `${it.category} · ${it.id}`}</div>
          </div>
        </div>`;
    }).join('');

    document.getElementById(this.opts.listId).innerHTML = rows.trim()
      ? rows
      : '<div class="empty">사업이 모두 삭제되었습니다. 항목 추가로 직접 넣을 수 있습니다.</div>';

    /* 각 줄의 출처·금액 줄을 채웁니다 (드롭다운을 바꾸면 다시 채워집니다) */
    this.draft.forEach(function (it, i) {
      if (it.deleted) return;
      AuriRx.renderEditMeta(i, it.custom ? null : AuriPalette.byName(it.name));
    });
  },

  /* 드롭다운에서 사업을 바꾸면
       · "직접 입력…"이면 아래 입력칸을 엽니다
       · 팔레트 사업이면 설명·효과크기·출처·금액을 그 사업 것으로 갈아 끼웁니다

     ★ 연구원이 직접 고쳐 쓴 설명은 덮어쓰지 않습니다. 사람이 쓴 글을
       드롭다운 한 번에 날려 버리면 손댄 기록이 사라지기 때문입니다.
       (판단 기준: 지금 칸의 내용이 '어느 팔레트 사업의 효과크기 원문'과
        같으면 자동으로 채워진 것 → 갈아 끼움. 아니면 사람이 쓴 것 → 유지) */
  onNameChange(i) {
    const sel = document.getElementById('rx-name-' + i);
    const custom = document.getElementById('rx-custom-' + i);
    const note = document.getElementById('rx-note-' + i);
    const isCustom = sel.value === '__custom__';

    custom.style.display = isCustom ? 'block' : 'none';
    if (isCustom) { custom.focus(); this.renderEditMeta(i, null); return; }

    const program = AuriPalette.byName(sel.value);
    const current = (note.value || '').trim();
    const isAuto = current === '' || AuriRx.isPaletteText(current);
    if (program && isAuto) note.value = program.effect || '';

    this.renderEditMeta(i, program);
  },

  /** 이 글이 팔레트에서 자동으로 들어온 문장인가 (사람이 쓴 것과 구분) */
  isPaletteText(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    const all = (AuriPalette.data && AuriPalette.data.programs) || [];
    return all.some(function (p) { return (p.effect || '').trim() === t; });
  },

  /* 편집 중인 줄 아래에 그 사업의 출처·금액을 보여 줍니다.
     설명만 바뀌고 출처·금액이 그대로면 어느 사업을 고른 건지 헷갈립니다. */
  renderEditMeta(i, program) {
    const box = document.getElementById('rx-meta-' + i);
    if (!box) return;
    if (!program) { box.textContent = '연구원 직접 추가 — 출처·금액을 직접 적어 주세요'; return; }
    const src = AuriPalette.sourceShort(program.source);
    box.innerHTML =
      `${AuriPalette.heaLabel(program.hea, true)} · ${AuriPalette.amountText(program)}` +
      (src ? ` · 출처: ${src}` : ' · 출처 없음');
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

      /* 팔레트 원본과 비교해 "연구원이 손댄 것"만 기록합니다.
         설명(note)의 기준은 **지금 고른 사업**의 효과크기입니다 —
         원래 사업 것과 비교하면, 사업만 바꿨는데도 설명까지 고친 것으로
         잘못 기록됩니다. */
      const origin = auriFindRule(it.id);
      const selected = AuriPalette.byName(it.name) || origin;
      const e = {};
      if (origin && it.name !== origin.name) e.name = it.name;
      if (selected && it.note !== (selected.effect || '')) e.note = it.note;
      /* 규칙 엔진이 정했을 우선순위 — 적합도로 갈립니다.
         이 값과 다를 때만 "연구원이 바꿨다"로 기록합니다. */
      const originPri = (it.fit != null && it.fit >= RX_MUST_FIT) ? 'must' : 'recommend';
      if (it.priority.cls !== originPri) e.priorityCls = it.priority.cls;
      if (Object.keys(e).length) ov.edits[it.id] = e;
    });

    auriSaveOverrides(ov);
    this.recompute();
  },
};
