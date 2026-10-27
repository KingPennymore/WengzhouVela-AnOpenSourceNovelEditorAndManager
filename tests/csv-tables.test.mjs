import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, EditorSelection } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { csvColumnName } from '../web/csv-view.mjs';
import { parseCsvModel, patchCsvModel, setCsvCell, insertCsvRow, csvColumns, deleteCsvRows, reorderCsvRows, replaceCells, MAX_CSV_CELLS } from '../web/csv-model.mjs';
import { decodeFileText } from '../web/file-text.mjs';
import { decodeContent, encodeContent } from '../web/model.mjs';
// csv-grid pulls in motion.mjs, which reads matchMedia when it loads.
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { csvMetrics, csvVisibleRange, prefixSizes } = await import('../web/csv-grid.mjs');
import { parseCsv, writeCsv, documentDelimiter } from '../web/csv.mjs';
import {
  resolveTablePath,
  relativeTablePath,
  loadCsvTable,
  tablesByLine,
  csvTableMarkup,
  collectCsvTables,
} from '../web/csv-embed.mjs';
import {
  richTextExtensions,
  formatsOf,
  insertCsvTable,
  updateCsvTable,
} from '../web/rich-text-editor.mjs';
import { buildRecord, resolveRecord } from '../web/rich-text.mjs';
import { chapterMarkdown, chapterHtml } from '../web/rich-text-export.mjs';
import { buildEpub } from '../web/epub-export.mjs';
import { dependencyPaths } from '../web/sync-plan.mjs';
import { applyFileOperation } from '../web/file-manager.mjs';
import { rewriteVelaFiles } from '../web/vela.mjs';

const text = '第一章 开始\n正文。\n后文';
const entry = {
  id: 'table1',
  type: 'csv-table',
  group: 'inserts',
  src: '../资料/人物.csv',
  caption: '人物表',
  header: true,
  from: 11,
  to: 11,
};
const rows = [
  ['姓名', '备注'],
  ['林舟', '<script>不可执行</script>\n第二行'],
  ['', '带逗号,引号"'],
];
const snapshot = { rows, path: '资料/人物.csv', delimiter: ',' };
const sections = [{ heading: true, title: '第一章 开始', row: 0, endRow: 3 }];

