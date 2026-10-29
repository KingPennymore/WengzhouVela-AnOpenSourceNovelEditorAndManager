// @ts-check

import { newDocument, validateWorkspace } from '../model.mjs';
import { readWorkspaceAsync, primeWorkspaceBaseline, saveWorkspace } from '../platform.mjs';
import { recoverBrowserProjects } from '../project-backend.mjs';
import { isOriginalDemo, previousGuideHashes } from '../guide-history.mjs';
import { loadGuide } from '../lazy.mjs';
import { chapterSettings } from '../chapters.mjs';
import { documentPath, uniquePath, preparePaths, adoptFolder } from '../workspace.mjs';
import { itemPaths, parentPath, basename } from '../file-manager.mjs';
import { DocumentService } from '../document-service.mjs';

/**
 * Startup's view of the legacy model. Other services retain their own additional fields.
 * @typedef {object} WorkspaceDocument
 * @property {string} id
 * @property {string} name
 * @property {string} text
 * @property {number} updatedAt
 * @property {string} [path]
 * @property {object | null} [remote]
 *
 * @typedef {object} WorkspaceSettings
 * @property {boolean} [startWithEmptyHome]
 * @property {string} [theme]
 * @property {string} [language]
 * @property {string} [readingMode]
 * @property {string} [palette]
 * @property {number} [fontSize]
 * @property {string} [clientId]
 * @property {string} [fontFamily]
 * @property {ReturnType<typeof chapterSettings>} [writer]
 *
 * @typedef {object} Workspace
 * @property {number} version
 * @property {WorkspaceDocument[]} documents
 * @property {string[]} openIds
 * @property {string | null} activeId
 * @property {WorkspaceSettings} settings
 * @property {{id?: string}} [storage]
 *
 * @typedef {object} StorageSnapshot
 * @property {{id?: string}} storage
 * @property {WorkspaceDocument[]} documents
 */

/**
 * Recover interrupted transactions before reading; invalid saved data must reach the recovery UI.
 * Settings and path migrations deliberately run before any editor is created.
 * @returns {Promise<Workspace>}
 */
export async function loadWorkspace() {
  await recoverBrowserProjects();
  const raw = await readWorkspaceAsync();
  /** @type {Workspace} */
  let workspace;
  if (raw) {
    workspace = validateWorkspace(JSON.parse(raw));
    primeWorkspaceBaseline(workspace);
  } else {
    const { guide } = await loadGuide();
    // i18n-data: guide file names and the old default document stay as stored
    const doc = newDocument('操作指南.md', guide);
    workspace = {
      version: 1,
      documents: [doc],
      openIds: [doc.id],
      activeId: doc.id,
      settings: { theme: 'system', startWithEmptyHome: true },
    };
  }
  workspace.settings = {
    language: 'zh-CN',
    readingMode: 'scroll',
    theme: 'system',
    palette: 'pine',
    fontSize: 16,
    clientId: '',
    ...workspace.settings,
    writer: chapterSettings(workspace.settings?.writer),
  };
  if (!['system', 'light', 'dark'].includes(workspace.settings.theme ?? '')) {
    workspace.settings.theme = 'system';
  }
  return workspace;
}

/**
 * The getter follows project adoption; capturing one workspace here would save stale documents.
 * @param {() => Workspace} workspace
 * @returns {DocumentService}
 */
export function createDocumentSession(workspace) {
  const documents = new DocumentService({ workspace, write: saveWorkspace });
  for (const doc of workspace().documents) documents.register(doc);
  return documents;
}

/**
 * Register document baselines before calling this so migration edits retain their previous content.
 * @param {Workspace} workspace
 * @param {{initializeStorage: null | (() => Promise<StorageSnapshot>), invalidate: (id: string) => void}} options
 */
export async function prepareWorkspace(workspace, { initializeStorage, invalidate }) {
  preparePaths(workspace);
  if (initializeStorage) {
    const folder = await initializeStorage();
    if (folder.storage.id) {
      adoptFolder(workspace, folder, { migrate: !workspace.storage?.id });
      preparePaths(workspace);
    } else workspace.storage = folder.storage;
  }
  for (const doc of workspace.documents) {
    const demo = await isOriginalDemo(doc);
    // i18n-data: guide file names and the old default document stay as stored
    if (
      demo ||
      (doc.name === '未命名小说.txt' && !doc.remote && doc.text.startsWith('文舟操作指南\n'))
    ) {
      // i18n-data: guide file names and the old default document stay as stored
      renameGuide(workspace, doc, demo ? '操作指南.md' : '操作指南.txt');
      if (demo) doc.text = (await loadGuide()).guide;
      invalidate(doc.id);
    }
  }
  for (const doc of workspace.documents.filter(
    (doc) => /^操作指南\.(txt|md)$/i.test(doc.name) && !doc.remote,
  )) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(doc.text));
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (previousGuideHashes.includes(hash)) {
      // i18n-data: guide file names and the old default document stay as stored
      renameGuide(workspace, doc, '操作指南.md');
      doc.text = (await loadGuide()).guide;
      doc.updatedAt = Date.now();
      invalidate(doc.id);
    }
  }
  workspace.settings.writer = chapterSettings({ ...workspace.settings.writer, titleTemplates: [] });
}

/**
 * @param {Workspace} workspace
 * @param {{id: string, path?: string, name: string}} doc
 * @param {string} name
 */
function renameGuide(workspace, doc, name) {
  const old = documentPath(doc);
  const folder = parentPath(old);
  const target = (folder ? folder + '/' : '') + name;
  doc.path = uniquePath(target, new Set([...itemPaths(workspace)].filter((path) => path !== old)));
  doc.name = basename(doc.path);
}
