# UI 重构阶段 4：启动页验证

工作区 `D:/Wenzhou-worktrees/codex-ui-4`，分支 `codex/ui-4`，实现基准 `5dacd8d`。仅在此工作区构建、测试与提交。

## 页面与状态

- 启动页顶部为 `.ui-card` 继续写作卡片，显示最近访问的写作文稿、所在章节和今日字数。`workspace.settings.lastWritingId` 只记录文稿 ID；光标沿用 CodeMirror `editorStates`、现有 `workspace.editorPositions` 和 `.vela` 位置恢复，不新增光标存储。恢复后再编辑、返回、重载均有浏览器覆盖。
- 最近 5 个非 `.vela` 文稿直接使用 `.ui-list-row` 展示名称、所在文件夹和修改日期，按修改时间降序、同时间按 ID 排序。“最近文件”展开完整文件列表（包括配置文件），继续使用原增量列表、`[data-recent]`、Escape/系统返回及返回按钮；原有功能入口均可到达。
- 首次安装以 `workspace.settings.startWithEmptyHome` 标记展示 `.ui-empty` 新建/导入空状态，保留内置指南并通过“操作指南”入口打开。已有用户工作区的启动行为不迁移；无文件时也展示空状态。
- 原八张同等卡片改为次要按钮网格。新建、导入、最近文件、Git、指南、命令、扩展、设置沿用原 action 处理。触屏粗指针或 Android/HarmonyOS 界面隐藏启动页的“命令与快捷键”，桌面保留。空状态中的新建/导入与下方网格去重。
- 阅读文件统计继续复用现有 `readable()`，包括 CSV、代码和组件文档；三个统计数为一行紧凑文字，使用设计变量、`.ui-button`、`.ui-card`、`.ui-list-row` 和 `.ui-empty`。去掉旧滑动双层面板、等大卡片、统计卡片和重复样式。界面字号至少 12 px，触控目标至少 44 px。
- 主导航在宽度 >=1100 px 显示写作/仓库/订阅/阅读文字；较窄时由现有 UIShell 布局隐藏标签，保留 title 与 aria-label。宽屏按钮使用内容宽度，避免英文标签互相遮挡；中英文切换已验证。
- 阶段 3 跟进：手机格式栏的“样式”按钮只显示图标，保留原可访问名称、工具提示和处理函数，移除会截断的文字与装饰箭头。

## 今日字数口径

存于 `workspace.settings.writingDay = {date: 'YYYY-MM-DD', count: n}`，日期为设备本地日历日期，不写入文稿。每次包含用户输入或删除的编辑更新，计算插入与删除文本的非空白 Unicode 码点差值，只累计正差值。中文、标点、源码字符均按一个码点计；emoji 按码点计。删除不扣已累计值，撤销/重做不增加，加载、程序写入和后台修改不增加；相同长度替换不增加。

记录通过现有工作区保存管线持久化。编辑后的首次操作、进入启动页、午夜定时器和恢复页面可见时检查日期，跨日重置。视图会话清理定时器、可见性监听、增量列表和帧任务；异步加载检查会话与工作区，切换文稿后释放启动页 DOM。

## 首屏依赖与大小

`start-page.mjs` 从静态导入改为现有 `lazy()` 加载器管理；仅需要首页时在 logo 阶段预取，logo 退出后才挂载；模块加载失败显示现有可重试错误界面。章节索引推迟到卡片挂载后的帧，不阻挡主卡片 DOM 建立。没有新增第三方库或新的静态模块。

按 `dist/app-metafile.json` 从 `web/app.js` 入口遍历非 dynamic-import 的输出依赖，去重并求和，单位为构建后未压缩字节：

| 指标 | 修改前 | 修改后 | 差值 |
| --- | ---: | ---: | ---: |
| 静态导入链 | 1,201,498 B | 1,199,662 B | -1,836 B |
| app.js 入口文件 | 502,254 B | 500,320 B | -1,934 B |

