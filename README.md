# 文舟 Vela · 开源小说创作 / 阅读工具

文舟（Vela）是一款面向 HarmonyOS NEXT、Android 和 Windows 的开源小说创作与阅读工具。支持将整部小说写在一个 TXT / Markdown 文件中，也支持使用工作区组织多个文稿、附件和项目配置。文件按钮位于顶栏最左侧并以分隔线分组，四个入口分别用于写作、GitHub / Gitee 仓库、仓库订阅与只读阅读，三端共享编辑器并使用各自原生文件服务、凭据存储和 Web 组件。

文舟是独立项目，不是 Acode 官方应用，也不代表 Acode Foundation。项目复用了 Acode 的部分 CodeMirror 编辑组件和 Acode-Writer 1.0.4 的章节识别代码，具体版权与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

当前版本：鸿蒙 / Windows **0.9.5**，安卓 **0.9.5-android.1**，移动端版本代码 **10905**，包名 `me.wenzhou.write`。HarmonyOS 使用 API 24 SDK 编译，兼容 API 12；安卓最低 Android 8.0 / API 26，WebView 需 Chromium 105 或更新版本。

[下载 0.9.5](https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager/releases/tag/v0.9.5)：三端完整版与轻量版，包括发布签名 HAP、鸿蒙市场提交用 APP.zip、安卓签名 APK / AAB、Windows x64 安装程序 / ZIP；另附源码、两份可选离线排版组件及 SHA-256 清单。Windows 包尚无 Authenticode 签名。鸿蒙发布签名的直接安装受系统来源校验限制，不能替代调试签名安装。

0.9.3 重写正文名词候选识别，200 万字基准识别约 990/1000 个专名，误报大幅减少；启动页统计卡片去掉图标。0.9.2 删除翻页动画，翻页直接切换；其余界面动画放缓，均不短于 200 毫秒。0.9.1 重新设计三端界面与动画：分段页面切换器、浮起的当前项、书封书库、页面淡入与卡片依次出现，保留原有配色与布局尺寸；减少动态效果时动画停用。

0.9.0 补齐分镜中的逐行差异预览、提交历史、文件状态、订阅下载进度与取消、页内书签/批注及双页翻书；新增本地正文名词候选补全。术语库同屏和正文术语提示均可选，默认关闭。详见 [分镜核对与验证记录](docs/STORYBOARD-AUDIT.md)。

0.8.0 将作品配置、个人默认值和阅读书库分开；加入本地历史恢复、章节管理、工作区搜索替换、写作词库与标记，GitHub 拉取和提交先预览变更，阅读增加搜索/书签/批注及长篇正文窗口化。Windows 记忆窗口布局并可检查更新。具体行为与兼容范围见下列文档。

- [配置与恢复](docs/VELA.md)
- [文档编辑](docs/EDITING.md)
- [GitHub 同步](docs/GITHUB.md)、[Gitee 支持](docs/GITEE.md)
- [构建、轻量版与发布检查](docs/BUILD-AND-VERIFY.md)
- [阅读](docs/READING.md)、[性能](docs/PERFORMANCE.md)、[正文名词候选基准](docs/NOUN-BENCHMARK.md)
- [Windows](docs/WINDOWS.md)、[插件](docs/PLUGINS.md)、[LaTeX](docs/LATEX.md)
- [验证范围](VALIDATION.md)、[更新说明](RELEASE_NOTES.md)

文稿与设置保存在应用沙箱；导出备份和 GitHub 同步由用户控制，卸载移动应用会删除内部数据。令牌存放在平台安全存储，浏览器预览只保留于内存。签名材料在仓库外，本机构建输出 `dist/` 不纳入 Git。

0.9.4 恢复左右覆盖翻页，修正同屏术语搜索与侧栏交互，并加入 GitHub / Gitee 令牌登录选择。Gitee 仓库能力与凭据隔离见 [Gitee 支持](docs/GITEE.md)。

## 已实现

