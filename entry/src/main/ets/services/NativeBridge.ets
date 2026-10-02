import { common } from '@kit.AbilityKit';
import { rcp } from '@kit.RemoteCommunicationKit';
import { fileIo as fs, picker, fileUri } from '@kit.CoreFileKit';
import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { NativeOperationError, operationError, loginStatusError } from './NativeErrors';
import { Runtime } from './Runtime';
import { HtmlPreviewSession } from './HtmlPreviewSession';
import { PreviewResource } from './PreviewResource';
import { WorkspaceFiles, BinaryWorkspaceFile } from './WorkspaceFiles';
import { decodeFileText, decodedFileName } from './FileText';

interface BridgeRequest {
  path?: string;
  method?: string;
  body?: Object;
  token?: string;
  name?: string;
  text?: string;
  data?: string;
  dark?: boolean;
  reading?: boolean;
  embedded?: boolean;
  readingMode?: string;
  fontSize?: number;
  language?: string;
  background?: string;
  foreground?: string;
  files?: BinaryWorkspaceFile[];
  folders?: string[];
  action?: string;
  destination?: string;
  id?: string;
  permanent?: boolean;
}
interface BridgeResult { ok: boolean; value?: Object; error?: string; code?: number; stage?: string; }
interface ApiResult { status: number; body: Object; }
interface OAuthResult {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface AuthorizedResult { authorized: boolean; }
interface ImportedFile { name: string; text?: string; data?: string; }
interface ImportedPlugin { name: string; data: string; }
interface WorkspaceHeader { version: number; documents: Object[]; }
interface EmptyBody { message: string; }

export class NativeBridge {
  context: common.UIAbilityContext | undefined = undefined;
  private token: string = '';
  private tokenLoaded: boolean = false;
  private authGeneration: number = 0;
  private encoder: util.TextEncoder = new util.TextEncoder();
  private alias: Uint8Array = new util.TextEncoder().encodeInto('wenzhou.github.token');
  private workspaceFiles: WorkspaceFiles = new WorkspaceFiles();

  previewResource(path: string, html: boolean): PreviewResource {
    this.workspaceFiles.context = this.context;
    return this.workspaceFiles.readPreviewResource(path, html);
  }

  private success(value: Object): string {
    const result: BridgeResult = { ok: true, value: value };
    return JSON.stringify(result);
  }

  private getContext(): common.UIAbilityContext {
    if (!this.context) throw new Error('应用尚未准备好，请稍后重试。');
    return this.context;
  }

  readWorkspace(): string {
    const path = this.getContext().filesDir + '/workspace.json';
    if (!fs.accessSync(path)) return '';
    return fs.readTextSync(path);
  }

  readEnvironment(): string { return Runtime.readEnvironment(); }

  readPlugins(): string {
    const path = this.getContext().filesDir + '/plugins.json';
    return fs.accessSync(path) ? fs.readTextSync(path) : '';
  }

  writePlugins(data: string): string {
    try {
      if (!Array.isArray(JSON.parse(data)) || data.length > 24 * 1024 * 1024) throw new Error('插件存储格式或大小不正确。');
      const path = this.getContext().filesDir + '/plugins.json';
      this.writeFile(path + '.tmp', data);
      fs.renameSync(path + '.tmp', path);
      return 'ok';
    } catch (error) { return '插件保存失败：' + (error as Error).message; }
  }

  writeWorkspace(data: string): string {
    try {
      const parsed = JSON.parse(data) as WorkspaceHeader;
      if (parsed.version !== 1 || !Array.isArray(parsed.documents)) {
        throw new Error('文稿数据无效。');
      }
      const path = this.getContext().filesDir + '/workspace.json';
      const temp = path + '.tmp';
      this.workspaceFiles.context = this.context;
      this.workspaceFiles.mirror(data);
      this.writeFile(temp, data);
      if (fs.accessSync(path)) fs.copyFileSync(path, path + '.bak');
      fs.renameSync(temp, path);
      return 'ok';
    } catch (error) {
      return '本地保存失败：' + (error as Error).message;
    }
  }

