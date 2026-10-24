# 电子书制作插件 0.1.0

2026-10-19，Windows 本地构建；Chrome 无界面浏览器验证。宿主通用格式接口已先以提交 `c27a111` 推送到 `origin/master`。

## 实现与复用

- `components/ebook-studio`：独立安装包；支持 EPUB 导入与原始资源保留、`.vepub` 文本编辑源、书籍信息、XHTML/CSS、章节新增/改名/排序/移除、排版模板、章节预览、分页预览和 EPUB/MOBI 导出。
- epub-gen-memory 1.1.2（MIT）直接生成新书。构建时预编译其原始 EJS 模板，保留宿主 CSP。
- Paged.js 0.4.3（MIT）直接用于分页。可信引擎按需由宿主加载，绑定到禁止脚本执行的同源预览框架；书籍内容不能执行脚本，外部资源请求受 CSP 禁止。
- fflate（MIT）直接用于 EPUB 读取、资源保留及 ZIP 输出。
- iepub 1.3.7（MIT）直接用于 MOBI 写入。原始 crate 来源、SHA-256、上游提交和修改说明见 `vendor/iepub/VELA-SOURCE.json`。MOBI-only 构建不引入未使用的 EPUB/ZIP/CSS 依赖；WASM 无运行时导入。
- 插件打包包含 JavaScript 依赖许可、16 项 Rust 构建依赖声明、上游来源和 WASM 校验。Rust 源码摘要规范化换行，避免跨平台检出导致误报。
- 宿主补充：通过文稿 API 创建插件编辑源时持久保存格式标记，停用插件后仍可保留编辑源。

## 验证

`node --test tests/*.test.mjs vendor/acode-writer/tests/*.test.cjs`：392 项通过。

`node tests/ebook-studio-browser.mjs`：6 组通过：

1. EPUB 导入；保留原 CSS、图片、字体资源及未修改的嵌套目录；隔离预览图片可以显示，书籍脚本不执行。
2. 修改正文、作者、章节顺序和排版模板；输出包的 XML 良构、spine 顺序和样式引用正确。
3. 实际调用 iepub WASM 导出 MOBI，再由现有独立阅读器解析并读回中文正文。
4. 实际调用 Paged.js 生成页面；框架不允许脚本；移动端宽度不溢出。
5. 不完整 XHTML 作为草稿保存，重启后恢复，修正后才能写入有效章节。
6. 实际调用 epub-gen-memory 创建新书，进入编辑器并导出 EPUB。

单元验证还包含 4 MiB 嵌入资源、路径越界/百分号解码、加密 EPUB 拒绝、重复章节、源文件大小限制及跨 MOBI 记录边界的长篇中文与 emoji。

`tests/document-formats-browser.mjs` 和 `tests/epub-export-browser.mjs` 用于宿主接口及原有导出回归。

## 安装与边界

安装 `dist/plugins/Vela-Ebook-Studio-0.1.0.zip`；操作和构建说明见 `components/ebook-studio/README.md`。普通打包无需 Rust，使用随源码保留且经摘要验证的 WASM；重建用 `npm run build:ebook-mobi`。

编辑源限 8 MiB，较大的图片书可能超过限制。调整目录后生成平级目录。MOBI 为传统 v6 格式，复杂样式及现代媒体会简化。分页仅预览当前章节。首版不支持字体混淆、加密/DRM、AZW3/KF8、AZW4、KFX 或 SVG 固定版面正文；尚未进行实体 Kindle 和移动端真机验收。XML 良构检查不等于完整 EPUBCheck 验收。
