import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectAppView } from './navigation-helper.mjs';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'vela-sync-native-'));
const env = { ...process.env, VELA_QA: '1', VELA_QA_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: path.resolve('windows/node_modules/electron/dist/electron.exe'),
  args: [path.resolve('windows')],
  env,
});
try {
  await application.evaluate(({ BrowserWindow, net }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    const original = net.fetch.bind(net);
    globalThis.syncRemoteStage = 1;
    net.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.github.com/')) return original(url, options);
      const target = new URL(url),
        p = target.pathname,
        stage = globalThis.syncRemoteStage;
      const entries =
        stage === 1
          ? [
              { path: 'old.txt', sha: 'blob-old', text: '旧稿' },
              { path: 'edited.txt', sha: 'blob-edited', text: '原稿' },
            ]
          : stage === 4
            ? []
            : [{ path: 'new.txt', sha: 'blob-new', text: '新稿' }];
      let body =
        p === '/user'
          ? { login: 'writer' }
          : p === '/user/repos'
            ? [
                {
                  name: 'book',
                  full_name: 'writer/book',
                  default_branch: 'main',
                  permissions: { push: true, admin: true },
                },
              ]
            : p.endsWith('/branches')
              ? [{ name: 'main' }, { name: 'draft' }]
              : p.includes('/git/ref/')
                ? { object: { sha: 'head-' + stage } }
                : p.includes('/git/commits/')
                  ? { tree: { sha: 'tree-' + stage } }
                  : p.includes('/git/trees/')
                    ? {
                        tree: entries.map(({ path, sha, text }) => ({
                          path,
                          sha,
                          type: 'blob',
                          mode: '100644',
                          size: Buffer.byteLength(text),
                        })),
                      }
                    : p.includes('/git/blobs/')
                      ? {
                          encoding: 'base64',
                          content: Buffer.from(
                            p.endsWith('blob-old')
                              ? '旧稿'
                              : p.endsWith('blob-edited')
                                ? '原稿'
                                : '新稿',
                          ).toString('base64'),
                        }
                      : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });
  const page = await application.firstWindow(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => window.velaReady);
  const call = (operation, payload = {}) =>
    page.evaluate(
      async ({ operation, payload }) =>
        JSON.parse(await window.WenzhouNative.call(operation, JSON.stringify(payload))),
      { operation, payload },
    );
  await selectAppView(page, 'github');
  await page.locator('#token-login').click();
  await page.locator('#dialog-body [name=token]').fill('github-fixture');
  await page.locator('#dialog-submit').click();
  await page.locator('.repo-card').waitFor();
  async function pull() {
    await page.locator('.repo-card').click();
    await page.locator('#repo-pull').click();
    await page.locator('#dialog-submit').click();
    await page.waitForFunction(
      () => document.querySelector('#dialog-title').textContent === '确认拉取文件',
    );
  }
  await pull();
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  let state = JSON.parse(await page.evaluate(() => window.WenzhouNative.readWorkspace()));
  const old = state.documents.find((doc) => doc.path === 'book/old.txt');
  assert.ok(old);
  await call('writeWorkspaceFiles', {
    files: [
      { path: 'book/edited.txt', data: Buffer.from('本地修改').toString('base64') },
      { path: 'book/local-only.txt', data: Buffer.from('本地独有').toString('base64') },
    ],
  });
  await application.evaluate(() => (globalThis.syncRemoteStage = 2));
  await page.reload();
  await page.waitForFunction(() => window.velaReady);
  await selectAppView(page, 'github');
  await page.locator('.repo-card').waitFor();
  await pull();
  const oldRow = page.locator('[data-download]').filter({ hasText: 'old.txt' }),
    editedRow = page.locator('[data-download]').filter({ hasText: 'edited.txt' });
  assert.equal(await oldRow.locator('input').isChecked(), false);
  assert.equal(await editedRow.locator('input').isDisabled(), true);
  assert.equal(
    await page.locator('[data-download]').filter({ hasText: 'local-only.txt' }).count(),
    0,
  );
  await oldRow.locator('input').check();
  await application.evaluate(() => (globalThis.syncRemoteStage = 3));
  await page.locator('#dialog-submit').click();
  await page.waitForFunction(() =>
    document.querySelector('#dialog-error').textContent.includes('远端分支在预览后已变化'),
  );
  assert.equal(
    await fs.readFile(path.join(data, 'workspaces', 'Vela', 'book', 'old.txt'), 'utf8'),
    '旧稿',
  );
  await assert.rejects(fs.access(path.join(data, 'workspaces', 'Vela', 'book', 'new.txt')));
  await application.evaluate(() => (globalThis.syncRemoteStage = 2));
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  const root = path.join(data, 'workspaces', 'Vela', 'book');
  await assert.rejects(fs.access(path.join(root, 'old.txt')));
  assert.equal(await fs.readFile(path.join(root, 'edited.txt'), 'utf8'), '本地修改');
  assert.equal(await fs.readFile(path.join(root, 'local-only.txt'), 'utf8'), '本地独有');
  assert.equal(await fs.readFile(path.join(root, 'new.txt'), 'utf8'), '新稿');
  state = JSON.parse(await page.evaluate(() => window.WenzhouNative.readWorkspace()));
  assert.equal(state.documents.find((doc) => doc.path === 'book/edited.txt').remote.deleted, true);
  const trash = (await call('listTrash')).value;
  assert.equal(trash.length, 1);
  assert.equal(trash[0].path, 'book/old.txt');
  await page.locator('#branch-select').selectOption('draft');
  assert.equal(await page.locator('#dialog-title').textContent(), '切换分支前确认');
  assert.equal(await page.locator('#branch-select').inputValue(), 'main');
  await page.locator('#dialog-cancel').click();
  assert.equal(await page.locator('#branch-select').inputValue(), 'main');
  await page.locator('#branch-select').selectOption('draft');
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  assert.equal(await page.locator('#branch-select').inputValue(), 'draft');
  await page.locator('#repo-pull').click();
  await page.locator('#dialog-submit').click();
  await page.waitForFunction(
    () => document.querySelector('#dialog-title').textContent === '确认拉取文件',
  );
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  state = JSON.parse(await page.evaluate(() => window.WenzhouNative.readWorkspace()));
  const mainDoc = state.documents.find((doc) => doc.path === 'book/new.txt'),
    draftDoc = state.documents.find(
      (doc) =>
        doc.remote?.repo === 'writer/book' &&
        doc.remote.branch === 'draft' &&
        doc.remote.path === 'new.txt',
    );
  assert.ok(mainDoc && draftDoc);
  assert.notEqual(mainDoc.id, draftDoc.id);
  assert.notEqual(mainDoc.path, draftDoc.path);
  assert.equal(mainDoc.remote.branch, 'main');
  assert.equal((await call('restoreTrash', { id: trash[0].id })).ok, true);
  const restored = (await call('refreshFolder')).value.documents.find(
    (doc) => doc.path === 'book/old.txt',
  );
  assert.equal(restored.id, old.id);
  assert.equal(restored.text, '旧稿');
  // Settings cleanup scans metadata only, preserves edits/local-only files and uses recoverable trash.
  await application.evaluate(() => (globalThis.syncRemoteStage = 4));
  await page.locator('#more-tools').click();
  await page.locator('#settings').click();
  await page.locator('.settings-navigation').getByRole('button', { name: '工作区配置' }).click();
  await page.locator('#cleanup-redundant').click();
  await page.locator('[name=cleanupTarget]').selectOption('0');
  await page.locator('#dialog-submit').click();
  await page.waitForFunction(
    () => document.querySelector('#dialog-title').textContent === '确认清理冗余文件',
  );
  const cleanupNew = page.locator('[data-download]').filter({ hasText: 'new.txt' });
  assert.equal(await cleanupNew.count(), 1);
  assert.equal(await cleanupNew.locator('input').isChecked(), false);
  assert.equal(
    await page
      .locator('[data-download]')
      .filter({ hasText: 'edited.txt' })
      .locator('input')
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.locator('[data-download]').filter({ hasText: 'local-only.txt' }).count(),
    0,
  );
  await cleanupNew.locator('input').check();
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  await assert.rejects(fs.access(path.join(root, 'new.txt')));
  assert.equal(await fs.readFile(path.join(root, 'edited.txt'), 'utf8'), '本地修改');
  assert.equal(await fs.readFile(path.join(root, 'local-only.txt'), 'utf8'), '本地独有');
  state = JSON.parse(await page.evaluate(() => window.WenzhouNative.readWorkspace()));
  assert.ok(state.documents.find((doc) => doc.id === draftDoc.id));
  assert.equal(state.repositories.find((item) => item.branch === 'main').commit, 'head-2');
  assert.ok((await call('listTrash')).value.some((item) => item.path === 'book/new.txt'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS Windows production pull flow: remote deletion preview, modified/local-only retention, atomic apply, trash and stable-ID restore',
  );
} finally {
  await application.close();
  await fs.rm(data, { recursive: true, force: true });
}
