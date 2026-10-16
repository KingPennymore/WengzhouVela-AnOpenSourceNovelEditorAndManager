# Vela 可选组件开发与管理

适用于 Vela 0.9.7 开发分支 / 插件接口 4。三端共用 `web/` 前端和安装包；原生构建流程见 BUILD-AND-VERIFY.md。

## 用户管理流程

“更多 → 插件与组件”有两种安装方式：顶部“在线组件”直接下载，或“从 ZIP 安装”。LaTeX 引擎、中文支持和电子书组件均以卡片展示名称、ID、版本、来源和启用状态，与插件共用启用/停用/卸载交互。LaTeX 预览的“管理排版组件”打开同一管理器，不再另行导入。

LaTeX 排版组件是一个包（`Vela-TeX-<版本>.zip`，约 77 MiB），同时包含引擎和中文支持，安装后显示为一张卡片 `vela.component.tex`。轻量版安装的组件可卸载；完整版内置引擎和中文资源，只能启用 / 停用，要节省磁盘占用请使用轻量版。旧版分开的引擎包和中文包仍可从 ZIP 安装：只装了其中一个时，显示为“旧版分包”卡片，提示安装完整组件包；两个都装齐后自动合并为一张卡片。旧版已导入的资源会直接读取现有 IndexedDB 数据，启动时自动生成卡片，无须重新安装。缺失或不完整的旧组件不会伪装成已安装。应用资源摘要不同的旧组件需要与当前宿主匹配的包。

电子书组件：安装 `dist/plugins/Vela-Ebook-Reader-1.1.0.zip` 后点击顶栏的“电子书”按钮或卡片上的“打开阅读器”，也可使用命令“电子书：打开阅读器”。支持范围和限制见 [组件 README](../components/ebook-reader/README.md)。使用 SDK 文件选择器导入到当前 .vela 工作区；无工作区则创建“电子书”。再次使用“工作区书籍”打开。卸载组件保留书籍。

ODF/VODT 组件已移除。已有的 Flat ODF / VODT 文稿保留原文，以纯文本和源码查看，可导出原件；新建文件不再提供 VODT 模板。电子书组件已包含 PDF 分页、缩放、文字选择和搜索，不需要安装独立 PDF 阅读组件；TeX 的原 PDF 预览依赖仍留在宿主。

## 在线下载与应用内更新

**在线组件。** 插件页的“在线组件”先读取**组件目录**：固定发布标签 `catalog` 中的 `catalog.json`，Gitee 优先、GitHub 其次，结果缓存 10 分钟，“检查更新”按钮重新读取。目录列出每个组件的最新版本，所以以后发布的组件或新版 TeX 不用发新版应用就能出现在已安装的应用里。

```json
{"format":1,"updated":"2026-10-16T09:00:00Z","components":[
  {"id":"vela.component.tex","kind":"tex","title":"LaTeX 排版组件","version":"0.1.1","tag":"tex-0.1.1","name":"Vela-TeX-0.1.1.zip","bytes":80740000,"sha256":"…","minApp":"0.9.8"},
  {"id":"vela.component.ebook-reader","kind":"plugin","title":"电子书阅读组件","version":"1.1.0","tag":"v0.9.8","name":"Vela-Ebook-Reader-1.1.0.zip","bytes":2145791,"sha256":"…","minApp":"0.9.7"}]}
```

- 每项必须有 ID（`vela.component.` 开头）、类型（`tex` / `plugin`）、版本、发布标签、文件名、大小和 SHA-256；可选 `note`、`minApp`（最低文舟版本）和 `platforms`（`android` / `harmonyos` / `windows`）。格式不对的条目跳过并计数，不影响其他条目；整个文件不是目录时改用下面的备用来源。目录本身不超过 256 KB。
- 状态按已安装版本比较：未安装、已安装最新版、可更新（标题旁显示可更新数量）、已安装的比在线版本新。`minApp` 高于当前版本或平台不符时显示原因，不提供下载。
- 完整版内置 TeX，不列出 TeX；轻量版取目录中的 TeX，目录版本比构建时写入 `tex/components.json` 的 `downloads.package` 旧或缺失时，用构建时的信息。
- 读不到目录时（例如 `catalog` 尚未发布），改为列出最新稳定应用发布（`v*` 标签）附带的 `Vela-<名称>-<版本>.zip`，并在页面上注明。
- 目录由 `scripts/build-catalog.mjs` 生成，发布步骤见 [BUILD-AND-VERIFY.md](BUILD-AND-VERIFY.md)。代码：`web/component-catalog.mjs`、`web/component-download-view.mjs`。

每项显示版本、大小和状态。下载时显示进度条和取消按钮；失败时显示各镜像的原因并提供“重试”。手机上提示建议使用 Wi‑Fi。浏览器预览版没有原生下载，会隐藏按钮并说明原因；“从 ZIP 安装”始终保留。下载在后台继续，关闭插件页再打开会接上进度。