- 仅使用内部文件夹。文件与文件夹支持新建、重命名、移动、复制、剪切 / 粘贴、副本、属性、排序、搜索、回收站恢复及确认后的永久删除。目录操作保留空文件夹和二进制附件。导入识别 UTF-8、带 BOM 的 UTF-16 与 GB18030，导出为 UTF-8。
- CodeMirror 6 编辑、行号、当前行高亮、自动换行、查找替换、各文件独立撤回 / 重做历史、Markdown / HTML 预览，CSV 可编辑表格与分页。
- 章节始终自动识别中文、英文、Markdown 和数字编号标题；每个工作区的 `.vela` 可添加多个标题模板，与标准标题同时识别。支持当前章 / 全文字数、选中文字数、目录筛选、定位当前章和在同一文件末尾追加章节。
- 底部八项快捷操作：保存、撤回、重做、文件顶部、文件底部、章节顶部、章节底部、Git。
- GitHub 个人访问令牌登录为连接页的首选操作，保留设备授权；仓库列表与筛选、创建仓库、修改仓库名称 / 简介、分支列表 / 切换 / 创建、目录浏览、远端文本读取、单文件提交、整个工作区提交和远端文件删除。工作区提交把文稿、`.vela` 与二进制附件写入一个 Git commit，分支更新不强推。
- 同仓库同路径重复拉取覆盖本地文件，保留文件 ID；不同仓库 / 路径的同名文件独立保存。整仓拉取按固定提交读取目录树和全部文件，包括二进制资源；再次拉取覆盖该仓库目录的对应文件，本地独有文件保留。提交保留读取时的 SHA，冲突时显示提示。
- 原生文件导入导出、文稿原子保存与上一版备份、原生 HTTPS 请求。鸿蒙凭据使用安全资产存储，安卓使用 Android Keystore 的 AES-GCM 加密；接口不向页面返回存储的令牌。安卓批量文件操作使用持久事务日志，在中断后恢复原文件。
- 两端 HTML 默认在原源码区域嵌入预览，保留顶栏、文件标签、源码光标与撤回历史，支持本地 CSS、图片、字体及相对资源路径。嵌入页面禁止脚本、联网、表单提交与越出框架导航；“独立预览”保留独立原生 Web 页面，供单独开启脚本或联网的交互调试使用。
- 默认绿色“青松”主题，可选“玉石、墨竹、麦田、石墨”，每套都有深浅色。外观默认跟随系统，可固定为浅色或深色；顶部按钮在跟随系统 → 浅色 → 深色之间轮换。正文、预览和表格字号可在设置中调整，双指缩放仅改变文字字号（10–40 px）。
- Markdown 支持 .md / .markdown / .mdown / .mkd，标题、格式操作、表格、任务列表、代码块及工作区图片预览；文件标签旁可手动修正类型。顶部快捷按钮采用统一 SVG 和尺寸。
- Tab 插入两个全角空格，Shift+Tab 取消行首缩进；选中多行时按行缩进。全部快捷操作都有快捷键，Ctrl+Shift+K 打开命令面板。
- 文件标签具有关闭按钮；关闭保留本地文件和本次会话的撤回历史，删除移入回收站。首次安装创建“操作指南.txt”；没有该文件时启动进入最近文件页。旧版指南自动更名并保留内容，用户自己创作的“未命名小说.txt”保留原名；未修改的旧示例按完整 SHA-256 替换。
- 文件侧栏、章节侧栏和正文共享 240 毫秒布局动画，每帧同步宽度，正文左右边界始终贴合侧栏。手机文件侧栏上限 180 px、章节侧栏上限 170 px，导航改为横排；两侧同时展开时继续缩窄侧栏，为正文保留至少 160 px 或屏幕宽度的 40%（取较大值）。支持中途反向和快速连续切换；系统启用“减少动态效果”时直接切换。四个页面切换按钮常驻顶栏，文件侧栏仅由其右侧文件夹按钮控制。手机 Git 页面收起底部写作栏并延伸侧栏，账号下方提供退出按钮，未登录时禁用。
- 顶部由原生布局避让系统状态栏；底部背景覆盖导航提示条区域，并留出操作空间。
- 选中文字时隐藏当前段落背景，取消选择后恢复；选区左右边界与段落边界一致，首尾部分文字保持精确范围。
- Acode JavaScript 插件可从本地 ZIP 安装、启用、停用、卸载；完整运行时开源许可可在设置中查看。

## 阅读、订阅与项目配置

