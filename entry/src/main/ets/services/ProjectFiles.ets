import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker, fileUri } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { encodeFileText, decodeFileText } from './FileText';
import { previewMime } from './PreviewResource';

interface ProjectEntry { path: string; kind: string; mime: string; size: number; revision: string; modifiedAt: string; entryId?: string; blobId?: string; sha256?: string; }
interface Tree { entries: ProjectEntry[]; totalBytes: number; }
interface Expected { path: string; revision: string | null; }
interface Change { kind: string; path?: string; from?: string; to?: string; text?: string; blobId?: string; }
interface Storage { id: string; }
interface Document { path?: string; name: string; }
interface Workspace { storage: Storage; documents: Document[]; }
interface Request { removedDocuments?: Document[]; root?: string; path?: string; offset?: number; length?: number; expectedRevision?: string; size?: number; mime?: string; sha256?: string; blobId?: string; data?: string; sequence?: number; changes?: Change[]; expected?: Expected[]; workspace?: string; workspaceId?: string; pluginId?: string; taskId?: string; token?: string; outputToken?: string; suggestedName?: string; multiple?: boolean; accept?: string[]; snapshotId?: string; label?: string; includeRoots?: string[]; entries?: ProjectEntry[]; sessionId?: string; allowedRoots?: string[]; purpose?: string; }
interface BlobRecord { owner: string; root: string; file: string; size: number; hash: string; expectedHash: string; sequence: number; last: string; written: number; complete: boolean; expires: number; }
interface Selection { owner: string; file: string; name: string; size: number; mime: string; }
interface Snapshot { id: string; owner: string; workspaceId: string; root: string; label: string; createdAt: string; bytes: number; includeRoots: string[]; entries: ProjectEntry[]; workspace: string; }
interface Session { owner: string; root: string; pluginId: string; workspaceId: string; allowedRoots: string[]; snapshotId: string; expires: number; }
interface Backup { target: string; backup: string; exists: boolean; }
interface Journal { committed: boolean; entries: Backup[]; }
interface Limits { textBytes: number; readChunkBytes: number; bridgeChunkBytes: number; importFileBytes: number; projectEntries: number; archiveExpandedBytes: number; archiveEntries: number; projectBytes: number; snapshotBytes: number; assetBytes: number; }
interface Features { filesystem: boolean; transactions: boolean; assetSessions: boolean; archives: boolean; snapshots: boolean; nativePicker: boolean; independentPreview: boolean; externalWatch: boolean; }
interface ResourceFlags { range: boolean; worker: boolean; canvas2d: boolean; }
interface Capabilities { limits: Limits; features: Features; resource: ResourceFlags; }
interface BlobStart { blobId: string; maxChunkBytes: number; }
interface BlobFinished { blobId: string; size: number; sha256: string; }
interface ChunkResult { acceptedBytes: number; nextSequence: number; }
interface ReadResult { data: string; revision: string; totalSize: number; }
interface SelectionInfo { token: string; name: string; size: number; mime: string; }
interface PickResult { cancelled: boolean; selections: SelectionInfo[]; }
interface SnapshotResult { snapshotId: string; bytes: number; }
interface SnapshotInfo { id: string; label: string; createdAt: string; bytes: number; }
interface StageResult { entries: ProjectEntry[]; }
interface AssetResult { data: string; mime: string; size: number; revision: string; supportsRange: boolean; }
interface AssetSession { sessionId: string; }
interface Delivered { saved: boolean; }
interface Committed { committed: boolean; }
interface TrashRecord { id: string; path: string; directory: boolean; createdAt: number; workspaceId: string; documents: Document[]; repositories: Object[]; }
interface FolderRoot { id: string; path: string; }
interface FolderConfig { current: string; roots: FolderRoot[]; }

