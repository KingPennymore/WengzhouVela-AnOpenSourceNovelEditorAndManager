import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openRecentFile } from './start-page-helper.mjs';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'vela-csv-native-'));
const env = { ...process.env, VELA_QA: '1', VELA_QA_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: path.resolve('windows/node_modules/electron/dist/electron.exe'),
  args: [path.resolve('windows')],
  env,
});
try {
  await application.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
  });
  const page = await application.firstWindow(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => window.velaReady);
  await page.keyboard.press('Control+n');
  await page.locator('#dialog [name=name]').fill('CSV正文测试.txt');
  await page.locator('#dialog-submit').click();
  await page.evaluate(() =>
    velaEditorView.dispatch({
      changes: { from: 0, to: velaEditorView.state.doc.length, insert: '第一章\n正文。' },
    }),
  );
  await page.locator('#more-tools').click();
  await page.locator('#settings').click();
  await page.locator('[name=richText]').check();
  await page.locator('#dialog-submit').click();
  let state = JSON.parse(await page.evaluate(() => WenzhouNative.readWorkspace()));
  const book = state.documents.find((doc) => doc.name === 'CSV正文测试.txt');
  await page.locator('#format-table').click();
  await page.locator('[name=tableMode][value=new]').check();
  await page.locator('[name=tableName]').fill('已有.csv');
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  await page.locator('.vela-format-table table').waitFor();
  await page.locator('.vela-format-table button').click();
  await page.locator('#table-open-source').click();
  await page.locator('[data-cell-row="1"][data-cell-column="0"]').fill('林舟');
  await page.locator('#quick-save').click();
  await page.locator(`[data-tab="${book.id}"]`).click();
  await page.locator('.vela-format-table table').waitFor();
  assert.match(await page.locator('.vela-format-table table').textContent(), /林舟/);
  await page.locator('.vela-format-table button').click();
  await page.locator('[name=tableFile]').selectOption('已有.csv');
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  await page.locator('.vela-format-table button').click();
  await page.locator('[name=tableMode][value=new]').check();
  await page.locator('[name=tableName]').fill('新建.tsv');
  await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog[open]', { state: 'hidden' });
  const root = path.join(data, 'workspaces', 'Vela');
  assert.equal(await fs.readFile(path.join(root, 'CSV正文测试.txt'), 'utf8'), '第一章\n正文。');
  assert.match(await fs.readFile(path.join(root, '新建.tsv'), 'utf8'), /列1\t列2/);
  const config = JSON.parse(await fs.readFile(path.join(root, '.vela'), 'utf8'));
  assert.equal(config.richText.documents['CSV正文测试.txt'].inserts[0].src, '新建.tsv');
  await page.reload();
  await page.waitForFunction(() => window.velaReady);
  if (await page.locator('#start-page').isVisible())
    await openRecentFile(page, page.locator(`[data-recent="${book.id}"]`));
  await page.locator('.vela-format-table table').waitFor();
  await page.locator('.vela-format-table button').click();
  await page.locator('#table-remove').click();
  await page.waitForSelector('.vela-format-table', { state: 'detached' });
  await fs.access(path.join(root, '新建.tsv'));
  assert.equal(await fs.readFile(path.join(root, 'CSV正文测试.txt'), 'utf8'), '第一章\n正文。');
  assert.deepEqual(errors, []);
  console.log(
    'PASS native TXT/CSV reads, new TSV and .vela persistence, reload and safe reference removal',
  );
} finally {
  try {
    await application.evaluate(({ app }) => app.exit(0));
  } catch {}
  await application.close().catch(() => {});
  await fs.rm(data, { recursive: true, force: true });
}
