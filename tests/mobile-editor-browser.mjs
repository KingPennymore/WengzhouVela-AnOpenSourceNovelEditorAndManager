import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';
import { settingsSection, setSetting, closeSettings } from './settings-helper.mjs';
import { editorAction, revealEditorChrome } from './mobile-editor-helper.mjs';
import { settled, noMotion } from './wait-helpers.mjs';
const out = 'test-results/ui-redesign/phase-6';
await mkdir(out, { recursive: true });
const server = process.env.VELA_TEST_URL
    ? { url: process.env.VELA_TEST_URL }
    : await startSourceAppServer(),
  browser = await launchBrowser(),
  results = [];
const text =
  '第一章 海风\n' +
  '林舟向海港走去。\n'.repeat(30) +
  '第二章 灯塔\n' +
  '远处的灯光亮起。\n'.repeat(50);
const seed = {
  version: 1,
  activeId: 'book',
  openIds: ['book'],
  settings: { theme: 'light', richText: true, autoNouns: false },
  documents: [
    { id: 'book', name: 'book.txt', path: 'book.txt', text, updatedAt: 1 },
    { id: 'note', name: 'note.md', path: 'note.md', text: '# 海风\nMarkdown 正文。', updatedAt: 1 },
  ],
};
const chromeMetrics = () => {
  const bars = Object.fromEntries(
    ['.topbar', '.file-rowbar', '#document-tools', '.quickbar', '.statusbar'].map((selector) => {
      const e = document.querySelector(selector),
        r = e.getBoundingClientRect();
      return [
        selector,
        { x: r.x, y: r.y, width: r.width, height: e.checkVisibility() ? r.height : 0 },
      ];
    }),
  );
  const intervals = Object.values(bars)
    .filter((r) => r.height)
    .map((r) => [r.y, r.y + r.height])
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    end = -Infinity;
  for (const [a, b] of intervals) {
    total += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return { bars, total };
};
try {
  for (const width of [390, 1280])
    for (const theme of ['light', 'dark']) {
      const phone = width === 390,
        profile = `${width}-${theme}`,
        errors = [];
      const context = await browser.newContext({
        viewport: { width, height: phone ? 844 : 850 },
        isMobile: phone,
        hasTouch: phone,
        colorScheme: theme,
      });
      await noMotion(context);
      await context.addInitScript(
        (data) => {
          if (!localStorage.getItem('wenzhou.workspace'))
            localStorage.setItem('wenzhou.workspace', JSON.stringify(data));
          let height = null;
          const visual = new EventTarget();
          Object.defineProperties(visual, {
            height: { get: () => height ?? innerHeight },
            width: { get: () => innerWidth },
            scale: { value: 1 },
            offsetTop: { value: 0 },
            offsetLeft: { value: 0 },
          });
          Object.defineProperty(window, 'visualViewport', { value: visual, configurable: true });
          window.testKeyboard = (value) => {
            height = value;
            visual.dispatchEvent(new Event('resize'));
          };
          const set = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (window.rejectSave && key === 'wenzhou.workspace')
              throw new DOMException('Test save failure', 'QuotaExceededError');
            return set.call(this, key, value);
          };
        },
        { ...seed, settings: { ...seed.settings, theme } },
      );
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      const shot = async (name) => {
        await settled(page);
        await page.screenshot({ path: `${out}/${profile}-${name}.png` });
      };
      const readable = async (selector) =>
        assert.deepEqual(
          await page
            .locator(selector)
            .evaluate((root) =>
              [...root.querySelectorAll('span,small,strong,kbd,button,.toolbar-menu-heading')]
                .filter(
                  (el) =>
                    el.checkVisibility() &&
                    el.textContent.trim() &&
                    Number.parseFloat(getComputedStyle(el).fontSize) < 12,
                )
                .map((el) => el.outerHTML),
            ),
          [],
        );
      const setCursor = async (pos) => {
        await page.evaluate((pos) => {
          const v = velaEditorView;
          v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
          v.focus();
        }, pos);
        await settled(page);
      };
      const caretVisible = async () =>
        page.waitForFunction(
          () => {
            const v = velaEditorView,
              r = v.coordsAtPos(v.state.selection.main.head),
              s = v.scrollDOM.getBoundingClientRect(),
              height =
                Number.parseFloat(
                  getComputedStyle(document.documentElement).getPropertyValue('--app-height'),
                ) || innerHeight;
            return (
              r && r.top >= Math.max(0, s.top) - 1 && r.bottom <= Math.min(height, s.bottom) + 1
            );
          },
          null,
          { timeout: 3000 },
        );
      const openSettings = async () => {
        await revealEditorChrome(page);
        await page.locator('#more-tools').click();
        await page.locator('#settings').click();
        await settingsSection(page, 'editing');
      };
      const burst = async () => {
        await setCursor(200);
        await page.keyboard.type('abcdef');
        await page.waitForFunction(() => document.body.dataset.mobileImmersed === 'true');
        await caretVisible();
      };
      try {
        await page.goto(server.url + '/?ui=' + (phone ? 'android' : 'windows'));
        await page.waitForFunction(() => window.velaReady);
        if (await page.locator('#start-page').isVisible())
          await openRecentFile(page, page.locator('[data-recent=book]'));
        await page.locator('.cm-content').waitFor();
        const single = await page.evaluate(chromeMetrics);
        if (!phone) {
          assert.equal(await page.locator('body').getAttribute('data-mobile-editor'), 'false');
          assert.equal(await page.locator('.file-rowbar').isVisible(), true);
          assert.equal(await page.locator('#format-tools').isVisible(), true);
          assert.equal(single.bars['.topbar'].height, 53);
          assert.equal(single.bars['.file-rowbar'].height, 40);
          assert.equal(single.bars['.statusbar'].height, 28);
          assert.equal(
            await page.locator('#editor').evaluate((el) => el.getBoundingClientRect().top),
            93,
          );
          await page.keyboard.type('abcdef');
          await settled(page);
          assert.notEqual(await page.locator('body').getAttribute('data-mobile-immersed'), 'true');
          await shot('editor');
          results.push({ profile, ...single });
          continue;
        }
        assert.equal(await page.locator('.file-rowbar').isVisible(), false);
        assert.equal(await page.locator('#current-name').isVisible(), true);
        assert.equal(await page.locator('#current-name').textContent(), 'book.txt');
        assert.equal(await page.locator('#document-tools').isVisible(), false);
        assert.ok(single.total <= 140, JSON.stringify(single));
        await shot('single');
        assert.ok(
          await page.locator('#current-name').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 44 && r.height >= 44;
          }),
        );
        await page.locator('#current-name').dblclick();
        await page.locator('#dialog[open]').waitFor();
        assert.equal(await page.locator('#dialog [name=name]').inputValue(), 'book.txt');
        await page.locator('#dialog-cancel').click();
        await setCursor(20);
        const before = await page.evaluate(() => ({
          head: velaEditorView.state.selection.main.head,
          focus: velaEditorView.hasFocus,
        }));
        await page.locator('#mobile-format-toggle').click();
        await page.waitForFunction(() => document.body.dataset.mobileFormat === 'true');
        assert.deepEqual(
          await page.evaluate(() => ({
            head: velaEditorView.state.selection.main.head,
            focus: velaEditorView.hasFocus,
          })),
          before,
        );
        await readable('.topbar');
        await shot('format');
        await page.locator('#mobile-format-toggle').click();
        await page.evaluate(() => {
          velaEditorView.dispatch({ selection: { anchor: 10, head: 15 } });
        });
        await page.waitForFunction(() => document.body.dataset.mobileFormat === 'true');
        await setCursor(20);
        await page.waitForFunction(() => document.body.dataset.mobileFormat === 'false');
        await page.keyboard.press('Control+Alt+h');
        await openRecentFile(page, page.locator('[data-recent=note]'));
        await page.waitForSelector('.cm-content');
        assert.equal(await page.locator('.file-rowbar').isVisible(), true);
        const multi = await page.evaluate(chromeMetrics);
        assert.ok(multi.total <= 140, JSON.stringify(multi));
        await shot('multiple');
        await page.locator('#mobile-format-toggle').click();
        assert.equal(await page.locator('#markdown-tools').isVisible(), true);
        assert.ok((await page.evaluate(chromeMetrics)).total <= 140);
        await page.locator('#mobile-format-toggle').click();
        await page.locator('[data-tab=book]').click();
        assert.equal(await page.locator('#quick-jump,#mobile-jump-menu,#mobile-git').count(),0);
        const direct = await page.locator('.quickbar>button').evaluateAll(nodes=>nodes.map(el=>({id:el.id,r:el.getBoundingClientRect().toJSON(),order:Number(getComputedStyle(el).order),title:el.title,label:el.getAttribute('aria-label')})).sort((a,b)=>a.order-b.order));
        assert.deepEqual(direct.map(x=>x.id),['quick-undo','quick-redo','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','quick-git','quick-save']);
        assert.equal(new Set(direct.map(x=>Math.round(x.r.top))).size,1);
        for(const item of direct){assert.ok(item.r.width>=44&&item.r.height>=44,JSON.stringify(item));assert.ok(item.r.x>=0&&item.r.right<=390,JSON.stringify(item));assert.ok(item.title&&item.label);}
        assert.equal(await page.locator('.topbar #current-chapter').count(),1);
        assert.equal(await page.locator('.topbar #word-count').count(),1);
        await setCursor(text.indexOf('第二章') + 20);
        await page.evaluate(()=>testKeyboard(430));
        await page.waitForFunction(()=>document.body.dataset.keyboard==='true');
        await page.locator('#quick-top').click();
        assert.equal(await page.evaluate(() => velaEditorView.state.selection.main.head), 0);
        await editorAction(page, '#quick-bottom');
        assert.equal(
          await page.evaluate(() => velaEditorView.state.selection.main.head),
          text.length,
        );
        await setCursor(text.indexOf('第二章') + 20);
        await editorAction(page, '#quick-chapter-top');
        assert.equal(
          await page.evaluate(
            () => velaEditorView.state.doc.lineAt(velaEditorView.state.selection.main.head).text,
          ),
          '第二章 灯塔',
        );
        await setCursor(20);
        await editorAction(page, '#quick-chapter-bottom');
        assert.equal(await page.evaluate(() => velaEditorView.state.selection.main.head),text.indexOf('第二章')-1);
        assert.equal(await page.evaluate(()=>velaEditorView.hasFocus),true);
        assert.equal(await page.locator('body').getAttribute('data-keyboard'),'true');
        await page.evaluate(()=>testKeyboard(null));
        await page.locator('#outline-toggle').click();
        await page.waitForFunction(() => document.body.classList.contains('show-outline'));
        await page.locator('#outline-toggle').click();
        await setCursor(20);
        await page.keyboard.type('x');
        await page.locator('.mobile-save-status[data-state=dirty]').waitFor();
        await page.locator('#quick-save').click();
        await page.locator('.mobile-save-status[data-state=saved]').waitFor();
        assert.ok(
          await page.evaluate(() =>
            JSON.parse(localStorage.getItem('wenzhou.workspace'))
              .documents.find((d) => d.id === 'book')
              .text.includes('x'),
          ),
        );
        await page.evaluate(() => (window.rejectSave = true));
        await page.keyboard.type('y');
        await page.locator('#quick-save').click();
        await page.locator('.mobile-save-status[data-state=failed]').waitFor();
        await page.evaluate(() => (window.rejectSave = false));
        await page.locator('#quick-save').click();
        await page.locator('.mobile-save-status[data-state=saved]').waitFor();
        await openSettings();
        assert.equal(await page.locator('[name=immersiveWriting]').isChecked(), false);
        await closeSettings(page);
        await setCursor(200);
        await page.keyboard.type('abcdef');
        await settled(page);
        assert.notEqual(await page.locator('body').getAttribute('data-mobile-immersed'),'true');
        await openSettings();
        await setSetting(page,'immersiveWriting',true);
        await closeSettings(page);
        await page.reload();
        await page.waitForFunction(()=>window.velaReady);
        if(await page.locator('#start-page').isVisible())await openRecentFile(page,page.locator('[data-recent=book]'));
        await openSettings();
        assert.equal(await page.locator('[name=immersiveWriting]').isChecked(),true);
        await closeSettings(page);
        await burst();
        await shot('immersed');
        await page.evaluate(() => {
          document
            .querySelector('#editor')
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 250 }));
          document
            .querySelector('#editor')
            .dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 160 }));
        });
        await page.waitForFunction(() => document.body.dataset.mobileImmersed === 'false');
        await caretVisible();
        for (const y of [4, 840]) {
          await burst();
          await page.mouse.click(4, y);
          await page.waitForFunction(() => document.body.dataset.mobileImmersed === 'false');
          await caretVisible();
        }
        await page.evaluate(() => testKeyboard(430));
        await page.waitForFunction(() => document.body.dataset.keyboard === 'true');
        await burst();
        await page.evaluate(() => testKeyboard(null));
        await page.waitForFunction(
          () =>
            document.body.dataset.mobileImmersed === 'false' &&
            document.body.dataset.keyboard === 'false',
        );
        await caretVisible();
        await burst();
        await page.evaluate(() => document.querySelector('#more-tools').click());
        await page.waitForFunction(() => document.body.dataset.mobileImmersed === 'false');
        await page.keyboard.press('Escape');
        await burst();
        await page.keyboard.press('Control+n');
        await page.locator('#dialog[open]').waitFor();
        assert.equal(await page.locator('body').getAttribute('data-mobile-immersed'), 'false');
        await page.locator('#dialog-cancel').click();
        await openSettings();
        await setSetting(page, 'immersiveWriting', false);
        await closeSettings(page);
        await setCursor(200);
        await page.keyboard.type('abcdef');
        await settled(page);
        assert.equal(await page.locator('body').getAttribute('data-mobile-immersed'), 'false');
        assert.equal(
          await page.evaluate(
            () => JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.immersiveWriting,
          ),
          false,
        );
        await page.reload();
        await page.waitForFunction(() => window.velaReady);
        if (await page.locator('#start-page').isVisible())
          await openRecentFile(page, page.locator('[data-recent=book]'));
        await setCursor(200);
        await page.keyboard.type('abcdef');
        await settled(page);
        assert.equal(await page.locator('body').getAttribute('data-mobile-immersed'), 'false');
        await openSettings();
        await setSetting(page, 'immersiveWriting', true);
        await closeSettings(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await burst();
        assert.equal(
          await page.evaluate(
            () =>
              [...document.querySelectorAll('.topbar,#writing-footer')]
                .flatMap((el) => el.getAnimations())
                .filter((a) => a.playState === 'running').length,
          ),
          0,
        );
        await revealEditorChrome(page);
        const targets = await page.evaluate(() =>
          [...document.querySelectorAll('.topbar button,.file-rowbar button,.quickbar button')]
            .filter((el) => el.checkVisibility() && !el.disabled)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                id: el.id,
                width: r.width,
                height: r.height,
                label: el.getAttribute('aria-label') || el.title || el.textContent.trim(),
              };
            }),
        );
        for (const target of targets) {
          assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target));
          assert.ok(target.label, JSON.stringify(target));
        }
        assert.deepEqual(
          await page.evaluate(() =>
            [...document.querySelectorAll('.topbar,.quickbar')]
              .flatMap((el) => [...el.querySelectorAll('span,small,strong')])
              .filter(
                (el) =>
                  el.checkVisibility() && Number.parseFloat(getComputedStyle(el).fontSize) < 12,
              )
              .map((el) => el.outerHTML),
          ),
          [],
        );
        await page.locator('#more-tools').click();
        await readable('#toolbar-overflow');
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 844, height: 390 });
        await settled(page);
        await shot('landscape');
        assert.ok((await page.evaluate(chromeMetrics)).total <= 140);
        await page.setViewportSize({ width: 390, height: 844 });
        await settled(page);
        await revealEditorChrome(page);
        await page.locator('#more-tools').click();
        await page.locator('#settings').click();
        await page.locator('.settings-navigation').waitFor();
        const lefts = await page
          .locator('.settings-navigation button strong')
          .evaluateAll((nodes) => nodes.map((el) => Math.round(el.getBoundingClientRect().left)));
        assert.equal(new Set(lefts).size, 1);
        await shot('settings-categories');
        await settingsSection(page, 'appearance');
        assert.equal(
          await page.locator('#new-palette').evaluate((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return r.getClientRects().length;
          }),
          1,
        );
        await shot('settings-palette');
        await closeSettings(page);
        results.push({ profile, single, multiple: multi, targets });
      } catch (error) {
        await shot('failure');
        throw error;
      } finally {
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await reduced.addInitScript(
    (seed) => localStorage.setItem('wenzhou.workspace', JSON.stringify(seed)),
    {...seed,settings:{...seed.settings,immersiveWriting:true}},
  );
  const rp = await reduced.newPage();
  await rp.goto(server.url + '/?ui=harmonyos');
  await rp.waitForFunction(() => window.velaReady);
  if (await rp.locator('#start-page').isVisible())
    await openRecentFile(rp, rp.locator('[data-recent=book]'));
  assert.equal(await rp.locator('body').getAttribute('data-mobile-editor'), 'true');
  await rp.locator('.cm-content').focus();
  await rp.keyboard.type('abcdef');
  await rp.waitForFunction(() => document.body.dataset.mobileImmersed === 'true');
  assert.equal(
    await rp.evaluate(
      () =>
        [...document.querySelectorAll('.topbar,#writing-footer')]
          .flatMap((el) => el.getAnimations())
          .filter((a) => a.playState === 'running').length,
    ),
    0,
  );
  results.push({ profile: '390-harmonyos-reduced' });
  await reduced.close();
  await writeFile(out + '/results.json', JSON.stringify(results, null, 2));
  const scenes = [
    ['single', '单文稿'],
    ['multiple', '多文稿'],
    ['format', '格式工具展开'],
    ['immersed', '沉浸写作'],
    ['landscape', '横屏 844×390'],
    ['settings-categories', '设置图标对齐'],
    ['settings-palette', '自定义配色按钮'],
  ];
  const cards = ['light', 'dark'].flatMap((theme) => [
    ...scenes.map(([id, label]) => ({
      file: `390-${theme}-${id}.png`,
      label: `${id === 'landscape' ? '844×390' : '390×844'} · ${theme === 'light' ? '浅色' : '深色'} · ${label}`,
    })),
    {
      file: `1280-${theme}-editor.png`,
      label: `1280×850 · ${theme === 'light' ? '浅色' : '深色'} · 桌面编辑页`,
    },
  ]);
  await writeFile(
    out + '/index.html',
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文舟 UI 重构 · 阶段 6 截图</title><style>body{margin:24px;background:#f3f6f4;color:#20352a;font:16px/1.5 system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}figure{margin:0;border:1px solid #ccd7d0;border-radius:12px;background:white;padding:12px}img{display:block;max-width:100%;max-height:600px;margin:auto}figcaption{font-size:14px;padding:12px 0}a{color:inherit}h1{font-size:24px}p{max-width:80ch}</style><h1>文舟 UI 重构 · 阶段 6</h1><p>手机底栏八个直接操作；章节与字数在顶栏文件名下方；沉浸写作默认关闭。点击截图查看原图。<a href="results.json">本轮测试测量</a></p><main>${cards.map(({ file, label }) => `<figure><a href="${file}"><img loading="lazy" src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</main></html>`,
  );
  console.log('PASS phone chrome, formats, jump/save, immersion and desktop geometry');
} finally {
  await browser.close();
  await server.close?.();
}
