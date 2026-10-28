import { sameGitHost } from './git-host.mjs';
import { documentPath } from './workspace.mjs';
import { personalFile } from './document-service.mjs';
import { repoPath } from './model.mjs';
import { syncTextEqual } from './vela-sync.mjs';
import {MB} from './text-utils.mjs';

export function sameRepository(value, target) {
  return (
    sameGitHost(value, target) &&
    typeof value?.repo === 'string' &&
    value.repo.toLowerCase() === target.repo.toLowerCase() &&
    value.branch === target.branch
  );
}

export function repositoryAssociation(workspace, result, folder) {
  return workspace.repositories?.find(
    (item) => sameRepository(item, result) && (folder === undefined || item.folder === folder),
  );
}

export function assertDownloadTarget(workspace, result, folder) {
  if (
    workspace.repositories?.some((item) => item.folder === folder && !sameRepository(item, result))
  )
    throw Error('此文件夹已关联其他仓库或分支，请使用独立文件夹。');
  for (const file of result.files) {
    const doc = workspace.documents.find(
      (doc) => documentPath(doc) === (folder ? folder + '/' : '') + file.path,
    );
    if (doc?.remote?.branch && !sameRepository(doc.remote, result))
      throw Error('本地路径属于其他分支，请使用独立文件夹。');
  }
}

/** Only a complete, unfiltered immutable repository snapshot can prove a remote deletion. */
export function downloadDeletions(workspace, result, folder) {
  const association = repositoryAssociation(workspace, result, folder);
  if (
    result.fullSnapshot !== true ||
    result.selection !== null ||
    !Array.isArray(result.remotePaths) ||
    !association ||
    association.prefix
  )
    return [];
  const remote = new Set(result.remotePaths);
  const items = [];
  for (const [relative, base] of Object.entries(association.baseFiles || {})) {
    if (remote.has(relative) || personalFile(relative)) continue;
    repoPath(relative);
    const path = folder ? folder + '/' + relative : relative;
    const doc = workspace.documents.find((doc) => documentPath(doc) === path);
    const entry = workspace.entries?.find((entry) => entry.path === path && !entry.directory);
    if (!doc && !entry) continue;
    const foreign = doc?.remote && !sameRepository(doc.remote, result);
    const unchanged =
      !foreign &&
      (doc
        ? typeof doc.remote?.lastSyncedText === 'string' &&
          syncTextEqual(relative, doc.remote.lastSyncedText, doc.text)
        : result.verifiedDeletions?.includes(path));
    const unavailable = result.deletionErrors?.includes(path);
    items.push({
      file: { path: relative, delete: true },
      path,
      doc,
      beforeText: doc?.text,
      expectedData: result.deletionData?.[path],
      state:
        unavailable || foreign
          ? 'delete-unsafe'
          : unchanged
            ? 'remote-deleted'
            : doc
              ? 'delete-modified'
              : 'delete-unsafe',
      selected: false,
    });
  }
  return items;
}

export async function prepareDownload(workspace, result, folder, readFile) {
  if (!readFile) return result;
  const deletionData = {},
    deletionErrors = [],
    verifiedDeletions = [];
  const association = repositoryAssociation(workspace, result, folder);
  let bytes = 0;
  for (const item of downloadDeletions(workspace, result, folder)) {
    try {
      const data = await readFile(item.path);
      if (
        typeof data !== 'string' ||
        data.length > 12*MB ||
        (bytes += data.length) > 96*MB
      )
        throw Error('删除预览超过大小限制。');
      deletionData[item.path] = data;
      if (!item.doc) {
        const sha = association?.baseFiles?.[item.file.path]?.sha;
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha || '')) throw Error('缺少附件同步版本。');
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        const header = new TextEncoder().encode('blob ' + bytes.length + '\0');
        const blob = new Uint8Array(header.length + bytes.length);
        blob.set(header);
        blob.set(bytes, header.length);
        const digest = new Uint8Array(
          await crypto.subtle.digest(sha.length === 40 ? 'SHA-1' : 'SHA-256', blob),
        );
        const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (actual.toLowerCase() !== sha.toLowerCase()) throw Error('附件已在本地修改。');
        verifiedDeletions.push(item.path);
      }
    } catch {
      deletionErrors.push(item.path);
    }
  }
  return { ...result, deletionData, deletionErrors, verifiedDeletions };
}
