// Mobile writing chrome owns presentation and input cadence; editing and persistence stay in the host.
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { menuKey } from './menu-controller.mjs';

export function createMobileEditor(host) {
  const $ = (s) => document.querySelector(s),
    body = document.body,
    owner = new AbortController(),
    signal = owner.signal;
  const top = $('.topbar'),
    quick = $('.quickbar'),
    row = $('.file-rowbar'),
    global = $('.global-tools');
  const toggle = document.createElement('button');
  toggle.id = 'mobile-format-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Aa';
  toggle.hidden = true;
  global.insertBefore(toggle, $('#more-tools'));
  const jump = document.createElement('button');
  jump.id = 'quick-jump';
  jump.type = 'button';
  jump.hidden = true;
  jump.innerHTML = icon('outline') + '<span></span>';
  quick.append(jump);
  const menu = document.createElement('div');
  menu.id = 'mobile-jump-menu';
  menu.className = 'mobile-jump-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  jump.setAttribute('aria-haspopup', 'menu');
  jump.setAttribute('aria-controls', menu.id);
  jump.setAttribute('aria-expanded', 'false');
  const arrows = ['quick-top', 'quick-bottom', 'quick-chapter-top', 'quick-chapter-bottom'].map(
    (id) => $('#' + id),
  );
  // Keep #quick-git in place: planning editors use it as their bottom-action anchor.
  const moved = [
    ...arrows,
    $('#plugin-bottom-toolbar'),
    $('#current-chapter'),
    $('#word-count'),
  ].map((node) => {
    const anchor = document.createComment('mobile chrome');
    node.before(anchor);
    return { node, anchor, role: node.getAttribute('role') };
  });
  const outline = document.createElement('button');
  outline.id = 'quick-outline';
  outline.type = 'button';
  outline.setAttribute('role', 'menuitem');
  outline.innerHTML = icon('outline') + '<span></span>';
  menu.append(outline);
  outline.onclick = () => $('#outline-toggle').click();
  const summary = document.createElement('span');
  summary.className = 'mobile-editor-summary';
  summary.hidden = true;
  quick.append(summary);
  const saved = document.createElement('span');
  saved.className = 'mobile-save-status';
  saved.hidden = true;
  saved.setAttribute('role', 'status');
  $('#quick-save').append(saved);
  const git = document.createElement('button');
  git.id = 'mobile-git';
  git.type = 'button';
  git.hidden = true;
  git.setAttribute('role', 'menuitem');
  git.innerHTML = icon('git') + '<span class="menu-label"></span>';
  host.shell.groups.document.append(git);
  git.onclick = () => $('#quick-git').click();
  const gitLabel = git.querySelector('.menu-label');
  let active = false,
    immersed = false,
    override = null,
    docId = null,
    burst = [],
    frame = 0,
    caretEpoch = 0,
    oldHeight = innerHeight,
    oldWidth = innerWidth,
    keyboard = false,
    touch = null,
    keyboardMenu = false;
  let saveMessage = '已保存到本机',
    saveDirty = false;
  const mobile = () =>
    innerWidth < 900 && (body.dataset.ui === 'android' || matchMedia('(pointer:coarse)').matches);
  const editable = () => active && !host.preview() && !!host.view() && !host.view().state.readOnly;
  const formatAvailable = () =>
    host.formatAvailable() || !!$('#plugin-document-toolbar')?.querySelector('button');
  const blockers = () =>
    !!document.querySelector('dialog[open],#toolbar-overflow:not([hidden]),.app-choice-menu') ||
    body.classList.contains('show-library') ||
    body.classList.contains('show-outline');
  const localize = () => {
    toggle.title = t('格式工具');
    toggle.setAttribute('aria-label', t('格式工具'));
    toggle.setAttribute('aria-controls', 'document-tools');
    jump.title = t('跳转');
    jump.setAttribute('aria-label', t('跳转'));
    jump.querySelector('span').textContent = t('跳转');
    menu.setAttribute('aria-label', t('跳转'));
    outline.querySelector('span').textContent = t('章节目录');
    outline.setAttribute('aria-label', t('章节目录'));
    gitLabel.textContent = t('Git 仓库与提交');
    git.title = gitLabel.textContent;
    git.setAttribute('aria-label', gitLabel.textContent);
    git.disabled = $('#quick-git').disabled;
    const label = saveMessage.startsWith('保存失败')
      ? t('保存失败')
      : saveDirty
        ? t('未保存')
        : t('已保存');
    if (saved.textContent !== label) saved.textContent = label;
    saved.dataset.state = saveMessage.startsWith('保存失败')
      ? 'failed'
      : saveDirty
        ? 'dirty'
        : 'saved';
    if (active) $('#quick-save').setAttribute('aria-label', label + ' · ' + t('保存'));
  };
  const closeMenu = (focus = false) => {
    if (menu.hidden) return false;
    menu.hidden = true;
    jump.setAttribute('aria-expanded', 'false');
    if (focus) {
      if (keyboardMenu) jump.focus({ preventScroll: true });
      else host.view()?.focus();
    }
    return true;
  };
  function keepCaret(change) {
    const view = host.view(),
      before = editable() ? view.coordsAtPos(view.state.selection.main.head) : null,
      epoch = ++caretEpoch;
    change();
    host.layout();
    view?.requestMeasure();
    if (!before) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (epoch !== caretEpoch || view !== host.view() || !active || host.preview()) return;
        const after = view.coordsAtPos(view.state.selection.main.head);
        if (after) view.scrollDOM.scrollTop += after.top - before.top;
        host.revealCaret();
      }),
    );
  }
  function reveal() {
    burst = [];
    cancelAnimationFrame(frame);
    frame = 0;
    if (!immersed) return false;
    immersed = false;
    keepCaret(() => (body.dataset.mobileImmersed = 'false'));
    return true;
  }
  function hide() {
    frame = 0;
    const view = host.view();
    if (
      !editable() ||
      !view.hasFocus ||
      !view.state.selection.main.empty ||
      host.enabled() === false ||
      blockers() ||
      !menu.hidden ||
      view.composing
    )
      return;
    override = null;
    body.dataset.mobileFormat = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    immersed = true;
    // No layout animation: an anchored CodeMirror measure also keeps reduced-motion and IME layouts stable.
    keepCaret(() => (body.dataset.mobileImmersed = 'true'));
  }
  function update() {
    const next =
      mobile() && host.page() === 'write' && !host.home() && !!host.workspace() && host.supported();
    body.dataset.mobileUi = String(mobile());
    const changed = next !== active;
    active = next;
    body.dataset.mobileEditor = String(active);
    const current = host.current()?.id;
    if (current !== docId || !active || host.preview() || host.enabled() === false) {
      reveal();
      override = null;
      docId = current;
    }
    toggle.hidden = !active || !formatAvailable();
    jump.hidden = !active;
    saved.hidden = !active;
    summary.hidden = !active;
    git.hidden = !active;
    if (active) {
      const tools = $('#document-tools');
      if (tools && tools.parentElement !== top) top.insertBefore(tools, global);
      for (const node of arrows) {
        if (node.parentElement !== menu) menu.insertBefore(node, outline);
        node.setAttribute('role', 'menuitem');
      }
      for (const id of ['current-chapter', 'word-count'])
        if ($('#' + id).parentElement !== summary) summary.append($('#' + id));
      const group = host.shell.groups.document;
      for (const id of ['display-options', 'sync-state'])
        if ($('#' + id)?.parentElement !== group) group.append($('#' + id));
      const pluginBottom = $('#plugin-bottom-toolbar');
      if (pluginBottom.parentElement !== host.shell.groups.extensions)
        host.shell.groups.extensions.append(pluginBottom);
      body.dataset.mobileSingle = String(host.workspace().openIds.length <= 1);
      const selected = editable() && !host.view().state.selection.main.empty;
      if (selected) reveal();
      const expanded = formatAvailable() && (override ?? selected);
      body.dataset.mobileFormat = String(expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      outline.disabled = $('#outline-toggle').disabled;
    } else {
      closeMenu();
      body.dataset.mobileFormat = 'false';
      body.dataset.mobileImmersed = 'false';
      if (changed)
        for (const { node, anchor, role } of moved) {
          if (node.previousSibling !== anchor) anchor.after(node);
          if (role === null) node.removeAttribute('role');
          else node.setAttribute('role', role);
        }
      const tools = $('#document-tools'),
        display = $('#display-options'),
        wide = innerWidth > 900;
      if (tools && tools.parentElement === top) {
        if (wide) row.append(tools);
        else $('.paper').insertBefore(tools, $('#editor'));
      }
      if (display && display.closest('#toolbar-overflow')) (wide ? tools : row).append(display);
      const sync = $('#sync-state');
      if (sync?.closest('#toolbar-overflow')) host.shell.toolbar.prepend(sync);
      $('#quick-save').setAttribute('aria-label', $('#quick-save').title);
    }
    const height =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--app-height'),
        ) || innerHeight,
      nowKeyboard = body.dataset.keyboard === 'true';
    if (oldWidth !== innerWidth || height > oldHeight + 80 || (keyboard && !nowKeyboard)) reveal();
    if (height !== oldHeight && editable())
      requestAnimationFrame(() => {
        if (editable()) host.revealCaret();
      });
    oldWidth = innerWidth;
    oldHeight = height;
    keyboard = nowKeyboard;
    localize();
    if (changed) {
      host.shell.layout();
      host.modeChanged();
    }
  }
  function input(update) {
    if (!active) return;
    if (update.selectionSet && !update.docChanged) {
      override = null;
      if (!update.state.selection.main.empty) reveal();
    }
    if (
      update.docChanged &&
      update.transactions.some(
        (tr) => tr.isUserEvent('input.type') || tr.isUserEvent('input.compose'),
      ) &&
      editable() &&
      update.view.hasFocus
    ) {
      const now = performance.now();
      burst = burst.filter((time) => now - time < 2000);
      burst.push(now);
      if (burst.length >= 3 && host.enabled() !== false) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(hide);
      }
    }
    updateChromeSoon();
  }
  let updateFrame = 0;
  const updateChromeSoon = () => {
    if (!updateFrame)
      updateFrame = requestAnimationFrame(() => {
        updateFrame = 0;
        update();
      });
  };
  toggle.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  jump.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  toggle.onclick = () => {
    reveal();
    override = !(override ?? (editable() && !host.view().state.selection.main.empty));
    update();
    host.view()?.requestMeasure();
  };
  jump.onclick = (event) => {
    reveal();
    if (closeMenu()) return;
    keyboardMenu = event.detail === 0;
    menu.hidden = false;
    jump.setAttribute('aria-expanded', 'true');
    const height =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--app-height'),
      ) || innerHeight;
    menu.style.maxHeight = Math.max(44, height - 64) + 'px';
    menu.style.top =
      Math.max(
        4,
        Math.min(
          quick.getBoundingClientRect().top - menu.getBoundingClientRect().height - 8,
          height - menu.getBoundingClientRect().height - 8,
        ),
      ) + 'px';
    if (keyboardMenu) menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  };
  menu.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  menu.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('button:not(:disabled)')) closeMenu();
    },
    { signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!menu.hidden)
        menuKey(event, [...menu.querySelectorAll('button')], {
          close: () => closeMenu(),
          returnFocus: keyboardMenu ? jump : host.view()?.contentDOM,
          trapTab: true,
        });
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !jump.contains(event.target)) closeMenu();
      if (
        immersed &&
        (event.clientY < 44 ||
          event.clientY >
            (Number.parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--app-height'),
            ) || innerHeight) -
              44 ||
          event.target.closest('button,dialog,input,select'))
      )
        reveal();
      touch = { y: event.clientY, x: event.clientX };
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (immersed && touch && touch.y - event.clientY > 32) reveal();
    },
    { signal, passive: true },
  );
  document.addEventListener(
    'touchstart',
    (event) => {
      touch = event.touches[0] ? { y: event.touches[0].clientY } : null;
    },
    { signal, passive: true },
  );
  document.addEventListener(
    'touchmove',
    (event) => {
      if (immersed && touch && event.touches[0] && touch.y - event.touches[0].clientY > 32)
        reveal();
    },
    { signal, passive: true },
  );
  document.addEventListener(
    'wheel',
    (event) => {
      if (immersed && Math.abs(event.deltaY) > 4) reveal();
    },
    { signal, passive: true },
  );
  document.addEventListener(
    'compositionend',
    () => {
      if (burst.length >= 3 && !frame) frame = requestAnimationFrame(hide);
    },
    { signal },
  );
  const observer = new MutationObserver(() => {
    if (document.querySelector('dialog[open]') || host.shell.menuOpen) {
      reveal();
      closeMenu();
    }
  });
  observer.observe($('#dialog'), { attributes: true, attributeFilter: ['open'] });
  observer.observe($('#more-tools'), { attributes: true, attributeFilter: ['aria-expanded'] });
  window.addEventListener('resize', updateChromeSoon, { signal });
  return {
    update,
    input,
    reveal,
    closeMenu,
    get active() {
      return active;
    },
    status(message, dirty) {
      saveMessage = message;
      saveDirty = dirty;
      localize();
    },
    dispose() {
      owner.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(updateFrame);
      menu.remove();
    },
  };
}
