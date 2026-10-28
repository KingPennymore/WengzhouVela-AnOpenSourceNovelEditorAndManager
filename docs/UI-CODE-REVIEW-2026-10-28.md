# 页面代码审核（2026-10-28）

审核基线为 `6749b24`，包含本次 CSV 底栏调整。以下条目记录发现时的代码状态；已完成工作区修复，见下表。优先级：P1 为可能覆盖文稿内容的问题，P2 为功能错误或明确的性能风险，P3 为界面与复用方面的改进。

本次覆盖内置页面的入口、关键交互和相关共用模块，并抽查原生存储返回路径。采用静态检查和少量定点复现，没有运行完整测试矩阵，也没有做真机性能测量。下文明确区分实际复现与静态结论；未列出问题不代表该页面所有分支均已验证。


## 修复记录

| 编号 | 已实施的修改 |
| --- | --- |
| R01 | 页面退出时处理待保存内容；保存绑定并校验原文稿，后台路径更新原文稿 |
| R02–R03 | 缩放按当前编辑表面路由；行数变化统一清除旧显示排序 |
| R04 | 按完整 CSV 数据搜索，以行列坐标跳转、记录位置和批注；大表复用 Worker |
| R05–R06 | 单元格尺寸估算设固定采样预算；概览按双轴可见范围绘制，小地图底图缓存 |
| R07 | 宿主与阅读组件共用 PDF 像素和边长预算；页尺寸按 PDF 缓存，完成任务释放引用 |
| R08 | 三端批量接口每批最多 1000 项，元数据集中写入，只扫描一次；保留逐项冲突，I/O 失败回滚 |
| R09–R10 | 共用视图会话保护异步写入；下载任务与视图订阅分离，关闭解除回调，后台安装不抢占其他窗口 |
| R11 | 鸿蒙扫描、复制、移动保留 CSV 表头与格式元数据 |
| R12 | 术语库、书库、最近文件、VELA 书单与批注复用分批列表；分类统计和成员查询改为 Map / Set |
| R13 | 隔离 HTML 阅读页接收主题令牌，按钮至少 44 px，复用纯阅读几何计算，保留隔离域与 Shadow DOM |
| R14 | 修正格式存储说明；章节改为搜索列表和直接移动；写作与阅读共用批注筛选及批量删除；同屏术语面板改为滚动加载 |
| R15 | CSV 菜单统一管理焦点、键盘与销毁；宿主、规划、样式菜单复用键盘策略 |

验证结果：37 项相关逻辑检查通过；CSV 三种宽度、故障复现回归、组件下载与更新、VELA 配置、编辑与批注定向检查通过；Windows 原生刷新、删除、批量恢复检查通过。前端构建、安卓 Java 编译和鸿蒙 HAP 构建通过。未做三端真机验收，未运行完整测试矩阵。

## 覆盖范围

