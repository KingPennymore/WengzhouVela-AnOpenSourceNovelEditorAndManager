# 文舟 · HarmonyOS NEXT / Android 小说编辑器

文舟是一款面向 HarmonyOS NEXT 和 Android 的长篇小说写作软件，以“一部小说写在一个 TXT / Markdown 文件中”为工作方式。界面参考 Acode 的文件标签、行号和编辑操作，并加入文件工作区、章节管理、GitHub 仓库同步和 Acode 插件支持。两端共享编辑器，分别使用平台原生文件服务、凭据存储和 Web 组件。

文舟是独立项目，不是 Acode 官方应用，也不代表 Acode Foundation。项目复用了 Acode 的部分 CodeMirror 编辑组件和 Acode-Writer 1.0.4 的章节识别代码，具体版权与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

当前版本：鸿蒙 `0.4.2`，安卓 `0.4.2-android.1`。鸿蒙使用 HarmonyOS 6.1.1 / API 24 SDK 编译，兼容 API 12；安卓使用 API 36 编译，最低 Android 8.0 / API 26，系统 WebView 需 Chromium 105 或更新版本。仅使用内部工作区，不申请文件访问权限。安卓已在 Android 16 模拟器验证；鸿蒙新增 HTML 页面已通过原生编译与签名构建，尚待真机体验验收。完整验证范围见 [VALIDATION.md](VALIDATION.md)。

当前应用包名：`me.wenzhou.write`。签名 Profile 必须绑定同一包名，且与所选证书匹配。应用文稿与设置保存在自身沙箱中。

发行文件位于 [`dist/`](dist/)：

- [Wenzhou-0.4.2-source.zip](dist/Wenzhou-0.4.2-source.zip)：完整源码包，不含个人证书、私钥或访问令牌。
- [Wenzhou-0.4.2-release-signed.hap](dist/Wenzhou-0.4.2-release-signed.hap)：包名为 `me.wenzhou.write`，使用当前 DevEco 工程的发布证书和应用市场发布 Profile 签名。
- [Wenzhou-0.4.2-release-signed.app](dist/Wenzhou-0.4.2-release-signed.app)：使用同一发布签名配置的应用包，包含 entry 模块，供应用市场提交使用。
- [release.json](dist/release.json)：本版产物的文件大小和 SHA-256 校验值。

安卓调试安装包：[`Wenzhou-0.4.2-android.1-debug.apk`](dist/Wenzhou-0.4.2-android.1-debug.apk)，校验记录为 [`android-debug.json`](dist/android-debug.json)，未签名 release APK 的记录为 [`android-release.json`](dist/android-release.json)。`dist` 为本机构建输出，不纳入 Git；上面的文件链接在本地工程中可用。实际鸿蒙发布签名配置保存在本机 DevEco 工程中，安卓正式分发需要另行配置自己的发布签名。

## 已实现

