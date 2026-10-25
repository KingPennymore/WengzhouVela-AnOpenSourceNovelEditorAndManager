import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { downloadPlan, commitPlan } from '../web/sync-plan.mjs';
import { prepareDownload } from '../web/sync-repository.mjs';
import { applyRepository, repositoryFolder } from '../web/git-workspace.mjs';
import { textFingerprint } from '../web/document-service.mjs';
import { SyncActivity } from '../web/sync-status.mjs';
import { WorkspaceStorage } from '../windows/storage.mjs';

const base64 = (text) => Buffer.from(text).toString('base64');
function fixture(provider = 'github') {
  const identity = {
    provider,
    ...(provider === 'gitea' ? { server: 'https://git.example.com/team' } : {}),
    repo: 'writer/book',
    branch: 'main',
  };
  const doc = (name, text, original = text) => ({
    id: name,
    name,
    path: 'Book/' + name,
    text,
    remote: { ...identity, path: name, sha: 'a'.repeat(40), lastSyncedText: original },
  });
  const workspace = {
    documents: [
      doc('old.txt', '原文'),
      doc('edited.txt', '本地新稿', '旧稿'),
      { id: 'personal', name: 'personal.txt', path: 'Book/personal.txt', text: '私有本地稿' },
    ],
    openIds: ['old.txt', 'edited.txt'],
    activeId: 'old.txt',
    folders: ['Book'],
    entries: [],
    repositories: [
      {
        ...identity,
        folder: 'Book',
        commit: 'before',
        baseFiles: {
          'old.txt': { hash: textFingerprint('原文') },
          'edited.txt': { hash: textFingerprint('旧稿') },
        },
      },
    ],
  };
  return {
    workspace,
    result: {
      ...identity,
      commit: 'next',
      files: [],
      folders: [],
      fullSnapshot: true,
      selection: null,
      remotePaths: [],
    },
  };
}

test('All providers show remote deletions unchecked, preserve local edits and ignore local-only files', () => {
  for (const provider of ['github', 'gitee', 'gitea']) {
    const { workspace, result } = fixture(provider),
      plan = downloadPlan(workspace, result, 'Book');
    assert.deepEqual(
      plan.map((item) => [item.file.path, item.state, item.selected]),
      [
        ['old.txt', 'remote-deleted', false],
        ['edited.txt', 'delete-modified', false],
      ],
    );
  }
});

test('Partial, unproven snapshots, different branches, instances and prefixed mappings never infer deletions', () => {
  const { workspace, result } = fixture('gitea');
  for (const patch of [
    { fullSnapshot: false },
    { selection: ['old.txt'] },
    { remotePaths: undefined },
    { branch: 'draft' },
    { server: 'https://other.example.com' },
  ])
    assert.equal(downloadPlan(workspace, { ...result, ...patch }, 'Book').length, 0);
  workspace.repositories[0].prefix = 'manuscript';
  assert.equal(downloadPlan(workspace, result, 'Book').length, 0);
});

test('Remote files still in the full manifest are never mistaken for deleted when the preview is filtered', () => {
  const { workspace, result } = fixture();
  assert.equal(
    downloadPlan(workspace, { ...result, remotePaths: ['old.txt', 'edited.txt'] }, 'Book').length,
    0,
  );
});

test('Binary cleanup verifies immutable Git blob content, and read failures preserve files', async () => {
  const { workspace, result } = fixture(),
    bytes = Buffer.from([0, 1, 2, 255]);
  workspace.entries.push({ path: 'Book/cover.bin', directory: false });
  workspace.repositories[0].baseFiles['cover.bin'] = {
    sha: createHash('sha1')
      .update(Buffer.concat([Buffer.from('blob 4\0'), bytes]))
      .digest('hex'),
  };
  let prepared = await prepareDownload(workspace, result, 'Book', async (file) =>
    file.endsWith('cover.bin') ? bytes.toString('base64') : base64('原文'),
  );
  assert.equal(
    downloadPlan(workspace, prepared, 'Book').find((item) => item.file.path === 'cover.bin').state,
    'remote-deleted',
  );
  prepared = await prepareDownload(workspace, result, 'Book', async () => base64('外部修改'));
  assert.equal(
    downloadPlan(workspace, prepared, 'Book').find((item) => item.file.path === 'cover.bin').state,
    'delete-unsafe',
  );
  prepared = await prepareDownload(workspace, result, 'Book', async () => {
    throw Error('read failed');
  });
  assert.ok(
    downloadPlan(workspace, prepared, 'Book').every((item) => item.state === 'delete-unsafe'),
  );
});

