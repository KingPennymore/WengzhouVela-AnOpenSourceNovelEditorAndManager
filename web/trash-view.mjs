import { icon, fileIcon } from './icons.mjs';
import { fileKind } from './model.mjs';
import { basename, parentPath } from './file-manager.mjs';
import { t } from './i18n.mjs';

/** A transient manager over the existing trash, with no second copy of saved files. */
export function mountTrash(root, { items, escape: esc, apply }) {
  let selected = new Set(), query = '', busy = false, confirming = null;
  const events = new AbortController(), signal = events.signal;
  root.trashDispose = () => { events.abort(); root.trashDispose = null; };
  root.innerHTML = `<section class="trash-manager">
    <div class="trash-intro"><span class="trash-emblem">${icon('trash')}</span><div><strong>${t('找回最近删除的文件')}</strong><p>${t('恢复到原位置；永久删除后无法找回。')}</p></div><span id="trash-total"></span></div>
    <div class="trash-toolbar"><label class="trash-search">${icon('search')}<input id="trash-search" type="search" aria-label="${t('搜索回收站')}" placeholder="${t('搜索名称或原路径')}"></label><button type="button" id="trash-restore-selected">${icon('undo')}<span>${t('恢复所选')}</span></button><button type="button" id="trash-delete-selected" class="danger">${icon('trash')}<span>${t('永久删除所选')}</span></button></div>
    <div class="trash-selection"><label><input type="checkbox" id="trash-select-all">${t('全选当前列表')}</label><span id="trash-selected-count" role="status"></span></div>
    <div class="trash-list" role="group" aria-label="${t('已删除的文件')}"></div>
    <section class="trash-confirm" hidden role="alert"><div><strong></strong><p>${t('此操作无法恢复。')}</p></div><button type="button" id="trash-confirm-cancel">${t('取消')}</button><button type="button" id="trash-confirm-delete" class="destructive">${t('永久删除')}</button></section>
    <p id="trash-progress" role="status" aria-live="polite"></p><p id="trash-error" class="error" role="alert"></p>
  </section>`;
  const find = selector => root.querySelector(selector), visible = () => items.filter(item => item.path.toLocaleLowerCase().includes(query));
  const countText = n => t('已选择 {n} 项').replace('{n}', n);
  function controls() {
    const shown = visible(), all = find('#trash-select-all'), count = shown.filter(item => selected.has(item.id)).length;
    all.checked = shown.length > 0 && count === shown.length; all.indeterminate = count > 0 && count < shown.length; all.disabled = busy || !shown.length;
    find('#trash-selected-count').textContent = countText(selected.size);
    find('#trash-total').textContent = t('{n} 项').replace('{n}', items.length);
    for (const id of ['trash-restore-selected', 'trash-delete-selected']) find('#' + id).disabled = busy || !selected.size;
    for (const field of root.querySelectorAll('.trash-list input,.trash-list button,#trash-search,#trash-confirm-cancel,#trash-confirm-delete')) field.disabled = busy;
    root.setAttribute('aria-busy', String(busy));
  }
  function render() {
    const shown = visible();
    find('.trash-list').innerHTML = shown.map(item => `<article class="trash-item${selected.has(item.id) ? ' is-selected' : ''}">
      <label class="trash-item-select"><input type="checkbox" data-trash-select="${esc(item.id)}" aria-label="${esc(t('选择') + ' ' + item.path)}" ${selected.has(item.id) ? 'checked' : ''}><span class="trash-kind">${item.directory ? icon('files') : fileIcon(fileKind(basename(item.path)))}</span><span class="trash-item-name"><strong data-user-content>${esc(basename(item.path))}</strong><small data-user-content>${esc(parentPath(item.path) || t('根目录'))}</small></span></label>
      <time datetime="${new Date(item.createdAt).toISOString()}">${esc(new Date(item.createdAt).toLocaleString())}</time><div class="trash-item-actions"><button type="button" data-restore="${esc(item.id)}" aria-label="${t('恢复')}" title="${t('恢复')}">${icon('undo')}</button><button type="button" data-permanent="${esc(item.id)}" aria-label="${t('永久删除')}" title="${t('永久删除')}">${icon('trash')}</button></div></article>`).join('') || `<div class="trash-empty">${icon(query ? 'search' : 'trash')}<strong>${t(query ? '没有匹配的项目' : '当前工作区的回收站为空。')}</strong></div>`;
    controls();
  }
  function confirm(ids) {
    confirming = ids; const pane = find('.trash-confirm'); pane.hidden = false;
    pane.querySelector('strong').textContent = t('永久删除选中的 {n} 项？').replace('{n}', ids.length);
    find('#trash-confirm-delete').focus();
  }
  async function run(ids, permanent = false) {
    if (busy || !ids.length) return;
    busy = true; find('#trash-error').textContent = ''; controls();
    try {
      const result = await apply(ids, permanent, (done, total) => { find('#trash-progress').textContent = t('正在处理 {done}/{total}').replace('{done}', done).replace('{total}', total); });
      items = result.items; selected = new Set(result.failed || []);
      find('#trash-error').textContent = (result.errors || []).join('\n');
      find('#trash-progress').textContent = t('已完成 {n} 项').replace('{n}', ids.filter(id => !selected.has(id)).length);
    } catch (error) { find('#trash-error').textContent = t(error.message); }
    finally { busy = false; confirming = null; find('.trash-confirm').hidden = true; render(); }
  }
  root.addEventListener('input', event => {
    if (event.target.id === 'trash-search') { query = event.target.value.toLocaleLowerCase(); render(); }
  }, { signal });
  root.addEventListener('change', event => {
    if (busy) return;
    if (event.target.id === 'trash-select-all') for (const item of visible()) event.target.checked ? selected.add(item.id) : selected.delete(item.id);
    else if (event.target.matches('[data-trash-select]')) event.target.checked ? selected.add(event.target.dataset.trashSelect) : selected.delete(event.target.dataset.trashSelect);
    else return;
    for (const row of root.querySelectorAll('.trash-item')) { const field = row.querySelector('input'); field.checked = selected.has(field.dataset.trashSelect); row.classList.toggle('is-selected', field.checked); }
    controls();
  }, { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.dataset.restore) run([button.dataset.restore]);
    else if (button.dataset.permanent) confirm([button.dataset.permanent]);
    else if (button.id === 'trash-restore-selected') run([...selected]);
    else if (button.id === 'trash-delete-selected') confirm([...selected]);
    else if (button.id === 'trash-confirm-delete') run(confirming, true);
    else if (button.id === 'trash-confirm-cancel') { confirming = null; find('.trash-confirm').hidden = true; }
  }, { signal });
  render();
}
