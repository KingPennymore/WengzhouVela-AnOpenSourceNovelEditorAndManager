import { launchBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';

const server = await startSourceAppServer(), browser = await launchBrowser();
try {
  await mkdir('test-results/trash', { recursive: true });
  for (const width of [390, 1100]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(width => {
      localStorage.setItem('vela.test.motion', 'off');
      localStorage.setItem('wenzhou.workspace', JSON.stringify({ version: 1, activeId: 'book', openIds: ['book', 'other', 'spare'], settings: { theme: width === 390 ? 'dark' : 'light' }, documents: [{ id: 'book', name: '正文.txt', text: '正文原文', updatedAt: 1 }, { id: 'other', name: '资料.txt', text: '资料原文', updatedAt: 1 }, { id: 'spare', name: '笔记.txt', text: '笔记原文', updatedAt: 1 }] }));
    }, width);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url);await openRecentFile(page, page.locator('[data-recent=book]'));
    await page.evaluate(() => { velaEditorView.dispatch({ changes: { from: 0, insert: '新增内容' } }); window.keptEditor = velaEditorView; });
    const saved = () => page.evaluate(() => { window.wenzhouSave(); return JSON.parse(localStorage.getItem('wenzhou.workspace')); });
    const sidebar = async () => { if (await page.locator('#library').isHidden()) await page.locator('#mobile-library').click(); };
    const unchanged = async id => {
      assert.equal((await saved()).activeId, id);assert.equal(await page.locator('#start-page').isHidden(), true);
      assert.equal(await page.evaluate(() => velaEditorView === window.keptEditor), true);
    };
    const remove = async id => {
      await sidebar();await page.locator(`[data-menu="${id}"]`).click();await page.locator('#delete-doc').click();await page.locator('#dialog-submit').click();
      await page.waitForFunction(id => !JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc => doc.id === id), id);
      await page.locator('#dialog').waitFor({ state: 'hidden' });
    };
    await sidebar();await page.locator('#open-trash').click();await page.locator('.trash-manager').waitFor();
    await unchanged('book');await page.locator('#dialog-cancel').click();
    await page.locator('#refresh-folder').click();await unchanged('book');
    await remove('other');await unchanged('book');
    // Removing the current file opens the nearest remaining tab instead of the start page.
    await remove('book');await page.waitForFunction(() => document.querySelector('[data-tab=spare]')?.getAttribute('aria-selected') === 'true');
    await page.evaluate(() => { window.keptEditor = velaEditorView; });
    await sidebar();await page.locator('#open-trash').click();await page.locator('.trash-item').first().waitFor();
    assert.equal(await page.locator('.trash-item').count(), 2);
    await page.locator('#trash-search').fill('资料');assert.equal(await page.locator('.trash-item').count(), 1);
    await page.locator('#trash-select-all').check();assert.match(await page.locator('#trash-selected-count').textContent(), /1/);
    await page.locator('#trash-search').fill('');await page.locator('#trash-select-all').check();
    assert.match(await page.locator('#trash-selected-count').textContent(), /2/);
    await page.screenshot({ path: `test-results/trash/trash-${width}.png` });
    assert.equal(await page.locator('.trash-manager').evaluate(root => root.scrollWidth <= root.clientWidth + 1), true);
    await page.locator('#trash-restore-selected').click();await page.locator('.trash-empty').waitFor();
    let workspace = await saved();assert.equal(workspace.documents.find(doc => doc.id === 'book').text, '新增内容正文原文');
    await unchanged('spare');await page.locator('#dialog-cancel').click();
    await remove('other');await remove('book');
    await sidebar();await page.locator('#open-trash').click();await page.locator('.trash-item').first().waitFor();
    await page.locator('#trash-select-all').check();await page.locator('#trash-delete-selected').click();
    assert.equal((await saved()).trash.length, 2);
    await page.locator('#trash-confirm-cancel').click();assert.equal((await saved()).trash.length, 2);
    await page.locator('#trash-delete-selected').click();await page.locator('#trash-confirm-delete').click();await page.locator('.trash-empty').waitFor();
    await unchanged('spare');assert.equal((await saved()).trash.length, 0);
    assert.deepEqual(errors, []);
    await context.close();console.log(`PASS ${width}px trash search, selection, batch restore/delete and preserved editor`);
  }
} finally { await browser.close();await server.close(); }
