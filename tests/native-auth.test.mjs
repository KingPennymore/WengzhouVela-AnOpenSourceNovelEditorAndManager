import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

const compiled = await build({
  entryPoints: ['entry/src/main/ets/services/NativeBridge.ets'], bundle: true, write: false,
  platform: 'node', format: 'cjs', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.js'],
  plugins: [{ name: 'native-sdk-fixture', setup(plugin) {
    plugin.onResolve({ filter: /^@kit\./ }, args => ({ path: args.path, namespace: 'kit' }));
    plugin.onLoad({ filter: /.*/, namespace: 'kit' }, args => ({ contents: `module.exports = globalThis.sdk[${JSON.stringify(args.path)}];` }));
  } }]
});

function fixture({ status = 200, networkError, storageError, closeError, text } = {}) {
  const requests = [], assets = new Map(), logs = [];
  let configuration;
  const tags = { ALIAS: 1, SECRET: 2, RETURN_TYPE: 3, ACCESSIBILITY: 4, CONFLICT_RESOLUTION: 5 };
  const alias = attributes => new TextDecoder().decode(attributes.get(tags.ALIAS));
  const sdk = {
    '@kit.RemoteCommunicationKit': { rcp: {
      Request: class { constructor(url, method, headers, content) { Object.assign(this, { url, method, headers, content }); } },
      createSession(config) { configuration = config; return {
        async fetch(request) {
          requests.push(request);
          if (networkError) throw networkError;
          return { statusCode: status, toString: () => text ?? JSON.stringify({ login: 'writer', id: 1 }) };
        },
        close() { if (closeError) throw closeError; }
      }; }
    } },
    '@kit.AssetStoreKit': { asset: {
      Tag: tags, ReturnType: { ALL: 0 }, Accessibility: { DEVICE_UNLOCKED: 0 }, ConflictResolution: { OVERWRITE: 1 },
      async query(attributes) { const value = assets.get(alias(attributes)); if (!value) throw { code: 24000002 }; return [value]; },
      async add(attributes) { if (storageError) throw storageError; assets.set(alias(attributes), new Map(attributes)); },
      async remove(attributes) { if (!assets.delete(alias(attributes))) throw { code: 24000002 }; }
    } },
    '@kit.ArkTS': { util: {
      TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text); } },
      TextDecoder: { create: () => ({ decodeToString: bytes => new TextDecoder().decode(bytes) }) }
    } },
    '@kit.PerformanceAnalysisKit': { hilog: { error: (...args) => logs.push(args) } },
    '@kit.CoreFileKit': { fileIo: {}, picker: {}, fileUri: {} },
    '@kit.AbilityKit': {}
  };
  const module = { exports: {} };
  const context = vm.createContext({ sdk, module, exports: module.exports, Error, Map, Uint8Array });
  new vm.Script(compiled.outputFiles[0].text).runInContext(context);
  const bridge = new module.exports.NativeBridge();
  return { call: async (operation, data = {}) => JSON.parse(await bridge.call(operation, JSON.stringify(data))), requests, assets, logs, config: () => configuration };
}

const token = 'ghp_fixture_private_value';

test('原生登录成功后保存凭据，后续 API 使用凭据，并采用系统代理', async () => {
  const f = fixture();
  const result = await f.call('login', { token });
  assert.equal(result.ok, true); assert.equal(result.value.login, 'writer'); assert.equal(f.assets.size, 1);
  assert.equal(f.config().requestConfiguration.proxy, 'system');
  assert.equal(f.config().requestConfiguration.transfer.autoRedirect, false);
  assert.equal((await f.call('api', { path: '/user' })).value.status, 200);
  assert.equal(f.requests[1].headers.Authorization, `Bearer ${token}`);
});

test('RCP 的 data-only DNS 异常保留错误码，且不会泄漏异常数据和令牌', async () => {
  const f = fixture({ networkError: { code: 1007900006, data: `Authorization: Bearer ${token}` } });
  const result = await f.call('login', { token });
  assert.equal(result.ok, false); assert.equal(result.code, 1007900006); assert.equal(result.stage, 'network');
  assert.match(result.error, /DNS/); assert.equal(JSON.stringify([result, f.logs]).includes(token), false); assert.equal(f.assets.size, 0);
});

test('HTTP 401 显示令牌拒绝原因，不保存凭据', async () => {
  const f = fixture({ status: 401 });
  const result = await f.call('login', { token });
  assert.equal(result.code, 401); assert.equal(result.stage, 'authentication'); assert.match(result.error, /令牌/); assert.equal(f.assets.size, 0);
});

test('安全存储锁定失败与网络失败区分，失败登录不会成为活动账号', async () => {
  const f = fixture({ storageError: { code: 24000005 } });
  const result = await f.call('login', { token });
  assert.equal(result.code, 24000005); assert.equal(result.stage, 'credentials'); assert.match(result.error, /解锁/);
  assert.equal((await f.call('api', { path: '/user' })).value.status, 401); assert.equal(f.requests.length, 1);
});

test('无凭据退出幂等；未登录的网络检测不保存或传输访问令牌', async () => {
  const f = fixture();
  assert.equal((await f.call('logout')).ok, true);
  assert.equal((await f.call('connection')).value.status, 200);
  assert.equal(f.requests[0].headers.Authorization, undefined); assert.equal(f.assets.size, 0);
});

test('关闭网络会话的异常不会覆盖原始请求错误', async () => {
  const f = fixture({ networkError: { code: 1007900028 }, closeError: { code: 1007900993 } });
  const result = await f.call('login', { token });
  assert.equal(result.code, 1007900028); assert.match(result.error, /超时/);
});

test('HTML 错误响应保留 HTTP 状态，成功状态的无效 JSON 明确报错', async () => {
  const rejected = await fixture({ status: 401, text: '<html>proxy</html>' }).call('login', { token });
  assert.equal(rejected.code, 401);
  const malformed = await fixture({ text: '<html>proxy</html>' }).call('login', { token });
  assert.equal(malformed.ok, false); assert.match(malformed.error, /响应格式/);
});
test('外部目录接口已撤销，桥接不会执行目录选择或权限申请',async()=>{
  const f=fixture();
  for(const operation of ['setupStorage','openFolder','internalStorage'])assert.equal((await f.call(operation)).ok,false);
  assert.equal(f.requests.length,0);
});
