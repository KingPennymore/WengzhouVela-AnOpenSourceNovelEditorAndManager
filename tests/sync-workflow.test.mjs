import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHub } from '../web/github.mjs';
import { SyncBlobCache, matchesBlob } from '../web/sync-blob-cache.mjs';
import {
  branchChanges,
  switchRepositoryBranch,
  inspectBranchAttachments,
} from '../web/repository-navigation.mjs';
import { SyncWorkflow } from '../web/sync-workflow.mjs';
import { SyncActivity } from '../web/sync-status.mjs';
import { syncTarget } from '../web/sync-target.mjs';

const data = Buffer.from('正文').toString('base64');
const sha = createHash('sha1').update('blob 6\0正文').digest('hex');
const target = {
  provider: 'gitea',
  server: 'https://git.example.com',
  repo: 'writer/book',
  branch: 'main',
};
function fixture() {
  return {
    documents: [
      {
        id: 'a',
        path: 'Book/a.txt',
        text: '新稿',
        remote: { ...target, lastSyncedText: '旧稿', path: 'a.txt' },
      },
      { id: 'new', path: 'Book/new.txt', text: '新增' },
    ],
    entries: [],
    folders: ['Book'],
    openIds: ['a'],
    activeId: 'a',
    repositories: [
      {
        ...target,
        folder: 'Book',
        commit: 'base',
        pendingCommit: 'pending',
        conflicts: ['a.txt'],
        baseFiles: { 'a.txt': { sha }, 'deleted.txt': { sha } },
      },
    ],
  };
}
function remote() {
  const calls = [];
  const client = new GitHub(async (_, { path }) => {
    calls.push(path);
    return {
      status: 200,
      body: path.includes('/ref/')
        ? { object: { sha: 'head' } }
        : path.includes('/commits/')
          ? { tree: { sha: 'tree' } }
          : path.includes('/trees/')
            ? { tree: [{ path: 'a.txt', type: 'blob', sha, size: 6, mode: '100644' }] }
            : { encoding: 'base64', content: data },
    };
  });
  return { client, calls };
}

test('Repeated pulls fetch fresh metadata but reuse verified immutable blobs, including another branch', async () => {
  const { client, calls } = remote(),
    cache = new SyncBlobCache({ persistent: false });
  assert.equal((await client.pullRepository('writer/book', 'main', { cache })).downloaded, 1);
  const second = await client.pullRepository('writer/book', 'draft', { cache });
  assert.equal(second.reused, 1);
  assert.equal(second.downloaded, 0);
  assert.equal(second.files[0].text, '正文');
  assert.equal(calls.filter((path) => path.includes('/blobs/')).length, 1);
  assert.equal(calls.filter((path) => path.includes('/ref/')).length, 2);
  await cache.clear();
  assert.equal((await client.pullRepository('writer/book', 'main', { cache })).downloaded, 1);
});

test('Cache isolates servers, providers and repositories, rejects corrupted or fabricated Git objects', async () => {
  const cache = new SyncBlobCache({ persistent: false });
  await cache.put(target, target.repo, sha, data);
  assert.equal(await cache.get(target, target.repo, sha), data);
  for (const [host, repo] of [
    [{ ...target, server: 'https://other.example.com' }, target.repo],
    [{ provider: 'github' }, target.repo],
    [target, 'writer/other'],
  ])
    assert.equal(await cache.get(host, repo, sha), null);
  cache.memory.get(cache.key(target, target.repo, sha)).data = 'eA==';
  assert.equal(await cache.get(target, target.repo, sha), null);
  assert.equal(await matchesBlob(data, 'a'.repeat(40)), false);
});

test('Cache eviction is bounded; clearing prevents old in-flight responses from repopulating it', async () => {
  const cache = new SyncBlobCache({ persistent: false, entries: 1 });
  const generation = cache.generation;
  await cache.clear();
  await cache.put(target, target.repo, sha, data, generation);
  assert.equal(await cache.get(target, target.repo, sha), null);
  await cache.put(target, target.repo, sha, data);
  const reading = cache.get(target, target.repo, sha);
  await cache.clear();
  assert.equal(await reading, null);
  await cache.put(target, target.repo, sha, data);
  await cache.put(target, 'writer/other', sha, data);
  assert.equal(cache.memory.size, 1);
  assert.equal(await cache.get(target, target.repo, sha), null);
});

test('Cleanup reads a complete immutable manifest without downloading any file bytes', async () => {
  const { client, calls } = remote();
  const result = await client.pullRepository('writer/book', 'main', { metadataOnly: true });
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.remotePaths, ['a.txt']);
  assert.equal(result.fullSnapshot, true);
  assert.equal(result.selection, null);
  assert.equal(
    calls.some((path) => path.includes('/blobs/')),
    false,
  );
});

