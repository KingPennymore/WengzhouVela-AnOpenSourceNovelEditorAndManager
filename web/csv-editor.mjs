import { parseCsv, writeCsv, documentDelimiter, MAX_CSV_CELLS } from './csv.mjs';
import { csvTable, csvColumnName, CSV_COLUMN_PAGE } from './csv-view.mjs';
import { MAX_TEXT_BYTES } from './model.mjs';

/** All edits use the original document's undo history. The grid never owns a second saved copy. */
export class CsvEditor {
  constructor(ports) {
    this.ports = ports;
    this.reset();
    const { root } = ports;
    root.addEventListener('focusin', (event) => {
      const cell = event.target.closest('[data-cell-row]');
      if (!cell) return;
      this.active = { row: Number(cell.dataset.cellRow), column: Number(cell.dataset.cellColumn) };
      this.showActive();
    });
    root.addEventListener('input', (event) => {
      const cell = event.target.closest('[data-cell-row]');
      if (!cell) return;
      this.attempt(() => {
        this.setCell(Number(cell.dataset.cellRow), Number(cell.dataset.cellColumn), cell.value);
        this.showActive();
      });
    });
    root.addEventListener('paste', (event) => {
      const cell = event.target.closest('[data-cell-row]'),
        text = event.clipboardData?.getData('text/plain');
      if (!cell || !text?.includes('\t')) return;
      event.preventDefault();
      this.attempt(() => {
        const pasted = parseCsv(text, '\t'),
          rows = this.rows.map((row) => [...row]);
        const r = Number(cell.dataset.cellRow),
          c = Number(cell.dataset.cellColumn);
        for (const [i, values] of pasted.entries()) {
          rows[r + i] ||= [];
          for (const [j, value] of values.entries()) {
            while (rows[r + i].length <= c + j) rows[r + i].push('');
            rows[r + i][c + j] = value;
          }
        }
        this.apply(rows);
        this.render();
        this.focus(r, c);
      });
    });
    root.addEventListener('keydown', (event) => {
      const cell = event.target.closest('[data-cell-row]');
      if (!cell || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      const index =
        Number(cell.dataset.cellRow) * this.grid.columns +
        Number(cell.dataset.cellColumn) +
        (event.shiftKey ? -1 : 1);
      if (index < 0 || index >= this.rows.length * this.grid.columns) return;
      event.preventDefault();
      this.focus(Math.floor(index / this.grid.columns), index % this.grid.columns);
    });
  }

  reset() {
    this.rowPage = 0;
    this.columnPage = 0;
    this.active = null;
  }
  attempt(action) {
    try {
      action();
    } catch (error) {
      this.ports.fail(error);
    }
  }
  apply(rows) {
    const p = this.ports;
    if (p.readOnly()) throw Error('当前文稿暂不可编辑，请稍后重试。');
    if (rows.reduce((sum, row) => sum + row.length, 0) > MAX_CSV_CELLS)
      throw Error('表格超过 200000 个单元格。');
    const source = p.source(),
      delimiter = documentDelimiter(p.doc(), source);
    const prefix = /^(?:\uFEFF)?sep=([,;\t])\r?\n/i.test(source) ? 'sep=' + delimiter + '\n' : '';
    const text = prefix + writeCsv(rows, delimiter);
    if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) throw Error('表格不能超过 8 MB。');
    p.change(text);
    this.rows = rows;
  }
  setCell(r, c, value) {
    const rows = this.rows.map((row) => [...row]);
    while (rows[r].length <= c) rows[r].push('');
    rows[r][c] = value;
    this.apply(rows);
  }
  render() {
    const p = this.ports,
      doc = p.doc(),
      delimiter = documentDelimiter(doc, p.source());
    this.rows = parseCsv(p.source(), delimiter);
    this.grid = csvTable(this.rows, this.rowPage, this.columnPage, delimiter, p.escape, {
      name: doc.name,
    });
    if (
      this.active &&
      (this.active.row >= this.rows.length || this.active.column >= this.grid.columns)
    )
      this.active = null;
    this.rowPage = this.grid.rowPage;
    this.columnPage = this.grid.columnPage;
    p.root.innerHTML = this.grid.html;
    for (const cell of p.root.querySelectorAll('textarea')) cell.readOnly = p.readOnly();
    const bind = (id, action) => {
      const button = p.root.querySelector('#csv-' + id);
      if (button) button.onclick = () => this.attempt(action);
    };
    bind('prev', () => {
      this.rowPage--;
      this.render();
    });
    bind('next', () => {
      this.rowPage++;
      this.render();
    });
    bind('column-prev', () => {
      this.columnPage--;
      this.render();
    });
    bind('column-next', () => {
      this.columnPage++;
      this.render();
    });
    bind('add-row', () => {
      const rows = [...this.rows, Array(this.grid.columns).fill('')];
      this.apply(rows);
      this.rowPage = Math.floor((rows.length - 1) / this.grid.pageSize);
      this.render();
      this.focus(rows.length - 1, 0);
    });
    bind('add-column', () => {
      const column = this.grid.columns;
      this.apply(this.rows.map((row) => [...row, ...Array(column - row.length).fill(''), '']));
      this.columnPage = Math.floor(column / CSV_COLUMN_PAGE);
      this.render();
    });
    bind('edit-cell', () => this.editCell());
    bind('tools', () => this.tools());
    p.root.querySelector('#csv-delimiter').onchange = (event) => {
      const previous = documentDelimiter(doc, p.source());
      this.attempt(() => {
        try {
          parseCsv(p.source(), event.target.value);
        } catch (error) {
          event.target.value = previous;
          throw error;
        }
        doc.delimiter = event.target.value;
        this.reset();
        this.render();
        p.save();
      });
    };
    this.showActive();
  }
  showActive() {
    const root = this.ports.root;
    root.querySelector('.csv-cell-tools').hidden = !this.active;
    root.querySelector('#csv-cell-reference').textContent = this.active
      ? csvColumnName(this.active.column) + (this.active.row + 1)
      : '选择单元格';
    root.querySelector('#csv-edit-cell').disabled = !this.active;
    root.querySelector('.csv-cell-summary').textContent = this.active
      ? this.rows[this.active.row]?.[this.active.column] || '空单元格'
      : '';
    for (const heading of root.querySelectorAll('[data-csv-row],[data-csv-column]')) {
      const selected =
        this.active &&
        (heading.dataset.csvRow !== undefined
          ? Number(heading.dataset.csvRow) === this.active.row
          : Number(heading.dataset.csvColumn) === this.active.column);
      heading.classList.toggle('csv-active-axis', !!selected);
    }
    for (const cell of root.querySelectorAll('[data-cell-row]'))
      cell.parentElement.classList.toggle(
        'csv-active-cell',
        !!this.active &&
          Number(cell.dataset.cellRow) === this.active.row &&
          Number(cell.dataset.cellColumn) === this.active.column,
      );
  }
  focus(row, column) {
    this.active = { row, column };
    const rowPage = Math.floor(row / this.grid.pageSize),
      columnPage = Math.floor(column / CSV_COLUMN_PAGE);
    if (rowPage !== this.rowPage || columnPage !== this.columnPage) {
      this.rowPage = rowPage;
      this.columnPage = columnPage;
      this.render();
    }
    const cell = this.ports.root.querySelector(
      `[data-cell-row="${row}"][data-cell-column="${column}"]`,
    );
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  editCell() {
    if (!this.active) return;
    const { row, column } = this.active,
      p = this.ports,
      doc = p.doc(),
      source = p.source();
    p.openModal(
      '编辑单元格 · ' + csvColumnName(column) + (row + 1),
      `<label>内容<textarea name="value" rows="7" autofocus>${p.escape(this.rows[row]?.[column] || '')}</textarea></label><small>支持换行。保存后可使用撤销恢复。</small>`,
      (form) => {
        if (p.doc() !== doc || p.source() !== source) throw Error('表格已变化，请重新打开单元格。');
        this.setCell(row, column, form.get('value'));
        this.render();
        p.save();
      },
      { label: '保存单元格' },
    );
  }
  tools() {
    const p = this.ports,
      doc = p.doc(),
      source = p.source();
    p.openModal(
      '表格操作',
      '<label>操作<select name="action"><option value="delete-row">删除行</option><option value="delete-column">删除列</option><option value="sort">按列排序</option></select></label>' +
        `<label>行号<input name="row" type="number" min="1" max="${this.rows.length}" value="${(this.active?.row || 0) + 1}"></label>` +
        `<label>列号<input name="column" type="number" min="1" max="${this.grid.columns}" value="${(this.active?.column || 0) + 1}"></label>` +
        '<label class="checkbox"><input name="header" type="checkbox" checked>排序保留第一行表头</label><label class="checkbox"><input name="descending" type="checkbox">降序</label><small>修改后可以使用撤销恢复。</small>',
      (form) => {
        if (p.doc() !== doc || p.source() !== source)
          throw Error('表格已变化，请重新打开操作面板。');
        const r = Number(form.get('row')) - 1,
          c = Number(form.get('column')) - 1;
        if (
          !Number.isInteger(r) ||
          r < 0 ||
          r >= this.rows.length ||
          !Number.isInteger(c) ||
          c < 0 ||
          c >= this.grid.columns
        )
          throw Error('行号或列号无效。');
        let rows = this.rows.map((row) => [...row]);
        if (form.get('action') === 'delete-row') rows.splice(r, 1);
        else if (form.get('action') === 'delete-column')
          rows = rows.map((row) => row.filter((_, i) => i !== c));
        else {
          const header = form.has('header') ? rows.shift() : null;
          rows.sort(
            (a, b) =>
              String(a[c] || '').localeCompare(String(b[c] || ''), p.language(), {
                numeric: true,
              }) * (form.has('descending') ? -1 : 1),
          );
          if (header) rows.unshift(header);
        }
        if (!rows.length || rows.every((row) => !row.length)) rows = [['']];
        this.apply(rows);
        this.active = null;
        this.render();
        p.save();
      },
    );
  }
}