新增静态输入为空；`web/start-page.mjs` 移出静态链。对照和原始 metafile 保存于截图目录的 `bundle-comparison.json` / `before-metafile.json`。启动 logo 下延后创建正文、启动几何稳定、窄屏抽屉与主题、首用指南失败重试、首页模块失败重试均有对应测试。

## 验证记录

单测 `npm test`：519/519。`npm run check:core`：类型、ESLint、Prettier 全过。`npm run build` 完整版成功。4194 全量浏览器回归 93/98（770.3 秒）。五个失败均是旧的首次启动等待编辑器条件（项目插件、Windows 原生、章节导出、文件管理、界面综合）；按新空状态入口更新后，在 4194 端口相关套件复跑 6/6（35.4 秒），另 Windows 原生单套件通过，包括真实 TeX 编译。98 个套件均有通过记录，没有未解决的失败。全量后复核恢复原 `readable()` 阅读文件口径，并重新跑单测、构建和上述受影响套件，新增 CSV/代码文件统计检查通过；没有第二次全量扫跑。

相关套件已验证启动时序、移动启动、语言切换、首页、手机编辑页、壳层与侧栏。首次安装相关测试调整为先验证空状态，再从指南入口进入编辑器，保留 Tab、原生中文选区、指南内容、格式预览和加载失败重试等行为覆盖。新增 `tests/start-page-redesign-browser.mjs` 验证继续写作与光标、今日字数和午夜重置、最近列表与完整列表、空状态入口、粗指针隐藏命令、统计行高度、导航宽窄切换、深浅色与可访问尺寸。

CSS 等价性基准仍为 `43a519e`。180 场景比较范围内零差异、零不稳定项。具名豁免如下，代码均注明“阶段 4 有意改外观，合并后由 Claude 更新基准并移除豁免”：

- 三个 profile（windows/harmonyos/android）×两个宽度（1440/375）×浅深色的 `start`：12 个启动页场景，有意重做整个页面。
- windows/harmonyos/android 的 1440 宽，以下场景只排除 `.topbar .breadcrumb` 导航及文件名布局范围，其余 DOM 仍严格比较：`writing-txt`、`file-library`、`toolbar-menu`、`settings`、`trash`、`csv`、`csv-cell-editor`、`outline-tree`、`outline-detail`、`outline-graph`、`map`、`map-details`、`reader-library`、`reader`。浅深色共 84 个局部比较场景。
- android:375 的 `writing-txt`、`file-library`、`toolbar-menu`、`settings`、`trash`，只排除 `#format-style` 按钮内部的有意图标化差异；浅深色共 10 个局部比较场景。
- 其余 74 个场景完整严格比较。没有修改基准提交，没有扩大到编辑器或其他页面内容。

## 截图与边界

`test-results/ui-redesign/phase-4/index.html` 为 12 张截图总览：390×844 Android 有文稿/空状态、844×390 横屏、1280×850 与 1000×850 启动页/导航，另有 390 手机格式按钮修正；均为浅深色。目录包含 `results.json`、包大小对照和 `verification.json` 汇总，均保留在工作区的 Git 忽略目录供审查。

常规浏览器全量按项目规则跳过 Android 专项、轻量版专用和性能/压力套件；未制作安装包，未做真机软键盘测试。

## 修改文件

- `docs/validation/ui-redesign-phase-4-20261030.md`
- `tests/browser.mjs`
- `tests/chapter-export-browser.mjs`
- `tests/css-refactor-equivalence-browser.mjs`
- `tests/features-browser.mjs`
- `tests/file-manager-browser.mjs`
- `tests/lazy-chunks-browser.mjs`
- `tests/planning-feedback-browser.mjs`
- `tests/project-plugins-browser.mjs`
- `tests/start-page-browser.mjs`
- `tests/start-page-redesign-browser.mjs`
- `tests/ui-overhaul-browser.mjs`
- `tests/windows-browser.mjs`
- `web/app-core/workspace-startup.mjs`
- `web/app.js`
- `web/i18n-dictionary.mjs`
- `web/lazy.mjs`
- `web/start-page.mjs`
- `web/style.css`
- `web/ui-shell.mjs`
