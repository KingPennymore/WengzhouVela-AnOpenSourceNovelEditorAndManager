# UI 重构阶段 3：手机编辑页验证

工作分支：`codex/ui-3`。实现基准：`f2fe4b1`（阶段 2 合并 `54ee95a`）。工作区：`D:/Wenzhou-worktrees/codex-ui-3`。所有构建、测试和提交都在此工作区完成。

## 操作栏测量

测量可见顶栏、文件标签、格式工具、底栏与状态栏的纵向区间并集；格式工具嵌入顶栏/文件行时不重复计数。屏幕安全区为浏览器默认值。

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| Android 390×844，单文稿 TXT / MD | 217 px（53 + 40 + 44 + 52 + 28） | 96 px（顶栏 48 + 底栏 48） |
| Android 390×844，多文稿 | 217 px | 140 px（顶栏 48 + 标签 44 + 底栏 48） |
| Android 390×844，展开格式工具 | 217 px | 单文稿 96 px、多文稿 140 px；工具复用 48 px 顶栏 |
| Android 844×390 | 202 px | 单文稿 96 px、多文稿 140 px |
| Windows 1280×850 | 121 px | 121 px；顶栏 53、文件行 40、状态栏 28，正文顶部 y=93 |

原始数据：`test-results/ui-redesign/phase-3/before.json`、`results.json`。沉浸状态收起上下操作栏。

## 实现与入口

- `web/mobile-editor.mjs` 负责手机编辑页布局、选区/格式工具显示、输入节奏、跳转菜单、保存状态和光标可见性；文档编辑、跳转、保存和设置持久化仍调用宿主现有逻辑。事件绑定由应用会话的 `AbortController` 管理，帧任务及观察器有清理入口。
- 判定：宽度 <900 px，且 Android 界面或粗指针触屏。宽屏和窄屏精确指针桌面沿用原布局。地图、大纲、CSV、术语库和组件编辑器保留其专用工具栏。
- 单文稿隐藏标签行，顶栏显示 `#current-name`，保留双击重命名；多文稿显示 44 px 标签行。文本格式栏默认隐藏，非空选区或 Aa 展开，替代顶栏的导航区域；按钮 `mousedown.preventDefault()` 保持编辑器焦点与选区。文件和格式工具没有叠加高度。
- 底栏为撤销、重做、跳转、两行章节/字数摘要与可点按的保存状态。保存显示已保存/未保存/保存失败，沿用原 `#quick-save` 和保存管线。
- 跳转菜单保留四个原按钮 ID 及处理函数，增加目录入口转调 `#outline-toggle`；支持菜单方向键、Home/End、Escape/系统返回与焦点恢复。
- Git 在“更多 → 文稿操作”，通过 `#mobile-git` 转调原 `#quick-git`。原节点保持在原位，保留地图/大纲底栏依赖的挂载锚点。源码/预览/类型与同步状态也进入“更多 → 文稿操作”；底部插件扩展放入“更多 → 扩展功能”。搜索/术语/导出使用“更多”既有入口；快捷键与原处理函数继续生效。
- 2 秒内至少三次真实输入触发沉浸；组合输入结束后再收起。选区、向上滑动、上下 44 px 边缘点按、键盘收起、菜单/对话框、方向变化或关闭设置恢复。布局切换前后测量光标并校正滚动，随后通过 CodeMirror 最近可见滚动与 `visualViewport` 更新保持光标可见。
- 沉浸收起/恢复直接切换，无布局动画；减少动态效果下亦无动画。原导航过渡沿用动画模块，手机右侧目录/Aa 从右侧进出。
- “设置 → 编辑 → 沉浸写作”使用阶段 2 清单的开关，默认开启，修改立即保存。新增文案都有英文。手机可见操作按钮至少 44×44 px，标题重命名区域高 44 px；界面文字至少 12 px，包括格式栏和更多菜单。
- 阶段 2 跟进：手机设置分类图标固定 24 px 宽；“＋ 自定义配色”缩短为“＋ 自定义”，英文“+ Custom”，390 px 下保持一行。
- `host.current` 由延迟 getter 提供，避免应用启动过程中读取尚未初始化的当前文稿函数；浏览器测试断言页面没有运行时错误。

## 验证记录

`npm test`：519/519。`npm run check:core`：类型、ESLint、Prettier 全过。`npm run build` 完整版成功。4193 端口全量回归 96/97（828.8 秒），唯一失败为手机壳层测试把保留的隐藏 Git 节点也计入操作栏。改为只计可见按钮后，4193 端口 `npm run test:browser -- mobile-shell` 定向复跑 1/1（28.5 秒）。产品代码和构建均未改动，97 个套件均有通过记录，最终没有未通过套件。

