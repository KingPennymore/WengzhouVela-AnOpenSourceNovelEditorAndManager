# 侧栏视图与规划扩展

插件 API 保持 4。新增能力：`sidebar-views-v1`、`view-context-v1`、`planning-navigation-v1`、`planning-transactions-v1`、`document-navigation-v1`、`background-tasks-v1`、`ui-components-v1`。需要这些接口的插件应在 `requiredCapabilities` 声明对应能力。

## 左右栏视图

```js
const view = vela.ui.registerSidebarView({
  id: 'places', title: '地点目录', icon: 'pin', side: 'left',
  documentKinds: ['MAP'], modes: ['preview'],
  mount({body, context, signal}) {
    body.append(vela.ui.createElement('empty', {title: '地点目录', text: '请选择信息点'}));
    // signal 在卸载时中止；mount 同步返回清理函数。
    return () => {};
  },
  onShow(context) {}, onHide(context) {}, onContextChange(context) {}
});
// 用户点击插件按钮时调用；注册本身不会抢占当前侧栏。
view.show();
```

`side` 为 `left` / `right`，`id` 自动附加插件命名空间。`documentKinds` / `modes` 省略时适用于编辑页所有打开文稿。宿主管理标题选择器、关闭按钮、侧栏宽度、焦点和 Escape。桌面在现有左／右栏切换；手机自定义视图使用底部抽屉，搜索与列表分别布局，不压缩地图宽度。原文件与章节目录是 `builtin` 视图，仍可切回。既有 `addPanel()` 和 `planning-sidebar` 不改变。

首次打开时挂载；隐藏保留 DOM，可通过 `onHide` 暂停计算。切换文件后用 `onContextChange` 更新内容，处理函数应比较文件 ID、数据或版本，避免无变化重绘。不适用时回退内置视图；返回适用文件时恢复用户的视图选择。用户选择保存在当前设备。插件停用、卸载或挂载失败时中止 signal、执行清理并恢复内置视图。句柄支持 `show()` / `hide()` / `update({title})` / `dispose()`，停用后操作抛 `E_PLUGIN_STOPPED`。`hide()` 只收起当前视图所在侧栏，不移除注册。

## 上下文和导航

`vela.context.get()` 返回 `{file,kind,mode,page,selection}` 的独立数据。`file` 只包含 ID、名称和路径；没有活动文件时为 null。源码选区为 `{from,to}`，地图、大纲选中对象包含 ID 和集合／图层。`subscribe(fn)` 合并同一轮更新通知并返回取消函数，切换文件、模式、选区或规划对象会通知，停用自动取消。

`vela.documents.open(id,{selection?,chapter?,object?,collection?})` 打开工作区已加载文稿：文本范围为 UTF-16 偏移；chapter 是从 0 开始的章节索引；object 是地图／大纲对象 ID。项目内尚未加载的文件继续使用 `vela.project.documents.open()`。

`vela.planning.snapshot()` 获取当前规划预览独立快照：地图返回 `{fileId,kind,points,labels,viewport}`，大纲返回 `{fileId,kind,value}`。`navigate({id,collection,details?,edit?})` 定位对象，地图可通过 `bounds:{x,y,width,height}` 适应指定范围。地图支持信息点（包含旧 cells 信息点 ID）、符号和箭头；大纲使用 nodes / relations.nodes 区分集合。只有活动规划预览支持这两个方法，源码模式抛 `E_UNSUPPORTED`。

## 结构化修改

```js
const file = vela.documents.active();
const expectedText = await vela.documents.readText(file.id);
await vela.planning.applyChanges({
  fileId: file.id, expectedText,
  changes: [{op: 'update', collection: 'markers', id: '地点ID',
             patch: {category: '城市', symbol: 'building.city'}}]
});
```

以对象 ID 定位，不使用数组下标。一次最多 1000 项；地图支持 markers / cells / symbols / arrows；名称开关使用 `{op:"update",collection:"labels",id:"map",patch:{hiddenCategories:[...]}}`，大纲支持 nodes / relations.nodes。`add` 创建使用指定 ID 的新对象，重复 ID 拒绝；`update` 合并对象顶层属性，null 表示移除属性；不能修改对象 ID 或原型字段。`remove` 支持地图对象，大纲节点删除涉及树与关系一致性，暂需使用现有完整文稿接口。宿主验证完整结果；expectedText 与最新文稿不一致时抛 `E_CONFLICT`，不会覆盖后来输入。活动地图通过原有地图历史提交，一次修改对应一次撤销；其他文稿沿用宿主文稿历史与保存路径。

## 后台任务和界面样式

`vela.tasks.run({title,run:async({signal,report,yield})=>result})` 提供进度、取消和任务清理；`report({progress:0..1,message})` 更新任务区。普通 run 回调仍在前台线程，长循环应分段并 await yield()。

CPU 密集工作使用 `vela.tasks.runWorker({title,path:'worker.js',input})`。path 必须为插件包资源；Worker 接收 input，并用 `postMessage({progress:{progress,message}})` 上报，最终发送 `{result}` 或 `{error:'说明'}`。取消或插件停用会终止 Worker 并以 `E_CANCELLED` 拒绝 result。不会自动把闭包或宿主 DOM 搬进线程。失败任务可关闭；插件停用自动移除任务。

`vela.ui.theme()` 提供当前 paper / panel / text / muted / accent / line / radius / control 的 CSS 值。插件内容优先直接使用宿主 `var(--text)` 等变量，以自动跟随主题。`createElement('empty'|'toolbar'|'list', {title,text})` 返回使用文舟样式的普通 DOM 容器；插件仍负责内容与监听清理。

## 内置信息点目录（方案 C）

地图“更多”提供“信息点目录”和“地图名称类别”入口。左栏搜索名称与备注、按多个类别筛选列表，条目分别提供定位与详情；右栏独立选择哪些类别的名称显示在地图上。两项筛选互不影响，全部信息点圆点和元素图标继续显示。名称开关保存在地图 labels.hiddenCategories 中，支持撤销与重做；视图搜索保留在会话内。

信息点新增可选 category（最多 80 字符）与 symbol（现有元素类型 ID）字段，旧点归为未分类；用户可输入自定义类别。编辑器提供分组图标选择与预览，插件符号暂不可用时保留原 ID。圆点表示坐标，图标固定屏幕尺寸显示在上方；远景名称保持可读字号，发生重叠时避让，被定位的点优先显示。完整 PNG / SVG 导出保留所有名称和已加载图标，不受浏览类别开关影响。
