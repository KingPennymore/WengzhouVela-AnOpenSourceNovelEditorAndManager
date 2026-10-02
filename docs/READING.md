# 阅读与 .vela 配置

Vela 0.7.0 支持 HarmonyOS NEXT、Android 和 Windows。阅读模式保持文稿只读，进入正文会收起文件栏、隐藏系统栏；点击中间显示应用工具栏，点击两侧翻页。左右分页支持横向或纵向滑动以及方向键、PageUp / PageDown。上下阅读使用自然滚动，也可点击两侧或按键滚动一屏。双指捏合或 Ctrl + 滚轮只调整字号。

左右模式将识别出的章节标题单独排成一页，居中显示；上下模式在标题前留出一行。底部显示时间、章节、页数和百分比。上下模式的页数按照当前窗口一屏的高度估算，改变窗口、字号或排版会重新计算；保存的进度仍以正文位置为准。章节显示会去掉末尾标点，原文保持不变。LaTeX 使用编译后的 PDF 自身分页，章节排版由 TeX 源码控制。

`.vela` 中的路径相对于配置所在文件夹，最近的祖先配置优先。配置预览提供阅读清单筛选、全选、字号、行距和边距设置；源码和预览可以互相切换。边距以 CSS px 记录，小窗口在需要时按比例缩减，确保正文仍有可用空间。

```json
{
  "version": 1,
  "name": "航路",
  "fontSize": 18,
  "titleTemplates": ["幕 {number}：{title}"],
  "reading": {
    "files": ["正文.txt", "附录.md"],
    "layout": {
      "lineHeight": 1.9,
      "marginTop": 24,
      "marginBottom": 24,
      "marginLeft": 35,
      "marginRight": 35
    }
  }
}
```

行距范围 1–3.5，四边留白范围 0–240 px，字号范围 10–40 px。旧配置无需修改，缺少的排版字段自动使用默认值。配置不会改写小说正文。

设置中的“编辑全局 .vela”创建或打开内部文件夹根目录的 `.global.vela`，并展示内部文件夹所有可读文档。该配置带有 `"scope": "global"`。没有区域配置时使用全局配置；开启“使用全局 .vela 覆盖区域配置”后，书库仅显示全局清单，区域内配置不参与阅读筛选与排版。关闭覆盖后恢复区域配置优先。全局清单的路径相对于内部文件夹根目录。字号手动缩放可保留到下次阅读；全局覆盖启用时每次打开优先使用全局字号。

订阅仓库只保存仓库信息、Release、Changelog 和远端配置快照，不创建空文稿。添加后询问是否立即拉取，取消后可以在订阅详情中拉取。已拉取的 `.vela` 会随订阅刷新静默更新；文稿更新提示只针对阅读清单内文件。仅拉取阅读清单时保留相对路径；HTML 图片、样式等附件需要完整拉取。

## English

Read mode is read-only and fullscreen. Tap the center to reveal the toolbar; tap either side to move a page. Horizontal pagination supports horizontal and vertical swipes, arrow keys and PageUp / PageDown. Scroll mode uses natural scrolling and screen-sized keyboard/tap navigation. The footer displays time, chapter, page count and progress. Scroll-mode pages depend on the current viewport; progress is stored as a text position.

The nearest regional `.vela` controls the reading list and typography. Settings can edit `.global.vela`, which lists files relative to the internal folder root. It acts as a fallback; enabling global override restricts the library and typography to that configuration. The GUI edits font size, line spacing and four margins without changing source text. PDF typography is controlled by its TeX source.
