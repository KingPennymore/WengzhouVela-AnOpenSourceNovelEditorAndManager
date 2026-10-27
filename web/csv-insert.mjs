import { writeCsv } from './csv.mjs';
import { documentPath } from './workspace.mjs';
import { relativeTablePath, resolveTablePath, mountCsvTable } from './csv-embed.mjs';
import { formatsOf, insertCsvTable, updateCsvTable } from './rich-text-editor.mjs';

/** A single dialog for linking, creating, replacing and removing TXT table references. */
export function showCsvInsert(ports, id) {
  const p = ports,
    doc = p.doc(),
    view = p.view(),
    workspace = p.workspace(),
    esc = p.escape;
  const entry = id
    ? formatsOf(view.state)?.entries.find((item) => item.type === 'csv-table' && item.id === id)
    : null;
  if (id && !entry) throw Error('找不到此表格引用，请重新打开文稿。');
  const paths = [
    ...new Set([
      ...workspace.documents.map(documentPath),
      ...(workspace.entries || []).filter((item) => !item.directory).map((item) => item.path),
    ]),
  ]
    .filter((path) => /\.(csv|tsv)$/i.test(path))
    .sort((a, b) => a.localeCompare(b));
  const initial = entry ? resolveTablePath(documentPath(doc), entry.src) : paths[0];
  if (initial && !paths.includes(initial)) paths.unshift(initial);
  const creating = !paths.length;
  const ensureCurrent = () => {
    if (p.doc() !== doc || p.view() !== view || p.workspace() !== workspace)
      throw Error('文稿已切换，请重新插入表格。');
    if (p.readOnly()) throw Error('当前文稿暂不可编辑。');
  };
  p.openModal(
    entry ? '嵌入表格设置' : '插入 CSV 表格',
    '<div class="table-insert-modes">' +
      `<label class="checkbox"><input type="radio" name="tableMode" value="existing" ${creating ? '' : 'checked'}>选择已有文件</label>` +
      `<label class="checkbox"><input type="radio" name="tableMode" value="new" ${creating ? 'checked' : ''}>创建新文件</label></div>` +
      `<fieldset id="table-existing"><label>CSV / TSV 文件<select name="tableFile" required>${paths
        .map(
          (path) =>
            `<option value="${esc(path)}" ${path === initial ? 'selected' : ''}>${esc(path)}</option>`,
        )
        .join('')}</select></label></fieldset>` +
      '<fieldset id="table-new"><label>文件路径<input name="tableName" value="表格.csv" required placeholder="表格/人物.csv"><small>相对于本文所在文件夹，可使用 .csv 或 .tsv。</small></label>' +
      '<div class="table-insert-size"><label>行数<input name="tableRows" type="number" min="1" max="100" value="4" required></label>' +
      '<label>列数<input name="tableColumns" type="number" min="1" max="50" value="3" required></label></div></fieldset>' +
      `<label>表格标题（可选）<input name="tableCaption" maxlength="200" value="${esc(entry?.caption || '')}"></label>` +
      `<label class="checkbox"><input name="tableHeader" type="checkbox" ${entry?.header === false ? '' : 'checked'}>第一行作为表头</label>` +
      '<small>表格放在光标所在段落之后，TXT 正文不变。修改原表格后，重新打开文稿即可查看最新内容。</small>' +
      '<div id="table-insert-preview"></div>' +
      (entry
        ? '<div class="button-row"><button type="button" class="secondary" id="table-open-source">打开原表格</button><button type="button" class="danger" id="table-remove">移除嵌入</button></div><small>移除只删除格式引用，不删除原表格文件。</small>'
        : ''),
    async (form) => {
      ensureCurrent();
      const caption = String(form.get('tableCaption') || '').trim(),
        header = form.has('tableHeader');
      let path;
      if (form.get('tableMode') === 'new') {
        path = resolveTablePath(documentPath(doc), form.get('tableName'));
        const rows = Number(form.get('tableRows')),
          columns = Number(form.get('tableColumns'));
        if (
          !Number.isInteger(rows) ||
          rows < 1 ||
          rows > 100 ||
          !Number.isInteger(columns) ||
          columns < 1 ||
          columns > 50
        )
          throw Error('新表格支持 1–100 行、1–50 列。');
        const delimiter = /\.tsv$/i.test(path) ? '\t' : ',';
        const values = Array.from({ length: rows }, (_, r) =>
          Array.from({ length: columns }, (_, c) => (header && r === 0 ? '列' + (c + 1) : '')),
        );
        p.create({ path, text: writeCsv(values, delimiter), delimiter });
      } else {
        path = form.get('tableFile');
        if (!paths.includes(path)) throw Error('请选择已有的 CSV / TSV 文件。');
        await p.load(doc, relativeTablePath(documentPath(doc), path));
        ensureCurrent();
      }
      const next = { src: relativeTablePath(documentPath(doc), path), caption, header };
      if (entry) updateCsvTable(view, entry.id, next);
      else insertCsvTable(view, next);
      if (!p.save()) throw Error('表格引用保存失败，请重试或导出备份。');
      p.changed();
      view.focus();
    },
    { label: entry ? '保存设置' : '插入表格' },
  );
  const root = p.root();
  const refresh = () => {
    const create = root.querySelector('[name=tableMode]:checked').value === 'new';
    for (const [selector, disabled] of [
      ['#table-existing', create],
      ['#table-new', !create],
    ]) {
      const field = root.querySelector(selector);
      field.hidden = disabled;
      field.disabled = disabled;
    }
    const preview = root.querySelector('#table-insert-preview');
    preview.replaceChildren();
    if (!create && root.querySelector('[name=tableFile]').value) {
      const src = relativeTablePath(
        documentPath(doc),
        root.querySelector('[name=tableFile]').value,
      );
      const host = document.createElement('div');
      preview.append(host);
      mountCsvTable(
        host,
        { src, header: root.querySelector('[name=tableHeader]').checked },
        (value) => p.load(doc, value),
      );
    }
  };
  root
    .querySelectorAll('[name=tableMode],[name=tableFile],[name=tableHeader]')
    .forEach((input) => (input.onchange = refresh));
  refresh();
  if (entry) {
    root.querySelector('#table-remove').onclick = () => {
      try {
        ensureCurrent();
        updateCsvTable(view, entry.id, null);
        p.save();
        p.close();
        p.changed();
      } catch (error) {
        p.fail(error);
      }
    };
    root.querySelector('#table-open-source').onclick = () => {
      try {
        ensureCurrent();
        if (!p.save()) throw Error('请先保存当前文稿。');
        p.close();
        p.open(resolveTablePath(documentPath(doc), entry.src));
      } catch (error) {
        p.fail(error);
      }
    };
  }
}
