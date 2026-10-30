import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
import { startSourceAppServer } from './source-app-server.mjs';
import { noMotion, settled, readerReady } from './wait-helpers.mjs';
import { settingsSection, closeSettings } from './settings-helper.mjs';
import { selectAppView } from './navigation-helper.mjs';
import { openRecentFile } from './start-page-helper.mjs';
const out = 'test-results/ui-redesign/phase-5';
await mkdir(out, { recursive: true });
const record = process.env.VELA_UI_AUDIT_ONLY === '1',
  accessibility = process.env.VELA_CHECK_ACCESSIBILITY !== '0';
const server = await startSourceAppServer(),
  browser = await launchBrowser(),
  results = [],
  errors = [];
const seed = {
  version: 1,
  activeId: 'book',
  openIds: ['book'],
  documents: [
    {
      id: 'book',
      name: '航程.txt',
      path: '小说/航程.txt',
      updatedAt: 1,
      text:
        '第一章 港口\n' +
        '海风吹过港湾，灯塔照亮了航路。\n'.repeat(35) +
        '第二章 灯塔\n新的航程从这里开始。',
    },
    {
      id: 'note',
      name: '人物.md',
      path: '小说/人物.md',
      updatedAt: 2,
      text: '# 人物\n来自南方的旅人。',
    },
  ],
  settings: { theme: 'light', richText: true, autoNouns: false, readingMode: 'pages' },
  subscriptions: [
    {
      repo: 'sample/novel',
      unread: false,
      pageSeen: true,
      snapshot: {
        name: '航程更新',
        checkedAt: 1,
        releases: [{ id: 1, name: '第一卷', tag: 'v1', body: '航程已经更新。', assets: [] }],
      },
    },
  ],
};
// Alpha compositing includes ancestor opacity. Gradient stops are checked conservatively:
// use the worst stop/background combination rather than guessing the colour below a glyph.
function inspect({ roots, accessibility }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }),
    cache = new Map();
  const rgba = (value) => {
    if (cache.has(value)) return cache.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data,
      r = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    cache.set(value, r);
    return r;
  };
  const over = (a, b) => {
    const alpha = a[3] + b[3] * (1 - a[3]);
    return alpha
      ? [...a.slice(0, 3).map((v, i) => (v * a[3] + b[i] * b[3] * (1 - a[3])) / alpha), alpha]
      : [0, 0, 0, 0];
  };
  const luminance = (c) =>
    c
      .slice(0, 3)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const path = (el) => {
    if (el.id) return '#' + el.id;
    let s = el.tagName.toLowerCase();
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 3).join('.');
    return s;
  };
  const gradientColors = (value) => {
    const colors = [];
    const regex =
      /(?:rgba?|hsla?|color|color-mix|oklab|oklch)\(|#[0-9a-f]{3,8}\b|\btransparent\b/gi;
    let m;
    while ((m = regex.exec(value))) {
      let end = regex.lastIndex;
      if (m[0].endsWith('(')) {
        let depth = 1;
        while (end < value.length && depth) {
          if (value[end] === '(') depth++;
          if (value[end] === ')') depth--;
          end++;
        }
        regex.lastIndex = end;
      }
      colors.push(rgba(value.slice(m.index, end)));
    }
    return colors;
  };
  const visible = (el) => {
    if (
      !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
      el.closest('[inert]')
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const rootsList = roots.flatMap((s) => [...document.querySelectorAll(s)]).filter(visible),
    nodes = new Set();
  for (const root of rootsList) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()))
      if (
        node.textContent.trim() &&
        !node.parentElement.closest('script,style,option,svg,textarea')
      )
        nodes.add(node);
  }
  for (const root of rootsList)
    for (const el of root.querySelectorAll(
      'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]),select,textarea',
    )) {
      if (visible(el)) {
        const text =
          el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : el.value || el.placeholder;
        if (text)
          nodes.add({
            parentElement: el,
            textContent: text,
            control: true,
            placeholder: !el.value && !!el.placeholder,
          });
      }
    }
  const findings = [],
    smallText = [],
    targets = [],
    names = [];
  let checked = 0,
    min = Infinity;
  for (const node of nodes) {
    const el = node.parentElement;
    if (!visible(el)) continue;
    const range = document.createRange();
    if (!node.control) range.selectNodeContents(node);
    let rect = [...(node.control ? [el.getBoundingClientRect()] : range.getClientRects())].find(
      (r) =>
        r.width &&
        r.height &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth,
    );
    if (!rect) continue;
    let clipped = false;
    for (let p = el; p; p = p.parentElement) {
      if (p === document.documentElement) continue;
      const s = getComputedStyle(p),
        r = p.getBoundingClientRect();
      if (
        /hidden|auto|scroll|clip/.test(s.overflowY) &&
        !(rect.bottom > r.top && rect.top < r.bottom)
      )
        clipped = true;
      if (
        /hidden|auto|scroll|clip/.test(s.overflowX) &&
        !(rect.right > r.left && rect.left < r.right)
      )
        clipped = true;
    }
    if (clipped) continue;
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + Math.min(rect.width / 2, 8))),
      y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2)),
      hit = document.elementFromPoint(x, y);
    if (hit && !el.contains(hit) && !hit.contains(el)) continue;
    const style = getComputedStyle(el, node.placeholder ? '::placeholder' : null);
    let states = [{ bg: [0, 0, 0, 0], fg: rgba(style.color) }];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p),
        base = rgba(s.backgroundColor),
        layers = [base, ...gradientColors(s.backgroundImage).map((c) => over(c, base))],
        next = [];
      for (const state of states)
        for (const bg of layers) {
          const b = over(state.bg, bg),
            f = over(state.fg, bg),
            opacity = Number(s.opacity);
          b[3] *= opacity;
          f[3] *= opacity;
          next.push({ bg: b, fg: f });
        }
      states =
        next.length > 24
          ? [...next]
              .sort((a, b) => luminance(a.bg) - luminance(b.bg))
              .filter((_, i, a) => i < 12 || i >= a.length - 12)
          : next;
    }
    const white = [1, 1, 1, 1],
      value = Math.min(...states.map(({ bg, fg }) => ratio(over(fg, white), over(bg, white)))),
      size = parseFloat(style.fontSize),
      threshold = size >= 24 || (size >= 18.666 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
    const item = {
      selector: path(el),
      text: node.textContent.trim().slice(0, 90),
      ratio: Number(value.toFixed(3)),
      required: threshold,
      color: style.color,
      background: style.backgroundColor,
      fontSize: size,
    };
    checked++;
    min = Math.min(min, value);
    if (value + 0.005 < threshold) findings.push(item);
    if (
      accessibility &&
      size < 12 &&
      !el.closest('.cm-content,.reader-content,.reader-page,.markdown:not(.settings-dialog)')
    )
      smallText.push(item);
  }
  if (accessibility) {
    const elements = new Set(
      rootsList.flatMap((root) => [
        ...root.querySelectorAll(
          'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button]',
        ),
      ]),
    );
    for (const el of elements) {
      let target = el;
      if (el.matches('input[type=checkbox],input[type=radio]'))
        target = [...(el.labels || [])].find(visible) || el;
      // Native switches/radios may be transparent; their visible label is the hit area.
      if (!visible(target) || el.closest('[inert]')) continue;
      const r = target.getBoundingClientRect();
      if (matchMedia('(pointer:coarse)').matches && (r.width < 43.9 || r.height < 43.9))
        targets.push({
          selector: path(el),
          target: path(target),
          width: r.width,
          height: r.height,
        });
      if (el.matches('button,[role=button]')) {
        const label =
          el.getAttribute('aria-label') ||
          [...(el.getAttribute('aria-labelledby') || '').split(/\s+/)]
            .map((id) => document.getElementById(id)?.textContent || '')
            .join(' ') ||
          el.textContent;
        if (!/[\p{L}\p{N}]/u.test(label))
          names.push({ selector: path(el), text: el.textContent, title: el.title });
      }
    }
  }
  return { checked, min: Number(min.toFixed(3)), contrast: findings, smallText, targets, names };
}
// Enter keyboard modality, then exercise every rendered, enabled tab stop, including
// visually hidden native inputs whose focus indicator belongs to their label/track.
async function keyboardAudit(page, roots) {
  const active = await page.evaluateHandle(() => ({el:document.activeElement,x:scrollX,y:scrollY,positions:[...document.querySelectorAll('*')].filter(el=>el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth).map(el=>[el,el.scrollLeft,el.scrollTop])}));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  const result = await page.evaluate((roots) => {
    const failures = [], elements = new Set();
    for (const selector of roots) for (const root of document.querySelectorAll(selector))
      for (const el of root.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex],[contenteditable=true]')) elements.add(el);
    let checked = 0;
    for (const el of elements) {
      if (el.disabled || el.tabIndex < 0 || el.closest('[inert]') || !el.checkVisibility({checkVisibilityCSS:true})) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(el).visibility !== 'visible') continue;
      el.focus({preventScroll:true});
      let indicator = el;
      if (el.matches('.ui-switch>input,.ui-segmented-option>input')) indicator = el.nextElementSibling;
      else if (el.matches('.palette-choice input')) indicator = el.closest('.palette-choice');
      const style = getComputedStyle(indicator);
      checked++;
      if (document.activeElement !== el || !el.matches(':focus-visible') || style.outlineStyle !== 'solid' || style.outlineWidth !== '2px' || style.outlineOffset !== '2px')
        failures.push({selector:el.id || el.className || el.tagName, outline:style.outline,offset:style.outlineOffset,active:document.activeElement===el});
    }
    return {checked, failures};
  }, roots);
  await active.evaluate(({el,x,y,positions}) => { if (el === document.body) document.activeElement?.blur(); else el?.focus({preventScroll:true}); for(const [node,left,top] of positions){node.scrollLeft=left;node.scrollTop=top;} window.scrollTo(x,y); });
  await active.dispose();
  return result;
}
async function capture(page, profile, name, roots, shot = false) {
  await settled(page);
  const containers = await page
    .locator('.start-content,.settings-content,#dialog-body,.library-panel')
    .all();
  const samples = [];
  samples.push(await page.evaluate(inspect, { roots, accessibility }));
  for (const container of containers) {
    if (!(await container.isVisible())) continue;
    const scrolling = await container.evaluate((el) => el.scrollHeight > el.clientHeight + 20);
    if (!scrolling) continue;
    for (const fraction of [0.5, 1]) {
      await container.evaluate(
        (el, f) => (el.scrollTop = (el.scrollHeight - el.clientHeight) * f),
        fraction,
      );
      await settled(page);
      samples.push(await page.evaluate(inspect, { roots, accessibility }));
    }
    await container.evaluate((el) => (el.scrollTop = 0));
  }
  assert.ok(
    samples.some((s) => s.checked > 0),
    `${profile} ${name}: the scene must contain measured text`,
  );
  const unique = (key) => [
    ...new Map(samples.flatMap((s) => s[key]).map((x) => [JSON.stringify(x), x])).values(),
  ];
  const keyboard = accessibility ? await keyboardAudit(page, roots) : {checked:0,failures:[]};
  results.push({
    keyboard,
    profile,
    scene: name,
    checked: samples.reduce((a, s) => a + s.checked, 0),
    min: Math.min(...samples.map((s) => s.min)),
    contrast: unique('contrast'),
    smallText: unique('smallText'),
    targets: unique('targets'),
    names: unique('names'),
  });
  if (shot) {
    await settled(page);
    await page.screenshot({ path: `${out}/${profile}-${name}${record ? '-before' : ''}.png` });
  }
}
try {
  const mathPage = await browser.newPage();
  await mathPage.setContent(
    '<body style="background:white;font:14px sans-serif"><main id="fixture"><p id="black">Black</p><p id="small" style="color:#777">Small</p><p id="large" style="font-size:24px;color:#777">Large</p><p id="alpha" style="color:rgba(0,0,0,.5)">Alpha</p><p id="group" style="color:black;opacity:.5">Group</p></main>',
  );
  const math = await mathPage.evaluate(inspect, { roots: ['#fixture'], accessibility: false });
  assert.deepEqual(math.contrast.map((r) => r.selector).sort(), ['#alpha', '#group', '#small']);
  assert.ok(
    math.contrast
      .filter((r) => ['#alpha', '#group'].includes(r.selector))
      .every((r) => r.ratio > 3.9 && r.ratio < 4.1),
  );
  await mathPage.close();
  for (const width of [390, 1280])
    for (const theme of ['light', 'dark']) {
      const phone = width === 390,
        profile = `${width}-${theme}`,
        context = await browser.newContext({
          viewport: { width, height: phone ? 844 : 850 },
          hasTouch: phone,
          isMobile: phone,
          colorScheme: theme,
        });
      await noMotion(context);
      await context.addInitScript(
        (data) => localStorage.setItem('wenzhou.workspace', JSON.stringify(data)),
        { ...seed, settings: { ...seed.settings, theme } },
      );
      await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.url + '/?ui=' + (phone ? 'android' : 'windows'));
      await page.waitForFunction(() => window.velaReady);
      await capture(page, profile, 'start', ['#start-page', '.topbar'], true);
      await openRecentFile(page, page.locator('[data-recent=book]'));
      await page.locator('.cm-content').waitFor();
      await capture(
        page,
        profile,
        'editor',
        ['.topbar', '.file-rowbar', '#editor', '#writing-footer'],
        true,
      );
      await page.locator('#mobile-library').click();
      await capture(page, profile, 'files', ['#library-shell'], true);
      await page.locator('#mobile-library').click();
      await page.locator('#more-tools').click();
      await page.locator('#settings').click();
      for (const id of [
        'appearance',
        'editing',
        'terms',
        'chapters',
        'reading',
        'ai',
        'storage',
        'about',
      ]) {
        await settingsSection(page, id);
        if (id === 'ai') {
          await page.locator('[name=aiEnabled]').evaluate(el=>el.click());
          await page.locator('.ai-consent-dialog[open]').waitFor();
          await capture(page,profile,'ai-consent',['.ai-consent-dialog'],true);
          await page.locator('.ai-consent-dialog button[value=agree]').click();
          await page.locator('.ai-settings-body').waitFor({state:'visible'});
          await page.locator('#toast').evaluate(el=>el.hidden=true);
        }
        await capture(
          page,
          profile,
          'settings-' + id,
          ['#dialog'],
          ['appearance', 'ai'].includes(id),
        );
      }
      await closeSettings(page);
      await page.keyboard.press('Control+n');
      await page.locator('#dialog[open]').waitFor();
      await capture(page, profile, 'dialog', ['#dialog'], true);
      await page.locator('#dialog-cancel').click();
      await page.evaluate(() => {
        document.querySelector('#quick-save').click();
      });
      await capture(page, profile, 'toast', ['#toast'], true);
      await selectAppView(page, 'subscriptions');
      await page.locator('#subscriptions-view').waitFor();
      await capture(page, profile, 'subscriptions', ['#subscriptions-view', '.topbar'], true);
      await selectAppView(page, 'reader');
      await page.locator('[data-read=book]').click();
      await readerReady(page);
      await page.locator('.reader-viewport').evaluate((el) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          }),
        );
      });
      await capture(page, profile, 'reader', ['#reader-view'], true);
      await context.close();
    }
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await noMotion(context);
    const page = await context.newPage();
    await page.goto(server.url + '/ui-gallery.html?theme=' + theme);
    await page.locator('[data-gallery-ready=true]').waitFor();
    await page.locator('.ui-notice--error').scrollIntoViewIfNeeded();
    await capture(page, 'gallery-' + theme, 'errors', ['.ui-notice--error', '.ui-failure'], true);
    await context.close();
  }
  if (accessibility && !record) {
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    await context.addInitScript(data => localStorage.setItem('wenzhou.workspace',JSON.stringify(data)),seed);
    const page = await context.newPage();
    await page.goto(server.url+'/?ui=android');
    await page.waitForFunction(() => window.velaReady);
    for (const action of [async()=>{},async()=>{await page.locator('#more-tools').click();},async()=>{await page.locator('#settings').click();}]) {
      await action(); await settled(page);
      const moving = await page.evaluate(() => document.getAnimations().filter(a => a.playState==='running' && !String(a.animationName || '').includes('blink')).map(a=>({name:a.animationName,duration:a.effect.getComputedTiming().duration})));
      assert.deepEqual(moving, [], 'Reduced motion must work without test animation overrides');
    }
    await context.close();
  }
  const summary = { mode: record ? 'before' : 'after', accessibility, results, errors };
  await writeFile(
    `${out}/${record ? 'before-audit' : 'audit'}.json`,
    JSON.stringify(summary, null, 2),
  );
  if (!record) {
    const files=(await readdir(out)).filter(name=>name.endsWith('.png')&&!name.endsWith('-before.png')).sort();
    const figures=files.map(file=>`<article><h2>${file.replace('.png','')}</h2><div class="pair">${files.includes(file)&&['gallery-light-errors.png','gallery-dark-errors.png'].includes(file)?`<figure><figcaption>Before</figcaption><a href="${file.replace('.png','-before.png')}"><img loading="lazy" src="${file.replace('.png','-before.png')}" alt="Before contrast correction"></a></figure>`:''}<figure><figcaption>After</figcaption><a href="${file}"><img loading="lazy" src="${file}" alt="${file.replace('.png','')}"></a></figure></div></article>`).join('');
    await writeFile(`${out}/index.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI redesign phase 5</title><style>body{font:16px system-ui;margin:24px;background:#f4f6f5;color:#203329}h1{font-size:24px}h2{font-size:16px}article{margin:24px 0;padding:16px;border:1px solid #84978c;border-radius:10px}.pair{display:flex;flex-wrap:wrap;gap:24px}figure{margin:0;flex:1;min-width:260px}img{max-width:100%;max-height:850px;object-fit:contain;object-position:top left}a{color:#1f6645}figcaption{margin-bottom:8px}</style><h1>UI redesign phase 5</h1><p>390 × 844 Android and 1280 × 850 desktop, light/dark. Click a screenshot to view its original size. Keyboard focus is also checked in the audit.</p><p><a href="audit.json">Contrast and accessibility audit</a> · <a href="step-b.json">Token alignment and retained geometry</a> · <a href="step-f-copy.json">Interface copy changes</a></p>${figures}</html>`);
  }
  const counts = Object.fromEntries(
    ['contrast', 'smallText', 'targets', 'names'].map((key) => [
      key,
      results.reduce((n, row) => n + row[key].length, 0),
    ]),
  );
  console.log(JSON.stringify({ scenes: results.length, counts, errors }));
  if (!record) {
    assert.deepEqual(errors, []);
    assert.equal(counts.contrast, 0, 'Visible text must meet AA; see audit.json');
    if (accessibility) {
      assert.deepEqual(results.flatMap(r => r.keyboard.failures), [], 'Keyboard focus must be reachable and consistent');
      assert.deepEqual(
        [counts.smallText, counts.targets, counts.names],
        [0, 0, 0],
        'See audit.json for accessibility failures',
      );
    }
  }
} finally {
  await browser.close();
  await server.close();
}
