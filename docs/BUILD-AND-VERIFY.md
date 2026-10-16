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

## 完整版与轻量版

默认 `npm run build`、`npm run build:android` 和 `npm run build:windows` 继续生成完整版，内置离线 TeX 引擎及中文包。

- `npm run build:lite`：生成轻量前端，仍包含编辑、术语库、同步、阅读、PDF 阅读与 Markdown 数学公式；不内置 TeX 引擎和中文字体。
- `npm run build:android:lite`：生成安卓轻量发布 APK / AAB，名称包含 `-lite-`。与完整版使用相同包名，不用于同时安装；签名发布时必须沿用原证书。轻量签名使用 `scripts/sign-android.ps1 -Lite`，完整版不加 `-Lite`。
- `npm run build:windows:lite`：生成 Windows 轻量安装程序及 ZIP，放在 `dist/windows-lite/`，名称包含 `-lite-`。
- 鸿蒙轻量版：先执行 `npm run build:lite`，再按现有鸿蒙构建流程打包。构建前端时可设置 `VELA_BUILD_FLAVOR=lite`；环境变量会传递给安卓的资源准备任务。

轻量构建同时生成 `dist/tex-components/Vela-TeX-0.1.1.zip`，一个包含引擎和中文支持的组件包（约 77 MiB，上限 96 MiB）。可在“更多 → 插件与组件”中在线下载，或用“从 ZIP 安装”导入；LaTeX 预览的“管理排版组件”打开同一列表，装好后可完全离线编译。旧版分开的两个 ZIP 仍可导入。不会在后台自动下载，不将原始组件包写入当前文稿。组件在后台解压，逐文件检查内置清单的大小和 SHA-256，校验通过后按包原子保存；错误包不会替换现有组件。

安装组件后数据保存在应用自己的浏览器存储中，卸载应用或清除应用数据会移除它们。完整版与轻量版功能差别仅在 TeX 是否预装；轻量版并不减少编译时 TeX 引擎自身所需内存。

`npm run verify:lite` 自动构建轻量版并运行共享回归及组件导入、离线中文编译检查。也可先构建轻量版，再运行 `node tests/tex-lite-browser.mjs` 可检查缺少组件提示、分别导入、重启保留、离线中文 PDF 编译与渲染。返回完整版时重新执行 `npm run build`；不要在不同构建版本之间并行执行打包，以免共享资源互相覆盖。

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
2. 发布 TeX 组件标签（仅在组件变化时）。在 GitHub 创建 `tex-<版本>`，附 `Vela-TeX-<版本>.zip` 和 `SHA256SUMS-tex-<版本>.txt`，设为非 Latest。然后运行 `pwsh scripts/mirror-tex-gitee.ps1 -Owner kingpennymore -Repository wenzhou-vela-mirror-repository -Version <版本>` 镜像到 Gitee，脚本会从公开地址下载回来核对。
3. 发布应用标签 `v<版本>`。附件需包含三端安装包、可选组件 ZIP（如 `Vela-Ebook-Reader-<版本>.zip`）和 `SHA256SUMS-<版本>.txt`。文件名须保持现有格式，更新器按名称识别：
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
