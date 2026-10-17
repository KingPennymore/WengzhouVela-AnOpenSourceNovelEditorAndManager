# 规划格式插件接口

插件 API 仍是 4，能力名包括 planning-formats-v1、planning-ui-v1、map-symbols-v1、map-algorithms-v1。使用现有插件安装、停用和卸载生命周期，不引入新的插件执行环境。规划视图及算法继续按需加载。

`await vela.planning.parse('OUTLINE' | 'MAP', text)` 返回校验后的独立数据；`await vela.planning.serialize(kind, value)` 返回固定键顺序、2 空格缩进、末尾换行的 JSON。未知字段保留。使用已有 documents.readText / writeText 或授权后的 project.files.readText / 批量事务完成读写；解析和注册本身不会写文件。

```js
const symbol = await vela.planning.registerMapSymbol({
  type: 'terrain.tree', label: '树木', path: 'M0-16L14 12H-14ZM0 12V22'
});
// symbol.type 是加上插件 ID 命名空间后的实际类型。
const algorithm = await vela.planning.registerMapAlgorithm({
  id: 'sample', label: '示例边界', defaults: {width: 2},
  run(cells, params, {grid, palette}) {
    return {paths: [[[0, 0], [grid.size, grid.size]]]};
  }
});
```

符号只能提供有限长度的 SVG path 命令与数字，不能提供 SVG / HTML 标记、外部资源或覆盖内置类型。新增类型带插件 ID 前缀，定义按前缀分组，便于军事、地理和其他符号集扩展。当前地图重新打开后，元素选择器显示新注册项。插件停用后定义移除，文件中未知类型的符号继续保留。

算法参数默认值是扁平的数字、布尔或字符串对象；run 接收克隆的输入，返回 `{paths}`，也可附带 regions 等 JSON 元数据，不能依赖视图 DOM。支持异步结果，插件停用或预览对话框改变后忽略过期结果。输出先经过完整地图格式和大小校验，再预览，由用户确认后写入 generated，使用同一 ID 替换且可撤销。内置海岸线与城市算法不受插件卸载影响。

注册结果提供 dispose()，宿主也会在插件停止时自动清理。大纲的其他扩展可使用现有文稿工具栏、选区菜单、CodeMirror 扩展和 documents 接口；SDK 不提供替换内置大纲保存和路径改写逻辑的接口。

## 规划界面区域

现有 top-toolbar、document-toolbar、bottom-toolbar、library-sidebar、outline-sidebar 和 selection-menu 保持不变，仍可添加按钮或面板、调整内置按钮的隐藏状态及顺序。新的视图增加以下位置：

| 位置 | 按钮 | 面板 | 用途 |
| --- | --- | --- | --- |
| planning-toolbar | 是 | 否 | 当前大纲或地图的局部工具栏 |
| planning-sidebar | 是 | 是 | 画布内靠右的补充工具与可折叠面板 |
| planning-bottom | 是 | 否 | 当前视图的补充快捷操作 |

可以在插件启动时注册，不必等文件打开。离开规划预览时区域暂时移出文档，切换大纲、地图或重新渲染时复用原 DOM，保留插件面板自身状态；停用插件会完整恢复。空区域隐藏，不占空间。顶栏保持单行，溢出工具进入编辑页右上角纵向菜单。planning-bottom 与常用内置工具一起挂入文舟原有底栏，保留全局 bottom-toolbar；离开预览会清理挂载。箭头和元素属性在专用右侧栏中。

```js
vela.ui.addButton({
  id: 'inspect', title: '检查关系', location: 'planning-toolbar',
  icon: 'search', run({documentKind}) {
    // documentKind 是当前 OUTLINE / MAP。
  }
});
const panel = vela.ui.addPanel({id: 'notes', title: '辅助资料', location: 'planning-sidebar'});
panel.body.textContent = '插件自己的内容';
// 在规划文件打开后查询当前视图可调整的内置工具。
const tools = vela.ui.builtins('planning-bottom');
const restore = vela.ui.setBuiltin('outline-arrange', {hidden: true});
restore();
```

内置 ID 以 outline- / map- 开头：例如 outline-add、outline-child、outline-arrange、outline-outline-mode-relations、map-tool-draw、map-tool-info、map-map-fit、map-export-map-svg；地图右下角详情按钮为 map-details。隐藏与排序声明跨视图重绘继续生效，插件释放时恢复。按钮回调新增 documentKind，上层原有参数 location 保留。

信息点的数据在 markers 数组，以稳定 ID 参与读写、路径改写和结构化合并。新算法可以返回附加的 JSON 元数据，默认距离边界的 anchors 就是此扩展方式；不要把本机 DOM 或函数写进地图。

大纲顶层 nodes / edges 与 relations.nodes / edges 是独立集合。插件处理锚点时应携带集合名 outline / relations，不能只按节点 ID 跨集合查找。两套集合都经过解析、路径改写和同步合并；relationDegrees / relationSize 为纯函数，便于扩展统计。距离算法返回 fillPaths，内置自动填充使用保留图层 ID g-drawing-fill。

## 术语库链接和方向描述

节点可包含 glossaryLinks: [{id, path, entryId, label}]，按 id 合并，以 path 参与移动 / 删除改写，以 entryId 定位词条。关系中的旧正文 anchors 保留，新的正文选区链接只指向大纲。edges 支持 direction（none / forward / backward / both）及 Markdown description，父子边元数据存于子节点 parentEdge；未知字段往返保留。布局和节点尺寸按唯一邻居计算，忽略视觉方向。map-tool-select 现位于 planning-bottom，map-tool-symbol 位于 planning-toolbar。
