# Vela 插件开发（插件接口 4）

插件接口 4 取代了原来的 Acode 兼容运行时：不再提供全局 `acode`、`editorManager`、Acode 模块（`fs`、`fsOperation`、`EditorFile`、`actionStack` 等）及对页面 `fetch`/`setAttribute` 的改写。旧版 Acode 插件和未声明 `vela.api` 的插件会被拒绝加载，插件页会给出原因；请按本文改写后重新打包。

插件在应用页面内运行，可以访问本地文稿和编辑器，**只安装可信来源的插件**。项目接口（工作区、文件事务、导入、快照）的详细说明见 [PLUGIN-PROJECT-API.md](PLUGIN-PROJECT-API.md)，现在通过 `vela.project` 使用。类型声明见 [sdk/vela.d.ts](sdk/vela.d.ts)，可安装示例见 [project-workbench](../examples/plugins/project-workbench)。可选组件（LaTeX、电子书阅读）的管理见 [COMPONENTS.md](COMPONENTS.md)。

## 包结构

在“更多 → 插件与组件 → 从 ZIP 安装”选择本地 ZIP。根目录必须有 `plugin.json`；禁止绝对路径及 `..`。JavaScript ZIP 最大 8 MB，解压最大 16 MB、512 个文件。

```json
{"id":"sample.vela.tools","name":"小说工具","version":"1.0.0","main":"main.js",
 "vela":{"api":">=4 <5","requiredCapabilities":["ui-slots"]}}
```

`vela.api` 必须声明；`requiredCapabilities` 中有当前宿主没有的能力时，插件不会运行，并显示缺少的能力。当前能力：`ui-slots`、`commands`、`pages`、`assets`、`completion`、`editor-extensions`、`documents`、`configuration-v2`、`chapters`、`local-history`、`tex`、`document-formats-v1`，以及项目接口提供的能力（如 `filesystem-v1`）。

`main` 是打包好的单个脚本（例如 esbuild `--format=iife`），以普通脚本方式加载；不能用 `import` 引用包内其他文件，资源请用 `vela.assets`。

```javascript
VelaPlugins.register('sample.vela.tools', {
  async activate(vela) {
    vela.commands.register({id: 'insertScene', title: '插入场景分隔', shortcut: 'Ctrl-Alt-s',
      run: () => { const view = vela.editor.view; view.dispatch(view.state.replaceSelection('\n\n* * *\n\n')); }});
    vela.ui.addButton({id: 'scene', title: '场景分隔', icon: 'quote', locations: ['document-toolbar', 'selection-menu'],
      run: () => vela.commands.execute('insertScene')});
  },
  deactivate() { /* 可选：停用前释放自建资源 */ }
});
```

`activate` 只会在本插件加载期间注册一次；注册 ID 必须与 `plugin.json` 的 `id` 一致。停用时宿主会依次撤销本插件添加的按钮、面板、内置元素调整、命令、补全、扩展、事件、页面和资源地址，然后调用 `deactivate`；停用后再调用接口会得到 `E_PLUGIN_STOPPED`。自建的定时器、DOM 节点、网络请求等请用 `vela.dispose(fn)` 登记。

## 界面：按钮、面板与内置元素

插件只能把按钮和面板放进文舟已有的区域，不能另造导航或工具栏。按钮使用文舟内置图标名称和纯文本标题，由宿主绘制。

| 位置 | 实际区域 |
| --- | --- |
| `top-toolbar` | 顶部工具栏；窄屏或超过两个插件按钮时进入现有“更多”菜单 |
| `document-toolbar` | 正文上方的文稿工具区 |
| `bottom-toolbar` | 底部快捷栏，超出时横向滚动 |
| `library-sidebar` | 文件侧栏的工具区 |
| `outline-sidebar` | 章节侧栏的工具区 |
| `selection-menu` | 选中正文后弹出的选区菜单；`run` 收到 `{selection:{text,from,to,editable}}` |
| `planning-toolbar` | 大纲与地图预览的局部工具栏，需 `planning-ui-v1` |
| `planning-sidebar` | 大纲与地图的补充工具 / 可折叠面板，需 `planning-ui-v1` |
| `planning-bottom` | 大纲与地图预览底部的补充快捷操作，需 `planning-ui-v1` |

规划区域复用既有插件生命周期，可在文件打开前注册，切换文件后保留面板 DOM 状态。全局顶栏详情按钮与底栏统计随文件类型切换，正文专用操作在规划预览中停用，源码模式恢复。当前规划视图的内置工具可通过 `vela.ui.builtins()` / `setBuiltin()` 查询、隐藏或排序，具体 ID 和数据接口见 [规划格式插件接口](PLANNING-PLUGINS.md)。

```javascript
const button = vela.ui.addButton({
  id: 'focus', title: '专注计时', icon: 'task', location: 'bottom-toolbar',
  toggle: true, order: 10, run: () => button.update({checked: true})
});
button.update({title: '计时中', disabled: false, hidden: false});
button.dispose();
```