const applyChanges = (source, changes) => [...changes].sort((a, b) => b.from - a.from).reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), source);
test('The grid renders only the visible range, sizes cells within bounds and uses spreadsheet column labels', () => {
  assert.deepEqual([0, 25, 26, 51, 52, 701, 702].map(csvColumnName), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  const [first, last] = csvVisibleRange(prefixSizes(Array(10000).fill(30)), -3000, 600, 1);
  assert.ok(first > 90 && last < 130 && last - first < 40, 'only the rows on screen plus a small buffer');
  const metrics = csvMetrics([['a', 'b'], ['long text '.repeat(40), 'x\ny\nz\nw']], 2);
  assert.deepEqual(metrics.widths, [320, 96]);
  assert.deepEqual(metrics.heights, [44, 92]);
});

test('Cell, row and column edits change only the affected source and keep BOM, CRLF and quoting', () => {
  const source = '﻿name,note\r\n"Lin, Zhou",a\r\nOld,"x""y"\r\n', model = parseCsvModel(source, ',');
  assert.deepEqual(model.rows, [['name', 'note'], ['Lin, Zhou', 'a'], ['Old', 'x"y']]);
  assert.equal(applyChanges(source, setCsvCell(model, 2, 0, 'New')), '﻿name,note\r\n"Lin, Zhou",a\r\nNew,"x""y"\r\n');
  assert.equal(applyChanges(source, insertCsvRow(model, 1, ['a', 'b'])), '﻿name,note\r\na,b\r\n"Lin, Zhou",a\r\nOld,"x""y"\r\n');
  assert.equal(applyChanges(source, csvColumns(model, 'delete', 1)), '﻿name\r\n"Lin, Zhou"\r\nOld\r\n');
  assert.equal(applyChanges(source, deleteCsvRows(model, 1)), '﻿name,note\r\nOld,"x""y"\r\n');
  assert.match(parseCsvModel('a,"b', ',').error, /未闭合/);
});

test('Moving rows and columns rewrites only their records; CSV/TSV imports keep BOM and CRLF', () => {
  const source = '﻿a,b,c\r\n1,2,3\r\n4,5,6\r\n', model = parseCsvModel(source, ',');
  assert.equal(applyChanges(source, csvColumns(model, 'move', 0, 2)), '﻿b,c,a\r\n2,3,1\r\n5,6,4\r\n');
  assert.equal(applyChanges(source, reorderCsvRows(model, [2, 0, 1])), '﻿4,5,6\r\na,b,c\r\n1,2,3\r\n');
  const bytes = new TextEncoder().encode('\uFEFFa,b\r\nc,d\r\n');
  assert.equal(decodeFileText(bytes, { preserveBom: true }), '\uFEFFa,b\r\nc,d\r\n');
  assert.equal(decodeFileText(bytes), 'a,b\r\nc,d\r\n');
  // Remote Git blobs are decoded without BOM stripping, so a pulled CSV keeps it byte-for-byte.
  assert.equal(decodeContent(encodeContent('\uFEFFa,b\r\nc,d\r\n')), '\uFEFFa,b\r\nc,d\r\n');
  // CSV keeps CRLF as "\r" line content with LF as the editor separator, so offsets still match
  // the source and every edit round-trips the original line endings.
  const state = EditorState.create({ doc: source, extensions: [EditorState.lineSeparator.of('\n')] });
  assert.equal(state.doc.toString(), source);
  const next = state.update({ changes: setCsvCell(model, 1, 0, 'x') }).state;
  assert.equal(next.doc.toString(), '﻿a,b,c\r\nx,2,3\r\n4,5,6\r\n');
  const multiline = state.update({ changes: setCsvCell(model, 0, 1, 'x\r\ny') }).state;
  assert.equal(multiline.doc.toString(), '﻿a,"x\r\ny",c\r\n1,2,3\r\n4,5,6\r\n');
  const reordered = state.update({ changes: reorderCsvRows(model, [2, 0, 1]) }).state;
  assert.equal(reordered.doc.toString(), '﻿4,5,6\r\na,b,c\r\n1,2,3\r\n');
  // A line break inside a quoted cell must not decide the file's record separator.
  assert.equal(parseCsvModel('"a\nb",c\r\nx,y\r\n', ',').format.newline, '\r\n');
});

test('TSV extension and explicit delimiters survive editing, RFC quoting remains lossless', () => {
  assert.equal(documentDelimiter({ name: '数据.TSV', text: '单列' }), '\t');
  assert.equal(documentDelimiter({ name: '数据.tsv', text: 'a;b', delimiter: ';' }), ';');
  for (const delimiter of [',', ';', '\t'])
    assert.deepEqual(parseCsv(writeCsv(rows, delimiter), delimiter), rows);
  assert.throws(() => parseCsv(','.repeat(200000)), /200000/);
});

test('Empty terminal records survive clearing, adding, pasting, deleting columns and sorting', () => {
  assert.deepEqual(parseCsv(writeCsv([['a'], ['']], '\t'), '\t'), [['a'], ['']], 'clipboard preserves the last empty row');
  for (const eol of ['\n', '\r\n']) {
    const source = '\uFEFFsep=,' + eol + 'a' + eol + 'b', model = parseCsvModel(source, ',');
    const cleared = applyChanges(source, setCsvCell(model, 1, 0, ''));
    assert.equal(cleared, '\uFEFFsep=,' + eol + 'a' + eol + '""');
    assert.deepEqual(parseCsv(cleared), [['a'], ['']]);
    const added = applyChanges(source, insertCsvRow(model, 2));
    assert.deepEqual(parseCsv(added), [['a'], ['b'], ['']]);
    assert.equal(parseCsvModel(added, ',').format.trailingNewline, false);
    const pasted = applyChanges(source, replaceCells(model, [{ row: 2, column: 0, value: '' }]));
    assert.deepEqual(parseCsv(pasted), [['a'], ['b'], ['']]);
  }
  assert.deepEqual(parseCsv(applyChanges('', insertCsvRow(parseCsvModel('', ','), 0))), [[''], ['']]);
  const twoColumns = 'a,b\nc,';
  assert.deepEqual(parseCsv(applyChanges(twoColumns, csvColumns(parseCsvModel(twoColumns, ','), 'delete', 0))), [['b'], ['']]);
  const blankFirst = '\na';
  assert.deepEqual(parseCsv(applyChanges(blankFirst, reorderCsvRows(parseCsvModel(blankFirst, ','), [1, 0]))), [['a'], ['']]);
  const blankBeforeLast = 'a\n\nb';
  assert.deepEqual(parseCsv(applyChanges(blankBeforeLast, deleteCsvRows(parseCsvModel(blankBeforeLast, ','), 2))), [['a'], ['']]);
});

test('Clearing the full 200,000-cell selection works for both tall and wide tables', () => {
  for (const delimiter of ['\n', ',']) {
    const source = Array(MAX_CSV_CELLS).fill('1').join(delimiter), model = parseCsvModel(source, ',');
    const entries = Array.from({ length: MAX_CSV_CELLS }, (_, i) => ({ row: delimiter === '\n' ? i : 0, column: delimiter === ',' ? i : 0, value: '' }));
    const changes = replaceCells(model, entries);
    assert.ok(changes.length < 16, 'large edits use bounded spans instead of 200,000 text tree replacements');
    const state = EditorState.create({ doc: source }).update({ changes }).state;
    const after = parseCsvModel(state.doc.toString(), ',');
    assert.equal(after.error, undefined);
    assert.equal(after.cells, MAX_CSV_CELLS);
    assert.equal(after.rows.length, model.rows.length);
    assert.equal(after.columns, model.columns);
    assert.ok(after.rows.every(row => row.every(value => value === '')));
  }
});

test('Small CSV edits reuse decoded rows and preserve exact span offsets', () => {
  const source = '\uFEFFsep=,\r\na,"b"\r\n\uFEFFkeep,d\r\nz,q\r\n', model = parseCsvModel(source, ',');
  const changes = setCsvCell(model, 0, 1, 'long\n"value'), text = applyChanges(source, changes), next = patchCsvModel(model, changes, text);
  assert.deepEqual(next, parseCsvModel(text, ','));
  assert.equal(next.rows[1], model.rows[1]); assert.equal(next.rows[2], model.rows[2]);
  const bomChange = setCsvCell(next, 1, 1, 'new'), bomText = applyChanges(text, bomChange);
  assert.deepEqual(patchCsvModel(next, bomChange, bomText), parseCsvModel(bomText, ','));
  assert.equal(patchCsvModel(model, insertCsvRow(model, 1), applyChanges(source, insertCsvRow(model, 1))), null);
  const columns = csvColumns(model, 'insert', 1);
  assert.ok(columns.every(c => c.from === c.to && c.insert === ','), 'inserting a column does not reserialize existing fields');
});

test('Linked paths can cross folders inside the workspace but never escape it or fetch URLs', () => {
  assert.equal(resolveTablePath('书稿/正文.txt', '../资料/人物.csv'), '资料/人物.csv');
  assert.equal(relativeTablePath('书稿/卷一/正文.txt', '资料/人物.csv'), '../../资料/人物.csv');
  for (const src of [
    '../../escape.csv',
    'https://site.invalid/a.csv',
    '/a.csv',
    'C:\\a.csv',
    'a.txt',
    'a\0.csv',
  ])
    assert.throws(() => resolveTablePath('书稿/正文.txt', src));
});

test('Table reads use current workspace text, decode lazy files, and keep missing sources explicit', async () => {
  const document = { id: 'book', path: '书稿/正文.txt', text };
  const workspace = {
    documents: [{ name: '人物.csv', path: '资料/人物.csv', text: writeCsv(rows) }],
    entries: [{ path: '书稿/data.tsv', directory: false }],
  };
  assert.deepEqual((await loadCsvTable(workspace, document, entry.src)).rows, rows);
  const result = await loadCsvTable(workspace, document, 'data.tsv', {
    readFile: async () => Buffer.from('甲\t乙').toString('base64'),
  });
  assert.deepEqual(result.rows, [['甲', '乙']]);
  const snapshots = await collectCsvTables([entry, { ...entry, src: '不存在.csv' }], (src) =>
    loadCsvTable(workspace, document, src),
  );
  assert.ok(snapshots.get('不存在.csv').error);
  await assert.rejects(loadCsvTable(workspace, document, 'missing.csv'), /找不到/);
});

test('Insert, change, delete and undo table formatting never change TXT text; records re-anchor after edits', () => {
  const view = {
    state: EditorState.create({ doc: text, extensions: [history(), richTextExtensions()] }),
  };
  view.dispatch = (spec) => {
    view.state = (spec.startState ? spec : view.state.update(spec)).state;
  };
  view.dispatch({ selection: EditorSelection.cursor(9) });
  insertCsvTable(view, entry);
  let record = buildRecord(text, formatsOf(view.state).entries);
  assert.equal(record.inserts[0].type, 'csv-table');
  assert.equal(record.inserts[0].src, entry.src);
  assert.equal(view.state.doc.toString(), text);
  const id = formatsOf(view.state).entries[0].id;
  updateCsvTable(view, id, { src: '新表.tsv', header: false });
  undo(view);
  assert.equal(formatsOf(view.state).entries[0].src, entry.src);
  redo(view);
  assert.equal(formatsOf(view.state).entries[0].src, '新表.tsv');
  updateCsvTable(view, id, null);
  assert.equal(formatsOf(view.state).entries.length, 0);
  undo(view);
  assert.equal(formatsOf(view.state).entries.length, 1);
  const restored = resolveRecord('序\n' + text, record);
  assert.equal(restored.review.length, 0);
  assert.equal(restored.entries[0].src, entry.src);
  assert.equal(tablesByLine(text, [entry]).size, 1);
});

test('Embedded table markup escapes cells, captions and missing-source messages, and bounds previews', () => {
  const html = csvTableMarkup(
    snapshot,
    { ...entry, caption: '<img onerror=evil>' },
    { maxRows: 2, maxColumns: 1 },
  );
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /预览前 2 行、1 列/);
  assert.match(csvTableMarkup(snapshot, entry), /&lt;script&gt;/);
  assert.match(csvTableMarkup(null, { src: '<missing.csv' }), /&lt;missing/);
});

