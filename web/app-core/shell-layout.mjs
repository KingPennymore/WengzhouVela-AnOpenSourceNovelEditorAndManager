// @ts-check
import { t } from '../i18n.mjs';

/**
 * Move existing controls instead of replacing them, preserving handlers and plugin roots.
 * Kept stateless because viewport binding can call this during entry-point evaluation.
 * @param {Document} document
 * @param {number} width
 * @param {boolean} home
 */
export function layoutShell(document, width, home) {
  /** @type {HTMLElement | null} */
  let tools = document.getElementById('document-tools');
  /** @type {HTMLElement | null} */
  let actions = document.querySelector('.status-actions');
  if (!tools) {
    tools = document.createElement('div');
    tools.id = 'document-tools';
    tools.className = 'document-tools';
    const scroller = document.createElement('div');
    scroller.className = 'document-tools-scroll';
    tools.append(scroller);
  }
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'status-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', t('快捷操作'));
  }
  const scroller = tools.querySelector('.document-tools-scroll');
  const display = document.getElementById('display-options');
  const rowbar = document.querySelector('.file-rowbar');
  const wide = width > 900;
  const mode = wide ? 'wide' : 'narrow';
  if (!scroller || !rowbar) throw new Error('应用布局容器缺失');
  if (document.body.dataset.shell !== mode) {
    for (const id of ['markdown-tools', 'format-tools', 'plugin-document-toolbar']) {
      const element = document.getElementById(id);
      if (element) scroller.append(element);
    }
    const paper = document.querySelector('.paper');
    const quickbar = document.querySelector('.quickbar');
    const status = document.querySelector('.statusbar');
    if (!paper || !quickbar || !status) throw new Error('应用布局容器缺失');
    // Narrow screens: chapter and counts sit under the tab bar, the format tools just above the quick bar.
    if (wide) rowbar.append(tools);
    else paper.append(tools);
    if (wide) {
      status.insertBefore(actions, status.querySelector('.status-right'));
      actions.append(...quickbar.childNodes);
      quickbar.after(status);
    } else {
      quickbar.append(...actions.childNodes);
      actions.remove();
      rowbar.after(status);
    }
    document.body.classList.toggle('wide-shell', wide);
    document.body.dataset.shell = mode;
  }
  const toolbars = [...scroller.children].some(
    (child) => child instanceof HTMLElement && !child.hidden && child.childElementCount,
  );
  // On narrow screens the tools row is its own full-width line; the view switch stays in the tab bar.
  const displayHome = wide ? tools : rowbar;
  if (display && display.parentElement !== displayHome) displayHome.append(display);
  tools.hidden =
    home || (!toolbars && !tools.contains(display)) || (!toolbars && !display?.childElementCount);
}
