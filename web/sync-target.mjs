import {t,say} from './i18n.mjs';
export function syncTarget(target) {
  if (!target) return t('未关联远端');
  return [
    { github: 'GitHub', gitee: 'Gitee', gitea: 'Gitea' }[target.provider || 'github'],
    target.server,
    target.repo,
    target.branch && say(`分支 ${target.branch}`,`Branch ${target.branch}`),
    target.path,
  ]
    .filter(Boolean)
    .join(' / ');
}
export function syncTargetMarkup(target, folder, esc) {
  return (
    `<div class="sync-target"><strong>${t('远端目标')}</strong><span data-user-content>${esc(syncTarget(target))}</span>` +
    (folder !== undefined
    ? `<small data-user-content>${say(`本地文件夹：${esc(folder || t('工作区根目录'))}`,`Local folder: ${esc(folder || t('工作区根目录'))}`)}</small>`
    : '') +
    '</div>'
  );
}
