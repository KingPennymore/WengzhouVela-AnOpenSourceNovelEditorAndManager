import { rcp } from '@kit.RemoteCommunicationKit';
import { url, util } from '@kit.ArkTS';

export interface AiRequest { action?: string; format?: string; endpoint?: string; key?: string; requestId?: string; method?: string; path?: string; body?: Object; }
export interface AiCredentials { read: () => Promise<string>; write: (value: string) => Promise<void>; clear: () => Promise<void>; }
interface AiCredential { format: string; endpoint: string; key: string; }
interface AiStatus { saved: boolean; format: string; endpoint: string; last4: string; }
interface AiResult { status: number; body: Object; }
interface AiError { error: AiMessage; }
interface AiMessage { message: string; }
interface AiSystemError { code?: number; }
class AiTask {
  session: rcp.Session | undefined = undefined;
  cancelled: boolean = false;
  timedOut: boolean = false;
  stop(): void { try { this.session?.cancel(); } catch (_) { /* Already finished. */ } }
}

export function aiEndpoint(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 400 || /[^\x21-\x7e]|[\\?#]/.test(value) || !/^https?:\/\//i.test(value)) throw new Error('AI 接口地址无效。');
  let parsed: url.URL;
  try { parsed = url.URL.parseURL(value); } catch (_) { throw new Error('AI 接口地址无效。'); }
  if (!parsed.hostname || parsed.username || parsed.password || !value.split('/')[2] || value.split('/')[2].includes('@') || parsed.port === '0') throw new Error('AI 接口地址无效。');
  const authority = value.split('/')[2], host = (authority.startsWith('[') ? authority.slice(0, authority.indexOf(']') + 1) : authority.split(':')[0]).toLowerCase(), parts = host.split('.');
  const ipv4 = parts.length === 4 && parts.every((part: string) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part);
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local') || ipv4 && (Number(parts[0]) === 10 || Number(parts[0]) === 172 && Number(parts[1]) >= 16 && Number(parts[1]) <= 31 || Number(parts[0]) === 192 && Number(parts[1]) === 168);
  if (parsed.protocol !== 'https:' && (parsed.protocol !== 'http:' || !local)) throw new Error('AI 接口地址必须使用 HTTPS，本机或局域网地址可使用 HTTP。');
  return value.replace(/\/+$/, '');
}
function credential(data: AiRequest): AiCredential {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI 请求数据无效。');
  if (typeof data.format !== 'string' || !['openai', 'anthropic', 'gemini', 'azure'].includes(data.format)) throw new Error('不支持此 AI 请求格式。');
  const endpoint = aiEndpoint(data.endpoint || '');
  if (typeof data.key !== 'string' || data.key.length > 512 || /[^\x21-\x7e]/.test(data.key)) throw new Error('AI 密钥格式不正确。');
  return { format: data.format, endpoint: endpoint, key: data.key };
}
function status(value: AiCredential | undefined): AiStatus {
  return { saved: value !== undefined, format: value?.format || '', endpoint: value?.endpoint || '', last4: value?.key.slice(-4) || '' };
}
function requestPath(format: string, path: string): void {
  if (typeof path !== 'string') throw new Error('不允许的 AI 请求路径。');
  const allowed = format === 'openai' ? path === '/chat/completions' : format === 'anthropic' ? path === '/v1/messages' : format === 'gemini' ? /^\/v1beta\/models\/[A-Za-z0-9._:/-]{1,128}:generateContent$/.test(path) : format === 'azure' && /^\/openai\/deployments\/[A-Za-z0-9._-]{1,128}\/chat\/completions\?api-version=[0-9a-z.-]{1,32}$/.test(path);
  if (!allowed || format === 'gemini' && path.includes('..')) throw new Error('不允许的 AI 请求路径。');
}
function headers(value: AiCredential): Record<string, string> {
  const result: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  if (value.format === 'openai') { if (value.key) result['Authorization'] = 'Bearer ' + value.key; }
  else if (value.format === 'anthropic') { result['x-api-key'] = value.key; result['anthropic-version'] = '2023-06-01'; }
  else result[value.format === 'gemini' ? 'x-goog-api-key' : 'api-key'] = value.key;
  return result;
}

export class AiBridge {
  private credentials: AiCredentials;
  private requests: Map<string, AiTask> = new Map();
  constructor(credentials: AiCredentials) { this.credentials = credentials; }
  private async read(): Promise<AiCredential | undefined> {
    const value = await this.credentials.read();
    if (!value) return undefined;
    const fields = value.split('\n');
    if (fields.length !== 3) throw new Error('AI 配置读取失败，请重新保存。');
    return credential({ format: fields[0], endpoint: fields[1], key: fields[2] });
  }
  async call(data: AiRequest): Promise<Object> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI 请求数据无效。');
    if (data.action === 'cancel') { const task = this.requests.get(data.requestId || ''); if (task) { task.cancelled = true; task.stop(); } return true; }
    if (data.action === 'clear') { await this.credentials.clear(); return true; }
    if (data.action === 'status') return status(await this.read());
    if (data.action === 'save') { const value = credential(data); await this.credentials.write(value.format + '\n' + value.endpoint + '\n' + value.key); return status(value); }
    if (data.action === 'verify') {
      const value = credential(data);
      if (value.format === 'azure') { const empty: Record<string, string> = {}; const result: AiResult = { status: 200, body: empty }; return result; }
      return this.send(value, 'GET', value.format === 'openai' ? '/models' : value.format === 'anthropic' ? '/v1/models' : '/v1beta/models', undefined, new AiTask());
    }
    if (data.action === 'request') {
      const id = typeof data.requestId === 'string' ? data.requestId : '';
      const registered = id.length > 0 && id.length <= 128;
      if (registered && this.requests.has(id)) throw new Error('AI 请求标识已在使用。');
      const task = new AiTask(); if (registered) this.requests.set(id, task);
      try {
        const value = await this.read();
        if (!value) { const error: AiError = { error: { message: '未配置 AI 服务。' } }; const result: AiResult = { status: 401, body: error }; return result; }
        if (data.method !== 'POST') throw new Error('不允许的 AI 请求方法。');
        requestPath(value.format, data.path || '');
        if (!registered) throw new Error('AI 请求标识无效。');
        const body = JSON.stringify(data.body);
        if (body === undefined) throw new Error('AI 请求数据无效。');
        if (new util.TextEncoder().encodeInto(body).byteLength > 2 * 1024 * 1024) throw new Error('AI 请求内容不能超过 2 MB。');
        return await this.send(value, 'POST', data.path || '', body, task);
      } finally { if (registered) this.requests.delete(id); }
    }
    throw new Error('不支持此 AI 操作。');
  }
  private async send(value: AiCredential, method: rcp.HttpMethod, path: string, body: string | undefined, task: AiTask): Promise<AiResult> {
    let received = 0;
    const chunks: Uint8Array[] = [];
    const timer = setTimeout(() => { task.timedOut = true; task.stop(); }, 120000);
    try {
      if (task.cancelled) throw new Error('AI 请求已取消。');
      const session = rcp.createSession({ requestConfiguration: {
        proxy: 'system',
        transfer: { autoRedirect: false, timeout: { connectMs: 120000, transferMs: 120000 } },
        tracing: { httpEventsHandler: { onDataReceive: (incoming: ArrayBuffer): void => {
          received += incoming.byteLength;
          if (received > 4 * 1024 * 1024) { task.stop(); return; }
          chunks.push(new Uint8Array(incoming.slice(0)));
        } } }
      } });
      task.session = session;
      const response = await session.fetch(new rcp.Request(value.endpoint + path, method, headers(value), body));
      if (task.cancelled) throw new Error('AI 请求已取消。');
      if (task.timedOut) throw new Error('AI 请求超时，请稍后重试。');
      if (received > 4 * 1024 * 1024) throw new Error('AI 响应内容不能超过 4 MB。');
      if (response.statusCode >= 300 && response.statusCode < 400) throw new Error('AI 服务不允许重定向。');
      const bytes = new Uint8Array(received); let offset = 0;
      chunks.forEach((chunk: Uint8Array) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
      const text = util.TextDecoder.create('utf-8').decodeToString(bytes);
      let parsed: Object;
      try { parsed = JSON.parse(text) as Object; } catch (_) { const error: AiError = { error: { message: text } }; parsed = error; }
      return { status: response.statusCode, body: parsed };
    } catch (error) {
      if (task.cancelled) throw new Error('AI 请求已取消。');
      if ((error as AiSystemError).code === 1007900201) throw new Error('系统禁止 AI 服务使用 HTTP，请使用 HTTPS。');
      if (task.timedOut || (error as AiSystemError).code === 1007900028) throw new Error('AI 请求超时，请稍后重试。');
      if (received > 4 * 1024 * 1024) throw new Error('AI 响应内容不能超过 4 MB。');
      if ((error as Error).message === 'AI 服务不允许重定向。') throw new Error('AI 服务不允许重定向。');
      throw new Error('无法连接 AI 服务，请检查网络或接口地址。');
    } finally { clearTimeout(timer); try { task.session?.close(); } catch (_) { /* Already closed. */ } }
  }
}
