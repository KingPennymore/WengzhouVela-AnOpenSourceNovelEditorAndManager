export const CSV_COLUMN_PAGE = 50;

export function csvColumnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Mount at most 2,000 cells, independent of source size. */
export function csvWindow(rows, rowPage = 0, columnPage = 0) {
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const columnPages = Math.max(1, Math.ceil(columns / CSV_COLUMN_PAGE));
  columnPage = Math.max(0, Math.min(columnPage, columnPages - 1));
  const startColumn = columnPage * CSV_COLUMN_PAGE,
    count = Math.min(CSV_COLUMN_PAGE, columns - startColumn);
  const pageSize = Math.max(
      1,
      Math.min(100, Math.floor(2000 / Math.min(columns, CSV_COLUMN_PAGE))),
    ),
    pages = Math.max(1, Math.ceil(rows.length / pageSize));
  rowPage = Math.max(0, Math.min(rowPage, pages - 1));
  return {
    columns,
    columnPages,
    columnPage,
    startColumn,
    count,
    pageSize,
    pages,
    rowPage,
    offset: rowPage * pageSize,
  };
}

/** Readers share the same grid and pagination without edit controls. */
export function csvTable(
  rows,
  rowPage,
  columnPage,
  delimiter,
  esc,
  { name = '数据表格', readOnly = false, prefix = 'csv' } = {},
) {
  const grid = csvWindow(rows, rowPage, columnPage);
  const { columns, columnPages, startColumn, count, pageSize, pages, offset } = grid;
  rowPage = grid.rowPage;
  columnPage = grid.columnPage;
  const button = (id, label, disabled = false) =>
    `<button type="button" class="secondary" id="${prefix}-${id}" data-csv-action="${id}" ${['tools', 'add-row', 'add-column'].includes(id) ? 'aria-label="' + { tools: '表格操作', 'add-row': '新增行', 'add-column': '新增列' }[id] + '" title="' + { tools: '表格操作', 'add-row': '新增行', 'add-column': '新增列' }[id] + '"' : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
  const html = [
    `<section class="csv-panel${readOnly ? ' csv-readonly' : ''}" aria-label="${readOnly ? '表格阅读' : '表格编辑'}">`,
    '<div class="csv-toolbar" role="toolbar" aria-label="表格工具">',
    !readOnly
      ? button(
          'add-row',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v10H3zM3 9h18M12 17v6M9 20h6"/></svg>',
        ) +
        button(
          'add-column',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h10v18H3zM8 3v18M18 9v6M15 12h6"/></svg>',
        ) +
        '<i class="tool-separator" aria-hidden="true"></i>'
      : '',
    !readOnly
      ? `<label><select id="${prefix}-delimiter" aria-label="表格分隔符" title="分隔符">` +
        [
          [',', '逗号'],
          [';', '分号'],
          ['\t', 'Tab'],
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${value === delimiter ? 'selected' : ''}>${label}</option>`,
          )
          .join('') +
        '</select></label>'
      : '',
    !readOnly
      ? button(
          'tools',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
        )
      : '',
    `<span class="csv-context">${rows.length} 行 · ${columns} 列</span></div>`,
    `<div class="csv-scroll" tabindex="0" role="region" aria-label="表格内容，可横向滚动"><table aria-label="CSV 表格" style="--csv-columns:${count}">`,
    '<thead><tr><th scope="col" class="csv-corner">#</th>',
    Array.from(
      { length: count },
      (_, i) =>
        `<th scope="col" data-csv-column="${startColumn + i}">${csvColumnName(startColumn + i)}</th>`,
    ).join(''),
    '</tr></thead><tbody>',
    rows
      .slice(offset, offset + pageSize)
      .map((row, i) => {
        const r = offset + i;
        return (
          `<tr><th scope="row" data-csv-row="${r}">${r + 1}</th>` +
          Array.from({ length: count }, (_, j) => {
            const c = startColumn + j,
              value = row[c] ?? '';
            return readOnly
              ? `<td><span class="csv-value" data-user-content>${esc(value)}</span></td>`
              : `<td><textarea data-user-content rows="${Math.min(6, value.split('\n').length)}" spellcheck="false" aria-label="第 ${r + 1} 行第 ${c + 1} 列" data-cell-row="${r}" data-cell-column="${c}">${esc(value)}</textarea></td>`;
          }).join('') +
          '</tr>'
        );
      })
      .join(''),
    '</tbody></table></div>',
    !readOnly
      ? '<div class="csv-cell-tools" hidden><span id="csv-cell-reference" aria-live="polite">选择单元格</span><span class="csv-cell-summary" data-user-content></span>' +
        button('edit-cell', '展开编辑', true) +
        '</div>'
      : '',
    '<footer class="csv-pagination"><div class="csv-page-controls">',
    button('prev', '上一页', rowPage === 0),
    `<span>第 ${rowPage + 1} / ${pages} 页</span>`,
    button('next', '下一页', rowPage + 1 >= pages),
    '</div>',
    columnPages > 1
      ? '<div class="csv-page-controls">' +
        button('column-prev', '左侧列', columnPage === 0) +
        `<span>列 ${startColumn + 1}–${startColumn + count}</span>` +
        button('column-next', '右侧列', columnPage + 1 >= columnPages) +
        '</div>'
      : '',
    '</footer></section>',
  ].join('');
  return { html, ...grid };
}
