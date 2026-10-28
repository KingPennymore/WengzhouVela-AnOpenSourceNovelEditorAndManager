import { launchBrowser } from './browser-launch.mjs';
import { setCsvZoom } from './csv-grid-helper.mjs';
import assert from 'node:assert/strict';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';

const server = await startSourceAppServer();
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('vela.test.motion', 'off');
    localStorage.setItem('wenzhou.workspace', JSON.stringify({ version: 1, activeId: 'csv', openIds: ['csv'], settings: {}, documents: [{ id: 'csv', name: '回归.csv', path: '回归.csv', text: 'alpha,beta\nfoo,bar\nabc,xyz', updatedAt: 1 }] }));
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await openRecentFile(page, page.locator('[data-recent=csv]'));
  await page.locator('.csv-grid-cell').first().waitFor();

  assert.equal(await page.locator('#csv-actual,#csv-edit-cell').count(), 0);
  assert.equal(await page.locator('#csv-delete-row').isDisabled(), true);
  assert.deepEqual(await page.locator('.csv-bottom-actions button').evaluateAll(buttons => buttons.map(b => b.id)), ['csv-add-row','csv-add-column','csv-delete-row','csv-delete-column','csv-fit','csv-zoom-out','csv-zoom','csv-zoom-in']);
  assert.equal(await page.locator('#csv-fit svg path').getAttribute('d'), 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5');
  await page.locator('[data-csv-row="1"]').first().click();
  await page.locator('#csv-delete-row').click();
  await page.waitForFunction(() => velaEditorView.state.doc.toString() === 'alpha,beta\nabc,xyz');
  await page.locator('.csv-plane').focus(); await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.csv-grid-host')?.getAttribute('aria-rowcount') === '3');
  await page.locator('[data-csv-column="1"]').click();
  await page.locator('#csv-delete-column').click();
  await page.waitForFunction(() => velaEditorView.state.doc.toString() === 'alpha\nfoo\nabc');
  await page.locator('.csv-plane').focus(); await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.csv-grid-host')?.getAttribute('aria-colcount') === '2');

  // Typing through partial matches must leave focus in the search box, including filtered searches.
  const original = await page.evaluate(() => velaEditorView.state.doc.toString());
  await page.locator('#csv-find').click();
  await page.locator('#csv-search').pressSequentially('alpha');
  assert.equal(await page.locator('#csv-search').inputValue(), 'alpha');
  assert.equal(await page.locator('#csv-search').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.csv-editor-layer').isHidden(), true);
  await page.locator('#csv-filter').check();
  await page.locator('#csv-search').fill('');
  await page.locator('#csv-search').pressSequentially('foo');
  assert.equal(await page.locator('#csv-search').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => velaEditorView.state.doc.toString()), original);
  await page.locator('#csv-find-close').click();

  await page.locator('[data-display=source]').click();
  await page.evaluate(() => velaEditorView.dispatch({ changes: { from: 0, to: velaEditorView.state.doc.length, insert: 'h1,h2\n' + Array.from({ length: 5000 }, (_, r) => r + ',' + 'x'.repeat(60)).join('\n') } }));
  await page.locator('[data-display=preview]').click();
  await page.locator('.csv-grid-cell').first().waitFor();
  await setCsvZoom(page);
  await page.locator('[data-cell-row="1"][data-cell-column="0"]').click();
  for (const [key, value, reference] of [['Tab', 'changed', 'B2'], ['Shift+Tab', 'note', 'A2'], ['Enter', 'second', 'A3']]) {
    await page.keyboard.press('Enter');
    await page.locator('#csv-input').fill(value);
    await page.locator('#csv-input').press(key);
    await page.waitForFunction(reference => document.querySelector('#csv-cell-reference')?.textContent === reference, reference);
    assert.equal(await page.locator('.csv-plane').evaluate(el => document.activeElement === el), true);
  }
  assert.match(await page.evaluate(() => velaEditorView.state.doc.toString()), /second,note/);

  // A value commit keeps the plane and toolbar mounted and reparses no full document.
  await page.evaluate(() => {
    window.csvPlaneBefore = document.querySelector('.csv-plane'); window.csvWorkerCalls = 0;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(value, ...rest) { if (value?.source && value?.delimiter) window.csvWorkerCalls++; return send.call(this, value, ...rest); };
  });
  await page.keyboard.press('Enter');await page.locator('#csv-input').fill('local edit');
  const editedAt = Date.now();await page.locator('#csv-commit').click();
  await page.waitForFunction(() => document.querySelector('[data-cell-row="2"][data-cell-column="0"]')?.textContent === 'local edit');
  assert.equal(await page.evaluate(() => window.csvWorkerCalls), 0);
  assert.equal(await page.evaluate(() => document.querySelector('.csv-plane') === window.csvPlaneBefore), true);
  console.log('CSV value commit, 5,001 rows:', Date.now() - editedAt, 'ms');
  await page.locator('[data-csv-row="1"]').first().click();await page.locator('#csv-add-row').click();
  await page.waitForFunction(() => document.querySelector('.csv-grid-host')?.getAttribute('aria-rowcount') === '5002');
  assert.match(await page.evaluate(() => velaEditorView.state.doc.toString()), /second,note\n,\nlocal edit/);
  await page.locator('[data-csv-column="0"]').click();await page.locator('#csv-add-column').click();
  await page.waitForFunction(() => document.querySelector('.csv-grid-host')?.getAttribute('aria-colcount') === '3');
  assert.match(await page.evaluate(() => velaEditorView.state.doc.toString()), /second,,note/);
  assert.equal(await page.evaluate(() => document.querySelector('.csv-plane') === window.csvPlaneBefore), true);
  for (const id of ['add-row','add-column','delete-row','delete-column','fit','zoom-in','zoom-out']) assert.equal(await page.locator('#csv-'+id+' svg path').count(),1);
  await page.locator('#csv-find').click();await page.locator('#csv-search').fill('local edit');await page.locator('#csv-find-close').click();

  // Sample the very next rendered frame while the wheel gesture is still active.
  const sample = await page.locator('.csv-plane').evaluate(async el => {
    const visible = () => { const bounds = el.getBoundingClientRect(); return [...el.querySelectorAll('[data-cell-row]')].filter(cell => { const rect = cell.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right; }).length; };
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1800 }));
    await new Promise(resolve => requestAnimationFrame(resolve));
    return { visible: visible(), mounted: el.querySelectorAll('[data-cell-row]').length, rows: [...el.querySelectorAll('[data-cell-row]')].map(cell => Number(cell.dataset.cellRow)) };
  });
  assert.ok(sample.visible > 0, 'virtual rows are replenished during the gesture');
  assert.ok(sample.rows.some(row => row > 30));
  assert.ok(sample.mounted < 2000);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS CSV search focus, asynchronous Tab/Shift+Tab/Enter and live pan virtualization');
} finally {
  await browser.close();
  await server.close();
}
