import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { startSourceAppServer } from './source-app-server.mjs';

const server = await startSourceAppServer();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.WENZHOU_CHROME ||
    (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
await mkdir('test-results/editor-chrome', { recursive: true });
try {
  for (const width of [320, 390, 1280]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      await context.addInitScript((theme) => {
        localStorage.setItem('vela.test.motion', 'off');
        localStorage.setItem(
          'wenzhou.workspace',
          JSON.stringify({
            version: 1,
            activeId: 'book',
            openIds: ['book'],
            settings: { theme },
            documents: [
              {
                id: 'book',
                name: '操作指南.txt',
                text: '第一章 海风\n海风吹过港湾。',
                updatedAt: 1,
              },
            ],
          }),
        );
      }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(server.url);
      await page.waitForFunction(() => window.velaReady && window.velaEditorView);
      const state = () => page.locator('body').getAttribute('data-editor-chrome');
      const editor = page.locator('[data-view=write]');
      const actions = ['search-editor', 'add-glossary', 'export-doc'];
      const check = async (compact) => {
        const wide = page.viewportSize().width >= 900;
        compact = !wide && compact;
        const pinned = wide || compact;
        assert.equal(await state(), wide ? 'wide' : compact ? 'compact' : 'expanded');
        assert.equal(
          await editor.evaluate((button) => button.classList.contains('editor-emphasis')),
          compact,
        );
        for (const view of ['github', 'subscriptions', 'reader']) {
          assert.equal(await page.locator(`[data-view=${view}]`).isVisible(), !compact);
        }
        for (const id of actions) {
          assert.equal(await page.locator('.global-tools #' + id).count(), pinned ? 1 : 0);
          assert.equal(await page.locator('#toolbar-overflow #' + id).count(), pinned ? 0 : 1);
          assert.equal(await page.locator('#' + id).count(), 1);
        }
        assert.deepEqual(
          await page
            .locator('.global-tools>button')
            .evaluateAll((buttons) => buttons.map((button) => button.id)),
          pinned ? [...actions, 'outline-toggle', 'more-tools'] : ['outline-toggle', 'more-tools'],
        );
      };
      await check(true);
      const compactWidth = (await editor.boundingBox()).width;
      for (const id of [...actions, 'outline-toggle', 'more-tools']) {
        assert.ok(
          await page.locator('#' + id).evaluate((button) => {
            const box = button.getBoundingClientRect();
            return box.x >= 0 && box.right <= innerWidth + 1 && box.height >= 40;
          }),
          `${width}px ${id} stays within the top bar`,
        );
      }
      await page.locator('#more-tools').click();
      await check(true);
      await page.keyboard.press('Escape');
      await page.locator('.cm-content').click();
      await page.keyboard.insertText('正文');
      await check(true);
      await page.screenshot({ path: `test-results/editor-chrome/${width}-${theme}-compact.png` });
      await editor.click();
      await check(false);
      const normalWidth = (await editor.boundingBox()).width;
      if (width < 900) assert.ok(normalWidth < compactWidth);
      else assert.equal(normalWidth, compactWidth);
      await page.locator('#more-tools').click();
      for (const id of actions) assert.equal(await page.locator('#' + id).isVisible(), true);
      await page.keyboard.press('Escape');
      await page.locator('.cm-content').click();
      await page.keyboard.insertText('继续写作');
      await check(false);
      await page.screenshot({ path: `test-results/editor-chrome/${width}-${theme}-expanded.png` });
      await page.locator('[data-view=github]').click();
      await editor.click();
      await check(true);
      await editor.click();
      await check(false);
      await page.locator('#more-tools').click();
      await page.setViewportSize({ width: width === 1280 ? 390 : 1280, height: 850 });
      // A wide-screen click never toggles the saved narrow-screen choice.
      await check(width === 1280);
      await page.setViewportSize({ width, height: 850 });
      await check(false);
      for (const id of actions) assert.equal(await page.locator('#' + id).isVisible(), true);
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px ${theme}: editor toggle, tool placement, stable menus/content and navigation`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
