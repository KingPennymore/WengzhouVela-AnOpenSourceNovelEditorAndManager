// Optional integration test against an official local Gitea binary. No remote account is used.
// VELA_GITEA_BIN=/absolute/path/to/gitea node tests/gitea-live.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { Gitea } from '../web/gitea.mjs';

const binary = process.env.VELA_GITEA_BIN;
if (!binary || !path.isAbsolute(binary))
  throw Error('Set VELA_GITEA_BIN to a local Gitea executable.');
const root = await mkdtemp(path.join(os.tmpdir(), 'vela-gitea-test-'));
const listener = net.createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const config = path.join(root, 'app.ini');
const local = `http://127.0.0.1:${port}`;
await writeFile(
  config,
  `APP_NAME = Vela Gitea QA
RUN_MODE = prod
WORK_PATH = ${root.replaceAll('\\', '/')}
[database]
DB_TYPE = sqlite3
PATH = ${root.replaceAll('\\', '/')}/gitea.db
[repository]
SCRIPT_TYPE = sh
ROOT = ${root.replaceAll('\\', '/')}/repositories
[server]
PROTOCOL = http
HTTP_ADDR = 127.0.0.1
HTTP_PORT = ${port}
ROOT_URL = ${local}/git/
APP_DATA_PATH = ${root.replaceAll('\\', '/')}/data
DISABLE_SSH = true
OFFLINE_MODE = true
[security]
INSTALL_LOCK = true
[service]
DISABLE_REGISTRATION = true
[log]
MODE = console
LEVEL = Error
[cron]
ENABLED = false
`,
);
let processHandle,
  output = '';
const cli = (args) =>
  execFileSync(binary, [...args, '--config', config, '--work-path', root], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 90000,
  });
try {
  cli(['migrate']);
  cli([
    'admin',
    'user',
    'create',
    '--username',
    'writer',
    '--password',
    'Vela-QA-Temporary-4729!',
    '--email',
    'writer@example.invalid',
    '--admin',
    '--must-change-password=false',
  ]);
  const token = cli([
    'admin',
    'user',
    'generate-access-token',
    '--username',
    'writer',
    '--token-name',
    'vela-qa',
    '--scopes',
    'write:user,write:repository',
    '--raw',
  ])
    .trim()
    .split(/\s+/)
    .at(-1);
  processHandle = spawn(binary, ['web', '--config', config, '--work-path', root], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.on('data', (data) => (output += data));
  processHandle.stderr.on('data', (data) => (output += data));
  let ready = false;
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(local + '/api/v1/version', { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Local Gitea started');
  const calls = [];
  const client = new Gitea(async (_operation, data) => {
    calls.push({ path: data.path, method: data.method });
    // Only this test maps its HTTPS identity onto an isolated loopback HTTP server.
    const response = await fetch(local + '/api/v1' + data.path, {
      method: data.method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(data.body ? { body: JSON.stringify(data.body) } : {}),
      redirect: 'error',
    });
    const body = await response.json();
    if (
      !response.ok &&
      response.status !== 404 &&
      response.status !== 409 &&
      response.status !== 422
    )
      console.error(response.status, data.path, body.message);
    return { status: response.status, body };
  }, 'https://gitea-fixture.invalid/git');
  assert.equal((await client.user()).login, 'writer');
  await client.createRepository('novel', '文舟兼容验证', true);
  assert.equal((await client.repositories()).length, 1);
  const repo = 'writer/novel',
    branch = (await client.repositories())[0].default_branch;
  const created = await client.commit({
    repo,
    branch,
    path: '章节/正文.txt',
    text: '第一章\n正文𠮷😀',
    message: '初稿',
  });
  assert.equal((await client.readFile(repo, branch, '章节/正文.txt')).text, '第一章\n正文𠮷😀');
  await client.createBranch(repo, branch, 'draft/review');
  assert.ok((await client.branches(repo)).some((item) => item.name === 'draft/review'));
  const initial = await client.pullRepository(repo, branch);
  assert.ok(initial.files.some((file) => file.path === '章节/正文.txt'));
  const batch = await client.commitWorkspace({
    repo,
    branch,
    expectedHead: initial.commit,
    message: '多文件保存',
    files: [
      { path: '章节/正文.txt', text: '第一章\n改稿' },
      { path: '附件/cover.bin', data: 'AAECAw==' },
      { path: 'README.md', delete: true },
    ],
  });
  assert.ok(batch.sha);
  assert.ok(batch.files.find((file) => file.path === '章节/正文.txt')?.sha);
  const next = await client.pullRepository(repo, branch);
  assert.equal(next.files.find((file) => file.path === '章节/正文.txt').text, '第一章\n改稿');
  assert.equal(next.files.find((file) => file.path === '附件/cover.bin').text, null);
  assert.ok(!next.files.some((file) => file.path === 'README.md'));
  await assert.rejects(
    client.commit({
      repo,
      branch,
      path: '章节/正文.txt',
      sha: created.content.sha,
      text: '过期修改',
      message: '过期',
    }),
    (error) => error.status === 409 || error.status === 422,
  );
  const before = calls.filter((call) => call.method === 'POST').length;
  await assert.rejects(
    client.commitWorkspace({
      repo,
      branch,
      expectedHead: initial.commit,
      message: '过期工作区',
      files: [{ path: '章节/正文.txt', text: '过期修改' }],
    }),
    (error) => error.status === 409,
  );
  assert.equal(calls.filter((call) => call.method === 'POST').length, before);
  await client.updateRepository(repo, { description: '修改简介' });
  assert.ok((await client.commits(repo, branch)).length >= 2);
  const current = await client.readFile(repo, branch, '章节/正文.txt');
  await client.deleteFile({
    repo,
    branch,
    path: '章节/正文.txt',
    sha: current.sha,
    message: '删除验证',
  });
  console.log(
    'PASS real Gitea: login, repositories, nested branch, Unicode files, atomic workspace text/binary/deletion, history, stale versions and deletion',
  );
} catch (error) {
  console.error(output.slice(-5000));
  throw error;
} finally {
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill();
    await new Promise((resolve) => processHandle.once('exit', resolve));
  }
  await rm(root, { recursive: true, force: true });
}
