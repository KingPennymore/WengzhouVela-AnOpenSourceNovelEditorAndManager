import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openRecentFile } from './start-page-helper.mjs';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'vela-files-trash-'));
const env = { ...process.env, VELA_QA: '1', VELA_QA_DATA: data };delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ executablePath: path.resolve('windows/node_modules/electron/dist/electron.exe'), args: [path.resolve('windows')], env });
try {
  await application.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.hide(); });
  const page = await application.firstWindow(), errors = [];
  page.on('pageerror', error => errors.push(error.message));await page.waitForFunction(() => window.velaReady);
  await page.evaluate(() => {
    const value = JSON.parse(WenzhouNative.readWorkspace());
    value.documents = [{ id: 'book', name: '正文.txt', path: '正文.txt', text: '正文', updatedAt: 1, remote: null }, { id: 'other', name: '资料.txt', path: '资料.txt', text: '资料', updatedAt: 1, remote: null }, { id: 'spare', name: '笔记.txt', path: '笔记.txt', text: '笔记', updatedAt: 1, remote: null }];
    value.activeId = 'book';value.openIds = ['book', 'other', 'spare'];value.settings.updateChecks = false;
    WenzhouNative.writeWorkspace(JSON.stringify(value));localStorage.setItem('vela.test.motion', 'off');
  });
  await page.reload();await page.waitForFunction(() => window.velaReady);
  await openRecentFile(page, page.locator('[data-recent=book]'));
  await page.evaluate(() => { window.keptEditor = velaEditorView; });
  const sidebar = async () => { if (await page.locator('#library').isHidden()) await page.locator('#mobile-library').click(); };
  const stable = async id => { assert.equal(await page.locator('#start-page').isHidden(), true);assert.equal(await page.evaluate(() => velaEditorView === window.keptEditor), true);assert.equal(await page.locator(`[data-tab="${id}"]`).getAttribute('aria-selected'), 'true'); };
  await sidebar();await page.locator('#open-trash').click();await page.locator('.trash-empty').waitFor();await stable('book');await page.locator('#dialog-cancel').click();
  await page.locator('#refresh-folder').click();await page.waitForFunction(() => document.querySelector('#toast')?.textContent === '工作区已刷新');await stable('book');
  for (const id of ['other', 'book']) {
    await sidebar();await page.locator(`[data-menu="${id}"]`).click();await page.locator('#delete-doc').click();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({ state: 'hidden' });
    if (id === 'other') await stable('book');
  }
  await page.waitForFunction(() => document.querySelector('[data-tab=spare]')?.getAttribute('aria-selected') === 'true');
  await page.evaluate(() => { window.keptEditor = velaEditorView; });
  await sidebar();await page.locator('#open-trash').click();await page.locator('.trash-item').first().waitFor();
  await page.locator('#trash-select-all').check();await page.locator('#trash-restore-selected').click();await page.locator('.trash-empty').waitFor();await stable('spare');
  assert.deepEqual(errors, []);
  assert.equal(await fs.readFile(path.join(data, 'workspaces', 'Vela', '正文.txt'), 'utf8'), '正文');
  console.log('PASS Windows native refresh, trash, delete, fallback tab and batch restore preserve the editor');
} finally {
  await application.evaluate(({ app }) => app.exit(0)).catch(() => {});await application.close().catch(() => {});
  assert.equal(path.dirname(data), os.tmpdir());assert.ok(path.basename(data).startsWith('vela-files-trash-'));
  await fs.rm(data, { recursive: true, force: true });
}
