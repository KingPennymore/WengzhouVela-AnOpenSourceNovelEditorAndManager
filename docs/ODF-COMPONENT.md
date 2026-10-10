# ODF 可选文档组件：使用、开发与兼容边界

适用于本修订的 Vela 0.9.6，共用前端插件 API v3。组件 ID：`vela.component.odf`；版本：1.0.0。用户通过“更多 → 插件与组件 → 从 ZIP 安装”安装 `dist/plugins/Vela-ODF-1.0.0.zip`，与 LaTeX、中文组件、电子书组件一起启用、停用或卸载。

## 这一版的目标

尽可能完整地保存 ODF 内容，同时区分可编辑能力与仅保留能力。ODF 不仅是 ODT：本版也导入 ODS、ODP、ODG 以及对应模板。没有捆绑 LibreOffice 或大型 WASM 办公套件，不声称实现完整 ODF 标准、公式引擎或办公软件级分页排版。

ODF 引擎、ZIP 转换、渲染、图片处理、样式表和编辑 UI 均在 `components/odf/`，不进入宿主 app.js；宿主仅保留小型格式注册器、文本提取器、模板及安全 XML 校验。未安装时，已有 `.velaodt` / `.vodt` / Flat ODF 可阅读纯文本、查看源码和保存；二进制包导入会明确提示安装。停用或卸载不会删除文稿和资源工作副本。

## 格式与功能矩阵

| 格式/能力 | 阅读/显示 | 编辑/保存 | 限制 |
| --- | --- | --- | --- |
| ODT、OTT、FODT、.velaodt、.vodt | 标题、段落、常见字体、颜色、行距、对齐、缩进 | 自建 VODT 支持常用富文本；外来 ODT 支持普通段落的兼容编辑 | 字段、书签、修订、嵌入对象等所在段落受保护；复杂表格重复结构只读 |
| 列表 | 有序/无序，嵌套文本 | 自建文稿可插入列表 | 外来文档的列表结构保留，兼容编辑不重排列表 |
| 表格 | 单元格内容、合并跨度、继承样式、重复行列基础预览 | 自建文稿可插入基础表格；外来表格可编辑安全段落 | 不提供完整表格设计器；重复行列预览各限制 200 |
| 位图 | PNG、JPEG、GIF、WebP，尺寸与说明 | 自建文稿插入、缩放、删除；导出 ODT 打包 Pictures 并更新清单 | 单张 2 MiB；SVG/矢量/外链图片显示占位，原数据或引用保留 |
| 纸张/段落 | 部分页眉页脚、分页标志、段落间距 | 自建 VODT 可设置 A4/A5/Letter 与页边距，保存到 ODF 页面样式 | 采用连续网页阅读，浏览器不按办公软件方式精确分页 |
| ODS、OTS、FODS | 工作表、单元格缓存值、合并跨度 | 保留全部 XML 与资源，可原格式导出 | 不重新计算公式，不提供电子表格编辑器 |
| ODP、OTP、FODP | 页面分组、文字框、位图 | 保留全部 XML 与资源，可原格式导出 | 不执行动画、不精确恢复坐标与母版 |
| ODG、OTG、FODG | 文字与位图基础预览 | 保留全部 XML 与资源，可原格式导出 | 不提供绘图编辑器、矢量渲染或路径编辑 |
| 脚注、注释、字段、书签、修订、索引 | 部分可见文字可读 | 原 XML 保留；包含特殊结构的段落受保护 | 无完整审阅、索引刷新或字段计算 UI |
| 公式、图表、OLE/嵌入文件、字体、宏 | 对象占位，附件不执行 | 原包附件字节保留 | 不执行宏或嵌入代码，不绘制公式和图表 |
| 带数字签名的 ODF | 只读 | 未修改可原格式导出 | 不校验签名真实性；修改后禁止输出带失效签名的包 |
| 加密 ODF | 拒绝并说明原因 | 原文件不修改 | 需先用原软件解密；无密码解密引擎 |

标准 Flat ODF 导出仅用于可由单文件 XML 承载的文稿，位图会内嵌。包含对象、字体、签名或其他附件时禁止有损 Flat ODF 导出，改用原格式 ZIP 或 VODT。VODT 是 Vela 的 XML 工作副本，不等同于直接把完整复杂 ODF 包改后缀为标准 FODT。

## 原包保留与编辑实现

