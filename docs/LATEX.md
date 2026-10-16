# LaTeX 与本地 PDF 编译

Vela 使用 WasmTeX 0.1.1 的真实 XeTeX / pdfTeX、TeX Live 2026 核心资源、BibTeX8、MakeIndex 和 xdvipdfmx。计算在独立 Worker 中进行，不上传源码，不需要服务器。Markdown 公式单独使用 KaTeX；`.tex` 文档预览由编译得到的 PDF 渲染。

1. 新建工作区并创建 `main.tex`（新文件自带 ctexart 文档结构），也可导入已有 TEX 工程。
2. 在预览中选 XeLaTeX（推荐中文）或 pdfLaTeX，然后点击“编译 PDF”（Ctrl+Enter）。
3. 查看问题列表（错误、警告与文件 / 行号），点击即可跳到源码。错误同时显示在编辑器的行号旁。修复后重新编译。
4. 编译成功后可滚动查看全部页面并“导出 PDF”，各端使用系统保存对话框。

## 编辑

- **补全**：输入 `\` 加字母即弹出约 80 个常用命令，按结构、文字、中文（ctex）、引用、浮动体、数学等分组，带参数占位，Tab 跳到下一个占位。补全还覆盖以下参数位置：
  - `\begin{` 补全整个环境，含正文模板和对应的 `\end`（itemize、figure、table、tabular、align 等约 20 个）。
  - `\end{` 优先给出当前未闭合的环境。
  - `\ref{` / `\eqref{` 给出工程内所有 `\label`；`\cite{` 给出 `.bib` 和 `\bibitem` 的条目。
  - `\usepackage{` 给出常用宏包和已安装的宏包插件；`\documentclass{` 给出文档类。
  - `\input{` / `\include{` 给出工程内的 TEX 文件；`\includegraphics{` 给出图片。
- **自动闭合**：在 `\begin{环境}` 行尾按 Enter，自动插入缩进的空行和 `\end{环境}`；列表环境会预填 `\item`。
- **快捷键**：Ctrl+B `\textbf{}`、Ctrl+I `\emph{}`、Ctrl+M `$…$`（有选区时包裹选区）。
- **即时检查**（不需编译）：右花括号多余或左花括号未闭合、`\begin` / `\end` 不匹配或缺失、重复的 `\label`、主文件缺少 `\begin{document}`。注释、`verbatim` 类环境和 `\verb` 不参与检查。
- **大纲与折叠**：章节目录按 `\part`…`\paragraph` 列出排版后的标题并按层级缩进；`\begin…\end` 环境和章节可在行号旁折叠。

## 预览

- 编辑时所有页面排成一列滚动，只绘制可见附近的页面，大文档也不会一次占用全部内存；重新编译后保持原来的阅读位置。缩放有 −、+ 和“适合宽度”，缩放比例会被记住。
- **自动编译**（默认关闭，开关会被记住）：停止输入 2 秒后自动编译；编译期间又有修改，会在本次结束后再编译一次。适合分栏预览（设置中的“分栏预览”，宽度 ≥ 1000 px）。
- **源码 ↔ PDF 定位**：WasmTeX 目前不生成 SyncTeX，文舟按文字匹配定位。
  - “定位到 PDF”（Ctrl+Alt+J）找到光标所在行印出的文字，滚动到对应页并短暂高亮。
  - 在 PDF 上双击文字，跳到打印这段文字的源码行：先找当前文件，再找工程内其他 TEX 文件。
  - 纯公式、表格内容或被宏改写的文字可能找不到，这时会在状态栏提示。
- 阅读模式仍按整页翻页（单页或双页）。

## 工程、宏包与限制

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

轻量构建提供相同的离线编译能力，但需要先安装 LaTeX 排版组件（一个包，含引擎和中文支持）：在“插件与组件”里在线下载，或从 ZIP 安装。导入、校验及构建方法见 [构建与发布检查](BUILD-AND-VERIFY.md)。
