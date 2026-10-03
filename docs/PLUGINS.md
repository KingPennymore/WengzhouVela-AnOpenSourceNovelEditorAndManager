# Vela 插件开发

项目接口 v3 已加入，原有 v2 方法继续可用。扩展接口与平台矩阵见 [PLUGIN-PROJECT-API.md](PLUGIN-PROJECT-API.md)。完整类型声明见 [sdk/vela.d.ts](sdk/vela.d.ts)，可安装示例见 [project-workbench](../examples/plugins/project-workbench)。先阅读下文的项目事务与平台限制；不要用旧 `writeText(documentId, text)` 实现跨文件保存。

Vela 使用 CodeMirror 6，并兼容一部分 Acode 插件接口。不是所有 Acode 插件都可以直接运行：依赖 Ace、Cordova、Android 插件原生接口或 Acode 私有 DOM 的插件需要适配。插件是有权访问本地文稿的 JavaScript 程序，只安装可信来源。

## 安装与包结构

通过顶栏插件按钮选择本地 ZIP。ZIP 根目录必须有 `plugin.json`；禁止绝对路径及 `..`。JavaScript ZIP 最大 8 MB，解压最大 16 MB、512 文件。插件页提供启用、停用、删除和设置。加载失败会停用插件并显示原因。

```json
{"id":"sample.vela.commands","name":"小说工具","version":"1.0.0","main":"main.js"}
```

```javascript
const id = 'sample.vela.commands';
acode.setPluginInit(id, async (baseUrl, page, options) => {
  const vela = acode.require('vela');
  const commands = acode.require('commands');
  commands.addCommand({
    name: id + '.insertScene', description: '插入场景分隔', bindKey: 'Ctrl-Alt-s',
    exec(editor) { editor.dispatch(editor.state.replaceSelection('\n\n* * *\n\n')); }
  });
  vela.addCompletion(context => {
    const word = context.matchBefore(/场景\w*$/);
    return word ? {from: word.from, options: [{label:'场景分隔', apply:'* * *'}]} : null;
  }, ['TXT','MD']);
  vela.on('switch-file', file => { console.log(file?.filename); });
});
acode.setPluginUnmount(id, async () => { /* 释放插件自己建立的定时器等资源 */ });
```

`baseUrl` 是包资源的虚拟地址，使用 `fetch(baseUrl + 'data.json')` 或 `acode.toInternalUrl()` 读取。页面的 `page.body` 可放置设置内容，`page.show()/hide()/settitle()` 管理页面。包内 CSS 的相对资源地址会被转换为本地 Blob 地址。插件代码不能通过 `eval()` 加载。

## Vela API v1

在初始化回调中获取 `acode.require('vela')` 并保存；停用后该对象不能再修改文稿。

| 方法 | 行为 |
| --- | --- |
| `getFiles()` | 返回 `{id,name,path}` 数组，路径相对内部文件夹 |
| `readText(id)` | 异步读取当前文稿内容 |
| `writeText(id,text)` | 异步写入并保存；活动编辑器可撤销，单文件限 8 MB |
| `addExtension(extension)` | 给编辑器安装 CodeMirror 扩展，返回移除函数 |
| `addCompletion(source,kinds=[])` | 注册 CodeMirror CompletionSource；空 kinds 作用于全部格式，返回移除函数 |
| `on(event,listener)` | 监听编辑器事件，返回移除函数 |
| `getSettings()` / `updateSettings(object)` | 读取副本 / 合并持久化插件设置 |
| `dispose(callback)` | 登记卸载清理函数 |
| `compileTex(id,options)` | 编译工作区中的 TEX 文稿；options 为 `{engine,onLog,signal}`；返回 `{ok,pdf,log,diagnostics,stats}`，pdf 是 Uint8Array |

格式名为 `TXT / MD / HTML / CSV / TEX / CODE / VELA`。补全来源可返回 Promise，单个来源失败不会影响其他来源。Tab 保持两个全角空格缩进；补全使用 Enter 确认。插件命令、扩展、补全、事件、页面和包资源 URL 在停用时清理；自建定时器、DOM、网络请求等应登记 `dispose()`。

事件：`switch-file`、`file-content-changed`、`new-file`。参数是文件对象 `{id,filename,name,uri,text}`；getter 始终返回当前内容。`editorManager.editor` 是 EditorView，不是 Ace session。`compileTex` 在初始化结束后的命令或用户操作中调用，允许 AbortSignal 取消；缺失宏包通过下述插件格式补充。

## Acode 兼容接口

支持 `acode.setPluginInit/setPluginUnmount/require/addCommand/exec/newFile/toInternalUrl/getPlugin`；模块包括 `commands/settings/page/toast/alert/confirm/prompt/fs/fsOperation/helpers/Url/EditorFile/codemirror`，以及 `@codemirror/state/view/commands/language/search/autocomplete`。

`commands` 支持 addCommand/removeCommand/exec/execute/getCommand。快捷键支持 `Ctrl-` 或 `Mod-`；命令名称应以插件 id 为前缀。`settings.value/get/update` 是兼容设置，插件自己的设置优先使用 Vela API。

`fs('wenzhou-file://文稿ID').readFile()/writeFile(text)` 操作文稿。`fs(baseUrl+'cache/data.json')` 读取或写入插件缓存；不能修改其他插件或包入口。Acode 的 actionStack 是兼容空操作，Ace session、Cordova、原生 shell、任意外部文件路径和插件商店安装接口不支持。

## TeX 宏包插件

无需 JavaScript 入口。`plugin.json`：

```json
{"id":"sample.tex.package","name":"自定义宏包","version":"1.0.0","vela":{"type":"tex-package"}}
```

文件放在 `texmf/` 下，例如 `texmf/tex/latex/mybook/mybook.sty`、`texmf/fonts/opentype/myfont.otf`。将依赖宏包、字体、许可一起打包。启用后资源进入编译器的虚拟文件系统；完整相对路径和文件 basename 均可查找，工作区文件优先。不要用相同文件名安装多个不同宏包。宏包 ZIP 最大 64 MB，解压最大 128 MB、10000 文件。

资源使用 IndexedDB 保存，插件清单保存于内部配置；停用不删除资源，删除后移除资源。内置 `vela.tex.cjk` 在首次编译时安装，包含 ctex、xeCJK、fontspec 和 Fandol 字体。内置包的各组件许可见 `vendor/wasmtex/THIRD_PARTY_NOTICES.md` 与 ZIP 内许可清单。

更多编译说明见 [LATEX.md](LATEX.md)。

## 0.8.0 配置与文档服务

`acode.require('vela')` 当前的服务版本为 3，继续保留版本 2 的文档与配置方法，`capabilities` 列出可用能力。`getConfig(fileId)` 返回第二版生效配置副本，`getDocumentInfo(fileId)` 返回稳定 ID、当前修订、已保存修订、修改状态与历史数量，`getChapters(fileId)` 返回自动章节索引，`getHistory(fileId)` 返回历史的修订/时间/字符数摘要（不返回整个快照正文）。修改文稿仍通过 `writeText`，不绕开保存和锚点检查。

服务停止后拒绝继续读写。插件设置与扩展字段不自动进入 GitHub 文件；需要作品随行设置时使用 `extensions.<plugin-id>`，保留其他插件字段。不要把令牌、密钥或本地绝对路径写入配置。仅支持第二版 `.vela`，插件应使用 `getConfig` 读取新版字段；不再提供旧格式升级。
