import test from 'node:test';
import assert from 'node:assert/strict';
import { Gitea } from '../web/gitea.mjs';
import { normalizeGiteaServer, gitHostKey, sameGitHost } from '../web/git-host.mjs';
import { GitHubBridge } from '../windows/github.mjs';
import {
  applyRemoteFile,
  applyRepository,
  repositoryFolder,
  resolveRepositoryConflict,
} from '../web/git-workspace.mjs';
import { downloadPlan } from '../web/sync-plan.mjs';

const server = 'https://git.example.com:8443/team';
const host = { provider: 'gitea', server };

test('Gitea instance normalization preserves ports/subpaths and rejects ambiguous credential targets', () => {
  assert.equal(
    normalizeGiteaServer(' HTTPS://Git.Example.com:00443/team/ '),
    'https://git.example.com/team',
  );
  assert.equal(normalizeGiteaServer('https://[::1]:8443/git'), 'https://[::1]:8443/git');
  for (const value of [
    '',
    'http://git.example.com',
    'https://user:pass@git.example.com',
    'https://git.example.com/?token=x',
    'https://git.example.com/#x',
    'https://git.example.com/a/../b',
    'https://git.example.com/%2e%2e',
    'https://git.example.com:0',
    'https://git.example.com:65536',
    'https://git.example.com\\@other.com',
    'https://git.example.com//team',
  ])
    assert.throws(() => normalizeGiteaServer(value), /Gitea/);
  assert.ok(sameGitHost(host, { ...host, server: server + '/' }));
  assert.ok(!sameGitHost(host, { ...host, server: server + '/other' }));
  assert.ok(!sameGitHost(host, { provider: 'github' }));
});

test('Gitea paginates capped lists and uses its branch and single-file protocols', async () => {
  const calls = [],
    client = new Gitea(async (_op, data) => {
      calls.push(data);
      return {
        status: 200,
        body: data.path.startsWith('/user/repos')
          ? data.path.endsWith('page=1')
            ? [{ name: 'one' }]
            : data.path.endsWith('page=2')
              ? [{ name: 'two' }]
              : []
          : { content: { sha: 'next' } },
      };
    }, server);
  assert.equal((await client.repositories()).length, 2);
  assert.ok(calls.every((call) => call.server === server && call.provider === 'gitea'));
  await client.createBranch('o/r', 'draft/one', 'draft/two');
  assert.deepEqual(calls.at(-1).body, {
    old_branch_name: 'draft/one',
    new_branch_name: 'draft/two',
  });
  await client.commit({
    repo: 'o/r',
    branch: 'main',
    path: '中文.txt',
    text: '正文𠮷',
    message: '新增',
  });
  assert.equal(calls.at(-1).method, 'POST');
  assert.equal(Buffer.from(calls.at(-1).body.content, 'base64').toString(), '正文𠮷');
  await client.commit({
    repo: 'o/r',
    branch: 'main',
    path: '中文.txt',
    sha: 'base',
    text: '正文',
    message: '修改',
  });
  assert.equal(calls.at(-1).method, 'PUT');
  assert.equal(calls.at(-1).body.sha, 'base');
});

test('Gitea pull reads immutable snapshots, paginated trees, text and binary', async () => {
  const calls = [],
    client = new Gitea(async (_op, data) => {
      calls.push(data.path);
      const body = data.path.includes('/branches/')
        ? { commit: { id: 'head' } }
        : data.path.includes('/git/commits/')
          ? { commit: { tree: { sha: 'tree' } } }
          : data.path.includes('/git/trees/')
            ? {
                total_count: 2,
                truncated: true,
                tree: [
                  data.path.includes('page=2')
                    ? { path: 'image.bin', sha: 'binary', size: 2, mode: '100644', type: 'blob' }
                    : { path: '中文.txt', sha: 'text', size: 6, mode: '100644', type: 'blob' },
                ],
              }
            : {
                encoding: 'base64',
                content: data.path.endsWith('/text')
                  ? Buffer.from('正文').toString('base64')
                  : 'AAE=',
              };
      return { status: 200, body };
    }, server);
  const result = await client.pullRepository('o/r', 'draft/one');
  assert.equal(result.server, server);
  assert.equal(result.commit, 'head');
  assert.equal(result.files[0].text, '正文');
  assert.equal(result.files[1].text, null);
  assert.ok(calls[0].endsWith('/branches/draft%2Fone'));
  assert.ok(calls.some((path) => path.includes('/git/commits/head')));
  assert.ok(calls.some((path) => path.includes('/git/trees/tree?recursive=1&page=2')));
});

