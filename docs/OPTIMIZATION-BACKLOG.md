# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取一项未完成的工作，完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| O5b | 地图笔刷绘制/擦除（`map-view.mjs` 的 stroke）、地图整理（`map-algorithm-view.mjs`）、信息点编辑（`map-point-editor.mjs`）仍整张复制；可按实际改动的 cells/drawing/markers 改为部分快照 | 上述文件 | 撤销行为不变，测试通过 | 待做 |
| O6 | 英文模式改为源头输出：逐模块把界面文字改为 `t()`（固定文字）或 `say(zh,en)`（带变量的句子，均由 `i18n.mjs` 导出），补齐词典；**同一模块顺带完成 O8 格式化**，写法参照 `update-view.mjs`（一条语句一行、长模板拆分）。每次 1–2 个模块。抛出的错误文字由显示处 `t(error.message)` 处理的，可保留中文但须有词典条目。全部迁完后移除 `i18n.mjs` 的 MutationObserver。已迁移：`update-view.mjs`、`component-download-view.mjs`。待迁移：`completion-core.mjs`、`completion.mjs`、`component-downloads.mjs`、`csv-embed.mjs`、`csv-insert.mjs`、`csv-model.mjs`、`document-components.mjs`、`extension-services.mjs`、`file-templates.mjs`、`git-login.mjs`、`gitea.mjs`、`github.mjs`、`glossary.mjs`、`latex-editor.mjs`、`map-arrows.mjs`、`map-symbols.mjs`、`map.mjs`、`noun-index.mjs`、`outline.mjs`、`palettes.mjs`、`planning-config.mjs`、`planning-transactions.mjs`、`platform.mjs`、`plugin-package.mjs`、`plugin-ui.mjs`、`plugins.mjs`、`project-archive.mjs`、`project-backend.mjs`、`project-contract.mjs`、`project-service.mjs`、`repository-pull.mjs`、`rich-text-editor.mjs`、`rich-text-styles.mjs`、`rich-text.mjs`、`selection-menu.mjs`、`shortcuts.mjs`、`start-page.mjs`、`sync-cleanup.mjs`、`sync-commit.mjs`、`sync-download.mjs`、`tex-component.mjs`、`ui-shell.mjs`、`vela-v2.mjs`、`workspace-backup.mjs`、`app.js` | 各模块 | `tests/i18n-coverage.test.mjs` 通过；模块相关浏览器测试通过；英文界面实际检查无中文残留 | 待做 |
| O8 | 格式化超长单行：随 O6 逐模块进行；没有界面文字的大文件（如 `map-renderer.mjs`、`outline-graph.mjs`）单独格式化，每次 1–2 个文件，只改排版不改逻辑 | 24 个含 >1500 字符单行的文件 | 格式化前后单元与相关浏览器测试通过 | 待做 |
| O10 | 漏翻译检查扩展到模板字符串与靠 DOM 翻译的裸中文（如 `map-symbols.mjs`、`latex-editor.mjs` 等未用 `t()` 的模块） | `tests/i18n-coverage.test.mjs` | 能发现模板与裸字符串中的缺失词条 | 待做 |

## 已完成

| 编号 | 事项 | 提交 |
| --- | --- | --- |
| O1 | 指南单元测试与文档一致 | 构建重新生成 `guide.mjs` |
| O2 | 浏览器测试统一通过 `tests/browser-launch.mjs` 启动 | `814b742` |
| O3 | `tests/i18n-coverage.test.mjs` 检查所有字面 `t()` 文字都有英文；补齐 110 条 | `58aa575` |
| O4 | HTML 阅读器改用 `reading-position.mjs` 的文字索引与位置测量，删除自带实现 | `b440792` |
| O9 | `rawfile/web` 移出 git，由 hvigor 的 PrepareEditor 在 HAP 构建前生成；新增 `npm run check:rawfile` 校验（Codex） | `d154ce5`，合并 `e36e4ae` |
| O5 | 地图常用编辑改为部分快照（`mapSnapshot`），撤销与回滚只处理改动部分；commit 不再序列化 cells/drawing 比较 | `966ddb6` |
| O7 | 五张样式表合并为按组件组织的 `style.css` 与 `editor.css`，同一选择器只定义一次；180+32 个场景计算样式零差异（Codex）；构建时压缩 CSS | `5f6d14d`，合并后续见提交记录 |
