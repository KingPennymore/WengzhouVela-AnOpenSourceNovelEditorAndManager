import { rcp } from '@kit.RemoteCommunicationKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { url, util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { Runtime } from './Runtime';

export interface DownloadRequest { id?: string; url?: string; name?: string; size?: number; sha256?: string; limit?: number; }
export interface DownloadedComponent { name: string; size: number; sha256: string; importToken: string; url: string; }
interface DownloadProgress { id: string; received: number; total: number; }
interface StagedFile { path: string; name: string; }

const COMPONENT_LIMIT = 96 * 1024 * 1024;
const HOSTS: string[] = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'gitee.com', 'foruda.gitee.com'];

/**
 * Component ZIPs from GitHub / Gitee releases go to the private cache and are read by the editor from
 * https://wenzhou-editor.local/imports/<token>, never as a Base64 bridge string. HarmonyOS apps cannot
 * install packages themselves, so app updates only open the release page.
 */
export class ReleaseDownloads {
  context: common.UIAbilityContext | undefined = undefined;
  private sessions: Map<string, rcp.Session> = new Map();
  private cancelled: Set<string> = new Set();
  private files: Map<string, StagedFile> = new Map();

  static allowed(value: string): boolean {
    try {
      const parsed = url.URL.parseURL(value);
      return parsed.protocol === 'https:' && parsed.port === '' && parsed.username === '' && parsed.password === '' && HOSTS.includes(parsed.hostname);
    } catch (error) { return false; }
  }

  private directory(): string {
    if (!this.context) throw new Error('应用尚未准备好，请稍后重试。');
    const path = this.context.cacheDir + '/release-downloads';
    if (!fs.accessSync(path)) fs.mkdirSync(path, true);
    return path;
  }

  private progress(id: string, received: number, total: number): void {
    const detail: DownloadProgress = { id: id, received: received, total: total };
    Runtime.controller?.runJavaScript('window.dispatchEvent(new CustomEvent("wenzhouDownload",{detail:' + JSON.stringify(detail) + '}))').catch(() => {});
  }

  private async sha256(path: string): Promise<string> {
    const md = cryptoFramework.createMd('SHA256');
    const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
    try {
      const buffer = new ArrayBuffer(1024 * 1024);
      while (true) {
        const count = fs.readSync(file.fd, buffer);
        if (count <= 0) break;
        await md.update({ data: new Uint8Array(buffer.slice(0, count)) });
      }
    } finally { fs.closeSync(file); }
    const digest = await md.digest();
    let hex = '';
    digest.data.forEach((value: number) => { hex += (value < 16 ? '0' : '') + value.toString(16); });
    return hex;
  }

