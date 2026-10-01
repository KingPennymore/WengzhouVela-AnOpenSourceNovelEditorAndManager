interface SystemFailure { code?: number; message?: string; }

export class NativeOperationError extends Error {
  code: number;
  stage: string;

  constructor(message: string, stage: string, code: number = 0) {
    super(message + (code ? '（错误码 ' + code + '）' : ''));
    this.code = code;
    this.stage = stage;
  }
}

export function operationError(error: Object, stage: string): NativeOperationError {
  if (error instanceof NativeOperationError) return error;
  const failure = error as SystemFailure;
  const code = typeof failure.code === 'number' ? failure.code : 0;
  let message = '设备服务调用失败，请重试。';
  if (stage === 'network') {
    message = '无法连接 GitHub，请检查设备网络及系统代理。';
    if (code === 1007900005 || code === 1007900006) message = '无法解析 GitHub 或代理服务器地址，请检查设备网络及 DNS。';
    if (code === 1007900007) message = '无法连接 GitHub 服务器，请检查设备网络及系统代理。';
    if (code === 1007900028) message = '连接 GitHub 超时，请检查设备网络后重试。';
    if (code === 1007900035 || code === 1007900058 || code === 1007900060 || code === 1007900077) {
      message = 'GitHub HTTPS 连接或证书校验失败，请检查设备时间、网络及代理证书。';
    }
    if (code === 1007900995 || code === 1007900097) message = '系统代理读取或连接失败，请检查设备代理设置。';
    if (code === 201) message = '应用没有联网权限，请检查系统中的文舟网络访问设置。';
    if (code === 401 || code === 1007900401) message = '网络请求参数校验失败。';
  } else if (stage === 'credentials') {
    message = '安全存储中的登录凭据读写失败，请重试。';
    if (code === 24000005) message = '无法访问安全存储，请保持设备解锁后重新登录。';
    if (code === 24000001) message = '设备安全存储服务暂不可用，请重启设备后重试。';
    if (code === 24000007) message = '登录凭据已损坏，请退出 GitHub 后重新登录。';
  } else if (!code && failure.message) {
    message = failure.message;
  }
  return new NativeOperationError(message, stage, code);
}

export function loginStatusError(status: number): NativeOperationError {
  let message = 'GitHub 未能验证账号，请重试。';
  if (status === 401) message = 'GitHub 拒绝了访问令牌，请检查令牌是否完整、过期或已撤销。';
  if (status === 403 || status === 429) message = 'GitHub 请求受限，请检查令牌权限、组织授权或请求频率。';
  if (status >= 300 && status < 400) message = 'GitHub 请求被重定向，请检查设备网络或代理。';
  if (status >= 500) message = 'GitHub 服务暂不可用，请稍后重试。';
  return new NativeOperationError(message, 'authentication', status);
}