| 页面 / 区域 | 检查入口及相关模块 | 检查重点 |
| --- | --- | --- |
| 启动页、文件侧栏、文稿标签、文件操作、回收站 | `app.js`、`start-page.mjs`、`document-panels.mjs`、`workspace.mjs`、`file-manager.mjs`、`trash-view.mjs` | 列表重建、编辑器保留、批量操作、原生扫描 |
| TXT / Markdown / 代码 / HTML 预览 | `app.js` 的 `renderPreview`、`code-preview.mjs`、`html-preview.mjs`、`rich-text-editor.mjs`、`csv-embed.mjs` | 渲染上限、隔离、内容处理、工具栏 |
| CSV / TSV 编辑与阅读 | `csv-editor.mjs`、`csv-grid-editor.mjs`、`csv-grid.mjs`、`csv-model.mjs`、`reader.mjs` | 撤销、排序和行列操作、虚拟化、输入、搜索 |
| PCS 大纲、关系图 | `outline-view.mjs`、`outline-graph.mjs`、`outline-large-graph.mjs`、`outline-panel.mjs`、`outline-press.mjs` | 图形缓存、手势、详情面板、共享画布结构 |
| VLMP 地图及设置面板 | `map-view.mjs`、`map-tool-panel.mjs`、`map-point-editor.mjs`、`map-terrain-view.mjs`、`map-algorithm-view.mjs`、`map-directory.mjs` | 异步任务、图层操作、目录列表、面板生命周期 |
| VELA 配置、TXT 格式与命名样式 | `vela-view.mjs`、`vela-view-v2.mjs`、`vela-format-view.mjs`、`format-style-panel.mjs` | 长书单、表单状态、旧描述、菜单 |
| 术语库与同屏词条面板 | `glossary-view.mjs`、`glossary-panel.mjs`、`glossary.mjs` | 延迟保存、分类统计、列表筛选、分页 |
| 阅读书库、正文、查找、批注 | `reader.mjs`、`reader-layout.mjs`、`reading-tools.mjs`、`reading-position.mjs`、`reading-marks.mjs`、`html-reader.js` | 位置与全文搜索、虚拟化后的坐标、隔离视图风格 |
| LaTeX / PDF | `latex.mjs`、`latex-editor.mjs`、`pdf-preview.mjs`、`tex-component-view.mjs` | 取消、按需绘制、页尺寸、像素预算 |
| 仓库、文件浏览、提交 / 拉取 / 冲突、订阅 | `app.js` 对应入口、`subscriptions.mjs`、`sync-preview.mjs`、`sync-conflicts.mjs`、`sync-workflow.mjs` 等 | 异步状态、批量选择、差异按需加载 |
| 设置、历史、章节、工作区搜索、批注、导出 | `app.js` 对应弹窗、`editing-view.mjs`、`search-panel.mjs`、`app-core/font-settings.mjs` | 老表单交互、提示是否准确、共享能力 |
| 插件管理、在线组件、应用更新、插件页面挂载 | `component-download-view.mjs`、`update-view.mjs`、`plugin-ui.mjs`、`sidebar-views.mjs`、`document-components.mjs` | 跨页面异步回调、订阅清理、扩展边界 |
| 内置电子书阅读与制作组件 | `components/ebook-reader/main.mjs`、`pdf.mjs`，`components/ebook-studio/main.mjs`、`visual-editor.mjs` | 宿主与组件的重复策略、预览隔离、任务取消 |
| 共用界面层 | `ui-shell.mjs`、`planning-chrome.mjs`、`planning-sheet.mjs`、`app-choices.mjs`、`gestures.mjs`、`planning-viewport.mjs`、`motion.mjs`、`app-core/command-bus.mjs` | 快捷键优先级、菜单行为、可抽取能力 |

## 已复现的功能问题

### R01 · P1 · 术语库延迟保存会覆盖刚切换到的其他文稿

位置：`web/glossary-view.mjs:25`、`:31`；`web/app.js:601`。

术语库输入使用 700 ms 延迟保存；离开页面时没有取消或提交该计时器。宿主的 `onSave` 直接使用全局 `view`，没有检查原文稿身份。编辑词条释义后立即切换到 TXT，计时器会把术语库 JSON 写入这个 TXT，并执行保存。

定点复现中，当前标题为 `audit.txt`，正文从 `KEEP THIS TEXT` 变成了含 `new draft` 释义的术语库 JSON。当前会话可尝试撤销，但这不能代替修复。

建议先修复：保存回调捕获并核对原文稿，页面卸载统一处理待保存草稿；如允许后台保存，应更新原文稿的文档会话，不能对切换后的编辑器执行替换。

### R02 · P2 · 表格缩放快捷键被全局字号快捷键截获

位置：`web/app-core/command-bus.mjs:129`、`:142`；`web/app.js:1072`；`web/csv-grid-editor.mjs:163`。

全局处理器在捕获阶段截获 Ctrl+- / Ctrl+= / Ctrl+0 并停止传播；CSV 的处理器在冒泡阶段，无法执行。实测 Ctrl+- 后表格仍为 100%，全局字号却由 16 px 变为 15 px，还会进入偏好设置的保存流程。

建议共用命令分发按当前编辑表面路由缩放，明确 CSV 画布、PDF、阅读字号、正文编辑的优先级。

### R03 · P2 · 只改变显示顺序后，通过右键插入行会漏显原有记录

位置：`web/csv-grid-editor.mjs:208`、`:221`；`web/csv-editor.mjs:110`。

显示排序保存的是物理行索引。底栏新增行会清除排序，但右键插入行不会更新或清除 `sortOrder`。插入后仍用原先的索引数组，新增行挤占一个旧索引，最后一条记录不再显示。

