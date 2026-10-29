# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取未完成的工作（Codex 有额度时分发给 Codex），完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| — | 暂无待做项。定时任务按说明自行审查 `web/`，把发现的问题先写成新条目再做 | | | |

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
| O12a | `config-v2-browser` 过时：设置按钮移入"更多操作"菜单，先点 `#more-tools`；离开阅读器改用 `#reader-back`。`palette`、`sample` 复测已通过，无需改动 | `9d80f1f` |
| O11 | 设置中实时切换中英文后界面无另一种语言残留：现有重绘（`renderHome`、`reader.localize`、`renderAppLabels` 等）加一次 DOM 翻译已覆盖；状态栏章节名属用户内容，加入跳过列表；新增 `tests/language-switch-browser.mjs` 覆盖编辑器、更多菜单、阅读/订阅/仓库视图与启动页 | `1e4a398` |
| O12 | 修复过时的浏览器测试：`pdf-layout`（编辑区 TeX 预览改为按宽度适配、容器内滚动，整页适配只查阅读模式）、`rich-text`（回收站行改为 `.trash-item`）、`workspace` 与 `windows`（刷新后保留当前文稿，不再跳回启动页）；`components`、`tex-lite` 在精简版构建下通过，完整版上直接提示先 `npm run build:lite`；`android`、`android-tex` 需要专用模拟器 `Wenzhou_QA_API36`。完整构建下全量 96 个套件除这 4 个外全部通过 | `96b672b`、`08507d4`、`29bbe15`、`a8e37cb`，及 `9d80f1f`（定时任务） |
| O13 | 检查 Codex 格式化加入的模板空白：启动页、最近文件、编辑器、更多菜单、设置、地图在 1280 与 390 宽度下，与迁移前（`317e77f`）逐元素比较位置尺寸零差异，无需改动 | 无代码改动 |
| O14 | 新增 `npm run test:browser`（`scripts/test-browser.mjs`）：自动起停 4173 的 dist 服务，依次运行全部浏览器套件并汇总；跳过安卓专用模拟器与性能压测套件，精简版套件只在精简版构建下运行；可传关键词只跑部分套件 | 见提交记录 |
