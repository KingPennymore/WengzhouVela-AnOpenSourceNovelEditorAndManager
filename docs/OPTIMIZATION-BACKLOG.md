# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取一项未完成的工作，完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| O5b | 地图笔刷绘制/擦除（`map-view.mjs` 的 stroke）、地图整理（`map-algorithm-view.mjs`）、信息点编辑（`map-point-editor.mjs`）仍整张复制；可按实际改动的 cells/drawing/markers 改为部分快照 | 上述文件 | 撤销行为不变，测试通过 | 待做 |
| O6 | 英文模式改为源头 `t()` 输出，最终去掉全页面 MutationObserver 翻译 | `web/i18n.mjs` 及各界面模块 | 分模块迁移；全部迁完后移除监听；英文界面检查通过 | 主会话进行中 |
| O7 | 合并五张互相覆盖的样式表 | `web/style.css`、`file-manager.css`、`ui.css`、`design.css`、`refinement.css` | 计算样式逐元素零差异 | 分支 `refactor/css-layers`（Codex） |
| O8 | 逐步格式化超长单行代码 | 24 个含 >1500 字符单行的文件 | 每次只格式化本次改动涉及的文件，扩大 Prettier 覆盖范围 | 主会话进行中 |
| O10 | 漏翻译检查扩展到模板字符串与靠 DOM 翻译的裸中文（如 `map-symbols.mjs`、`latex-editor.mjs` 等未用 `t()` 的模块） | `tests/i18n-coverage.test.mjs` | 能发现模板与裸字符串中的缺失词条 | 待做 |

## 已完成

| 编号 | 事项 | 提交 |
| --- | --- | --- |
| O1 | 指南单元测试与文档一致 | 构建重新生成 `guide.mjs` |
| O2 | 浏览器测试统一通过 `tests/browser-launch.mjs` 启动 | `814b742` |
| O3 | `tests/i18n-coverage.test.mjs` 检查所有字面 `t()` 文字都有英文；补齐 110 条 | `58aa575` |
| O4 | HTML 阅读器改用 `reading-position.mjs` 的文字索引与位置测量，删除自带实现 | `b440792` |
| O9 | `rawfile/web` 移出 git，由 hvigor 的 PrepareEditor 在 HAP 构建前生成；新增 `npm run check:rawfile` 校验（Codex） | `d154ce5`，合并 `e36e4ae` |
| O5 | 地图常用编辑改为部分快照（`mapSnapshot`），撤销与回滚只处理改动部分；commit 不再序列化 cells/drawing 比较 | 见本次提交 |