首次全量回归的 11 个失败套件已分别在工作区内解包的 `f2fe4b1` 快照重建核对，11/11 基准通过；另补验手机壳层基准也通过，合计 12 个受影响套件。修复了手机控制器搬移 Git 锚点影响规划工具、CSS 覆盖横屏键盘规则、菜单标签换行，以及针对旧入口/隐藏按钮的断言；保留原行为覆盖。没有增加这几项失败的 CSS 豁免。

新增 `tests/mobile-editor-browser.mjs` 覆盖操作栏区间并集高度、单/多文稿与重命名、选区/Aa 与焦点、五项跳转及键盘菜单、保存及失败重试、各项沉浸恢复路径与光标可见、设置持久化、真实减少动态效果的触屏上下文、浅深色、44 px 按钮、12 px 文字、横屏与桌面几何。其他受影响测试只通过公开手机入口访问原功能。

CSS 固定基准仍为 `54ee95a`，没有移动基准。具名例外仅 `android:375`：

- `writing-txt`、`file-library`、`toolbar-menu`：手机编辑页有意改变外观。
- `settings`、`trash`：只排除变化后的编辑页背景，继续比较对话框本体。
- `settings` 的分类按钮及后代：仅允许固定图标宽度带来的 width/inline-size、flex-basis/flex-shrink、text-align、grid-template-columns、transform-origin/perspective-origin 派生差异。原因是本阶段明确要求修复分类名称左边缘对齐。

CSS 180 个场景通过：170 个完整严格比较，4 个只排除编辑页背景并继续比较对话框，6 个为具名手机编辑页豁免。比较范围内差异与不稳定项均为 0，页面错误为 0。代码已注明“阶段 3 有意改外观，合并后由 Claude 更新基准并移除豁免”。桌面、宽屏、窄屏精确指针、手机地图/大纲/CSV/阅读页面保持严格比较。

## 截图与边界

`test-results/ui-redesign/phase-3/index.html`：18 张浅深色截图的可点击总览。包含 390×844 单/多文稿、格式栏、跳转菜单、沉浸、844×390 横屏、1280×850 桌面，以及两个设置修正场景。`results.json` 保存几何与触控目标，`verification.json` 保存最终验证汇总。截图目录由 Git 忽略，保留在本工作区供审查。

没有 Android/HarmonyOS 真机软键盘验证；浏览器验证使用可控的 visualViewport 键盘模拟。常规全量按项目规则跳过 Android 专项、仅轻量版和性能/压力套件，已有 Windows 原生套件纳入全量。随入口调整的 Android/专项脚本未另行运行。本阶段不制作安装包。

## 修改文件

- `docs/validation/ui-redesign-phase-3-20261030.md`
- `tests/ai-assistant-browser.mjs`
- `tests/android-browser.mjs`
- `tests/android-samples.mjs`
- `tests/android-tex-browser.mjs`
- `tests/android-tex.mjs`
- `tests/app-core-chrome-motion-browser.mjs`
- `tests/app-core-editor-chrome-browser.mjs`
- `tests/app-tour.mjs`
- `tests/browser.mjs`
- `tests/css-refactor-equivalence-browser.mjs`
- `tests/csv-grid-regressions-browser.mjs`
- `tests/csv-tables-browser.mjs`
- `tests/csv-tables-windows.mjs`
- `tests/double-reading-browser.mjs`
- `tests/features-browser.mjs`
- `tests/file-manager-browser.mjs`
- `tests/fixes-0981-browser.mjs`
- `tests/improvements-browser.mjs`
- `tests/landscape-helper.mjs`
- `tests/large-planning-browser.mjs`
- `tests/latex-studio-browser.mjs`
- `tests/mobile-editor-browser.mjs`
- `tests/mobile-editor-helper.mjs`
- `tests/mobile-shell-browser.mjs`
- `tests/mobile-status-browser.mjs`
- `tests/pdf-layout-browser.mjs`
- `tests/planning-browser.mjs`
- `tests/planning-feedback-browser.mjs`
- `tests/planning-refinement-browser.mjs`
- `tests/preview-jump-browser.mjs`
- `tests/rich-text-browser.mjs`
- `tests/rich-text-formats-browser.mjs`
- `tests/sample-browser.mjs`
- `tests/selection-browser.mjs`
- `tests/settings-helper.mjs`
- `tests/shell-layout-browser.mjs`
- `tests/start-page-browser.mjs`
- `tests/tex-browser.mjs`
- `tests/tex-lite-browser.mjs`
- `tests/toolbar-sidebars-browser.mjs`
- `tests/ui-overhaul-browser.mjs`
- `tests/ui-review-regressions-browser.mjs`
- `tests/vela-format-page-browser.mjs`
- `tests/windows-browser.mjs`
- `tests/workspace-browser.mjs`
- `web/app-core/chrome-motion.mjs`
- `web/app.js`
- `web/i18n-dictionary.mjs`
- `web/mobile-editor.mjs`
- `web/settings-view.mjs`
- `web/style.css`
- `web/ui-shell.mjs`
