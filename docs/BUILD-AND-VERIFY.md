# 构建与发布检查

`npm run verify` 是统一检查入口：构建共享前端、核对三端版本和资源摘要，然后把逻辑测试和各组浏览器检查放进进程池并行运行（文件管理、侧栏、编辑、阅读、三端界面、术语库、GitHub / Gitee、同步等）。预览服务监听空闲端口，不占用已有的 4173 端口，结束时自动关闭。

- 并行度默认等于 CPU 核数，可用 `--jobs N` 或环境变量 `VELA_VERIFY_JOBS` 调整；`--only a,b` 只跑指定的组（组名即 `tests/` 下去掉 `.mjs` 的文件名，逻辑测试为 `unit`）。每组使用独立的 Chromium，写入各自的 `test-results` 路径。按上次各组的耗时，慢的组先启动。
- 某组失败不会中断其他组，最后统一返回失败。失败组的完整输出在 `test-results/verify/<组名>/output.log`；`tests/verify-capture.mjs` 会在浏览器关闭时截下仍打开的页面，并在失败时保存到同一目录：`page-N.png` 是截图，`state.json` 记录地址、对话框和提示文字、localStorage 大小、页面错误和控制台错误。通过的组只保留 `test-results/verify/<组名>.log`，摘要在 `results.json`，其中包括总耗时和并行度。
- 浏览器检查用 `tests/wait-helpers.mjs` 里的条件等待代替固定等待：`settled`（动画结束并绘制两帧）、`readerReady` / `readerIdle`（阅读页就绪，阅读位置防抖保存完成，对应 `data-position-pending`）、`until`（轮询 Node 侧条件）、`themeShiftDone`。`noMotion(context)` 是测试专用的关闭动画开关（localStorage `vela.test.motion=off`，见 `web/motion.mjs`），只用于不检查动画本身的组。仍保留的固定等待有两类：长按手势本身的按住时长，以及断言“这段时间内不应出现某变化”的观察窗口，都已注明。
- 14 核机器上实测：原串行一轮 500 秒，并行后 62–65 秒。

工作区保存协议（整份 / 增量、磁盘格式、三端校验规则）见 `docs/WORKSPACE-STORAGE.md`。40 万字、50 个文件的工作区修改一个文件后，Windows 存储上单次保存（含 JSON 序列化）由整份的 83.5 ms、1,219,842 字节降为增量的 37.1 ms、28,450 字节（`node scripts/benchmark-workspace-save.mjs`，整份保存后的第一次增量要迁移全部正文，约 195 ms）。

`npm run verify:release` 额外执行真实中文 TeX / PDF 编译及 Windows 原生检查。Windows 原生检查需要先安装 `windows/` 的开发依赖；设置 `VELA_TEST_EXECUTABLE` 可以检查最终打包的程序。共享界面检查通过不代表鸿蒙、安卓真机验收。

GitHub Actions 的 `Verify` 工作流在 master 推送、拉取请求或手动启动时分别执行完整版和轻量版的共享检查与真实 TeX 编译。工作流只有仓库读取权限，不使用发布签名或私人账号，也不会自动发布。

新写的浏览器测试可以用 `tests/source-app-server.mjs` 的 `startSourceAppServer()` 直接从 `web/` 源码在内存中打包并提供页面，不需要先 `npm run build`，也不会改写 `entry/` 或 `dist/web`。TeX 等复制类资源仍取自最近一次构建。单独运行 `node tests/source-app-server.mjs` 可在 4174 端口预览源码（`VELA_PREVIEW_PORT` 可改）。

## 前端打包结构

`scripts/build.mjs` 把 `web/app.js` 打成 ES 模块（`format:'esm'`、`splitting:true`、`target:'chrome105'`），由 `index.html` 的 `<script type="module" src="./app.js">` 加载。`import()` 引入的模块单独成块，放在 `chunks/<名称>-<内容哈希>.js`：

- 按需加载的功能（`web/lazy.mjs`）：`pdf-preview`（pdf.js 与 LaTeX 预览，打开 PDF / .tex 预览或在阅读页打开这两类文件时加载）、`katex`（第一次渲染公式时加载，之前公式先显示为占位，加载后原地排版）、`epub-export`（导出 EPUB 时）、`latex-editor` / `latex-language`（打开 .tex 时，提供高亮、补全、折叠和检查；目录标题解析留在主包的 `tex-heading.mjs`）、`reader`（第一次进入阅读页时）。
- CodeMirror 各语言（`@codemirror/language-data`）原本就用 `import()`，现在每种语言一个块，打开对应文件时加载。
- `chunk-<哈希>.js` 是多个模块共用的部分，按需静态引入。
- 某个块加载失败时，原位置显示“无法加载 xx 模块”和重试按钮（阅读页、预览区），公式显示为带错误提示的源码；浏览器会记住失败的模块地址，所以重试时带 `?retry=N` 重新请求。