复现：三行 `z / a / m` 仅显示升序，再在 `a` 下方插行，源码为四行，而挂载的行索引仅为 `[1,2,0]`，包含 `m` 的第 3 行消失。文件数据仍在。

建议让所有行结构操作通过统一入口失效或重算显示排序；不要分别在底栏和右键菜单维护这项规则。

### R04 · P2 · 表格阅读页的“全文搜索”实际只搜索初始可见区域

位置：`web/reader.mjs:75`、`:81`；`web/reading-tools.mjs:7`；`web/csv-grid.mjs:171`。

阅读页把虚拟网格当前的 `content.textContent` 当作全文。300 行 CSV 中，第 300 行的唯一词 `OFFSCREEN_NEEDLE` 在源码中存在，阅读页全文搜索却返回零条。后续滚动又会替换格子 DOM，原先的字符索引和字符型批注位置也不适合继续沿用。

建议 CSV 使用完整数据模型搜索并以行列坐标跳转；位置和批注采用稳定的单元格坐标。纯文本阅读的 DOM 字符索引保留给对应的文本表面。

### R05 · P2 · 合法的超多行单元格会使预览抛出 RangeError

位置：`web/csv-grid.mjs:19`。

估算列宽时对单元格的所有文本行使用 `Math.max(n, ...lines)`。一个约 300 KB、含 15 万次换行的单元格就能超过函数参数数量限制，实测抛出 `RangeError: Maximum call stack size exceeded`。这类带引号的 CSV 完全可能在 8 MB / 20 万格上限内。

建议逐项计算最大值，并限制用于宽度估算的行数与字符数。行高只需识别前三档，无须拆分出所有文本行。

## 静态检查确认的性能与生命周期风险

### R06 · P2 · CSV 小地图每次平移都重扫数据，横向遍历没有像素级上限

位置：`web/csv-grid.mjs:174`、`:186`、`:205`、`:228`。

`paint()` 每次调用 `paintMinimap()`，后者重新设置 canvas 尺寸并重画整表。采样只减少行数，每个采样行仍循环全部列。小地图没有按文档修订缓存，因此纯平移也重新扫描数据；极宽表的工作量仍与列数有关。

建议小地图底图按模型、列宽、主题缓存，平移只更新视口框；概览采用横纵双向聚合或预先构造的占用图。此项已确认调用路径，未测量真机帧率。

### R07 · P2 · 主 PDF 预览没有采用电子书组件已有的画布像素预算

位置：`web/pdf-preview.mjs:102`、`:114`；对照 `components/ebook-reader/pdf.mjs:6`。

宿主只把设备像素比限制到 2，未限制最终 `canvas.width × canvas.height`。宽窗口、高倍缩放或极端页面比例可产生很大的画布；同仓库电子书阅读组件已经用 1600 万像素预算约束密度。连续模式另有 `web/pdf-preview.mjs:90` 的每次重排逐页 `getPage()`，缩放和窗口变化都会重复读取全部页尺寸。

建议共用像素预算计算、取消判定等纯逻辑，缓存每份 PDF 的原始页尺寸；宿主连续布局与组件单页布局分别保留。没有用巨大 PDF 做破坏性压力测试。

### R08 · P2 · 原生回收站批量操作仍然每项重扫整个工作区

位置：`web/app.js:754`；`windows/storage.mjs:196`、`:198`；`android/app/src/main/java/me/wenzhou/write/WorkspaceFiles.java:473`、`:495`；`entry/src/main/ets/services/WorkspaceFiles.ets:495`。

前端逐项调用 `restoreTrash`，三端原生实现均在每项结束时返回 `scan()`。恢复或永久删除 K 项，就扫描并回传 K 次完整文件列表和正文。浏览器后端已有批量调用，原生路径没有对应能力。

建议原生提供批量 IDs 接口，集中处理记录和事务，最后只扫描、回传一次，并保留逐项失败信息。不能仅通过减少前端 DOM 更新解决这项成本。

### R09 · P2 · 更新检查的异步结果可能覆盖后来打开的其他对话框

位置：`web/update-view.mjs:12`、`:26`、`:40`；对照 `web/app.js:744` 的回收站版本校验。

