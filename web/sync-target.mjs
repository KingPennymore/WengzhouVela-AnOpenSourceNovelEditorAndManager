export function syncTarget(target) {
  if (!target) return '未关联远端';
  return [
    { github: 'GitHub', gitee: 'Gitee', gitea: 'Gitea' }[target.provider || 'github'],
    target.server,
    target.repo,
    target.branch && `分支 ${target.branch}`,
    target.path,
  ]
    .filter(Boolean)
    .join(' / ');
}

export function syncTargetMarkup(target, folder, esc) {
  return (
    `<div class="sync-target"><strong>远端目标</strong><span data-user-content>${esc(syncTarget(target))}</span>` +
    (folder !== undefined
      ? `<small data-user-content>本地文件夹：${esc(folder || '工作区根目录')}</small>`
      : '') +
    '</div>'
  );
}
