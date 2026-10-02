# 文舟公开测试工作区

所有人物、故事、代码和配置均为虚构测试数据，不含账户、令牌、设备标识或个人文件。

## 如何使用

1. 在文舟 GitHub 页面拉取本仓库的“测试文件”文件夹，或订阅本仓库后选择“仅拉取阅读清单”。保留文件的相对路径。
2. 阅读页应出现清单中的所有测试文稿；打开 TXT 切换上下 / 左右阅读，测试章节目录、字号和阅读进度恢复。
3. 打开 HTML/index.html，点击文件标签右侧“预览”。页面嵌入源码区，顶栏和文件标签保留；本地 CSS、CSS @import 和 SVG 封面应显示。
4. HTML/交互测试.html 的脚本仅用于独立预览；开启脚本后点击计数按钮。嵌入预览默认不执行脚本、不联网。
5. 打开 LaTeX/main.tex，选择 XeLaTeX，编译并导出 PDF。中文、目录、公式、多文件导入、自定义宏包、文献与索引都应显示。LaTeX/latin.tex 可使用 pdfLaTeX。
6. 打开代码文件，在源码视图输入前缀，再按 Ctrl+Space 查看补全；Enter 接受、Esc 关闭，Tab 仍为两个全角空格。检查关键字、字符串、注释与标签的高亮。
7. CSV 测试逗号、引号、空值和多行单元格；TSV 测试制表符分隔；Markdown 测试表格、任务列表、公式及代码块。

代码文件供高亮、补全与只读显示测试，文舟不会执行这些程序；补全包含语言提供器、常用关键字和文稿词语，不能替代 IDE 的工程语义分析。

LaTeX/macros/vela-demo.sty 为自包含宏包示例，可放在工作区直接使用。将其打包为插件的方法见仓库 docs/PLUGINS.md。LaTeX 子目录有独立 .vela，确保 TEX 工程根路径正确。

## 文件目录

- 正文/航路.txt
- 正文/设定.md
- 正文/人物.csv
- 正文/年表.tsv
- HTML/index.html
- HTML/styles/page.css
- HTML/styles/palette.css
- HTML/assets/cover.svg
- HTML/交互测试.html
- HTML/scripts/counter.js
- LaTeX/main.tex
- LaTeX/chapters/story.tex
- LaTeX/macros/vela-demo.sty
- LaTeX/references.bib
- LaTeX/latin.tex
- 代码/example.js
- 代码/example.ts
- 代码/example.jsx
- 代码/example.tsx
- 代码/example.py
- 代码/example.json
- 代码/example.json5
- 代码/example.jsonl
- 代码/example.xml
- 代码/example.yaml
- 代码/example.toml
- 代码/example.ini
- 代码/example.css
- 代码/example.scss
- 代码/example.less
- 代码/example.sass
- 代码/example.sh
- 代码/Example.java
- 代码/example.c
- 代码/example.h
- 代码/example.cpp
- 代码/example.hpp
- 代码/Example.cs
- 代码/example.rs
- 代码/example.go
- 代码/example.kt
- 代码/example.sql
- 代码/example.php
- 代码/example.rb
- 代码/example.lua
- 代码/example.r
- 代码/example.swift
- 代码/example.vue
- 代码/example.svelte
- 代码/example.diff
- 代码/Dockerfile
- 代码/Makefile
- 代码/CMakeLists.txt

顶层 .vela 与 LaTeX/.vela 记录阅读清单、字号和标题模板。工作区测试清单包含所有可阅读样例，不包含配置文件本身。
