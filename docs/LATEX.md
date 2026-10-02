# LaTeX 与本地 PDF 编译

Vela 使用 WasmTeX 0.1.1 的真实 XeTeX / pdfTeX、TeX Live 2026 核心资源、BibTeX8、MakeIndex 和 xdvipdfmx。计算在独立 Worker 中进行，不上传源码，不需要服务器。Markdown 公式单独使用 KaTeX；`.tex` 文档预览由编译得到的 PDF 渲染。

1. 新建工作区并创建 `main.tex`，也可导入已有 TEX 工程。
2. 在预览中选 XeLaTeX（推荐中文）或 pdfLaTeX，然后点击“编译 PDF”。
3. 查看编译日志与可点击的文件 / 行号错误。修复源码后重新编译。
4. 编译成功后可查看各页并“导出 PDF”，两端使用系统保存对话框。

```tex
\documentclass{ctexart}
\usepackage{amsmath}
\begin{document}
\section{文舟}
开源小说创作与阅读。\[ E=mc^2 \]
\end{document}
```

首次编译自动安装内置中文宏包和 Fandol 字体，可离线使用。当前 `.vela` 所在文件夹作为工程根目录；没有配置时使用主 TEX 文件的父文件夹。子文件、参考文献、图片和字体保留相对路径。应将所有工程文件置于工程根目录内，使用 `\input{chapters/one.tex}`、`\includegraphics{cover.png}` 等相对路径。编译器自动处理必要的多遍编译、BibTeX8 和索引。

缺失宏包可以通过 [TeX 宏包插件](PLUGINS.md#tex-宏包插件) 导入 `.sty`、`.cls`、`.bst`、字体及其依赖。也可把宏包直接放入当前工程。工作区同名资源优先于插件；插件同名文件建议避免冲突。

支持完整 TeX 语法、宏展开和引擎提供的排版能力，而不是把少量命令转换为 HTML。未将整个 CTAN 打入应用：依赖非内置宏包的工程需先安装相应宏包。LuaTeX、Biber、PythonTeX、minted 的外部 pygmentize、shell-escape 和外部命令不支持；使用普通 listings / BibTeX 等兼容方案或在桌面 TeX 环境编译这些工程。单次工程与宏包输入上限 160 MB，PDF 导出上限 32 MB，原生单个导入附件上限 8 MB。

PDF 按页渲染以控制内存。只读阅读中的左右点击用于 PDF 翻页，双指用于调整页面阅读比例；正文的字号由 TEX 源码控制。普通 TXT / Markdown 阅读则直接调整文字字号。

引擎与 TeX Live 的许可分别保留，见 [第三方声明](../THIRD_PARTY_NOTICES.md) 和 `vendor/wasmtex/`。核心资源在构建时校验 SHA-256，不打包上游 500 MB 的完整 academic 资源。
