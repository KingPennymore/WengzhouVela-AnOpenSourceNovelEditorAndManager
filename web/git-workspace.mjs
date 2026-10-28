import { sameRepository, repositoryAssociation, assertDownloadTarget } from './sync-repository.mjs';
import { gitIdentity, sameGitHost } from './git-host.mjs';
import { newDocument, repoPath, MAX_TEXT_BYTES } from './model.mjs';
import { documentPath, uniquePath } from './workspace.mjs';
import { personalFile, textFingerprint } from './document-service.mjs';
import {textBytes} from './text-utils.mjs';

export function resolveRepositoryConflict(
  workspace,
  { provider = 'github', server, repo, branch, path, sha, text },
) {
  const association = workspace.repositories?.find((item) =>
    sameRepository(item, { provider, server, repo, branch }),
  );
  if (!association) return;
  association.baseFiles = {
    ...association.baseFiles,
    [path]: { sha, hash: textFingerprint(text) },
  };
  association.conflicts = (association.conflicts || []).filter((value) => value !== path);
  if (!association.conflicts.length && association.pendingCommit) {
    association.commit = association.pendingCommit;
    delete association.pendingCommit;
  }
}

export function applyRemoteFile(
  workspace,
  { repo, branch, path, text, remoteText = text, sha, provider = 'github', server },
  prefix = '',
) {
  path = repoPath(path);
  let doc = workspace.documents.find(
    (doc) =>
      sameRepository(doc.remote, { provider, server, repo, branch }) && doc.remote.path === path,
  );
  const localPath = (prefix ? prefix + '/' : '') + path;
  if (!doc) {
    const occupied = new Set([
      ...workspace.documents.map(documentPath),
      ...(workspace.entries || []).map((entry) => entry.path),
    ]);
    const target = uniquePath(localPath, occupied);
    doc = { ...newDocument(target.split('/').at(-1), text), path: target };
    workspace.documents.unshift(doc);
  }
  doc.text = text;
  doc.updatedAt = Date.now();
  doc.remote = {
    ...(provider === 'github' ? {} : gitIdentity({ provider, server })),
    repo,
    branch,
    path,
    sha,
    lastSyncedText: remoteText,
    syncedAt: Date.now(),
  };
  return doc;
}
export function repositoryFolder(workspace, repo, provider = 'github', server, branch) {
  const existing = workspace.repositories?.find(
    (item) =>
      sameGitHost(item, { provider, server }) &&
      item.repo.toLowerCase() === repo.toLowerCase() &&
      (!branch || item.branch === branch),
  );
  if (existing) return existing.folder;
  const folders = new Set([
    ...(workspace.folders || []),
    ...workspace.documents.map((doc) => documentPath(doc).split('/')[0]),
  ]);
  const hasOther = workspace.repositories?.some(
    (item) =>
      sameGitHost(item, { provider, server }) &&
      item.repo.toLowerCase() === repo.toLowerCase() &&
      branch &&
      item.branch !== branch,
  );
  const folder = uniquePath(
    repo.split('/')[1] + (hasOther ? ' (' + branch.replace(/[^\p{L}\p{N}._-]/gu, '-') + ')' : ''),
    folders,
  );
  return folder;
}
export function applyRepository(workspace, result, folder) {
  assertDownloadTarget(workspace, result, folder);
  workspace.repositories = workspace.repositories || [];
  const old = repositoryAssociation(workspace, result, folder);
  const baseFiles = {
    ...old?.baseFiles,
    ...Object.fromEntries(
      [...(result.observedFiles || []), ...result.files].map((file) => [
        file.path,
        { sha: file.sha, hash: textFingerprint(file.remoteText ?? file.text ?? file.data) },
      ]),
    ),
  };
  const remoteDeletedPaths = new Set(result.remoteDeletedPaths || []);
  if (
    result.fullSnapshot === true &&
    result.selection === null &&
    Array.isArray(result.remotePaths) &&
    !old?.prefix
  ) {
    const paths = new Set(result.remotePaths);
    for (const path of Object.keys(old?.baseFiles || {}))
      if (!paths.has(path) && !personalFile(path)) remoteDeletedPaths.add(path);
  }
  for (const path of remoteDeletedPaths)
    if (baseFiles[path]) {
      const local = (folder ? folder + '/' : '') + path;
      if (
        !workspace.documents.some((doc) => documentPath(doc) === local) &&
        !workspace.entries?.some((entry) => entry.path === local)
      )
        delete baseFiles[path];
      else baseFiles[path] = { ...baseFiles[path], remoteDeleted: true };
    }
  for (const file of result.deletions || []) delete baseFiles[file.path];
  if (old) Object.assign(old, { folder, branch: result.branch, commit: result.commit, baseFiles });
  else
    workspace.repositories.push({
      ...(result.provider && result.provider !== 'github' ? gitIdentity(result) : {}),
      repo: result.repo,
      folder,
      branch: result.branch,
      commit: result.commit,
      baseFiles,
    });
  workspace.folders = [
    ...new Set([
      ...(workspace.folders || []),
      folder,
      ...result.folders.map((path) => folder + '/' + path),
    ]),
  ];
  for (const file of result.files) {
    if (file.text === null || textBytes(file.text) > MAX_TEXT_BYTES) continue;
    const path = folder + '/' + file.path;
    const exact = workspace.documents.find((doc) => documentPath(doc) === path);
    const tracked = workspace.documents.find(
      (doc) => sameRepository(doc.remote, result) && doc.remote.path === file.path,
    );
    if (exact?.remote?.branch && !sameRepository(exact.remote, result))
      throw Error('本地路径属于其他分支，请使用独立文件夹。');
    let doc = tracked || exact;
    if (tracked && exact && tracked !== exact) {
      workspace.documents = workspace.documents.filter((d) => d !== exact);
      workspace.openIds = workspace.openIds.filter((id) => id !== exact.id);
    }
    if (!doc) {
      doc = newDocument(file.path.split('/').at(-1), file.text);
      workspace.documents.push(doc);
    }
    Object.assign(doc, {
      name: file.path.split('/').at(-1),
      path,
      text: file.text,
      updatedAt: Date.now(),
      remote: {
        ...(result.provider && result.provider !== 'github' ? gitIdentity(result) : {}),
        repo: result.repo,
        branch: result.branch,
        path: file.path,
        sha: file.sha,
        lastSyncedText: file.remoteText ?? file.text,
        syncedAt: Date.now(),
      },
    });
  }
  for (const file of result.observedFiles || []) {
    const doc = workspace.documents.find(
      (doc) => sameRepository(doc.remote, result) && doc.remote.path === file.path,
    );
    if (doc)
      doc.remote = {
        ...doc.remote,
        sha: file.sha,
        lastSyncedText: file.remoteText ?? file.text,
        syncedAt: Date.now(),
        deleted: false,
      };
  }
  const removed = new Set(
    (result.deletions || []).map((file) => (folder ? folder + '/' : '') + file.path),
  );
  workspace.documents = workspace.documents.filter((doc) => !removed.has(documentPath(doc)));
  workspace.entries = (workspace.entries || []).filter((entry) => !removed.has(entry.path));
  workspace.openIds = (workspace.openIds || []).filter((id) =>
    workspace.documents.some((doc) => doc.id === id),
  );
  if (!workspace.documents.some((doc) => doc.id === workspace.activeId))
    workspace.activeId = workspace.openIds[0] || null;
  for (const doc of workspace.documents)
    if (sameRepository(doc.remote, result) && remoteDeletedPaths.has(doc.remote.path))
      doc.remote = { ...doc.remote, deleted: true, checkedAt: Date.now() };
  return workspace;
}
