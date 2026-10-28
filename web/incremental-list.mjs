import {t} from './i18n.mjs';

/** Keep the search field and selection state outside a bounded first batch of list rows. */
export function mountIncrementalList(root, {items = [], renderItem, empty = '', batch = 80, signal, onAppend = () => {}}) {
  root.listDispose?.();
  let values = items, shown = 0, disposed = false;
  const more = document.createElement(root.tagName === 'UL' ? 'li' : 'div'), button = document.createElement('button');
  more.className = 'incremental-more'; button.type = 'button'; button.textContent = t('显示更多'); more.append(button);
  const append = () => {
    if (disposed) return;
    more.remove(); const fragment = document.createDocumentFragment();
    for (const [index, item] of values.slice(shown, shown + batch).entries()) {
      const rendered = renderItem(item, shown + index);
      if (typeof rendered === 'string') { const template = document.createElement('template'); template.innerHTML = rendered; fragment.append(template.content); }
      else fragment.append(rendered);
    }
    shown = Math.min(values.length, shown + batch); root.append(fragment);
    if (shown < values.length) root.append(more);
    onAppend();
  };
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && root.isConnected) append();
  }, {rootMargin:'120px'}) : null;
  button.onclick = append; observer?.observe(more);
  const setItems = next => {
    if (disposed) return;
    values = next; shown = 0; root.replaceChildren();
    if (!values.length && empty) { const p = document.createElement(root.tagName === 'UL' ? 'li' : 'p'); p.className = 'blank'; p.textContent = typeof empty === 'function' ? empty() : empty; root.append(p); }
    append();
  };
  const dispose = () => { if (disposed) return; disposed = true; observer?.disconnect(); if (root.listDispose === dispose) root.listDispose = null; signal?.removeEventListener('abort', dispose); };
  root.listDispose = dispose;
  signal?.addEventListener('abort', dispose, {once:true});
  if (signal?.aborted) dispose(); else setItems(values);
  return {setItems, dispose};
}