1. 读取并验证 ZIP、mimetype、content.xml、META-INF/manifest.xml。禁止 DTD/实体、路径越界、重复条目和加密清单。
2. 合并正文、样式、元数据及设置到 Flat XML；移除轻量 `vela:profile` 标记。自动样式使用内部 `vela:origin` 标记保持 content.xml 与 styles.xml 的归属，避免同名自动样式混写。
3. 将原包所有条目的原始字节写入根元素下的 `vela:package/vela:entry`，path 为相对路径，内容为 Base64。这包含 Pictures、对象、图表、字体、宏及 META-INF 内容。附件不被执行，也不通过外部 URL 加载。
4. 导入文件生成 `.vodt` 副本；保留源选择文件。未修改导出时，逐条复用原始字节，重新构建 ZIP；整个 ZIP 的压缩容器字节不保证一致，条目字节保持一致。
5. 兼容编辑只转换实际改变且安全的段落。周围 XML、原属性、列表/表格结构、未知节点和附件不重建。新样式写入 content.xml；字体、页眉页脚等保留原样。结构变化会回退显示并提示创建简化副本。
6. 自建 VODT 使用 HTML ↔ 常见 ODF 的转换，提供较自由的编辑。纸张、页面样式、元数据与设置在正文编辑时保留。把外来文档转为简化副本是明确的有损操作，不覆盖原文。
7. 修改后导出重建 XML 部件与必要的图片清单，保留其他条目。签名包若检测到内容变化则拒绝输出；未经修改时保留签名文件，不表示已通过验证。

VODT 内嵌原包会增加工作副本大小。本版输入包/工作文稿均限 8 MiB，解压限 32 MiB / 2048 个条目；超过 VODT 限额会拒绝而非截断。XML 深度限 80、元素限 100000；预览限 30000 个节点。以后应使用工作区独立二进制附件目录和 revision 关联，才能处理大文档并避免 Git 中的大量 Base64；本版不擅自迁移用户项目结构。

## 开发接口：document-formats-v1

清单示例：

```json
{
  "id": "example.document.component",
  "name": "示例文档组件",
  "version": "1.0.0",
  "main": "main.js",
  "vela": {
    "type": "document-component",
    "api": ">=3 <4",
    "requiredCapabilities": ["document-formats-v1"]
  }
}
```

在插件初始化中调用 `vela.registerDocumentFormat(provider)`，返回卸载函数，宿主同时自动记录以便停用时清理。provider 必须包含：

| 字段 | 定义 |
| --- | --- |
| id | 格式提供者标识 |
| extensions | 小写、带点的扩展名数组；与现有注册发生冲突时拒绝 |
| importBytes(bytes,name) | 同步解析 Uint8Array，返回 `{name,text}` 的文本工作副本，不改原文件 |
| validate(source) | 可选格式校验器 |
| plainText(source) | 提取可读正文，不返回附件 Base64 或脚本 |
| toHtml(source) | 返回可信、无可执行内容的阅读 HTML；组件负责输入消毒 |
| render(options) | 挂载编辑/预览界面；options 含 root、doc、onChange、onCopy、onError、onGlossary、manage、exportText、exportBinary |

`render` 通过 onChange 走宿主历史/保存/锁定机制；不能绕过原生存储事务。通过宿主提供的 exportText/exportBinary 导出，避免组件自行访问原生桥。将全局选择监听器等清理放到 `root.odfDispose`；宿主在切换、停用和卸载时调用。全局样式/Worker/定时器等用 vela.dispose 清理。不要在初始化中打开文件选择器或显示页面。注册器不提供不可信代码强沙箱，组件仍是可信同页代码。

完整 TypeScript 声明见 [sdk/vela.d.ts](sdk/vela.d.ts)。示例实现见 [main.mjs](../components/odf/main.mjs)、[package.mjs](../components/odf/package.mjs)、[preserve-edit.mjs](../components/odf/preserve-edit.mjs)。新类型只用于管理器标识；该接口是本修订新加的能力，旧 API v3 宿主不会因为版本号同为 3 就自动兼容，必须检查 requiredCapabilities。

## 构建与验证

```sh
npm ci
npm run package:odf
npm run build:lite
npm test
npm run test:odf
npm run test:vodt
npm run test:components
node scripts/check-build.mjs
```

测试浏览器可用 WENZHOU_CHROME 指定。ODF 测试验证缺失组件提示、安装、停用/启用、重启恢复、卸载保留文稿、原包字节、复杂附件与普通段落修改、签名只读、加密拒绝、路径/XML 限制、样式归属、ODS/ODP/ODG/模板 MIME、自建图片流程及宿主 bundle 排除检查。既有电子书测试包含 PDF 分页、选择文字、搜索和缩放。

ODF 1.2/1.3 常见结构为兼容目标，未知内容保留输入版本号，不自动宣称支持较新版本所有特性。规范参考：[OASIS ODF 1.3 包规范](https://docs.oasis-open.org/office/OpenDocument/v1.3/OpenDocument-v1.3-part2-packages.html)、[ODF 1.3 XML 模式](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/)。这是兼容功能测试，不是 ODF 标准一致性认证；当前环境未进行 LibreOffice/Word 交叉验收或三端 SDK 的发布包/真机测试。
