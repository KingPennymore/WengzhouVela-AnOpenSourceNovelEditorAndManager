import { launchBrowser } from './browser-launch.mjs';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';

const fixture = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: "export {SyncBlobCache} from './web/sync-blob-cache.mjs';",
  },
  bundle: true,
  format: 'esm',
  write: false,
});
const server = await startSourceAppServer();
const browser = await launchBrowser();
try {
  await mkdir('test-results/sync-workflow', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const target = {
    provider: 'gitea',
    server: 'https://git.example.com/team',
    repo: 'writer/book',
    branch: 'main',
    path: '正文.txt',
    sha: 'a'.repeat(40),
    lastSyncedText: '正文',
    syncedAt: 1700000000000,
  };
  await context.addInitScript((target) => {
    if (!localStorage.getItem('wenzhou.workspace'))
      localStorage.setItem(
        'wenzhou.workspace',
        JSON.stringify({
          version: 1,
          documents: [
            {
              id: 'book',
              name: '正文.txt',
              path: 'Book/正文.txt',
              text: '正文',
              updatedAt: 1,
              remote: target,
            },
          ],
          activeId: 'book',
          openIds: ['book'],
          settings: { language: 'zh-CN', theme: 'light' },
        }),
      );
  }, target);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.route(server.url + '/cache-fixture.mjs', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fixture.outputFiles[0].text }),
  );
  async function ready() {
    await page.goto(server.url);
    await page.waitForFunction(() => window.velaReady);
    await openRecentFile(page, page.locator('[data-recent=book]'));
    await page.evaluate(async () => {
      window.cacheProbe = new (await import('/cache-fixture.mjs')).SyncBlobCache();
    });
  }
  await ready();
  const data = Buffer.from('正文').toString('base64'),
    sha = createHash('sha1').update('blob 6\0正文').digest('hex');
  await page.evaluate(
    async ({ target, sha, data }) => {
      await cacheProbe.put(target, target.repo, sha, data);
    },
    { target, sha, data },
  );
  await ready();
  assert.equal(
    await page.evaluate(({ target, sha }) => cacheProbe.get(target, target.repo, sha), {
      target,
      sha,
    }),
    data,
  );
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.locator('#sync-summary').count(), 0);
    assert.equal(await page.locator('#save-state').isVisible(), false);
    assert.equal(await page.locator('#sync-state').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `test-results/sync-workflow/status-${width}.png` });
  }
  await page.locator('.cm-content').focus();
  await page.keyboard.type('本地改动');
  await page.waitForFunction(() =>
    document.querySelector('#sync-state').textContent.includes('待同步'),
  );
  await page.waitForFunction(() =>
    document.querySelector('#save-state').textContent.includes('已保存到本机'),
  );
  await page.locator('#more-tools').click();
  await page.locator('#settings').click();
  await page.locator('.settings-navigation').getByRole('button', { name: '工作区配置' }).click();
  await page.locator('#cleanup-redundant').click();
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  await ready();
  assert.equal(
    await page.evaluate(({ target, sha }) => cacheProbe.get(target, target.repo, sha), {
      target,
      sha,
    }),
    null,
  );
  assert.match(await page.evaluate(() => velaEditorView.state.doc.toString()), /本地改动/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS persistent verified blob cache, reload, settings cleanup and no persistent status row',
  );
} finally {
  await browser.close();
  await server.close();
}
