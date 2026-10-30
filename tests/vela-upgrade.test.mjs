import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeVela, upgradeWorkspaceVela } from '../web/vela-upgrade.mjs';
import { createVela, createVelaV2, parseVela } from '../web/vela.mjs';
import { DocumentService } from '../web/document-service.mjs';
test('all creation paths use version 3, including the compatibility factory and a bare .vela name', () => {
  for (const config of [
    createVela('Book'),
    createVela(''),
    createVela('Defaults', { global: true }),
    createVelaV2('Legacy API'),
  ])
    assert.equal(config.version, 3);
});
test('v1 migration maps the shipped legacy fields, preserving extensions and reading order', () => {
  const old = {
    version: 1,
    name: 'Book',
    fontSize: 19,
    titleTemplates: ['Chapter {number} {title}'],
    reading: { files: ['a.txt', 'b.md', 'a.txt'], layout: { marginLeft: 27 }, future: 8 },
    extensions: { plugin: { future: true } },
  };
  const next = parseVela(upgradeVela(JSON.stringify(old), 'Book/.vela'));
  assert.equal(next.version, 3);
  assert.equal(next.project.name, 'Book');
  assert.ok(next.id);
  assert.equal(next.editor.fontSize, 19);
  assert.deepEqual(
    next.reading.items.map((i) => i.path),
    ['a.txt', 'b.md'],
  );
  assert.equal(next.reading.layout.marginLeft, 27);
  assert.equal(next.reading.layout.marginRight, 35);
  assert.equal(next.reading.future, 8);
  assert.deepEqual(next.extensions, old.extensions);
  assert.equal(old.version, 1);
});
test('v1 global migration preserves the manually curated library and personal defaults', () => {
  const next = parseVela(
    upgradeVela(
      JSON.stringify({
        version: 1,
        name: 'Defaults',
        scope: 'global',
        fontSize: 21,
        reading: { files: ['Book/a.txt'], layout: { lineHeight: 2 } },
      }),
      '.global.vela',
    ),
  );
  assert.equal(next.kind, 'global');
  assert.equal(next.library.mode, 'manual');
  assert.equal(next.library.items[0].path, 'Book/a.txt');
  assert.equal(next.reader.layout.lineHeight, 2);
  assert.equal(next.editor.fontSize, 21);
});
test('v2 upgrades keep stable IDs, overrides, extensions and explicitly empty lists', () => {
  const old = {
    version: 2,
    kind: 'workspace',
    id: 'stable',
    project: { name: 'Book' },
    reading: { items: [] },
    files: { 'a.txt': { editor: { marginLeft: 12 } } },
    ai: { suggestions: false },
    future: 7,
  };
  const next = parseVela(upgradeVela(JSON.stringify(old), '.vela'));
  assert.equal(next.version, 3);
  assert.equal(next.id, 'stable');
  assert.deepEqual(next.reading.items, []);
  assert.deepEqual(next.files, old.files);
  assert.equal(next.ai.suggestions, false);
  assert.equal(next.future, 7);
});
test('workspace upgrades preserve exact source in normal history, register revisions and are idempotent', () => {
  const text = JSON.stringify({
      version: 2,
      kind: 'workspace',
      id: 'stable',
      project: { name: 'Book' },
    }),
    doc = { id: 'c', name: '.vela', text, updatedAt: 1 },
    workspace = { documents: [doc] };
  const service = new DocumentService({
    workspace: () => workspace,
    write: () => true,
    clock: () => 10,
  });
  service.register(doc);
  assert.deepEqual(
    upgradeWorkspaceVela(workspace, {
      change: (doc, text) => service.change(doc, text),
      now: () => 10,
    }),
    ['c'],
  );
  assert.equal(workspace.localHistory.c[0].text, text);
  assert.equal(doc.revision, 1);
  assert.deepEqual(upgradeWorkspaceVela(workspace), []);
  service.save();
  assert.equal(workspace.localHistory.c.length, 1);
});
test('invalid, unsafe, future and old TXT sidecar files remain untouched; other valid files can upgrade', () => {
  const samples = [
    '{broken',
    JSON.stringify({ version: 1, name: 'Bad', reading: { files: ['../private.txt'] } }),
    JSON.stringify({
      version: 2,
      kind: 'workspace',
      id: 'bad',
      project: { name: 'Book' },
      editor: { fontSize: 99 },
    }),
    JSON.stringify({ version: 4, kind: 'workspace' }),
    JSON.stringify({ version: 3, kind: 'document', target: 'a.txt', marks: [] }),
  ];
  for (const text of samples) {
    const doc = { id: 'c', name: '.vela', text, updatedAt: 1 },
      workspace = { documents: [doc] };
    assert.deepEqual(upgradeWorkspaceVela(workspace), []);
    assert.equal(doc.text, text);
    assert.equal(workspace.localHistory, undefined);
  }
});
