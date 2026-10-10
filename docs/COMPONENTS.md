# Vela 可选组件开发与管理

适用于此修订的 Vela 0.9.6 / 插件 API v3。三端共用 `web/` 前端和安装包；原生构建流程见 BUILD-AND-VERIFY.md。

## 用户管理流程

“更多 → 插件与组件 → 从 ZIP 安装”是统一入口。LaTeX 引擎、中文支持、电子书组件和 ODF 文档组件均以卡片展示名称、ID、版本、来源和启用状态，与插件共用启用/停用/卸载交互。LaTeX 预览的“管理排版组件”打开同一管理器，不再另行导入。

轻量版导入的排版组件可卸载；完整版的引擎和中文资源内置，只能启用/停用，删除磁盘占用需要使用轻量版。旧版已经导入的完整引擎包/中文包会直接读取现有 IndexedDB 资源，在启动时自动生成卡片，无须重新安装。缺失或不完整的旧组件不会伪装成已安装。应用资源摘要不同的旧组件需要与当前宿主匹配的包。

电子书组件：安装 `dist/plugins/Vela-Ebook-Reader-1.0.0.zip` 后点击“打开阅读器”，或者使用命令“电子书：打开阅读器”。支持范围和限制见 [组件 README](../components/ebook-reader/README.md)。使用 SDK 文件选择器导入到当前 .vela 工作区；无工作区则创建“电子书”。再次使用“工作区书籍”打开。卸载组件保留书籍。

ODF 组件：安装 `dist/plugins/Vela-ODF-1.0.0.zip` 后，主程序的 ODF 导入和富文本视图自动启用。无组件时保留已有 Flat ODF/VODT 的纯文本与源码；停用/卸载不删除文稿。格式、编辑、附件保留和签名限制见 [ODF-COMPONENT.md](ODF-COMPONENT.md)。电子书组件已包含 PDF 分页、缩放、文字选择和搜索，不需要安装独立 PDF 阅读组件；TeX 的原 PDF 预览依赖仍留在宿主。

## 两种包协议

| 类型 | 入口 | 校验和资源 | 适用场景 |
| --- | --- | --- | --- |
| 固定宿主排版资源 | 现有 TeX ZIP 文件布局，无 plugin.json | `tex/components.json` 文件白名单、逐文件字节数与 SHA-256；Worker 校验 | 与当前宿主绑定的 WASM 引擎、中文宏包与字体 |
| 可执行组件 | ZIP 根目录 `plugin.json` + 打包后的 main.js | 复用 Acode/Vela 插件安装、兼容性检查和生命周期 | 阅读器、工具、可选业务能力 |

排版组件不是任意代码扩展协议。不能通过修改 ZIP 清单引入新引擎或绕过固定摘要。引擎组需要 busytex.js、busytex.wasm、core.js、core.data、formats/pdflatex.fmt、formats/xelatex.fmt、licenses.json；中文组是 vela-tex-cjk.zip。单包 64 MiB，缺文件、未知文件、重复文件、错误摘要会拒绝，校验通过后在一个 IndexedDB 事务中提交。资源 ID 由构建清单内容计算，不以用户自报版本为准。

引擎/中文组件状态和资源在 `vela.tex-components/files` 中持久保存；PluginRuntime 启动时合并生成记录，保存普通插件时过滤这些生成记录。避免将数十 MB 的资源放进 localStorage 或原生插件配置 JSON。存储中没有启用状态的旧组件默认启用。停用保留资源，卸载删除当前资源组。组件修改前必须等待编译结束并释放 TeX Worker/Blob URL；编译仍运行时提示用户等待。

当前编译器需要引擎与中文两组均安装且启用。首次中文编译会把中文宏包展开到 TeX 宏包插件缓存，卡片 `vela.tex.cjk` 属于宏包插件；该缓存会标记其来源并随中文组件卸载清除。原先手工安装且无来源标记的宏包保留，可另行卸载。

## 可执行组件清单

```json
{
  "id": "example.vela.reader",
  "name": "示例阅读组件",
  "version": "1.0.0",
  "main": "main.js",
  "vela": {
    "type": "reader-component",
    "api": ">=3 <4",
    "requiredCapabilities": ["file-transactions-v1"]
  },
  "license": "MIT"
}
```

