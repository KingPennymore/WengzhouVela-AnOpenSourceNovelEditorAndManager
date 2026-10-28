import { MAX_TEXT_BYTES } from './model.mjs';
import {textBytes} from './text-utils.mjs';
export const MAX_CSV_CELLS = 200000;
export function csvDelimiter(source) {
  const text = source.replace(/^\uFEFF/, ''), explicit = text.match(/^sep=([,;\t])\r?\n/i);
  if (explicit) return explicit[1];
  const candidates = [',', ';', '\t'], counts = candidates.map(() => [0]);
  let quote = false, row = 0;
  for (let i = 0; i < text.length && row < 20; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i + 1] === '"') i++; else quote = !quote; continue; }
    if (quote) continue;
    const col = candidates.indexOf(c); if (col >= 0) counts[col][row]++;
    if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; row++; for (const list of counts) list.push(0); }
  }
  const scores = counts.map(list => { const positive = list.filter(n => n > 0); return positive.length ? positive.length * 100 + Math.max(...positive) : 0; });
  return candidates[scores.indexOf(Math.max(...scores))];
}
// Self contained: precisely the same parser runs in the offline Blob worker.
// UTF-16 offsets refer to the original source, including BOM and CR characters.
export function parseCsvModel(source, delimiter, { maxCells = 200000, maxBytes = 8388608, fragment = false } = {}) {
  const rows = [], records = [], bom = !fragment && source.startsWith('\uFEFF');
  let start = bom ? 1 : 0;
  const sep = !fragment && source.slice(start).match(/^sep=([,;\t])(?:\r\n|\n|\r)/i), sepLine = sep?.[0] || ''; start += sepLine.length;
  let i = start, from = start, rowFrom = start, row = [], spans = [], value = '', quoted = false, inQuote = false, closed = false, cells = 0;
  const format = { bom, newline: '\n', sepLine, trailingNewline: /[\r\n]$/.test(source), consistent: true };
  // Stays self-contained: this function is also serialised into an inline worker (see below).
  const bytes = new TextEncoder().encode(source).length;
  const result = () => ({ source, delimiter, rows, records, columns: 1, cells, bytes, format, start });
  const failure = message => { const lines = source.slice(0, i).split(/\r\n|\r|\n/); return { ...result(), error: message, line: lines.length, column: lines.at(-1).length + 1, offset: i }; };
  if (bytes > maxBytes) return failure('表格不能超过 8 MB。');
  const cell = to => { row.push(value); spans.push({ from, to, quoted }); cells++; value = ''; quoted = inQuote = closed = false; };
  const record = (to, end) => { rows.push(row); records.push({ from: rowFrom, to, end, cells: spans }); row = []; spans = []; rowFrom = end; };
  for (; i < source.length; i++) {
    const c = source[i];
    if (inQuote) { if (c === '"') { if (source[i + 1] === '"') { value += '"'; i++; } else { inQuote = false; closed = true; } } else value += c; continue; }
    if (c === '"') { if (i !== from || closed) return failure('CSV 引号格式不正确。'); quoted = inQuote = true; continue; }
    if (c === delimiter || c === '\r' || c === '\n') {
      cell(i); if (cells > maxCells) return failure('表格超过 200000 个单元格，请拆分文件或使用源码查看。');
      if (c !== delimiter) { const to = i; if (c === '\r' && source[i + 1] === '\n') i++; record(to, i + 1); }
      from = i + 1;
    } else { if (closed) return failure('CSV 结束引号后只能跟分隔符或换行。'); value += c; }
  }
  if (inQuote) return failure('CSV 存在未闭合的引号，请切换到源码修正。');
  if (from < source.length || row.length || !rows.length) { cell(i); record(i, i); }
  if (cells > maxCells) return failure('表格超过 200000 个单元格，请拆分文件或使用源码查看。');
  // A quoted cell may contain a line break earlier than the first record separator; new records use the file's own.
  const recordBreak = records.find(record => record.end > record.to);
  format.newline = recordBreak ? source.slice(recordBreak.to, recordBreak.end) : source.match(/\r\n|\n|\r/)?.[0] || '\n';
  const output = result(); output.columns = rows.reduce((n, r) => Math.max(n, r.length), 1); format.consistent = rows.every(r => r.length === rows[0].length); return output;
}
export function csvValue(value, delimiter) { const s = String(value ?? ''); return s.includes(delimiter) || /["\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; }
// An unquoted empty field at EOF is indistinguishable from a missing final record.
// Quote it only when necessary to keep a single-field record without adding an EOL.
function recordText(fields, delimiter, terminated) {
  const text = fields.join(delimiter);
  return text === '' && !terminated ? '""' : text;
}
function maxIndex(indices, minimum) { let result = minimum; for (const index of indices) result = Math.max(result, index); return result; }
export function mergeCsvChanges(model, changes) {
  const sorted = changes.filter(c => c.from !== c.to || c.insert).sort((a, b) => a.from - b.from || a.to - b.to); let result = [];
  for (const change of sorted) { const previous = result.at(-1); if (previous && previous.to > change.from) throw Error('表格改动重叠。'); if (previous && previous.to === change.from) { previous.to = change.to; previous.insert += change.insert; } else result.push({ ...change }); }
  // Large pastes/column edits otherwise make CodeMirror replace its text tree once per field.
  // Bounded spans retain the exact intervening source without turning a single-cell edit into a rewrite.
  if (result.length > 256) {
    const compact = []; let group = null, parts = [];
    for (const change of result) {
      if (group && change.from - group.to <= 4096 && change.to - group.from <= 65536) { parts.push(model.source.slice(group.to, change.from), change.insert); group.to = change.to; }
      else { if (group) compact.push({ ...group, insert: parts.join('') }); group = { from: change.from, to: change.to }; parts = [change.insert]; }
    }
    if (group) compact.push({ ...group, insert: parts.join('') }); result = compact;
  }
  const encode = s => textBytes(s), delta = result.reduce((n, c) => n + encode(c.insert) - encode(model.source.slice(c.from, c.to)), 0);
  if (model.bytes + delta > MAX_TEXT_BYTES) throw Error('表格不能超过 8 MB。'); return result;
}
export function replaceCells(model, entries) {
  const groups = new Map();
  for (const { row, column, value } of entries) { if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || row >= MAX_CSV_CELLS || column >= MAX_CSV_CELLS) throw Error('行号或列号无效。'); if (!groups.has(row)) groups.set(row, new Map()); groups.get(row).set(column, String(value ?? '')); }
  const changes = []; let extra = '', count = model.cells;
  for (const [r, values] of [...groups].sort((a, b) => a[0] - b[0])) {
    const record = model.records[r]; if (!record) continue; const size = record.cells.length;
    const last = maxIndex(values.keys(), size - 1); count += last + 1 - size;
    for (const [c, value] of values) if (c < size && value !== model.rows[r][c]) changes.push({ from: record.cells[c].from, to: record.cells[c].to, insert: last === 0 && value === '' && record.end === record.to ? '""' : csvValue(value, model.delimiter) });
    if (last >= size) changes.push({ from: record.to, to: record.to, insert: Array.from({ length: last + 1 - size }, (_, i) => model.delimiter + csvValue(values.get(size + i) || '', model.delimiter)).join('') });
  }
  const lastRow = maxIndex(groups.keys(), model.rows.length - 1);
  if (lastRow >= model.rows.length) {
    if (!model.format.trailingNewline) extra += model.format.newline;
    for (let r = model.rows.length; r <= lastRow; r++) {
      const values = groups.get(r) || new Map(), width = maxIndex(values.keys(), 0) + 1;
      count += width; if (count > MAX_CSV_CELLS) throw Error('表格超过 200000 个单元格。');
      const fields = Array.from({ length: width }, (_, c) => csvValue(values.get(c) || '', model.delimiter)), terminated = r < lastRow || model.format.trailingNewline;
      extra += recordText(fields, model.delimiter, terminated);
      if (terminated) extra += model.format.newline;
    }
    changes.push({ from: model.source.length, to: model.source.length, insert: extra });
  }
  if (count > MAX_CSV_CELLS) throw Error('表格超过 200000 个单元格。'); return mergeCsvChanges(model, changes);
}
export const setCsvCell = (model, row, column, value) => replaceCells(model, [{ row, column, value }]);

/** Reparse small edited records; reuse every other decoded row. Structural changes use the worker. */
export function patchCsvModel(model, changes, source) {
  const groups = new Map(); let changedSize = 0;
  for (const change of changes) {
    let lo = 0, hi = model.records.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (model.records[mid].from <= change.from) lo = mid; else hi = mid - 1; }
    const record = model.records[lo];
    if (!record || change.from < record.from || change.to > record.to) return null;
    if (!groups.has(lo)) groups.set(lo, []);
    groups.get(lo).push(change); changedSize += record.to - record.from + change.insert.length;
    if (groups.size > 128 || changedSize > 262144) return null;
  }
  const records = [], rows = model.rows.slice(); let shift = 0, cells = 0, columns = 1;
  for (const [r, record] of model.records.entries()) {
    const edits = groups.get(r); let delta = 0;
    if (edits) {
      const parts = []; let from = record.from;
      for (const edit of edits) { parts.push(model.source.slice(from, edit.from), edit.insert); from = edit.to; delta += edit.insert.length - (edit.to - edit.from); }
      parts.push(model.source.slice(from, record.to));
      const parsed = parseCsvModel(parts.join(''), model.delimiter, { fragment: true });
      if (parsed.error || parsed.rows.length !== 1 || parsed.records[0].end !== parsed.records[0].to) return null;
      rows[r] = parsed.rows[0];
      const base = record.from + shift;
      records.push({ from: base, to: record.to + shift + delta, end: record.end + shift + delta, cells: parsed.records[0].cells.map(s => ({ ...s, from: base + s.from, to: base + s.to })) });
    } else records.push(shift ? { from: record.from + shift, to: record.to + shift, end: record.end + shift, cells: record.cells.map(s => ({ ...s, from: s.from + shift, to: s.to + shift })) } : record);
    shift += delta; cells += rows[r].length; columns = Math.max(columns, rows[r].length);
  }
  if (cells > MAX_CSV_CELLS) return null;
  const encoder = new TextEncoder(), bytes = model.bytes + changes.reduce((sum, c) => sum + encoder.encode(c.insert).length - encoder.encode(model.source.slice(c.from, c.to)).length, 0);
  return { ...model, source, rows, records, cells, columns, bytes, format: { ...model.format, consistent: rows.every(r => r.length === rows[0].length) } };
}
export function insertCsvRow(model, at, values = Array(model.columns).fill('')) {
  const fields = values.map(v => csvValue(v, model.delimiter)), terminated = at < model.rows.length || model.format.trailingNewline;
  const line = recordText(fields, model.delimiter, terminated), eol = model.format.newline;
  if (model.cells + values.length > MAX_CSV_CELLS) throw Error('表格超过 200000 个单元格。'); const pos = model.records[at]?.from ?? model.source.length;
  const emptyTail = at < model.rows.length && model.records[at].from === model.source.length;
  return mergeCsvChanges(model, [{ from: pos, to: pos, insert: at < model.rows.length ? line + eol + (emptyTail ? '""' : '') : (model.format.trailingNewline ? '' : eol) + line + (model.format.trailingNewline ? eol : '') }]);
}
export function deleteCsvRows(model, first, last = first) {
  const a = model.records[first], b = model.records[last]; if (!a || !b) return [];
  const from = last === model.rows.length - 1 && first > 0 ? model.records[first - 1].to : a.from;
  const previous = model.records[first - 1], emptyTail = last === model.rows.length - 1 && b.end === b.to && previous?.from === previous?.to;
  return [{ from, to: last === model.rows.length - 1 ? b.to : b.end, insert: first > 0 && emptyTail ? '""' : '' }];
}
// Raw field spelling survives moves; only affected rows contain change spans.
export function csvColumns(model, action, at, target = at) {
  if (!Number.isInteger(at) || at < 0 || at >= model.columns + (action === 'insert' ? 1 : 0)) throw Error('行号或列号无效。');
  const changes = []; let cells = 0;
  for (let r = 0; r < model.rows.length; r++) {
    const record = model.records[r], size = record.cells.length;
    if (action === 'insert') {
      const pos = record.cells[at]?.from ?? record.to;
      changes.push({ from: pos, to: pos, insert: model.delimiter.repeat(Math.max(1, at - size + 1)) });
      cells += Math.max(size, at) + 1; continue;
    }
    if (action === 'delete' && size > 1) {
      const other = at === 0 ? 1 : 0, insert = size === 2 && at < size && record.end === record.to && model.rows[r][other] === '' && !record.cells[other].quoted ? '""' : '';
      if (at < size) changes.push(at < size - 1 ? { from: record.cells[at].from, to: record.cells[at + 1].from, insert } : { from: record.cells[at - 1].to, to: record.cells[at].to, insert });
      cells += size - (at < size ? 1 : 0); continue;
    }
    const values = record.cells.map(s => model.source.slice(s.from, s.to));
    if (action === 'insert') { while (values.length < at) values.push(''); values.splice(at, 0, ''); }
    else if (action === 'delete') values.splice(at, 1);
    else { while (values.length < model.columns) values.push(''); values.splice(target, 0, values.splice(at, 1)[0]); }
    cells += Math.max(1, values.length);
    const old = model.source.slice(record.from, record.to), next = recordText(values, model.delimiter, record.end > record.to); let head = 0, tail = 0;
    while (head < old.length && head < next.length && old[head] === next[head]) head++;
    while (tail < old.length - head && tail < next.length - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
    if (head < old.length || head < next.length) changes.push({ from: record.from + head, to: record.to - tail, insert: next.slice(head, next.length - tail) });
  }
  if (cells > MAX_CSV_CELLS) throw Error('表格超过 200000 个单元格。'); return mergeCsvChanges(model, changes);
}
export function reorderCsvRows(model, order) { return mergeCsvChanges(model, order.flatMap((r, i) => {
  if (r === i) return [];
  const raw = model.source.slice(model.records[r].from, model.records[r].to), destination = model.records[i];
  return [{ from: destination.from, to: destination.to, insert: raw === '' && destination.end === destination.to ? '""' : raw }];
})); }
export class CsvParser {
  async parse(source, delimiter) {
    if (source.length < 262144 || typeof Worker === 'undefined') return parseCsvModel(source, delimiter);
    if (this.resolve) this.cancel();
    if (!this.worker) {
      const url = URL.createObjectURL(new Blob([`self.onmessage=e=>{try{self.postMessage((${parseCsvModel.toString()})(e.data.source,e.data.delimiter))}catch(error){self.postMessage({error:error.message,line:1,column:1})}}`], { type: 'text/javascript' }));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = e => { const resolve = this.resolve; this.resolve = this.reject = null; resolve?.(e.data); };
      this.worker.onerror = e => { const reject = this.reject; this.resolve = null; this.cancel(); reject?.(Error(e.message)); };
    }
    return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; this.worker.postMessage({ source, delimiter }); });
  }
  cancel() { this.worker?.terminate(); this.worker = null; this.resolve?.(null); this.resolve = this.reject = null; }
}
