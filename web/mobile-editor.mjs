// Mobile writing chrome owns presentation and input cadence; editing and persistence stay in the host.
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';

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
  // Keep #quick-git in place: planning editors use it as their bottom-action anchor.
  const moved = [
    $('#current-name'),
    $('#plugin-bottom-toolbar'),
    $('#current-chapter'),
    $('#word-count'),
  ].map((node) => {
    const anchor = document.createComment('mobile chrome');
    node.before(anchor);
    return { node, anchor, role: node.getAttribute('role') };
  });
  const heading = document.createElement('div');
  heading.className = 'mobile-editor-heading';
  heading.hidden = true;
  $('.breadcrumb').append(heading);
  const summary = document.createElement('span');
  summary.className = 'mobile-editor-summary';
  heading.append(summary);
  const saved = document.createElement('span');
  saved.className = 'mobile-save-status';
  saved.hidden = true;
  saved.setAttribute('role', 'status');
  $('#quick-save').append(saved);
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
    touch = null;
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
    if (active) {
      const save = $('#quick-save'), name = label + ' · ' + t('保存');
      save.setAttribute('aria-label', name);
      save.title = name;
      const state = saved.dataset.state;
      if (save.dataset.mobileSave !== state) {
        save.dataset.mobileSave = state;
        save.querySelector('span:not(.mobile-save-status)').innerHTML = icon(state === 'failed' ? 'alert' : 'save');
      }
    }
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
    if (current !== docId || !active || host.preview()) {
      reveal();
      override = null;
      docId = current;
    } else if (host.enabled() === false) reveal(); // immersion off: keep the format toolbar choice
    toggle.hidden = !active || !formatAvailable();
    saved.hidden = !active;
    heading.hidden = !active;
    if (active) {
      const tools = $('#document-tools');
      if (tools && tools.parentElement !== top) top.insertBefore(tools, global);
      if ($('#current-name').parentElement !== heading) heading.prepend($('#current-name'));
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
    } else {
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
      $('#quick-save').title = t('保存 (Ctrl+S)');
      $('#quick-save').setAttribute('aria-label', $('#quick-save').title);
      $('#quick-save').querySelector('span:not(.mobile-save-status)').innerHTML = icon('save');
      delete $('#quick-save').dataset.mobileSave;
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
  toggle.onclick = () => {
    reveal();
    override = !(override ?? (editable() && !host.view().state.selection.main.empty));
    update();
    host.view()?.requestMeasure();
  };
  document.addEventListener(
    'pointerdown',
    (event) => {
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
    }
  });
  observer.observe($('#dialog'), { attributes: true, attributeFilter: ['open'] });
  observer.observe($('#more-tools'), { attributes: true, attributeFilter: ['aria-expanded'] });
  window.addEventListener('resize', updateChromeSoon, { signal });
  return {
    update,
    input,
    reveal,
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
    },
  };
}
