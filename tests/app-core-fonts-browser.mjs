import { settingsSection, closeSettings } from './settings-helper.mjs';
import { launchBrowser } from './browser-launch.mjs';
import { selectAppView } from './navigation-helper.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';
import { listSystemFonts } from '../windows/system-fonts.mjs';

const server = await startSourceAppServer();
const browser = await launchBrowser();
const installed = await listSystemFonts();
const errors = [];
await mkdir('test-results/fonts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (fonts) => {
      localStorage.setItem('vela.test.motion', 'off');
      if (!localStorage.getItem('wenzhou.workspace')) {
        localStorage.setItem(
          'wenzhou.workspace',
          JSON.stringify({
            version: 1,
            activeId: 'book',
            openIds: ['book'],
            settings: { theme: 'light' },
            documents: [
              {
                id: 'book',
                name: '操作指南.txt',
                text: '第一章 海风\nFont sample 0123456789\n海风吹过港湾。',
                updatedAt: 1,
              },
            ],
          }),
        );
      }
      window.fontRequests = 0;
      window.queryLocalFonts = async () => {
        window.fontRequests++;
        return fonts.map((family) => ({ family }));
      };
    },
    installed.length ? installed : ['Consolas', 'Arial'],
  );
  await page.goto(server.url);
  await page.waitForFunction(() => window.velaReady && window.velaEditorView);
  const settings = async () => {
    if (await page.locator('#more-tools').isVisible()) {
      await page.locator('#more-tools').click();
      await page.locator('#settings').click();
    } else await page.keyboard.press('Control+,');
    await settingsSection(page, 'appearance');
    await page.locator('[name=fontFamily]').waitFor();
  };
  await settings();
  assert.equal(await page.evaluate(() => window.fontRequests), 0);
  assert.equal(await page.locator('[name=fontFamily] option').count(), 2);
  await page.locator('[data-font-list]').click();
  await page.waitForFunction(() => !document.querySelector('[data-font-list]').disabled);
  assert.equal(await page.evaluate(() => window.fontRequests), 1);
  const font = installed.includes('Consolas') || !installed.length ? 'Consolas' : installed[0];
  await page.locator('[name=fontFamily]').selectOption(font);
  assert.ok(
    (
      await page
        .locator('.font-settings-preview')
        .evaluate((node) => getComputedStyle(node).fontFamily)
    ).includes(font),
  );
  await page.screenshot({ path: 'test-results/fonts/settings-desktop.png' });
  await closeSettings(page);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--app-font-family')),
    '"' + font + '",system-ui,sans-serif',
  );
  console.log('PASS font enumeration requires a click; a chosen font applies immediately');

  await settings();
  await page.locator('[data-font-list]').click();
  await page.locator(`[name=fontFamily] option[value="${font}"]`).waitFor({ state: 'attached' });
  await page.locator('[name=fontFamily]').selectOption(font);
  await closeSettings(page);
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  for (const selector of ['body', '.cm-scroller']) {
    assert.ok(
      (await page.locator(selector).evaluate((node) => getComputedStyle(node).fontFamily)).includes(
        font,
      ),
    );
  }
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.fontFamily,
    ),
    font,
  );
  if (font === 'Consolas' && installed.includes('Consolas')) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '.cm-line:nth-child(2)',
    });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    assert.ok(fonts.some((item) => item.familyName === 'Consolas' && item.glyphCount > 0));
    await cdp.detach();
  }
  await page.reload();
  await page.waitForFunction(() => window.velaReady);
  assert.ok(
    (
      await page.locator('.cm-scroller').evaluate((node) => getComputedStyle(node).fontFamily)
    ).includes(font),
  );
  console.log(
    'PASS selected installed font really renders in the editor and persists after reload',
  );

  await selectAppView(page, 'reader');
  await page.locator('[data-read=book]').click();
  await page.locator('.reader-content').waitFor();
  assert.ok(
    (
      await page.locator('.reader-content').evaluate((node) => getComputedStyle(node).fontFamily)
    ).includes(font),
  );
  await settings();
  await page.locator('[name=fontFamily]').selectOption('system-ui');
  await closeSettings(page);
  assert.equal(
    await page.locator('body').evaluate((node) => getComputedStyle(node).fontFamily),
    'system-ui, sans-serif',
  );
  console.log('PASS plain text reader shares the font and can return to the system font');

  await page.setViewportSize({ width: 390, height: 844 });
  await settings();
  await page.screenshot({ path: 'test-results/fonts/settings-mobile.png' });
  const rect = await page.locator('.font-settings').boundingBox();
  assert.ok(rect.width <= 390);
  await closeSettings(page);
  await page.evaluate(() => {
    window.queryLocalFonts = async () => {
      throw new Error('Permission denied');
    };
  });
  await settings();
  await page.locator('[data-font-list]').click();
  await page.waitForFunction(() => !document.querySelector('[data-font-list]').disabled);
  assert.ok(
    (await page.locator('.font-settings [role=status]').textContent()).includes('未能读取'),
  );
  await page.locator('[name=fontFamily]').selectOption('');
  await closeSettings(page);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--app-font-family')),
    '',
  );
  console.log(
    'PASS permission errors remain usable; mobile layout fits and Vela default can be restored',
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
