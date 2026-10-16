import { fileIo as fs } from '@kit.CoreFileKit';

// Incremental workspace saves (docs/WORKSPACE-STORAGE.md). After one, workspace.json and the folder cache hold a
// skeleton: the workspace without document texts and local history, which live in workspace-store/ as
// <id>.<generation> files named by the skeleton's `store`. `store` is always the first key, so a skeleton is told
// apart from the full format by its first bytes.
export interface StoreIndex { format: number; texts: Record<string, string>; histories: Record<string, string>; }
export interface HistoryItem { text: string; createdAt: number; }
export interface StoredText { id: string; name: string; path?: string; text?: string; }
export interface SkeletonWorkspace { store?: StoreIndex; version: number; storage?: StoredStorage; documents: StoredText[]; folders?: string[]; saveId?: string; localHistory?: Record<string, HistoryItem[]>; }
export interface StoredStorage { id: string; }
export interface DeltaMessage { format: number; id: string; base?: string; workspace: SkeletonWorkspace; texts: Record<string, string>; histories: Record<string, HistoryItem[] | null>; }

export const SKELETON_PREFIX = '{"store":';
export function storeFolder(filesDir: string): string { return filesDir + '/workspace-store'; }
export function storeFile(filesDir: string, name: string): string {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,80}\.[0-9a-f]{12}\.(txt|json)$/.test(name)) throw new Error('工作区存储文件名无效。');
  return storeFolder(filesDir) + '/' + name;
}
export function storeNames(raw: string): string[] {
  if (!raw.startsWith(SKELETON_PREFIX)) return [];
  const store = (JSON.parse(raw) as SkeletonWorkspace).store;
  if (!store) return [];
  const names: string[] = [];
  for (const id of (store.texts ? Object.keys(store.texts) : [])) names.push(store.texts[id]);
  for (const id of (store.histories ? Object.keys(store.histories) : [])) names.push(store.histories[id]);
  return names;
}
// Returns the stored workspace with texts and local history filled in, exactly as the full format holds it.
export function hydrateValue(filesDir: string, value: SkeletonWorkspace): SkeletonWorkspace {
  const store = value.store;
  if (!store || store.format !== 2) return value;
  for (const doc of value.documents) {
    if (typeof doc.text === 'string') continue;
    const name = store.texts[doc.id];
    if (!name) throw new Error('工作区存储缺少文稿：' + (doc.path || doc.name));
    doc.text = fs.readTextSync(storeFile(filesDir, name));
  }
  const history: Record<string, HistoryItem[]> = {};
  for (const id of (store.histories ? Object.keys(store.histories) : [])) history[id] = JSON.parse(fs.readTextSync(storeFile(filesDir, store.histories[id]))) as HistoryItem[];
  value.localHistory = history;
  value.store = undefined;
  return value;
}
export function hydrateWorkspace(filesDir: string, raw: string): string {
  return raw.startsWith(SKELETON_PREFIX) ? JSON.stringify(hydrateValue(filesDir, JSON.parse(raw) as SkeletonWorkspace)) : raw;
}