test('Retained remote deletions are not staged for automatic reupload; confirmed removals clear bases and tabs', () => {
  const { workspace, result } = fixture();
  applyRepository(
    workspace,
    { ...result, remoteDeletedPaths: ['old.txt', 'edited.txt'], deletions: [{ path: 'old.txt' }] },
    'Book',
  );
  assert.ok(!workspace.documents.some((doc) => doc.id === 'old.txt'));
  assert.deepEqual(workspace.openIds, ['edited.txt']);
  assert.equal(workspace.activeId, 'edited.txt');
  assert.ok(!workspace.repositories[0].baseFiles['old.txt']);
  assert.equal(workspace.documents.find((doc) => doc.id === 'edited.txt').remote.deleted, true);
  const plan = commitPlan([{ path: 'edited.txt', text: '本地新稿' }], workspace.repositories[0]);
  assert.equal(plan[0].state, 'remote-deleted');
  assert.equal(commitPlan([], workspace.repositories[0]).length, 0);
});

test('Unchanged observations update remote versions without overwriting local edits', () => {
  const { workspace, result } = fixture();
  applyRepository(
    workspace,
    { ...result, observedFiles: [{ path: 'edited.txt', text: '旧稿', sha: 'new-sha' }] },
    'Book',
  );
  const doc = workspace.documents.find((doc) => doc.id === 'edited.txt');
  assert.equal(doc.text, '本地新稿');
  assert.equal(doc.remote.sha, 'new-sha');
  assert.equal(doc.remote.lastSyncedText, '旧稿');
  assert.ok(doc.remote.syncedAt);
});

test('A complete snapshot drops tracking for files already absent both locally and remotely', () => {
  const { workspace, result } = fixture();
  workspace.repositories[0].baseFiles['already-gone.txt'] = { hash: 'old', sha: 'old' };
  applyRepository(workspace, result, 'Book');
  assert.ok(!workspace.repositories[0].baseFiles['already-gone.txt']);
  assert.ok(
    !commitPlan([], workspace.repositories[0]).some(
      (item) => item.file.path === 'already-gone.txt',
    ),
  );
});

test('Foreign branch application fails before mutating documents or tracking bases', () => {
  const { workspace, result } = fixture(),
    before = JSON.stringify(workspace);
  assert.throws(
    () =>
      applyRepository(
        workspace,
        { ...result, branch: 'draft', files: [{ path: 'old.txt', text: 'foreign' }] },
        'Book',
      ),
    /独立文件夹/,
  );
  assert.equal(JSON.stringify(workspace), before);
});

test('Branches use separate folders and a foreign association is never overwritten by a download plan', () => {
  const { workspace, result } = fixture();
  const folder = repositoryFolder(
    workspace,
    result.repo,
    result.provider,
    undefined,
    'draft/review',
  );
  assert.notEqual(folder, 'Book');
  const plan = downloadPlan(
    workspace,
    { ...result, branch: 'draft', files: [{ path: 'old.txt', text: '另一分支' }] },
    'Book',
  );
  assert.equal(plan[0].state, 'branch-conflict');
  assert.equal(plan[0].selected, false);
});

test('Sync labels describe the last known version without claiming a current remote comparison', () => {
  const activity = new SyncActivity(() => {});
  assert.equal(activity.label('doc', false), '已同步远端 · 与上次版本一致');
  assert.match(activity.label('doc', true), /待同步/);
  assert.match(activity.label('doc', false, { deleted: true }), /远端已删除/);
});