test('HTML, Markdown and EPUB preserve linked tables as escaped offline table content', () => {
  const tables = new Map([[entry.src, snapshot]]);
  const html = chapterHtml(text, sections, [entry], { from: 0 }, { tables });
  const markdown = chapterMarkdown(text, sections, [entry], { from: 0 }, { tables });
  const epub = buildEpub({
    text,
    sections,
    entries: [entry],
    tables,
    metadata: { title: '含表格的小说' },
  });
  for (const output of [html.text, markdown.text, epub.files.get('OEBPS/text/chapter-001.xhtml')]) {
    assert.match(output, /<table>/);
    assert.match(output, /人物表/);
    assert.match(output, /&lt;script&gt;/);
    assert.doesNotMatch(output, /<script>/);
  }
  assert.deepEqual(html.missing, []);
  assert.deepEqual(markdown.missing, []);
  assert.deepEqual(chapterHtml(text, sections, [entry], { from: 0 }).missing, [entry.src]);
});

test('Table-only empty paragraphs are retained in formatted exports', () => {
  const only = { ...entry, from: 0, to: 0 },
    chapters = [{ row: 0, endRow: 1, title: '表格', heading: false }],
    tables = new Map([[entry.src, snapshot]]);
  assert.match(chapterHtml('', chapters, [only], { from: 0 }, { tables }).html, /<table>/);
  assert.match(chapterMarkdown('', chapters, [only], { from: 0 }, { tables }).text, /<table>/);
  assert.ok(
    buildEpub({
      text: '',
      sections: chapters,
      entries: [only],
      tables,
      metadata: { title: '表格' },
    }).bytes.length > 0,
  );
});

