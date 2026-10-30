// Compare the refactored CSS against the immutable pre-refactor commit, on the SAME DOM.
// Override CSS_BASE_REF to compare a different baseline; no built/native assets are rewritten.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {selectAppView} from './navigation-helper.mjs';
import {noMotion, settled, readerIdle} from './wait-helpers.mjs';
import {outlineFixture} from './planning-fixtures.mjs';
import {outlineText} from '../web/outline.mjs';
import {createMap, mapText} from '../web/map.mjs';

const baseline = process.env.CSS_BASE_REF || '6b7bc56'; // UI redesign: moved to each phase's merge (docs/UI-REDESIGN.md)
const height = Number(process.env.CSS_HEIGHT || 960);
const fromGit = file => execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'});
const oldHtml = fromGit('web/index.html');
const currentHtml = await readFile('web/index.html', 'utf8');
const sheets = html => [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g)]
  .map(match => match[1]).filter(name => !['startup.css', 'katex.min.css'].includes(name));
const oldSheets = new Map(sheets(oldHtml).map(name => [name, fromGit('web/' + name)]));
const newSheets = await Promise.all(sheets(currentHtml).map(async name => ({name, css: await readFile('web/' + name, 'utf8')})));
const doc = (id, name, text) => ({id, name, path: name, text, updatedAt: 1});
const book = '第一章 海风\n清晨，文舟驶出港口。\n\n第二章 灯塔\n远方的灯塔照亮了航路。';
const seed = {
  version: 1, activeId: 'book', openIds: ['book', 'csv', 'outline', 'map'],
  documents: [doc('book', '航程.txt', book), doc('csv', '人物.csv', '姓名,身份,备注\n林舟,主角,航海日志\n阿岚,船长,港口'),
    doc('outline', '情节.pcs', outlineText(outlineFixture('情节'))), doc('map', '北境.vlmp', mapText(createMap('北境')))],
  trash: [{id: 'deleted', path: '旧稿.txt', createdAt: 1, directory: false, documents: [doc('deleted-doc', '旧稿.txt', '旧稿正文')], folders: [], entries: [], repositories: []}],
  settings: {theme: 'light', readingMode: 'pages'},
};
const server = await startSourceAppServer();
const browser = await chromium.launch({headless: true, executablePath: process.env.WENZHOU_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results = [], errors = [];
try {
  const runs = await Promise.allSettled((process.env.CSS_PROFILES || 'windows,harmonyos,android').split(',').map(async profile => {
    for (const width of (process.env.CSS_WIDTHS || '1440,375').split(',').map(Number)) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({viewport: {width, height}, colorScheme: theme});
        await noMotion(context);
        await context.addInitScript(data => localStorage.setItem('wenzhou.workspace', JSON.stringify(data)), {...seed, settings: {...seed.settings, theme}});
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/index.html*', route => route.fulfill({contentType: 'text/html', body: oldHtml}));
        await page.route('**/*.css', async route => {
          const name = new URL(route.request().url()).pathname.slice(1);
          if (oldSheets.has(name)) await route.fulfill({contentType: 'text/css', body: oldSheets.get(name)});
          else await route.continue();
        });
        await page.goto(`${server.url}/index.html?ui=${profile}`);
        await page.waitForFunction(() => window.velaReady === true);
        assert.equal(await page.locator('body').evaluate(el => el.classList.contains('dark')), theme === 'dark');
        const structure = await page.evaluate(async ({oldNames, newSheets}) => {
          window.cssEquivalence = {old: [...document.querySelectorAll('link[rel=stylesheet]')].filter(link => oldNames.includes(link.getAttribute('href').replace('./', ''))), next: []};
          const first = window.cssEquivalence.old[0];
          const katex = document.querySelector('link[href="./katex.min.css"]');
          for (const {name, css} of newSheets) {
            const style = document.createElement('style');
            style.dataset.equivalence = name;
            style.media = 'not all';
            style.textContent = css;
            // Application layers precede KaTeX; third-party editor overrides follow it.
            if (name === 'editor.css') katex.after(style); else first.before(style);
            window.cssEquivalence.next.push(style);
          }
          const freeze = document.createElement('style');
          freeze.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
          document.head.append(freeze);
          await document.fonts.ready;
          const seen = new Set(), owners = new Set(), last = new Map(), issues = [];
          const scan = (rules, layer = '', conditions = []) => {
            for (const rule of rules) {
              if (rule.type === CSSRule.STYLE_RULE) {
                const owner = JSON.stringify([layer, rule.selectorText]);
                const key = JSON.stringify([layer, conditions, rule.selectorText]);
                if (seen.has(key)) issues.push('duplicate: ' + key);
                if (owners.has(owner) && last.get(layer) !== owner) issues.push('scattered: ' + owner);
                seen.add(key); owners.add(owner); last.set(layer, owner);
              } else if (rule.constructor.name === 'CSSLayerBlockRule') scan(rule.cssRules, rule.name, conditions);
              else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) scan(rule.cssRules, layer, [...conditions, rule.conditionText]);
            }
          };
          for (const style of window.cssEquivalence.next) scan(style.sheet.cssRules);
          return issues;
        }, {oldNames: [...oldSheets.keys()], newSheets});
        assert.deepEqual(structure, [], 'each selector must have one contiguous owner and one rule per layer/condition');

        const compare = async view => {
          if (process.env.CSS_VIEWS && !process.env.CSS_VIEWS.split(',').includes(view)) return;
          await page.mouse.move(0, 0);
          await settled(page);
          const result = await page.evaluate(() => {
            const {old, next} = window.cssEquivalence;
            const switchTo = current => {
              for (const link of old) link.sheet.disabled = current;
              for (const style of next) style.media = current ? 'all' : 'not all';
            };
            const elements = [...document.querySelectorAll('*')];
            const ignored = /^(?:transition|animation)(?:-|$)|^--(?:shell-top|footer-height|sidebar-bottom|footer-progress)$/;
            // Phase 1 adds unused design tokens. Allow only their introduction; keep comparing every
            // rendered property and every existing variable against the immutable baseline. Their
            // exact values (including coarse pointers) are checked by ui-components-browser.mjs.
            const addedTokens = new Set(['--text-xs', '--text-sm', '--text-md', '--text-lg', '--text-xl',
              '--leading-tight', '--leading', '--leading-loose', '--weight-regular', '--weight-medium', '--weight-bold',
              '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
              '--radius-sm', '--radius-md', '--radius-lg', '--radius-full', '--control-h']);
            const snapshot = () => elements.flatMap(el => ['', '::before', '::after'].map(pseudo => {
              const style = getComputedStyle(el, pseudo || null);
              return Object.fromEntries([...style].filter(property => !ignored.test(property)).map(property => [property, style.getPropertyValue(property)]));
            }));
            // A synchronous swap prevents clocks, caret blinking, observers and layout JS from
            // changing the fixture between samples. Recheck every mismatch after restoring
            // the baseline, so a difference cannot be explained by a changing fixture.
            switchTo(false);
            const before = snapshot();
            switchTo(true);
            const after = snapshot();
            let differences = 0, unstable = 0, properties = 0;
            const details = [], mismatches = [];
            before.forEach((style, index) => {
              const el = elements[Math.floor(index / 3)];
              for (const property of new Set([...Object.keys(style), ...Object.keys(after[index])])) {
                if (addedTokens.has(property) && style[property] === undefined) continue;
                properties++;
                if (style[property] === after[index][property]) continue;
                differences++;
                mismatches.push({el, pseudo: ['', '::before', '::after'][index % 3], property, value: style[property]});
                if (details.length < 80) details.push({element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().replace(/\s+/g, '.') : ''), pseudo: ['', '::before', '::after'][index % 3], property, before: style[property], after: after[index][property]});
              }
            });
            switchTo(false);
            for (const {el, pseudo, property, value} of mismatches) {
              if (getComputedStyle(el, pseudo || null).getPropertyValue(property) !== value) unstable++;
            }
            return {elements: elements.length, properties, differences, unstable, details};
          });
          results.push({profile, width, height, theme, view, ...result});
          console.log(`${result.differences ? 'FAIL' : 'PASS'} ${profile} ${width} ${theme} ${view}: ${result.elements} elements, ${result.differences} differences`);
          if (result.differences && process.env.CSS_FAIL_FAST) {
            console.log(JSON.stringify(result.details, null, 2));
            throw new Error('CSS equivalence failed: ' + view);
          }
        };
        const home = async () => {await page.keyboard.press('Control+Alt+h'); await page.locator('#start-page').waitFor({state: 'visible'});};
        const open = async id => {await home(); await openRecentFile(page, page.locator(`[data-recent="${id}"]`));};
        await home(); await compare('start');
        await open('book'); await page.locator('#editor .cm-editor').waitFor(); await compare('writing-txt');
        await page.locator('#mobile-library').click(); await compare('file-library');
        await page.locator('#mobile-library').click();
        await page.locator('#more-tools').click(); await compare('toolbar-menu');
        await page.locator('#settings').click(); await page.locator('.settings-section').first().waitFor({state:'attached'}); await compare('settings');
        await page.locator('#dialog-close').click();
        await page.locator('#open-trash').evaluate(el => el.click()); await page.locator('.trash-item').waitFor(); await compare('trash');
        await page.locator('#dialog-cancel').click();
        await open('csv'); await page.locator('.csv-grid-cell').first().waitFor(); await compare('csv');
        await page.locator('.csv-grid-cell').first().click(); await page.keyboard.press('Enter');
        await page.locator('.csv-editor-layer').waitFor(); await compare('csv-cell-editor');
        await page.locator('#csv-commit').click();
        await open('outline'); await page.locator('.outline-plane').waitFor(); await compare('outline-tree');
        await page.locator('[data-node="n-root"]').click(); await page.locator('.outline-detail').waitFor(); await compare('outline-detail');
        await page.locator('.outline-detail [data-close]').click();
        await page.locator('[data-outline-mode=outline]').click(); await page.locator('.outline-graph-card').first().waitFor(); await compare('outline-graph');
        await open('map'); await page.locator('.map-stage canvas').waitFor(); await compare('map');
        await page.locator('.planning-details-button').click(); await page.locator('.planning-sheet').waitFor(); await compare('map-details');
        await page.locator('[data-sheet-close]').click();
        await selectAppView(page, 'reader'); await page.locator('.reader-library').waitFor(); await compare('reader-library');
        await page.locator('[data-read=book]').click(); await readerIdle(page); await compare('reader');
        await context.close();
      }
    }
  }));
  for (const run of runs) if (run.status === 'rejected') throw run.reason;
} finally {
  await mkdir('test-results/css-refactor', {recursive: true});
  await writeFile('test-results/css-refactor/equivalence.json', JSON.stringify({baseline, results, errors}, null, 2));
  await browser.close(); await server.close();
}
assert.ok(results.length > 0);
assert.deepEqual(errors, []);
assert.equal(results.reduce((sum, result) => sum + result.unstable, 0), 0, 'baseline must be stable');
assert.equal(results.reduce((sum, result) => sum + result.differences, 0), 0, 'computed CSS must match');
console.log(`PASS ${results.length} scenarios, zero computed-style differences (including ::before/::after)`);
