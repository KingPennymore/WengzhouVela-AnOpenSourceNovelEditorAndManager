import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
import { startSourceAppServer } from './source-app-server.mjs';
import { noMotion, settled } from './wait-helpers.mjs';
const out = 'test-results/ui-redesign/phase-4';
await mkdir(out, { recursive: true });
const server = process.env.VELA_TEST_URL
    ? { url: process.env.VELA_TEST_URL }
    : await startSourceAppServer(),
  browser = await launchBrowser(),
  results = [];
const text = '第一章 港口\n海风吹过港湾。\n第二章 灯塔\n灯火照亮航路。',
  head = text.indexOf('灯火') + 2;
const seed = {
  version: 1,
  activeId: 'book',
  openIds: ['book'],
  editorPositions: { book: { anchor: head, head } },
  settings: { theme: 'light', autoNouns: false, lastWritingId: 'book', richText: true },
  documents: [
    {
      id: 'book',
      name: '航程.txt',
      path: '小说/航程.txt',
      text,
      updatedAt: Date.parse('2026-10-30T08:00:00+08:00'),
    },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: 'note' + i,
      name: '笔记' + i + '.md',
      path: '资料/笔记' + i + '.md',
      text: '# 笔记\n正文',
      updatedAt: Date.parse('2026-10-30T07:00:00+08:00') - i * 60000,
    })),
  ],
};
try {
  for (const [width, height, ui, touch] of [
    [390, 844, 'android', true],
    [1280, 850, 'windows', false],
    [1000, 850, 'windows', false],
  ])
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        colorScheme: theme,
        timezoneId: 'Asia/Hong_Kong',
      });
      await noMotion(context);
      await context.addInitScript(
        (data) => {
          if (!localStorage.getItem('wenzhou.workspace'))
            localStorage.setItem('wenzhou.workspace', JSON.stringify(data));
        },
        { ...seed, settings: { ...seed.settings, theme } },
      );
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.clock.install({ time: new Date('2026-10-30T09:00:00+08:00') });
      const shot = async (name) => {
        await settled(page);
        await page.screenshot({ path: `${out}/${width}-${theme}-${name}.png` });
      };
      const home = async () => {
        await page.keyboard.press('Control+Alt+h');
        await page.locator('.resume-card').waitFor();
      };
      try {
        await page.goto(server.url + '/?ui=' + ui);
        await page.waitForFunction(() => window.velaReady);
        await page.locator('.resume-card').waitFor();
        assert.equal(
          await page.locator('body').evaluate((el) => el.classList.contains('dark')),
          theme === 'dark',
        );
        assert.equal(await page.locator('.resume-card').getAttribute('data-doc'), 'book');
        await page.locator('.resume-chapter').filter({ hasText: '第二章 灯塔' }).waitFor();
        assert.equal(await page.locator('[data-today]').textContent(), '0');
        assert.deepEqual(
          await page
            .locator('[data-recent]')
            .evaluateAll((nodes) => nodes.map((el) => el.dataset.recent)),
          ['book', 'note0', 'note1', 'note2', 'note3'],
        );
        assert.match(await page.locator('[data-recent=book]').textContent(), /小说/);
        assert.ok(await page.locator('[data-recent=book] time').getAttribute('datetime'));
        assert.equal(await page.locator('[data-start=commands]').isVisible(), !touch);
        assert.equal(await page.locator('.nav-label').first().isVisible(), width >= 1100);
        for (const nav of await page.locator('[data-view]').all()) {
          assert.ok(await nav.getAttribute('title'));
          assert.ok(await nav.getAttribute('aria-label'));
        }
        const stats = await page
          .locator('.start-stat')
          .evaluateAll((nodes) => nodes.map((el) => Math.round(el.getBoundingClientRect().top)));
        assert.equal(new Set(stats).size, 1);
        assert.ok(
          (await page
            .locator('.start-stats')
            .evaluate((el) => el.getBoundingClientRect().height)) <= 24,
        );
        const small = await page
          .locator('#start-page')
          .evaluate((root) =>
            [...root.querySelectorAll('button,strong,small,p,h1,h2,span,time')]
              .filter(
                (el) =>
                  el.checkVisibility() &&
                  el.textContent.trim() &&
                  parseFloat(getComputedStyle(el).fontSize) < 12,
              )
              .map((el) => el.outerHTML),
          );
        assert.deepEqual(small, []);
        const targets = await page
          .locator('#start-page button,.topbar button')
          .evaluateAll((nodes) =>
            nodes
              .filter((el) => el.checkVisibility() && !el.disabled)
              .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  id: el.id || el.dataset.start || el.dataset.recent,
                  w: r.width,
                  h: r.height,
                };
              }),
          );
        for (const target of targets)
          assert.ok(target.w >= 44 && target.h >= 44, JSON.stringify(target));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await shot('home');
        if (touch) {
          await page.setViewportSize({ width: 844, height: 390 });
          await shot('landscape');
          await page.setViewportSize({ width, height });
        }
        await page.locator('.resume-card').click();
        await page.locator('.cm-content').waitFor();
        assert.equal(await page.evaluate(() => velaEditorView.state.selection.main.head), head);
        if (touch) {
          await page.locator('#mobile-format-toggle').click();
          await page.locator('#format-style').scrollIntoViewIfNeeded();
          assert.equal(await page.locator('#format-style-label').isVisible(), false);
          assert.ok(await page.locator('#format-style').getAttribute('aria-label'));
          assert.ok(
            (await page
              .locator('#format-style')
              .evaluate((el) => el.getBoundingClientRect().width)) >= 44,
          );
          await shot('format');
          await page.locator('#mobile-format-toggle').click();
        }
        await page.locator('.cm-content').focus();
        await page.keyboard.insertText('海风😀');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+z');
        await page.keyboard.press('Control+y');
        assert.equal(
          (await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.writingDay?.count ??
              -1,
          )) >= 0,
          true,
        );
        await page.clock.setSystemTime(new Date('2026-10-30T23:59:58+08:00'));
        await home();
        assert.equal(await page.locator('[data-today]').textContent(), '3');
        await page.clock.fastForward(3000);
        await page.waitForFunction(
          () => document.querySelector('[data-today]').textContent === '0',
        );
        assert.equal(
          await page.evaluate(() => {
            wenzhouSave();
            return JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.writingDay.date;
          }),
          '2026-10-31',
        );
        const remembered = await page.evaluate(() => {
          wenzhouSave();
          return JSON.parse(localStorage.getItem('wenzhou.workspace')).editorPositions.book.head;
        });
        await page.reload();
        await page.waitForFunction(() => window.velaReady);
        await page.locator('.resume-card').click();
        assert.equal(
          await page.evaluate(() => velaEditorView.state.selection.main.head),
          remembered,
        );
        await home();
        await page.locator('[data-recent=note1]').click();
        assert.equal(await page.locator('#current-name').textContent(), '笔记1.md');
        await home();
        assert.equal(await page.locator('.resume-card').getAttribute('data-doc'), 'note1');
        await page.locator('[data-start=recent]').click();
        assert.equal(await page.locator('[data-recent]').count(), 8);
        await page.locator('[data-recent=note6]').click();
        await home();
        assert.equal(await page.locator('.resume-card').getAttribute('data-doc'), 'note6');
        await page.reload();
        await page.waitForFunction(() => window.velaReady);
        assert.equal(await page.locator('.resume-card').getAttribute('data-doc'), 'note6');
        if (touch) {
          await page.evaluate(() =>
            localStorage.setItem(
              'wenzhou.workspace',
              JSON.stringify({
                version: 1,
                documents: [],
                activeId: null,
                openIds: [],
                settings: { theme: document.body.classList.contains('dark') ? 'dark' : 'light' },
              }),
            ),
          );
          await page.reload();
          await page.waitForFunction(() => window.velaReady);
          await page.locator('.ui-empty').waitFor();
          assert.equal(await page.locator('.resume-card').count(), 0);
          assert.equal(await page.locator('.ui-empty [data-start=new-doc]').isVisible(), true);
          assert.equal(await page.locator('.ui-empty [data-start=import-doc]').isVisible(), true);
          await shot('empty');
          await page.locator('.ui-empty [data-start=new-doc]').click();
          await page.locator('#dialog[open]').waitFor();
          await page.locator('#dialog-cancel').click();
        }
        results.push({ width, height, ui, theme, targets });
      } finally {
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  // Coarse pointers hide the keyboard command entry even with the Windows profile.
  const coarse = await browser.newContext({
    viewport: { width: 1000, height: 850 },
    hasTouch: true,
  });
  await noMotion(coarse);
  await coarse.addInitScript(
    (seed) => localStorage.setItem('wenzhou.workspace', JSON.stringify(seed)),
    {
      ...seed,
      documents: [
        ...seed.documents,
        { id: 'table', name: 'table.csv', text: 'a,b', updatedAt: 1 },
        { id: 'code', name: 'main.js', text: '// code', updatedAt: 1 },
      ],
    },
  );
  const p = await coarse.newPage();
  await p.goto(server.url + '/?ui=windows');
  await p.waitForFunction(() => window.velaReady);
  assert.equal(await p.locator('[data-start=commands]').isVisible(), false);
  assert.equal(await p.locator('.start-stat strong').last().textContent(), '10');
  await coarse.close();
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await noMotion(fresh);
  const fp = await fresh.newPage();
  await fp.goto(server.url + '/?ui=android');
  await fp.waitForFunction(() => window.velaReady);
  await fp.locator('.ui-empty').waitFor();
  await fresh.close();
  await writeFile(out + '/results.json', JSON.stringify(results, null, 2));
  const shots = ['light', 'dark'].flatMap((theme) => [
    ...['home', 'empty', 'landscape', 'format'].map((name) => `390-${theme}-${name}.png`),
    `1280-${theme}-home.png`,
    `1000-${theme}-home.png`,
  ]);
  await writeFile(
    out + '/index.html',
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文舟阶段 4 截图</title><style>body{font:14px/1.5 system-ui;margin:24px;background:#eef3ef;color:#20372c}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;padding:12px;border-radius:12px;background:white}img{display:block;max-width:100%;max-height:650px;margin:auto}a{color:inherit}</style><h1>文舟 · 启动页重构</h1><main>${shots.map((name) => `<figure><a href="${name}"><img src="${name}" alt="${name}" loading="lazy"></a><figcaption>${name}</figcaption></figure>`).join('')}</main></html>`,
  );
  console.log(
    'PASS resume/caret, daily writing rollover, recent files, empty state, navigation, touch targets and themes',
  );
} finally {
  await browser.close();
  await server.close?.();
}
