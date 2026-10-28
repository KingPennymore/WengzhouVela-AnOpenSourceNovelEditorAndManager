# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取一项未完成的工作，完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| O3 | 漏翻译检查：扫描界面代码中的中文字符串，词典（`web/i18n.mjs`、`web/planning-i18n.mjs`）缺词条的报出来 | 新增 `tests/i18n-coverage.test.mjs` | 单元测试能列出缺失词条；已知缺失补齐或列入允许清单 | 待做 |
| O4 | HTML 阅读器复用阅读定位代码 | `web/html-reader.js` 与 `web/reading-position.mjs`、`web/reading-marks.mjs` | html-reader 不再自带文字索引与位置测量；`tests/reading-browser.mjs` 等阅读测试通过 | 待做 |
| O5 | 地图操作改为增量撤销记录，不再每次提交前复制整张地图 | `web/map-view.mjs`、`web/map-tool-panel.mjs`、`web/map-history.mjs` 等 | 撤销/重做行为不变（`tests/map-*.test.mjs`、`tests/map-interaction-browser.mjs` 通过）；大地图每次操作不再 structuredClone 全量 | 待做 |
| O6 | 英文模式改为源头 `t()` 输出，最终去掉全页面 MutationObserver 翻译 | `web/i18n.mjs` 及各界面模块 | 分模块迁移；全部迁完后移除监听；英文界面检查通过 | 待做 |
| O7 | 合并五张互相覆盖的样式表 | `web/style.css`、`file-manager.css`、`ui.css`、`design.css`、`refinement.css` | 计算样式逐元素零差异 | 分支 `refactor/css-layers`（Codex） |
| O8 | 逐步格式化超长单行代码 | 24 个含 >1500 字符单行的文件 | 每次只格式化本次改动涉及的文件，扩大 Prettier 覆盖范围 | 待做 |
| O9 | 构建产物自动化与一致性校验 | `entry/src/main/resources/rawfile/web`、`scripts/` | 构建产物与提交内容不再矛盾，有校验脚本 | 分支 `build/rawfile-artifacts`（Codex） |

## 已完成

| 编号 | 事项 | 提交 |
| --- | --- | --- |
| O1 | 指南单元测试与文档一致 | 构建重新生成 `guide.mjs` |
| O2 | 浏览器测试统一通过 `tests/browser-launch.mjs` 启动 | `814b742` |
