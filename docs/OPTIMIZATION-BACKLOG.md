# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取未完成的工作（Codex 有额度时分发给 Codex），完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| O11 | 英文与中文之间实时切换时，已用 `t()`/`say()` 渲染的内容不会随之改变（`setLanguage()` 只按词典重译屏上文字，`say()` 句子和已是英文的节点不会还原为中文），要等对应界面重新渲染。应在切换语言后重绘当前视图（启动页、侧栏、编辑器状态栏、打开的面板），或在保存后重新载入 | `web/app.js` 设置保存处（`setLanguage` + `renderAppLabels`）、`web/i18n.mjs` | 中→英、英→中各切换一次后，可见界面无另一种语言残留；有浏览器测试覆盖 | 待做 |
| O12 | 修复 master 上就已失败的浏览器测试：`android`、`android-tex`、`config-v2`（设置按钮被隐藏）、`palette`（输入处理已过时）、`pdf-layout`、`rich-text`、`sample`、`windows`、`workspace`（刷新本机文件夹后第 91 行超时）。`components` 与 `tex-lite` 需要精简版构建（`VELA_BUILD_FLAVOR=lite`），先确认在精简版下能否通过。逐个判断是测试过时还是功能缺陷，每次 1–2 个 | `tests/*-browser.mjs` 及相关模块 | 对应测试在完整构建（或其指定构建）下通过 | 待做 |
| O13 | Codex 格式化时在若干 HTML 模板里加入了换行与缩进（如 `start-page.mjs`、`update-view.mjs` 风格的多行模板），元素之间多出空白文本节点。确认行内排列的按钮、徽标等没有因此多出间距；有影响的地方去掉标签之间的空白 | O6 迁移过的视图模块 | 主要界面（启动页、设置、文件管理、地图面板）截图与 master 对比无间距变化 | 待做 |

## 已完成

| 编号 | 事项 | 提交 |
| --- | --- | --- |
| O1 | 指南单元测试与文档一致 | 构建重新生成 `guide.mjs` |
| O2 | 浏览器测试统一通过 `tests/browser-launch.mjs` 启动 | `814b742` |
| O3 | `tests/i18n-coverage.test.mjs` 检查所有字面 `t()` 文字都有英文；补齐 110 条 | `58aa575` |
| O4 | HTML 阅读器改用 `reading-position.mjs` 的文字索引与位置测量，删除自带实现 | `b440792` |
| O9 | `rawfile/web` 移出 git，由 hvigor 的 PrepareEditor 在 HAP 构建前生成；新增 `npm run check:rawfile` 校验（Codex） | `d154ce5`，合并 `e36e4ae` |
| O5 | 地图常用编辑改为部分快照（`mapSnapshot`），撤销与回滚只处理改动部分；commit 不再序列化 cells/drawing 比较 | `966ddb6` |
| O5b | 笔刷绘制/擦除只快照 cells（擦除另含 markers/symbols/arrows/generated），信息点编辑只快照 markers 或 cells，地图整理的边界/精简只快照 generated 或 cells（地形转换整体替换地图，仍整张复制）；`commit` 重算绘制填充前用 `extendSnapshot` 补入 generated，修复 O5 后修改绘制范围再撤销不还原填充的问题；新增 `tests/map-snapshot-browser.mjs` | `31784f4` |
| O7 | 五张样式表合并为按组件组织的 `style.css` 与 `editor.css`，同一选择器只定义一次；180+32 个场景计算样式零差异（Codex）；构建时压缩 CSS | `5f6d14d`，合并后续见提交记录 |
| O6 | 英文改为源头输出：`web/` 与 `web/app-core/` 全部模块的界面文字改用 `t()`/`say()`，词典按区域拆到 `web/i18n-*.mjs`（约 1000 条新词条）；词表、LaTeX 片段、存储用的默认名等数据用 `i18n-data` 注释标出；移除 `i18n.mjs` 的 MutationObserver，`setLanguage()` 只对静态外壳和当前屏幕翻译一次（Codex 分 7 批完成，审查合并） | `44f267f` 至 `2063325`（分支 `optimize/i18n`） |
| O8 | 随 O6 逐模块格式化（一条语句一行、长模板拆分）；`web/` 下已无超过 1500 字符的单行（生成的 `guide.mjs` 与词典除外） | 同 O6 |
| O10 | `tests/i18n-coverage.test.mjs` 用 TypeScript 解析器检查：`t()` 的字面量与条件分支都有词条、`say()` 英文部分无中文、所有模块不含未经 `t()`/`say()` 且不在词典里的中文、`index.html` 静态文字都有词条 | `46d10da`、`010b421`、`2063325` |