  async component(data: DownloadRequest): Promise<DownloadedComponent> {
    const id = data.id || '', name = data.name || '', expected = data.sha256 || '';
    let target = data.url || '';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('下载标识无效。');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(name)) throw new Error('文件名无效。');
    if (!ReleaseDownloads.allowed(target)) throw new Error('不允许的下载地址。');
    const size = data.size || 0, max = Math.min(COMPONENT_LIMIT, data.limit && data.limit > 0 ? data.limit : COMPONENT_LIMIT);
    if (size < 0 || size > max) throw new Error('文件超过大小上限。');
    if (expected !== '' && !/^[0-9a-f]{64}$/.test(expected)) throw new Error('校验信息无效。');
    if (this.sessions.size > 0) throw new Error('已有下载正在进行，请稍后。');
    if (this.files.size >= 2) throw new Error('请先完成当前组件导入。');
    const token = util.generateRandomUUID(true), path = this.directory() + '/' + token;
    let last = 0, received = 0;
    const session = rcp.createSession({ headers: { 'User-Agent': 'Vela-HarmonyOS' }, requestConfiguration: {
      proxy: 'system',
      transfer: { autoRedirect: false, timeout: { connectMs: 15000, transferMs: 30 * 60 * 1000 } },
      tracing: { httpEventsHandler: { onDownloadProgress: (total: number, transferred: number) => {
        received = transferred;
        if (transferred > max) { session.cancel(); return; }
        const now = Date.now();
        if (now - last > 200) { last = now; this.progress(id, transferred, size > 0 ? size : total); }
      } } }
    } });
    this.sessions.set(id, session);
    this.cancelled.delete(id);
    try {
      // Every redirect hop is re-checked against the host list before anything is downloaded.
      for (let hop = 0; ; hop++) {
        if (hop > 5) throw new Error('下载重定向次数过多。');
        if (!ReleaseDownloads.allowed(target)) throw new Error('下载被重定向到不允许的地址。');
        const head = await session.fetch(new rcp.Request(target, 'HEAD'));
        if ([301, 302, 303, 307, 308].includes(head.statusCode)) {
          const location = head.headers['location'] as string | undefined;
          if (!location) throw new Error('下载重定向无效。');
          target = url.URL.parseURL(location, target).toString();
          continue;
        }
        break;
      }
      if (this.cancelled.has(id)) throw new Error('下载已取消。');
      const response = await session.downloadToFile(target, { kind: 'file', file: path });
      if (response.statusCode !== 200) throw new Error(response.statusCode === 404 ? '发布中没有这个文件（HTTP 404）。' : '下载失败（HTTP ' + response.statusCode + '）。');
      const actual = fs.statSync(path).size;
      if (actual > max) throw new Error('文件超过大小上限。');
      if (size > 0 && actual !== size) throw new Error('下载内容不完整。');
      const hash = await this.sha256(path);
      if (expected !== '' && hash !== expected) throw new Error('文件的 SHA-256 与发布信息不符。');
      this.progress(id, actual, actual);
      this.files.set(token, { path: path, name: name });
      const result: DownloadedComponent = { name: name, size: actual, sha256: hash, importToken: token, url: 'https://wenzhou-editor.local/imports/' + token };
      return result;
    } catch (error) {
      try { fs.unlinkSync(path); } catch (missing) { /* Nothing was written. */ }
      if (this.cancelled.has(id)) throw new Error('下载已取消。');
      if (received > max) throw new Error('文件超过大小上限。');
      const message = (error as Error).message || '';
      if (/[一-鿿]/.test(message)) throw new Error(message);
      throw new Error('无法连接下载服务器，请检查网络后重试。');
    } finally {
      this.sessions.delete(id);
      this.cancelled.delete(id);
      try { session.close(); } catch (closed) { /* Already closed. */ }
    }
  }

  /** A ZIP picked by the user, copied into the cache and read through the same imports URL as a download. */
  stage(uri: string, name: string, image: boolean = false): DownloadedComponent {
    if (this.files.size >= 2) throw new Error('请先完成当前组件导入。');
    const token = util.generateRandomUUID(true), path = this.directory() + '/' + token;
    const source = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(source.fd).size;
      if (size > (image ? 20 * 1024 * 1024 : COMPONENT_LIMIT)) throw new Error(image ? '原图不能超过 20 MB。' : '安装包不能超过 96 MB。');
      fs.copyFileSync(source.fd, path);
    } finally { fs.closeSync(source); }
    const size = fs.statSync(path).size;
    if (size > (image ? 20 * 1024 * 1024 : COMPONENT_LIMIT)) { fs.unlinkSync(path); throw new Error(image ? '原图不能超过 20 MB。' : '安装包不能超过 96 MB。'); }
    this.files.set(token, { path: path, name: 'picked.zip' });
    const result: DownloadedComponent = { name: name, size: size, sha256: '', importToken: token, url: 'https://wenzhou-editor.local/imports/' + token };
    return result;
  }

  cancel(id: string): boolean {
    this.cancelled.add(id);
    const session = this.sessions.get(id);
    if (session) { try { session.cancel(); } catch (error) { /* Finished meanwhile. */ } }
    return true;
  }

  release(token: string): boolean {
    const entry = this.files.get(token);
    this.files.delete(token);
    if (entry) { try { fs.unlinkSync(entry.path); } catch (error) { /* Already removed. */ } }
    return true;
  }

  /** Bytes for the same-origin /imports/<token> URL, or null when the token is unknown. */
  read(token: string): ArrayBuffer | null {
    const entry = this.files.get(token);
    if (!entry) return null;
    const file = fs.openSync(entry.path, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size, buffer = new ArrayBuffer(size);
      let offset = 0;
      while (offset < size) {
        const count = fs.readSync(file.fd, buffer, { offset: offset, length: size - offset });
        if (count <= 0) throw new Error('读取不完整。');
        offset += count;
      }
      return buffer;
    } finally { fs.closeSync(file); }
  }

  isText(token: string): boolean { return /\.txt$/i.test(this.files.get(token)?.name || ''); }

  async openRelease(target: string): Promise<boolean> {
    if (!/^https:\/\/(github\.com\/KingPennymore\/WengzhouVela-AnOpenSourceNovelEditorAndManager|gitee\.com\/kingpennymore\/wenzhou-vela-mirror-repository)\/releases\/tag\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(target)) throw new Error('发布地址无效。');
    if (!this.context) throw new Error('应用尚未准备好，请稍后重试。');
    await this.context.startAbility({ action: 'ohos.want.action.viewData', entities: ['entity.system.browsable'], uri: target });
    return true;
  }

  clear(): void {
    try { if (this.context && fs.accessSync(this.context.cacheDir + '/release-downloads')) fs.rmdirSync(this.context.cacheDir + '/release-downloads'); } catch (error) { /* Best effort. */ }
  }
}