export class ProjectFailure extends Error {
  projectCode: string;
  constructor(code: string, message: string) { super(message); this.projectCode = code; }
}
const MB: number = 1024 * 1024;
const CHUNK: number = 256 * 1024;
function fail(code: string, message: string): never { throw new ProjectFailure(code, message); }
function inside(root: string, path: string): boolean { return root === '' || path === root || path.startsWith(root + '/'); }
function relative(path: string, empty: boolean = false): string {
  const value = path.normalize('NFC');
  if (empty && value === '') return value;
  if (!value || value.length > 1024 || /[\\\x00-\x1f<>:"|?*]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) fail('E_INVALID_PATH', '项目相对路径无效。');
  return value;
}

/** Sandbox-only project storage. A durable journal is recovered before workspace reads. */
export class ProjectFiles {
  context: common.UIAbilityContext | undefined = undefined;
  busy: boolean = false;
  private prepared: boolean = false;
  private blobs: Map<string, BlobRecord> = new Map();
  private selections: Map<string, Selection> = new Map();
  private sessions: Map<string, Session> = new Map();
  private cancelled: Set<string> = new Set();
  private stopped: Set<string> = new Set();
  private ctx(): common.UIAbilityContext { if (!this.context) fail('E_UNSUPPORTED', '项目存储尚未准备好。'); return this.context; }
  private base(): string { return this.ctx().filesDir; }
  private root(): string { return this.base() + '/workspaces/文舟'; }
  private data(): string { return this.base() + '/project-data'; }
  private temp(): string { return this.data() + '/sessions'; }
  private uuid(): string { return util.generateRandomUUID(); }
  private exists(path: string): boolean { return fs.accessSync(path); }
  private remove(path: string): void { if (!this.exists(path)) return; if (fs.lstatSync(path).isDirectory()) fs.rmdirSync(path); else fs.unlinkSync(path); }
  private mkdir(path: string): void { if (!this.exists(path)) fs.mkdirSync(path, true); }
  private parent(path: string): void { this.mkdir(path.substring(0, path.lastIndexOf('/'))); }
  private write(path: string, bytes: Uint8Array): void {
    this.parent(path); const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try { let at = 0; while (at < bytes.length) { const count = fs.writeSync(file.fd, bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + bytes.length)); if (count <= 0) fail('E_QUOTA', '文件写入不完整。'); at += count; } fs.fsyncSync(file.fd); } finally { fs.closeSync(file); }
  }
  private atomic(path: string, value: string): void { this.write(path + '.wenzhou-tmp', encodeFileText(value)); fs.renameSync(path + '.wenzhou-tmp', path); }
  private copy(source: string, destination: string): void {
    this.parent(destination); if (fs.lstatSync(source).isSymbolicLink()) fail('E_PERMISSION', '不允许符号链接。');
    if (fs.statSync(source).isDirectory()) { this.mkdir(destination); for (const name of fs.listFileSync(source)) this.copy(source + '/' + name, destination + '/' + name); }
    else fs.copyFileSync(source, destination);
  }
  private target(root: string, path: string, empty: boolean = false): string {
    const prefix = relative(root, true), suffix = relative(path, empty), full = this.root() + (prefix ? '/' + prefix : '') + (suffix ? '/' + suffix : '');
    let current = this.root(); for (const part of ((prefix ? prefix + '/' : '') + suffix).split('/').filter(p => p !== '')) { current += '/' + part; if (this.exists(current) && fs.lstatSync(current).isSymbolicLink()) fail('E_PERMISSION', '不允许通过符号链接访问项目。'); } return full;
  }
  recover(): void {
    if (this.prepared) return;
    this.mkdir(this.data()); const folder = this.data() + '/transaction', journal = folder + '/journal.json';
    if (this.exists(journal)) {
      const state = JSON.parse(fs.readTextSync(journal)) as Journal;
      if (!state.committed) for (const item of state.entries.slice().reverse()) {
        if (!item.target.startsWith(this.base() + '/') || !item.backup.startsWith(folder + '/')) fail('E_RECOVERY_REQUIRED', '事务日志无效，已保留现场。');
        this.remove(item.target); if (item.exists) this.copy(item.backup, item.target);
      }
    }
    this.remove(folder); this.remove(this.temp()); this.mkdir(this.temp()); this.mkdir(this.data() + '/objects'); this.mkdir(this.data() + '/snapshots'); this.prepared = true;
  }
  private hashBytes(bytes: Uint8Array): string { const md = cryptoFramework.createMd('SHA256'); md.updateSync({ data: bytes }); return Array.from(md.digestSync().data).map(b => b.toString(16).padStart(2, '0')).join(''); }
  private hash(path: string): string {
    const md = cryptoFramework.createMd('SHA256'), file = fs.openSync(path, fs.OpenMode.READ_ONLY);
    try { const size = fs.statSync(file.fd).size; let at = 0; while (at < size) { const part = new ArrayBuffer(Math.min(CHUNK, size - at)); const count = fs.readSync(file.fd, part); if (count <= 0) fail('E_INVALID_DATA', '文件读取不完整。'); md.updateSync({ data: new Uint8Array(part, 0, count) }); at += count; } return Array.from(md.digestSync().data).map(b => b.toString(16).padStart(2, '0')).join(''); } finally { fs.closeSync(file); }
  }
  private tree(root: string): Tree {
    const directory = this.target(root, '', true), entries: ProjectEntry[] = []; let total = 0;
    const walk = (folder: string): void => {
      for (const name of fs.listFileSync(directory + (folder ? '/' + folder : '')).sort()) {
        if (name === '.git' || name.endsWith('.wenzhou-tmp')) continue;
        const path = folder ? folder + '/' + name : name, file = this.target(root, path), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) continue; if (entries.length >= 5000) fail('E_LIMIT', '项目超过 5000 项。');
        const entry: ProjectEntry = { path: path, kind: stat.isDirectory() ? 'directory' : 'file', mime: stat.isDirectory() ? 'inode/directory' : previewMime(path), size: stat.isDirectory() ? 0 : stat.size, revision: '', modifiedAt: new Date(stat.mtime * 1000).toISOString() };
        entries.push(entry); if (stat.isDirectory()) { walk(path); entry.revision = 'r:' + this.hashBytes(encodeFileText(JSON.stringify(entries.filter(e => e !== entry && inside(path, e.path)).map(e => [e.path, e.revision])))); }
        else { total += stat.size; if (total > 512 * MB) fail('E_LIMIT', '项目超过 512 MB。'); entry.revision = 'r:' + this.hash(file); }
      }
    };
    if (this.exists(directory)) walk(''); return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), totalBytes: total };
  }
  private check(owner: string, id: string = ''): void { if (this.stopped.has(owner)) fail('E_PLUGIN_STOPPED', '插件已停用。'); if (id && this.cancelled.has(owner + ':' + id)) fail('E_CANCELLED', '任务已取消。'); }
  private blob(owner: string, id: string): BlobRecord { const b = this.blobs.get(id); if (!b || b.owner !== owner || b.expires < Date.now()) fail('E_NOT_FOUND', '暂存素材不存在。'); return b; }
  private begin(owner: string, a: Request): BlobStart {
    const size = a.size || 0; if (!Number.isInteger(size) || size < 0 || size > 128 * MB || this.blobs.size >= 5000 || Array.from(this.blobs.values()).reduce((sum: number, value: BlobRecord): number => sum + value.size, 0) + size > 512 * MB) fail('E_LIMIT', '素材大小或数量超过限制。');
    const id = this.uuid(), file = this.temp() + '/' + id; this.write(file, new Uint8Array(0));
    const b: BlobRecord = { owner: owner, root: relative(a.root || '', true), file: file, size: size, hash: '', expectedHash: a.sha256 || '', sequence: 0, last: '', written: 0, complete: false, expires: Date.now() + 1800000 }; this.blobs.set(id, b); return { blobId: id, maxChunkBytes: CHUNK };
  }
  private finish(owner: string, id: string): BlobFinished { const b = this.blob(owner, id); if (fs.statSync(b.file).size !== b.size) fail('E_INVALID_DATA', '素材大小不匹配。'); b.hash = this.hash(b.file); if (b.expectedHash && b.expectedHash !== b.hash) fail('E_INVALID_DATA', '素材校验失败。'); b.complete = true; return { blobId: id, size: b.size, sha256: b.hash }; }
  private snapshot(a: Request): Snapshot { const id = a.snapshotId || ''; if (!/^[A-Za-z0-9-]+$/.test(id)) fail('E_NOT_FOUND', '快照不存在。'); const file = this.data() + '/snapshots/' + id + '.json'; if (!this.exists(file)) fail('E_NOT_FOUND', '快照不存在。'); const record = JSON.parse(fs.readTextSync(file)) as Snapshot; if (record.owner !== a.pluginId || (a.workspaceId && record.workspaceId !== a.workspaceId)) fail('E_PERMISSION', '快照不属于此插件或项目。'); return record; }
  private object(hash: string): string { if (!/^[a-f0-9]{64}$/.test(hash)) fail('E_INVALID_DATA', '素材摘要无效。'); return this.data() + '/objects/' + hash; }
  private source(a: Request): string { if (!a.snapshotId) return this.target(a.root || '', a.path || ''); const record = this.snapshot(a), e = record.entries.find(e => e.path === a.path && e.kind === 'file'); if (!e) fail('E_NOT_FOUND', '快照文件不存在。'); return this.object(e.revision.substring(2)); }
  private apply(owner: string, a: Request): Committed {
    if (this.busy) fail('E_CONFLICT', '已有项目事务正在提交。'); const value = a.workspace || ''; if (encodeFileText(value).length > 64 * MB) fail('E_LIMIT', '工作区索引超过限制。');
    const workspace = JSON.parse(value) as Workspace, config = JSON.parse(fs.readTextSync(this.base() + '/folders.json')) as FolderConfig;
    if (workspace.storage?.id !== config.current) fail('E_CONFLICT', '内部文件夹已切换。');
    const tree = this.tree(a.root || ''); for (const e of a.expected || []) if ((tree.entries.find(f => f.path === e.path)?.revision || null) !== e.revision) fail('E_CONFLICT', '项目文件已改变。');
    const folder = this.data() + '/transaction', journalPath = folder + '/journal.json'; this.mkdir(folder); const journal: Journal = { committed: false, entries: [] };
    const track = (path: string): void => {
      if (journal.entries.some(e => path === e.target || path.startsWith(e.target + '/'))) return;
      const backup = folder + '/' + journal.entries.length, exists = this.exists(path); if (exists) this.copy(path, backup);
      journal.entries.push({ target: path, backup: backup, exists: exists }); this.atomic(journalPath, JSON.stringify(journal));
    };
    const parents = (path: string): void => { const parent = path.substring(0, path.lastIndexOf('/')); if (!this.exists(parent)) { parents(parent); track(parent); this.mkdir(parent); } };
    const trashFile = this.base() + '/trash.json', trash: TrashRecord[] = this.exists(trashFile) ? JSON.parse(fs.readTextSync(trashFile)) as TrashRecord[] : [];
    this.busy = true;
    try {
      for (const c of a.changes || []) {
        const path = this.target(a.root || '', c.path || c.from || ''); parents(path); track(path);
        if (c.kind === 'mkdir') this.mkdir(path);
        else if (c.kind === 'writeText') { const bytes = encodeFileText(c.text || ''); if (bytes.length > 8 * MB) fail('E_LIMIT', '文本超过 8 MB。'); this.write(path, bytes); }
        else if (c.kind === 'writeBlob') { const b = this.blob(owner, c.blobId || ''); if (!b.complete || b.root !== (a.root || '')) fail('E_INVALID_DATA', '素材尚未完成或项目不匹配。'); fs.copyFileSync(b.file, path); }
        else if (c.kind === 'move') { const to = this.target(a.root || '', c.to || ''); if (this.exists(to)) fail('E_EXISTS', '移动目标已存在。'); parents(to); track(to); fs.renameSync(path, to); }
        else if (c.kind === 'delete') {
          if (trash.length >= 100) fail('E_QUOTA', '回收站已满。'); const id = this.uuid(), destination = this.root() + '/.trash-' + id + '.wenzhou-tmp'; parents(destination); track(destination); this.copy(path, destination);
          const full = (a.root ? a.root + '/' : '') + (c.path || ''); trash.push({ id: id, path: full, directory: fs.statSync(path).isDirectory(), createdAt: Date.now(), workspaceId: config.current, documents: (a.removedDocuments || []).filter(d => inside(full, d.path || d.name)), repositories: [] }); this.remove(path); track(trashFile); this.atomic(trashFile, JSON.stringify(trash));
        } else fail('E_INVALID_DATA', '变更类型无效。');
      }
      this.tree(a.root || ''); const cache = this.base() + '/folder-' + config.current + '.json', state = this.base() + '/workspace.json'; track(cache); track(state); this.atomic(cache, value); this.atomic(state, value);
      journal.committed = true; this.atomic(journalPath, JSON.stringify(journal)); this.remove(folder); return { committed: true };
    } catch (cause) { for (const item of journal.entries.slice().reverse()) { this.remove(item.target); if (item.exists) this.copy(item.backup, item.target); } this.remove(folder); throw cause as Error; } finally { this.busy = false; }
  }
  async call(action: string, owner: string, json: string): Promise<Object> {
    this.recover(); if (!/^[A-Za-z0-9-]{1,100}$/.test(owner)) fail('E_PERMISSION', '插件会话无效。'); const a = JSON.parse(json) as Request;
    if (action === 'capabilities') { const limits: Limits = { textBytes: 8 * MB, readChunkBytes: CHUNK, bridgeChunkBytes: CHUNK, importFileBytes: 128 * MB, projectEntries: 5000, archiveExpandedBytes: 0, archiveEntries: 0, projectBytes: 512 * MB, snapshotBytes: 512 * MB, assetBytes: 8 * MB }; const features: Features = { filesystem: true, transactions: true, assetSessions: true, archives: false, snapshots: true, nativePicker: true, independentPreview: false, externalWatch: false }; const resource: ResourceFlags = { range: false, worker: true, canvas2d: true }; const result: Capabilities = { limits: limits, features: features, resource: resource }; return result; }
    if (action === 'receipt') return this.exists(this.base() + '/workspace.json') ? fs.readTextSync(this.base() + '/workspace.json') : '';
    if (action === 'tree') return this.tree(a.root || '');
    if (action === 'apply') return this.apply(owner, a);
    if (action === 'begin') return this.begin(owner, a);
    if (action === 'chunk') {
      const b = this.blob(owner, a.blobId || ''), bytes = a.data ? new util.Base64Helper().decodeSync(a.data) : new Uint8Array(0), hash = this.hashBytes(bytes);
      if (a.sequence === b.sequence - 1 && hash === b.last) { const retry: ChunkResult = { acceptedBytes: b.written, nextSequence: b.sequence }; return retry; }
      if (a.sequence !== b.sequence || bytes.length > CHUNK || b.written + bytes.length > b.size || b.complete) fail('E_INVALID_DATA', '传输块大小或顺序无效。');
      const file = fs.openSync(b.file, fs.OpenMode.READ_WRITE | fs.OpenMode.APPEND); try { let at = 0; while (at < bytes.length) { const count = fs.writeSync(file.fd, bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + bytes.length)); if (count <= 0) fail('E_QUOTA', '素材写入不完整。'); at += count; } fs.fsyncSync(file.fd); } finally { fs.closeSync(file); }
      b.written += bytes.length; b.sequence++; b.last = hash; const result: ChunkResult = { acceptedBytes: b.written, nextSequence: b.sequence }; return result;
    }
    if (action === 'finish') return this.finish(owner, a.blobId || '');
    if (action === 'abort') { const b = this.blob(owner, a.blobId || ''); if (b.file.startsWith(this.temp() + '/')) this.remove(b.file); this.blobs.delete(a.blobId || ''); return true; }
    if (action === 'read') {
      const path = this.source(a); if (!this.exists(path)) fail('E_NOT_FOUND', '文件不存在。'); const size = fs.statSync(path).size, rev = 'r:' + this.hash(path), offset = a.offset || 0, length = a.length === undefined ? Math.min(CHUNK, size - offset) : a.length;
      if (a.expectedRevision && a.expectedRevision !== rev) fail('E_CONFLICT', '文件已改变。'); if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || offset > size || length < 0 || length > CHUNK) fail('E_LIMIT', '读取范围无效。');
      const file = fs.openSync(path, fs.OpenMode.READ_ONLY), bytes = new Uint8Array(Math.min(length, size - offset)); try { let at = 0; while (at < bytes.length) { const part = new ArrayBuffer(bytes.length - at), count = fs.readSync(file.fd, part, { offset: offset + at }); if (count <= 0) fail('E_CONFLICT', '读取期间文件已改变。'); bytes.set(new Uint8Array(part, 0, count), at); at += count; } } finally { fs.closeSync(file); }
      const result: ReadResult = { data: bytes.length ? new util.Base64Helper().encodeToStringSync(bytes) : '', revision: rev, totalSize: size }; return result;
    }
    if (action === 'pick') {
      const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = a.multiple ? 100 : 1;
      const known: string[] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'mp4', 'webm', 'ogg', 'oga', 'ogv', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'otf', 'zip', 'json', 'csv', 'tsv', 'txt', 'html', 'pdf'], suffixes: string[] = [];
      for (const type of a.accept || []) { if (type.startsWith('.')) suffixes.push(type); else for (const ext of known) if (type.endsWith('/*') ? previewMime('x.' + ext).startsWith(type.substring(0, type.length - 1)) : previewMime('x.' + ext) === type) suffixes.push('.' + ext); }
      if (suffixes.length) options.fileSuffixFilters = ['素材|' + suffixes.join(',')];
      const uris = await new picker.DocumentViewPicker(this.ctx()).select(options), selections: SelectionInfo[] = []; this.check(owner);
      for (const uri of uris) { const token = this.uuid(), file = this.temp() + '/' + token, source = fs.openSync(uri, fs.OpenMode.READ_ONLY); try { const size = fs.statSync(source.fd).size; if (size > 128 * MB) fail('E_LIMIT', '素材超过 128 MB。'); fs.copyFileSync(source.fd, file); const name = new fileUri.FileUri(uri).name, info: Selection = { owner: owner, file: file, name: name, size: size, mime: previewMime(name) }; this.selections.set(token, info); selections.push({ token: token, name: name, size: size, mime: info.mime }); } finally { fs.closeSync(source); } } const result: PickResult = { cancelled: !uris.length, selections: selections }; return result;
    }
    if (action === 'selectionRead') {
      const selected = this.selections.get(a.token || ''); if (!selected || selected.owner !== owner) fail('E_NOT_FOUND', '选择令牌不存在。'); const start = a.offset || 0, length = a.length === undefined ? CHUNK : a.length; if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || start > selected.size || length < 0 || length > CHUNK) fail('E_LIMIT', '读取范围无效。'); const file = fs.openSync(selected.file, fs.OpenMode.READ_ONLY), data = new Uint8Array(Math.min(length, selected.size - start)); try { let at = 0; while (at < data.length) { const part = new ArrayBuffer(data.length - at), count = fs.readSync(file.fd, part, { offset: start + at }); if (count <= 0) fail('E_INVALID_DATA', '选择文件读取不完整。'); data.set(new Uint8Array(part, 0, count), at); at += count; } } finally { fs.closeSync(file); } const result: ReadResult = { data: data.length ? new util.Base64Helper().encodeToStringSync(data) : '', totalSize: selected.size, revision: 'r:' + this.hash(selected.file) }; return result;
    }
    if (action === 'deliverBlob') {
      const b = this.blob(owner, a.blobId || ''); if (!b.complete) fail('E_INVALID_DATA', '导出文件尚未完成。'); const options = new picker.DocumentSaveOptions(); options.newFileNames = [relative(a.suggestedName || 'project.zip')]; const uris = await new picker.DocumentViewPicker(this.ctx()).save(options); this.check(owner); if (!uris.length) { const result: Delivered = { saved: false }; return result; } const file = fs.openSync(uris[0], fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC); try { fs.copyFileSync(b.file, file.fd); fs.fsyncSync(file.fd); } finally { fs.closeSync(file); } const result: Delivered = { saved: true }; return result;
    }
    if (action === 'selectionStage') {
      this.check(owner, a.taskId); const s = this.selections.get(a.token || ''); if (!s || s.owner !== owner) fail('E_NOT_FOUND', '选择令牌不存在。');
      const start = this.begin(owner, { root: a.root, size: s.size }), b = this.blob(owner, start.blobId); fs.copyFileSync(s.file, b.file); const result = this.finish(owner, start.blobId); this.selections.delete(a.token || ''); this.remove(s.file); return result;
    }
    if (action === 'snapshotCreate') {
      const tree = this.tree(a.root || ''), roots = (a.includeRoots || []).map(p => relative(p, true)), entries = tree.entries.filter(e => roots.some(p => inside(p, e.path))); let total = 0;
      for (const e of entries) { this.check(owner, a.taskId); e.entryId = a.entries?.find(old => old.path === e.path)?.entryId; if (e.kind === 'file') { total += e.size; const dest = this.object(e.revision.substring(2)); if (!this.exists(dest)) { const file = dest + '.wenzhou-tmp'; fs.copyFileSync(this.target(a.root || '', e.path), file); if ('r:' + this.hash(file) !== e.revision) fail('E_CONFLICT', '快照创建期间文件已改变。'); fs.renameSync(file, dest); } } }
      if (JSON.stringify(tree.entries.map(e => [e.path, e.revision])) !== JSON.stringify(this.tree(a.root || '').entries.map(e => [e.path, e.revision]))) fail('E_CONFLICT', '快照创建期间项目已改变。');
      this.check(owner, a.taskId); const id = this.uuid(), record: Snapshot = { id: id, owner: a.pluginId || owner, workspaceId: a.workspaceId || '', root: a.root || '', includeRoots: roots, label: (a.label || '').substring(0, 200), createdAt: new Date().toISOString(), bytes: total, entries: entries, workspace: a.workspace || '' }; this.atomic(this.data() + '/snapshots/' + id + '.json', JSON.stringify(record)); const result: SnapshotResult = { snapshotId: id, bytes: total }; return result;
    }
    if (action === 'snapshotList') { const values: SnapshotInfo[] = []; for (const name of fs.listFileSync(this.data() + '/snapshots')) { const r = JSON.parse(fs.readTextSync(this.data() + '/snapshots/' + name)) as Snapshot; if (r.owner === a.pluginId && r.workspaceId === a.workspaceId) values.push({ id: r.id, label: r.label, createdAt: r.createdAt, bytes: r.bytes }); } return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    if (action === 'snapshotEntries') return this.snapshot(a);
    if (action === 'snapshotStage') { const record = this.snapshot(a), entries: ProjectEntry[] = []; for (const e of record.entries) { this.check(owner, a.taskId); if (e.kind === 'directory') { entries.push(e); continue; } const id = this.uuid(), hash = e.revision.substring(2), b: BlobRecord = { owner: owner, root: a.root || '', file: this.object(hash), size: e.size, hash: hash, expectedHash: hash, sequence: 0, last: '', written: e.size, complete: true, expires: Date.now() + 1800000 }; this.blobs.set(id, b); entries.push({ path: e.path, kind: e.kind, mime: e.mime, size: e.size, revision: e.revision, modifiedAt: e.modifiedAt, entryId: e.entryId, blobId: id, sha256: hash }); } const result: StageResult = { entries: entries }; return result; }
    if (action === 'assetOpen') { if (a.snapshotId) this.snapshot(a); const id = this.uuid(), session: Session = { owner: owner, root: a.root || '', pluginId: a.pluginId || '', workspaceId: a.workspaceId || '', allowedRoots: (a.allowedRoots || []).map(p => relative(p, true)), snapshotId: a.snapshotId || '', expires: Date.now() + 1800000 }; this.sessions.set(id, session); const result: AssetSession = { sessionId: id }; return result; }
    if (action === 'assetResolve') {
      const s = this.sessions.get(a.sessionId || ''); if (!s || s.owner !== owner || s.expires < Date.now()) fail('E_NOT_FOUND', '资源会话不存在。'); const path = relative(a.path || ''); if (!s.allowedRoots.some(p => inside(p, path))) fail('E_PERMISSION', '资源超出授权范围。');
      const request: Request = { root: s.root, path: path, snapshotId: s.snapshotId, pluginId: s.pluginId, workspaceId: s.workspaceId }, source = this.source(request), size = fs.statSync(source).size, rev = 'r:' + this.hash(source); if (a.expectedRevision && a.expectedRevision !== rev) fail('E_CONFLICT', '资源已改变。'); if (size > 8 * MB) fail('E_LIMIT', '此平台资源 URL 限制为 8 MB，请使用分块读取。');
      const file = fs.openSync(source, fs.OpenMode.READ_ONLY), bytes = new Uint8Array(size); try { let at = 0; while (at < size) { const part = new ArrayBuffer(Math.min(CHUNK, size - at)), count = fs.readSync(file.fd, part); if (count <= 0) fail('E_INVALID_DATA', '资源读取不完整。'); bytes.set(new Uint8Array(part, 0, count), at); at += count; } } finally { fs.closeSync(file); } const result: AssetResult = { data: size ? new util.Base64Helper().encodeToStringSync(bytes) : '', mime: previewMime(path), size: size, revision: rev, supportsRange: false }; return result;
    }
    if (action === 'assetRelease') { const s = this.sessions.get(a.sessionId || ''); if (!s || s.owner !== owner) fail('E_NOT_FOUND', '资源会话不存在。'); this.sessions.delete(a.sessionId || ''); return true; }
    if (action === 'exportFile') {
      const path = this.target(a.root || '', a.path || ''), rev = 'r:' + this.hash(path); if (a.expectedRevision && a.expectedRevision !== rev) fail('E_CONFLICT', '导出文件已改变。'); const temp = this.temp() + '/' + this.uuid(); fs.copyFileSync(path, temp);
      try { const options = new picker.DocumentSaveOptions(); options.newFileNames = [relative(a.suggestedName || (a.path || '').split('/').pop() || 'export.bin')]; const uris = await new picker.DocumentViewPicker(this.ctx()).save(options); this.check(owner); if (!uris.length) { const result: Delivered = { saved: false }; return result; } const file = fs.openSync(uris[0], fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC); try { fs.copyFileSync(temp, file.fd); fs.fsyncSync(file.fd); } finally { fs.closeSync(file); } const result: Delivered = { saved: true }; return result; } finally { this.remove(temp); }
    }
    if (action === 'cancel') { this.cancelled.add(owner + ':' + (a.taskId || '')); return true; }
    if (action === 'stop') { this.stopped.add(owner); for (const item of this.blobs) if (item[1].owner === owner) { if (item[1].file.startsWith(this.temp() + '/')) this.remove(item[1].file); this.blobs.delete(item[0]); } for (const item of this.selections) if (item[1].owner === owner) { this.remove(item[1].file); this.selections.delete(item[0]); } for (const item of this.sessions) if (item[1].owner === owner) this.sessions.delete(item[0]); return true; }
    fail('E_UNSUPPORTED', '此平台尚不支持该能力，请检查 getCapabilities。');
  }
}