三端都从同源地址提供 `web/` 下任意文件，块文件无需额外配置：Windows 是 `vela://editor/web/…`（`windows/main.mjs` 的 `assetResponse`，标准安全协议），鸿蒙是 `https://wenzhou-editor.local/web/…`（`Index.ets` 拦截后读 rawfile，`.js` 以 `text/javascript` 返回），安卓是 `https://appassets.androidplatform.net/assets/web/…`（`WebViewAssetLoader`）。块名随内容变化，构建前清空 `rawfile/web/chunks`、`dist/web/chunks` 和安卓 `assets/web/chunks`，避免旧块残留。

构建清单 `build-manifest.json` 记录全部块；`scripts/check-build.mjs` 从 `app.js` 出发沿静态 import 和 `import()` 遍历，要求每个模块都在清单中，上述按需模块都存在，且启动所需的模块里没有 pdf.js 和 KaTeX。esbuild 的 metafile 写在 `dist/app-metafile.json`，`node scripts/measure-startup.mjs [次数] [--out 文件]` 在新的浏览器上下文中测量冷启动到 `window.velaReady` 的时间（不限速和 4 倍 CPU 降速）及启动前下载的脚本字节数。`tests/lazy-chunks-browser.mjs` 检查启动不加载这些块、各功能按需加载以及加载失败的提示和重试。

拆分前后（完整版，同一台 14 核机器，各 7 次取中位数）：

| | 拆分前 | 拆分后 |
|---|---|---|
| `app.js` | 3,232,870 字节（gzip 1,086,596） | 682,554 字节（gzip 226,610） |
| 启动前下载的脚本（含 licenses.js 和共享块） | 3,344,925 字节，2 个文件 | 1,570,781 字节，19 个文件 |
| 冷启动到 `velaReady`，不限速 | 331 ms | 172 ms |
| 冷启动到 `velaReady`，4 倍 CPU 降速 | 1,968 ms | 988 ms |

## 样式表结构

`index.html` 仍依次加载 `style.css`、`file-manager.css`、`katex.min.css`、`ui.css`、`design.css`，层次由 `style.css` 开头的 `@layer reset, tokens, app, state;` 决定：

- `reset`：`box-sizing`、`[hidden]`（带 `!important`，在任何层里都优先）、细滚动条。
- `tokens`：全部设计令牌（颜色、圆角、阴影、动效曲线，按平台和深浅色覆盖），四个文件里的令牌按原顺序集中在 `style.css` 开头。
- `app`：应用本身的规则，按原文件顺序分布在四个文件中，保持原来的层叠关系。
- `state`：必须压过任何应用规则的模式（专注模式、开始页、非写作页、隐藏的插件位置、阅读页顶栏、`.vela` 页的内边距、减少动态效果），不再需要 `!important`。
- 第三方元素（CodeMirror 的 `.cm-*`、KaTeX）的规则不分层，放在各文件末尾：CodeMirror 的主题在这些样式表之后以不分层的 `<style>` 注入，选择器更具体，分层规则会全部输给它。

`!important` 由 95 处减到 75 处，留下的都注明了原因：压过 CodeMirror 主题和它的行内定位（第三方部分与 `app` 中针对 CodeMirror 元素的几条）、`[hidden]`、主题渐变和测试用的关闭动画开关、格式面板的行内定位、PDF 面板不受分页阅读规则影响。整理时删除了 21 个已不存在的类名或 ID 的选择器、被同一选择器在同一层和媒体条件下后续规则覆盖的 338 条声明（后者若使用 Chromium 105 不支持的写法，如 `dvh`、`color-mix()`，则保留前者作回退）、重复的 `.vela-config-grid`（合并为一条；`style.css` 中的网格列定义对这个 flex 容器不生效）和多余的 `.document-tools[hidden]`，并把分散在两个文件的选区菜单样式合到 `design.css`。

### 外观不变的检查