- 仅使用内部工作区。文件与文件夹支持新建、重命名、移动、复制、剪切 / 粘贴、副本、属性、排序、搜索、回收站恢复及确认后的永久删除。目录操作保留空文件夹和二进制附件。导入识别 UTF-8、带 BOM 的 UTF-16 与 GB18030，导出为 UTF-8。
- CodeMirror 6 编辑、行号、当前行高亮、自动换行、查找替换、各文件独立撤回 / 重做历史、Markdown / HTML 预览，CSV 可编辑表格与分页。
- 章节始终自动识别中文、英文、Markdown 和数字编号标题；设置可添加多个标题模板，与标准标题同时识别。支持当前章 / 全文字数、选中文字数、目录筛选、定位当前章和在同一文件末尾追加章节。
- 底部八项快捷操作：保存、撤回、重做、文件顶部、文件底部、章节顶部、章节底部、Git。
- GitHub 个人访问令牌登录为连接页的首选操作，保留设备授权；仓库列表与筛选、创建仓库、修改仓库名称 / 简介、分支列表 / 切换 / 创建、目录浏览、远端文本读取、单文件提交和远端文件删除。
- 同仓库同路径重复拉取覆盖本地文件，保留文件 ID；不同仓库 / 路径的同名文件独立保存。整仓拉取按固定提交读取目录树和全部文件，包括二进制资源；再次拉取覆盖该仓库目录的对应文件，本地独有文件保留。提交保留读取时的 SHA，冲突时显示提示。
- 原生文件导入导出、文稿原子保存与上一版备份、原生 HTTPS 请求。鸿蒙凭据使用安全资产存储，安卓使用 Android Keystore 的 AES-GCM 加密；接口不向页面返回存储的令牌。安卓批量文件操作使用持久事务日志，在中断后恢复原文件。
- 两端 HTML 使用独立的原生 Web 页面，保留原始布局、表单、本地 CSS、图片、字体与脚本。默认关闭脚本和联网，可单独开启；预览页面没有编辑器或 GitHub 原生桥，双指只调整文字缩放。
- 默认绿色“青松”主题，可选“玉石、墨竹、麦田、石墨”，每套都有深浅色。外观默认跟随系统，可固定为浅色或深色；顶部按钮在跟随系统 → 浅色 → 深色之间轮换。正文、预览和表格字号可在设置中调整，双指缩放仅改变文字字号（10–40 px）。
- Markdown 支持 .md / .markdown / .mdown / .mkd，标题、格式操作、表格、任务列表、代码块及工作区图片预览；文件标签旁可手动修正类型。顶部快捷按钮采用统一 SVG 和尺寸。
- Tab 插入两个全角空格，Shift+Tab 取消行首缩进；选中多行时按行缩进。全部快捷操作都有快捷键，Ctrl+Shift+K 打开命令面板。
- 文件标签具有关闭按钮；关闭保留本地文件和本次会话的撤回历史，删除移入回收站。首次安装创建“操作指南.txt”；没有该文件时启动进入最近文件页。旧版指南自动更名并保留内容，用户自己创作的“未命名小说.txt”保留原名；未修改的旧示例按完整 SHA-256 替换。
- 文件侧栏、章节侧栏和正文共享 140 毫秒布局动画，每帧同步宽度，正文左右边界始终贴合侧栏。手机文件侧栏上限 180 px、章节侧栏上限 170 px，导航改为横排；两侧同时展开时继续缩窄侧栏，为正文保留至少 160 px 或屏幕宽度的 40%（取较大值）。支持中途反向和快速连续切换；系统启用“减少动态效果”时直接切换。文件侧栏仍仅由左上角文件夹按钮控制。
- 顶部由原生布局避让系统状态栏；底部背景覆盖导航提示条区域，并留出操作空间。
- 选中文字时隐藏当前段落背景，取消选择后恢复；选区左右边界与段落边界一致，首尾部分文字保持精确范围。
- Acode JavaScript 插件可从本地 ZIP 安装、启用、停用、卸载；完整运行时开源许可可在设置中查看。

## 快捷操作语义

| 操作 | 行为 |
| --- | --- |
| 保存 | 保存本地全部文件状态，不自动提交 GitHub |
| 撤回 / 重做 | 撤回 / 重做当前文件的正文编辑，刷新 / 重启后历史重置 |
| 文件顶部 / 底部 | 光标移动到当前文件的起点 / 终点 |
| 章节顶部 | 移动到光标所在章节的标题行开头 |
| 章节底部 | 移动到下一章标题之前的最后一行末尾；末章到文件终点 |
| Git | 未登录时打开账户连接；登录后打开当前文件的仓库关联与提交表单 |

无标题时全文视为一个章节；首个标题前有内容时显示“章前内容”。空行属于章节范围，所以章节底部可能落在正文后的空行。正文自动换行不会改变逻辑行号。

## 构建与预览

需要 Node.js 和 DevEco Studio。编辑器依赖版本由 `package-lock.json` 固定。

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

浏览器预览地址：`http://127.0.0.1:4173`。浏览器使用本地存储保存文稿，令牌只在内存中；应用版将文稿写入内部工作区，设置、索引和备份保存在沙箱。浏览器预览使用受限 HTML iframe，完整原生 HTML 预览需要在应用中使用。

### Android 构建

需要 Android SDK（platforms;android-36、build-tools;36.0.0）、完整 JDK 17 或 21，以及 Node.js。设置 `ANDROID_HOME` 与 `ANDROID_JAVA_HOME`（或 `JAVA_HOME`），不要把缺少 jlink 的精简运行时作为 Android JDK。

```powershell
npm.cmd ci
npm.cmd run build:android
```

脚本调用随仓库提供的 Gradle 8.13 Wrapper，并自动生成共享编辑器资源。使用 AGP 8.13.2；首次构建需要下载依赖。可在 Android Studio 中打开 `android/`。`node scripts/build-android.mjs --release` 生成未签名 APK / AAB；仓库没有发布私钥。调试安装包可直接安装，HarmonyOS 与 Android 的沙箱文稿和账号配置独立，通过导出备份或 GitHub 转移文稿。