`reader-component` 只增加管理器的组件标识和“打开阅读器”入口，仍使用普通插件生命周期。入口命令必须命名为 `<plugin-id>.open`，不要在初始化时打开选择器或页面。`document-component` 表示文档组件，通过本修订的 `document-formats-v1` 能力注册 importBytes/render/plainText/toHtml，详情见 ODF 文档。其他 JS 组件可不声明 type，按普通插件管理；此版本没有任意自定义 WASM 组件注册 API。ID 禁止占用 `vela.component.tex.*`，这些是宿主生成记录。

JavaScript 安装包限 8 MiB，展开限 16 MiB / 512 个文件；main 必须为包内 .js。不要把 ESM 源码直接放作入口，用 esbuild 打包为经典 IIFE；依赖和 LICENSE 应一并打包，资源路径不允许绝对路径、反斜线、空路径段或 `..`。组件代码可信同页执行，宿主不是不可信 JS 强沙箱。

## 最小生命周期示例

```js
(() => {
  const id = 'example.vela.reader';
  acode.setPluginInit(id, () => {
    const vela = acode.require('vela');
    const Page = acode.require('page');
    const page = new Page('示例阅读器');
    page.body.textContent = '从用户操作中导入或选择书籍。';
    acode.require('commands').addCommand({
      name: id + '.open', description: '示例：打开阅读器',
      exec: () => page.show()
    });
    vela.dispose(() => { /* 终止 Worker / 任务，释放 URL 和自建资源 */ });
  });
  acode.setPluginUnmount(id, () => {});
})();
```

宿主清理注册命令、页面、扩展、事件、包内 URL。自己的 Worker、计时器、异步任务和资源应在 dispose 中释放；异步结果提交前检查停用状态和请求版本。Page 的 onHide/onVisible 可用于暂停或恢复耗时活动。

## 文件读写与阅读 UI

用 `vela.io.pickFiles({multiple:false,accept:['.epub']})` 调用三端原生/浏览器选择器；从按钮事件调用，不在初始化调用。使用 `workspace.current/create/open` 获取授权句柄，再用 `io.importFiles` 和实际工作区 revision 导入书籍，重名使用 collision:'rename'。TaskHandle.result 返回导入结果，停用时取消任务。

读取二进制使用 fs.readBytes 按 getCapabilities().limits.readChunkBytes 分块，绑定原文件 revision，核对 totalSize 和实际长度，防止读到修改期间的混合内容。不要调用主应用的原生桥，不要在 settings 中保存整本书或 base64 资源。

电子书是输入数据，显示前移除脚本、表单、事件属性、远程资源和可执行 URL。本示例以 DOMPurify 白名单清理后，进入 `sandbox=""` 的 iframe，CSP 禁止脚本、网络、导航来源与表单，仅允许组件生成的内嵌图片和阅读样式。对 ZIP 解压、单章、图片、XML 层级和 PalmDOC 输出设置上限；不接受 XML DTD/实体。原书排版 CSS/字体不执行，不混入主应用 DOM。

章节进度、字号和夜间模式存 `getSettings/updateSettings`；设置只保存小型 JSON。书籍保存在工作区，停用或卸载组件不能删除用户文稿。书籍列表应分页读取而不是每次读取整棵目录。未实现的格式（如 KF8/AZW3、KFX、DRM）给出具体原因，不伪造正文或成功状态。

## 构建与验证

```sh
npm ci
npm run package:ebook
npm run package:odf
npm run build:lite
npm test
npm run test:components
npm run test:odf
node tests/tex-lite-browser.mjs
```

浏览器测试默认使用 Playwright 安装的 Chromium，也可指定 WENZHOU_CHROME。最后的 TeX 用例实际编译中文 PDF；其他共享测试无需平台 SDK。Android/鸿蒙/Windows 发布包需在各自环境继续构建和真机验收。不要同时构建完整版与轻量版，避免覆盖公共前端资源。

扩展协议、API TypeScript 声明和原生平台限制继续见 [PLUGINS.md](PLUGINS.md)、[PLUGIN-PROJECT-API.md](PLUGIN-PROJECT-API.md)、[sdk/vela.d.ts](sdk/vela.d.ts)。电子书格式参考 [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)；MOBI 头和 PalmDOC 是独立实现，没有复制或捆绑 calibre 引擎。