阅读页先显示书库，选中文稿后启动页向左收起。文稿默认预览，隐藏文件标签和编辑操作；支持上下滚动或左右翻页，再次点击阅读入口返回书库。手机、平板和二合一采用不同书库布局。触屏双指、触控板捏合和 Ctrl+滚轮调整正文文字，不缩放顶栏；CSV 按行、列分页显示为只读表格，HTML 使用独立原生 Web 页面。

订阅页接受 `https://github.com/owner/repository` 仓库地址，可查看 Release 和 Changelog。启动、进入订阅页及手动刷新时读取最新信息：导航小点在进入页面后消失，仓库小点在查看详情或忽略后消失；支持长按左滑忽略，以及多选忽略、删除。断网保留已有缓存。公开仓库可不登录订阅，私有仓库需要当前 GitHub 账号具有读取权限。

包含 `.vela` 的仓库标记为 Vela 项目。配置更新静默同步，仅阅读清单中的文件变动触发提醒；第一次阅读时下载对应正文并缓存。在拉取对话框可选择“仅拉取阅读清单”，同时保留 `.vela` 和文件在仓库中的完整相对路径，例如 `正文/第一卷/第一章.txt` 不会改成根目录文件。保存目录为 `Subscriptions/owner/repository/`；同路径覆盖，本地独有文件保留。仅拉取阅读清单不会下载未列入清单的图片、样式等附件，需要这些资源时可拉取整个仓库。

侧栏显示“内部文件夹”。“新建工作区”创建文件夹并生成 `.vela`；已有文件夹缺少配置时，可在设置中创建。打开 `.vela` 默认显示 GUI，可设置名称、字号、标题模板和阅读文件，也可像普通文件一样切换源码 / 预览。新文稿自动进入所属工作区的阅读清单。文件更名、移动或删除会更新清单路径；最近一层 `.vela` 决定该文件使用的配置。

```json
{
  "version": 2,
  "kind": "workspace",
  "id": "my-novel",
  "project": {
    "name": "我的小说"
  },
  "chapters": {
    "templates": [
      "【{number}】{title}"
    ]
  },
  "reading": {
    "items": [
      {
        "id": "main",
        "path": "正文.txt"
      }
    ],
    "layout": {
      "fontSize": 20
    }
  }
}
```

`reading.files` 相对于这份 `.vela` 所在文件夹，不允许越界路径；支持 TXT、Markdown、HTML、CSV、LaTeX 和代码文件。配置保留未知字段，便于后续扩展；非法配置显示错误，不自动覆盖。阅读字号可按文稿单独保存。标题识别始终自动运行，全局设置不再提供标题模板。

公开测试样例位于 [测试文件](测试文件/README.md)，包含 54 个阅读文件与两份 `.vela`：小说、Markdown、CSV / TSV、HTML 本地资源、多文件 LaTeX 工程及常见代码格式。可拉取整个“测试文件”文件夹，或通过订阅仅拉取阅读清单；完整相对路径必须保留。

设置可选择中文或 English，英文应用名为 **Vela**，不会翻译文稿、仓库名称或用户标题。编辑器提供 HTML 语言补全和基于当前文稿的词语补全；`Ctrl+Space` 打开建议、Enter 确认、Esc 关闭，Tab 始终保留两个全角空格缩进。

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

Windows 下签名发布包：

```powershell
node scripts/build-android.mjs --release
.\scripts\sign-android.ps1
```

本机发布密钥位于 `D:\Android\Signing\Wenzhou`。其他机器使用 `-SigningDirectory` 指定自己恢复的密钥目录；首次创建自己的密钥才使用 `-CreateKey`。脚本生成 RSA 4096 / SHA256withRSA 的 PKCS12 密钥，签署 APK v2 / v3 与 AAB，并校验签名和 APK 对齐。密钥、密码由当前 Windows 用户与 SYSTEM 访问；密码不会写进命令行、日志或仓库。