**下载流程。**

1. 网页对每个镜像依次调用原生 `downloadComponent {id, url, name, size, sha256, limit}`，顺序为先 Gitee（`kingpennymore/wenzhou-vela-mirror-repository`）、后 GitHub（`KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager`），标签和文件名相同。
2. 原生端只接受 HTTPS，并只允许以下主机：`github.com`、`release-assets.githubusercontent.com`、`objects.githubusercontent.com`、`gitee.com`、`foruda.gitee.com`。重定向逐跳检查，最多 5 次。单文件上限 96 MiB，声明长度或实际长度不符即中止。
3. 文件写入私有缓存，原生端顺带计算 SHA-256。进度通过 `wenzhouDownload` 窗口事件（`{id, received, total}`）推送；`cancelDownload {id}` 立即中止。
4. 完成后返回同源地址，网页按 0.9.5 修复安卓组件安装的方式读取：安卓 `https://appassets.androidplatform.net/imports/<token>`，鸿蒙 `https://wenzhou-editor.local/imports/<token>`，Windows `vela://editor/imports/<token>`。读取后调用 `releaseImport` 删除临时文件。不会把整包 Base64 传过桥。
5. 网页再次核对整个 ZIP 的大小和 SHA-256，然后交给 `TexAssets.install(bytes)`（逐文件 SHA-256）或插件安装流程。网络失败、大小不符或摘要错误都会换下一个镜像；取消则不再尝试。

可选组件的 SHA-256 取自 GitHub 资产的 `digest`；没有时取发布中的 `SHA256SUMS-<版本>.txt`。没有摘要的组件不会显示。

**应用内更新。** 入口为“更多 → 检查更新”，以及设置中的“检查更新 / 自动检查更新”（三端均有，自动检查每天最多一次）。

- 列出两个镜像的发布，取版本最高的稳定 `v*` 标签。组件标签（如 `tex-0.1.1`）不会被当作应用版本。
- Windows 下载 `Vela-<版本>-windows[-lite]-setup-x64.exe`，安卓下载 `Vela-<版本>-android.N[-lite]-release-signed.apk`。优先选与当前版本相同的精简 / 完整版本，上限 256 MiB，并且必须有 SHA-256。
- 安装包由原生端下载并校验（`downloadUpdate`），网页只拿到令牌。`installUpdate` 的行为：
  - Windows：保存文稿，启动安装程序，然后关闭文舟。
  - 安卓：通过 FileProvider 打开系统安装器；首次需要允许文舟安装应用，系统会检查签名是否与已安装版本一致。
- 鸿蒙不能在应用内安装其他包，只打开发布页（`openRelease`）。
- 同时列出已安装可选组件的新版本，可在插件页一键更新。TeX 组件与宿主资源摘要绑定，随应用版本更新，不单独升级。

三端真机下载、取消、断网重试和安装尚需人工验证；自动测试（`npm run test:downloads`）模拟原生桥。

## 两种包协议

| 类型 | 入口 | 校验和资源 | 适用场景 |
| --- | --- | --- | --- |
| 固定宿主排版资源 | 现有 TeX ZIP 文件布局，无 plugin.json | `tex/components.json` 文件白名单、逐文件字节数与 SHA-256；Worker 校验 | 与当前宿主绑定的 WASM 引擎、中文宏包与字体 |
| 可执行组件 | ZIP 根目录 `plugin.json` + 打包后的 main.js | 复用插件接口 4 的安装、兼容性检查和生命周期 | 阅读器、工具、可选业务能力 |

排版组件不是任意代码扩展协议。不能通过修改 ZIP 清单引入新引擎或绕过固定摘要。引擎组需要 busytex.js、busytex.wasm、core.js、core.data、formats/pdflatex.fmt、formats/xelatex.fmt、licenses.json；中文组是 vela-tex-cjk.zip。组件包须包含全部组（单包，推荐）或者恰好一个完整组（旧版分包），上限 96 MiB。缺文件、未知文件、重复文件、错误摘要都会拒绝，校验通过后在一个 IndexedDB 事务中提交。资源 ID 由构建清单内容计算，不以用户自报版本为准。

引擎/中文组件状态和资源在 `vela.tex-components/files` 中持久保存；PluginRuntime 启动时合并生成记录，保存普通插件时过滤这些生成记录。避免将数十 MB 的资源放进 localStorage 或原生插件配置 JSON。存储中没有启用状态的旧组件默认启用。停用保留资源，卸载删除当前资源组。组件修改前必须等待编译结束并释放 TeX Worker/Blob URL；编译仍运行时提示用户等待。

