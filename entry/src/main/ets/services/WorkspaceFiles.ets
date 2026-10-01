import { common } from '@kit.AbilityKit';
import { fileIo as fs, fileUri, picker, fileShare, Environment } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { decodeFileText, decodedFileName } from './FileText';

export interface StoredDocument { id: string; name: string; path?: string; kind?: string; delimiter?: string; text: string; updatedAt: number; remote: Object | null; }
export interface StorageInfo { id: string; label: string; root: string; needsSetup: boolean; }
export interface FolderEntry { path: string; name: string; directory: boolean; size: number; editable: boolean; reason: string; }
interface RepositoryLink { repo: string; branch: string; folder: string; commit: string; }
export interface FolderState { storage: StorageInfo; documents: StoredDocument[]; folders: string[]; entries: FolderEntry[]; repositories: RepositoryLink[]; }
interface FolderRoot { id: string; uri: string; path: string; label: string; }
interface FolderConfig { current: string; default: string; roots: FolderRoot[]; }
interface SavedWorkspace { version: number; storage?: StorageInfo; documents: StoredDocument[]; folders?: string[]; repositories?: RepositoryLink[]; }
export interface BinaryWorkspaceFile { path: string; data: string; }

// The chosen root is held by the native service. JavaScript only supplies relative paths.
export class WorkspaceFiles {
  context: common.UIAbilityContext | undefined = undefined;
  private config: FolderConfig = { current: '', default: '', roots: [] };
  private ready: boolean = false;
  private encoder: util.TextEncoder = new util.TextEncoder();

  private contextValue(): common.UIAbilityContext {
    if (!this.context) throw new Error('文件服务尚未准备好。');
    return this.context;
  }
  private getRoot(): FolderRoot | undefined { return this.config.roots.find(root => root.id === this.config.current); }
  private configPath(): string { return this.contextValue().filesDir + '/folders.json'; }
  private cachePath(id: string): string { return this.contextValue().filesDir + '/folder-' + id + '.json'; }
  private info(): StorageInfo {
    const root = this.getRoot();
    return { id: root?.id || '', label: root?.label || '未设置文稿目录', root: root?.path || '', needsSetup: !root };
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
  private text(path: string, value: string): void { this.atomic(path, this.encoder.encodeInto(value)); }
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
    if (!root) throw new Error('请先设置文稿目录或打开文件夹。');
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
  private policy(uri: string): fileShare.PolicyInfo[] {
    return [{ uri: uri, operationMode: fileShare.OperationMode.READ_MODE | fileShare.OperationMode.WRITE_MODE }];
  }
  async initialize(): Promise<FolderState> {
    if (!this.ready) {
      if (fs.accessSync(this.configPath())) this.config = JSON.parse(fs.readTextSync(this.configPath())) as FolderConfig;
      const root = this.getRoot();
      if (root?.uri) await fileShare.activatePermission(this.policy(root.uri));
      // 2in1 devices can supply a pre-authorized Downloads path. Tablets use the folder picker.
      if (!root) {
        try {
          const path = Environment.getUserDownloadDir();
          if (fs.accessSync(path)) {
            const folder = path + '/文舟';
            if (!fs.accessSync(folder)) fs.mkdirSync(folder);
            const selected: FolderRoot = { id: util.generateRandomUUID(), uri: '', path: folder, label: '文舟' };
            this.config.roots.push(selected); this.config.current = selected.id; this.config.default = selected.id;
            this.text(this.configPath(), JSON.stringify(this.config));
          }
        } catch (_) { /* Public Downloads is not pre-authorized on phones/tablets. */ }
      }
      this.ready = true;
    }
    return this.scan();
  }
  async choose(useDefault: boolean): Promise<FolderState | null> {
    const selector = new picker.DocumentViewPicker(this.contextValue());
    const options: picker.DocumentSelectOptions = { selectMode: picker.DocumentSelectMode.FOLDER, maxSelectNumber: 1 };
    const uris = await selector.select(options);
    if (!uris.length) return null;
    await fileShare.persistPermission(this.policy(uris[0]));
    const uri = new fileUri.FileUri(uris[0]);
    const base = decodedFileName(uri.path).replace(/\/$/, '');
    const path = useDefault ? base + '/文舟' : base;
    if (!fs.accessSync(path)) fs.mkdirSync(path);
    if (!fs.lstatSync(path).isDirectory() || fs.lstatSync(path).isSymbolicLink()) throw new Error('请选择有效的本地文件夹。');
    let root = this.config.roots.find(item => item.path === path);
    if (!root) {
      root = { id: util.generateRandomUUID(), uri: uris[0], path: path, label: useDefault ? '文舟' : decodedFileName(uri.name) };
      this.config.roots.push(root);
    }
    const previous = this.config.current, previousDefault = this.config.default;
    this.config.current = root.id;
    let result: FolderState;
    try {
      result = this.scan();
      if (useDefault) this.config.default = root.id;
      this.text(this.configPath(), JSON.stringify(this.config));
    } catch (error) { this.config.current = previous; this.config.default = previousDefault; throw error as Error; }
    this.ready = true;
    return result;
  }
  scan(): FolderState {
    const root = this.getRoot(), documents: StoredDocument[] = [], folders: string[] = [], entries: FolderEntry[] = [];
    if (!root) return { storage: this.info(), documents: documents, folders: folders, entries: entries, repositories: [] };
    const old: SavedWorkspace | undefined = fs.accessSync(this.cachePath(root.id)) ? JSON.parse(fs.readTextSync(this.cachePath(root.id))) as SavedWorkspace : undefined;
    this.walk('', old?.documents || [], documents, folders, entries);
    return { storage: this.info(), documents: documents, folders: folders, entries: entries, repositories: old?.repositories || [] };
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
        try {
          const text = this.readText(path), previous = old.find(doc => (doc.path || doc.name) === relative);
          const doc: StoredDocument = { id: previous?.id || util.generateRandomUUID(), name: name, path: relative, kind: previous?.kind, delimiter: previous?.delimiter, text: text, updatedAt: previous?.text === text ? previous.updatedAt : Date.now(), remote: previous?.remote || null };
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
        this.writeBytes(staging + '/new-' + i, new util.Base64Helper().decodeSync(files[i].data));
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
}
