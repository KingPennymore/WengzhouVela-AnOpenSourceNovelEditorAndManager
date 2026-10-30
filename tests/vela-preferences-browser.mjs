import assert from 'node:assert/strict';
import { startSourceAppServer } from '../tests/source-app-server.mjs';
import { launchBrowser } from '../tests/browser-launch.mjs';
const server = await startSourceAppServer(),
  browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() =>
    localStorage.setItem(
      'wenzhou.workspace',
      JSON.stringify({
        version: 1,
        activeId: 'b',
        openIds: ['b', 'c'],
        settings: { autoNouns: true, novelLineNumbers: false },
        documents: [
          {
            id: 'c',
            name: '.vela',
            path: 'Book/.vela',
            text: JSON.stringify({
              version: 2,
              kind: 'workspace',
              id: 'p',
              project: { name: 'Book' },
              editor: { lineNumbers: true, marginLeft: 8, marginRight: 20, fontFamily: 'serif' },
              chapters: { countMode: 'letters', includeHeading: false },
            }),
            updatedAt: 1,
          },
          { id: 'b', name: 'a.txt', path: 'Book/a.txt', text: 'hello!\nworld?', updatedAt: 1 },
        ],
      }),
    ),
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url + '/?ui=android');
  await page.waitForFunction(() => window.velaReady);
  await page.locator('[data-recent=b]').click();
  await page.locator('.vela-numbered-line').first().waitFor();
  const initial = await page.evaluate(() => ({
    padding: [
      getComputedStyle(velaEditorView.contentDOM).paddingLeft,
      getComputedStyle(velaEditorView.contentDOM).paddingRight,
    ],
    font: getComputedStyle(velaEditorView.scrollDOM).fontFamily,
    numbers: document.querySelectorAll('.vela-numbered-line').length,
    stats: document.querySelector('#word-count').textContent,
  }));
  assert.deepEqual(initial.padding, ['8px', '20px']);
  assert.equal(initial.numbers, 2);
  assert.match(initial.font, /serif/);
  assert.match(initial.stats, /10/);
  await page.locator('.cm-content').focus();
  await page.keyboard.type('x');
  await page.locator('[data-tab=c]').click();
  await page.locator('[data-display=source]').evaluate((el) => el.click());
  await page.waitForFunction(() => velaEditorView.state.doc.toString().startsWith('{'));
  await page.evaluate(() => {
    const v = velaEditorView,
      c = JSON.parse(v.state.doc.toString());
    c.editor.marginLeft = 16;
    c.editor.marginRight = 24;
    c.editor.lineNumbers = false;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: JSON.stringify(c) } });
  });
  await page.locator('[data-tab=b]').click();
  await page.waitForTimeout(150);
  const updated = await page.evaluate(() => ({
    padding: [
      getComputedStyle(velaEditorView.contentDOM).paddingLeft,
      getComputedStyle(velaEditorView.contentDOM).paddingRight,
    ],
    numbers: document.querySelectorAll('.vela-numbered-line').length,
    text: velaEditorView.state.doc.toString(),
  }));
  assert.deepEqual(updated.padding, ['16px', '24px']);
  assert.equal(updated.numbers, 0);
  assert.equal(updated.text, 'xhello!\nworld?');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => velaEditorView.state.doc.toString()), 'hello!\nworld?');
  assert.deepEqual(errors, []);
  console.log(
    'PASS project appearance, counts, cached state reconfiguration and undo preservation',
  );
} finally {
  await browser.close();
  await server.close();
}
