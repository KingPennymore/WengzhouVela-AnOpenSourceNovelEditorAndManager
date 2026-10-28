import { setCsvZoom } from './csv-grid-helper.mjs';
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
    const saved = () => page.evaluate(() => { window.wenzhouSave(); return JSON.parse(localStorage.getItem('wenzhou.workspace')); });
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
    // Switching tabs keeps the editor viewport where it was, including after visiting another file.
    await page.evaluate((text) => {
      const view = velaEditorView;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '第一章 海风\n' + '　　段落。\n'.repeat(180) + '末尾。' } });
      view.dispatch({ selection: { anchor: view.state.doc.length - 2 }, scrollIntoView: true });
      view.focus();
    }, text);
    await page.waitForTimeout(80);
    const scrollBefore = await page.locator('.cm-scroller').evaluate((element) => element.scrollTop);
    assert.ok(scrollBefore > 100);
    await tab('csv');
    await tab('book');
    await page.waitForFunction((value) => Math.abs(document.querySelector('.cm-scroller').scrollTop - value) < 4, scrollBefore);
    await page.evaluate((text) => {
      const view = velaEditorView;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, text);
    await tab('csv');
    await page.locator('.csv-panel').waitFor();
    await fits();
    // The grid draws every cell of this small table and labels three rows and two columns.
    await page.locator('.csv-grid-cell').first().waitFor();
    assert.equal(await page.locator('.csv-toolbar').evaluate(bar => {
      const box = bar.getBoundingClientRect();
      return [...bar.querySelectorAll('.planning-primary>button,.csv-context,.planning-overflow')].every(element => {
        const rect = element.getBoundingClientRect();
        return rect.width === 0 || (rect.left >= box.left - 1 && rect.right <= box.right + 1);
      });
    }), true, 'toolbar controls stay inside the panel');
    assert.equal(await page.locator('#csv-actual,#csv-edit-cell').count(), 0);
    assert.equal(await page.locator('#csv-fit svg path').getAttribute('d'), 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5');
    // The source editor is reached from the top display switch, not from the table's more menu.
    await page.locator('#csv-tools').click();
    assert.equal(await page.locator('.planning-menu #csv-source').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.csv-row-heading').count(), 3);
    assert.equal(await page.locator('.csv-column-heading').count(), 2);
    // Row numbers count rows inside the table, so a header row does not make the first data row "2".
    await page.locator('#csv-header').click();
    await page.waitForFunction(() => document.querySelector('.csv-row-heading')?.textContent === '1');
    assert.equal(await page.locator('.csv-column-heading').first().textContent(), '姓名');
    await page.locator('#csv-header').click();
    await page.waitForFunction(() => document.querySelector('.csv-row-heading')?.textContent === '1');
    // Source mode is not a table preview: the CSV editing bar must disappear with the grid.
    await page.locator('[data-display=source]').click();
    await page.waitForFunction(() => !document.querySelector('.csv-bottom-actions'));
    assert.equal(await page.locator('#editor').isVisible(), true);
    await page.locator('[data-display=preview]').click();
    await page.locator('.csv-grid-cell').first().waitFor();
    const cell = page.locator('[data-cell-row="1"][data-cell-column="1"]');
    const cellText = () => page.locator('[data-cell-row="1"][data-cell-column="1"]').textContent();
    // Edit: select a cell, open the editor (a bottom sheet on phones), commit; it lands in the document history.
    const edit = async (target, value) => {
      await target.click();
      await page.keyboard.press('Enter');
      await page.locator('#csv-input').fill(value);
      await page.locator('#csv-commit').click();
      await page.locator('.csv-editor-layer').waitFor({ state: 'hidden' });
    };
    assert.equal(await page.locator('#csv-cell-reference').textContent(), '选择单元格');
    await edit(cell, '初次修改');
    assert.equal(await page.locator('#csv-cell-reference').textContent(), 'B2');
    await edit(cell, '多行,<script>\n第二行');
    assert.equal(
      parseCsv((await saved()).documents.find((doc) => doc.id === 'csv').text)[1][1],
      '多行,<script>\n第二行',
    );
    await page.locator('#quick-undo').click();
    await page.waitForFunction(() => document.querySelector('[data-cell-row="1"][data-cell-column="1"]')?.textContent === '初次修改');
    await page.locator('#quick-redo').click();
    await page.waitForFunction(() => document.querySelector('[data-cell-row="1"][data-cell-column="1"]')?.textContent === '多行,<script>\n第二行');
    assert.equal(await cellText(), '多行,<script>\n第二行');
    // The context menu exposes row and column moves, not only insert/delete.
    await cell.click({ button: 'right' });
    assert.equal(await page.locator('.csv-context-menu button', { hasText: '下移行' }).isVisible(), true);
    assert.equal(await page.locator('.csv-context-menu button', { hasText: '右移列' }).isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('.csv-context-menu').waitFor({ state: 'detached' });
    await page.screenshot({ path: `test-results/csv-tables/editor-${width}.png` });
    // The column names and row numbers are part of the table surface: dragging one moves both axes.
    const columnBefore = await page.locator('.csv-column-heading').first().boundingBox();
    const rowBefore = await page.locator('.csv-row-heading').first().boundingBox();
    await page.mouse.move(columnBefore.x + columnBefore.width / 2, columnBefore.y + columnBefore.height / 2);
    await page.mouse.down();
    await page.mouse.move(columnBefore.x + columnBefore.width / 2 + 36, columnBefore.y + columnBefore.height / 2 + 24, { steps: 6 });
    await page.mouse.up();
    const columnAfter = await page.locator('.csv-column-heading').first().boundingBox();
    const rowAfter = await page.locator('.csv-row-heading').first().boundingBox();
    assert.ok(columnAfter.x > columnBefore.x + 10 && columnAfter.y > columnBefore.y + 5, 'column headers move with the table');
    assert.ok(rowAfter.x > rowBefore.x + 10 && rowAfter.y > rowBefore.y + 5, 'row numbers move with the table');
    await tab('tsv');
    await page.locator('.csv-grid-cell').first().waitFor();
    assert.equal(await page.locator('.csv-column-heading').count(), 2);
    assert.equal(await page.locator('#csv-delimiter').inputValue(), '\t');
    await tab('book');
    await page.evaluate(() => velaEditorView.dispatch({ selection: { anchor: 10 } }));
    await page.locator('#format-table').click();
    await page.locator('[name=tableFile]').selectOption('资料/人物.csv');
    await page.locator('[name=tableCaption]').fill('人物关系');
    await page.locator('#dialog-submit').click();
    await page.waitForSelector('#dialog[open]', { state: 'hidden' });
    await page.locator('.vela-format-table table').waitFor();
    const tableView = page.locator('.vela-format-table table');
    const tableFont = parseFloat(await tableView.evaluate((element) => getComputedStyle(element).fontSize));
    assert.ok(tableFont >= 8 && tableFont <= 16, 'embedded table type size is bounded');
    const tableBox = await tableView.boundingBox(), hostBox = await page.locator('.vela-format-table').boundingBox();
    assert.ok(tableBox.width <= hostBox.width + 1, 'embedded table fits the text column');
    // The table has its own type size: raising the manuscript size must not change it.
    await page.locator('.cm-content').evaluate((element) => { element.style.fontSize = '24px'; });
    assert.equal(parseFloat(await tableView.evaluate((element) => getComputedStyle(element).fontSize)), tableFont, 'embedded table ignores manuscript type size');
    await page.locator('.cm-content').evaluate((element) => { element.style.fontSize = ''; });
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
    await page.locator('[name=tableRows]').fill('40');
    await page.locator('[name=tableColumns]').fill('2');
    await page.locator('[name=tableCaption]').fill('新建表格');
    await page.locator('#dialog-submit').click();
    await page.waitForSelector('#dialog[open]', { state: 'hidden' });
    state = await saved();
    let tableDoc = state.documents.find((doc) => doc.path === '书稿/新表.tsv');
    assert.ok(tableDoc);
    assert.equal(parseCsv(tableDoc.text, '\t').length, 40);
    assert.equal(state.documents.find((doc) => doc.id === 'book').text, text);
    await page.locator('.vela-format-table button').click();
    await page.locator('#table-open-source').click();
    await page.locator('.csv-grid-cell').first().waitFor();
    await edit(page.locator('[data-cell-row="1"][data-cell-column="0"]'), '已更新的表格');
    await page.locator('#quick-save').click();
    await tab('book');
    await page.locator('.vela-format-table table').waitFor();
    assert.match(await page.locator('.vela-format-table table').textContent(), /已更新的表格/);
    // A long embedded table grows to its content and lets the reading page scroll over it.
    await selectAppView(page, 'reader');
    await page.locator('[data-read=book]').click();
    const embedTable = page.locator('.reader-content .reader-format-table table').last();
    await embedTable.waitFor();
    const embedHeight = (await embedTable.boundingBox()).height;
    assert.ok(embedHeight > 320, `embedded table grows with its rows (${embedHeight})`);
    const embeddedScroll = await page.locator('.reader-content .reader-format-table').last().evaluate((host) => {
      const area = host.shadowRoot.querySelector('.scroll');
      return { client: area.clientHeight, scroll: area.scrollHeight, overflow: getComputedStyle(area).overflowY };
    });
    assert.equal(embeddedScroll.overflow, 'visible');
    assert.equal(embeddedScroll.scroll, embeddedScroll.client);
    // In scroll reading mode the page, not the table, owns vertical scrolling; paged mode uses page turns.
    if (!(await page.locator('#reader-view').evaluate((element) => element.classList.contains('reader-paged')))) {
      await embedTable.hover({ position: { x: 20, y: 20 } });
      const readerBefore = await page.locator('.reader-viewport').evaluate((element) => element.scrollTop);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction((before) => document.querySelector('.reader-viewport').scrollTop > before, readerBefore);
    }
    await page.locator('#reader-back').click();
    await selectAppView(page, 'write');
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
      // A large table opens fitted, drawn as an overview; at 100% only the visible part of the grid is in the DOM.
      await setCsvZoom(page);
      await page.locator('.csv-grid-cell').first().waitFor();
      const pinVisible = () => page.evaluate(() => [...document.querySelectorAll('.csv-row-pin .csv-row-heading')].some((element) => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; }));
      if (!(await pinVisible())) {
        const firstHeading = await page.locator('.csv-column-heading').first().boundingBox();
        await page.mouse.move(firstHeading.x + firstHeading.width / 2, firstHeading.y + firstHeading.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstHeading.x + firstHeading.width / 2 - 140, firstHeading.y + firstHeading.height / 2, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForFunction(() => [...document.querySelectorAll('.csv-row-pin .csv-row-heading')].some((element) => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; }));
      assert.ok((await page.locator('.csv-grid-cell').count()) <= 2000);
      // Typing selects the first match and reveals it (Enter would move on to the next one).
      await page.locator('#csv-find').click();
      await page.locator('#csv-search').fill('40:50');
      await page.waitForFunction(() => document.querySelector('#csv-cell-reference')?.textContent === 'AY41');
      assert.equal(await page.locator('[data-cell-row="40"][data-cell-column="50"]').textContent(), '40:50');
      await page.setViewportSize({ width, height: 440 });
      await page.evaluate(() => (document.body.dataset.keyboard = 'true'));
      assert.ok((await page.locator('.csv-grid-mount').boundingBox()).height >= 44);
      assert.ok(await page.locator('#csv-delete-row').isVisible());
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
      `PASS ${width}px CSV/TSV grid editing, find in large tables, linked/new TXT tables, reading offsets, updates, reload, HTML export and safe removal`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
