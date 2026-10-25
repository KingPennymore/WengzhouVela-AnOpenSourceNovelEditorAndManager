import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';

// Keep canonical instance identity consistent with web/git-host.mjs and Android.
export function normalizeGiteaServer(value: string): string {
  const text = value.trim();
  const match = text.match(/^https:\/\/(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?((?:\/[a-z0-9._~-]+)*\/*)$/i);
  if (!match || text.length > 512) throw new Error('请输入有效的 HTTPS Gitea 服务器地址。');
  const port = match[2] ? Number(match[2]) : 443;
  const path = match[3].replace(/\/+$/, '');
  if (port < 1 || port > 65535 || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Gitea 服务器端口或路径无效。');
  return 'https://' + match[1].toLowerCase() + (port === 443 ? '' : ':' + port) + path;
}

export function giteaCredentialKey(server: string): string {
  const md = cryptoFramework.createMd('SHA256');
  md.updateSync({ data: new util.TextEncoder().encodeInto('gitea:' + normalizeGiteaServer(server)) });
  return 'gitea-' + Array.from(md.digestSync().data).map(b => b.toString(16).padStart(2, '0')).join('');
}