请安全备份密钥目录中的 `Wenzhou-release.p12` 和 `keystore-password.txt`，更新版本沿用原密钥。不要把它们放入仓库或发给他人。发布签名与调试签名不同，发布包不能直接覆盖调试包；需先导出文稿备份，卸载调试包，再安装发布包。密钥使用原则参见 [Android 官方签名说明](https://developer.android.com/studio/publish/app-signing)。

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

其他应用修改文稿后，保存会提示外部修改，需刷新工作区再继续。读取损坏的数据时停止初始化、保留原始内容，提供导出原始数据入口。设置中的“导出全部文稿备份”导出 JSON；当前版本如需恢复该 JSON，可通过源码 / 开发工具恢复，尚无应用内 JSON 恢复入口。日常交换支持 TXT / Markdown / HTML / CSV / .vela 导入导出。

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
| Ctrl+Alt+R / Ctrl+Alt+N | 刷新内部文件夹 / 新建工作区 |
| Ctrl+Space | 打开自动补全建议 |
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


## 0.6.1 阅读与排版

TXT / Markdown 阅读进入时自动收起文件栏。点击正文左侧 30% 前进到上一页或向上滚动一屏，右侧 30% 下一页或向下滚动一屏，中间 40% 显示 / 隐藏顶部工具栏。底部显示淡化的时间、页码与百分比；每本书保存文本位置，重新打开自动恢复，字号与屏幕变化时保持附近文本。HTML 在独立原生 Web 页面提供同类只读控制，文档脚本被阻止；TeX 阅读使用生成的 PDF。

LaTeX 使用真正的 XeTeX / pdfTeX、BibTeX8 / MakeIndex，多遍编译、工程子文件、图片、参考文献和中文字体均在本地处理。宏包可通过插件导入，预览显示 PDF 并允许系统导出。未内置整个 CTAN；LuaTeX、Biber、shell-escape 和外部脚本工具不支持，详见 [LATEX.md](docs/LATEX.md)。

常见 JS / TS、Python、C / C++、Java、Rust、Go、SQL、CSS、JSON、XML、YAML 等文件使用对应语言语法高亮与补全。LaTeX 提供命令、环境、宏包、标签和引用候选。Tab 继续用于小说缩进，Enter 确认补全。插件可增加 CodeMirror 扩展、补全来源和编辑事件，停用后统一清理。

仓库拉取后保持当前页面与已打开文稿；长按文件 / 文件夹或使用“多选”选择项目，选中文件夹包含全部后代，目录相对路径保持不变。

## 0.7.0 阅读与桌面更新

阅读支持全屏、四方向滑动翻页（直接切换，无翻页动画）、章节标题独立页，以及按文本位置保存进度。`.vela` 可设置字号、行距和四边留白；设置中的 `.global.vela` 可以回退或覆盖区域配置。订阅添加后询问是否拉取，不创建空文件。

Windows x64 安装包与 ZIP、移动安装包可在 GitHub Releases 获取。详细说明：[阅读与配置](docs/READING.md)、[Windows](docs/WINDOWS.md)。Windows 包目前未进行 Authenticode 签名，移动端沿用发布签名。

0.7.1 新增双页阅读，支持 TXT、Markdown、HTML 和 PDF；窄屏自动切回单页，保留阅读位置。该版本同时修复翻页虚影和配置页保存按钮，并移除 Windows 主窗口菜单栏。

## 0.9.5 改进

移动端编辑底栏仅保留章节名、字数和行列数，居中单行显示，为屏幕圆角留出边距。10 月 10 日底栏修复纳入原 0.9.5，已安装用户可重新下载对应附件覆盖安装。

术语库的两个搜索入口均支持用空格、全角空格或 Tab 分隔多个关键词，全部关键词须在同一条目的名称、分类、别名或释义中匹配，例如“柯戈德尾 地名”。

查找与替换采用统一的应用面板和中英文文案；侧栏可拖动边界或使用方向键调整宽度，双击边界恢复默认，手机与宽屏分别记忆。屏幕键盘覆盖页面时，编辑区、菜单和对话框跟随可见高度。

同步冲突提供本地、远端及合并结果，不重叠的段落自动组合，重叠的段落逐项选择或编辑后确认；保留本地历史和远端基线。轻量构建与离线排版组件、统一回归入口见 [构建与发布检查](docs/BUILD-AND-VERIFY.md)。0.9.5 同时提供完整版、轻量版及两份可选离线排版组件；轻量版编译 LaTeX 前需导入引擎组件，中文排版还需中文组件。
