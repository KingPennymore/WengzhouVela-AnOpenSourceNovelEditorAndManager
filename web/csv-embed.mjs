import { parseCsv, documentDelimiter } from './csv.mjs';
import { documentPath } from './workspace.mjs';
import { MAX_TEXT_BYTES } from './model.mjs';
import { decodeFileText } from './file-text.mjs';
import { fromBase64 } from './plugin-package.mjs';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

/** Relative references may reach another workspace folder, but never leave the workspace. */
export function resolveTablePath(document, source) {
  const src = String(source || '')
    .trim()
    .replaceAll('\\', '/');
  if (
    !src ||
    /^(?:\/|[a-z][\w+.-]*:)/i.test(src) ||
    /[\x00-\x1f]/.test(src) ||
    !/\.(csv|tsv)$/i.test(src)
  )
    throw Error('请选择工作区内的 CSV 或 TSV 文件。');
  const parts = document.split('/').slice(0, -1);
  for (const part of src.split('/')) {
    if (part === '..') {
      if (!parts.length) throw Error('表格路径不能超出工作区。');
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
    else if (!part) throw Error('表格路径无效。');
  }
  return parts.join('/');
}

export function relativeTablePath(document, target) {
  const from = document.split('/').slice(0, -1),
    to = target.split('/');
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;
  const result = [...Array(from.length - shared).fill('..'), ...to.slice(shared)].join('/');
  resolveTablePath(document, result);
  return result;
}

/** Keep linked data attached when its source, its TXT, or the whole work is moved or copied. */
export function remapCsvRecord(record, oldOwner, newOwner, mapTarget) {
  let changed = false;
  const result = { ...record };
  for (const group of ['inserts', 'review']) {
    if (!Array.isArray(record[group])) continue;
    result[group] = record[group].map((entry) => {
      if (entry.type !== 'csv-table' || typeof entry.src !== 'string') return entry;
      try {
        const target = mapTarget(resolveTablePath(oldOwner, entry.src));
        const src = relativeTablePath(newOwner, target);
        if (src === entry.src) return entry;
        changed = true;
        return { ...entry, src };
      } catch {
        return entry;
      }
    });
  }
  return changed ? result : record;
}

export function tablesByLine(text, entries) {
  const map = new Map();
  for (const entry of entries
    .filter(
      (item) =>
        item.group === 'inserts' && item.type === 'csv-table' && typeof item.src === 'string',
    )
    .sort((a, b) => a.from - b.from)) {
    const end = text.indexOf('\n', Math.min(entry.from, text.length)),
      at = end < 0 ? text.length : end;
    if (!map.has(at)) map.set(at, []);
    map.get(at).push(entry);
  }
  return map;
}

/** Read current document text first; lazily loaded native files use the same workspace text decoder. */
export async function loadCsvTable(workspace, document, src, { readFile, loadDocument } = {}) {
  const path = resolveTablePath(documentPath(document), src);
  const doc = workspace.documents.find((item) => documentPath(item) === path);
  let text;
  if (doc) {
    await loadDocument?.(doc);
    text = doc.text;
  } else if (readFile && workspace.entries?.some((item) => !item.directory && item.path === path)) {
    const data = await readFile(path);
    if (typeof data !== 'string' || data.length > 12 * 1024 * 1024)
      throw Error('表格不能超过 8 MB。');
    text = decodeFileText(fromBase64(data));
  } else throw Error('找不到表格文件：' + path);
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_TEXT_BYTES)
    throw Error('表格不能超过 8 MB。');
  const delimiter = documentDelimiter(doc || { path, text }, text);
  return { path, name: path.split('/').at(-1), rows: parseCsv(text, delimiter), delimiter };
}

/** One snapshot per source for a reading session or export; failures remain explicit placeholders. */
export async function collectCsvTables(entries, load) {
  const tables = new Map();
  const sources = [
    ...new Set(
      entries
        .filter((entry) => entry.group === 'inserts' && entry.type === 'csv-table')
        .map((entry) => entry.src),
    ),
  ];
  for (const [index, src] of sources.entries()) {
    if (index >= 128) {
      tables.set(src, { error: '关联表格过多，请分章节导出。' });
      continue;
    }
    try {
      tables.set(src, await load(src));
    } catch (error) {
      tables.set(src, { error: error.message });
    }
  }
  return tables;
}