编译需要完整的排版组件已安装并启用。首次中文编译会把中文宏包展开到 TeX 宏包插件缓存，对应卡片 `vela.tex.cjk` 属于宏包插件；该缓存会标记来源，卸载排版组件时一并清除（包括旧版中文分包的缓存）。原先手工安装且无来源标记的宏包保留，可另行卸载。

## 可执行组件清单

```json
{
  "id": "example.vela.reader",
  "name": "示例阅读组件",
  "version": "1.0.0",
  "main": "main.js",
  "vela": {
    "type": "reader-component",
    "api": ">=4 <5",
    "requiredCapabilities": ["pages", "file-transactions-v1"]
  },
  "license": "MIT"
}
```

`reader-component` 只增加管理器的组件标识和“打开阅读器”入口，仍使用普通插件生命周期。入口命令 ID 为 `open`（完整名称 `<plugin-id>.open`），不要在初始化时打开选择器或页面。文档格式组件可通过 `vela.formats.register` 注册 importBytes/render/plainText/toHtml。其他 JS 组件可不声明 type，按普通插件管理；此版本没有任意自定义 WASM 组件注册 API。ID 禁止占用 `vela.component.tex.*`，这些是宿主生成记录。

JavaScript 安装包限 8 MiB，展开限 16 MiB / 512 个文件；main 必须为包内 .js。不要把 ESM 源码直接放作入口，用 esbuild 打包为经典 IIFE；依赖和 LICENSE 应一并打包，资源路径不允许绝对路径、反斜线、空路径段或 `..`。组件代码可信同页执行，宿主不是不可信 JS 强沙箱。

## 最小生命周期示例

```js
VelaPlugins.register('example.vela.reader', {
  activate(vela) {
    const page = vela.ui.createPage('示例阅读器');
    page.body.textContent = '从用户操作中导入或选择书籍。';
    vela.commands.register({id: 'open', title: '示例：打开阅读器', run: () => page.show()});
    vela.ui.addButton({id: 'open', title: '阅读器', icon: 'reader', location: 'top-toolbar', run: () => page.show()});
    vela.dispose(() => { /* 终止 Worker / 任务，释放 URL 和自建资源 */ });
  }
});
```

宿主清理注册的按钮、面板、命令、页面、扩展、事件和包内 URL。自己的 Worker、计时器、异步任务和资源应在 dispose 中释放；异步结果提交前检查停用状态和请求版本。Page 的 onHide/onVisible 可用于暂停或恢复耗时活动。

## 文件读写与阅读 UI

用 `vela.project.io.pickFiles({multiple:false,accept:['.epub']})` 调用三端原生/浏览器选择器；从按钮事件调用，不在初始化调用。使用 `workspace.current/create/open` 获取授权句柄，再用 `io.importFiles` 和实际工作区 revision 导入书籍，重名使用 collision:'rename'。TaskHandle.result 返回导入结果，停用时取消任务。

读取二进制使用 fs.readBytes 按 getCapabilities().limits.readChunkBytes 分块，绑定原文件 revision，核对 totalSize 和实际长度，防止读到修改期间的混合内容。不要调用主应用的原生桥，不要在 settings 中保存整本书或 base64 资源。

电子书是输入数据，显示前移除脚本、表单、事件属性、远程资源和可执行 URL。本示例以 DOMPurify 白名单清理后，进入 `sandbox=""` 的 iframe，CSP 禁止脚本、网络、导航来源与表单，仅允许组件生成的内嵌图片和阅读样式。对 ZIP 解压、单章、图片、XML 层级和 PalmDOC 输出设置上限；不接受 XML DTD/实体。原书排版 CSS/字体不执行，不混入主应用 DOM。

章节进度、字号和夜间模式存 `vela.settings.get/update`；设置只保存小型 JSON。书籍保存在工作区，停用或卸载组件不能删除用户文稿。书籍列表应分页读取而不是每次读取整棵目录。未实现的格式（如 KF8/AZW3、KFX、DRM）给出具体原因，不伪造正文或成功状态。

## 构建与验证

```sh
npm ci
npm run package:ebook
npm run build:lite
npm test
npm run test:components
node tests/reader-component-browser.mjs
node tests/tex-lite-browser.mjs
```

浏览器测试默认使用 Playwright 安装的 Chromium，也可指定 WENZHOU_CHROME。最后的 TeX 用例实际编译中文 PDF；其他共享测试无需平台 SDK。Android/鸿蒙/Windows 发布包需在各自环境继续构建和真机验收。不要同时构建完整版与轻量版，避免覆盖公共前端资源。

扩展协议、API TypeScript 声明和原生平台限制继续见 [PLUGINS.md](PLUGINS.md)、[PLUGIN-PROJECT-API.md](PLUGIN-PROJECT-API.md)、[sdk/vela.d.ts](sdk/vela.d.ts)。电子书格式参考 [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)；MOBI 头和 PalmDOC 是独立实现，没有复制或捆绑 calibre 引擎。
