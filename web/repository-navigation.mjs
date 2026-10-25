import { sameRepository } from './sync-repository.mjs';
import { documentPath } from './workspace.mjs';
import { syncTextEqual } from './vela-sync.mjs';
import { personalFile } from './document-service.mjs';
import { matchesBlob } from './sync-blob-cache.mjs';

/** Include new and locally deleted manuscripts, not just the active editor. */
export function branchChanges(workspace, target) {
  const paths = new Set();
  for (const doc of workspace.documents)
    if (
      sameRepository(doc.remote, target) &&
      (doc.remote.deleted || !syncTextEqual(documentPath(doc), doc.remote.lastSyncedText, doc.text))
    )
      paths.add(documentPath(doc));
  for (const association of workspace.repositories || []) {
    if (!sameRepository(association, target)) continue;
    const prefix = association.folder ? association.folder + '/' : '';
    const live = new Set([
      ...workspace.documents.map(documentPath),
      ...(workspace.entries || []).filter((entry) => !entry.directory).map((entry) => entry.path),
    ]);
    for (const path of Object.keys(association.baseFiles || {}))
      if (!personalFile(path) && !live.has(prefix + path)) paths.add(prefix + path);
    for (const path of live) {
      if (
        path.startsWith(prefix) &&
        !personalFile(path.slice(prefix.length)) &&
        !association.baseFiles?.[path.slice(prefix.length)]
      )
        paths.add(path);
    }
    for (const path of association.conflicts || []) paths.add(prefix + path);
  }
  return [...paths];
}

/** Attachments have no editor text baseline; compare their actual immutable Git bytes. */
export async function inspectBranchAttachments(workspace, target, readFile) {
  const changed = new Set();
  let total = 0;
  for (const association of workspace.repositories || []) {
    if (!sameRepository(association, target)) continue;
    const prefix = association.folder ? association.folder + '/' : '';
    for (const entry of workspace.entries || []) {
      if (
        entry.directory ||
        !entry.path.startsWith(prefix) ||
        workspace.documents.some((doc) => documentPath(doc) === entry.path)
      )
        continue;
      const relative = entry.path.slice(prefix.length);
      if (personalFile(relative)) continue;
      try {
        if (!readFile) throw Error('附件不可读');
        const data = await readFile(entry.path);
        if (
          typeof data !== 'string' ||
          data.length > 12 * 1024 * 1024 ||
          (total += data.length) > 96 * 1024 * 1024 ||
          !(await matchesBlob(data, association.baseFiles?.[relative]?.sha))
        )
          changed.add(entry.path);
      } catch {
        changed.add(entry.path);
      }
    }
  }
  return [...changed];
}

/** A switch changes remote browsing only; local branch documents keep their identities. */
export function switchRepositoryBranch({
  workspace,
  target,
  next,
  busy,
  save,
  openModal,
  escape: esc,
  apply,
  attachmentChanges = [],
}) {
  const check = () => {
    if (busy()) throw Error('正在同步，请等待完成后再切换分支。');
    if (!save()) throw Error('本地保存失败，未切换分支。');
  };
  check();
  if (next === target.branch) return;
  const changed = [...new Set([...branchChanges(workspace, target), ...attachmentChanges])];
  if (!changed.length) return apply(next);
  openModal(
    '切换分支前确认',
    `<p>${esc(target.repo)}：${esc(target.branch)} → ${esc(next)}</p>` +
      `<p>当前分支有 ${changed.length} 项待同步或需核对的本地项目。已先保存到本机，切换后仍保留在原文件夹。</p>` +
      `<ul>${changed
        .slice(0, 30)
        .map((path) => `<li data-user-content>${esc(path)}</li>`)
        .join('')}</ul>` +
      '<p>切换仅改变仓库浏览目标，不会将当前文稿重新关联到新分支，也不会自动拉取或提交。</p>',
    () => {
      check();
      return apply(next);
    },
    { label: '保留本地变更并切换' },
  );
}
