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
const repository = 'writer/novel-with-a-long-repository-name-for-a-small-screen';
const branch = 'draft/long-branch-name-for-chapter-revisions-without-spaces';
const filename = '第一章-很长的小说文件名称与同步记录-very-long-filename-without-spaces.txt';
const folder = '很长的分卷目录-long-volume-directory-without-spaces';
try {
  await mkdir('test-results/repository-mobile', { recursive: true });
  for (const [provider, widths] of [
    ['github', [320, 390, 768, 1100]],
    ['gitee', [320, 390]],
    ['gitea', [320, 390, 768]],
  ]) {
    for (const width of widths) {
      const theme = width === 390 ? 'dark' : 'light';
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      await context.addInitScript((theme) => {
        localStorage.setItem('vela.test.motion', 'off');
        localStorage.setItem(
          'wenzhou.workspace',
          JSON.stringify({ version: 1, documents: [], settings: { theme } }),
        );
      }, theme);
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const origin =
        provider === 'github'
          ? 'https://api.github.com'
          : provider === 'gitee'
            ? 'https://gitee.com'
            : 'https://git-fixture.invalid';
      await page.route(origin + '/**', async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === 'OPTIONS')
          return route.fulfill({
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': '*',
            },
          });
        const p = url.pathname.replace(/^\/api\/v[15]/, '');
        const paginated = provider === 'gitea' && url.searchParams.get('page') !== '1';
        const entries = [
          { name: folder, path: folder, type: 'dir' },
          { name: filename, path: filename, type: 'file', size: 1024, sha: 'a'.repeat(40) },
        ];
        const body =
          p === '/user'
            ? { login: 'writer-with-a-long-account-name' }
            : p === '/user/repos'
              ? paginated
                ? []
                : [
                    {
                      name: repository.split('/')[1],
                      full_name: repository,
                      description: '长名称仓库的窄屏布局检查',
                      default_branch: 'main',
                      private: true,
                      permissions: { push: false, admin: false },
                    },
                  ]
              : p.endsWith('/branches')
                ? paginated
                  ? []
                  : [{ name: 'main' }, { name: branch }]
                : p.includes('/contents')
                  ? entries
                  : [];
        await route.fulfill({
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(body),
        });
      });
      const fits = async () =>
        assert.ok(
          await page.evaluate(() => {
            const view = document.querySelector('#github-view');
            return (
              document.documentElement.scrollWidth <= innerWidth + 1 &&
              view.scrollWidth <= view.clientWidth + 1
            );
          }),
          `${provider} ${width}px: no horizontal overflow`,
        );
      await page.goto(server.url + '/?ui=android');
      await page.waitForFunction(() => window.velaReady);
      await selectAppView(page, 'github');
      if (provider !== 'github') await page.locator('#git-provider').selectOption(provider);
      if (provider === 'gitea') await page.locator('#gitea-instance').fill(origin);
      await fits();
      await page.locator('#token-login').click();
      await page.locator('[name=token]').fill('layout-fixture');
      await page.locator('#dialog-submit').click();
      await page.locator('.repo-card').waitFor();
      await fits();
      if (width < 900) {
        const layout = await page.locator('.account-actions').evaluate((root) => ({
          display: getComputedStyle(root).display,
          widths: [...root.children].map((item) => item.getBoundingClientRect().width),
        }));
        assert.equal(layout.display, 'grid');
        assert.ok(Math.abs(layout.widths[0] - layout.widths[1]) < 1);
      }
      await page.screenshot({
        path: `test-results/repository-mobile/${provider}-${width}-list.png`,
      });
      await page.locator('.repo-card').click();
      await page.locator('[data-file]').first().waitFor();
      await fits();
      assert.ok(await page.locator('#repo-commit').isDisabled());
      assert.ok(await page.locator('#repo-settings').isDisabled());
      await page.locator('#branch-select').selectOption(branch);
      await page.waitForFunction(
        (branch) => document.querySelector('.sync-target').textContent.includes(branch),
        branch,
      );
      await fits();
      if (width < 900) {
        const bounds = await page.locator('.repo-toolbar').evaluate((root) => {
          const select = root.querySelector('select').getBoundingClientRect(),
            button = root.querySelector('button').getBoundingClientRect();
          return { selectBottom: select.bottom, buttonTop: button.top };
        });
        assert.ok(bounds.buttonTop >= bounds.selectBottom, 'branch selector gets a full row');
      }
      await page.locator('[data-browse]').click();
      await page.locator('[data-parent]').waitFor();
      await fits();
      await page.locator('[data-parent]').click();
      await page.locator('#remote-multi').click();
      const row = page.locator('[data-remote-row]').filter({ hasText: filename });
      await row.locator('[data-remote-select]').check();
      assert.match(await page.locator('#remote-selected-count').textContent(), /1/);
      assert.equal(await page.locator('#remote-multi').isVisible(), false);
      assert.equal(await row.locator('[data-remote-select]').isChecked(), true);
      await fits();
      const action = await row.locator('[data-delete]').boundingBox();
      if (width < 900)
        assert.ok(action.width >= 40 && action.height >= 40, 'remote file actions remain tappable');
      await page.screenshot({
        path: `test-results/repository-mobile/${provider}-${width}-files.png`,
      });
      await page.locator('#remote-cancel-selection').click();
      assert.ok(await page.locator('#remote-multi').isVisible());
      assert.equal(await page.locator('[data-remote-select]:visible').count(), 0);
      await fits();
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${provider} ${width}px ${theme}: login, repository actions, long names, branches, folders and selection`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
