import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { decodeFileText, encodeFileText } from './FileText';
import { PreviewResource, previewMime } from './PreviewResource';

export interface StoredDocument { id: string; name: string; path?: string; kind?: string; delimiter?: string; text: string; updatedAt: number; remote: Object | null; subscription?: Object; }
export interface StorageInfo { id: string; label: string; root: string; needsSetup: boolean; internal?: boolean; }
export interface FolderEntry { path: string; name: string; directory: boolean; size: number; editable: boolean; reason: string; }
interface RepositoryLink { repo: string; branch: string; folder: string; commit: string; }
export interface FolderState { storage: StorageInfo; documents: StoredDocument[]; folders: string[]; entries: FolderEntry[]; repositories: RepositoryLink[]; pluginProject?: PluginIndex; }
interface FolderRoot { id: string; uri: string; path: string; label: string; }
interface FolderConfig { current: string; default: string; roots: FolderRoot[]; }
interface PluginIndex { entries: Record<string, string>; textFiles?: Record<string, boolean>; }
interface SavedWorkspace { pluginProject?: PluginIndex; version: number; storage?: StorageInfo; documents: StoredDocument[]; folders?: string[]; repositories?: RepositoryLink[]; }
export interface BinaryWorkspaceFile { path: string; data: string; }
export interface TrashItem { id: string; path: string; directory: boolean; createdAt: number; }
interface TrashRecord extends TrashItem { workspaceId: string; documents: StoredDocument[]; repositories: RepositoryLink[]; }

// Only the application sandbox workspace is accessible; JavaScript supplies relative paths.
export class WorkspaceFiles {
  context: common.UIAbilityContext | undefined = undefined;
  private config: FolderConfig = { current: '', default: '', roots: [] };
  private ready: boolean = false;
  private lazyPaths: string[] = [];
  private lazyTexts: string[] = [];