- `node tests/style-snapshot.mjs capture <文件>` 按 `tests/app-tour.mjs` 走一遍主要页面和弹层（开始页、编辑器与侧栏、更多菜单、设置、选区菜单、查找、Markdown 预览与公式、`.vela` 表单、术语库、命令面板、GitHub、订阅、书库、阅读页），覆盖 windows 1440、harmonyos 1280 和 390、android 390，浅色和深色，共 128 个状态，记录每个元素及伪元素的盒子位置和 150 项计算样式；`compare <前> <后> [--summary] [--unwrap 外层元素]` 列出差异。整理前后除下面的滚动容器调整外没有差异，所有元素位置不变。
- 同一组状态的截图在整理前后逐像素比较：115 张完全相同，其余 13 张的差异来自 `.vela` 表单中每次随机生成的工作区 ID，以及术语库和窄屏 `.vela` 页中个别像素颜色通道相差 1。

### 滚动容器不得自带背景

鸿蒙 ArkWeb 在颜色过渡时不重绘自带背景的滚动容器，切换主题时会留下旧颜色。`tests/scroll-backgrounds-browser.mjs`（已加入 `npm run verify`）在上述 128 个状态中检查：可见且 `overflow` 为 `auto` / `scroll` 的元素不得有不透明背景色或背景图。例外只有切换主题时不会打开的弹层：对话框、补全提示、选区菜单及其“更多”列表、工具栏“更多”菜单（点其中的主题按钮会先关闭菜单）。这次修正的位置：Markdown 代码块改为长词换行、不再滚动；查找面板容器透明，由面板本身着色；术语库页由内层 `.glossary-surface` 着色；`.vela` 排版示例由外框着色、内层 `.vela-layout-scroll` 滚动；窄屏 `.vela` 分节栏和卡片中的文本框与背后颜色相同，改为透明。

## 完整版与轻量版

默认 `npm run build`、`npm run build:android` 和 `npm run build:windows` 继续生成完整版，内置离线 TeX 引擎及中文包。

- `npm run build:lite`：生成轻量前端，仍包含编辑、术语库、同步、阅读、PDF 阅读与 Markdown 数学公式；不内置 TeX 引擎和中文字体。
- `npm run build:android:lite`：生成安卓轻量发布 APK / AAB，名称包含 `-lite-`。与完整版使用相同包名，不用于同时安装；签名发布时必须沿用原证书。轻量签名使用 `scripts/sign-android.ps1 -Lite`，完整版不加 `-Lite`。
- `npm run build:windows:lite`：生成 Windows 轻量安装程序及 ZIP，放在 `dist/windows-lite/`，名称包含 `-lite-`。
- 鸿蒙轻量版：先执行 `npm run build:lite`，再按现有鸿蒙构建流程打包。构建前端时可设置 `VELA_BUILD_FLAVOR=lite`；环境变量会传递给安卓的资源准备任务。

轻量构建同时生成 `dist/tex-components/Vela-TeX-0.1.1.zip`，一个包含引擎和中文支持的组件包（约 77 MiB，上限 96 MiB）。可在“更多 → 插件与组件”中在线下载，或用“从 ZIP 安装”导入；LaTeX 预览的“管理排版组件”打开同一列表，装好后可完全离线编译。旧版分开的两个 ZIP 仍可导入。不会在后台自动下载，不将原始组件包写入当前文稿。组件在后台解压，逐文件检查内置清单的大小和 SHA-256，校验通过后按包原子保存；错误包不会替换现有组件。

安装组件后数据保存在应用自己的浏览器存储中，卸载应用或清除应用数据会移除它们。完整版与轻量版功能差别仅在 TeX 是否预装；轻量版并不减少编译时 TeX 引擎自身所需内存。

`npm run verify:lite` 自动构建轻量版并运行共享回归及组件导入、离线中文编译检查。也可先构建轻量版，再运行 `node tests/tex-lite-browser.mjs` 可检查缺少组件提示、分别导入、重启保留、离线中文 PDF 编译与渲染。返回完整版时重新执行 `npm run build`；不要在不同构建版本之间并行执行打包，以免共享资源互相覆盖。

## 发布流程（`scripts/release.mjs`）

一次发布按阶段执行，每个阶段都可以单独重跑，失败后从断点继续：

```
node scripts/release.mjs bump 0.9.9                 同步全部版本号
node scripts/release.mjs run --dry-run              演练：只做检查、列出命令和外部操作
node scripts/release.mjs run                        从第一个未完成的阶段开始
node scripts/release.mjs run --only verify          只跑某一阶段；--from build 从某阶段起重跑
node scripts/release.mjs status                     查看各阶段状态
node scripts/release.mjs fingerprints [--record]    显示或记录签名证书指纹
```

