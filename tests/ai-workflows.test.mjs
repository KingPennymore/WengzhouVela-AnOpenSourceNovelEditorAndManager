import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDraft, mergeDrafts, buildArtifact } from '../web/ai-artifacts.mjs';
import { chapterChoices, extractionBatches, extractDraft } from '../web/ai-extract.mjs';
import { AiWorkspaceEdits, extractionContext } from '../web/ai-workspace.mjs';
import { parseGlossary } from '../web/glossary.mjs';
import { parseOutline } from '../web/outline.mjs';
import { parseMap } from '../web/map.mjs';
import { parseVela } from '../web/vela.mjs';
import { ProjectService } from '../web/project-service.mjs';
import { DocumentService } from '../web/document-service.mjs';
import { WorkspaceStorage } from '../windows/storage.mjs';
import { ProjectStore } from '../windows/project-store.mjs';
import { newDocument } from '../web/model.mjs';
const draft = (type, items) => readDraft(JSON.stringify({ [type]: items }), [type]);
const term = (name, description = '说明') => ({ name, description, aliases: [], category: '人物' });

test('chapter ranges retain preface and only selected chapter text is sent; batches are bounded', async () => {
  const text = '前言\n第一章 起航\n甲'.repeat(1) + '\n第二章 回家\n乙';
  const chapters = chapterChoices(text, [
    { title: '第一章 起航', row: 1 },
    { title: '第二章 回家', row: 3 },
  ]);
  assert.equal(chapters.length, 3);
  assert.equal(text.slice(chapters[0].from, chapters[0].to), '前言\n');
  const batches = extractionBatches(text, [chapters[2]], 7);
  assert.equal(batches.join(''), '第二章 回家\n乙');
  assert.ok(batches.every((s) => s.length <= 7));
  const sent = [];
  await extractDraft(
    { settings: {} },
    {
      text,
      chapters: [chapters[2]],
      types: ['glossary'],
      complete: async (_w, args) => {
        sent.push(args.messages[0].content);
        return { text: '{"glossary":[]}' };
      },
    },
  );
  assert.equal(sent.join(''), '第二章 回家\n乙');
});
test('strict JSON, bounds and malformed individual entries are handled before preview', () => {
  assert.throws(() => readDraft('<script>alert(1)</script>', ['glossary']));
  assert.throws(() => draft('glossary', Array(1001).fill(term('甲'))));
  assert.throws(() => readDraft('{"glossary":{}}', ['glossary']));
  const value = draft('glossary', [
    term('甲'),
    term(''),
    { ...term('乙'), aliases: ['bad\nname'] },
    term('<img src=x>'),
  ]);
  assert.equal(value.rows.length, 2);
  assert.equal(value.warnings.length, 2);
});
test('batches deduplicate names and aliases; model paths and IDs do not reach files', () => {
  const value = mergeDrafts([
    draft('glossary', [{ ...term('林舟'), aliases: ['小林'], id: 'injected', path: '../outside' }]),
    draft('glossary', [term('小林')]),
  ]);
  assert.equal(value.rows.length, 1);
  assert.equal(value.rows[0].path, undefined);
  assert.notEqual(value.rows[0].id, 'injected');
  const text = buildArtifact('glossary', null, value.rows, '航程');
  assert.equal(parseGlossary(text).entries.length, 1);
  assert.ok(!text.includes('../outside'));
});
test('all generated formats use existing validators and preserve existing structures', () => {
  const outline = buildArtifact(
    'outline',
    null,
    [
      ...draft('outline', [term('第一章')]).rows,
      ...draft('relations', [{ ...term('同行'), from: '林舟', to: '阿远' }]).rows,
    ],
    '航程',
  );
  const parsed = parseOutline(outline);
  assert.equal(Object.keys(parsed.nodes).length, 1);
  assert.equal(parsed.relations.edges.length, 1);
  const map = parseMap(
    buildArtifact(
      'places',
      null,
      draft('places', [
        { ...term('港口'), links: ['灯塔'], x: 9999999 },
        { ...term('灯塔'), x: 80 },
      ]).rows,
      '航程',
    ),
  );
  assert.equal(map.markers[0].x, 10000);
  assert.equal(map.markers[0].relatedIds[0], map.markers[1].id);
  assert.deepEqual(map.cells, {});
});
test('abort after a batch discards every partial draft and prevents another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    extractDraft(
      { settings: {} },
      {
        text: '甲'.repeat(13000),
        chapters: [{ from: 0, to: 13000 }],
        types: ['glossary'],
        signal: controller.signal,
        complete: async () => {
          calls++;
          controller.abort();
          return { text: '{"glossary":[]}' };
        },
      },
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});
async function fixture(run) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-ai-')),
    store = new WorkspaceStorage(base),
    backend = new ProjectStore(store);
  const source = newDocument('正文.txt', '第一章\n林舟进城。');
  source.path = '正文.txt';
  let workspace = {
    version: 1,
    documents: [source],
    folders: [],
    storage: { id: store.id },
    activeId: source.id,
    openIds: [source.id],
    settings: {},
  };
  store.saveWorkspace(JSON.stringify(workspace));
  const documents = new DocumentService({
    workspace: () => workspace,
    write: (w) => store.saveWorkspace(JSON.stringify(w)),
  });
  documents.register(source);
  const host = {
    workspace: () => workspace,
    current: () => workspace.documents.find((d) => d.id === workspace.activeId),
    platform: 'windows',
    confirm: async () => {
      throw Error('Built-in edits must not request plugin grants');
    },
    fail: (e) => {
      throw e;
    },
    lock: async () => {
      documents.save();
      return () => {};
    },
    prepare: (w) => documents.prepareProject(w),
    adopt: (w) => {
      workspace = w;
      documents.committedProject();
    },
  };
  const service = new ProjectService(host, backend);
  await service.ready();
  try {
    await run({
      workspace: () => workspace,
      source,
      service,
      edits: new AiWorkspaceEdits(service),
      store,
    });
  } finally {
    assert.ok(base.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(base, { recursive: true, force: true });
  }
}
test('atomic merge creates a glossary and .vela association, and one undo restores both', () =>
  fixture(async (f) => {
    const context = extractionContext(f.workspace(), f.source),
      value = draft('glossary', [term('林舟')]);
    await f.edits.apply(f.workspace(), f.source, value, context.targets);
    assert.equal(f.workspace().documents.length, 3);
    const config = f.workspace().documents.find((d) => d.name === '.vela');
    assert.deepEqual(parseVela(config.text).editor.glossaries, [context.targets.glossary]);
    assert.equal(f.store.readWorkspace().includes('林舟'), true);
    await f.edits.undo();
    assert.deepEqual(
      f.workspace().documents.map((d) => d.name),
      ['正文.txt'],
    );
  }));
