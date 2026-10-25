import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectAppView } from './navigation-helper.mjs';

const data = await mkdtemp(path.join(os.tmpdir(), 'vela-gitea-windows-'));
const env = { ...process.env, VELA_QA: '1', VELA_QA_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath:
    process.env.VELA_TEST_EXECUTABLE ||
    path.resolve('windows/node_modules/electron/dist/electron.exe'),
  args: process.env.VELA_TEST_EXECUTABLE ? [] : [path.resolve('windows')],
  env,
});
try {
  await application.evaluate(({ BrowserWindow, net }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    const original = net.fetch.bind(net);
    globalThis.velaGiteaQA = [];
    net.fetch = async (url, options) => {
      if (!String(url).startsWith('https://gitea-fixture.invalid:8443/'))
        return original(url, options);
      const target = new URL(url);
      const instance = target.pathname.split('/')[1];
      const endpoint = target.pathname.split('/api/v1')[1];
      const token = options.headers.Authorization;
      globalThis.velaGiteaQA.push({ instance, endpoint, token });
      const valid = token === 'Bearer ' + instance + '-fixture';
      const body =
        endpoint === '/user'
          ? { login: 'writer' }
          : endpoint === '/user/repos'
            ? target.searchParams.get('page') === '1'
              ? [{ name: 'novel', full_name: 'writer/novel', default_branch: 'main' }]
              : []
            : {};
      return new Response(JSON.stringify(body), {
        status: valid ? 200 : 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => window.velaReady);
  await selectAppView(page, 'github');
  await page.locator('#git-provider').selectOption('gitea');
  await page.locator('#gitea-instance').fill('https://gitea-fixture.invalid:8443/one');
  await page.locator('#token-login').click();
  await page.locator('#dialog-body [name=token]').fill('one-fixture');
  await page.locator('#dialog-submit').click();
  await page.locator('.repo-card').waitFor();
  const call = (operation, payload) =>
    page.evaluate(
      async ({ operation, payload }) =>
        JSON.parse(await window.WenzhouNative.call(operation, JSON.stringify(payload))),
      { operation, payload },
    );
  const host = { provider: 'gitea', server: 'https://gitea-fixture.invalid:8443/one' };
  const other = { ...host, server: 'https://gitea-fixture.invalid:8443/two' };
  assert.equal((await call('login', { ...other, token: 'two-fixture' })).ok, true);
  const credentials = (await readdir(data)).filter((name) => /^gitea-.*-token.dat$/.test(name));
  assert.equal(credentials.length, 2);
  for (const name of credentials) {
    const bytes = await readFile(path.join(data, name));
    assert.ok(
      !bytes.includes(Buffer.from('one-fixture')) && !bytes.includes(Buffer.from('two-fixture')),
    );
  }
  const metadata = await page.evaluate(() => window.WenzhouNative.readWorkspace());
  assert.ok(!metadata.includes('one-fixture') && !metadata.includes('two-fixture'));
  await page.reload();
  await page.waitForFunction(() => window.velaReady);
  await selectAppView(page, 'github');
  await page.locator('.repo-card').waitFor();
  assert.match(await page.locator('#account-label').textContent(), /Gitea/);
  assert.equal((await call('api', { ...other, path: '/user' })).value.status, 200);
  await page.locator('#logout').click();
  assert.equal((await call('api', { ...host, path: '/user' })).value.status, 401);
  assert.equal((await call('api', { ...other, path: '/user' })).value.status, 200);
  const requests = await application.evaluate(() => globalThis.velaGiteaQA);
  assert.ok(
    requests.every((request) => request.token === 'Bearer ' + request.instance + '-fixture'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS Windows Gitea native bridge, custom port/subpath, DPAPI instance isolation, reload and scoped logout',
  );
} finally {
  await application.close();
  await rm(data, { recursive: true, force: true });
}
