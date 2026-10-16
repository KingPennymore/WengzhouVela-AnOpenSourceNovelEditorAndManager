# 文舟 Vela · 开源小说创作 / 阅读工具

文舟（Vela）是面向 HarmonyOS NEXT、Android 和 Windows 的开源小说创作与阅读工具。整部小说可以写在一个 TXT / Markdown 文件里，也可以用工作区组织多个文稿、附件和作品配置；写好的作品可以在应用内阅读、导出为 EPUB，或通过 GitHub / Gitee 同步。

文舟是独立项目，不是 Acode 官方应用，也不代表 Acode Foundation。项目复用了 Acode 的部分 CodeMirror 编辑组件和 Acode-Writer 1.0.4 的章节识别代码，版权与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

当前版本：鸿蒙 / Windows **0.9.8.1**，安卓 **0.9.8.1-android.1**，移动端版本代码 **1090801**，包名 `me.wenzhou.write`。HarmonyOS 使用 API 24 SDK 编译，兼容 API 12；安卓最低 Android 8.0 / API 26，WebView 需 Chromium 105 或更新版本。

**下载**：[GitHub Releases](https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager/releases)，国内可用 [Gitee 镜像](https://gitee.com/kingpennymore/wenzhou-vela-mirror-repository/releases)。每个版本提供鸿蒙 HAP 与市场提交用 APP、安卓 APK / AAB（正式证书签名，可覆盖升级）、Windows x64 安装包与便携 ZIP、源码和可选组件。各版本变化见 [更新说明](RELEASE_NOTES.md)，验证范围见 [VALIDATION.md](VALIDATION.md)。

首次启动会创建“操作指南.txt”，按功能介绍全部操作；本页只做概览。

## 功能

### 写作
- CodeMirror 6 编辑器：查找替换、各文件独立的撤回 / 重做、章节目录与字数统计、章节跳转，小说模式默认隐藏行号。Tab 插入两个全角空格。
- 章节自动识别中文、英文、Markdown 和数字编号标题，作品 `.vela` 可再加标题模板。
- 自动补全：术语库词条优先，其次是从正文推测的人名、地名（本地计算，可关闭）。
- 命令面板（Ctrl+Shift+K）分组列出全部命令：章节管理、工作区搜索替换（先预览）、写作词库与片段、书签 / 批注 / 待修改、本地历史恢复和各类导出。
- 选中文字后，上方出现横向菜单：剪切、复制、粘贴，其余操作在“更多”里。选区开头滚出编辑区时，菜单固定在工具栏下方。
- Markdown 格式栏与预览，CSV 可编辑表格，HTML 隔离预览（禁止脚本和联网，可单独打开独立预览），常见源码语法高亮。

### TXT 格式
- 粗体、着重号、注音、居中 / 右对齐、插图和命名样式（系统提示、书信、回忆、旁注，可自定义）。样式可用于整段，也可只用于选中的字；“清除格式”一键去掉选区和所在段落的格式。
- TXT 正文保持纯文字，复制到网文平台不用清洗。格式保存在作品配置 `.vela` 的 `richText` 中，条目按段落定位：在文舟外改过正文后，格式自动重新定位，找不到的进入“待确认”，不会丢弃。
- 0.9.7 的格式旁注（`正文.txt.vela`）仍可读取，保存时自动并入 `.vela`。格式设计见 [VELA-V3-DESIGN.md](docs/VELA-V3-DESIGN.md)。

### 作品配置 `.vela`
- 打开 `.vela` 显示两页：“作品配置”（作品信息、编辑、章节、阅读排版、阅读清单、单文件配置）和“TXT 格式”（格式工具开关、命名样式、每个 TXT 的格式记录）。
- 按“内置默认 → 全局 `.global.vela` → 最近的作品 `.vela` → 单文件”继承。阅读清单可设为自动包含文件夹内全部文稿。重命名、移动、复制文件会同步更新清单和格式记录。
- 配置写错时保留原文并继续使用上次有效配置，保存时保留最近 5 次备份。格式说明见 [VELA.md](docs/VELA.md)。

### 术语库
- `.gly` / `.glossary` 文件打开为紧凑的词条列表，可搜索、按分类筛选；点按进入词条详情，长按复制词条；新建、删除和修改都会自动保存。
- 作品可关联多个术语库，用于补全、正文高亮与释义。说明见 [GLOSSARY.md](docs/GLOSSARY.md)。

### 导出
- 按章节范围导出 TXT、Markdown、HTML，或复制（复制 HTML 时带格式）。
- EPUB 3 电子书：目录、格式、注音、插图和可选封面，经 W3C EPUBCheck 校验。

### 阅读
- 书库、上下滑动 / 左右翻页 / 双页阅读、全屏、目录、全文搜索、书签和批注；每本书单独记住阅读位置。
- TXT 格式在阅读页同样显示，阅读位置与书签仍按原文计算。PDF、HTML、CSV 也可阅读。说明见 [READING.md](docs/READING.md)。

### 同步与订阅
- GitHub / Gitee：令牌登录、仓库与分支管理、拉取文件 / 文件夹 / 整个仓库、提交单个文件或整个工作区，拉取和提交前先预览，冲突逐段合并。见 [GITHUB.md](docs/GITHUB.md)、[GITEE.md](docs/GITEE.md)。
- 订阅公开或有权限的私有仓库，阅读 Release 与 Changelog；Vela 项目可只拉取阅读清单内的文稿。

### 插件与组件
- “更多操作 → 插件与组件”统一管理插件和可选组件。插件接口 4 可在顶栏、文稿工具区、底栏、侧栏和选区菜单添加按钮与面板，见 [PLUGINS.md](docs/PLUGINS.md)。
- 在线组件：应用读取发布在 GitHub / Gitee 上的组件目录（`catalog` 发布中的 `catalog.json`），列出可下载的组件、提示已装组件的更新，并标出需要更新版文舟才能使用的组件。下载后校验 SHA-256 再安装。见 [COMPONENTS.md](docs/COMPONENTS.md)。
- 可选组件：LaTeX 排版组件（XeLaTeX / pdfLaTeX、中文宏包与字体，约 77 MB，轻量版按需下载）、电子书阅读组件（EPUB、FB2、PDF、无 DRM 的 MOBI 等）。

### LaTeX 与 PDF
- 本地编译真正的 XeTeX / pdfTeX（WebAssembly），支持 BibTeX、MakeIndex、多文件工程和中文；补全、即时检查、大纲折叠、自动编译和源码 ↔ PDF 定位。见 [LATEX.md](docs/LATEX.md)。

### 外观与平台
- 跟随系统深浅模式，五套内置配色和自选配色；简体中文 / English。
- 鸿蒙与安卓：凭据分别存放在安全资产存储和 Android Keystore。Windows：x64 安装包与便携 ZIP，应用内检查和下载更新，令牌用 Windows 安全存储加密。见 [WINDOWS.md](docs/WINDOWS.md)。

## 数据与隐私

- 文稿只保存在设备的应用内部文件夹，只有用户主动提交才会上传。应用只申请联网权限，导入导出通过系统文件选择器逐次选择文件。
- 卸载或清空应用数据会删除内部文稿，请定期导出备份或同步。
- 工作区数据写入时先写临时文件再替换，并保留上一版。文件导入和远端单文件上限 8 MB，整仓拉取上限 5000 个条目 / 64 MB。
- Git 功能通过 GitHub / Gitee REST API 完成，没有本地完整 Git 工作树。
- 隐私说明见 [PRIVACY.md](docs/PRIVACY.md)。

## 构建

需要 Node.js；鸿蒙需要 DevEco Studio，安卓需要 Android SDK（platforms;android-36、build-tools;36.0.0）和完整 JDK 17 / 21。

```powershell
npm.cmd ci
npm.cmd run build          # 共享前端（完整版，内置 TeX）
npm.cmd run dev            # 浏览器预览 http://127.0.0.1:4173
npm.cmd run build:android  # 安卓（脚本自带 Gradle Wrapper）
.\scripts\build-hap.ps1 -DevEco 'D:\DevEco Studio'   # 鸿蒙 HAP
npm.cmd run build:windows  # Windows 安装包与 ZIP
```

带 `:lite` 后缀的命令生成不含 TeX 引擎的轻量版。发布签名、轻量版、源码包、组件目录和 Gitee 镜像的完整流程见 [BUILD-AND-VERIFY.md](docs/BUILD-AND-VERIFY.md)。

- 仓库不含任何签名私钥或口令。安卓发布签名用 `scripts/sign-android.ps1`；鸿蒙在 DevEco Studio 中配置自己的签名。
- 在 DevEco Studio 中打开工程时，请使用磁盘上的真实路径大小写，否则 Hvigor 可能报 `00303149 Path not found`。`DEVECO_SDK_HOME` 应指向 `DevEco Studio\sdk`。
- 发行源码包已包含构建好的编辑器资源，可直接在 DevEco Studio 构建。

## 验证

```powershell
npm.cmd test          # 逻辑测试
npm.cmd run verify    # 构建 + 逻辑测试 + 全部浏览器测试
```

浏览器测试使用本机 Chrome，或用 `WENZHOU_CHROME` 指定。远端写操作全部使用模拟请求，不会修改真实仓库。安卓原生测试需要专用模拟器，见 [BUILD-AND-VERIFY.md](docs/BUILD-AND-VERIFY.md)。公开测试样例见 [测试文件](测试文件/README.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `web/` | 三端共用的编辑器、阅读器和界面 |
| `entry/src/main/ets/` | 鸿蒙 ArkTS 入口、ArkWeb 与原生服务 |
| `android/` | Android 应用与原生服务 |
| `windows/` | Windows（Electron）外壳 |
| `components/` | 可选组件源码（电子书阅读等） |
| `scripts/` | 构建、签名、发布与镜像脚本 |
| `tests/` | 逻辑与浏览器测试 |
| `vendor/` | Acode、Acode-Writer 与 WasmTeX 来源及许可 |
| `docs/` | 设计与使用文档 |

许可证见 [LICENSE](LICENSE)，第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。编辑器资源全部打包进应用，不依赖远程 CDN。