`bump <版本>` 一次改好 `package.json`（`version` 与 `harmonyVersion`）、`package-lock.json`、`AppScope/app.json5`、`android/app/build.gradle`（`versionName` 为 `<版本>-android.1`）、`windows/package.json`（`version` 与 `velaVersion`）和 `windows/package-lock.json`。四段版本号的 npm 写法为 `x.y.z-w`；`versionCode` 按 `((主版本+1)×10000+次版本×100+修订号)×100+第四段` 计算（`scripts/versions.mjs`，`check-build.mjs` 用同一套规则核对）。

阶段：

1. **preflight**（只读）：工作区没有未提交的源码改动（`.idea/`、本机 `build-profile.json5` 和 rawfile 构建产物除外）；三端版本号一致且等于本次版本；标签不存在或指向 HEAD；`RELEASE_NOTES.md` 有本版说明；node、python、pwsh、gh 可用且 gh 已登录；DevEco、ANDROID_HOME 可用；发布清单签名私钥对应的公钥在应用内置列表中；安卓与鸿蒙发布证书（公钥证书）的 SHA-256 与 `scripts/release-config.json` 记录一致。首次使用先运行 `fingerprints`，与已发布应用核对后用 `fingerprints --record` 记录。
2. **build**：先轻量版、后完整版，依次构建安卓 release、Windows 和鸿蒙 `assembleApp`（DevEco 用本机 `build-profile.json5` 中的签名配置）。DevEco 生成的 `.app` 文件名可能仍是旧版本（如 `me.wenzhou.write-0.9.6.app`），脚本取最新的 `.app`，按包内 `pack.info` 核对版本后改名为 `Vela-<版本>[-lite]-release-signed.app`，已签名 HAP 同样改名。
3. **sign**：`scripts/sign-android.ps1`（轻量版加 `-Lite`）。安卓口令只由该脚本自己读取。
4. **package**：`package.py --source-only` 生成源码包，其中的 `build-profile.json5` 一律取自仓库 HEAD（不带本机签名配置）；`finalize-release.py` 收集附件、写 `SHA256SUMS-<版本>.txt` 并签名；从 GitHub 取回当前 `catalog.json` 作为上一份目录，`build-catalog.mjs` 生成并签名新目录。
5. **verify**：`verify.mjs --tex --windows`；附件齐全且与 `SHA256SUMS` 一致；两份清单签名有效；`.app.zip` 中鸿蒙包的版本；APK 签名证书指纹；列出超过 Gitee 100 MB 附件上限、只发布到 GitHub 的文件。
6. **publish-github**（外部）：用 gh 创建草稿发布（目标为 HEAD），只上传缺少或摘要不同的文件，核对 GitHub 计算的大小和 SHA-256 后设为正式发布并标为 Latest；更新 `catalog` 发布中的目录三件。gh 在 Windows 上输出 CRLF，脚本解析时统一去掉。
7. **mirror-gitee**（外部）：把应用附件（不超过 100 MB 的，含 `.sig`，不含源码包）和组件目录同步到 Gitee。核对方式：先比对 API 返回的大小，再从公开地址下载 1 MB 以下的文件核对 SHA-256；从 Gitee 下载大文件很慢，只在加 `--gitee-full-verify` 时全部下载核对。`--gitee-replace` 重传同名同大小的文件。刚替换的目录可能被 CDN 缓存，核对失败时稍后用 `--only mirror-gitee` 重试。
8. **restore**：重新构建完整版前端并运行 `check-build.mjs`，清理临时文件，确认工作区与 HEAD 一致（除构建产物和本机配置）。

外部操作前，脚本列出本次运行将要做的全部外部操作（每个上传的文件及大小、发布与 Latest 的变化），输入 `yes` 确认一次后才执行。Gitee 私人令牌在一次运行中只输入一次（终端中不回显），只保存在进程内存里：不写入磁盘、状态文件或日志，不出现在命令行参数中，错误信息中出现时替换为 `***`。状态与日志在 `dist/release-state/<版本>.json` / `.log`；提交变化后状态自动清空，从头开始。

## 发布前

