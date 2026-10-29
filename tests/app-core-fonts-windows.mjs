import { closeSettings } from './settings-helper.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';

await fs.promises.mkdir('test-results/fonts', { recursive: true });
const data = fs.mkdtempSync(path.resolve('test-results/fonts/windows-'));
const env = { ...process.env, VELA_QA: '1', VELA_QA_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: path.resolve('windows/node_modules/electron/dist/electron.exe'),
  args: [path.resolve('windows/main.mjs')],
  env,
});
try {
  const page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => window.velaReady);
  const result = await page.evaluate(async () =>
    JSON.parse(await window.WenzhouNative.call('listSystemFonts', '{}')),
  );
  assert.equal(result.ok, true);
  assert.ok(result.value.length > 0);
  await page.locator('#more-tools').click();
  await page.locator('#settings').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[name=fontFamily]').options.length > 2 &&
      !document.querySelector('[data-font-list]').disabled,
  );
  const font = result.value.includes('Consolas') ? 'Consolas' : result.value[0];
  await page.locator('[name=fontFamily]').selectOption(font);
  await closeSettings(page);
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  assert.ok(
    (await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily)).includes(
      font,
    ),
  );
  const saved = await page.evaluate(() => JSON.parse(window.WenzhouNative.readWorkspace()));
  assert.equal(saved.settings.fontFamily, font);
  await page.reload();
  await page.waitForFunction(() => window.velaReady);
  assert.ok(
    (await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily)).includes(
      font,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS Windows native font list (${result.value.length} families), selection, save and reload`,
  );
} finally {
  await application.close();
}
