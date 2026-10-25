/** Canonical instance URL shared by the browser and Windows bridge. Native shells mirror this validation. */
export function normalizeGiteaServer(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(
    /^https:\/\/(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?((?:\/[a-z0-9._~-]+)*\/*)$/i,
  );
  if (!match || text.length > 512)
    throw Error('请输入有效的 HTTPS Gitea 服务器地址，例如 https://git.example.com。');
  const port = match[2] ? Number(match[2]) : 443;
  const path = match[3].replace(/\/+$/, '');
  if (port < 1 || port > 65535 || path.split('/').some((part) => part === '.' || part === '..'))
    throw Error('Gitea 服务器地址的端口或路径无效。');
  return `https://${match[1].toLowerCase()}${port === 443 ? '' : ':' + port}${path}`;
}

export function gitIdentity(value = {}) {
  const provider = value.provider || 'github';
  if (!['github', 'gitee', 'gitea'].includes(provider)) throw Error('不支持此代码托管平台。');
  return provider === 'gitea'
    ? { provider, server: normalizeGiteaServer(value.server) }
    : { provider };
}

export function gitHostKey(value = {}) {
  const host = gitIdentity(value);
  return host.provider === 'gitea' ? `gitea:${host.server}` : host.provider;
}

export function sameGitHost(left, right) {
  try {
    return gitHostKey(left) === gitHostKey(right);
  } catch {
    return false;
  }
}

export function gitApiBase(value = {}) {
  const host = gitIdentity(value);
  return host.provider === 'gitea'
    ? host.server + '/api/v1'
    : host.provider === 'gitee'
      ? 'https://gitee.com/api/v5'
      : 'https://api.github.com';
}

export function validateGitApiPath(path) {
  if (
    typeof path !== 'string' ||
    !/^\/(user(?:\?|$)|user\/repos(?:\?|$)|repos\/[\w.-]+\/[\w.-]+(?:[/?]|$))/.test(path) ||
    /[\r\n\\#]/.test(path) ||
    path.includes('..') ||
    /%(?:2e|5c)/i.test(path.split('?')[0])
  )
    throw Error('不允许的代码托管请求路径。');
}