1. 检查根版本、鸿蒙版本及移动版本代码、安卓版本和 Windows 版本一致；更新发布说明与验证记录。
   - 四段版本号（如 0.9.8.1）：`harmonyVersion`、鸿蒙 `versionName`、安卓 `versionName`（`0.9.8.1-android.1`）、发布标签和附件文件名用四段；npm 要求三段，根 `package.json` 和 `windows/package.json` 的 `version` 写 `0.9.8-1`，Windows 另设 `velaVersion: "0.9.8.1"` 作为应用显示版本。应用比较版本时把 `-` 当作分隔符，两种写法等价。
   - 移动版本代码自 0.9.8.1 起为 `((主版本+1)×10000+次版本×100+修订号)×100+第四段`：0.9.8.1 为 1090801，0.9.9 为 1090900。`npm run verify` 中的 build-integrity 检查（`scripts/check-build.mjs`）会核对。
2. 运行统一检查，再验证最终原生安装包和实际设备上尚未覆盖的行为。
3. 使用原有移动端证书签名，检查签名、包内版本、共享前端构建清单及组件版本。
4. 源码归档排除本地凭据、密钥、缓存及个人材料；生成所有附件的 SHA-256。
5. 推送版本提交和标签，以草稿上传附件，逐项验证服务器上的大小和 SHA-256 后再公开。