/** Static, escaped HTML is shared by embedded previews and offline exports. */
export function csvTableMarkup(
  snapshot,
  entry = {},
  { maxRows = Infinity, maxColumns = Infinity } = {},
) {
  if (!snapshot || snapshot.error)
    return `<p class="table-missing">无法读取表格：${escape(entry.src)}${snapshot?.error ? ' · ' + escape(snapshot.error) : ''}</p>`;
  const rows = snapshot.rows,
    columns = rows.reduce((n, row) => Math.max(n, row.length), 1);
  const shown = rows.slice(0, maxRows),
    count = Math.min(columns, maxColumns),
    header = entry.header !== false;
  const row = (values, tag) =>
    '<tr>' +
    Array.from(
      { length: count },
      (_, c) =>
        `<${tag} data-user-content${tag === 'th' ? ' scope="col"' : ''}>${escape(values[c] || '').replace(/\n/g, '<br/>')}</${tag}>`,
    ).join('') +
    '</tr>';
  return (
    '<table>' +
    (entry.caption ? '<caption>' + escape(entry.caption) + '</caption>' : '') +
    (header && shown.length ? '<thead>' + row(shown[0], 'th') + '</thead>' : '') +
    '<tbody>' +
    shown
      .slice(header ? 1 : 0)
      .map((values) => row(values, 'td'))
      .join('') +
    '</tbody></table>' +
    (shown.length < rows.length || count < columns
      ? `<p class="table-note">预览前 ${shown.length} 行、${count} 列 · 原表 ${rows.length} 行、${columns} 列</p>`
      : '')
  );
}

export const CSV_TABLE_EXPORT_CSS =
  '.csv-table{margin:1em 0;max-width:100%;overflow-x:auto;break-inside:avoid}.csv-table table{border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;font-size:13px;text-align:start}.csv-table th,.csv-table td{border:1px solid #999;padding:.45em .65em;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.csv-table caption{font-weight:bold;text-align:start;padding:.5em 0}.table-missing{font-size:.85em;color:#777}';

const shadowCss = `:host{display:block;max-width:100%;font-family:inherit;line-height:1.6;color:inherit;text-align:start;text-indent:0}
*{box-sizing:border-box}section{width:100%;max-width:100%;border:1px solid var(--line,#ddd);border-radius:var(--radius,8px);overflow:hidden;background:var(--paper,#fff)}
header{display:flex;gap:8px;align-items:center;padding:7px 10px;background:var(--soft,#f4f5f2);font:12px/1.6 inherit}
header span{min-width:0;flex:1;overflow-wrap:anywhere;font-size:12px;color:var(--muted,#777)}
button{flex:none;min-height:44px;padding:6px 12px;border:1px solid var(--line,#ddd);border-radius:var(--radius,8px);background:var(--paper,#fff);color:var(--accent,#286b50);font:inherit;font-size:12px;cursor:pointer}
button:focus-visible,.scroll:focus-visible{outline:2px solid var(--accent,#286b50);outline-offset:-2px}
.scroll{max-width:100%;overflow:visible;touch-action:auto}
table{width:100%;max-width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:var(--csv-embed-font,13px);line-height:1.55;white-space:normal}
caption{text-align:start;padding:8px 10px;font-weight:600;caption-side:top;overflow-wrap:anywhere}
th,td{min-width:0;max-width:none;padding:.48em .55em;border-right:1px solid var(--line,#ddd);border-bottom:1px solid var(--line,#ddd);overflow-wrap:anywhere;word-break:break-word;white-space:normal;vertical-align:top}
th{text-align:start;font-weight:600;background:var(--soft,#f4f5f2)}tr:last-child td{border-bottom:0}tr>*:last-child{border-right:0}
.table-note,.table-missing{font-size:12px;padding:10px;color:var(--muted,#777);margin:0;overflow-wrap:anywhere}
@media(max-width:600px){button{min-height:44px}}
`;

/** Embedded tables take their own type size from the available width and column count, never the body size. */
function fitTableFont(host, section, columns) {
  if (!section) return;
  const fit = () => {
    const width = section.clientWidth || host.clientWidth || 320;
    const size = Math.max(8, Math.min(16, (width - 20) / Math.max(1, columns) / 4.5));
    section.style.setProperty('--csv-embed-font', Math.round(size * 10) / 10 + 'px');
  };
  fit();
  if (typeof ResizeObserver !== 'function') return;
  host.__velaTableFontObserver?.disconnect?.();
  const observer = new ResizeObserver(() => { if (!host.isConnected) { observer.disconnect(); return; } fit(); });
  observer.observe(host); host.__velaTableFontObserver = observer;
}

/** Shadow content keeps table cells out of TXT search/bookmark offsets and word counts. */
export function mountCsvTable(host, entry, load, { onEdit, onReady } = {}) {
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${shadowCss}</style><section><header><span></span></header><div class="scroll" role="group" aria-label="嵌入的 CSV 表格"><p class="table-note">正在读取表格…</p></div></section>`;
  const section = shadow.querySelector('section');
  shadow.querySelector('header span').textContent = entry.src;
  if (onEdit) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '表格设置';
    button.onclick = onEdit;
    shadow.querySelector('header').append(button);
  }
  const show = (snapshot) => {
    const rows = snapshot?.rows || [], columns = Math.min(20, Math.max(1, rows.reduce((n, row) => Math.max(n, row.length), 1)));
    shadow.querySelector('.scroll').innerHTML = csvTableMarkup(snapshot, entry, {
      maxRows: 100,
      maxColumns: 20,
    });
    fitTableFont(host, section, columns);
    onReady?.();
  };
  try {
    const result = load?.(entry.src);
    if (result?.then) result.then(show).catch((error) => show({ error: error.message }));
    else show(result);
  } catch (error) {
    show({ error: error.message });
  }
  return host;
}
