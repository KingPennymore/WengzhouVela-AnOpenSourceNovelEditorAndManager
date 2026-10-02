# .vela 第二版配置

0.8.0 分开保存个人默认值与作品配置。所有路径使用 `/`、相对于配置所在文件夹，不允许绝对路径或越界路径。

| 文件 | 职责 |
| --- | --- |
| 根目录 `.global.vela`，`kind: global` | 编辑和阅读默认值、个人书库、排版策略、新工作区默认设置 |
| 文件夹中的 `.vela`，`kind: workspace` | 稳定作品 ID、作品信息、标题模板、编辑推荐值、阅读顺序、单文件覆盖、格式设置 |
| 应用私有工作区数据 | 文档 ID、修订、本地历史、书签批注、阅读位置、同步基线与订阅元数据 |
| 可重建缓存 | 分页测量、语言加载、下载内容缓存；不属于作品清单 |

其他名字的 `.vela` 文件可用 GUI / 源码编辑，但不会自动管理文件夹。最近的祖先 `.vela` 优先；嵌套作品各自独立。

## 作品示例

```json
{
  "version": 2,
  "kind": "workspace",
  "id": "my-novel",
  "project": {"name": "航程", "author": "作者", "description": "作品简介"},
  "editor": {"mode": "novel", "fontSize": 18, "wrap": true},
  "chapters": {"templates": ["幕 {number}：{title}"]},
  "reader": {"mode": "auto", "titlePage": true, "motion": "system"},
  "reading": {
    "items": [{"id": "main", "path": "正文.txt", "title": "航程"}],
    "layout": {"fontSize": 20, "lineHeight": 1.9, "marginLeft": 32, "marginRight": 32}
  },
  "files": {"附录.md": {"reading": {"layout": {"fontSize": 16}}}},
  "formats": {"latex": {"main": "排版/main.tex", "engine": "xetex"}},
  "publishing": {"changelog": "CHANGELOG.md"},
  "extensions": {"sample.plugin": {"custom": true}}
}
```

`reading.items` 的顺序就是书库顺序。条目 ID 在重命名时保持，复制工作区生成新的作品 ID。删除文件后仍保留缺失条目，便于修复；GUI 会标明缺失文件。重命名同步更新清单、单文件配置、封面、TeX 主文件和 Changelog 引用。PDF 的私有文档 ID 同样在移动时保留。

## 全局示例

```json
{
  "version": 2,
  "kind": "global",
  "editor": {"fontSize": 18},
  "reader": {"appearancePolicy": "project", "layout": {"fontSize": 20}},
  "library": {"mode": "auto", "showUnconfiguredFiles": true},
  "workspaceDefaults": {"chapters": {"templates": ["幕 {number}：{title}"]}}
}
```

通常按内置 → 全局 → 作品 → 单文件继承；未填写表示继承，数组明确填写时整体替换，不混合多个作品的清单。GUI 数字留空移除显式值，显示继承后的提示和最终生效配置。编辑字号独立于阅读字号，临时阅读捏合不改写作品推荐值。

`appearancePolicy: personal` 让全局 `reader.layout` 覆盖作品阅读字号、行距和四边留白。它不会替换作品阅读清单或标题模板。`library.mode: auto` 根据作品清单建立书库；没有作品配置的文件按 `showUnconfiguredFiles` 显示。`manual` 使用全局 `library.items`，路径相对于内部根目录，允许跨作品选择。GUI 勾选个人书库条目会切换为自选书库。`workspaceDefaults` 仅影响新建作品。

模式支持 `auto`、`scroll`、`pages`、`double`；自动模式在宽屏使用双页、窄屏使用滚动。`motion` 为 `system`、`slide` 或 `none`，系统减少动态效果始终优先。字号 10–40，行距 1–3.5，边距 0–240 CSS px，缩进 1–8 个普通空格，正文宽度 240–2400。标题模板最多 32 个，阅读条目和单文件配置最多 5000 项，配置文本最多 256 KB。标题始终自动识别，附加模板并不关闭标准规则。

## 配置备份与错误恢复

仅支持 version: 2；不读取、自动转换或提供旧格式升级入口。旧文件原文保留，预览提示版本错误，可重新创建配置。新版配置修改保留最多 5 次备份，自定义未知字段保留；写错时保留源文件，使用最近一次有效配置并提供恢复入口。没有有效配置时显示错误供源码修复。

全局配置和私有元数据默认不进入 GitHub 工作区提交。本地历史和备份有容量上限，请另外导出正式备份。