  private contextValue(): common.UIAbilityContext {
    if (!this.context) throw new Error('文件服务尚未准备好。');
    return this.context;
  }
  private getRoot(): FolderRoot | undefined { return this.config.roots.find(root => root.id === this.config.current); }
  private configPath(): string { return this.contextValue().filesDir + '/folders.json'; }
  private cachePath(id: string): string { return this.contextValue().filesDir + '/folder-' + id + '.json'; }
  private info(): StorageInfo {
    const root = this.getRoot();
    return { id: root?.id || '', label: root?.label || '内部文件夹', root: root?.path || '', needsSetup: !root, internal: root?.path === this.internalPath() };
  }
  private internalPath(): string { return this.contextValue().filesDir + '/workspaces/文舟'; }
  private ensureInternal(): FolderRoot {
    const path = this.internalPath();
    if (!fs.accessSync(path)) fs.mkdirSync(path, true);
    let root = this.config.roots.find(item => item.path === path);
    if (!root) {
      root = { id: util.generateRandomUUID(), uri: '', path: path, label: '内部文件夹' };
      this.config.roots.push(root);
    }
    this.config.default = root.id;
    return root;
  }
  private writeBytes(path: string, bytes: Uint8Array): void {
    const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = fs.writeSync(file.fd, bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + bytes.byteLength));
        if (count <= 0) throw new Error('未能完整写入文件。');
        offset += count;
      }
      fs.fsyncSync(file.fd);
    } finally { fs.closeSync(file); }
  }
  private atomic(path: string, bytes: Uint8Array): void {
    const temp = path + '.wenzhou-tmp';
    this.writeBytes(temp, bytes);
    fs.renameSync(temp, path);
  }
  private text(path: string, value: string): void { this.atomic(path, encodeFileText(value)); }
  private readBytes(path: string, limit: number): Uint8Array {
    const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size;
      if (size > limit) throw new Error('文件超出读取大小限制。');
      const buffer = new Uint8Array(size);
      let offset = 0;
      while (offset < size) {
        const part = new ArrayBuffer(size - offset), count = fs.readSync(file.fd, part);
        if (count <= 0) throw new Error('未能完整读取文件。');
        buffer.set(new Uint8Array(part, 0, count), offset);
        offset += count;
      }
      return buffer;
    } finally { fs.closeSync(file); }
  }
  private readText(path: string): string {
    const bytes = this.readBytes(path, 8 * 1024 * 1024);
    return decodeFileText(bytes);
  }
  private relative(value: string): string {
    if (!value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..') || value.endsWith('.wenzhou-tmp')) {
      throw new Error('工作区相对路径无效。');
    }
    return value;
  }
  private target(relative: string): string {
    const root = this.getRoot();
    if (!root) throw new Error('内部文件夹尚未初始化。');
    const parts = this.relative(relative).split('/');
    let current = root.path;
    for (const part of parts) {
      current += '/' + part;
      if (fs.accessSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('不允许通过符号链接写入工作区。');
    }
    return current;
  }
  private parent(path: string): void {
    const directory = path.substring(0, path.lastIndexOf('/'));
    if (!fs.accessSync(directory)) fs.mkdirSync(directory, true);
  }
  async initialize(): Promise<FolderState> {
    if (!this.ready) {
      if (fs.accessSync(this.configPath())) this.config = JSON.parse(fs.readTextSync(this.configPath())) as FolderConfig;
      const internal = this.ensureInternal();
      this.config = { current: internal.id, default: internal.id, roots: [internal] };
      this.text(this.configPath(), JSON.stringify(this.config));
      this.ready = true;
    }
    return this.scan();
  }
  scan(): FolderState {
    const root = this.getRoot(), documents: StoredDocument[] = [], folders: string[] = [], entries: FolderEntry[] = [];
    if (!root) return { storage: this.info(), documents: documents, folders: folders, entries: entries, repositories: [] };
    const old: SavedWorkspace | undefined = fs.accessSync(this.cachePath(root.id)) ? JSON.parse(fs.readTextSync(this.cachePath(root.id))) as SavedWorkspace : undefined;
    this.lazyPaths = old?.pluginProject ? Object.keys(old.pluginProject.entries) : [];
    this.lazyTexts = old?.pluginProject?.textFiles ? Object.keys(old.pluginProject.textFiles).filter(path => old.pluginProject?.textFiles?.[path] === true) : [];
    this.walk('', old?.documents || [], documents, folders, entries);
    return { storage: this.info(), documents: documents, folders: folders, entries: entries, repositories: old?.repositories || [], pluginProject: old?.pluginProject };
  }
  private walk(directory: string, old: StoredDocument[], documents: StoredDocument[], folders: string[], entries: FolderEntry[]): void {
    const root = this.getRoot();
    if (!root) return;
    for (const name of fs.listFileSync(root.path + (directory ? '/' + directory : ''))) {
      if (name.endsWith('.wenzhou-tmp') || name === '.git') continue;
      if (entries.length >= 5000) throw new Error('工作区超过 5000 个文件与目录，请选择较小的文件夹。');
      const relative = directory ? directory + '/' + name : name, path = root.path + '/' + this.relative(relative), stat = fs.lstatSync(path);
      if (stat.isSymbolicLink()) continue;
      const entry: FolderEntry = { path: relative, name: name, directory: stat.isDirectory(), size: stat.size, editable: false, reason: '' };
      entries.push(entry);
      if (entry.directory) { folders.push(relative); this.walk(relative, old, documents, folders, entries); }
      else if (stat.isFile()) {
        if (this.lazyPaths.includes(relative) && !old.some(doc => (doc.path || doc.name) === relative) && name !== ".vela") { entry.editable = this.lazyTexts.includes(relative) || /\.(txt|md|csv|tsv|json|html?|css|[cm]?js|ts|py|java|ets|tex|yaml|yml|xml|toml|velaodt|vodt|fodt|fods|fodp|fodg|gly|glossary)$/i.test(name); entry.reason = "按需读取项目文件"; continue; }
        try {
          const text = this.readText(path), previous = old.find(doc => (doc.path || doc.name) === relative);
          const doc: StoredDocument = { id: previous?.id || util.generateRandomUUID(), name: name, path: relative, kind: previous?.kind, delimiter: previous?.delimiter, text: text, updatedAt: previous?.text === text ? previous.updatedAt : Date.now(), remote: previous?.remote || null, subscription: previous?.subscription };
          documents.push(doc); entry.editable = true;
        } catch (error) { entry.reason = stat.size > 8 * 1024 * 1024 ? '超过 8 MB，保留在工作区中' : '二进制或不支持的文本编码，保留在工作区中'; }
      }
    }
  }
  mirror(data: string): void {
    const value = JSON.parse(data) as SavedWorkspace, root = this.getRoot();
    if (!root || !value.storage?.id) return;
    if (value.storage.id !== root.id) throw new Error('工作区已切换，请重新打开文件夹。');
    const old: SavedWorkspace | undefined = fs.accessSync(this.cachePath(root.id)) ? JSON.parse(fs.readTextSync(this.cachePath(root.id))) as SavedWorkspace : undefined;
    const previous = old?.documents || [], paths: string[] = [];
    for (const doc of value.documents) {
      if (typeof doc.text !== 'string') throw new Error('文稿文本无效，原文件已保留。');
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(doc.id)) throw new Error('文件标识无效。');
      const relative = this.relative(doc.path || doc.name), path = this.target(relative);
      if (paths.includes(relative)) throw new Error('工作区存在同名路径，请重命名文件。');
      paths.push(relative);
      const before = previous.find(item => (item.path || item.name) === relative);
      if (fs.accessSync(path)) {
        const disk = this.readText(path);
        if (disk !== doc.text && (!before || disk !== before.text)) throw new Error('文件已在外部修改：' + relative + '。请刷新工作区后重试。');
      }
    }
    for (const doc of previous) {
      const relative = doc.path || doc.name;
      if (!paths.includes(relative) && fs.accessSync(this.target(relative)) && this.readText(this.target(relative)) !== doc.text) throw new Error('文件已在外部修改，无法删除：' + relative);
    }
    for (const folder of value.folders || []) { const path = this.target(folder); if (!fs.accessSync(path)) fs.mkdirSync(path, true); }
    for (const doc of value.documents) {
      const relative = doc.path || doc.name, path = this.target(relative);
      if (fs.accessSync(path) && this.readText(path) === doc.text) continue;
      const before = previous.find(item => (item.path || item.name) === relative);
      if (before) this.text(this.contextValue().filesDir + '/previous-' + doc.id + '.txt', before.text);
      this.parent(path); this.text(path, doc.text);
    }
    for (const doc of previous) { const relative = doc.path || doc.name; if (!paths.includes(relative) && fs.accessSync(this.target(relative))) fs.unlinkSync(this.target(relative)); }
    this.text(this.cachePath(root.id), data);
  }
  writeFiles(files: BinaryWorkspaceFile[], folders: string[]): FolderState {
    const seen: string[] = [];
    let total = 0;
    for (const file of files) {
      this.target(file.path);
      if (seen.includes(file.path)) throw new Error('重复文件路径。');
      seen.push(file.path); total += file.data.length;
      if (file.data.length > 12 * 1024 * 1024 || total > 96 * 1024 * 1024) throw new Error('仓库文件超过本次拉取大小限制。');
    }
    for (const folder of folders) this.target(folder);
    const staging = this.contextValue().filesDir + '/pull-' + util.generateRandomUUID();
    fs.mkdirSync(staging);
    const existed: boolean[] = [], written: number[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const path = this.target(files[i].path);
        existed.push(fs.accessSync(path));
        if (existed[i]) this.writeBytes(staging + '/old-' + i, this.readBytes(path, 8 * 1024 * 1024));
        this.writeBytes(staging + '/new-' + i, files[i].data === '' ? new Uint8Array(0) : new util.Base64Helper().decodeSync(files[i].data));
      }
      for (const folder of folders) { const path = this.target(folder); if (!fs.accessSync(path)) fs.mkdirSync(path, true); }
      for (let i = 0; i < files.length; i++) {
        const path = this.target(files[i].path); this.parent(path);
        written.push(i); this.atomic(path, this.readBytes(staging + '/new-' + i, 8 * 1024 * 1024));
      }
      return this.scan();
    } catch (error) {
      for (const i of written.reverse()) {
        const path = this.target(files[i].path);
        if (existed[i]) this.atomic(path, this.readBytes(staging + '/old-' + i, 8 * 1024 * 1024));
        else if (fs.accessSync(path)) fs.unlinkSync(path);
      }
      throw error as Error;
    } finally { fs.rmdirSync(staging); }
  }
  readFileBase64(relative: string): string {
    const bytes = this.readBytes(this.target(relative), 8 * 1024 * 1024);
    return bytes.byteLength === 0 ? '' : new util.Base64Helper().encodeToStringSync(bytes);
  }
  readPreviewResource(relative: string, html: boolean = false): PreviewResource {
    const mime = html ? 'text/html' : previewMime(relative);
    let bytes = this.readBytes(this.target(relative), 8 * 1024 * 1024);
    if (mime.startsWith('text/') || mime === 'image/svg+xml' || mime === 'application/json') {
      let text = decodeFileText(bytes);
      if (mime === 'text/html') {
        text = text.replace(/(<meta\b[^>]*charset\s*=\s*["']?)[a-z0-9_-]+/gi, '$1utf-8');
        if (!/<meta\b[^>]*name\s*=\s*["']?viewport\b/i.test(text)) {
          const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1">';
          if (/<head\b[^>]*>/i.test(text)) text = text.replace(/(<head\b[^>]*>)/i, '$1' + viewport);
          else if (/^\s*<!doctype\b[^>]*>/i.test(text)) text = text.replace(/^(\s*<!doctype\b[^>]*>)/i, '$1' + viewport);
          else text = viewport + text;
        }
      }
      bytes = encodeFileText(text);
    }
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: mime };
  }
  readAsset(relative: string): string {
    const extension = relative.substring(relative.lastIndexOf('.') + 1).toLowerCase();
    let type = '';
    switch (extension) {
      case 'png': type = 'image/png'; break;
      case 'jpg': case 'jpeg': type = 'image/jpeg'; break;
      case 'gif': type = 'image/gif'; break;
      case 'webp': type = 'image/webp'; break;
      case 'avif': type = 'image/avif'; break;
    }
    if (!type) throw new Error('预览图片格式不支持。');
    return 'data:' + type + ';base64,' + new util.Base64Helper().encodeToStringSync(this.readBytes(this.target(relative), 4 * 1024 * 1024));
  }
  private contains(parent: string, path: string): boolean { return path === parent || path.startsWith(parent + '/'); }
  private remap(doc: StoredDocument, source: string, destination: string, copy: boolean): StoredDocument {
    const path = destination + (doc.path || doc.name).substring(source.length);
    return { id: copy ? util.generateRandomUUID() : doc.id, name: path.substring(path.lastIndexOf('/') + 1), path: path,
      text: doc.text, kind: doc.kind, delimiter: doc.delimiter, updatedAt: doc.updatedAt, remote: copy ? null : doc.remote };
  }
  private cache(): SavedWorkspace {
    const root = this.getRoot();
    if (!root) throw new Error('工作区未初始化。');
    if (fs.accessSync(this.cachePath(root.id))) return JSON.parse(fs.readTextSync(this.cachePath(root.id))) as SavedWorkspace;
    const state = this.scan();
    return { version: 1, storage: state.storage, documents: state.documents, folders: state.folders, repositories: state.repositories };
  }
  private copyTree(source: string, destination: string, count: number[]): void {
    if (++count[0] > 5000) throw new Error('复制项目超过 5000 个。');
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error('不允许复制符号链接。');
    if (stat.isDirectory()) {
      fs.mkdirSync(destination);
      for (const name of fs.listFileSync(source)) {
        this.relative(name);
        if (name === '.git' || name.endsWith('.wenzhou-tmp')) throw new Error('请先移除目录中的保留文件或选择其他目录。');
        this.copyTree(source + '/' + name, destination + '/' + name, count);
      }
    } else if (stat.isFile()) fs.copyFileSync(source, destination);
    else throw new Error('不支持此文件类型。');
  }
  private removeTree(path: string): void {
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('不允许删除符号链接。');
    if (stat.isDirectory()) fs.rmdirSync(path); else fs.unlinkSync(path);
  }
  private trashPath(): string { return this.contextValue().filesDir + '/trash.json'; }
  private trashRecords(): TrashRecord[] { return fs.accessSync(this.trashPath()) ? JSON.parse(fs.readTextSync(this.trashPath())) as TrashRecord[] : []; }
  private trashPayload(id: string): string {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('回收站标识无效。');
    const root = this.getRoot();
    if (!root) throw new Error('工作区未初始化。');
    const path = root.path + '/.trash-' + id + '.wenzhou-tmp';
    if (fs.accessSync(path) && fs.lstatSync(path).isSymbolicLink()) throw new Error('回收站内容无效。');
    return path;
  }
  listTrash(): TrashItem[] {
    return this.trashRecords().filter(item => item.workspaceId === this.getRoot()?.id)
      .map((item): TrashItem => ({ id: item.id, path: item.path, directory: item.directory, createdAt: item.createdAt }));
  }
  manage(action: string, relative: string, destination: string): FolderState {
    const root = this.getRoot();
    if (!root) throw new Error('工作区未初始化。');
    const source = this.target(relative), old = this.cache(), before = JSON.stringify(old);
    if (!fs.accessSync(source)) throw new Error('文件或文件夹不存在，请刷新工作区。');
    const records = this.trashRecords(), previousTrash = JSON.stringify(records);
    let target = '', copied = false, moved = false;
    try {
      if (action === 'delete') {
        if (records.length >= 100) throw new Error('回收站已有 100 项，请先恢复或永久删除部分项目。');
        const id = util.generateRandomUUID(); target = this.trashPayload(id);
        const documents = old.documents.filter(doc => this.contains(relative, doc.path || doc.name));
        const repositories = (old.repositories || []).filter(item => this.contains(relative, item.folder));
        records.push({ id: id, workspaceId: root.id, path: relative, directory: fs.lstatSync(source).isDirectory(), createdAt: Date.now(), documents: documents, repositories: repositories });
        old.documents = old.documents.filter(doc => !this.contains(relative, doc.path || doc.name));
        old.repositories = (old.repositories || []).filter(item => !this.contains(relative, item.folder));
        fs.renameSync(source, target); moved = true;
      } else if (action === 'move' || action === 'copy') {
        target = this.target(destination);
        if (this.contains(relative, destination)) throw new Error('不能将项目放入自身或其子目录。');
        if (fs.accessSync(target)) throw new Error('目标已存在，请更改名称或目标目录。');
        this.parent(target);
        if (action === 'copy') {
          copied = true; this.copyTree(source, target, [0]);
          old.documents = old.documents.concat(old.documents.filter(doc => this.contains(relative, doc.path || doc.name)).map(doc => this.remap(doc, relative, destination, true)));
        } else {
          fs.renameSync(source, target); moved = true;
          old.documents = old.documents.map(doc => this.contains(relative, doc.path || doc.name) ? this.remap(doc, relative, destination, false) : doc);
          old.repositories = (old.repositories || []).map((item): RepositoryLink => ({ repo: item.repo, branch: item.branch, commit: item.commit,
            folder: this.contains(relative, item.folder) ? destination + item.folder.substring(relative.length) : item.folder }));
        }
      } else throw new Error('文件操作无效。');
      if (old.pluginProject) {
        const entries: Record<string, string> = {}, texts: Record<string, boolean> = {};
        for (const key of Object.keys(old.pluginProject.entries)) {
          if (!this.contains(relative, key) || action === 'copy') entries[key] = old.pluginProject.entries[key];
          if (this.contains(relative, key) && action !== 'delete') entries[destination + key.substring(relative.length)] = action === 'copy' ? util.generateRandomUUID() : old.pluginProject.entries[key];
        }
        if (old.pluginProject.textFiles) for (const key of Object.keys(old.pluginProject.textFiles)) {
          if (!this.contains(relative, key) || action === 'copy') texts[key] = old.pluginProject.textFiles[key];
          if (this.contains(relative, key) && action !== 'delete') texts[destination + key.substring(relative.length)] = old.pluginProject.textFiles[key];
        }
        old.pluginProject.entries = entries; old.pluginProject.textFiles = texts;
      }
      this.text(this.cachePath(root.id), JSON.stringify(old));
      if (action === 'delete') this.text(this.trashPath(), JSON.stringify(records));
      return this.scan();
    } catch (error) {
      if (moved && fs.accessSync(target)) fs.renameSync(target, source);
      if (copied && fs.accessSync(target)) this.removeTree(target);
      this.text(this.cachePath(root.id), before);
      if (action === 'delete') this.text(this.trashPath(), previousTrash);
      throw error as Error;
    }
  }
  restoreTrash(id: string, permanent: boolean): FolderState {
    const root = this.getRoot();
    if (!root) throw new Error('工作区未初始化。');
    const records = this.trashRecords(), item = records.find(value => value.id === id && value.workspaceId === root.id);
    if (!item) throw new Error('回收站项目不存在。');
    const source = this.trashPayload(id), old = this.cache(), before = JSON.stringify(old), previousTrash = JSON.stringify(records);
    if (permanent) { if (fs.accessSync(source)) this.removeTree(source); this.text(this.trashPath(), JSON.stringify(records.filter(value => value.id !== id))); return this.scan(); }
    if (!fs.accessSync(source)) throw new Error('回收站文件已在外部移除。');
    const target = this.target(item.path);
    if (fs.accessSync(target)) throw new Error('原路径已有同名项目，请先重命名后恢复。');
    this.parent(target); fs.renameSync(source, target);
    try {
      old.documents = old.documents.concat(item.documents); old.repositories = (old.repositories || []).concat(item.repositories);
      this.text(this.cachePath(root.id), JSON.stringify(old)); this.text(this.trashPath(), JSON.stringify(records.filter(value => value.id !== id)));
      return this.scan();
    } catch (error) { fs.renameSync(target, source); this.text(this.cachePath(root.id), before); this.text(this.trashPath(), previousTrash); throw error as Error; }
  }
}
