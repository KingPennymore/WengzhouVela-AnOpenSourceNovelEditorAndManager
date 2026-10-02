# 第三方组件

## Acode

- 源码：https://github.com/Acode-Foundation/Acode
- 固定提交：`a63983fd2f76d5ae44c73d062acb18c12bdc0e7f`
- Copyright 2020 Foxdebug (Ajit Kumar)
- 许可：MIT；完整文本位于 `vendor/acode/LICENSE`。
- 实际复用：`indentedLineWrapping.ts`、`punctuationWrapping.ts`、`scrollPastEnd.ts`，原样保留。

## Acode-Writer 1.0.4

- 来源：用户提供的 `Acode-Writer-1.0.4.zip`。
- Copyright (c) 2026 Tu Yuan
- 许可：MIT；完整文本位于 `vendor/acode-writer/LICENSE`。
- 文舟直接复用 `src/core.js`；插件其余原始文件和检查代码保留在 vendor 目录中。

## 编辑器运行时依赖

CodeMirror、Lezer、Markdown-it 及其解析依赖使用 MIT 许可。插件 ZIP 解析使用 fflate，许可为 MIT。DOMPurify 提供 Apache-2.0 / MPL-2.0 双许可，分发的完整许可来自依赖包。

具体包与版本由 `package-lock.json` 固定。构建脚本根据实际打包模块复制每个运行时组件的完整许可至 `entry/src/main/resources/rawfile/web/licenses/`，并提供应用内“设置 → 开源许可”查看入口。上游版权与许可均随 HAP 保留。

## Android 原生依赖

AndroidX Core `1.16.0`、AndroidX WebKit `1.14.0` 及其传递依赖来自 Google Maven，使用 Apache License 2.0。完整许可位于 `android/APACHE-2.0.txt`，安卓资源构建时加入应用内开源许可。Gradle Wrapper 使用 Gradle `8.13`（Apache-2.0），构建工具 AGP `8.13.2` 仅用于构建。Android 系统 WebView 和鸿蒙 ArkWeb 由设备提供。


## LaTeX 与 PDF

- WasmTeX 0.1.1（MIT）：https://github.com/bofeizhu/wasmtex 。npm 客户端与 Worker 来源固定于 package-lock.json。
- TeX Live 2026 / BusyTeX WebAssembly 资源采用上游 0.1.1 发行快照，文件 SHA-256 由 vendor/wasmtex/manifest.json 固定。仅打包 core、XeTeX / pdfTeX 格式及提取的中文宏包插件，没有完整 academic 资源。
- TeX Live 聚合了具有 LPPL、GPL、MIT、BSD、字体许可等不同许可的独立组件；版权、许可证、对应源码来源与重新分发说明见 vendor/wasmtex/NOTICE、THIRD_PARTY_NOTICES.md、licenses.json。它们作为独立虚拟文件系统数据和 Worker 引擎分发，未更改其源代码或许可证。
- 中文宏包包含 ctex / xeCJK / fontspec 等及 Fandol 字体，保留其 LPPL / GPL 字体例外等许可及原始文件名。ZIP 内附许可清单和上游第三方声明。
- PDF.js / pdfjs-dist 4.10.38：Apache-2.0，https://github.com/mozilla/pdf.js 。标准字体、CMap 的许可随资源目录分发。
- KaTeX：MIT，https://github.com/KaTeX/KaTeX ，用于 Markdown 数学公式。完整许可随应用资源保留。

## Windows

- Electron 44.5.1（MIT）：https://github.com/electron/electron 。Windows 安装包与 ZIP 中保留 `LICENSE.electron.txt`、`LICENSES.chromium.html`，涵盖 Chromium、Node.js 及其第三方组件。
- electron-builder 26.15.3（MIT）：https://github.com/electron-userland/electron-builder ，仅用于 Windows 构建与打包。
