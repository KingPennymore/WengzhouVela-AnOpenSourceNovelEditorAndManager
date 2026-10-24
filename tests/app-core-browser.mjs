import assert from 'node:assert/strict';
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
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    colorScheme: 'light',
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('vela.test.motion', 'off');
    if (!localStorage.getItem('wenzhou.workspace')) {
      localStorage.setItem(
        'wenzhou.workspace',
        JSON.stringify({
          version: 1,
          activeId: 'book',
          openIds: ['book'],
          settings: { theme: 'system' },
          documents: [{ id: 'book', name: '操作指南.txt', text: '第一章\n正文', updatedAt: 1 }],
        }),
      );
    }
  });
  await page.goto(server.url);
  await page.waitForFunction(() => window.velaReady && window.velaEditorView);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('wenzhouEnvironment', {
        detail: {
          platform: 'windows',
          dark: true,
          top: 8,
          bottom: 20,
          left: -1,
          right: 4,
        },
      }),
    ),
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      platform: document.body.dataset.platform,
      dark: document.body.classList.contains('dark'),
      top: document.documentElement.style.getPropertyValue('--safe-top'),
      left: document.documentElement.style.getPropertyValue('--safe-left'),
      bottom: document.documentElement.style.getPropertyValue('--safe-bottom'),
    })),
    { platform: 'windows', dark: true, top: '8px', left: '0px', bottom: '20px' },
  );
  console.log('PASS live platform environment updates system theme and safe areas');

  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Alt+t');
  assert.equal(
    await page.locator('body').evaluate((body) => body.classList.contains('dark')),
    false,
  );
  await page.evaluate(() => {
    const field = document.createElement('div');
    field.id = 'plugin-editable-probe';
    field.contentEditable = 'true';
    field.textContent = '插件文稿';
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.press('Control+Alt+t');
  assert.equal(
    await page.locator('body').evaluate((body) => body.classList.contains('dark')),
    false,
  );
  await page.locator('#plugin-editable-probe').evaluate((field) => field.remove());
  console.log('PASS editor shortcuts work while other editable surfaces retain their keys');

  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n快捷键保存');
  await page.keyboard.press('Control+s');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wenzhou.workspace')));
  assert.ok(saved.documents[0].text.endsWith('快捷键保存'));
  await page.keyboard.insertText('\n离开页面保存');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.ok(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wenzhou.workspace')).documents[0].text.endsWith(
        '离开页面保存',
      ),
    ),
  );
  assert.equal(await page.evaluate(() => window.wenzhouSave()), true);
  console.log('PASS shortcuts, pagehide and native callback share persistence protection');

  const corrupt = await browser.newPage();
  await corrupt.addInitScript(() => localStorage.setItem('wenzhou.workspace', '{broken'));
  await corrupt.goto(server.url);
  await corrupt.locator('#recover-data').waitFor();
  assert.equal(await corrupt.evaluate(() => window.wenzhouSave()), false);
  assert.equal(await corrupt.evaluate(() => localStorage.getItem('wenzhou.workspace')), '{broken');
  console.log('PASS corrupt startup exposes recovery without overwriting the original data');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