检查更新等待网络后重新查询全局 `#dialog-body` 并写入，没有确认它仍属于本次更新检查。检查期间关闭对话框，再打开设置或其他窗口，旧结果就会覆盖新内容。进度回调同样按全局 ID 查找节点。

建议给共用弹窗提供会话令牌和销毁信号，所有异步写入验证所属会话；后台下载状态可保留，视图订阅必须解绑。

### R10 · P2 · 在线组件下载订阅没有卸载，重开窗口会累积回调

位置：`web/component-download-view.mjs:71`、`:87`、`:91`。

每次挂载都向运行中的 `job.listeners` 添加闭包，但只返回 `render`，没有 dispose 或删除监听的入口。重复开关组件列表会留下多个旧容器与宿主引用；失败和取消的 job 仍存于 Map，监听集合也继续保留。

建议任务对象与视图订阅分离，订阅返回解除函数，由对话框会话结束调用。保留后台下载不要求保留已关闭的页面对象。

### R11 · P2 · 鸿蒙外部改稿后可能丢失“首行为表头”设置

位置：`entry/src/main/ets/services/WorkspaceFiles.ets:8`、`:151`；`web/workspace.mjs:19`。

鸿蒙扫描手动重建 `StoredDocument` 时仅复制 `kind`、`delimiter` 等字段，没有复制 `csvHeader`。前端只在 id 和正文均未变化时复用旧对象，因此常规无变化刷新可能掩盖问题；外部修改 CSV 正文后，刷新采用新对象，表头设置会丢失。

建议把表格视图元数据加入三端一致的文档元数据契约，并覆盖外部改稿后的合并路径。此结论来自代码追踪，未在鸿蒙真机复现；CSV 原始 BOM / 换行字节是否保留是另一条链路，不能由这个元数据遗漏推断其丢失。

### R12 · P2 · 多个长列表独立实现，存在整页重建及平方级查找

位置：`web/glossary-view.mjs:37`、`:42`；`web/vela-view-v2.mjs:14`、`:15`；`web/app.js:544`。

术语库每次搜索输入都重建整个页面并恢复焦点，分类数量又逐分类过滤全部词条：分类多时为分类数乘词条数。VELA 书单在每项渲染中分别使用 `selected.includes()` 和 `available.includes()`，接近 5000 项时出现平方级成员查询；启动页最近文件也一次创建全部条目。

建议统一列表的筛选、选择、增量装载与空状态结构，先用 Set / Map 消除成员查找和分类统计的重复扫描；大列表采用窗口化或分段加载。不要把 CSV 的二维画布直接套给这些一维列表。

## 旧界面与复用方面的改进

### R13 · P2 · 独立 HTML 阅读页仍使用旧尺寸和硬编码配色

位置：`web/html-reader.js:14`、`:18`、`:42`。

隔离阅读页在 Shadow DOM 内单独写样式，顶部按钮宽 36 px、高 40 px，工具图标按钮 40 × 40 px，低于手机 44 px 的触控约定。浅深色使用固定绿 / 灰值，无法直接获得当前宿主设计令牌；外部样式更新也不会进入这个 Shadow DOM。

建议提取可打包到隔离页面的阅读 chrome 样式和纯排版计算，传入必要的主题令牌。保留隔离域、Shadow DOM 和禁止脚本 / 外链的现有边界，不共享宿主账号或原生桥接。

### R14 · P3 · 设置仍显示过时的 TXT 格式存储说明，部分管理功能保留旧表单形态

位置：`web/app.js:881`；对照 `web/vela-format-view.mjs:24`；`web/editing-view.mjs:7`、`:11`；`web/glossary-panel.mjs:24`。

设置中的 TXT 格式说明仍写“另存为同名 .vela 旁注”，而当前机制已存入作品配置 `.vela`。章节管理仍以章节下拉框、操作下拉框和数字位置组成；批注列表没有筛选与批量管理；同屏术语库仍按每页 40 条翻页，与独立术语库的搜索列表交互不同。

过时说明应直接修正。其余属于设计与能力改进建议，不能仅凭“没有批量操作”判定实现错误：可按使用频率优先统一章节移动、批注管理与同屏术语列表。

### R15 · P3 · 菜单行为可复用却分散实现，CSV 菜单的键盘能力尤其不足

