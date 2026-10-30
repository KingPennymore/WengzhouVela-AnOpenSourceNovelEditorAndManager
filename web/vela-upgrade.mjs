// Upgrade at workspace boundaries, never in the read-only parser. Invalid or future files remain untouched.
import { parseVela, velaText, readingLayout, GLOBAL_VELA_PATH } from './vela.mjs';
import { repoPath } from './model.mjs';
const checked = new WeakMap();
export function upgradeVela(text, path = '') {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) return null;
  const raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!raw || raw.kind === 'document' || ![1, 2].includes(raw.version)) return null;
  let next;
  if (raw.version === 2) next = { ...parseVela(text), version: 3 };
  else {
    // The version 1 contract is the one shipped in v0.7.1; unknown extension fields are retained.
    if (
      typeof raw.name !== 'string' ||
      raw.name.length > 160 ||
      !Array.isArray(raw.reading?.files) ||
      raw.reading.files.length > 5000 ||
      (raw.scope !== undefined && raw.scope !== 'global')
    )
      return null;
    const global = raw.scope === 'global' || path === GLOBAL_VELA_PATH;
    const items = [...new Set(raw.reading.files.map(repoPath))].map((path) => ({ path }));
    next = {
      ...raw,
      version: 3,
      kind: global ? 'global' : 'workspace',
      editor: { ...raw.editor, fontSize: raw.fontSize ?? 16 },
      chapters: { ...raw.chapters, templates: raw.titleTemplates ?? [] },
    };
    const layout = readingLayout(raw.reading.layout);
    if (global) {
      next.reader = {
        ...raw.reader,
        appearancePolicy: raw.reader?.appearancePolicy || 'project',
        layout: { ...raw.reader?.layout, ...layout },
      };
      next.library = { ...raw.library, mode: 'manual', items };
      next.reading = { ...raw.reading };
    } else {
      next.id = raw.id || crypto.randomUUID();
      next.project = {
        ...raw.project,
        name: raw.name.trim() || path.split('/').slice(0, -1).at(-1) || 'Vela',
      };
      next.reading = { ...raw.reading, items, layout };
    }
    for (const key of ['name', 'fontSize', 'titleTemplates', 'scope']) delete next[key];
    delete next.reading.files;
  }
  return velaText(next); // Validate every mapped value before changing the source document.
}
export function upgradeWorkspaceVela(workspace, { change, now = Date.now } = {}) {
  const changed = [];
  for (const doc of workspace.documents || []) {
    if (!/\.vela$/i.test(doc.name) || checked.get(doc) === doc.text) continue;
    checked.set(doc, doc.text);
    try {
      const text = upgradeVela(doc.text, doc.path || doc.name);
      if (!text || text === doc.text) continue;
      // Keep the exact source in the ordinary, exportable local history before automatic conversion.
      const history = workspace.localHistory?.[doc.id] || [];
      if (history.at(-1)?.text !== doc.text)
        workspace.localHistory = {
          ...workspace.localHistory,
          [doc.id]: [
            ...history,
            { text: doc.text, createdAt: now(), revision: doc.revision || 0 },
          ].slice(-10),
        };
      if (change) change(doc, text);
      else {
        doc.text = text;
        doc.updatedAt = now();
        doc.revision = (doc.revision || 0) + 1;
      }
      checked.set(doc, doc.text);
      changed.push(doc.id);
    } catch {
      /* Malformed legacy values stay available for source repair; other documents can still upgrade. */
    }
  }
  return changed;
}
