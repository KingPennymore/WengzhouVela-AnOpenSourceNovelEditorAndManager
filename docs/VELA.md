# .vela 第三版配置

0.8.0 分开保存个人默认值与作品配置。第三版新增作品配置中的 `richText`：TXT 格式工具开关、命名样式和每个 TXT 的格式记录（0.9.8 起；0.9.7 的 `正文.txt.vela` 旁注仍可读取，保存时并入 `.vela`），设计见 [VELA-V3-DESIGN.md](VELA-V3-DESIGN.md)。解析器同时接受 `version: 2` 和 `3`。0.9.9.9 起，新建配置统一使用第三版；加载、导入或同步中检测到有效的第一、二版文件时，自动升级到第三版，并在普通本地历史中保留转换前的原文。损坏、不支持或未来版本的文件保持原样，不会用默认值覆盖。所有路径使用 `/`、相对于配置所在文件夹，不允许绝对路径或越界路径。

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
  "version": 3,
  "kind": "workspace",
  "id": "my-novel",
  "project": {"name": "航程", "author": "作者", "description": "作品简介"},
  "editor": {"mode": "novel", "fontSize": 18, "wrap": true},
  "chapters": {"templates": ["幕 {number}：{title}"]},
  "reader": {"mode": "auto", "titlePage": true},
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

`reading.items` 的顺序就是书库顺序；不写 `reading.items` 时，文件夹内全部支持的文稿都进入书库（GUI 中勾选“自动包含文件夹内全部文稿”），新文件自动加入。条目 ID 在重命名时保持，复制工作区生成新的作品 ID。删除文件后仍保留缺失条目，便于修复；GUI 会标明缺失文件。重命名同步更新清单、单文件配置、封面、TeX 主文件和 Changelog 引用。PDF 的私有文档 ID 同样在移动时保留。

## 全局示例

```json
{
  "version": 3,
  "kind": "global",
  "editor": {"fontSize": 18},
  "reader": {"appearancePolicy": "project", "layout": {"fontSize": 20}},
  "library": {"mode": "auto", "showUnconfiguredFiles": true},
  "workspaceDefaults": {"chapters": {"templates": ["幕 {number}：{title}"]}}
}
```

通常按内置 → 全局 → 作品 → 单文件继承；未填写表示继承，数组明确填写时整体替换，不混合多个作品的清单。GUI 数字留空移除显式值，显示继承后的提示和最终生效配置。编辑字号独立于阅读字号，临时阅读捏合不改写作品推荐值。

`appearancePolicy: personal` 让全局 `reader.layout` 覆盖作品阅读字号、行距和四边留白。它不会替换作品阅读清单或标题模板。`library.mode: auto` 根据作品清单建立书库；没有作品配置的文件按 `showUnconfiguredFiles` 显示。`manual` 使用全局 `library.items`，路径相对于内部根目录，允许跨作品选择。GUI 勾选个人书库条目会切换为自选书库。`workspaceDefaults` 仅影响新建作品。

模式支持 `auto`、`scroll`、`pages`、`double`；自动模式在宽屏使用双页、窄屏使用滚动。翻页直接切换，不提供翻页动画；旧配置中的 `motion` 字段会被忽略。字号 10–40，行距 1–3.5，边距 0–240 CSS px，缩进 1–8 个普通空格，正文宽度 240–2400。标题模板最多 32 个，阅读条目和单文件配置最多 5000 项，配置文本最多 256 KB（不含 `richText.documents` 中的格式记录；整个文件最多 8 MiB）。标题始终自动识别，附加模板并不关闭标准规则。

## 上次编辑位置（positions，0.9.8.1 起）

作品 `.vela` 的 `positions` 记录每个文稿上次离开时的光标位置，键是相对于该作品文件夹的路径；不在任何作品里的文稿记在全局 `.global.vela`（只在它已存在时；不会为了记位置新建文件），键是完整路径。

```json
"positions": {"卷一/正文.txt": {"at": [82, 2], "head": "　　第80段，林舟望着远"}}
```

- `at` 是 [行, 列]，行从 1 开始，列从 0 开始；`head` 是该行前 12 个字。在文舟外改过正文后，按 `head` 找回原来的行，找不到时用同一行号。
- 只在切换文稿、关闭文稿、回到首页、应用退到后台或退出时写入，位置没变时不改文件；回到文首时删除该条。最多保留最近 500 条。
- 重命名或移动文件时记录跟着走，删除文件时一并删除，复制的文件从头开始。
- `.vela` 编辑界面保存时保留文件中的当前位置；配置备份不含位置记录。

## 配置备份与错误恢复

支持 version: 2 和 3（第三版只是增加字段，第二版文件无需转换）；更早的格式不读取、不自动转换，也不提供升级入口。旧文件原文保留，预览提示版本错误，可重新创建配置。新版配置修改保留最多 5 次备份，自定义未知字段保留；写错时保留源文件，使用最近一次有效配置并提供恢复入口。没有有效配置时显示错误供源码修复。

全局配置和私有元数据默认不进入 GitHub 工作区提交。本地历史和备份有容量上限，请另外导出正式备份。

## 大纲与地图

`formats.outline` / `formats.map` 在第二、三版配置中均可使用，按内置 → 全局 `.global.vela` → 作品 `.vela` → `files[path].formats` 继承，数组整体替换。新建规划文件时采用当前生效的默认视图、六边形方向与尺寸。高级区提供“大纲与地图配置”和“单文件配置 JSON”编辑框，未知配置字段保留。

