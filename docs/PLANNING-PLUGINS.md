# 规划格式插件接口

插件 API 仍是 4，新增能力名 planning-formats-v1、map-symbols-v1、map-algorithms-v1。使用现有插件安装、停用和卸载生命周期，不引入新的插件执行环境。规划视图及算法继续按需加载。

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