工作流配置依据 [checkout](https://github.com/actions/checkout) 与 [setup-node](https://github.com/actions/setup-node) 的官方用法。

## TeX 组件的固定发布

TeX 引擎和中文组件不随应用版本变化时，单独以标签 `tex-<组件版本>` 发布（当前为 `tex-0.1.1`，打在 `master` 的 `72fea00`），附 `Vela-TeX-<版本>.zip`（单包）和 `SHA256SUMS-tex-<版本>.txt`。已发布的 `tex-0.1.1` 附有旧的两个分包，应用内下载需要的是单包：发布本版本前，把 `Vela-TeX-0.1.1.zip` 补传到 `tex-0.1.1`，同时更新该标签的 SHA256SUMS，并运行 Gitee 镜像脚本。旧分包可以保留，供旧版本下载。这样下载地址固定为：

`https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager/releases/download/tex-0.1.1/<文件名>`

- 发布时设为非 Latest（`gh release create … --latest=false`），以免顶替应用版本。
- 组件内容取自 `vendor/wasmtex`，精简版构建时生成到 `dist/plugins`。只有 `vendor/wasmtex` 更新时才发布新的组件标签；0.9.5–0.9.7 随附的组件逐字节相同。
- 应用的每个版本仍可随附组件 ZIP，便于离线下载，内容须与组件标签一致（核对 SHA-256）。
- Gitee 镜像：`https://gitee.com/kingpennymore/wenzhou-vela-mirror-repository/releases/download/tex-0.1.1/<文件名>`，标签和文件名与 GitHub 相同，内容逐字节一致。用 `pwsh scripts/mirror-tex-gitee.ps1 -Owner kingpennymore -Repository wenzhou-vela-mirror-repository [-Version 0.1.1]` 镜像：先在 GitHub 发布并在 `dist/releases/tex-<版本>` 准备好文件，运行时在提示处输入 Gitee 私人令牌（`projects` 权限，不显示、不保存），脚本创建发布、上传附件，并从公开地址下载核对 SHA-256。应用内下载计划先试 Gitee、再试 GitHub。

### 发布时上传组件与镜像（应用内下载依赖）

应用内“在线组件”先读组件目录（固定标签 `catalog` 的 `catalog.json`），读不到时改读最新应用发布的附件；“检查更新”读最新应用发布。每次发布按顺序完成：

1. 构建。`npm run build:lite`（或任一构建）会把 TeX 单包的文件名、大小和 SHA-256 写入 `tex/components.json` 的 `downloads.package` 字段，标签为 `tex-<组件版本>`。ZIP 由固定时间戳确定性打包，重复构建结果逐字节相同。核对 `dist/tex-components/*.zip` 与已发布组件的 SHA-256 一致；不一致说明 `vendor/wasmtex` 有变化，需要发布新的组件标签。
2. 发布 TeX 组件标签（仅在组件变化时）。在 GitHub 创建 `tex-<版本>`，附 `Vela-TeX-<版本>.zip`、`SHA256SUMS-tex-<版本>.txt` 和用 `node scripts/release-signing.mjs sign` 生成的 `SHA256SUMS-tex-<版本>.txt.sig`，设为非 Latest。然后运行 `pwsh scripts/mirror-tex-gitee.ps1 -Owner kingpennymore -Repository wenzhou-vela-mirror-repository -Version <版本>` 镜像到 Gitee，脚本会从公开地址下载回来核对。
3. 发布应用标签 `v<版本>`。附件需包含三端安装包、可选组件 ZIP（如 `Vela-Ebook-Reader-<版本>.zip`）、`SHA256SUMS-<版本>.txt` 和它的签名 `SHA256SUMS-<版本>.txt.sig`（`finalize-release.py` 自动生成，需要发布者本机的签名私钥，见 `docs/RELEASE-SIGNING.md`）。文件名须保持现有格式，更新器按名称识别：
   - `Vela-<版本>-windows[-lite]-setup-x64.exe`
   - `Vela-<版本>-android.N[-lite]-release-signed.apk`
   - `Vela-<组件名>-<x.y.z>.zip`
4. 镜像应用发布：`pwsh scripts/mirror-tex-gitee.ps1 -Owner kingpennymore -Repository wenzhou-vela-mirror-repository -AppVersion <版本>`。超过 Gitee 100 MB 附件上限的文件（目前是 Windows 安装包和 ZIP）只留在 GitHub，应用会自动回退到 GitHub。
4a. 更新组件目录（应用发布和组件标签都上传完之后）：
   - `node scripts/build-catalog.mjs --version <版本> --previous <上一份 catalog.json>`：从 `dist/releases/<版本>/` 中的 `Vela-<名称>-<x.y.z>.zip` 生成 `dist/releases/catalog/catalog.json` 和 `SHA256SUMS-catalog.txt`。TeX 指向 `tex-<版本>` 标签，其他组件指向 `v<版本>`。上一份目录中本次没有的组件会保留，先用 `gh release download catalog -p catalog.json -D <目录>` 取回上一份。
   - GitHub：第一次运行 `gh release create catalog dist/releases/catalog/* --title 文舟组件目录 --notes 应用读取的组件目录 --latest=false`，以后运行 `gh release upload catalog dist/releases/catalog/* --clobber`。`catalog` 不是版本号，不会被当作应用更新。
   - Gitee：`pwsh scripts/mirror-tex-gitee.ps1 -Owner kingpennymore -Repository wenzhou-vela-mirror-repository -Catalog`。目录每次都会整份替换；脚本最后从公开地址下载回来核对 SHA-256，刚替换时 CDN 可能仍返回旧文件，稍后重试即可。
   - 目录中的 `minApp` 是能安装该组件的最低文舟版本：TeX 单包为 0.9.8，插件接口 4 的组件为 0.9.7。旧版应用会看到“需要文舟 x.y.z 或更新版本”，不会下载。
5. 验证。在三端真机各执行一次：在线安装 TeX 组件、取消再重试、断网失败提示；Windows / 安卓“检查更新 → 下载并安装”；鸿蒙打开发布页。自动部分运行 `npm run test:downloads`。

## dist 目录与精简版发布

`python scripts/package.py --source-only` 仅打包源码，不复制完整版安装包。`python scripts/finalize-release.py --lite-only` 将三端精简版、源码、四份可选组件和 SHA-256 收集到 `dist/releases/<版本>/`，发布说明及附件清单写入 `dist/metadata/<版本>/`。替换当前发布文件时保留旧修订。

`python scripts/organize-dist.py` 将其余根目录产物按版本归档：历史文件在 `archive/`，当前中间文件在 `intermediates/`；保留 `web/`、`windows-lite/`、`tex-components/` 和 `plugins/` 工作目录。整理前后路径记录在 `dist/organization-index.json`，不会删除历史文件。详情见生成的 `dist/README.md`。

Android 大 ZIP 通过私有缓存与同源二进制 URL 传输，读取后释放临时文件；不再把整包转成 Base64 经过页面脚本。普通插件的限制保持不变，排版组件在解压前分流，按内置组件清单校验。专用 `Wenzhou_QA_API36` 模拟器可运行 `node tests/android-tex-browser.mjs`，覆盖系统文件选择器安装两个实际 ZIP、重启保留、中文 PDF 与临时文件清理；先执行 `npm run test:android:native` 安装调试版，轻量测试设置 `VELA_BUILD_FLAVOR=lite`。

## 可选电子书组件

构建会生成 `dist/plugins/Vela-Ebook-Reader-1.1.0.zip`，也可执行 `npm run package:ebook` 单独打包。安装、开发协议及限制见 [COMPONENTS.md](COMPONENTS.md)。轻量构建后运行 `npm run test:components` 检查旧组件迁移、列表生命周期和电子书导入/阅读；本用例自己启动临时预览服务器。
