# 代码优化待办

定时任务"文舟代码优化迭代"每次从这里取未完成的工作（Codex 有额度时分发给 Codex），完成后在本文件更新状态、补充新发现。每项写清现象、位置和完成标准。

## 进行中 / 待做

| 编号 | 事项 | 位置 | 完成标准 | 状态 |
| --- | --- | --- | --- | --- |
| O22 | 全量浏览器回归并行：`npm run test:browser` 串行跑 92 个套件需 40 分钟以上 | `scripts/test-browser.mjs`、`scripts/serve.mjs` | 支持 `--jobs N`（默认 3）并行；各路用独立 dist 端口或共享一个只读服务；依赖固定端口的套件串行；失败时输出断言的 actual/expected 与出错行（目前只显示末尾几行，`features-browser` 在全量回归中偶发失败一次、单独 10 次均通过，原因未知）；结果与串行一致，总时长降到 15 分钟以内 | 待做 |
| O26 | 启动加载总量：`app.js` 静态导入 45 个共享分包，启动共下载约 1,386 KB，`app.js` 本身只占 530 KB；需找出哪些共享分包只被延迟功能用到却被静态导入（例如被启动代码顺带引用的大模块），改为随功能加载 | `scripts/build.mjs`、`web/app.js` 的静态导入 | 用 `dist/app-metafile.json` 统计启动闭包（静态 import 链）并列出最大的共享分包及其来源；启动下载量减少 ≥200 KB，全量回归通过 | 待做 |
| O23 | `web/app.js` 顶层状态收拢：`workspace`、`view`、`home`、`isPreview`、`index`、`selectedFolder` 等顶层 `let` 被到处直接读写，拆分时只能传一堆 getter/setter | `web/app.js` | 引入一个状态对象，逐步替换直接读写；之后拆出预览渲染（`renderPreview`）、设置对话框、文件操作与回收站、启动流程 `boot`；每步行为不变、全量回归通过 | 待做（O21、O22 之后） |
| O24 | `web/project-service.mjs`（1700 行，主包内 39 KB）：找出启动时用不到的部分改为延迟加载，再按职责拆分 | `web/project-service.mjs` | 主包减小、行为不变、全量回归通过 | 待做 |
| O25 | 名词索引 worker 2.1 MB，主要是 `vendor/jieba/filter.mjs` 词表；只在使用时加载，优先级低 | `web/noun-worker.js`、`vendor/jieba` | 词表改为更紧凑的格式或压缩后按需解压，结果不变 | 待做 |

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
| O15 | O8 遗漏的超长单行：`map-algorithm-view.mjs`（第 10–12 行，最长 3039 字符）按语句与处理函数拆行、对话框模板拆成拼接片段；`map-view.mjs` 工具栏模板按区段拆分；`map-images.mjs` 的 `validateMapImages` 一条语句一行。三个文件 esbuild 压缩产物前后逐字节相同。`web/` 下超过 1500 字符的行只剩词典 `planning-i18n.mjs` | `23b5570` |
| O16 | `csv-embed.mjs` 删除与 `escapeHtml` 逐字相同的本地 `escape`，改为从 `text-utils.mjs` 导入 | `5729772` |
| O18 | worker 与独立 HTML 阅读器的打包不再带界面词典：它们从不切换语言，构建时把 `i18n.mjs` 换成 `web/i18n-worker.mjs`；四个文件合计 833 KB → 74 KB | `2be1f67` |
| O17 | `palette-browser` 偶发失败：一次 Ctrl+Alt+T 就会切换外观，但 `dark` 类要等淡入淡出开始才变，循环按键可能按两次切回原样；刷新前未等主题设置保存。改为等待类变化与保存 | `0174586` |
| O19 | 首屏主包延迟加载：Markdown 渲染、DOMPurify、使用指南、订阅、更新、组件下载、词汇表、项目归档改为首次使用时加载，`app.js` 836 KB → 525 KB（Codex）；归档能力补丁移到 `project-contract.mjs` 共用 | `5ba8f15`、`78c4108` |
| O20 | 拆分 `web/app.js` 第一批：配色编辑器、导出对话框、文件对话框（自己），GitHub 仓库视图、插件对话框、订阅同步（Codex），3203 → 2485 行；文件操作、回收站、预览渲染、设置与启动流程受顶层状态耦合限制，转入 O23 | `c51f62f`、`eaa7710`、`efa8c91`、`f39a2c7` |
| O18b | 主题切换有淡入淡出，`palette`、`workspace` 测试在保存配色或切换后立即读颜色会偶发读到旧值，改为等待颜色生效 | `33a9cc9` 及其后一个提交 |
| O21 | 英文词典按需加载：词典移到 `web/i18n-dictionary.mjs` 成为延迟分包，`setLanguage()` 改为异步，英文先等词典；启动下载量 1,575 KB → 1,386 KB（词典原在 `app.js` 静态导入的共享分包里） | `df010f6` |
