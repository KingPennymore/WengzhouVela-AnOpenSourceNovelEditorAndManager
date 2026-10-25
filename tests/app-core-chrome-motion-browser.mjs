import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startSourceAppServer } from './source-app-server.mjs';

const server = await startSourceAppServer();
const browser = await chromium.launch({
  executablePath:
    process.env.WENZHOU_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
await mkdir('test-results/chrome-motion', { recursive: true });
const seed = {
  version: 1,
  activeId: 'book',
  openIds: ['book'],
  documents: [
    { id: 'book', name: '操作指南.txt', text: '第一章 海风\n海风吹过港湾。', updatedAt: 1 },
  ],
};
const finish = (page) =>
  page.evaluate(async () => {
    const effects = [
      ...document.querySelector('.topbar').getAnimations({ subtree: true }),
      ...document.querySelector('#toolbar-overflow').getAnimations({ subtree: true }),
      ...[...document.querySelectorAll('.chrome-motion-ghost')].flatMap((item) =>
        item.getAnimations(),
      ),
    ];
    await Promise.all(effects.map((effect) => effect.finished.catch(() => {})));
  });
try {
  for (const width of [320, 390, 844, 1280]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width, height: 850 },
        hasTouch: true,
      });
      await context.addInitScript(
        (seed) => localStorage.setItem('wenzhou.workspace', JSON.stringify(seed)),
        { ...seed, settings: { theme } },
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(server.url + '/?ui=android');
      await page.waitForFunction(() => window.velaReady && window.velaEditorView);
      await finish(page);
      const animated = await page.evaluate(() => {
        document.querySelector('[data-view=write]').click();
        return document
          .querySelector('.topbar')
          .getAnimations({ subtree: true })
          .filter((effect) => !('transitionProperty' in effect) && !('animationName' in effect))
          .length;
      });
      if (width < 900) assert.ok(animated > 0, 'navigation expansion must animate');
      else assert.equal(animated, 0, 'wide navigation stays unchanged');
      if (width < 900) {
        const direction = await page.evaluate(() => {
          const frames = (element) =>
            element
              .getAnimations()
              .find((item) => !('transitionProperty' in item) && !('animationName' in item))
              ?.effect.getKeyframes();
          return {
            arriving: frames(document.querySelector('[data-view=github]'))?.[0].transform,
            departing: frames(
              document.querySelector('.chrome-motion-ghost[data-source=search-editor]'),
            )?.at(-1).transform,
          };
        });
        assert.equal(
          direction.arriving,
          'translateX(-40px)',
          'left buttons slide right when expanding',
        );
        assert.equal(
          direction.departing,
          'translateX(40px)',
          'right buttons slide right when hiding',
        );
      }
      await finish(page);
      if (width < 900) {
        assert.equal(await page.locator('body').getAttribute('data-editor-chrome'), 'expanded');
        const exit = await page.evaluate(() => {
          document.querySelector('[data-view=write]').click();
          return [...document.querySelectorAll('.chrome-motion-ghost')].every(
            (ghost) => ghost.inert && ghost.getAttribute('aria-hidden') === 'true',
          );
        });
        assert.equal(exit, true);
        const direction = await page.evaluate(() => {
          const frames = (element) =>
            element
              .getAnimations()
              .find((item) => !('transitionProperty' in item) && !('animationName' in item))
              ?.effect.getKeyframes();
          return {
            arriving: frames(document.querySelector('#search-editor'))?.[0].transform,
            departing: frames(
              document.querySelector('.chrome-motion-ghost[data-source=nav-github]'),
            )?.at(-1).transform,
            clipped: [...document.querySelectorAll('.chrome-motion-ghost')].every(
              (ghost) =>
                ghost.parentElement.classList.contains('chrome-motion-clip') &&
                ghost.parentElement.inert,
            ),
          };
        });
        assert.equal(direction.arriving, 'translateX(40px)', 'right actions slide left into place');
        assert.equal(
          direction.departing,
          'translateX(-40px)',
          'left buttons slide left when collapsing',
        );
        assert.equal(direction.clipped, true, 'departing icons stay clipped to their own group');
        await finish(page);
        assert.equal(await page.locator('body').getAttribute('data-editor-chrome'), 'compact');
        assert.equal(await page.locator('.chrome-motion-ghost').count(), 0);
        assert.equal(await page.locator('.chrome-motion-clip').count(), 0);
        if (width === 320 && theme === 'light') {
          const continuity = await page.evaluate(() => {
            const effects = () =>
              [
                ...document.querySelector('.topbar').getAnimations({ subtree: true }),
                ...[...document.querySelectorAll('.chrome-motion-ghost')].flatMap((item) =>
                  item.getAnimations(),
                ),
              ].filter(
                (effect) => !('transitionProperty' in effect) && !('animationName' in effect),
              );
            document.querySelector('[data-view=write]').click();
            for (const effect of effects()) {
              effect.pause();
              effect.currentTime = 60;
            }
            const ghost = document.querySelector('.chrome-motion-ghost[data-source=search-editor]');
            const before = {
              x: ghost.getBoundingClientRect().x,
              opacity: Number(getComputedStyle(ghost).opacity),
            };
            document.querySelector('[data-view=write]').click();
            for (const effect of effects()) {
              effect.pause();
              effect.currentTime = 0;
            }
            const button = document.querySelector('#search-editor');
            const after = {
              x: button.getBoundingClientRect().x,
              opacity: Number(getComputedStyle(button).opacity),
            };
            for (const effect of effects()) effect.play();
            return { before, after };
          });
          assert.ok(continuity.before.opacity > 0 && continuity.before.opacity < 1);
          assert.ok(
            Math.abs(continuity.before.x - continuity.after.x) < 1,
            'reversing preserves icon position',
          );
          assert.ok(
            Math.abs(continuity.before.opacity - continuity.after.opacity) < 0.01,
            'reversing preserves icon opacity',
          );
          await finish(page);
        }
        await page.evaluate(() => {
          for (let i = 0; i < 4; i++) document.querySelector('[data-view=write]').click();
        });
        await finish(page);
        assert.equal(await page.locator('body').getAttribute('data-editor-chrome'), 'compact');
        assert.equal(await page.locator('.chrome-motion-ghost').count(), 0);
      }
      // Real overlapping controls: the editor's search panel stays open beneath the menu.
      await page.locator('#search-editor').tap();
      await page.locator('.vela-search-panel').waitFor();
      await page.locator('#more-tools').tap();
      await finish(page);
      assert.ok(
        await page.evaluate(() => {
          const menu = document.querySelector('#toolbar-overflow');
          const item = menu.getBoundingClientRect();
          const search = document.querySelector('.vela-search-panel').getBoundingClientRect();
          const left = Math.max(item.left, search.left),
            right = Math.min(item.right, search.right);
          const top = Math.max(item.top, search.top),
            bottom = Math.min(item.bottom, search.bottom);
          return (
            right > left &&
            bottom > top &&
            document
              .elementFromPoint((left + right) / 2, (top + bottom) / 2)
              ?.closest('#toolbar-overflow') === menu
          );
        }),
        'more menu must receive taps above the search panel',
      );
      for (const selector of [
        '#more-tools',
        '#more-tools svg',
        '#settings',
        '.vela-search-panel button',
      ]) {
        assert.equal(
          await page
            .locator(selector)
            .first()
            .evaluate((button) => getComputedStyle(button).webkitTapHighlightColor),
          'rgba(0, 0, 0, 0)',
        );
      }
      await page.screenshot({
        path: `test-results/chrome-motion/${width}-${theme}-search-menu.png`,
      });
      const closing = await page.evaluate(() => {
        document.querySelector('#more-tools').click();
        const menu = document.querySelector('#toolbar-overflow');
        return { inert: menu.inert, animated: menu.getAnimations().length > 0 };
      });
      assert.deepEqual(closing, { inert: true, animated: true });
      if (width < 600) {
        assert.equal(await page.evaluate(() => window.wenzhouBack()), false);
      }
      await page.locator('#toolbar-overflow').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        const more = document.querySelector('#more-tools');
        more.click();
        more.click();
        more.click();
      });
      await finish(page);
      assert.equal(await page.locator('#more-tools').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#toolbar-overflow').evaluate((menu) => menu.inert), false);
      await page.keyboard.press('Escape');
      await page.locator('#toolbar-overflow').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'more-tools');
      assert.ok(
        await page
          .locator('#more-tools')
          .evaluate(
            (button) =>
              button.matches(':focus-visible') &&
              parseFloat(getComputedStyle(button).outlineWidth) > 0,
          ),
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px ${theme}: layering, bidirectional motion, rapid toggles and touch highlight`,
      );
      await context.close();
    }
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 850 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    (seed) => localStorage.setItem('wenzhou.workspace', JSON.stringify(seed)),
    seed,
  );
  const page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.velaReady && window.velaEditorView);
  assert.equal(
    await page.evaluate(() => {
      document.querySelector('[data-view=write]').click();
      document.querySelector('#more-tools').click();
      document.querySelector('#more-tools').click();
      return (
        document.querySelector('#toolbar-overflow').hidden &&
        !document.querySelector('.chrome-motion-ghost') &&
        document
          .querySelector('.topbar')
          .getAnimations({ subtree: true })
          .filter((effect) => !('transitionProperty' in effect) && !('animationName' in effect))
          .length === 0
      );
    }),
    true,
  );
  console.log('PASS reduced motion: immediate navigation and menu transitions');
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
