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