test('undo refuses to overwrite edits made after an AI merge', () =>
  fixture(async (f) => {
    const context = extractionContext(f.workspace(), f.source);
    await f.edits.apply(
      f.workspace(),
      f.source,
      draft('glossary', [term('林舟')]),
      context.targets,
    );
    f.workspace().documents.find((d) => d.name.endsWith('.gly')).text += ' ';
    await assert.rejects(f.edits.undo(), (error) => error.code === 'E_CONFLICT');
    assert.ok(f.workspace().documents.some((d) => d.name.endsWith('.gly')));
  }));
test('invalid edited draft writes no files, and plugin APIs cannot acquire builtin permissions', () =>
  fixture(async (f) => {
    const context = extractionContext(f.workspace(), f.source),
      value = draft('glossary', [term('林舟')]);
    value.rows[0].name = '';
    await assert.rejects(f.edits.apply(f.workspace(), f.source, value, context.targets));
    assert.equal(f.workspace().documents.length, 1);
    const plugin = f.service.bind('example.plugin', 'Example');
    await assert.rejects(
      plugin.api.fs.list({ workspaceId: 'builtin:' + plugin.owner }),
      (error) => error.code === 'E_PERMISSION',
    );
    await plugin.stop();
  }));
import { aiSave, aiClear, aiComplete } from '../web/ai-client.mjs';
test('generation enforces consent, endpoint binding, daily quota and pre-aborted signals', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: '结果' } }] }), {
      status: 200,
    });
  };
  const workspace = {
    settings: {
      ai: {
        enabled: true,
        consented: true,
        format: 'openai',
        provider: 'custom',
        endpoint: 'https://mock-ai.test/v1',
        models: { extract: 'model-a' },
        dailyChars: 4,
      },
    },
  };
  const args = {
    purpose: 'extract',
    system: '规则',
    messages: [{ role: 'user', content: '正文' }],
  };
  try {
    await aiSave({ format: 'openai', endpoint: 'https://mock-ai.test/v1', key: 'sk-test' });
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(aiComplete(workspace, { ...args, signal: aborted.signal }), {
      name: 'AbortError',
    });
    assert.equal(calls, 0);
    workspace.settings.ai.consented = false;
    await assert.rejects(aiComplete(workspace, args));
    assert.equal(calls, 0);
    workspace.settings.ai.consented = true;
    workspace.settings.ai.endpoint = 'https://different.test/v1';
    await assert.rejects(aiComplete(workspace, args));
    assert.equal(calls, 0);
    workspace.settings.ai.endpoint = 'https://mock-ai.test/v1';
    assert.equal((await aiComplete(workspace, args)).text, '结果');
    assert.equal(calls, 1);
    await assert.rejects(aiComplete(workspace, args));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await aiClear();
  }
});
test('a target created after preview is never silently merged or overwritten', () =>
  fixture(async (f) => {
    const context = extractionContext(f.workspace(), f.source),
      baselines = new Map([[context.targets.glossary, null]]);
    const other = newDocument(context.targets.glossary, '{"version":1,"entries":[]}');
    other.path = context.targets.glossary;
    f.workspace().documents.push(other);
    await assert.rejects(
      f.edits.apply(
        f.workspace(),
        f.source,
        draft('glossary', [term('林舟')]),
        context.targets,
        baselines,
      ),
      (error) => error.code === 'E_CONFLICT',
    );
    assert.equal(other.text, '{"version":1,"entries":[]}');
    assert.equal(f.service.bindings.size, 0);
    assert.equal(f.service.observed.size, 0);
  }));