  private writeFile(path: string, text: string): void {
    const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      const bytes = this.encoder.encodeInto(text);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = fs.writeSync(file.fd, bytes.buffer.slice(offset));
        if (written <= 0) throw new Error('未能完整写入文稿。');
        offset += written;
      }
      fs.fsyncSync(file.fd);
    } finally {
      fs.closeSync(file);
    }
  }

  private async loadToken(): Promise<string> {
    if (this.tokenLoaded) return this.token;
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias);
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const entries = await asset.query(query);
      if (entries.length > 0) {
        const bytes = entries[0].get(asset.Tag.SECRET) as Uint8Array;
        this.token = util.TextDecoder.create('utf-8').decodeToString(bytes);
      }
      this.tokenLoaded = true;
      return this.token;
    } catch (error) {
      const failure = operationError(error as Object, 'credentials');
      if (failure.code === 24000002) {
        this.tokenLoaded = true;
        return '';
      }
      throw failure;
    }
  }

  private async storeToken(token: string): Promise<void> {
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, this.alias);
    attributes.set(asset.Tag.SECRET, this.encoder.encodeInto(token));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
    attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    try {
      await asset.add(attributes);
    } catch (error) {
      throw operationError(error as Object, 'credentials');
    }
    this.token = token;
    this.tokenLoaded = true;
  }

  private async request(url: string, method: rcp.HttpMethod, body: Object | undefined,
    token: string = ''): Promise<ApiResult> {
    let client: rcp.Session | undefined = undefined;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Wenzhou-HarmonyOS/0.3.0'
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['Accept'] = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    try {
      client = rcp.createSession({ requestConfiguration: {
        proxy: 'system',
        transfer: { autoRedirect: false, timeout: { connectMs: 15000, transferMs: 30000 } }
      } });
      const request = new rcp.Request(url, method, headers, body ? JSON.stringify(body) : undefined);
      const response = await client.fetch(request);
      const text = response.toString();
      const empty: EmptyBody = { message: '' };
      let responseBody: Object = empty;
      if (text) {
        try {
          responseBody = JSON.parse(text) as Object;
        } catch (error) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            throw new NativeOperationError('GitHub 响应格式异常，请检查设备网络或代理。', 'network', response.statusCode);
          }
        }
      }
      const result: ApiResult = { status: response.statusCode, body: responseBody };
      return result;
    } catch (error) {
      throw operationError(error as Object, 'network');
    } finally {
      // A close error must not hide the original request failure.
      try { client?.close(); } catch (error) { /* Session is already unavailable. */ }
    }
  }

  private apiMethod(value: string): rcp.HttpMethod {
    if (value === 'GET') return 'GET';
    if (value === 'POST') return 'POST';
    if (value === 'PUT') return 'PUT';
    if (value === 'PATCH') return 'PATCH';
    if (value === 'DELETE') return 'DELETE';
    throw new Error('不支持此请求方法。');
  }

  async call(operation: string, json: string): Promise<string> {
    try {
      const data = JSON.parse(json) as BridgeRequest;
      this.workspaceFiles.context = this.context;
      if (operation === 'initializeStorage') return this.success(await this.workspaceFiles.initialize());
      if (operation === 'manageFiles') return this.success(this.workspaceFiles.manage(data.action || '', data.path || '', data.destination || ''));
      if (operation === 'listTrash') return this.success(this.workspaceFiles.listTrash());
      if (operation === 'restoreTrash') return this.success(this.workspaceFiles.restoreTrash(data.id || '', data.permanent === true));
      if (operation === 'refreshFolder') return this.success(this.workspaceFiles.scan());
      if (operation === 'readWorkspaceFile') return this.success(this.workspaceFiles.readFileBase64(data.path || ''));
      if (operation === 'readWorkspaceAsset') return this.success(this.workspaceFiles.readAsset(data.path || ''));
      if (operation === 'previewHtml') {
        this.workspaceFiles.readPreviewResource(data.path || '', true);
        if (data.embedded === true) return this.success('https://wenzhou-preview.local/' + (data.path || '').split('/').map(part => encodeURIComponent(part)).join('/') + '?html=true&fontSize=' + Math.max(10, Math.min(40, data.fontSize || 16)) + '&dark=' + (data.dark === true));
        HtmlPreviewSession.files = this.workspaceFiles;
        HtmlPreviewSession.path = data.path || '';
        HtmlPreviewSession.dark = data.dark === true;
        HtmlPreviewSession.reading = data.reading === true;
        HtmlPreviewSession.pages = data.readingMode === 'pages';
        HtmlPreviewSession.english = data.language === 'en';
        HtmlPreviewSession.fontSize = data.fontSize || 16;
        if (!Runtime.mainWindow) throw new Error('预览页面尚未准备好。');
        await Runtime.mainWindow.getUIContext().getRouter().pushUrl({ url: 'pages/HtmlPreview' });
        return this.success(true);
      }
      if (operation === 'writeWorkspaceFiles') return this.success(this.workspaceFiles.writeFiles(data.files || [], data.folders || []));
      if (operation === 'connection') {
        return this.success(await this.request('https://api.github.com', 'GET', undefined));
      }
      if (operation === 'api' || operation === 'publicApi') {
        const path = data.path || '';
        // Fixed origin, no arbitrary proxy URLs or credential access from the page.
        if (!/^\/(user(?:\?|$)|user\/repos(?:\?|$)|repos\/[\w.-]+\/[\w.-]+(?:\/|\?|$))/.test(path)
          || /[\r\n\\#]/.test(path) || path.includes('..')) {
          throw new Error('不允许的 GitHub 请求路径。');
        }
        if (operation === 'publicApi' && ((data.method || 'GET') !== 'GET' || !path.startsWith('/repos/'))) throw new Error('Public repository reads only.');
        const token = await this.loadToken();
        if (!token && operation !== 'publicApi') {
          const empty: EmptyBody = { message: 'Not signed in' };
          const unauthorized: ApiResult = { status: 401, body: empty };
          return this.success(unauthorized);
        }
        return this.success(await this.request('https://api.github.com' + path,
          this.apiMethod(data.method || 'GET'), data.body, token));
      }
      if (operation === 'login') {
        const generation = ++this.authGeneration;
        const token = (data.token || '').trim();
        if (!token || /\s/.test(token)) throw new Error('访问令牌格式不正确。');
        const user = await this.request('https://api.github.com/user', 'GET', undefined, token);
        if (user.status !== 200) throw loginStatusError(user.status);
        if (generation !== this.authGeneration) throw new Error('登录已取消。');
        await this.storeToken(token);
        return this.success(user.body);
      }
      if (operation === 'logout') {
        this.authGeneration++;
        const query: asset.AssetMap = new Map();
        query.set(asset.Tag.ALIAS, this.alias);
        try {
          await asset.remove(query);
        } catch (error) {
          const failure = operationError(error as Object, 'credentials');
          if (failure.code !== 24000002) throw failure;
        }
        this.token = '';
        this.tokenLoaded = true;
        return this.success(true);
      }
      if (operation === 'oauth') {
        const path = data.path || '';
        if (path !== '/login/device/code' && path !== '/login/oauth/access_token') {
          throw new Error('不允许的授权地址。');
        }
        const generation = this.authGeneration;
        const response = await this.request('https://github.com' + path, 'POST', data.body);
        if (response.status !== 200) throw new Error('GitHub 授权请求失败，请检查 Client ID 与网络。');
        const oauth = response.body as OAuthResult;
        if (oauth.access_token) {
          const user = await this.request('https://api.github.com/user', 'GET', undefined, oauth.access_token);
          if (user.status !== 200) throw loginStatusError(user.status);
          if (generation !== this.authGeneration) throw new Error('登录已取消。');
          await this.storeToken(oauth.access_token);
          // Expired credentials trigger reauthentication. Refresh credentials are never sent to WebView.
          const authorized: AuthorizedResult = { authorized: true };
          return this.success(authorized);
        }
        return this.success(response.body);
      }
      if (operation === 'openAuth') {
        await this.getContext().startAbility({ action: 'ohos.want.action.viewData', uri: 'https://github.com/login/device' });
        return this.success(true);
      }
      if (operation === 'export' || operation === 'exportPdf') {
        const name = data.name || '文稿.txt';
        if (/[\\/\x00-\x1f]/.test(name)) throw new Error('文件名无效。');
        const documentPicker = new picker.DocumentViewPicker(this.getContext());
        const options: picker.DocumentSaveOptions = { newFileNames: [name] };
        const uris = await documentPicker.save(options);
        if (uris.length === 0) return this.success(false);
        if (operation === 'exportPdf') {
          const bytes = new util.Base64Helper().decodeSync(data.data || '');
          if (bytes.length < 5 || bytes.length > 32 * 1024 * 1024 || new util.TextDecoder('utf-8').decodeToString(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF 无效或超过 32 MB。');
          const file = fs.openSync(uris[0], fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
          try { const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); fs.writeSync(file.fd, buffer); } finally { fs.closeSync(file); }
        } else this.writeFile(uris[0], data.text || '');
        return this.success(true);
      }
      if (operation === 'import') {
        const documentPicker = new picker.DocumentViewPicker(this.getContext());
        const options: picker.DocumentSelectOptions = { fileSuffixFilters: ['所有文件|.*', '文本|.txt', 'Markdown|.md,.markdown,.mdown,.mkd', 'HTML|.html,.htm', 'CSV|.csv'], maxSelectNumber: 10 };
        const uris = await documentPicker.select(options);
        const files: ImportedFile[] = [];
        for (const uri of uris) {
          const file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
          try {
            const size = fs.statSync(file.fd).size;
            if (size > 8 * 1024 * 1024) throw new Error('请选择 8 MB 以内的文件。');
            const buffer = new ArrayBuffer(size);
            let offset = 0;
            while (offset < size) {
              const piece = new ArrayBuffer(size - offset);
              const count = fs.readSync(file.fd, piece);
              if (count <= 0) throw new Error('未能完整读取文稿。');
              new Uint8Array(buffer).set(new Uint8Array(piece, 0, count), offset);
              offset += count;
            }
            const imported: ImportedFile = { name: decodedFileName(new fileUri.FileUri(uri).name) };
            try { imported.text = decodeFileText(new Uint8Array(buffer)); }
            catch (error) { imported.data = new util.Base64Helper().encodeToStringSync(new Uint8Array(buffer)); }
            files.push(imported);
          } finally {
            fs.closeSync(file);
          }
        }
        return this.success(files);
      }
      if (operation === 'appearance') {
        await Runtime.applyAppearance(data.dark === true, data.background, data.foreground);
        return this.success(true);
      }
      if (operation === 'importPlugin') {
        const documentPicker = new picker.DocumentViewPicker(this.getContext());
        const uris = await documentPicker.select({ fileSuffixFilters: ['Acode 插件|.zip'], maxSelectNumber: 1 });
        if (uris.length === 0) return this.success(false);
        const file = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
        try {
          const size = fs.statSync(file.fd).size;
          if (size > 64 * 1024 * 1024) throw new Error('宏包 ZIP 不能超过 64 MB。');
          const buffer = new Uint8Array(size);
          let offset = 0;
          while (offset < size) {
            const piece = new ArrayBuffer(size - offset);
            const count = fs.readSync(file.fd, piece);
            if (count <= 0) throw new Error('插件读取不完整。');
            buffer.set(new Uint8Array(piece, 0, count), offset);
            offset += count;
          }
          const result: ImportedPlugin = { name: new fileUri.FileUri(uris[0]).name, data: new util.Base64Helper().encodeToStringSync(buffer) };
          return this.success(result);
        } finally { fs.closeSync(file); }
      }
      throw new Error('不支持此操作。');
    } catch (error) {
      const failure = operationError(error as Object, 'device');
      // Never log tokens, request bodies, account details or raw system exception data.
      hilog.error(0x1122, 'WenzhouAuth', 'stage=%{public}s code=%{public}d', failure.stage, failure.code);
      const result: BridgeResult = { ok: false, error: failure.message, code: failure.code, stage: failure.stage };
      return JSON.stringify(result);
    }
  }
}
