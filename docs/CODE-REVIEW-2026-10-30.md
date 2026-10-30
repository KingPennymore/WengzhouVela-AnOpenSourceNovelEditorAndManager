# 仓库代码审查（2026-10-30）

审查分支：`codex/ai-ui-fixes`，基于 `ui/redesign` 的 `949726a`，包含本对话的修复和本次 `.vela` 扩展。

## 范围与方法

清点 330 个自有源码文件、38,369 个物理行（含注释和空行）；JS/MJS/TS 语法扫描未发现解析错误。范围覆盖前端、Windows、Android、HarmonyOS 和构建发布脚本；对已跟踪的 JS/MJS/TS 执行 TypeScript 解析器语法扫描。人工重点检查配置解析与继承、配置写入、编辑器配置应用、保存调度、AI 请求与原生桥接、项目路径边界、HTML/Markdown 渲染。检查运行时依赖锁文件并运行 `npm audit --omit=dev`。

依赖风险处理后已补全单测、标准浏览器回归、Windows 原生与 Android QA 模拟器验证（结果见文末）。第三方 vendor 源码未逐行人工审计，未进行真机测试或攻击样本验证。语法扫描结果、依赖审计原始 JSON 存于本工作区 `test-results/`。本报告记录已确认的问题及适用条件，不将依赖告警直接等同于可利用漏洞。

## 已处理的依赖发现

### R1 / P1：Markdown 解析拒绝服务风险

- 发现时锁定 `markdown-it 14.3.2`，审计报告 high；现已升级到同一主版本的 `14.3.3`。
- 位置：`web/markdown-preview.mjs` 创建解析器，`web/app.js` 的 `renderPreview` 同步调用 `md.render`，订阅正文也调用同一个解析器。
- 官方公告：[GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c) 描述默认设置下多行链接定义触发平方级渲染开销，受影响范围包含当前版本。另一个 HTML 解析公告要求启用 HTML，而本项目 `html:false`，两者条件不同。
- 影响：打开外部导入或订阅的恶意 Markdown，可能阻塞主线程；后置 HTML 清洗无法消除已经发生的解析开销。已核对版本与可达代码，未运行攻击载荷。
- 处理：升级到公告修复版本 `14.3.3`，同步锁文件；Markdown、数学、任务列表、订阅和导出相关标准浏览器套件通过。

### R2 / P2：DOMPurify 命中严重依赖公告，当前选项下未确认可利用性

- 发现时锁定 `dompurify 3.4.16`，审计报告 critical；现已升级到修复版本 `3.4.17`。
- 位置：`web/html-preview.mjs`、`web/latex.mjs`、`web/markdown-preview.mjs`。
- [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) 涉及 SAFE_FOR_TEMPLATES、附加 shadow root 与 DOM 返回模式；[GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr) 涉及 IN_PLACE 和修改树的 hook；[GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f) 涉及 XHTML 解析模式下的 SMIL。
- 当前调用处未发现上述选项组合。因此没有确认应用可触发 XSS；仍已升级到公告范围之外的 `3.4.17`，防止后续调用变化暴露问题。

根目录运行时和完整依赖扫描均为 0 漏洞。另补查 Windows 独立锁文件，修复 Electron 证书信任缓解公告及打包依赖告警：Electron `44.5.1 → 44.10.0`、fast-uri `3.1.8 → 3.1.9`、undici `6.29.0 → 6.29.1` / `7.30.0 → 7.30.1`。Windows 完整依赖扫描也为 0 漏洞。扫描结果反映当时 npm 公告库，不等同于对所有未知漏洞的保证。

## 审查中已修复

### R3 / P1：无效配置可能被“上次有效配置”覆盖

`web/vela.mjs` 的 `cachedConfig` 在 JSON 损坏后提供旧配置和 warning；原 `web/app.js:setFontSize` 没有检查 warning，会把旧配置重新序列化，覆盖用户正在修复的原文。

新增统一写入函数 `setVelaPreference`：无效配置拒绝写入；字号、设置开关和 AI 作品开关共用此函数，保留未知字段并尊重单文件层。定向单测覆盖拒绝覆盖原文。

### R4 / P2：AI 凭据读取失败导致无界重试

`web/ai-panel.mjs` 原状态请求失败后把 status 置空，finally 又调用 update；update 立即发下一次状态请求。Keystore 持续失败时会不断占用桥接线程。

新增失败状态，自动更新不重试，显式刷新可重试。定向浏览器夹具验证首次失败只请求一次、显式刷新后总次数为两次。

### R5 / P2：Android 请求在前端超时后可能继续运行

`MainActivity.java` 的桥接 Promise 超时只移除 pending；`AiBridge.java` 的请求计时在工作线程实际开始后才启动。排队或时间差可造成前端先失败，原生请求仍在运行。原 `ai-client.mjs` 在失败后移除 abort 监听，没有再发送 cancel。

前端原生请求失败时现在主动发送幂等 cancel，再保留原错误。定向夹具验证 request 拒绝后发送 cancel。真实 Android 排队时序未在本轮实机复现。

### R6 / P2：新建作品遗漏部分默认配置

`file-dialogs.mjs` 原来只复制 editor、reader、chapters 和 reading.layout，忽略已经允许保存的 formats 默认项，也不能承接新增 AI 偏好。已统一到 `createVelaV2(...,{defaults})` 中复制受支持项；单测验证深拷贝及不复制其他作品的阅读清单。

## 风险修复后的验证

- 单测：532/532；核心类型、lint、格式检查通过。
- 标准完整版浏览器回归：101 个套件全部验证通过（首轮 98/101，修正旧界面测试后复跑失败项及共享地图套件 4/4）。
- CSS 等价性：以本次风险修复前的 `fc49243` 为基准，180 个场景、0 样式差异、无豁免；未改仓库默认基准。
- Windows 升级后主流程：5/5；额外原生字体、CSV、回收站、Gitea 和同步检查另行记录。
- Android 原生：11/11。回收站身份测试在基准提交同样失败；补齐测试夹具中应用实际执行的导入索引保存步骤后，严格恢复身份断言通过。
- 测试维护：跟随浮动 AI 菜单、内联行号、首页入口移除与设置分组调整更新测试入口；地图双指手势改用实际选中框中心，消除 Windows DPI 取整对模拟起点的误差，未放宽结果断言。
- 补上 Android 系统返回键关闭 AI 浮动菜单；CSS 仅归并已有响应式规则的位置，未改变属性。
- 原始依赖审计和回归产物位于隔离工作区的 `test-results/`；最终汇总见 `REGRESSION-2026-10-30.md`。

本节针对风险修复这一轮。后续新增界面与自动升级功能是否复跑回归，应以对应发布说明为准。未调用真实付费 AI 服务，未验证真机软键盘或 HarmonyOS 原生运行。