大纲：`defaultView: "outline"`（或 "relations"；旧 tree / graph 与 treeStyle 兼容读取）、`longPressMs: 500`、`showEditorMarkers: true`；默认状态为 idea / draft / done，标签构思 / 草稿 / 完成。长按 200–2000 ms，状态最多 64 项。见 [OUTLINE.md](OUTLINE.md)。

地图现采用绘制点与自由信息点：`orientation: "pointy"`、`hexSize: 32`、`neighborDistance: 3`。新文件继承尺寸和相邻范围，已有文件的 drawing.distance 优先；范围为 1–16 倍相邻格心距离。信息详情统一从右下角按钮打开，窄屏为底部弹层，宽屏为浮层，不再显示常驻地图信息栏。

默认算法参数：`boundary: {smoothing: 2, roughness: 0.2, seed: 1}`。smoothing 为 0–4 整数，roughness 为 0–1，seed 为 32 位非负整数，均支持全局、作品、单文件继承。在生成对话框临时调整不会改写配置。距离算法统一生成各个轮廓，不区分内外边界；算法步骤及限制见 [MAP.md](MAP.md)。

旧配置的 palette、infoPanel、coastline、city 及其未知字段仍保留和校验，以便旧地图及插件继续读取；新版绘制工具不展示地形调色板，也不使用旧 infoPanel 的常驻布局。阵营仍供箭头和符号使用。界面与算法扩展接口见 [PLANNING-PLUGINS.md](PLANNING-PLUGINS.md)。

新建文件对话框按文件类型选择，名称扩展名同步修改，也可手工输入受支持的其他扩展名。当前文件夹已有 `.vela` 时禁用作品设置选项，手工改文件名也不能绕过重复检查；`.global.vela` 限根目录且同样不能重复。普通新建文件夹不再自动创建设置文件，可勾选“同时建立作品设置”。移动与创建位置通过可视目录选择，移动文件夹时不列出其自身和后代。

地图参考网格可设 `formats.map.showHexGrid: true`，默认 false，按全局、作品和单文件配置继承；地图本身可用 `grid.visible` 覆盖。两处均只接受布尔值。网格仅辅助显示，不影响边界算法或绘制点。


## 作品编辑与 AI 偏好（兼容 version 2 / 3）

这些可选字段沿用第三版结构。第一版的作品名称、字号、标题模板和阅读路径会映射到对应字段；第二版保持稳定作品 ID、显式空清单和未知扩展字段，只升级版本。`kind: document` 的旧 TXT 旁注继续采用既有的格式合并流程。
优先级为内置 / 本机偏好 → `.global.vela` → 作品 `.vela` → `files[相对路径]`。
`workspaceDefaults` 仍仅用于新建作品，不影响已有作品。

```json
{
  "version": 3,
  "kind": "workspace",
  "id": "my-book",
  "project": {"name": "我的作品"},
  "editor": {
    "lineNumbers": true,
    "marginLeft": 12,
    "marginRight": 12,
    "fontFamily": "serif",
    "autoNouns": true,
    "highlightTerms": true,
    "glossaryPanel": false,
    "snippets": [{"label": "省略号", "text": "……"}]
  },
  "chapters": {"countMode": "letters", "includeHeading": false},
  "ai": {
    "suggestions": false,
    "models": {"extract": "deepseek-chat", "suggest": "deepseek-chat"},
    "targets": {"glossary": "辅助/术语.gly", "outline": "辅助/情节.pcs", "places": "辅助/地图.vlmp"}
  }
}
```

- `editor.lineNumbers`：显示逻辑行上方的淡色行号；未填写时沿用本机“小说模式显示行号”。行号样式固定，不写入正文。
- `marginLeft` / `marginRight`：编辑正文左右内边距，0–120 CSS px，默认各 12；与阅读边距独立。
- `fontFamily`：正文字体族名称，最多 160 字符；不存在时使用系统后备字体，不改变应用界面字体、不下载字体。空字符串恢复跟随界面字体。
- `autoNouns` / `highlightTerms` / `glossaryPanel`：分别控制名词候选、术语高亮和同屏术语；`editor.completion` 仍是补全总开关。
- `snippets`：最多 256 个 `{label,text}`，label 为非空字符串（最多 80 字符），text 最多 8192 字符。继承时数组整体替换；与本机片段合并时，作品的同名片段优先。
- `chapters.countMode`：`nonspace`（非空白字符）或 `letters`（文字与数字）；`includeHeading` 为布尔值。未填写时沿用本机统计规则。
- `ai.models`：覆盖本机的整理 / 续写模型选择；仍使用本机已配置服务及密钥，发送前确认显示实际模型。
- `ai.targets`：相对于作品 `.vela` 文件夹的项目路径；glossary 允许 `.gly/.glossary`，outline 允许 `.pcs/.process`，places 允许 `.vlmp/.velamap`。路径须可跨平台使用，不允许绝对路径、越界或保留名称。移动 / 重命名时随关联路径更新；实际写入仍须预览确认。
- `ai.suggestions: false` 禁用作品续写。`true` 只表示作品允许，仍须用户在本机启用 AI、同意发送，并主动打开当前作品续写。菜单操作同步保存作品偏好与本机授权状态。

`ai` 仅接受 `suggestions`、`models`、`targets`；密钥、接口地址、服务开关、发送同意、每日用量等设备数据不得放入此对象。
新增字段同时适用于全局、作品、单文件和新作品默认配置。设置中的行号、补全细分开关及字数规则会写入当前生效配置层；直接编辑 `.vela` 时须保持 JSON 有效。