test('Windows synchronizes updates and trash moves in one transaction, restoring original ID and content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-sync-trash-'));
  try {
    const store = new WorkspaceStorage(root);
    store.writeFiles([{ path: 'Book/old.txt', data: base64('旧文稿') }], ['Book']);
    const id = store.scan().documents[0].id;
    store.writeFiles(
      [{ path: 'Book/new.txt', data: base64('新文稿') }],
      ['Book'],
      [{ path: 'Book/old.txt', expectedData: base64('旧文稿'), expectedText: '旧文稿' }],
    );
    assert.ok(!fs.existsSync(store.target('Book/old.txt')));
    assert.equal(fs.readFileSync(store.target('Book/new.txt'), 'utf8'), '新文稿');
    const [record] = store.listTrash();
    assert.equal(record.path, 'Book/old.txt');
    const restored = store.restoreTrash(record.id);
    assert.equal(restored.documents.find((doc) => doc.path === 'Book/old.txt').id, id);
    assert.equal(fs.readFileSync(store.target('Book/old.txt'), 'utf8'), '旧文稿');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows stale disk contents, missing versions, directories and overlapping targets cannot be deleted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-sync-stale-'));
  try {
    const store = new WorkspaceStorage(root);
    store.writeFiles([{ path: 'old.txt', data: base64('外部修改') }]);
    for (const item of [
      { path: 'old.txt', expectedData: base64('旧稿') },
      { path: 'old.txt', expectedData: base64('外部修改'), expectedText: '旧稿' },
      { path: 'old.txt' },
      { path: '../outside', expectedData: '' },
    ])
      assert.throws(() =>
        store.writeFiles([{ path: 'new.txt', data: base64('新稿') }], [], [item]),
      );
    assert.ok(!fs.existsSync(store.target('new.txt')));
    assert.equal(store.listTrash().length, 0);
    assert.throws(() =>
      store.writeFiles(
        [{ path: 'old.txt', data: base64('新稿') }],
        [],
        [{ path: 'old.txt', expectedData: base64('外部修改') }],
      ),
    );
    fs.mkdirSync(store.target('directory'));
    assert.throws(() => store.writeFiles([], [], [{ path: 'directory', expectedData: '' }]));
    assert.equal(fs.readFileSync(store.target('old.txt'), 'utf8'), '外部修改');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows failure after trash movement rolls back file contents, records and subsequent writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-sync-rollback-'));
  try {
    const store = new WorkspaceStorage(root);
    store.writeFiles([{ path: 'old.txt', data: base64('旧稿') }]);
    fs.mkdirSync(store.target('blocked'));
    assert.throws(() =>
      store.writeFiles(
        [
          { path: 'new.txt', data: base64('新稿') },
          { path: 'blocked', data: 'AAEC' },
        ],
        [],
        [{ path: 'old.txt', expectedData: base64('旧稿') }],
      ),
    );
    assert.equal(fs.readFileSync(store.target('old.txt'), 'utf8'), '旧稿');
    assert.ok(!fs.existsSync(store.target('new.txt')));
    assert.equal(store.listTrash().length, 0);
    assert.equal(fs.readdirSync(store.transactions).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a document matched through its remote link is checked for staleness at its own local path', () => {
  const remote = { provider: 'github', repo: 'writer/novel', branch: 'main', path: '全书.txt' };
  const workspace = { documents: [{ id: 'a', path: '草稿/全书.txt', name: '全书.txt', text: '正文', remote }] };
  const [item] = downloadPlan(
    workspace,
    { provider: 'github', repo: 'writer/novel', branch: 'main', files: [{ path: '全书.txt', text: '正文', sha: 's' }] },
    'novel',
  );
  assert.equal(item.doc.id, 'a');
  assert.equal(item.state, 'unchanged');
  assert.equal(item.path, 'novel/全书.txt');
  assert.equal(item.docPath, '草稿/全书.txt');
});