- `addButton(spec)`：`id`、`title`、`location` 或 `locations`、`run(context)` 必填；可选 `icon`（文舟图标名，见 `web/icons.mjs` 的 `iconNames`）、`order`（-1000 至 1000）、`toggle`/`checked`、`disabled`、`hidden`、`tooltip`。返回 `{update(patch), dispose()}`。
- `addPanel({id,title,location})`：在文件侧栏或章节侧栏底部加一个可折叠面板，返回 `{body, update({title,collapsed}), dispose()}`；`body` 是插件自己填充的容器。
- `builtins(location?)`：列出可调整的内置按钮（`{id,title,location}`），例如 `quick-save`、`quick-git`、`search-editor`、`new-doc`、`append-chapter`。
- `setBuiltin(id,{hidden,order})`：隐藏或重排一个内置按钮，返回恢复函数；插件停用时自动恢复默认界面。
- `createPage(title)`：全屏插件页，沿用文舟返回按钮与标题栏；`{body, show(), hide(), close(), setTitle(), onVisible(), onHide(), onBeforeClose()}`。
- `toast(message)`、`alert(title,message)`、`confirm(title,message)`、`prompt(title,value)`：使用文舟现有提示与对话框。

## 命令、资源与设置

- `commands.register({id,title,shortcut?,run})`：进入命令面板，`shortcut` 支持 `Ctrl-`/`Mod-` 写法；完整命令名为“插件 ID.命令 ID”。`commands.execute(id)` 执行本插件或其他插件的命令。
- `assets.url(path)`：包内文件的本地地址（可用于 `<link>`、`<img>`、`new Worker(url,{type:'module'})`）；`assets.read(path,{encoding})` 读取内容，`encoding:null` 返回 `Uint8Array`。包内 CSS 的相对 `url()` 会自动改为本地地址。
- `settings.get()` / `settings.update(object)`：插件私有设置；`settings.page({list,cb})` 在插件页提供设置界面（`list` 项为 `{key,text,value,checkbox}`）。

## 编辑器与文稿

- `editor.view`：当前 CodeMirror `EditorView`（没有打开文稿时为 `null`）。`editor.codemirror` 提供宿主使用的 `state/view/commands/language/search/autocomplete` 模块；扩展必须用这些模块创建，自带的另一份 CodeMirror 会被拒绝。
- `editor.addExtension(extension)`：安装 CodeMirror 扩展；`editor.addCompletion(source,kinds=[])`：注册补全来源，空 `kinds` 作用于全部格式。格式名为 `TXT / MD / HTML / CSV / TEX / CODE / VELA`。补全使用 Enter 确认，Tab 保持缩进。
- `documents.list()`、`active()`、`readText(id)`、`writeText(id,text)`（保存并可撤销，单文件 8 MB）、`info(id)`、`history(id)`、`config(id)`（第二版 `.vela` 生效配置）、`chapters(id)`、`create(name,text)`。
- `on(event,fn)`：`switch-file`、`file-content-changed`、`new-file`；参数是 `{id,name,path,text}`，读取时总是当前内容。
- `tex.compile(fileId,{engine,onLog,signal})`：编译 TEX 文稿，返回 `{ok,pdf,log,diagnostics,stats}`；需在初始化完成后的用户操作中调用。
- `formats.register(provider)`：注册文档格式提供者。
- `project`：项目接口（工作区、文件、导入导出、快照、独立试演），见 PLUGIN-PROJECT-API.md。

## TeX 宏包插件

无需 JavaScript 入口：

```json
{"id":"sample.tex.package","name":"自定义宏包","version":"1.0.0","vela":{"type":"tex-package"}}
```

文件放在 `texmf/` 下，例如 `texmf/tex/latex/mybook/mybook.sty`、`texmf/fonts/opentype/myfont.otf`，并附上依赖与许可。启用后资源进入编译器的虚拟文件系统，工作区文件优先；不要用相同文件名安装多个不同宏包。宏包 ZIP 最大 64 MB，解压最大 128 MB、10000 个文件。资源保存在 IndexedDB，停用不删除，删除插件时移除。更多说明见 [LATEX.md](LATEX.md)。

## 从旧版（Acode / 接口 3）迁移

| 旧写法 | 接口 4 |
| --- | --- |
| `acode.setPluginInit(id, fn)` / `setPluginUnmount` | `VelaPlugins.register(id, {activate, deactivate})` |
| `acode.require('vela')` | `activate(vela)` 的参数；项目接口在 `vela.project` |
| `acode.require('commands').addCommand({name, description, bindKey, exec})` | `vela.commands.register({id, title, shortcut, run})` |
| `new (acode.require('page'))(title)` | `vela.ui.createPage(title)` |
| `baseUrl + 'file'`、`acode.toInternalUrl()`、`fs(baseUrl + …)` | `vela.assets.url('file')` / `vela.assets.read('file')` |
| `acode.require('@codemirror/view')` | `vela.editor.codemirror.view` |
| `editorManager.editor` | `vela.editor.view` |
| `vela.getFiles/readText/writeText/getConfig/getChapters/getHistory/getDocumentInfo` | `vela.documents.list/readText/writeText/config/chapters/history/info` |
| `vela.getSettings/updateSettings` | `vela.settings.get/update` |
| `vela.compileTex` | `vela.tex.compile` |

插件缓存目录（`cache/`）写入已移除；需要持久数据时使用 `settings` 或项目接口。
