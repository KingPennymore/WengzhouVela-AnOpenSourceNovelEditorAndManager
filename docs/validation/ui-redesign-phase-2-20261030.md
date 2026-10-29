# UI 重构阶段 2：设置页验证

工作分支：`codex/ui-2`。实现基准：`aab3654`。工作区：`D:/Wenzhou-worktrees/codex-ui-2`。仅在此工作区构建、测试与提交，没有推送或合并。

## 分组与控件

| 分组 | 项目与控件 |
| --- | --- |
| 外观 | 主题与语言：分段按钮；配色：内置/自定义色卡；字体：应用下拉、系统字体枚举与预览。 |
| 编辑 | 字号：步进器；TXT 格式工具与小说行号：开关。 |
| 补全与术语 | 名词候选、术语高亮释义、正文与术语库同屏：带说明的开关。 |
| 章节与字数 | 字数规则：分段按钮；含标题：开关；识别说明与作品 `.vela` 标题模板入口。 |
| 阅读 | 三张阅读方式示意卡；统一个人排版开关；高级折叠项内编辑全局 `.vela`。 |
| AI 助手 | 状态卡与启用开关；服务/密钥、模型、用量三块；服务和模型下拉、请求格式分段、验证保存与删除密钥、数字限制。 |
| 存储与同步 | 创建作品 `.vela`、清理冗余文件：按钮与说明，已有配置时禁用创建按钮。 |
| 备份与关于 | 导出/恢复并排按钮；版本、更新检查、自动检查开关（原生宿主）、隐私、许可和指南。 |

## 结构与生命周期

- `settings-view.mjs` 按需加载，以声明项的分组、类型、名称、说明、`get()` 和 `set(value)` 渲染当前分组。应用状态及编辑器副作用留在 `app.js` 宿主适配层。
- 手机全屏列表 → 详情，分类摘要随修改更新；系统返回和左上返回逐层退出，恢复分类焦点与滚动。桌面左侧分类、右侧仅当前分组。
- 普通改动即时保存；数字在 `change` 时校验，不合法则所属行报错，不写回。语言、主题重绘保留分类、草稿、滚动和控件焦点。
- 每次渲染通过 `beginViewSession` 释放旧绑定和步进器。字体列表、AI 状态与验证回调检查会话；关闭设置时清除草稿。
- 子对话框暂存原设置视图，提交/返回后恢复并刷新；备份恢复替换工作区对象后使用最新状态。
- AI 首次启用弹数据发送确认，取消回滚；已同意不再重复确认。服务、地址、格式、版本与密钥保持草稿，验证成功后写入；模型及用量立即保存。密钥不进入工作区或发布附件。
- 全局 `.vela` 只改 `reader.appearancePolicy` / `reader.mode`，保留未知字段与其他排版字段；作品标题模板入口打开作品配置，不打开全局配置。
- `switchControl` 仅新增可选 `hideLabel`，保留完整可访问名称并消除设置行的重复文案。旧表单的列布局不会改变开关的横向方向。

删除了 `organizeSettings`、设置页大段 HTML 和统一提交处理、底部确定/取消、旧滚动定位分类布局及闲置设置动画。入口与对话框统一为“设置”。

## 验证记录

最终结果：`npm test` 519/519；`npm run check:core` 类型、ESLint、Prettier 全过；`npm run build` 全版成功；4192 端口 `npm run test:browser` 96/96（799.9 秒，退出码 0）。新增设置页测试的四种组合全部通过。

在隔离的 `aab3654` 快照中重建并运行 12 个受影响套件，12/12 通过（150.3 秒）。包括 Windows 原生/横屏、手机启动、备份、对话框、功能、单双页阅读、滚动背景、同步清理。第一轮回归暴露的旧控件/关闭路径断言均已按新界面迁移，保留对应行为覆盖；另修复设置在模拟键盘可视区内的定位。

CSS 等价性固定基准仍为 `f818cc5`。暂时具名豁免仅 `settings`，注释要求阶段 2 合并后由 Claude 更新基准并移除豁免。180 个场景中 12 个设置场景豁免，其余 168 个继续严格比较（包括伪元素与既有变量）；不扩大到其他页面。

新增设置页套件覆盖每个普通设置和 AI 配置即时生效/重载持久化、非法空值/越界/小数、未知字段保留、AI 同意取消与仅一次确认、验证草稿、API 版本、密钥不落盘、分类返回与子对话框焦点、语言保持原分类、阅读页即时重排、标题模板入口、浅深色、最小字号和触控尺寸。

## 截图与边界

截图：`test-results/ui-redesign/phase-2/`，390×844 的 Android 分类列表/八组详情/AI 确认，1280×850 八组详情，均有浅色与深色；另有 AI 连接后与用量部分。共 46 张有效截图，`results.json` 记录四种组合，`index.html` 为可点击总览，`verification.json` 保存汇总证据。

没有 Android / HarmonyOS 真机键盘验证，也没有真实 AI 服务调用；接口测试使用本地拦截的 HTTPS 响应。常规全量回归按项目规则跳过 Android、仅轻量版及性能/压力套件。附带更新的 Android、独立 Windows 专项和名词性能脚本未单独执行；实际 Windows 常规套件纳入全量回归。

## 修改文件

- `docs/UI-COMPONENTS.md`
- `docs/validation/ui-redesign-phase-2-20261030.md`
- `tests/ai-assistant-browser.mjs`
- `tests/ai-workflows-browser.mjs`
- `tests/android-browser.mjs`
- `tests/android-shell.mjs`
- `tests/app-core-fonts-browser.mjs`
- `tests/app-core-fonts-windows.mjs`
- `tests/app-tour.mjs`
- `tests/backup-restore-browser.mjs`
- `tests/component-download-browser.mjs`
- `tests/config-v2-browser.mjs`
- `tests/css-refactor-equivalence-browser.mjs`
- `tests/csv-tables-windows.mjs`
- `tests/dialog-mobile-browser.mjs`
- `tests/double-reading-browser.mjs`
- `tests/features-browser.mjs`
- `tests/file-manager-browser.mjs`
- `tests/improvements-browser.mjs`
- `tests/landscape-helper.mjs`
- `tests/language-switch-browser.mjs`
- `tests/mobile-shell-browser.mjs`
- `tests/mobile-startup-regressions-browser.mjs`
- `tests/noun-benchmark-browser.mjs`
- `tests/noun-performance-browser.mjs`
- `tests/palette-browser.mjs`
- `tests/reading-browser.mjs`
- `tests/reading-config-browser.mjs`
- `tests/scroll-backgrounds-browser.mjs`
- `tests/settings-helper.mjs`
- `tests/settings-view-browser.mjs`
- `tests/shell-layout-browser.mjs`
- `tests/storyboard-browser.mjs`
- `tests/studio-browser.mjs`
- `tests/sync-safety-windows.mjs`
- `tests/sync-workflow-browser.mjs`
- `tests/toolbar-sidebars-browser.mjs`
- `tests/ui-overhaul-browser.mjs`
- `tests/ui-refinement-browser.mjs`
- `tests/windows-browser.mjs`
- `tests/workspace-browser.mjs`
- `web/ai-settings.mjs`
- `web/app-core/font-settings.mjs`
- `web/app.js`
- `web/i18n-dictionary.mjs`
- `web/index.html`
- `web/lazy.mjs`
- `web/settings-privacy.mjs`
- `web/settings-view.mjs`
- `web/style.css`
- `web/ui-components.mjs`
- `web/ui-shell.mjs`
