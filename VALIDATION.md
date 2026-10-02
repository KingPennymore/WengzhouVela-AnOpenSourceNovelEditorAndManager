# 文舟 Vela 0.6.0 验证记录

2026-10-02，包名 `me.wenzhou.write`，鸿蒙 `0.6.0` / `10600`，安卓 `0.6.0-android.1` / `10600`。

- 90 项逻辑检查、65 项通用界面检查、4 项阅读位置检查、5 项真实 LaTeX / PDF 检查通过。
- 阅读检查覆盖手机与 1920px 大屏，左右 / 上下模式、章节跳转、字号调整、窗口变化、重开与刷新后的文本位置恢复。点击中间区域仅切换工具栏，左右区域翻页 / 滚动一屏；阅读默认关闭文件栏。
- 拉取检查覆盖固定 Git 提交、多选目录与后代、重叠选项去重、长按多选、保持当前页面与打开文件，相同路径覆盖。
- 插件检查包含真实 Acode Writer 1.0.4、包内资源、CodeMirror 扩展与补全、跨文件切换、事件清理、卸载抛出异常后仍移除资源。
- LaTeX 检查实际编译中文 ctexart / amsmath、导出 PDF、自定义宏包 ZIP、pdfLaTeX 与 BibTeX 多遍编译；编译失败保留源码和上一份 PDF，取消中断无限循环。
- 12 项 Android 16 专用模拟器实际 WebView 检查通过，包含中文 XeLaTeX、PDF canvas 和中文宏包持久缓存；6 项原生文件、事务恢复、编码、凭据与触控板检查通过。检查报告保存在本机 test-results/。
- 鸿蒙 ArkTS 与 Android release 构建通过；HAP / APP 和 APK / AAB 签名验证通过，沿用原发布签名。Android APK 使用 v2 / v3，16 KB 对齐检查通过；AAB 严格签名校验通过。
- 源码未发现 API 密钥、GitHub 令牌和私钥格式；源码包排除个人签名材料、构建缓存与测试设备文稿。TeX 资源构建时按上游清单验证 SHA-256，版权与许可随包分发。

## 实际范围

鸿蒙新增 Worker / WebAssembly 引擎与 HTML 阅读控制已通过编译及签名，尚无本轮鸿蒙真机运行验证。Android 验证设备为专用模拟器，未代表所有系统 WebView 与真实设备内存状况。LaTeX 不包含整个 CTAN；LuaTeX、Biber、shell-escape 和外部工具不可用。PDF 导出最大 32 MB；宏包和工程的总输入限制见 docs/LATEX.md。

## 0.6.0 发布后的源码更新（2026-10-02）

- HTML 在编辑区嵌入预览，顶栏与文件标签保留；回到源码后光标不变。Android 实际 WebView 检查包含本地 CSS、CSS `@import`、SVG / PNG、完整高度、手动 HTML 类型，以及嵌入脚本隔离和独立交互预览。鸿蒙对应 ArkTS / HAP 构建通过，尚待真机运行验证。
- `测试文件/` 提供 54 个阅读样例与两份 `.vela`。自动校验清单覆盖所有样例、嵌套工程根路径及全部相对 HTML 资源；书库实际显示全部 54 个阅读文件。
- 公开样例中的中文多文件工程使用 XeLaTeX 实际生成 PDF，包含本地宏包、BibTeX、MakeIndex 和交叉引用；英文样例使用 pdfLaTeX 实际生成 PDF。HTML、LaTeX、JavaScript、Python 和 JSON 的高亮及补全经过浏览器检查。
- 本次源码更新不替换既有 v0.6.0 Release 附件；上述新行为需使用更新后的源码构建。
