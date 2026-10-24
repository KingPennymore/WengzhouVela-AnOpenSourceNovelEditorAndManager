import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSession, bindSessionLifecycle } from '../web/app-core/workspace-session.mjs';
import { CommandBus, createAppCommands } from '../web/app-core/command-bus.mjs';
import {
  loadWorkspace,
  createDocumentSession,
  prepareWorkspace,
} from '../web/app-core/workspace-startup.mjs';

function fixture(overrides = {}) {
  const events = [];
  const session = new WorkspaceSession({
    locked: () => false,
    animating: () => false,
    flush: () => events.push('flush'),
    write: () => {
      events.push('write');
      return true;
    },
    writeAsync: async () => {
      events.push('async');
      return true;
    },
    report: (message, dirty) => events.push({ message, dirty }),
    changed: () => events.push('changed'),
    toast: (message) => events.push(message),
    fail: (error) => events.push(error),
    ...overrides,
  });
  return { session, events };
}

test('explicit save cancels both timers, flushes formats and reports success', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, events } = fixture();
  session.scheduleSave();
  session.scheduleWorkspaceSave();
  assert.equal(session.needsSave, true);
  assert.equal(session.save(true), true);
  assert.equal(session.needsSave, false);
  assert.equal(session.contentTimer, null);
  assert.equal(session.pendingWorkspaceSave, false);
  assert.deepEqual(events.slice(-5), [
    'flush',
    'write',
    { message: '已保存到本机', dirty: false },
    'changed',
    '文件已保存到本机',
  ]);
  t.mock.timers.tick(2000);
  assert.equal(events.filter((event) => event === 'async').length, 0);
});

test('scheduled writes wait for sidebar frames and coalesce content changes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let moving = true;
  const { session, events } = fixture({ animating: () => moving });
  session.scheduleSave(20);
  session.scheduleSave(30);
  t.mock.timers.tick(30);
  assert.equal(events.includes('async'), false);
  t.mock.timers.tick(50);
  assert.equal(events.includes('async'), false);
  moving = false;
  t.mock.timers.tick(50);
  await session.backgroundSave;
  assert.equal(events.filter((event) => event === 'async').length, 1);
  assert.equal(session.dirty, false);
});

test('overlapping background requests share one flight and schedule a follow-up', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let writes = 0;
  const { session } = fixture({
    writeAsync: () => {
      writes++;
      return writes === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(true);
    },
  });
  const first = session.saveBackground();
  assert.equal(session.saveBackground(), first);
  assert.equal(writes, 1);
  finish(false); // DocumentService reports an edit made during the write as still dirty.
  assert.equal(await first, false);
  assert.equal(session.dirty, true);
  t.mock.timers.tick(0);
  await session.backgroundSave;
  assert.equal(writes, 2);
  assert.equal(session.needsSave, false);
});

test('save errors stay dirty; a project lock or failed boot never writes', async () => {
  const error = new Error('storage full');
  const { session, events } = fixture({
    write: () => {
      throw error;
    },
    writeAsync: async () => {
      throw error;
    },
  });
  assert.equal(session.save(), false);
  assert.equal(session.dirty, true);
  assert.match(events.at(-1).message, /保存失败：storage full/);
  assert.equal(await session.saveBackground(), false);
  assert.match(events.at(-1).message, /后台保存失败：storage full/);
  for (const overrides of [{ locked: () => true }, {}]) {
    const blocked = fixture(overrides);
    if (!overrides.locked) blocked.session.bootFailed = true;
    assert.equal(blocked.session.save(), false);
    assert.equal(await blocked.session.saveBackground(), false);
    assert.deepEqual(blocked.events, []);
  }
});

test('leaving the page protects dirty documents and failed writes; listeners can detach', () => {
  const window = new EventTarget();
  const document = new EventTarget();
  let remembered = 0;
  const { session, events } = fixture({ write: () => false });
  const binding = bindSessionLifecycle(
    window,
    document,
    session,
    () => {
      remembered++;
    },
    () => true,
  );
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(remembered, 1);
  assert.equal(session.dirty, true);
  const leave = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(leave);
  assert.equal(leave.defaultPrevented, true);
  binding.dispose();
  const count = events.length;
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(events.length, count);
});

test('commands use current page, format tools and button availability', () => {
  let page = 'write';
  let formats = false;
  let disabled = false;
  const calls = [];
  const commands = createAppCommands(['md-bold', 'toggle-display', 'theme', 'close-active'], {
    page: () => page,
    home: () => false,
    formatToolsVisible: () => formats,
    togglePreview: () => calls.push('preview'),
    closeActive: () => calls.push('close'),
    button: (id) => ({
      get disabled() {
        return disabled;
      },
      click: () => calls.push(id),
    }),
  });
  assert.equal(commands.execute('md-bold'), true);
  formats = true;
  commands.execute('md-bold');
  commands.execute('toggle-display');
  commands.execute('close-active');
  disabled = true;
  commands.execute('theme');
  page = 'reader';
  assert.equal(commands.execute('toggle-display'), false);
  disabled = false;
  assert.equal(commands.execute('theme'), true);
  assert.equal(commands.execute('missing'), false);
  assert.deepEqual(calls, ['md-bold', 'format-strong', 'preview', 'close', 'theme']);
  const bus = new CommandBus();
  bus.register('same', { run() {} });
  assert.throws(() => bus.register('same', { run() {} }), /重复命令/);
});

test('startup initializes defaults and refuses to replace corrupt saved data', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const workspace = await loadWorkspace();
  assert.equal(workspace.documents[0].name, '操作指南.md');
  assert.equal(workspace.settings.language, 'zh-CN');
  assert.equal(values.size, 0, 'startup itself must not persist a replacement');
  values.set('wenzhou.workspace', '{broken');
  await assert.rejects(loadWorkspace(), SyntaxError);
  assert.equal(values.get('wenzhou.workspace'), '{broken');
  values.set('wenzhou.workspace', JSON.stringify({ version: 1, documents: [{ text: 'bad' }] }));
  await assert.rejects(loadWorkspace(), /损坏/);
  assert.equal(values.size, 1);
});

test('migrations preserve baselines, avoid guide path collisions and follow project adoption', async () => {
  let workspace = {
    version: 1,
    activeId: 'old',
    openIds: ['old'],
    settings: { writer: {} },
    documents: [
      { id: 'old', name: '未命名小说.txt', text: '文舟操作指南\n用户内容', updatedAt: 1 },
      { id: 'other', name: '操作指南.txt', text: '用户已有指南', updatedAt: 1 },
    ],
  };
  const documents = createDocumentSession(() => workspace);
  const invalidated = [];
  await prepareWorkspace(workspace, {
    initializeStorage: null,
    invalidate: (id) => invalidated.push(id),
  });
  assert.equal(workspace.documents[0].path, '操作指南 (2).txt');
  assert.equal(workspace.documents[0].text, '文舟操作指南\n用户内容');
  assert.equal(documents.baselines.get('old'), '文舟操作指南\n用户内容');
  assert.deepEqual(invalidated, ['old']);
  workspace = {
    version: 1,
    documents: [{ id: 'new', name: '新稿.txt', text: '新稿', updatedAt: 1 }],
  };
  documents.committedProject();
  assert.equal(documents.baselines.get('new'), '新稿');
  assert.equal(documents.baselines.has('old'), false);
});
