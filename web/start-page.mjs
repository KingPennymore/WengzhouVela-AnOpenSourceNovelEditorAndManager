import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { escapeHtml as esc } from './text-utils.mjs';
import { mountIncrementalList } from './incremental-list.mjs';

const actions = [
  ['new-doc', 'newFile', '新建文件'],
  ['import-doc', 'import', '导入文件'],
  ['guide', 'guide', '查看操作指南'],
  ['commands', 'commands', '查看命令与快捷键'],
  ['plugins', 'plugins', '管理插件与组件'],
  ['check-update', 'update', '检查更新'],
  ['settings', 'settings', '打开设置'],
];
const actionButton = ([action, name, label]) =>
  `<button type="button" class="ui-button ui-button--secondary start-action" data-start="${action}"><span class="start-action-icon">${icon(name)}</span><strong>${t(label)}</strong></button>`;

// This entire view (including its incremental full-file list) is outside the static startup chain.
export function mountStartPage(root, host) {
  const { workspace, kind, path, fileIcon, signal } = host;
  const all = [...workspace.documents].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
  const files = all.filter((d) => kind(d) !== 'VELA'),
    projects = all.filter((d) => kind(d) === 'VELA' && path(d) !== host.globalPath);
  const resume = workspace.settings.startWithEmptyHome
      ? null
      : files.find((d) => d.id === workspace.settings.lastWritingId) || files[0],
    panel = root.dataset.panel || 'actions';
  const row = (doc) =>
    `<button type="button" class="ui-list-row" data-recent="${esc(doc.id)}"><span class="file-kind" aria-hidden="true">${fileIcon(kind(doc))}</span><span class="recent-copy"><strong data-user-content>${esc(doc.name)}</strong><small data-user-content>${esc(path(doc).includes('/') ? path(doc).slice(0, path(doc).lastIndexOf('/')) : t('内部文件夹'))} · <time datetime="${new Date(doc.updatedAt).toISOString()}">${new Date(doc.updatedAt).toLocaleDateString(workspace.settings.language === 'en' ? 'en' : 'zh-CN')}</time></small></span>${icon('arrowRight')}</button>`;
  root.classList.add('start-redesign');
  root.innerHTML = `<div class="start-content">
    <header class="start-page-header">${icon('write')}<h1>${t('文舟')}</h1></header>
    <section class="start-resume">${resume ? `<button type="button" class="ui-card resume-card" data-start="continue" data-doc="${esc(resume.id)}"><span class="resume-kicker">${t('继续写作')}${icon('arrowRight')}</span><strong data-user-content>${esc(resume.name)}</strong><span class="resume-chapter" data-user-content>${t('全文')}</span><span class="resume-today">${t('今日字数')}<strong data-today>${host.daily()}</strong></span></button>` : `<div class="ui-empty">${icon('newFile')}<h2>${t('开始你的第一篇文稿')}</h2><p>${t('新建文稿，或从设备导入已有文件。')}</p><div class="start-empty-actions">${actionButton(actions[0])}${actionButton(actions[1])}</div></div>`}</section>
    <div class="start-stats" aria-label="${t('文件统计')}">${[
      [files.length, '本地文件'],
      [projects.length, '工作区'],
      [files.filter(host.readable).length, '阅读文件'],
    ]
      .map(([n, label]) => `<span class="start-stat"><strong>${n}</strong>${t(label)}</span>`)
      .join('')}</div>
    <section id="start-recent-panel" class="start-recent" aria-labelledby="start-recent-heading"><header class="start-recent-header"><h2 id="start-recent-heading">${t('最近文稿')}</h2><button type="button" class="ui-button ui-button--text start-back" data-start="back" hidden>${t('返回启动页')}</button></header><div class="recent-files"></div></section>
    <section id="start-actions-panel" class="start-menu" aria-label="${t('启动页操作')}">${actions
      .filter(([id]) => resume || !['new-doc', 'import-doc'].includes(id))
      .map(actionButton)
      .join('')}</section>
  </div>`;
  const list = root.querySelector('.recent-files');
  let listController;
  root.setStartPanel = (name, { focus = true } = {}) => {
    listController?.dispose?.();
    const expanded = name === 'recent';
    root.dataset.panel = expanded ? 'recent' : 'actions';
    list.replaceChildren();
    listController = mountIncrementalList(list, {
      items: expanded ? all : files.slice(0, 5),
      renderItem: row,
      signal,
      empty: t('暂无本地文件'),
    });
    const back = root.querySelector('.start-back'),
      trigger = root.querySelector('[data-start=recent]');
    back.hidden = !expanded;
    trigger?.setAttribute('aria-expanded', String(expanded));
    trigger?.setAttribute('aria-controls', 'start-recent-panel');
    if (focus) (expanded ? back : root.querySelector('.resume-card'))?.focus({ preventScroll: true });
  };
  root.setStartPanel(panel, { focus: false });
  // Defer resume indexing to a frame after mounting; stale sessions never write DOM.
  const frame = requestAnimationFrame(() => {
    if (!signal.aborted && resume)
      root.querySelector('.resume-chapter').textContent = host.chapter(resume);
  });
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    if (signal.aborted) return;
    const target = root.querySelector('[data-today]');
    if (target) target.textContent = host.daily();
    const now = new Date(),
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(refresh, Math.max(1, next - now));
  };
  refresh();
  document.addEventListener('visibilitychange', refresh, { signal });
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      delete root.setStartPanel;
    },
    { once: true },
  );
}