构建 HAP：

```powershell
.\scripts\build-hap.ps1 -DevEco 'D:\DevEco Studio'
```

生成位置：`entry/build/default/outputs/default/entry-default-unsigned.hap`。构建脚本会先重新打包编辑器资源。

发行源码包包含完整的 `entry/src/main/resources/rawfile/web/` 页面、脚本、样式和许可资源，可直接在 DevEco Studio 执行 Build / Run，无需先安装前端依赖。原生编译前的 `PrepareEditor` 任务会检查资源及源码摘要；编辑器源码有修改时，已安装前端依赖的工程会自动重新打包，否则会明确提示先执行 `npm.cmd ci`。资源缺失或过期时不会继续生成 HAP。打包脚本也会检查资源完整性，防止再次生成缺少页面的源码包。

### DevEco 工程同步

在本机打开工程时使用磁盘真实路径 `D:\Wenzhou-HarmonyOS`，不要使用 `D:\WenZhou-HarmonyOS`。当前 Hvigor 的模块检查要求路径大小写与磁盘一致；即使 Windows 能访问后一种路径，也可能报 `00303149 Path not found`。遇到这一错误，关闭当前工程，再通过 Open 选择真实目录，执行 Sync Project。

`build-profile.json5` 的 `modules[0].srcPath` 保持为 `./entry`，`targetSdkVersion` 为 `6.1.1(24)`。`entry` 必须和根目录的 `build-profile.json5` 位于同一层。

用户环境变量 `DEVECO_SDK_HOME` 应指向 `D:\DevEco Studio\sdk`，而不是 `sdk\default\openharmony`；HarmonyOS 构建会读取根目录下的 SDK 包信息。修改环境变量后重新启动 DevEco Studio。`scripts/build-hap.ps1` 会为本次构建设置 SDK、Node 和 Java 路径。

安装到鸿蒙设备前，在 DevEco Studio 打开工程，通过项目签名配置生成匹配开发者账号 / 设备的调试签名，再执行构建或 Run。当前工程没有嵌入个人证书、私钥或签名密码；未签名 HAP 不能当作已签名安装包直接安装。

## 配置 GitHub 登录

使用个人访问令牌：细粒度令牌选择目标仓库并授予 Contents 读写权限，元数据读取权限用于仓库列表；创建 / 修改仓库还需要 GitHub 对应的管理权限。经典令牌通常使用 `repo` 权限。组织仓库还需满足组织的授权策略。

