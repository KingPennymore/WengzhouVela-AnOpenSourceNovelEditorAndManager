# Vela 项目扩展接口 v3

本文对应当前源码中的实际接口。[类型声明](sdk/vela.d.ts)与[完整示例插件](../examples/plugins/project-workbench)可以直接用于开发。接口由 `acode.require('vela')` 提供；原有顶层 v2 文稿、配置、章节、历史、补全与宏包编译方法继续保留。

## 插件清单与初始化

```json
{
  "id": "example.my-workbench",
  "name": "项目工作台",
  "version": "1.0.0",
  "main": "main.js",
  "vela": {
    "api": ">=3 <4",
    "requiredCapabilities": [
      "workspace-v1", "filesystem-v1", "file-transactions-v1"
    ]
  }
}
```

宿主在执行入口之前检查 API 版本与必需能力。不匹配时停用并说明原因，入口不会执行。不声明新字段的旧插件按原方式加载。入口是已打包的经典脚本，不能包含未处理的 ESM import；可在初始化中注册命令、页面和补全，不应自动弹出素材选择器或扫描大型项目。

必需能力名称：`workspace-v1`、`filesystem-v1`、`file-transactions-v1`、`asset-sessions-v1`、`archive-v1`、`snapshots-v1`。可选能力请在操作前查询 `await vela.getCapabilities()`；不要根据系统名称猜测能力或文件上限。

## 工作区与文件

`workspace.current()` 找当前文稿所属最近的 `.vela` 工作区，不会把整个内部文件夹当成项目。没有所属项目时返回 `null`。`list()` 列出项目描述，`open({workspaceId})` 请求用户授权，`create({name,parentWorkspaceId?})` 创建文件夹与 `.vela`，并请求用户确认。

授权按插件会话与工作区分别记录，停用后失效。句柄只含稳定 ID、名称、可写标志和修订，不含绝对路径、文件系统 URI、账号或令牌。复制 `.vela` 后重复的项目 ID 会报告错误，需要先修复。

所有路径使用 `/`，相对授权工作区根目录。根目录列举路径为 `''`。禁止绝对路径、反斜线、空路径段、`.`、`..`、`.git`、设备名及 Windows 不可用名称；路径统一为 NFC，新增文件也拒绝大小写冲突。

`fs.list({workspaceId,path,recursive,limit,cursor})` 包含二进制、数据文本、空目录和元数据，分页最多 1000 项。游标绑定工作区、路径、递归选项及修订；目录改变会返回 `E_STALE_CURSOR`，应从头读取。`stat` 返回同一种条目，包括稳定 `entryId`、类型、MIME、大小、内容修订与修改时间。

`fs.readText` 优先读取编辑器中的实时正文，避免拿磁盘旧内容覆盖用户修改；未打开的数据文件按需解码为 UTF-8。`fs.readBytes` 返回 `Uint8Array`、修订及总大小，使用 `offset/length` 分块，可附 `expectedRevision` 阻止混合读取两个版本。修订基于内容，不是时间戳；不要解析或比较修订字符串的大小。

## 条件事务

```js
const project = await vela.workspace.current();
const data = await vela.fs.readText({workspaceId: project.id, path: '角色.csv'});
const receipt = await vela.fs.applyBatch({
  workspaceId: project.id,
  expectedWorkspaceRevision: project.revision,
  idempotencyKey: crypto.randomUUID(),
  label: '更新角色与对白',
  changes: [
    {kind: 'writeText', path: '角色.csv', text: nextCsv, expectedRevision: data.revision},
    {kind: 'writeText', path: '对白.json', text: nextJson, expectedRevision: null}
  ]
});
```

`expectedRevision:null` 表示必须不存在，绝不是无条件覆盖。更新、移动、删除必须提供原条目修订，同时提供整个工作区修订。幂等键在同一插件、同一工作区内持久保存；同键同内容返回原回执，同键不同内容报错。默认最多保留最近 1000 个回执。

支持 `mkdir`、`writeText`、`writeBlob`、`move` 和 `delete`。移动不能覆盖现有目标；删除只能 `mode:'trash'`，非空目录还需 `recursive:true`。首版拒绝同批交叠、循环、父子覆盖的操作，应拆成独立且可检查的事务。缺失的父目录可自动创建。

事务会同时更新实际文件、工作区缓存、打开文稿、稳定条目 ID、配置引用与文件树。移动保留 ID；文稿更新保存历史并重定位批注锚点。数据文件默认不会进入阅读清单或全部加载到编辑器；确实需要阅读时显式使用 `addToReadingList:true`。

提交期间宿主暂停编辑，已打开的无关文稿不会被丢弃。未跨提交点的失败恢复原状态；三端原生存储都有持久事务日志，在读取工作区前恢复中断事务。丢失原生回复时查询持久回执；无法确认结果时返回 `E_RECOVERY_REQUIRED` 并暂停后续写入，重启后恢复，不能自行再执行无条件覆盖。

