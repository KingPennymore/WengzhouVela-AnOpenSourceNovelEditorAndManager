import { csvColumnName } from './csv-view.mjs';
import { parseCsv, writeCsv } from './csv.mjs';
import { replaceCells, insertCsvRow, deleteCsvRows, csvColumns, reorderCsvRows } from './csv-model.mjs';
import { t } from './i18n.mjs';
import { mountMenu } from './menu-controller.mjs';
import { movedBeyond } from './tap-guard.mjs';

// Input/selection controller kept separate from mounting and asynchronous parsing.
export const csvGridEditing = {
  bindInput() {
    const root = this.ports.root, signal = this.events.signal;
    const listen = (name, fn, options = {}) => root.addEventListener(name, fn, { ...options, signal });
    listen('keydown', e => this.key(e));
    listen('copy', e => this.clipboard(e, false)); listen('cut', e => this.clipboard(e, true));
    listen('paste', e => { if (e.target.closest('textarea,input,select')) return; const text = e.clipboardData?.getData('text/plain'); if (text === undefined) return; e.preventDefault(); this.attempt(() => this.paste(text)); });
    listen('pointerdown', e => this.pointerDown(e)); listen('pointermove', e => this.pointerMove(e));
    listen('pointerup', e => this.pointerEnd(e)); listen('pointercancel', () => this.cancelPointer());
    listen('dblclick', e => { if (!e.target.closest('.csv-plane') || this.grid.plane.scale < .5) return; const hit = this.grid.hit(e); if (hit) { this.select(hit.row, hit.column); this.editCell(); } });
    listen('contextmenu', e => { if (!e.target.closest('.csv-grid-host')) return; e.preventDefault(); const rowAxis = e.target.closest('[data-csv-row]'), colAxis = e.target.closest('[data-csv-column]'); if (rowAxis) { const row = Number(rowAxis.dataset.csvRow); this.select(row, 0); this.select(row, this.model.columns - 1, true); } else if (colAxis && this.grid.order.length) { const column = Number(colAxis.dataset.csvColumn); this.select(this.grid.order[0], column); this.select(this.grid.order.at(-1), column, true); } else { const hit = this.grid.hit(e); if (hit && !this.contains(hit.row, hit.column)) this.select(hit.row, hit.column); } this.menu(e); });
    const input = root.querySelector('#csv-input');
    input.oncompositionstart = () => { this.composing = true; };
    input.oncompositionend = () => { this.composing = false; };
    input.oninput = () => { if (this.editing) this.editing.value = input.value; };
    root.querySelector('#csv-commit').onclick = () => this.attempt(() => this.commit());
    root.querySelector('#csv-cancel').onclick = () => this.cancelEdit();
    // The on-screen keyboard changes the visual viewport, not the window: keep the edited cell above it.
    // Wait for the IME animation to settle; repainting on every intermediate height flashes the canvas.
    if (typeof visualViewport !== 'undefined') visualViewport.addEventListener('resize', () => {
      if (!this.editing) return;
      clearTimeout(this.keyboardTimer);
      this.keyboardTimer = setTimeout(() => { if (!this.editing) return; this.grid.reveal(this.editing.row, this.editing.column); this.positionEditor(); }, 120);
    }, { signal });
  },
  selected() {
    const active = this.active || { row: this.grid.order[0] ?? 0, column: 0 }, anchor = this.anchor || active, order = this.grid.order;
    const first = this.grid.positions.get(active.row) ?? 0, last = this.grid.positions.get(anchor.row) ?? 0;
    return { r0: Math.min(first, last), r1: Math.max(first, last), c0: Math.min(active.column, anchor.column), c1: Math.max(active.column, anchor.column) };
  },
  contains(row, col) { const s = this.selected(), index = this.grid.positions.get(row); return index !== undefined && index >= s.r0 && index <= s.r1 && col >= s.c0 && col <= s.c1; },
  select(row, column, extend = false, reveal = false, { focus = true } = {}) {
    if (this.editing) return this.attempt(() => this.commit({ row, column, extend, reveal, focus }));
    if (!this.grid) return;
    if (!this.grid.order.length) return;
    const next = { row, column: Math.max(0, Math.min(this.model.columns - 1, column)) };
    if (!extend || !this.anchor) this.anchor = { ...next }; this.active = next;
    if (reveal) this.grid.reveal(row, next.column);
    this.showSelection(); if (focus) this.grid.surface.focus({ preventScroll: true });
  },
  showSelection() {
    if (!this.grid) return;
    const selection = this.selected(), active = this.active, root = this.ports.root;
    for (const cell of root.querySelectorAll('[data-cell-row]')) {
      const row = Number(cell.dataset.cellRow), column = Number(cell.dataset.cellColumn), selected = !!active && this.contains(row, column);
      cell.classList.toggle('csv-selected', selected); cell.classList.toggle('csv-active-cell', !!active && row === active.row && column === active.column); cell.setAttribute('aria-selected', String(selected));
      const query = this.query?.toLocaleLowerCase(); cell.classList.toggle('csv-search-hit', !!query && this.model.rows[row]?.[column]?.toLocaleLowerCase().includes(query));
    }
    const cellId = active ? `csv-cell-${active.row}-${active.column}` : null;
    if (cellId && root.querySelector('#' + cellId)) root.querySelector('[role=grid]').setAttribute('aria-activedescendant', cellId); else root.querySelector('[role=grid]').removeAttribute('aria-activedescendant');
    for (const heading of root.querySelectorAll('[data-csv-row],[data-csv-column]')) heading.classList.toggle('csv-active-axis', !!active && (heading.dataset.csvRow !== undefined ? this.contains(Number(heading.dataset.csvRow), active.column) : this.contains(active.row, Number(heading.dataset.csvColumn))));
    for (const id of ['delete-row', 'delete-column']) { const button = this.control(id); if (button) button.disabled = this.pending || !active || this.ports.readOnly(); }
    const count = active ? (selection.r1 - selection.r0 + 1) * (selection.c1 - selection.c0 + 1) : 0;
    const key = active ? `${selection.r0}:${selection.r1}:${selection.c0}:${selection.c1}` : '';
    if (this.selectionStats?.model !== this.model || this.selectionStats?.order !== this.grid.order || this.selectionStats.key !== key) {
      let sum = 0, numbers = 0;
      if (active) for (let i = selection.r0; i <= selection.r1; i++) for (let c = selection.c0; c <= selection.c1; c++) { const v = this.model.rows[this.grid.order[i]]?.[c]?.trim(); if (v && Number.isFinite(Number(v))) { sum += Number(v); numbers++; } }
      this.selectionStats = { model: this.model, order: this.grid.order, key, sum, numbers };
    }
    const { sum, numbers } = this.selectionStats;
    const reference = active ? csvColumnName(active.column) + ((this.grid.positions.get(active.row) ?? 0) + 1) : t('选择单元格');
    root.querySelector('#csv-cell-reference').textContent = reference;
    root.querySelector('.csv-context').textContent = `${reference} · ${this.model.rows.length} × ${this.model.columns}`;
    root.querySelector('#csv-selection-summary').textContent = `${t('选中')} ${count} · ${this.model.rows.length} ${t('行')} × ${this.model.columns} ${t('列')}` + (numbers ? ` · ${t('合计')} ${sum.toLocaleString()} · ${t('平均')} ${(sum / numbers).toLocaleString()}` : '');
    const zoom = this.control('zoom'); if (zoom) zoom.textContent = Math.round(this.grid.plane.scale * 100) + '%';
    this.paintHandles(); this.positionEditor();
  },
  paintHandles() {
    const layer = this.grid.selectionLayer; layer.replaceChildren(); if (!this.active || this.grid.plane.scale < .5) return;
    const s = this.selected();
    for (const [corner, row, column] of [['start', this.grid.order[s.r0], s.c0], ['end', this.grid.order[s.r1], s.c1]]) {
      const box = this.grid.rect(row, column); if (!box) continue; const handle = document.createElement('span'); handle.className = 'csv-selection-handle'; handle.dataset.selectionHandle = corner; handle.setAttribute('aria-label', t('扩大选区'));
      handle.style.left = (box.x + (corner === 'end' ? box.width : 0)) + 'px'; handle.style.top = (box.y + (corner === 'end' ? box.height : 0)) + 'px'; layer.append(handle);
    }
  },
  pointerDown(e) {
    if (!this.grid || e.button > 0 || e.target.closest('button,input,textarea,select,.csv-menu')) return;
    this.closeMenu?.();
    const resize = e.target.closest('[data-resize-column]');
    if (resize) { e.preventDefault(); e.stopPropagation(); this.resizing = { column: Number(resize.dataset.resizeColumn), x: e.clientX, width: this.grid.metrics.widths[Number(resize.dataset.resizeColumn)] }; this.ports.root.setPointerCapture(e.pointerId); return; }
    const handle = e.target.closest('[data-selection-handle]');
    if (handle) { e.preventDefault(); this.grid.cancelGesture(); const s = this.selected(); this.anchor = handle.dataset.selectionHandle === 'start' ? { row: this.grid.order[s.r1], column: s.c1 } : { row: this.grid.order[s.r0], column: s.c0 }; this.dragSelection = true; this.ports.root.setPointerCapture(e.pointerId); return; }
    const axis = e.target.closest('[data-csv-row],[data-csv-column]');
    if (axis) {
      if (axis.dataset.csvRow !== undefined) { const row = Number(axis.dataset.csvRow); this.select(row, 0); this.select(row, this.model.columns - 1, true); }
      else if (this.grid.order.length) { const c = Number(axis.dataset.csvColumn); this.select(this.grid.order[0], c); this.select(this.grid.order.at(-1), c, true); }
      return;
    }
    if (!e.target.closest('.csv-plane') || this.space || this.editing || this.grid.plane.scale < .5) return;
    const hit = this.grid.hit(e); if (!hit) return;
    this.pointer = { x: e.clientX, y: e.clientY, hit, moved: false, touch: e.pointerType === 'touch' };
    if (e.pointerType === 'touch') this.pressTimer = setTimeout(() => { if (!this.pointer || this.pointer.moved) return; this.grid.cancelGesture(); this.select(hit.row, hit.column); this.dragSelection = true; this.longPressed = true; this.ports.root.setPointerCapture(e.pointerId); }, 500);
    else { e.preventDefault(); this.select(hit.row, hit.column, e.shiftKey); this.dragSelection = true; this.ports.root.setPointerCapture(e.pointerId); }
  },
  pointerMove(e) {
    if (this.resizing) { const { column, x, width } = this.resizing; this.state.widths = [...this.grid.metrics.widths]; this.state.widths[column] = Math.max(64, Math.min(640, width + (e.clientX - x) / this.grid.plane.scale)); this.grid.metrics.widths = this.state.widths; this.rebuildMetrics(); this.grid.paint(); return; }
    if (this.pointer && movedBeyond(this.pointer, e)) { this.pointer.moved = true; clearTimeout(this.pressTimer); }
    if (this.dragSelection) { const hit = this.grid.hit(e); if (hit) { this.active = { row: hit.row, column: hit.column }; this.showSelection(); } }
  },
  pointerEnd(e) {
    clearTimeout(this.pressTimer);
    if (this.resizing) { this.resizing = null; this.saveView(); }
    if (this.pointer?.touch && !this.pointer.moved && !this.longPressed) this.select(this.pointer.hit.row, this.pointer.hit.column);
    // A long press without dragging opens the menu; dragging it extends the selection instead.
    if (this.longPressed && !this.pointer?.moved) this.menu(e);
    this.grid?.gesture?.forget?.(e.pointerId);
    this.pointer = null; this.dragSelection = false; this.longPressed = false;
  },
  cancelPointer() { clearTimeout(this.pressTimer); this.pointer = null; this.dragSelection = false; this.longPressed = false; this.resizing = null; },
  editCell(initial) {
    if (!this.active || this.ports.readOnly() || this.model.source !== this.ports.source()) return;
    const root = this.ports.root, input = root.querySelector('#csv-input');
    this.editing = { ...this.active, source: this.model.source, value: initial ?? this.model.rows[this.active.row]?.[this.active.column] ?? '' };
    input.value = this.editing.value; root.querySelector('.csv-editor-layer').hidden = false; this.positionEditor();
    this.grid.reveal(this.active.row, this.active.column); input.focus({ preventScroll: true }); if (initial === undefined) input.select();
  },
  positionEditor() {
    if (!this.editing) return;
    const layer = this.ports.root.querySelector('.csv-editor-layer'), box = this.grid.rect(this.editing.row, this.editing.column), bottom = matchMedia('(pointer:coarse)').matches || innerWidth <= 600 || this.grid.plane.scale < .75;
    layer.classList.toggle('csv-bottom-editor', bottom);
    if (!bottom && box) { const host = this.grid.surface.getBoundingClientRect(), parent = this.ports.root.querySelector('.csv-panel').getBoundingClientRect(); layer.style.left = host.left - parent.left + box.x + 'px'; layer.style.top = host.top - parent.top + box.y + 'px'; layer.style.width = Math.max(180, box.width) + 'px'; } else { layer.style.left = ''; layer.style.top = ''; layer.style.width = ''; }
    layer.style.setProperty('--csv-edit-font', Math.max(14, (parseFloat(getComputedStyle(this.grid.root).fontSize) || 16) * this.grid.plane.scale) + 'px');
  },
  commit(selection) {
    if (!this.editing || this.composing) return;
    const draft = this.editing;
    if (draft.source !== this.ports.source()) throw Error(t('表格已变化，请重新打开单元格。'));
    const changes = replaceCells(this.model, [{ row: draft.row, column: draft.column, value: draft.value }]);
    this.cancelEdit(false);
    if (changes.length) return this.apply(changes, selection);
    if (selection) this.select(selection.row, selection.column, !!selection.extend, selection.reveal !== false, { focus: selection.focus !== false });
    else this.grid.surface.focus({ preventScroll: true });
  },
  cancelEdit(focus = true) { this.editing = null; this.composing = false; const layer = this.ports.root.querySelector('.csv-editor-layer'); if (layer) layer.hidden = true; if (focus) this.grid?.surface.focus({ preventScroll: true }); },
  entries(value = '') { const s = this.selected(), result = []; for (let i = s.r0; i <= s.r1; i++) for (let c = s.c0; c <= s.c1; c++) result.push({ row: this.grid.order[i], column: c, value }); return result; },
  clear() { if (this.active) this.apply(replaceCells(this.model, this.entries())); },
  clipboard(e, cut) {
    if (!this.active || e.target.closest('textarea,input,select')) return;
    const s = this.selected(), rows = this.grid.order.slice(s.r0, s.r1 + 1).map(r => Array.from({ length: s.c1 - s.c0 + 1 }, (_, c) => this.model.rows[r][s.c0 + c] || ''));
    e.preventDefault(); e.clipboardData?.setData('text/plain', writeCsv(rows, '\t')); if (cut) this.attempt(() => this.clear());
  },
  paste(text) {
    if (!this.active) return; const rows = parseCsv(text, '\t'), s = this.selected(), entries = [];
    for (const [i, values] of rows.entries()) for (const [j, value] of values.entries()) entries.push({ row: this.grid.order[s.r0 + i] ?? this.model.rows.length + s.r0 + i - this.grid.order.length, column: s.c0 + j, value });
    this.apply(replaceCells(this.model, entries));
  },
  key(e) {
    if (this.pending) { if (!e.target.closest('input,textarea,select')) e.preventDefault(); return; }
    if (e.defaultPrevented || e.target.closest('input,select') || e.target.closest('button') && e.key !== 'Escape') return;
    if (this.composing || e.isComposing || e.keyCode === 229) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); this.openFind(); return; }
    if (ctrl && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); this.cancelEdit(false); (e.key.toLowerCase() === 'y' || e.shiftKey ? this.ports.redo : this.ports.undo)?.(); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); this.ports.root.querySelector('.csv-context-menu')?.remove(); return; }
    if (this.editing) { if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); const target = this.navigationTarget(e.key, e.shiftKey); this.attempt(() => this.commit(target)); } return; }
    if (e.key === ' ' && !e.repeat) { e.preventDefault(); this.space = true; return; }
    if (ctrl && ['0', '=', '+', '-'].includes(e.key)) { e.preventDefault(); this.grid.zoom(e.key === '0' ? 1 : this.grid.plane.scale * (e.key === '-' ? 1 / 1.2 : 1.2)); return; }
    if (e.shiftKey && (e.key === '!' || e.code === 'Digit1')) { e.preventDefault(); this.grid.fit(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); if (this.grid.order.length) { this.select(this.grid.order[0], 0); this.select(this.grid.order.at(-1), this.model.columns - 1, true); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.attempt(() => this.clear()); return; }
    const resize = e.target.closest('[data-resize-column]');
    if (resize && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const c = Number(resize.dataset.resizeColumn); this.state.widths = [...this.grid.metrics.widths]; this.state.widths[c] = Math.max(64, this.state.widths[c] + (e.key === 'ArrowRight' ? 16 : -16)); this.rebuildMetrics(); this.grid.paint(); this.saveView(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) {
      e.preventDefault(); if (e.key === 'Enter') this.editCell(); else this.navigate(e.key, e.shiftKey); return;
    }
    if (e.key === 'F2') { e.preventDefault(); this.editCell(); return; }
    if (!ctrl && !e.altKey && e.key.length === 1) { e.preventDefault(); this.editCell(e.key); }
  },
  navigationTarget(key, shift) {
    const order = this.grid.order; if (!order.length) return;
    let index = Math.max(0, order.indexOf(this.active?.row)), c = this.active?.column || 0;
    if (key === 'Tab') { const flat = Math.max(0, Math.min(order.length * this.model.columns - 1, index * this.model.columns + c + (shift ? -1 : 1))); index = Math.floor(flat / this.model.columns); c = flat % this.model.columns; }
    else if (key === 'Enter') index += shift ? -1 : 1;
    else if (key === 'ArrowUp' || key === 'ArrowDown') index += key === 'ArrowUp' ? -1 : 1;
    else c += key === 'ArrowLeft' ? -1 : 1;
    return { row: order[Math.max(0, Math.min(order.length - 1, index))], column: Math.max(0, Math.min(this.model.columns - 1, c)), extend: shift && key.startsWith('Arrow'), reveal: true };
  },
  navigate(key, shift) {
    const target = this.navigationTarget(key, shift);
    if (target) this.select(target.row, target.column, target.extend, true);
  },
  deleteRow() {
    if (!this.active || this.pending) return;
    this.cancelEdit(false);
    const { row, column } = this.active; this.sortOrder = null;
    return this.apply(deleteCsvRows(this.model, row), { row: Math.max(0, Math.min(row, this.model.rows.length - 2)), column });
  },
  deleteColumn() {
    if (!this.active || this.pending) return;
    this.cancelEdit(false);
    const { row, column } = this.active;
    return this.apply(csvColumns(this.model, 'delete', column), { row, column: Math.max(0, Math.min(column, this.model.columns - 2)) });
  },
  menu(event) {
    if (!this.active) return;
    const root = this.ports.root; this.closeMenu?.();
    const menu = document.createElement('div'); menu.className = 'csv-context-menu csv-menu'; menu.setAttribute('role', 'menu');
    const button = (label, action, disabled = false) => { const b = document.createElement('button'); b.textContent = t(label); b.disabled = disabled; b.setAttribute('role', 'menuitem'); b.onclick = () => { menu.remove(); this.attempt(action); }; menu.append(b); };
    const r = this.active.row, c = this.active.column, locked = this.ports.readOnly();
    const rowAxis = event.target.closest('[data-csv-row]'), colAxis = event.target.closest('[data-csv-column]');
    if (!colAxis) {
      button('在上方插入行', () => this.apply(insertCsvRow(this.model, r), { row: r, column: c }), locked); button('在下方插入行', () => this.apply(insertCsvRow(this.model, r + 1), { row: r + 1, column: c }), locked);
      button('删除行', () => this.deleteRow(), locked);
      const firstRow = this.ports.doc().csvHeader ? 1 : 0;
      for (const [label, delta] of [['上移行', -1], ['下移行', 1]]) button(label, () => { const order = this.model.rows.map((_, i) => i); [order[r], order[r + delta]] = [order[r + delta], order[r]]; this.apply(reorderCsvRows(this.model, order), { row: r + delta, column: c }); }, locked || r + delta < firstRow || r + delta >= this.model.rows.length);
    }
    if (!rowAxis) {
      button('在左侧插入列', () => this.apply(csvColumns(this.model, 'insert', c)), locked); button('在右侧插入列', () => this.apply(csvColumns(this.model, 'insert', c + 1)), locked); button('删除列', () => this.deleteColumn(), locked);
      for (const [label, delta] of [['左移列', -1], ['右移列', 1]]) button(label, () => this.apply(csvColumns(this.model, 'move', c, c + delta), { row: r, column: c + delta }), locked || c + delta < 0 || c + delta >= this.model.columns);
      for (const [label, descending, write] of [['升序 · 仅显示', false, false], ['降序 · 仅显示', true, false], ['升序 · 写入文件', false, true], ['降序 · 写入文件', true, true]]) button(label, () => this.sort(c, descending, write), write && locked);
    }
    button('清空选择', () => this.clear(), locked); button('编辑单元格', () => this.editCell(), locked);
    root.querySelector('.csv-panel').append(menu); const box = root.querySelector('.csv-panel').getBoundingClientRect(); menu.style.left = Math.max(0, Math.min(event.clientX - box.left, box.width - menu.offsetWidth)) + 'px'; menu.style.top = Math.max(0, Math.min(event.clientY - box.top, box.height - menu.offsetHeight)) + 'px';
    this.closeMenu = mountMenu(menu,{opener:this.grid.surface,signal:this.events.signal});
  },
  sort(column, descending, write) {
    const order = this.model.rows.map((_, i) => i).filter(i => !this.ports.doc().csvHeader || i !== 0);
    order.sort((a, b) => String(this.model.rows[a][column] || '').localeCompare(String(this.model.rows[b][column] || ''), this.ports.language(), { numeric: true }) * (descending ? -1 : 1));
    if (write) { if (this.ports.doc().csvHeader) order.unshift(0); this.sortOrder = null; this.apply(reorderCsvRows(this.model, order)); }
    else { this.sortOrder = order; this.refreshGrid(); }
  },
  openFind() { const bar = this.ports.root.querySelector('.csv-find'); bar.hidden = false; bar.querySelector('input').focus(); },
  search(next = false) {
    const root = this.ports.root, query = root.querySelector('#csv-search').value.toLocaleLowerCase(); this.query = query;
    if (!next) { this.hits = []; if (query) for (const [row, values] of this.model.rows.entries()) for (const [column, value] of values.entries()) if (value.toLocaleLowerCase().includes(query)) this.hits.push({ row, column }); this.hitIndex = -1; }
    const filter = root.querySelector('#csv-filter').checked;
    if (!next && filter) this.refreshGrid();
    if (this.hits?.length) { this.hitIndex = (this.hitIndex + 1) % this.hits.length; const hit = this.hits[this.hitIndex]; if (this.grid.order.includes(hit.row)) this.select(hit.row, hit.column, false, true, { focus: false }); }
    root.querySelector('#csv-find-count').textContent = String(this.hits?.length || 0); this.showSelection();
  },
};
