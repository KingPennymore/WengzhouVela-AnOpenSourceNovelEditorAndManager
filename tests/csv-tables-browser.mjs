import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';
import { selectAppView } from './navigation-helper.mjs';
import { parseCsv } from '../web/csv.mjs';

const text = '第一章 海风\n前面的正文。\n后面的正文。';
const seed = {
  version: 1,
  activeId: 'book',
  openIds: ['book', 'csv', 'tsv'],
  folders: ['书稿', '资料'],
  settings: { theme: 'light', richText: true, readingMode: 'scroll' },
  documents: [
    { id: 'book', name: '正文.txt', path: '书稿/正文.txt', text, updatedAt: 1 },
    {
      id: 'csv',
      name: '人物.csv',
      path: '资料/人物.csv',
      text: '姓名,备注\n林舟,"原始,备注"\n阿岚,港口',
      updatedAt: 2,
    },
    {
      id: 'tsv',
      name: '数据.tsv',
      path: '书稿/数据.tsv',
      text: '列一\t列二\n甲\t乙',
      updatedAt: 3,
    },
  ],
};
const server = await startSourceAppServer(),
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.WENZHOU_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
try {
  await mkdir('test-results/csv-tables', { recursive: true });
  for (const width of [320, 390, 1100]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(
      (seed) => {
        localStorage.setItem('vela.test.motion', 'off');
        if (!localStorage.getItem('wenzhou.workspace'))
          localStorage.setItem('wenzhou.workspace', JSON.stringify(seed));
      },
      { ...seed, settings: { ...seed.settings, theme: width === 390 ? 'dark' : 'light' } },
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('wenzhou.workspace')));
    const fits = async () =>
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'no page horizontal overflow',
      );
    const tab = async (id) => {
      await page.locator(`[data-tab="${id}"]`).click();
      await page
        .waitForFunction(
          (id) =>
            document.querySelector(`[data-tab="${id}"]`)?.getAttribute('aria-selected') === 'true',
          id,
        )
        .catch(async (error) => {
          console.error(errors, await page.locator('body').innerText());
          throw error;
        });
    };
    await page.goto(server.url);
    await openRecentFile(page, page.locator('[data-recent=book]'));
    await tab('csv');
    await page.locator('.csv-panel').waitFor();
    await fits();
    assert.equal(await page.locator('.csv-scroll tbody tr').count(), 3);
    const cell = page.locator('[data-cell-row="1"][data-cell-column="1"]');
    for (const selector of [
      '#format-style-label',
      '#csv-delimiter',
      '#csv-prev',
      '#display-options button',
    ])
      assert.equal(
        await page
          .locator(selector)
          .first()
          .evaluate((element) => getComputedStyle(element).fontSize),
        '12px',
      );
    assert.equal(
      await cell.evaluate((element) => getComputedStyle(element).fontSize),
      await page.locator('.cm-content').evaluate((element) => getComputedStyle(element).fontSize),
    );

    await cell.fill('初次修改');
    await page.locator('#csv-edit-cell').click();
    assert.match(await page.locator('#dialog-title').textContent(), /B2/);
    await page.locator('[name=value]').fill('多行,<script>\n第二行');
    await page.locator('#dialog-submit').click();
    await page.waitForSelector('#dialog[open]', { state: 'hidden' });
    assert.equal(
      parseCsv((await saved()).documents.find((doc) => doc.id === 'csv').text)[1][1],
      '多行,<script>\n第二行',
    );
    await page.locator('#quick-undo').click();
    assert.equal(
      await page.locator('[data-cell-row="1"][data-cell-column="1"]').inputValue(),
      '初次修改',
    );
    await page.locator('#quick-redo').click();
    assert.equal(
      await page.locator('[data-cell-row="1"][data-cell-column="1"]').inputValue(),
      '多行,<script>\n第二行',
    );
    await page.screenshot({ path: `test-results/csv-tables/editor-${width}.png` });
    await tab('tsv');
    assert.equal(await page.locator('.csv-scroll thead th').count(), 3);
    assert.equal(await page.locator('#csv-delimiter').inputValue(), '\t');
    await tab('book');
    await page.evaluate(() => velaEditorView.dispatch({ selection: { anchor: 10 } }));
    await page.locator('#format-table').click();
    await page.locator('[name=tableFile]').selectOption('资料/人物.csv');
    await page.locator('[name=tableCaption]').fill('人物关系');
    await page.locator('#dialog-submit').click();
    await page.waitForSelector('#dialog[open]', { state: 'hidden' });
    await page.locator('.vela-format-table table').waitFor();
    assert.equal(
      await page
        .locator('.vela-format-table table')
        .evaluate((element) => getComputedStyle(element).fontSize),
      await page.locator('.cm-content').evaluate((element) => getComputedStyle(element).fontSize),
    );
    assert.match(
      await page.locator('.vela-format-table table').textContent(),
      /人物关系.*林舟.*多行,<script>/s,
    );
    let state = await saved();
    assert.equal(state.documents.find((doc) => doc.id === 'book').text, text);
    const config = state.documents.find((doc) => doc.name === '.vela');
    assert.equal(
      JSON.parse(config.text).richText.documents['正文.txt'].inserts[0].src,
      '../资料/人物.csv',
    );
    await page.locator('[data-display=preview]').click();
    await page.locator('#preview .reader-format-table table').waitFor();
    assert.equal(
      await page.locator('#preview').evaluate((root) => root.textContent),
      text,
      'table text must not affect TXT search offsets',
    );
    await fits();
    await page.screenshot({ path: `test-results/csv-tables/txt-preview-${width}.png` });
    await selectAppView(page, 'reader');
    await page.locator('[data-read=book]').click();
    await page.locator('.reader-content .reader-format-table table').waitFor();
    assert.equal(await page.locator('.reader-content').evaluate((root) => root.textContent), text);
    await page.locator('#reader-back').click();
    await selectAppView(page, 'write');
    await page.locator('[data-display=source]').click();
    await page.locator('.vela-format-table button').click();
    await page.locator('[name=tableMode][value=new]').check();
    await page.locator('[name=tableName]').fill('新表.tsv');
    await page.locator('[name=tableRows]').fill('3');
    await page.locator('[name=tableColumns]').fill('2');
    await page.locator('[name=tableCaption]').fill('新建表格');
    await page.locator('#dialog-submit').click();
    await page.waitForSelector('#dialog[open]', { state: 'hidden' });
    state = await saved();
    let tableDoc = state.documents.find((doc) => doc.path === '书稿/新表.tsv');
    assert.ok(tableDoc);
    assert.equal(parseCsv(tableDoc.text, '\t').length, 3);
    assert.equal(state.documents.find((doc) => doc.id === 'book').text, text);
    await page.locator('.vela-format-table button').click();
    await page.locator('#table-open-source').click();
    await page.locator('[data-cell-row="1"][data-cell-column="0"]').fill('已更新的表格');
    await page.locator('#quick-save').click();
    await tab('book');
    await page.locator('.vela-format-table table').waitFor();
    assert.match(await page.locator('.vela-format-table table').textContent(), /已更新的表格/);
    // Export uses a static snapshot with no workspace file URL dependencies.
    await page.locator('#more-tools').click();
    await page.locator('#commands').click();
    await page.locator('#command-search').fill('导出全书为 HTML');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('.command-item').first().click();
    const download = await downloadEvent,
      html = await readFile(await download.path(), 'utf8');
    assert.match(html, /<table>.*已更新的表格/s);
    await page.reload();
    await openRecentFile(page, page.locator('[data-recent=book]'));
    await page.locator('.vela-format-table table').waitFor();
    assert.match(await page.locator('.vela-format-table table').textContent(), /已更新的表格/);
    await page.locator('.vela-format-table button').click();
    await page.locator('#table-remove').click();
    await page.waitForSelector('.vela-format-table', { state: 'detached' });
    state = await saved();
    assert.ok(state.documents.some((doc) => doc.id === tableDoc.id));
    assert.equal(state.documents.find((doc) => doc.id === 'book').text, text);
    if (width === 390) {
      await tab('csv');
      await page.locator('[data-display=source]').click();
      await page.evaluate(() =>
        velaEditorView.dispatch({
          changes: {
            from: 0,
            to: velaEditorView.state.doc.length,
            insert: Array.from({ length: 205 }, (_, r) =>
              Array.from({ length: 52 }, (_, c) => r + ':' + c).join(','),
            ).join('\n'),
          },
        }),
      );
      await page.locator('[data-display=preview]').click();
      assert.ok((await page.locator('[data-cell-row]').count()) <= 2000);
      await page.locator('#csv-next').click();
      assert.ok(await page.locator('[data-cell-row="40"][data-cell-column="0"]').isVisible());
      await page.locator('#csv-column-next').click();
      assert.equal(
        await page.locator('[data-cell-row="40"][data-cell-column="50"]').inputValue(),
        '40:50',
      );
      await page.locator('[data-cell-row="40"][data-cell-column="50"]').focus();
      await page.setViewportSize({ width, height: 440 });
      await page.evaluate(() => (document.body.dataset.keyboard = 'true'));
      assert.ok((await page.locator('.csv-scroll').boundingBox()).height >= 44);
      assert.ok(await page.locator('#csv-edit-cell').isVisible());
      await fits();
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => (document.body.dataset.keyboard = 'false'));
      // Missing data stays visible as a repairable placeholder without changing the TXT.
      await tab('book');
      await page.locator('#format-table').click();
      await page.locator('[name=tableFile]').selectOption('资料/人物.csv');
      await page.locator('#dialog-submit').click();
      await page.waitForSelector('#dialog[open]', { state: 'hidden' });
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('wenzhou.workspace'));
        state.documents = state.documents.filter((doc) => doc.id !== 'csv');
        localStorage.setItem('wenzhou.workspace', JSON.stringify(state));
      });
      await page.reload();
      await openRecentFile(page, page.locator('[data-recent=book]'));
      await page.locator('.vela-format-table .table-missing').waitFor();
      assert.match(await page.locator('.vela-format-table .table-missing').textContent(), /找不到/);
      assert.equal(await page.evaluate(() => velaEditorView.state.doc.toString()), text);
    }
    assert.deepEqual(errors, []);
    await fits();
    console.log(
      `PASS ${width}px CSV/TSV editing, mobile cell dialog, linked/new TXT tables, reading offsets, updates, reload, HTML export and safe removal`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