## 二进制素材

`beginWrite({workspaceId,size,mime,sha256?})` 返回 `blobId/maxChunkBytes`。按从 0 开始的序号调用 `writeChunk({blobId,sequence,bytes})`；紧邻一次相同块重传安全，不同块或错序报错。`finishWrite` 检查长度与可选 SHA-256，返回素材回执。之后把 `blobId` 交给 `applyBatch` 的 `writeBlob` 才会写入项目；未提交可 `abortWrite`。

暂存素材绑定插件会话与项目，不含公开绝对路径。停用、任务取消或失败清理暂存，原生会话有 30 分钟有效期。大素材使用小块或原生文件流，不会作为整段 base64 写入工作区 JSON。

`io.pickFiles({multiple,accept})` 只能由用户操作调用。结果中的一次性选择令牌交给 `importFiles`，并指定每个目标路径；`collision:'error'` 拒绝冲突，`rename` 生成新名称。导入作为一个条件事务提交。

## ZIP 与导出

`inspectArchive({selectionToken})` 返回任务、归档令牌、相对文件清单和展开大小。此时尚未修改项目。`readArchiveText` 可预检小型 JSON/CSV；插件负责自己的 schema、业务 ID 与交叉引用验证。`importArchive` 在检验后使用 `collision:'error'` 和工作区修订提交。

归档入口检查越界路径、重复名称、大小写/NFC 冲突、父路径为文件、符号链接/设备项、加密、多卷、ZIP64、文件数和展开大小。导入时还验证实际展开长度与 CRC；不因中央目录声明较小就放任解压超限。

`exportFile` 导出指定修订的文件。`exportArchive` **必须指定固定快照、子根目录与文件白名单**，按稳定顺序输出，不能递归导出整个应用数据。未列入白名单的配置、历史、缓存、宏包、插件、凭据不会出现在包内；需要 `.vela` 时显式列入。相同快照与白名单在同一平台输出相同 ZIP。导出通过原生保存选择器完成，取消不改变项目。

## 资源与试演

`assets.openSession({workspaceId,allowedRoots,purpose,snapshotId?})` 只授权指定目录。`purpose:'preview'` 必须绑定快照。`resolve` 返回临时 URL、正确 MIME、大小、修订与 `supportsRange`；`release` 与插件停用都会撤销 URL。不能把主应用路径或原生桥传给插件运行器。

Windows、Android 的原生资源支持视频 Range、206、Content-Length、Content-Range 和 seek；鸿蒙资源当前使用受限 Blob URL，`range:false`，超过资源 URL 上限应显示静态替代并说明原因，或由插件按块自行读取。不要为此关闭 Web 安全或允许工作区 HTML 在主应用中执行脚本。

Windows 的 `preview.open` 创建隔离窗口，入口只能来自当前插件包，素材只能来自固定快照；禁止网络，窗口没有主应用文件/账号桥、Node 或 preload。`window.VELA_PREVIEW` 含 `previewId/snapshotId/assetBase/contentRoot/initialState`，素材 URL 相对快照根目录。可 `reload` 切换快照、`close` 结束，`on(previewId,listener)` 收到 ready/closed/error/trace。移动端独立窗口返回 `E_UNSUPPORTED`，使用插件页内预览并注册清理器。

## 快照、定位、配置与生命周期

`snapshots.create` 在一致修订上捕获指定范围，按内容去重；文本、数据、二进制、配置和空目录一起记录，`list` 只返回当前插件的工作区快照。`restore` 先征求确认并创建安全快照，然后作为条件事务恢复，包含稳定条目 ID 与捕获的文稿锚点。它不是文件类型转换工具；存在文件/目录类型冲突时先处理冲突。

`documents.open` 可定位闭合的数据文稿，附修订和 UTF-16 选区。选区是 JavaScript 字符串偏移，不是 UTF-8 字节数；修订已变时报告冲突，插件应重新检查或重新定位。

`config.patchExtension` 只合并 `extensions.<当前插件ID>`，不接受插件传任意 namespace，保留其他配置字段。JSON 容量受限，不能存访问令牌、密码、私钥等凭据。大项目数据应存独立文件。

Page 是带 `body/content/container` 的真实 DOM 页。`onVisible/onHide/onBeforeClose` 返回注销函数；关闭检查总计最多 5 秒，可以拒绝普通关闭，但不能阻止停用。`close()` 执行关闭检查，`hide()` 直接隐藏，`destroy()` 清理该页面。页面隐藏时释放 pointer capture 并通知暂停；插件需在回调里暂停自己的 RAF、音频和 Worker，在 `vela.dispose` 或卸载回调中终止它们。

