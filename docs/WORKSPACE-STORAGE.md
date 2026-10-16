# 工作区保存：整份与增量

三端原生外壳都提供两个同步保存接口：

- `writeWorkspace(json)`：整份保存，参数是整个工作区（含全部正文和本地历史）。浏览器预览和旧版外壳只有这个接口，原生端检查失败时也回退到这里。
- `writeWorkspaceDelta(json)`：增量保存，只发送有改动的正文和本地历史，其余部分作为不含正文的骨架发送。

前端在 `web/platform.mjs` 的 `saveWorkspace()` 中选择：外壳提供 `writeWorkspaceDelta`、已有确认过的基线、内部文件夹标识没变时走增量；否则整份保存。原生端返回以 `E_DELTA_BASE` 开头的错误时，前端改用整份保存，用户看不到这一步。

## 基线：saveId

每次保存成功后，前端记住这次保存的 `saveId`（随机 UUID）以及当时各文稿的正文和本地历史数组。

- 整份保存时，`saveId` 作为顶层字段写进 JSON。
- 增量保存时，消息带 `base`（前端认为原生端现有的 saveId）和 `id`（这次的 saveId）。原生端发现当前 `workspace.json` 的 `saveId` 不等于 `base`，就返回 `E_DELTA_BASE`。
- 启动读取工作区后，`primeWorkspaceBaseline()` 用读到的 saveId 和正文作为基线，并把 `saveId` 从内存中的工作区对象删掉。其他代码（如项目事务）写入的 `workspace.json` 不带 saveId，下一次保存因此自动回到整份保存。

## 消息格式

```json
{
  "format": 2,
  "id": "本次 saveId",
  "base": "上次确认的 saveId",
  "workspace": {"version": 1, "storage": {"id": "…"}, "documents": [{"id": "a", "name": "…", "path": "…", "updatedAt": 1}], "folders": [], "…": "其余字段原样"},
  "texts": {"a": "改动后的全文"},
  "histories": {"a": [{"text": "…", "createdAt": 1}], "b": null}
}
```

- `workspace` 是不含 `localHistory` 的工作区，其中的文稿都不带 `text`。
- `texts` 只列出正文变化的文稿，新建的文稿也在这里。改名或移动的文稿只要正文没变，就不在 `texts` 里：原生端用基线正文写到新路径。
- `histories` 只列出本地历史变化的文稿，`null` 表示删除该文稿的历史。
- 删除文稿就是不再把它列入 `documents`。

## 原生端校验（三端一致，与整份保存相同）

- 消息不超过 64 MB；`format` 为 2；`workspace.version` 为 1；不允许 `store`、`localHistory` 字段，也不允许文稿自带 `text`。
- 文稿 ID 匹配 `[A-Za-z0-9_-]{1,80}` 且不重复；路径用各端原有的相对路径规则检查；同名路径判定与各端整份保存一致（Windows 不区分大小写，鸿蒙和安卓区分）。
- 单个正文 UTF-8 不超过 8 MB；文稿加文件夹不超过 5000 项；`storage.id` 必须是当前内部文件夹（鸿蒙在已选择文件夹时检查）。
- `texts` 中的每一项都必须属于 `documents` 中的文稿；历史条目必须有字符串 `text` 和数字 `createdAt`。
- 某文稿既不在 `texts` 里、基线中又找不到它的正文：返回 `E_DELTA_BASE`。
- 外部修改检查只对需要写入的路径做：目标文件已存在且内容既不是新正文、也不是基线中该路径的正文，就拒绝；要删除的文件内容与基线不同，也拒绝。
- 项目事务提交期间拒绝保存（Windows `projectFiles.busy`，鸿蒙、安卓 `projects.busy`）。

## 磁盘格式

增量保存后，`workspace.json` 和内部文件夹缓存（`folder-<id>.json`）都是骨架：

```json
{"store":{"format":2,"texts":{"a":"a.0123456789ab.txt"},"histories":{"a":"a.89abcdef0123.json"}},"version":1,"saveId":"…","documents":[…]}
```

`store` 总是第一个键，所以只看开头的 `{"store":` 就能区分两种格式。正文和本地历史存放在 `workspace-store/` 下，文件名是 `<文稿 ID>.<12 位十六进制随机代号>.txt|json`。每次写入都换一个新名字，从不覆盖。

- 读取：`readWorkspace` 遇到骨架时把正文和历史填回去，返回整份格式，前端不必区分。读取文件夹缓存（扫描、文件管理、回收站）和项目回执时也会填回。
- 写入顺序：先写新的正文和历史文件（临时文件、fsync、改名），再写工作区文件夹中的文稿（Windows 和安卓在事务日志内，鸿蒙按原有顺序，并保留 `previous-<id>.txt`），最后原子替换缓存和 `workspace.json`。骨架替换之前出错或断电，旧骨架引用的文件都还在，读到的就是上一次保存；这次写出的新文件没有被引用，下次保存时清掉。
- 保留上一版：Windows 和安卓把被替换的骨架存为 `workspace-store/previous.json`，鸿蒙沿用 `workspace.json.bak`。清理时保留当前骨架、缓存和上一版骨架引用的文件，其余删除。
- 启动恢复：Windows 和安卓照旧回放未提交的事务日志；鸿蒙照旧读取 `workspace.json`。
- 整份保存仍写整份格式。此后的第一次增量保存会把全部正文迁移进 `workspace-store/`（之后只写改动的文稿），旧格式文件不再被引用，随后清掉。降级到不认识骨架的旧版应用时，旧版读不到正文，应先在新版中导出备份。

## 测试与数据

- `tests/workspace-delta.test.mjs`：Windows 存储的增量保存、迁移、校验、基线变化、外部修改、清理和断电残留。
- `tests/native-workspace-delta.test.mjs`：用 Node 文件系统模拟运行鸿蒙的 `WorkspaceFiles.ets`。
- `android/app/src/androidTest/.../PortInstrumentation.java` 的 `workspaceDelta()`：安卓专用模拟器上的同类检查。
- `tests/windows-browser.mjs`：Electron 中实际编辑、自动保存、重载。
- `node scripts/benchmark-workspace-save.mjs`：在 Windows 存储上比较 40 万字、50 个文件的工作区修改一个文件后的单次保存（含 JSON 序列化）。