test('Partial repository pulls include linked table dependencies from TXT format records', () => {
  const config = {
    version: 3,
    kind: 'workspace',
    id: 'work',
    project: { name: '作品' },
    richText: { documents: { '书稿/正文.txt': buildRecord(text, [entry]) } },
  };
  assert.ok(dependencyPaths('项目/.vela', JSON.stringify(config)).includes('项目/资料/人物.csv'));
});

test('Renaming source tables and moving TXT records preserves their linked workspace target', () => {
  const record = buildRecord(text, [entry]);
  const make = () => ({
    version: 1,
    settings: {},
    folders: ['书稿', '资料'],
    entries: [],
    activeId: 'book',
    openIds: ['book'],
    documents: [
      {
        id: 'config',
        name: '.vela',
        path: '书稿/.vela',
        text: JSON.stringify({
          version: 3,
          kind: 'workspace',
          id: 'work',
          project: { name: '书稿' },
          richText: { documents: { '正文.txt': record } },
        }),
        updatedAt: 1,
      },
      { id: 'book', name: '正文.txt', path: '书稿/正文.txt', text, updatedAt: 1 },
      { id: 'csv', name: '人物.csv', path: '资料/人物.csv', text: writeCsv(rows), updatedAt: 1 },
    ],
  });
  let before = make(),
    after = structuredClone(before);
  applyFileOperation(after, 'move', '资料/人物.csv', '资料/人物2.csv');
  rewriteVelaFiles(before, after, 'move', '资料/人物.csv', '资料/人物2.csv');
  let config = JSON.parse(after.documents.find((doc) => doc.id === 'config').text);
  assert.equal(config.richText.documents['正文.txt'].inserts[0].src, '../资料/人物2.csv');
  before = make();
  after = structuredClone(before);
  applyFileOperation(after, 'move', '书稿/正文.txt', '新稿/卷一/正文.txt');
  rewriteVelaFiles(before, after, 'move', '书稿/正文.txt', '新稿/卷一/正文.txt');
  config = JSON.parse(after.documents.find((doc) => doc.path === '新稿/卷一/.vela').text);
  assert.equal(config.richText.documents['正文.txt'].inserts[0].src, '../../资料/人物.csv');
  before = make();
  after = structuredClone(before);
  applyFileOperation(after, 'delete', '资料/人物.csv');
  rewriteVelaFiles(before, after, 'delete', '资料/人物.csv');
  config = JSON.parse(after.documents.find((doc) => doc.id === 'config').text);
  assert.equal(
    config.richText.documents['正文.txt'].inserts[0].src,
    entry.src,
    'a missing source remains recoverable',
  );
});