任务返回 `{id,result,onProgress,cancel}`。`tasks.status/cancel` 只能访问本会话任务。取消提交前的任务会清理暂存并不修改项目；跨提交点后完成提交并返回回执。停用等待这类提交完成，然后释放资源、试演、事件和 UI；旧 SDK 拒绝后续项目访问。

`fs.watch` 聚合通知 create/change/move/delete，包含路径、条目 ID、修订、来源与可选事务 ID。同一事务只发一个聚合事件，保存但内容没变不会重复通知。外部写入当前通过显式刷新检测，`externalWatch:false`；不能假设系统级文件监视一直存在。

## 平台矩阵与实际限制

容量为 MiB，传输块为 KiB。以下值对应当前原生实现；代码始终以 `getCapabilities()` 返回值为准。

| 能力/上限 | Windows | Android | HarmonyOS | 浏览器开发预览 |
|---|---:|---:|---:|---:|
| 项目、条件事务、快照、资源会话 | 支持 | 支持 | 支持 | 支持，容量受限 |
| 单文本 | 8 MiB | 8 MiB | 8 MiB | 8 MiB |
| 读取/桥接块 | 256 KiB | 256 KiB | 256 KiB | 256 KiB |
| 单素材导入 | 512 MiB | 128 MiB | 128 MiB | 32 MiB |
| 单项目/快照内容 | 2 GiB | 512 MiB | 512 MiB | 64 MiB |
| 项目条目数 | 5000 | 5000 | 5000 | 2000 |
| ZIP 展开容量/项数 | 1 GiB / 5000 | 256 MiB / 5000 | 8 MiB / 1000 | 不支持 |
| ZIP 单包输入 | 512 MiB | 128 MiB | 8 MiB | 不支持 |
| 视频 Range | 支持 | 支持 | 不支持，资源 URL 最大 8 MiB | 不支持 |
| 独立试演 | 支持 | 页内降级 | 页内降级 | 页内降级 |
| 原生选择器 | 支持 | 支持 | 支持 | 使用浏览器选择器 |
| 系统级外部监视 | 不支持 | 不支持 | 不支持 | 不支持 |

原生大文件使用文件流，鸿蒙小型 ZIP 在 Worker 中处理。移动端独立试演与鸿蒙大视频 URL 的限制会明确声明，不会伪造成功结果。快照对象当前保留在应用内部，不自动清除已保存快照；大量快照应由插件提示用户空间占用。项目索引仍有整树内容检查成本，大型项目应分页显示，减少高频全目录请求。

## 错误与安全边界

所有新增接口使用 `code/message/details/retryable`：冲突、目标存在、未找到、无效路径、无效数据、超过上限、空间不足、取消、不支持、未授权、游标过期、插件停用、需要恢复。冲突时重读并让用户决定；不要自动强行覆盖。恢复错误要保留原始数据并重启。

JavaScript/Acode 插件仍是可信同页代码，这些授权、令牌、隔离预览和停用检查是 SDK 边界，**不是不可信插件的强沙箱**。插件可以自行访问同页对象，因此只能安装可信来源。独立试演隔离不等于整个插件已经沙箱化。

## 构建与验证

`node scripts/package-project-plugin.mjs` 生成 `dist/plugins/vela-project-workbench.zip`。安装后在“命令与快捷键”执行“打开项目接口示例”。示例覆盖项目创建、CSV/JSON 跨文件保存、空目录、素材导入、ZIP 导入/导出、快照及 Windows 独立试演，不包含游戏或特定业务框架。

`node --test tests/project-api.test.mjs` 验证内容修订、幂等提交、失败回滚、进程中断恢复、固定快照、范围资源和停用。跨端插件页面验证见 `tests/project-plugins-browser.mjs`；Android 测试只允许专用模拟器，不使用真实账号或个人工作区。

本次验证包括：全量单元测试；浏览器与 Windows 实际插件加载、Page 生命周期、快照资源、ZIP Worker、卸载清理；Windows 打包后程序的独立试演及桥接/网络隔离；Android 专用模拟器中的插件验证和原生存储测试。Android 原生测试覆盖超过 9 MiB 的素材分块与摘要、ZIP 往返、空目录、越界拒绝及持久事务恢复。旧 Acode Writer 1.0.4 和现有文件管理 UI 回归通过。

鸿蒙已通过 ArkTS/HAP 构建，以及对实际存储服务进行 SDK 模拟的事务回滚、启动恢复、二进制分块、快照与回收站测试；**尚未完成本次扩展的 ArkWeb 真机、系统文件提供器和视频实测**。模拟验证不等同于真机验收。签名配置、真实账户和个人工作区没有进入示例或测试数据。

系统选择器尚未关闭时停用插件，SDK 会立即拒绝等待中的请求并撤销会话；稍后返回的选择结果会被丢弃，保存选择器也不会继续替已停用插件写出文件。原生系统选择器自身可能需要用户关闭。已经进入项目事务提交点的写入仍完成或恢复后返回回执，避免留下一半修改。
