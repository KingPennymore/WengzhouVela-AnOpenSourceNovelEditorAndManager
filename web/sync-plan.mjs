import { downloadDeletions, sameRepository } from './sync-repository.mjs';
import { sameGitHost } from './git-host.mjs';
import { textFingerprint, personalFile } from './document-service.mjs';
import { repoPath, encodeContent } from './model.mjs';
import { syncTextEqual, preserveVelaPositions, mergeVelaTexts } from './vela-sync.mjs';
import { parseVela } from './vela.mjs';
export function downloadPlan(workspace, result, folder) {
  const base =
    workspace.repositories?.find(
      (item) =>
        sameGitHost(item, result) &&
        item.repo.toLowerCase() === result.repo.toLowerCase() &&
        item.branch === result.branch &&
        item.folder === folder,
    )?.baseFiles || {};
  const plan = result.files.map((remoteFile) => {
    const path = folder + '/' + remoteFile.path,
      doc =
        workspace.documents.find((doc) => (doc.path || doc.name) === path) ||
        workspace.documents.find(
          (doc) =>
            sameGitHost(doc.remote, result) &&
            doc.remote?.repo?.toLowerCase() === result.repo.toLowerCase() &&
            doc.remote.branch === result.branch &&
            doc.remote.path === remoteFile.path,
        ),
      entry = workspace.entries?.find((item) => item.path === path),
      previous = base[remoteFile.path];
    let file = remoteFile,
      state = 'new';
    if (doc?.remote?.branch && !sameRepository(doc.remote, result)) {
      return { file, path, doc, docPath: doc.path || doc.name, beforeText: doc.text, state: 'branch-conflict', selected: false };
    }
    if (doc) {
      const baseline = doc.remote?.lastSyncedText;
      if (syncTextEqual(path, doc.text, file.text)) state = 'unchanged';
      else if (
        typeof file.text === 'string' &&
        (syncTextEqual(path, baseline, file.text) || previous?.hash === textFingerprint(file.text))
      )
        state = 'local';
      else if (
        syncTextEqual(path, baseline, doc.text) ||
        previous?.hash === textFingerprint(doc.text)
      )
        state = 'remote';
      else state = 'conflict';
      if (typeof file.text === 'string') {
        const merged =
          state === 'conflict' ? mergeVelaTexts(path, baseline, doc.text, file.text) : null;
        if (merged !== null) state = 'merged';
        const text = merged ?? preserveVelaPositions(path, file.text, doc.text);
        if (text !== file.text)
          file = { ...file, remoteText: file.text, text, data: encodeContent(text) };
      }
    } else if (entry) state = previous?.sha === file.sha ? 'unchanged' : 'conflict';
    return {
      file,
      path,
      doc,
      // A document matched through its remote link can live outside the pull folder; staleness is judged at its own path.
      docPath: doc && (doc.path || doc.name),
      beforeText: doc?.text,
      state,
      selected: !['unchanged', 'conflict', 'local'].includes(state),
    };
  });
  return plan.concat(downloadDeletions(workspace, result, folder));
}
export function commitPlan(
  files,
  association,
  { includePrivate = false, baseText = () => undefined } = {},
) {
  const base = association?.baseFiles || {},
    live = new Set(files.map((file) => file.path));
  const items = files
    .filter((file) => includePrivate || !personalFile(file.path))
    .map((file) => {
      const previous = base[file.path];
      if (!previous) return { file, state: 'new' };
      let unchanged = previous.hash === textFingerprint(file.text ?? file.data);
      if (!unchanged && /\.vela$/i.test(file.path) && typeof file.text === 'string') {
        const before = baseText(file);
        unchanged =
          typeof before === 'string' &&
          previous.hash === textFingerprint(before) &&
          syncTextEqual(file.path, file.text, before);
      }
      return {
        file,
        state: previous.remoteDeleted ? 'remote-deleted' : unchanged ? 'unchanged' : 'modified',
      };
    });
  for (const path of Object.keys(base))
    if (!live.has(path) && !personalFile(path) && !base[path].remoteDeleted)
      items.push({ file: { path, delete: true }, state: 'deleted' });
  return items;
}
export function dependencyPaths(path, text) {
  const result = new Set();
  if (/\.vela$/i.test(path)) {
    try {
      const config = parseVela(text),
        folder = path.split('/').slice(0, -1).join('/');
      for (const editor of [
        config.editor,
        config.workspaceDefaults?.editor,
        ...Object.values(config.files || {}).map((value) => value.editor),
      ])
        for (const relative of editor?.glossaries || [])
          result.add(repoPath((folder ? folder + '/' : '') + relative));
    } catch {}
  }
  const expressions = [
    /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /(?:url\(\s*["']?|@import\s*["'])([^\s"')]+)["']?\)?/gi,
    /!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
    /(?:\bimport\s*(?:[^;\n]*?\sfrom\s*)?|\bexport\s+[^;\n]*?\sfrom\s*|\bimport\s*\()\s*["'](\.[^"']+)["']/g,
    /\\(?:input|include|includegraphics|bibliography|addbibresource)\s*(?:\[[^\]]*\])?\{([^}]+)\}/g,
  ];
  for (const expression of expressions)
    for (const match of text.matchAll(expression)) {
      let value = match[1].split(/[?#]/)[0];
      if (!value || /^(?:[a-z]+:|\/)/i.test(value)) continue;
      try {
        value = decodeURIComponent(value);
      } catch {
        continue;
      }
      const parts = path.split('/').slice(0, -1);
      let safe = true;
      for (const part of value.split('/')) {
        if (part === '..') {
          if (!parts.length) {
            safe = false;
            break;
          }
          parts.pop();
        } else if (part && part !== '.') parts.push(part);
      }
      if (safe)
        try {
          result.add(repoPath(parts.join('/')));
        } catch {}
    }
  return [...result];
}
