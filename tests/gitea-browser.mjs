import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';
import { selectAppView } from './navigation-helper.mjs';

const server = await startSourceAppServer();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.WENZHOU_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
await mkdir('test-results/gitea', { recursive: true });
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const calls = [],
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/^https:\/\/git-fixture\.invalid:8443\//, async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const match = url.pathname.match(/^\/(one|two)\/api\/v1(.*)$/);
      assert.ok(match, 'Configured instance subpath is preserved');
      const [, instance, path] = match,
        auth = request.headers().authorization;
      calls.push({ instance, path, auth, method: request.method() });
      if (path !== '/version')
        assert.equal(
          auth,
          'Bearer ' +
            (auth === 'Bearer invalid-fixture' ? 'invalid-fixture' : instance + '-fixture'),
        );
      let status = auth === 'Bearer invalid-fixture' ? 401 : 200;
      const text = instance === 'one' ? '甲站正文' : '乙站正文';
      let body =
        path === '/version'
          ? { version: '1.25.4' }
          : path === '/user'
            ? { login: 'writer' }
            : path === '/user/repos'
              ? url.searchParams.get('page') === '1'
                ? [
                    {
                      name: 'novel',
                      full_name: 'writer/novel',
                      default_branch: 'main',
                      permissions: { push: true, admin: true },
                    },
                  ]
                : []
              : path.endsWith('/branches')
                ? url.searchParams.get('page') === '1'
                  ? [{ name: 'main' }]
                  : []
                : path.endsWith('/contents')
                  ? [
                      {
                        type: 'file',
                        name: '正文.txt',
                        path: '正文.txt',
                        sha: instance + '-blob',
                        size: 12,
                      },
                    ]
                  : path.includes('/contents/')
                    ? {
                        type: 'file',
                        path: '正文.txt',
                        sha: instance + '-blob',
                        size: 12,
                        encoding: 'base64',
                        content: Buffer.from(text).toString('base64'),
                      }
                    : {};
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(server.url);
    await page.waitForFunction(() => window.velaReady);
    await selectAppView(page, 'github');
    await page.locator('#git-provider').selectOption('gitea');
    assert.equal(await page.locator('#device-login').count(), 0);
    const address = 'https://git-fixture.invalid:8443/one';
    await page.locator('#gitea-instance').fill(address + '/');
    await page.locator('#check-connection').click();
    await page.waitForFunction(() =>
      document.querySelector('#dialog-body').textContent.includes('Gitea 连接正常'),
    );
    await page.locator('#dialog-cancel').click();
    assert.ok(calls.some((call) => call.path === '/version' && !call.auth));
    await page.screenshot({ path: `test-results/gitea/login-${width}.png` });
    await page.locator('#token-login').click();
    await page.locator('#dialog-body [name=token]').fill('invalid-fixture');
    await page.locator('#dialog-submit').click();
    await page.waitForFunction(() =>
      document.querySelector('#dialog-error').textContent.includes('401'),
    );
    await page.locator('#dialog-body [name=token]').fill('one-fixture');
    await page.locator('#dialog-submit').click();
    await page.locator('.repo-card').waitFor();
    await page.locator('.repo-card').click();
    await page.locator('#file-list [data-file]').waitFor();
    await page.locator('#file-list [data-file]').click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some((doc) =>
        doc.remote?.server?.endsWith('/one'),
      ),
    );
    let state = await page.evaluate(() => JSON.parse(localStorage.getItem('wenzhou.workspace')));
    assert.equal(state.settings.giteaServer, address);
    assert.equal(state.githubCache.server, address);
    assert.ok(!JSON.stringify(state).includes('one-fixture'));
    await page.locator('#back-repos').click();
    await page.locator('#logout').click();
    await page.locator('#gitea-instance').fill('https://git-fixture.invalid:8443/two');
    await page.locator('#token-login').click();
    await page.locator('#dialog-body [name=token]').fill('two-fixture');
    await page.locator('#dialog-submit').click();
    await page.locator('.repo-card').waitFor();
    await page.locator('.repo-card').click();
    await page.locator('#file-list [data-file]').waitFor();
    await page.locator('#file-list [data-file]').click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some((doc) =>
        doc.remote?.server?.endsWith('/two'),
      ),
    );
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('wenzhou.workspace')));
    const first = state.documents.find((doc) => doc.remote?.server?.endsWith('/one'));
    const second = state.documents.find((doc) => doc.remote?.server?.endsWith('/two'));
    assert.notEqual(first.id, second.id);
    assert.equal(first.text, '甲站正文');
    assert.equal(second.text, '乙站正文');
    assert.equal(state.githubCache.server, 'https://git-fixture.invalid:8443/two');
    await page.locator('#back-repos').click();
    await page.locator('#logout').click();
    await page.reload();
    await page.waitForFunction(() => window.velaReady);
    await selectAppView(page, 'github');
    assert.equal(await page.locator('#git-provider').inputValue(), 'gitea');
    assert.equal(
      await page.locator('#gitea-instance').inputValue(),
      'https://git-fixture.invalid:8443/two',
    );
    await page.locator('#token-login').click();
    await page.locator('#dialog-body [name=server]').fill('http://git-fixture.invalid');
    await page.locator('#dialog-body [name=token]').fill('two-fixture');
    const before = calls.length;
    await page.locator('#dialog-submit').click();
    await page.waitForFunction(() =>
      document.querySelector('#dialog-error').textContent.includes('HTTPS'),
    );
    assert.equal(calls.length, before);
    await page.locator('#dialog-body [name=provider]').selectOption('github');
    assert.ok(await page.locator('#dialog-body [name=server]').isDisabled());
    await page.locator('#dialog-cancel').click();
    await page.locator('#git-provider').selectOption('github');
    assert.equal(await page.locator('#device-login').count(), 0);
    assert.ok(await page.locator('#gitea-instance').isHidden());
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
    console.log(
      `PASS Gitea ${width}px: custom port/subpath, connection, rejected login, Unicode pull, instance isolation, persistence and provider switching`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