官方接口依据：[设备授权](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)、[仓库管理](https://docs.github.com/en/rest/repos/repos)、[仓库内容与版本提交](https://docs.github.com/en/rest/repos/contents)。

### 登录失败时

0.1.3 修正了 ArkWeb 调用注册：返回 Promise 的原生接口放在 `methodList`；`asyncMethodList` 是不返回结果的调用方式，不能用于登录、导入导出等需要返回结果的操作。依据见 [ArkWeb 官方接口说明](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkweb/arkts-apis-webview-WebviewController.md#registerjavascriptproxy)。

连接页的“检测连接”通过应用原生网络层访问 GitHub API，不需要令牌。联网请求使用设备系统代理并保留 HTTPS 证书校验。失败提示会区分网络异常、HTTP 401 / 403 和安全存储错误，并显示错误码；日志仅记录阶段和错误码，不记录令牌或原始网络异常数据。

网络检测通过后，若令牌验证返回 HTTP 401，请检查令牌是否完整、过期或已撤销；安全存储错误 24000005 表示需要保持设备解锁。原生调用返回为空或格式不正确时会显示升级提示。

## 数据与边界

文稿默认仅保存到设备，用户主动提交才会上传。退出 GitHub 会清除本地凭据，保留本地文件。同仓库同路径文件再次拉取时覆盖相应本地文件；不同仓库和不同目录的同名文件保留独立路径。删除远端文件需要明确提交确认。

文稿默认保存在应用沙箱的 `files/workspaces/文舟/`，首次启动无需文件权限或选择目录；清空应用数据或卸载会删除内部文稿，应先导出或同步。侧栏直接管理内部文件和文件夹，不提供外部目录工作区。

应用只声明 `ohos.permission.INTERNET`，供 GitHub 登录与仓库操作使用。内部文件读写无需特殊权限；导入和导出通过系统文件选择器逐次选择文件，不申请下载目录访问或持久目录授权。

工作区索引与设置位于应用沙箱的 `files/workspace.json`；写入临时文件并同步后替换，上一版位于 `workspace.json.bak`。目录配置为 `folders.json`，各工作区索引为 `folder-<id>.json`；文稿上一版备份为 `previous-<id>.txt`。回收站记录为 `trash.json`，内容暂存在所属工作区的隐藏目录；应用目录树不显示这些保留项目，回收站最多保存 100 项。恢复遇到原路径被占用时不会覆盖，永久删除需另行确认。移动和删除的状态写入失败时回退实文件，复制目录保留附件字节及空目录。

其他应用修改文稿后，保存会提示外部修改，需刷新工作区再继续。读取损坏的数据时停止初始化、保留原始内容，提供导出原始数据入口。设置中的“导出全部文稿备份”导出 JSON；当前版本如需恢复该 JSON，可通过源码 / 开发工具恢复，尚无应用内 JSON 恢复入口。日常交换支持 TXT / Markdown / HTML / CSV 导入导出。

文件导入和 GitHub 内容读写上限为每个文件 8 MB。远端单文件编辑使用 UTF-8；本地导入另支持 UTF-16 BOM / GB18030。工作区扫描上限为 5000 个文件 / 目录；二进制或超过 8 MB 的文件保留在目录中，并在侧栏说明无法作为文本编辑的原因。整仓拉取上限为 5000 个条目、每文件 8 MB、总计 64 MB，不支持子模块；下载和校验完成后再写入目录，批量写入失败会恢复已经覆盖的文件。远端内容按固定提交和 Git blob 读取，保留该版本的 SHA。按字符统计英文；多码点 emoji 依 Writer 规则计数。

Git 功能使用 GitHub REST API 完成远端版本操作，没有本地完整 Git 工作树、离线提交、克隆全部历史或自动合并。Acode 插件兼容范围和限制见下文。

## 键盘操作与文件预览

| 快捷键 | 操作 |
| --- | --- |
| Tab / Shift+Tab | 两个全角空格缩进 / 取消行首缩进 |
| Ctrl+S / Ctrl+Z / Ctrl+Shift+Z | 保存 / 撤回 / 重做 |
| Ctrl+Home / Ctrl+End | 文件顶部 / 底部 |
| Alt+↑ / Alt+↓ | 章节顶部 / 底部 |
| Ctrl+Shift+G | Git 仓库与提交 |
| Ctrl+N / Ctrl+O / Ctrl+Shift+S | 新建 / 导入 / 导出 |
| Ctrl+W | 关闭当前标签（保留文件） |
| Ctrl+F / Ctrl+Shift+P | 查找替换 / 预览与源码 |
| 左上角文件夹按钮 / Ctrl+Shift+O | 文件侧栏 / 章节目录 |
| Ctrl+Alt+R / Ctrl+Alt+N | 刷新工作区 / 新建文件夹 |
| Ctrl+B / Ctrl+I / Ctrl+Shift+X / Ctrl+Alt+C | Markdown 加粗 / 斜体 / 删除线 / 行内代码 |
| Ctrl+Alt+1 / Ctrl+Alt+7 / Ctrl+Alt+8 / Ctrl+Alt+Q | Markdown 标题 / 列表 / 任务 / 引用 |
| Ctrl+Alt+Enter / Ctrl+Alt+L | 追加章节 / 定位当前章节 |
| F11 / Ctrl+Alt+T / Ctrl+, | 专注 / 外观模式 / 设置 |
| Ctrl+Alt+H / Ctrl+Alt+P / Ctrl+Shift+K | 启动页 / 插件 / 命令面板 |
| Ctrl+加号 / 减号 / 0 | 调整 / 重置文字字号 |

HTML / HTM 默认打开源码，应用中的预览使用 ArkWeb / Android WebView，保留原始样式而不强制套用编辑器主题。资源路径相对 HTML 所在目录解析，可引用同一工作区的上级目录；文件导入可添加图片和其他附件。单个文件上限 8 MB。脚本与联网默认关闭，可通过预览工具栏开启，远程资源仅允许 HTTPS；返回编辑可继续修改源码。CSV 扩展名不区分大小写，默认显示可编辑表格，自动识别逗号、分号、Tab 及 Excel 的 sep= 标记；支持带引号和换行的单元格及手动分隔符。宽表按行和列分页，每页不超过 2000 个单元格，保留全部数据。TXT 预览保留纯文本；Markdown 提供格式栏及阅读预览。首次安装指南列出全部快捷键。

## Acode 插件

在顶部插件按钮、命令面板或启动页选择“Acode 插件”，从本地 ZIP 安装。ZIP 根目录需要标准 `plugin.json`，`main` 指向包内已打包的 JavaScript 脚本。安装包上限 8 MB，解压资源上限 16 MB / 512 个文件。源文件和启停状态持久保存在 `files/plugins.json`，重新启动自动加载已启用插件；加载失败的插件停用并保留明确原因。

兼容 `acode.setPluginInit`、`setPluginUnmount`、`require` / `define`、CodeMirror 6 的 state / view / commands / language / search、`editorManager` 的活动文件和切换 / 修改事件、命令注册、设置、插件页面、基础提示弹窗、包内 CSS / 图片 / fetch 资源和缓存文件。已安装插件注册的命令可在 Ctrl+Shift+K 中执行。共享宿主设置保存在插件存储，插件也可使用自身本地存储。

未移植 Android / Cordova 原生接口、Ace、终端、Acode 插件市场购买授权和所有 Acode 内置模块，不保证每个 Acode 插件都可直接运行。未实现的模块在加载时显示名称；纯 JavaScript / CodeMirror 插件可运行，真实 Writer 1.0.4 的 ZIP 安装、底栏、命令、启停及重新启动均已验证。插件的卸载回调应清理自身事件、计时器和额外 DOM。

兼容接口依据：[Acode 官方插件模板](https://github.com/Acode-Foundation/acode-plugin)、[Acode 宿主 API 固定源码](https://github.com/Acode-Foundation/Acode/blob/a63983fd2f76d5ae44c73d062acb18c12bdc0e7f/src/lib/acode.js)。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
```

界面检查使用本机 Chrome，或通过 `WENZHOU_CHROME` 指定兼容浏览器。检查包含桌面 / 手机布局、八项快捷操作、章节边界与追加、保存和撤回历史、GitHub API 模拟、冲突保留，以及约 60 万字符 / 300 章的单文件编辑。所有远端写操作都使用模拟请求，没有修改真实 GitHub 仓库。

安卓测试需先启动专用 AVD `Wenzhou_QA_API36`，默认连接 `emulator-5582`，可通过 `WENZHOU_ANDROID_SERIAL` 指定其他模拟器端口。测试拒绝在真机或其他 AVD 上运行；该 AVD 应仅用于测试。

```powershell
npx.cmd playwright install android
npm.cmd run test:android:native
npm.cmd run test:android
```

第一项构建并安装主包与原生检查包，验证加密存储、文件操作、中断恢复和 HTML 资源；第二项验证模拟器实际 WebView 与 HTML 预览。两项顺序执行，避免安装或停止进程中断界面测试。

截图及结果位于 `test-results/`，包含用户文稿的真机截图不会进入发行源码包。本版尚未安装到真机；各种输入法、后台行为、第三方插件和真实远端写入仍需按使用场景验收。已有 GitHub 登录已由用户在真机确认，自动检查没有修改真实远端仓库。

## 来源与目录

`vendor/acode/` 按原样保留并实际使用 Acode 提交 `a63983fd2f76d5ae44c73d062acb18c12bdc0e7f` 的换行、标点断行及滚动留白组件。`vendor/acode-writer/` 来自用户提供的 Acode-Writer-1.0.4.zip，其 `src/core.js` 直接用于章节识别和统计。

| 路径 | 用途 |
| --- | --- |
| `web/` | 编辑器界面、文稿模型、GitHub 客户端 |
| `entry/src/main/ets/` | 鸿蒙 ArkTS 应用入口、ArkWeb 与原生服务 |
| `android/` | Android 应用、原生文件 / HTTPS / Keystore 服务与独立 HTML WebView |
| `scripts/` | 编辑器构建、预览与 HAP 构建 |
| `tests/` | 文稿 / GitHub 逻辑与浏览器集成检查 |
| `vendor/` | Acode 与 Writer 原始源码、许可 |

许可和来源见 `THIRD_PARTY_NOTICES.md`。编辑器全部资源打包进 HAP，不依赖远程 CDN。