test('Incomplete Gitea tree pages and cancellation never produce a partial download', async () => {
  const client = new Gitea(
    async (_op, data) => ({
      status: 200,
      body: data.path.includes('page=2')
        ? { total_count: 2, tree: [] }
        : { total_count: 2, tree: [{ path: 'one' }] },
    }),
    server,
  );
  await assert.rejects(client.request('/repos/o/r/git/trees/tree?recursive=1'), /分页不完整/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(client.pullRepository('o/r', 'main', { signal: abort.signal }), /取消/);
});

test('Gitea workspace commits text/binary/deletions atomically with each original blob SHA', async () => {
  const calls = [],
    client = new Gitea(async (_op, data) => {
      calls.push(data);
      if (data.path.includes('/branches/'))
        return { status: 200, body: { commit: { id: 'head' } } };
      if (data.path.includes('/contents/'))
        return { status: data.path.includes('new.txt') ? 404 : 200, body: { sha: 'base-blob' } };
      return {
        status: 201,
        body: { commit: { sha: 'next' }, files: [{ path: 'new.txt', sha: 'new-blob' }] },
      };
    }, server);
  const result = await client.commitWorkspace({
    repo: 'o/r',
    branch: 'main',
    expectedHead: 'head',
    message: '一起提交',
    prefix: 'novel',
    files: [
      { path: 'new.txt', text: '新正文' },
      { path: 'image.bin', data: 'AAE=' },
      { path: 'old.txt', delete: true },
    ],
  });
  const writes = calls.filter((call) => call.method !== 'GET');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/repos/o/r/contents');
  assert.deepEqual(
    writes[0].body.files.map((file) => file.operation),
    ['create', 'update', 'delete'],
  );
  assert.equal(writes[0].body.files[1].sha, 'base-blob');
  assert.equal(writes[0].body.files[1].content, 'AAE=');
  assert.ok(!('content' in writes[0].body.files[2]));
  assert.equal(result.sha, 'next');
});

test('Gitea rejects stale branches before and during preparation, and never retries conflicting writes', async () => {
  for (const during of [false, true]) {
    let reads = 0,
      writes = 0;
    const client = new Gitea(async (_op, data) => {
      if (data.method !== 'GET') writes++;
      return {
        status: 200,
        body: data.path.includes('/branches/')
          ? { commit: { id: during && ++reads === 1 ? 'base' : 'changed' } }
          : { sha: 'blob' },
      };
    }, server);
    await assert.rejects(
      client.commitWorkspace({
        repo: 'o/r',
        branch: 'main',
        expectedHead: 'base',
        message: '更新',
        files: [{ path: 'book.txt', text: '正文' }],
      }),
      (error) => error.status === 409,
    );
    assert.equal(writes, 0);
  }
  let requests = 0;
  const client = new Gitea(async () => {
    requests++;
    return { status: 409, body: {} };
  }, server);
  await assert.rejects(
    client.commit({
      repo: 'o/r',
      branch: 'main',
      path: 'book.txt',
      sha: 'old',
      text: '正文',
      message: '更新',
    }),
    (error) => error.status === 409,
  );
  assert.equal(requests, 1);
});

test('Windows isolates Gitea credentials by canonical server and logout affects only that instance', async () => {
  const tokens = new Map(),
    calls = [];
  const bridge = new GitHubBridge({
    credentials: {
      read: (key) => tokens.get(key) || '',
      write: (token, key) => tokens.set(key, token),
      clear: (key) => tokens.delete(key),
    },
    request: async (url, method, body, token, target) => {
      calls.push({ url, token, target });
      return { status: 200, body: { login: 'writer' } };
    },
  });
  await bridge.call('login', { ...host, token: 'first-fixture' });
  const other = { ...host, server: 'https://git.example.com:8443/other' };
  await bridge.call('login', { ...other, token: 'second-fixture' });
  await bridge.call('api', { ...host, path: '/user' });
  assert.equal(calls.at(-1).token, 'first-fixture');
  assert.equal(calls.at(-1).url, server + '/api/v1/user');
  await bridge.call('api', { ...other, path: '/user' });
  assert.equal(calls.at(-1).token, 'second-fixture');
  await bridge.call('logout', host);
  assert.ok(tokens.has(gitHostKey(other)));
  assert.ok(!tokens.has(gitHostKey(host)));
  const before = calls.length;
  for (const path of [
    '//evil.example/user',
    '/repos/o/r/../user',
    '/repos/o/r/%2e%2e/user',
    '/repos/o/r/%5cuser',
  ])
    await assert.rejects(bridge.call('api', { ...other, path }));
  await assert.rejects(
    bridge.call('login', { ...host, server: 'http://evil.example', token: 'fixture' }),
  );
  assert.equal(calls.length, before);
});

test('Gitea instances with identical repository paths retain separate files, folders, bases and conflicts', () => {
  const workspace = { documents: [], repositories: [], openIds: [], folders: [] };
  const other = { ...host, server: 'https://other.example.com' };
  const first = applyRemoteFile(workspace, {
    ...host,
    repo: 'o/r',
    branch: 'main',
    path: 'book.txt',
    text: '甲',
    sha: 'a',
  });
  const second = applyRemoteFile(workspace, {
    ...other,
    repo: 'o/r',
    branch: 'main',
    path: 'book.txt',
    text: '乙',
    sha: 'b',
  });
  assert.notEqual(first.id, second.id);
  for (const [identity, text, sha] of [
    [host, '甲', 'a'],
    [other, '乙', 'b'],
  ]) {
    const folder = repositoryFolder(workspace, 'o/r', identity.provider, identity.server);
    applyRepository(
      workspace,
      {
        ...identity,
        repo: 'o/r',
        branch: 'main',
        commit: sha,
        folders: [],
        files: [{ path: 'book.txt', text, sha }],
      },
      folder,
    );
  }
  assert.equal(workspace.repositories.length, 2);
  assert.notEqual(workspace.repositories[0].folder, workspace.repositories[1].folder);
  const plan = downloadPlan(
    workspace,
    { ...other, repo: 'o/r', branch: 'main', files: [{ path: 'book.txt', text: '丙', sha: 'c' }] },
    workspace.repositories[1].folder,
  );
  assert.equal(plan[0].doc.id, second.id);
  assert.equal(first.text, '甲');
  workspace.repositories.forEach((item) => {
    item.conflicts = ['book.txt'];
    item.pendingCommit = 'pending';
  });
  resolveRepositoryConflict(workspace, {
    ...other,
    repo: 'o/r',
    branch: 'main',
    path: 'book.txt',
    text: '丙',
    sha: 'c',
  });
  assert.deepEqual(workspace.repositories[0].conflicts, ['book.txt']);
  assert.deepEqual(workspace.repositories[1].conflicts, []);
});
