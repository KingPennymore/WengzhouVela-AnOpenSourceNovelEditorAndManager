import { documentDelimiter } from './csv.mjs';
import { CsvParser, parseCsvModel, setCsvCell, insertCsvRow, csvColumns } from './csv-model.mjs';
import { CsvGrid, csvMetrics } from './csv-grid.mjs';
import { csvGridEditing } from './csv-grid-editor.mjs';
import { mountPlanningChrome } from './planning-chrome.mjs';
import { icon } from './icons.mjs';
import { t } from './i18n.mjs';

/** The source editor owns text, history and saving. Only transient view/draft state lives here. */
export class CsvEditor {
  constructor(ports) { this.ports = ports; this.parser = new CsvParser(); this.epoch = 0; }
  reset() { this.dispose(); this.docId = null; this.active = null; this.anchor = null; this.sortOrder = null; this.query = ''; }
  dispose() {
    this.epoch++; this.parser.cancel(); this.events?.abort(); this.grid?.dispose(); if (this.grid) this.grid.disposed = true;
    this.ports.root.planningChromeDispose?.(); clearTimeout(this.pressTimer); clearTimeout(this.keyboardTimer); this.grid = null; this.editing = null; this.space = false;
  }
  /** A toolbar control: on phones mountPlanningChrome moves the bottom actions out of the panel. */
  control(id) { const p = this.ports; return p.root.querySelector('#csv-' + id) || p.root.planningBottomActions?.querySelector('#csv-' + id) || null; }
  attempt(action) { try { const result = action(); if (result?.catch) result.catch(error => this.ports.fail(error)); } catch (error) { this.ports.fail(error); } }
  saveView() { if (!this.docId || !this.state) return; try { localStorage.setItem('vela.csv.view.' + this.docId, JSON.stringify(this.state)); } catch {} }
  async render(reveal) {
    this.dispose(); const epoch = this.epoch, p = this.ports, doc = p.doc(), source = p.source();
    if (this.docId !== doc.id) { this.active = null; this.anchor = null; this.sortOrder = null; this.query = ''; this.docId = doc.id; try { this.state = JSON.parse(localStorage.getItem('vela.csv.view.' + doc.id)) || {}; } catch { this.state = {}; } }
    this.state ||= {};
    // An asynchronous parse never publishes into a different document, source or mount.
    if (source.length >= 262144) p.root.innerHTML = `<div class="csv-loading" role="status">${t('正在读取表格…')}</div>`;
    let model;
    try { model = source.length < 262144 ? parseCsvModel(source, documentDelimiter(doc, source)) : await this.parser.parse(source, documentDelimiter(doc, source)); }
    catch (error) { if (epoch === this.epoch) p.fail(error); return; }
    if (!model || epoch !== this.epoch || p.doc() !== doc || p.source() !== source) return;
    this.model = model; this.rows = model.rows;
    if (model.error) {
      p.root.innerHTML = `<section class="csv-panel"><div class="csv-error" role="alert"><span>${p.escape(t(model.error))} · ${t('行')} ${model.line} · ${t('列')} ${model.column}</span><button id="csv-source">${t('在源码中定位')}</button></div></section>`;
      p.root.querySelector('#csv-source').onclick = () => p.sourceMode(model.offset); return;
    }
    // Store the observed file format as document metadata; raw source remains the save payload.
    doc.csvFormat = { ...model.format };
    if (this.active && (this.active.row >= model.rows.length || this.active.column >= model.columns)) this.active = this.anchor = null;
    const button = (id, label, glyph = '') => `<button type="button" id="csv-${id}" aria-label="${t(label)}" title="${t(label)}">${glyph ? icon(glyph) : ''}<span>${t(label)}</span></button>`;
    p.root.innerHTML = `<section class="csv-panel planning-preview"><div class="planning-surface">
      <header class="planning-toolbar csv-toolbar"><div class="planning-primary">${button('find','查找','search')}<button id="csv-header" aria-pressed="${!!doc.csvHeader}">${t('首行为表头')}</button></div><span class="csv-context"></span><button type="button" id="csv-tools" class="planning-overflow" aria-label="${t('更多操作')}" aria-expanded="false">${icon('more')}</button><div class="planning-menu" hidden><div class="planning-menu-scroll">
      <label>${t('表格分隔符')}<select id="csv-delimiter" aria-label="${t('表格分隔符')}">${[[',','逗号'],[';','分号'],['\t','Tab']].map(([value,label])=>`<option value="${value}" ${value===model.delimiter?'selected':''}>${t(label)}</option>`).join('')}</select></label>
      ${button('source','编辑 CSV 源码')}${button('reset-widths','重置列宽')}${button('reset-order','恢复原始显示顺序')}
      <label>${t('概览阈值')}<select id="csv-overview-threshold"><option value="0.5" ${this.state.overviewThreshold!==.4?'selected':''}>50%</option><option value="0.4" ${this.state.overviewThreshold===.4?'selected':''}>40%</option></select></label>
      <small>${model.rows.length} ${t('行')} × ${model.columns} ${t('列')} · ${model.format.newline==='\r\n'?'CRLF':model.format.newline==='\r'?'CR':'LF'} · BOM ${model.format.bom?'✓':'−'}${model.format.consistent?'':' · '+t('各行列数不一致')}</small></div></div></header>
      <div class="csv-find" hidden><input type="search" id="csv-search" aria-label="${t('在表格中查找')}" placeholder="${t('在表格中查找')}"><button id="csv-find-next">${t('下一处')}</button><label><input type="checkbox" id="csv-filter">${t('筛选行')}</label><output id="csv-find-count">0</output><button id="csv-find-close" aria-label="${t('关闭')}">×</button></div>
      <div class="csv-grid-mount"></div><div class="csv-editor-layer" hidden><textarea id="csv-input" data-user-content spellcheck="false" aria-label="${t('编辑单元格')}"></textarea><div><button id="csv-commit">${t('确定')}</button><button id="csv-cancel">${t('取消')}</button></div></div>
      <footer class="csv-status" role="status"><span id="csv-cell-reference">${t('选择单元格')}</span><span id="csv-selection-summary"></span></footer>
      <div class="planning-bottom-actions">${button('add-row','新增行','add')}${button('add-column','新增列','table')}${button('edit-cell','编辑','write')}${button('fit','适应全表','focus')}<button type="button" id="csv-actual" aria-label="100%" title="100%">100%</button><button id="csv-zoom-out" aria-label="${t('缩小')}">−</button><button id="csv-zoom" aria-label="${t('缩放比例')}">100%</button><button id="csv-zoom-in" aria-label="${t('放大')}">＋</button></div>
      </div></section>`;
    this.events = new AbortController();
    this.mountGrid(); this.bindInput();
    const bind = (id, fn) => p.root.querySelector('#csv-' + id).onclick = () => this.attempt(fn);
    bind('add-row', () => { this.sortOrder = null; this.apply(insertCsvRow(this.model, this.model.rows.length), { row: this.model.rows.length, column: 0 }); });
    bind('add-column', () => this.apply(csvColumns(this.model, 'insert', this.model.columns), { row: this.active?.row ?? this.grid.order[0] ?? 0, column: this.model.columns }));
    bind('edit-cell', () => this.editCell()); bind('header', () => { if (p.readOnly()) return; doc.csvHeader = !doc.csvHeader; this.active = this.anchor = null; this.refreshGrid(); p.root.querySelector('#csv-header').setAttribute('aria-pressed', String(doc.csvHeader)); p.save(); });
    bind('find', () => this.openFind()); bind('fit', () => this.grid.fit()); bind('actual', () => this.grid.zoom(1));
    bind('zoom-in', () => this.grid.zoom(this.grid.plane.scale * 1.2)); bind('zoom-out', () => this.grid.zoom(this.grid.plane.scale / 1.2)); bind('zoom', () => this.zoomMenu());
    bind('source', () => p.sourceMode()); bind('reset-widths', () => { this.state.widths = []; this.refreshGrid(); this.saveView(); });
    bind('reset-order', () => { this.sortOrder = null; this.refreshGrid(); });
    bind('find-next', () => this.search(true)); bind('find-close', () => { p.root.querySelector('.csv-find').hidden = true; p.root.querySelector('#csv-search').value = ''; p.root.querySelector('#csv-filter').checked = false; this.query = ''; this.refreshGrid(); });
    p.root.querySelector('#csv-search').oninput = () => this.search(); p.root.querySelector('#csv-search').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.search(true); } if (e.key === 'Escape') p.root.querySelector('#csv-find-close').click(); };
    p.root.querySelector('#csv-filter').onchange = () => { this.refreshGrid(); this.search(); };
    p.root.querySelector('#csv-overview-threshold').onchange = e => { this.state.overviewThreshold = Number(e.target.value); this.grid.paint(); this.saveView(); };
    p.root.querySelector('#csv-delimiter').onchange = e => { const next = parseCsvModel(p.source(), e.target.value); if (next.error) { e.target.value = model.delimiter; p.fail(Error(t(next.error))); return; } doc.delimiter = e.target.value; p.save(); this.render(); };
    window.addEventListener('keyup', e => { if (e.key === ' ') this.space = false; }, { signal: this.events.signal });
    window.addEventListener('blur', () => { this.space = false; this.cancelPointer(); }, { signal: this.events.signal });
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.csv-context-menu')) p.root.querySelector('.csv-context-menu')?.remove(); }, { signal: this.events.signal });
    mountPlanningChrome(p.root);
    // The planning chrome moves the bottom actions into the shell footer. Keep the table's own actions
    // first and labelled there instead of stacking them after the text editor's quick actions.
    const actions = p.root.planningBottomActions;
    if (actions) { actions.classList.add('csv-bottom-actions'); actions.parentElement?.insertBefore(actions, actions.parentElement.firstChild); }
    for (const id of ['add-row', 'add-column']) { const control = this.control(id); if (control) control.disabled = p.readOnly(); }
    if (reveal) this.select(reveal.row, reveal.column, false, true); this.showSelection();
    if (this.query) { p.root.querySelector('#csv-search').value = this.query; this.search(); }
  }
  mountGrid() {
    const doc = this.ports.doc(), filtered = this.ports.root.querySelector('#csv-filter')?.checked;
    let order = this.sortOrder?.filter(r => r < this.model.rows.length) || this.model.rows.map((_, r) => r);
    order = order.filter(r => (!doc.csvHeader || r !== 0) && (!filtered || !this.query || this.model.rows[r].some(v => v.toLocaleLowerCase().includes(this.query))));
    this.grid = new CsvGrid(this.ports.root.querySelector('.csv-grid-mount'), { model: this.model, state: this.state, header: !!doc.csvHeader, order,
      onView: () => this.saveView(), onPaint: () => { if (this.grid) this.showSelection(); }, onOverview: hit => this.select(hit.row, hit.column), onPinch: () => this.cancelPointer(),
      canPan: e => !e.target.closest('[data-selection-handle],[data-resize-column]') && !this.dragSelection && (e.pointerType === 'touch' ? !this.editing && !this.composing : e.button === 1 || this.space || !this.grid?.hit(e)),
    });
  }
  refreshGrid() { if (this.editing) this.commit(); this.grid?.dispose(); if (this.grid) this.grid.disposed = true; this.grid = null; this.mountGrid(); this.showSelection(); }
  rebuildMetrics() { this.grid.metrics = csvMetrics(this.model.rows, this.model.columns, this.state.widths, this.grid.order); }
  apply(changes, reveal) {
    if (this.ports.readOnly()) throw Error(t('当前文稿暂不可编辑，请稍后重试。'));
    if (this.model.source !== this.ports.source()) throw Error(t('表格已变化，请重新打开单元格。'));
    if (!changes.length) return;
    this.ports.change(changes); this.ports.save(); this.render(reveal);
  }
  setCell(row, column, value) { this.apply(setCsvCell(this.model, row, column, value)); }
  focus(row, column) { this.select(row, column, false, true); }
  zoomMenu() {
    const root = this.ports.root; root.querySelector('.csv-context-menu')?.remove(); const menu = document.createElement('div'); menu.className = 'csv-context-menu csv-zoom-menu'; menu.setAttribute('role', 'menu');
    for (const value of [.5, 1, 1.5, 2, 'width']) { const button = document.createElement('button'); button.textContent = value === 'width' ? t('适应宽度') : value * 100 + '%'; button.onclick = () => { menu.remove(); value === 'width' ? this.grid.fit(true) : this.grid.zoom(value); }; menu.append(button); }
    root.querySelector('.csv-panel').append(menu);
  }
}
Object.assign(CsvEditor.prototype, csvGridEditing);