test('Branch switch checks all changed, new, deleted and conflicted files on that exact host/branch', () => {
  const workspace = fixture();
  assert.deepEqual(branchChanges(workspace, target).sort(), [
    'Book/a.txt',
    'Book/deleted.txt',
    'Book/new.txt',
  ]);
  assert.deepEqual(branchChanges(workspace, { ...target, branch: 'draft' }), []);
  assert.deepEqual(
    branchChanges(workspace, { ...target, server: 'https://other.example.com' }),
    [],
  );
});

test('Branch switch saves first, cancellation changes no target, explicit confirmation preserves manuscript associations', () => {
  const workspace = fixture();
  let dialog,
    applied,
    saves = 0;
  switchRepositoryBranch({
    workspace,
    target,
    next: 'draft',
    busy: () => false,
    save: () => (++saves, true),
    escape: String,
    openModal: (...args) => {
      dialog = args;
    },
    apply: (next) => {
      applied = next;
    },
  });
  assert.equal(saves, 1);
  assert.equal(applied, undefined);
  assert.match(dialog[1], /已先保存到本机/);
  dialog[2]();
  assert.equal(applied, 'draft');
  assert.equal(workspace.documents[0].remote.branch, 'main');
  assert.equal(saves, 2);
});

test('Save failure and active sync block branch switches, including a sync started while confirming', () => {
  const workspace = fixture();
  let dialog,
    busy = false;
  const options = {
    workspace,
    target,
    next: 'draft',
    busy: () => busy,
    save: () => true,
    escape: String,
    openModal: (...args) => {
      dialog = args;
    },
    apply: () => assert.fail('must not switch'),
  };
  assert.throws(() => switchRepositoryBranch({ ...options, save: () => false }), /保存失败/);
  switchRepositoryBranch(options);
  busy = true;
  assert.throws(() => dialog[2](), /正在同步/);
  assert.throws(() => switchRepositoryBranch(options), /正在同步/);
});

test('Branch protection verifies attachment bytes and includes new or unreadable attachments', async () => {
  const workspace = fixture();
  workspace.entries = [{ path: 'Book/cover.png' }, { path: 'Book/new.png' }];
  workspace.repositories[0].baseFiles['cover.png'] = { sha };
  assert.deepEqual(await inspectBranchAttachments(workspace, target, async () => data), [
    'Book/new.png',
  ]);
  assert.deepEqual(
    await inspectBranchAttachments(workspace, target, async () =>
      Buffer.from('changed').toString('base64'),
    ),
    ['Book/cover.png', 'Book/new.png'],
  );
  assert.deepEqual(
    await inspectBranchAttachments(workspace, target, async () => {
      throw Error('unreadable');
    }),
    ['Book/cover.png', 'Book/new.png'],
  );
  assert.ok(branchChanges(workspace, target).includes('Book/new.png'));
});

test('Cleanup updates deletion metadata while retaining the unreviewed commit baseline and conflicts', async () => {
  const workspace = fixture(),
    workflow = new SyncWorkflow({ workspace: () => workspace, changed() {} });
  await workflow.materialize(
    {
      ...target,
      commit: 'new-remote',
      cleanupOnly: true,
      files: [],
      folders: [],
      fullSnapshot: true,
      selection: null,
      remotePaths: ['a.txt', 'new.txt'],
      deletions: [],
    },
    'Book',
  );
  const association = workspace.repositories[0];
  assert.equal(association.commit, 'base');
  assert.equal(association.pendingCommit, 'pending');
  assert.deepEqual(association.conflicts, ['a.txt']);
  assert.equal(workspace.documents[0].text, '新稿');
});

test('Sync coordinator serializes writes and always releases its activity guard after errors', async () => {
  const workflow = new SyncWorkflow({});
  let finish;
  const pending = workflow.run(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  assert.equal(workflow.active, true);
  await assert.rejects(
    workflow.run(() => {}),
    /正在同步/,
  );
  finish();
  await pending;
  await assert.rejects(
    workflow.run(() => {
      throw Error('failed');
    }),
    /failed/,
  );
  assert.equal(workflow.active, false);
});

test('Status distinguishes local saving, remote changes and the full Gitea target', async () => {
  const activity = new SyncActivity(() => {});
  assert.match(activity.label('a', false, target), /已同步远端/);
  assert.match(activity.label('a', true, target), /待同步/);
  assert.match(
    syncTarget({ ...target, path: 'a.txt' }),
    /Gitea.*git.example.com.*writer\/book.*main.*a.txt/,
  );
  await activity.run('a', async () => assert.equal(activity.busy, true));
  assert.equal(activity.busy, false);
});
