# 仓库代码审查（2026-10-30）

审查分支：`codex/ai-ui-fixes`，基于 `ui/redesign` 的 `949726a`，包含本对话的修复和本次 `.vela` 扩展。

## 范围与方法

清点 330 个自有源码文件、38,369 个物理行（含注释和空行）；JS/MJS/TS 语法扫描未发现解析错误。范围覆盖前端、Windows、Android、HarmonyOS 和构建发布脚本；对已跟踪的 JS/MJS/TS 执行 TypeScript 解析器语法扫描。人工重点检查配置解析与继承、配置写入、编辑器配置应用、保存调度、AI 请求与原生桥接、项目路径边界、HTML/Markdown 渲染。检查运行时依赖锁文件并运行 `npm audit --omit=dev`。

Android 轻量版已构建并签名，未验证 HarmonyOS 原生构建；第三方 vendor 源码未逐行人工审计。未运行全量单测、全量浏览器回归、真机测试或攻击样本。语法扫描结果、依赖审计原始 JSON 存于本工作区 `test-results/`。本报告记录已确认的问题及适用条件，不将依赖告警直接等同于可利用漏洞。

## 待处理发现

### R1 / P1：Markdown 解析拒绝服务风险

- 锁定版本：`markdown-it 14.3.2`；审计报告 high。
- 位置：`web/markdown-preview.mjs` 创建解析器，`web/app.js` 的 `renderPreview` 同步调用 `md.render`，订阅正文也调用同一个解析器。
- 官方公告：[GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c) 描述默认设置下多行链接定义触发平方级渲染开销，受影响范围包含当前版本。另一个 HTML 解析公告要求启用 HTML，而本项目 `html:false`，两者条件不同。
- 影响：打开外部导入或订阅的恶意 Markdown，可能阻塞主线程；后置 HTML 清洗无法消除已经发生的解析开销。已核对版本与可达代码，未运行攻击载荷。
- 建议：升级到公告修复版本（至少 14.3.3），更新锁文件并验证 Markdown、数学、任务列表和订阅渲染。升级前可将解析放入有时限的 Worker。

### R2 / P2：DOMPurify 命中严重依赖公告，当前选项下未确认可利用性

- 锁定版本：`dompurify 3.4.16`；审计报告 critical，三项公告均有修复版本。
- 位置：`web/html-preview.mjs`、`web/latex.mjs`、`web/markdown-preview.mjs`。
- [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) 涉及 SAFE_FOR_TEMPLATES、附加 shadow root 与 DOM 返回模式；[GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr) 涉及 IN_PLACE 和修改树的 hook；[GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f) 涉及 XHTML 解析模式下的 SMIL。
- 当前调用处未发现上述选项组合。因此本轮没有确认应用可触发 XSS，仍应升级到修复版本（公告范围之外的 3.4.17 或更新版本），防止后续调用变化暴露问题。

未自动修改依赖版本；这两项升级应配套相关渲染验证。

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

## 验证

- 新格式 9 项单测、i18n 4 项检查通过。
- AI 失败保护、作品配置应用与缓存编辑器切换两组定向浏览器检查通过，未调用外部 AI。
- 验证更改 `.vela` 后切回已打开文稿，边距和行号立即更新，原撤销历史保留。
- `npm run build` 通过。
- 未进行全量回归；以上检查不能替代三端完整运行验证。
