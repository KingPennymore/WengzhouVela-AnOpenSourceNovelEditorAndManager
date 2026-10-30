import { closeSettings } from './settings-helper.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';
import { settled } from './wait-helpers.mjs';
const server = await startSourceAppServer(),
  browser = await launchBrowser();
await mkdir('test-results/ai-workflows', { recursive: true });
const text = '第一章 机密\n此章不应整理。\n\n第二章 相遇\n林舟在港口遇到阿远。远处是灯塔。';
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      hasTouch: width < 600,
      isMobile: width < 600,
    });
    await context.addInitScript(
      ({ text }) => {
        localStorage.setItem(
          'wenzhou.workspace',
          JSON.stringify({
            version: 1,
            documents: [{ id: 'book', name: '航程.txt', path: '航程.txt', text, updatedAt: 1 }],
            openIds: [],
            activeId: null,
            settings: {
              theme: 'light',
              ai: {
                enabled: true,
                consented: true,
                provider: 'custom',
                format: 'openai',
                endpoint: 'https://mock-ai.test/v1',
                models: { extract: 'model-a', suggest: 'model-b' },
              },
            },
          }),
        );
      },
      { text },
    );
    const requests = [],
      errors = [];
    let hold = false,
      release;
    await context.route('https://mock-ai.test/**', async (route) => {
      const request = route.request();
      if (request.method() === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
        });
      const body = request.postDataJSON();
      requests.push(body);
      if (hold) await new Promise((resolve) => (release = resolve));
      const suggestion = body.messages[0].content.startsWith('Continue');
      const content = suggestion
        ? '风从海上吹来。灯塔亮起。'
        : JSON.stringify({
            glossary: [
              { name: '林舟', aliases: ['阿舟'], category: '人物', description: '旅人' },
              { name: '', description: 'invalid' },
            ],
            outline: [{ name: '港口相遇', description: '林舟遇到阿远' }],
            relations: [{ name: '同行', from: '林舟', to: '阿远', description: '结伴旅行' }],
            places: [
              { name: '港口', description: '相遇地点', links: ['灯塔'] },
              { name: '灯塔', description: '港口远处' },
            ],
          });
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ choices: [{ message: { content } }] }),
        })
        .catch(() => {});
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    const panel = async () => {
      await page.locator('#ai-button').click();
      await page.locator('#ai-actions:not([hidden])').waitFor();
    };
    const close = async () => {
      if (await page.locator('#dialog[open]').count()) await page.locator('#dialog-cancel').click();
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#dialog').open);
      await settled(page);
    };
    const extract = async () => {
      await panel();
      await page.locator('[data-ai-extract]').click();
      await page.locator('[data-next]').waitFor();
    };
    try {
      await page.goto(server.url + '/?ui=' + (width < 600 ? 'android' : 'harmonyos'));
      await page.waitForFunction(() => window.velaReady);
      await openRecentFile(page, page.locator('[data-recent=book]'));
      await panel();
      await page.locator('[data-ai-settings]').click();
      await page.locator('[name=aiKey]').fill('sk-test');
      await page.locator('[data-ai-verify]').click();
      await page.locator('.ai-key-status').filter({ hasText: 'test' }).waitFor();
      await closeSettings(page);
      await page.waitForFunction(() => !document.querySelector('#dialog').open);
      const baselineCount = await page.evaluate(
        () => JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.length,
      );
      await extract();
      await page.locator('[data-none]').click();
      await page.locator('[name=aiChapter]').last().check();
      for (const type of ['outline', 'relations', 'places'])
        await page.locator(`[name=aiType][value=${type}]`).check();
      await page.locator('[data-next]').click();
      assert.equal(requests.length, 0);
      await page.locator('[data-send]').click();
      await page.locator('[data-apply]').waitFor();
      const sent = requests.at(-1).messages.at(-1).content;
      assert.ok(!sent.includes('此章不应整理'));
      assert.ok(sent.includes('林舟'));
      assert.match(await page.locator('.ai-extract').textContent(), /已丢弃/);
      assert.match(await page.locator('.ai-extract').textContent(), /位置仅供参考/);
      await page.locator('[data-draft="0"] [data-field=description]').fill('预览修改后的旅人');
      await page.locator('[data-apply]').click();
      await page.locator('.ai-extract [role=status]').filter({ hasText: '草稿已合并' }).waitFor();
      const state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('wenzhou.workspace')),
      );
      assert.ok(
        state.documents.find((d) => d.name.endsWith('.gly')).text.includes('预览修改后的旅人'),
      );
      assert.ok(state.documents.some((d) => d.name.endsWith('.pcs')));
      assert.ok(state.documents.some((d) => d.name.endsWith('.vlmp')));
      assert.ok(state.documents.some((d) => d.name === '.vela'));
      await page.screenshot({ path: `test-results/ai-workflows/${width}-merged.png` });
      await close();
      const mapDoc = state.documents.find((d) => d.name.endsWith('.vlmp')),
        markers = JSON.parse(mapDoc.text).markers;
      if (!(await page.locator(`[data-doc="${mapDoc.id}"]`).isVisible()))
        await page.locator('#mobile-library').click();
      await page.locator(`[data-doc="${mapDoc.id}"]`).click();
      await page.waitForFunction(() => !!document.querySelector('#preview').planningApi);
      await page.evaluate(
        (id) => document.querySelector('#preview').planningApi.navigate({ id, details: true }),
        markers[0].id,
      );
      await page.locator(`[data-related-point="${markers[1].id}"]`).click();
      await page.waitForFunction(
        (id) => document.querySelector('#preview').planningApi.selection()?.id === id,
        markers[1].id,
      );
      await page.evaluate(() => wenzhouBack());
      await page.locator('[data-tab=book]').click();
      await panel();
      await page.locator('[data-ai-undo]').click();
      await page.waitForFunction(
        (count) => JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.length === count,
        baselineCount,
      );
      await close();
      console.log(
        'PASS',
        width,
        'chapter selection, invalid row rejection, edited multi-format preview, atomic merge and undo',
      );
      await extract();
      await page.locator('[data-next]').click();
      hold = true;
      await page.locator('[data-send]').click();
      await page.waitForFunction(() => document.querySelector('[data-cancel]'));
      while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
      await page.locator('[data-cancel]').click();
      await page.locator('.ai-extract [role=status]').filter({ hasText: '已取消' }).waitFor();
      release();
      release = null;
      hold = false;
      await close();
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.length,
        ),
        baselineCount,
      );
      console.log('PASS', width, 'cancelled response writes no artifacts');
      await panel();
      await page.locator('[data-ai-suggest]').click();
      const pos = text.indexOf('\n\n第二章');
      await page.evaluate((pos) => {
        velaEditorView.dispatch({ selection: { anchor: pos } });
        velaEditorView.focus();
      }, pos);
      await page.locator('.ai-ghost-text').waitFor();
      assert.equal(await page.evaluate(() => velaEditorView.state.doc.toString()), text);
      assert.ok(!requests.at(-1).messages.at(-1).content.includes('第二章'));
      assert.equal(requests.at(-1).model, 'model-b');
      await page.keyboard.type('新');
      assert.equal(await page.locator('.ai-ghost-text').textContent(), '风从海上吹来。灯塔亮起。');
      assert.equal(await page.locator('.ai-ghost-actions button').count(), 3);
      await page.locator('.ai-ghost-text').click();
      assert.equal(
        await page.evaluate(() => velaEditorView.state.doc.toString()),
        text.slice(0, pos) + '新' + text.slice(pos),
        'tapping the hint does not accept it',
      );
      await page.screenshot({ path: `test-results/release-0.9.9.9/${width}-ai-suggestion.png` });
      const beforeRegenerate = requests.length;
      await page.locator('[data-ai-suggestion=regenerate]').click();
      await page.waitForFunction(
        () => document.querySelector('#ai-button')?.getAttribute('aria-busy') !== 'true',
      );
      assert.ok(requests.length > beforeRegenerate);
      await page.locator('[data-ai-suggestion=accept]').click();
      const accepted = await page.evaluate(() => velaEditorView.state.doc.toString());
      assert.ok(accepted.includes('新风从海上吹来'));
      await page.keyboard.press('Control+z');
      assert.equal(
        await page.evaluate(() => velaEditorView.state.doc.toString()),
        text.slice(0, pos) + '新' + text.slice(pos),
      );
      await page.keyboard.press('End');
      await page.keyboard.type('新');
      await page.locator('.ai-ghost-text').waitFor();
      await page.keyboard.press('Tab');
      assert.equal(
        await page.locator('.ai-ghost-text').count(),
        0,
        'desktop shortcut still accepts',
      );
      await page.keyboard.press('Control+z');
      await page.keyboard.type('。');
      await page.locator('.ai-ghost-text').waitFor();
      await page.locator('[data-ai-suggestion=dismiss]').click();
      assert.equal(await page.locator('.ai-ghost-text').count(), 0);
      await page.keyboard.type('续');
      await page.locator('.ai-ghost-text').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ai-ghost-text').count(), 0);
      await page.locator('.cm-content').dispatchEvent('compositionstart', { data: '' });
      const count = requests.length;
      await page.waitForTimeout(1200);
      assert.equal(requests.length, count);
      await page.locator('.cm-content').dispatchEvent('compositionend', { data: '' });
      await panel();
      await page.locator('[data-ai-suggest]').click();
      await page.keyboard.press('End');
      await page.keyboard.type('。');
      const disabledCount = requests.length;
      await page.waitForTimeout(1200);
      assert.equal(requests.length, disabledCount);
      console.log(
        'PASS',
        width,
        'ghost text persists across typing, tap does not accept, regenerate and explicit acceptance, undo, Escape and IME/disable suppression',
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      await writeFile(
        `test-results/ai-workflows/${width}-failure.json`,
        JSON.stringify(
          {
            errors,
            stored: await page.evaluate(() => localStorage.getItem('wenzhou.workspace')),
            dialog: await page.locator('#dialog').textContent(),
          },
          null,
          2,
        ),
      );
      await page.screenshot({ path: `test-results/ai-workflows/${width}-failure.png` });
      throw error;
    } finally {
      release?.();
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