位置：`web/ui-shell.mjs:44`；`web/planning-chrome.mjs:28`；`web/app-choices.mjs:17`；`web/csv-editor.mjs:136`；`web/csv-grid-editor.mjs:200`；`web/format-style-panel.mjs:41`。

这些位置分别处理打开关闭、外部点击、Escape、焦点、定位和箭头导航。CSV 的缩放菜单不主动移动焦点，右键菜单只有首项焦点，没有 PCS 更多菜单已有的方向键 / Home / End 导航。样式面板也有另一套定位与关闭监听。

建议抽取小型浮层控制器，统一定位、关闭、焦点恢复、键盘导航与 dispose；各菜单继续提供自己的条目，不引入包含所有业务的万能弹窗。

## 可复用能力与应保留的边界

| 能力 | 已有实现 / 候选调用方 | 建议 |
| --- | --- | --- |
| 画布手势与适应范围 | `bindPlane`、`fitPlanningPlane`，PCS / VLMP / CSV 已使用 | 继续复用。CSV 普通滚轮平移、PCS 滚轮缩放是有意差异，无须统一成相同行为 |
| 视图生命周期 | CSV AbortController、PCS graphDispose、插件 signal、回收站 dialogVersion | 给共用弹窗 / 预览挂载层提供统一信号及令牌，优先解决 R01、R09、R10 |
| 一维列表 | 术语库、书库、最近文件、VELA 书单、回收站、地图目录 | 共用筛选 / 选择 / 增量列表控制能力，卡片与条目样式各自保留 |
| 轻量菜单 | 宿主更多、规划更多、自定义选项、CSV 菜单、样式面板 | 统一浮层基础行为，保留 menu、listbox、dialog 不同语义 |
| PDF 渲染策略 | 宿主 `PdfPreview` 与组件 `PdfBook` | 共用像素预算、任务取消和页尺寸缓存策略；资源路径和加载方式通过参数传入 |
| 阅读纯逻辑 | `reader-layout.mjs` / `reading-position.mjs` 与 `html-reader.js` 的独立计算 | 可共用几何、位置恢复和 chrome 样式；禁止直接跨隔离域访问宿主 DOM / 桥接 |
| HTML 转义 | `app.js`、`csv-embed.mjs`、`lazy.mjs`、`component-download-view.mjs`、`update-view.mjs` 各有实现 | 可抽成无副作用的 HTML 工具；XML 导出和 Markdown 转义规则仍需区分，不作无条件合并 |
| 差异与冲突 | `sync-preview.mjs`、`sync-conflicts.mjs` 已共用，历史窗口另有简版 | 复用差异数据与渲染选项即可，保留历史和远端冲突的不同操作语义 |

审核中未把已有的大纲大小图双路径视为重复缺陷：小图与虚拟化大图有不同的渲染成本，大图还设有缓存数量预算。地图算法已有 Worker 与取消路径，代码高亮已有 200K 字符上限，差异预览按展开加载；这些现有边界值得保留。

另核实了两处容易误判的代码：旧页面部分中文由全局 i18n 观察器翻译，不能仅据缺少局部 `t()` 调用判定全部失效；自动更新设置另有共用表单提交监听，不能仅据设置回调中的 Windows 分支判定安卓开关无效。

## 建议处理顺序与本次验证

1. 先处理 R01 的文稿覆盖风险。
2. 处理 R02–R05 的已复现功能错误，以及 R09–R11 的生命周期 / 元数据遗漏。
3. 处理 R06–R08、R12 的性能成本，并把上述修复形成的共用能力逐步抽取。
4. 处理 R13–R15 的阅读风格、旧管理表单与菜单一致性。

本次实际运行：CSV 网格定向回归（含新按钮顺序、图标、删除行列、撤销）；CSV 浏览器检查 320 / 390 / 1100 px；五项问题的一次定点浏览器复现；`npm run build`。已查看手机与桌面截图。没有运行全量测试、长时间压力测试或三端真机验收。

复现结果保存在本地 `test-results/ui-audit-results.json`；临时复现脚本在 `test-results/ui-audit-probe.mjs`。两者属于本地审核输出，未加入正式回归测试；后续修复各项时再补相应的断言。
