import {shortcuts} from './shortcuts.mjs';
export const previousGuideHash='64d887a7f0a3766af964913f9fbfa890e1e2bef6eb55d35dc3c70015e41f08dd';
export const previousGuideHashes=[previousGuideHash,"d685b53b07b6f3a26cfe341060b5b736a93072c522b640c65e1a7945d1aaa397","46d5e7b7ec168f801f066ebc69e28831300695a89aa206aaed60f3713444b170"];
export const guide = `文舟操作指南 · Vela 0.6.1
开源小说创作 / 阅读工具

一、导航与内部文件夹
顶栏依次提供写作、GitHub、订阅、阅读页面，切换按钮始终显示。最左侧文件夹按钮仅展开或收起文件面板；进入阅读页面会自动收起文件面板。
本地文档保存在应用内部文件夹，无需特殊存储权限。卸载或清空应用数据会删除内部文件，请定期导出或同步 GitHub。文件菜单支持新建、重命名、移动、复制、剪切、副本、属性、导出和回收站。

二、工作区与 .vela
“新建工作区”创建文件夹及 .vela 配置。配置记录阅读文件清单、字号和章节标题模板。打开 .vela 默认显示设置界面，可切换源码与预览。阅读清单中的路径相对于 .vela 所在文件夹；新建文档会自动加入最近的工作区阅读清单；没有配置时可从设置创建新的 .vela 文件。普通文件夹中未配置 .vela 的文档也可阅读。
配置示例：
{"version":1,"name":"我的小说","fontSize":16,"titleTemplates":["幕 {number}：{title}"],"reading":{"files":["正文.txt","附录.md"]}}
章节自动识别标准中文、英文及 Markdown 标题。额外模板只在工作区 .vela 中设置，支持 {序号}、{标题}、{number}、{title}，每行一个，最多 32 个。

三、创作与自动补全
整部小说可写在一个 TXT 或 Markdown 文件中，以“第一章 标题”等标题分章。行号、章节目录、字数与快捷跳转辅助长篇创作。Tab 插入两个全角空格；Shift+Tab 取消缩进。
输入时可显示补全候选；Ctrl+Space 手动唤起，方向键选择，Enter 确认，Escape 关闭；Tab 始终执行小说缩进。HTML 支持标签及属性补全，文本使用当前文稿附近的词汇作为候选。双指捏合或触摸板捏合只调整文字字号，普通双指滑动继续滚动。
文件标签的 × 仅关闭标签，不删除文件。CSV 使用表格预览，HTML 预览嵌入源码区域并保留文件标签与工具栏，支持本地 CSS、图片和字体；嵌入预览不执行脚本、不联网，需要交互测试时点击“独立预览”。Markdown 支持格式工具、表格、任务列表和本地图片。

四、只读阅读
点击阅读按钮进入书库，选择文档后书库向左滑动收起；再次点击阅读按钮返回书库。阅读不会修改文稿，文件标签不显示，CSV 表格也不可编辑。
在设置中选择上下滑动或左右翻页。点击正文左侧 30% 向前翻页或上滚一屏，右侧 30% 向后翻页或下滚一屏；中间 40% 展开或收起顶部工具栏。也可左右滑动，或用方向键、PageUp / PageDown；双指调整字号。右下角显示页码和阅读百分比，左下角显示时间；章节按钮打开只读目录。每本文稿分别保存阅读位置，重新打开时恢复；字号变化和窗口大小变化时尽量保持相同文本位置。HTML 保持系统 Web 渲染；返回后继续在书库切换文档。

五、GitHub 与订阅
GitHub 推荐使用访问令牌登录；账号下方提供退出按钮，退出不会删除文稿。拉取文件后保持当前页面和已打开的文稿，不自动打开新文件。长按远端文件或文件夹进入多选，也可点击“多选”；选中文件夹会包含其全部子目录，路径保持不变。同仓库同路径文件重复拉取会覆盖本地，支持拉取整个仓库、分支管理和主动提交；“提交整个工作区”将配置、文稿与附件合为一次提交。
订阅页输入 HTTPS 仓库首页地址，例如 https://github.com/owner/repository。可阅读 Release 与 Changelog；启动、进入页面和手动刷新会检查更新。公开仓库可匿名订阅；私有仓库需要已登录账号具有读取权限，未登录时 GitHub API 速率限制较低。
页面按钮上的点表示尚未进入页面查看更新，进入页面后消失；仓库旁的点在打开仓库详情或忽略后消失。长按约半秒再向左滑动可忽略，也可勾选后批量忽略或删除订阅。删除订阅保留已经缓存到本机的文件。
包含 .vela 的项目会保存配置，并只提示阅读清单内文件的更新；.vela 自身变化静默同步。拉取 .vela 项目时可勾选“仅拉取阅读清单”，保留原相对路径与配置，不平铺目录；未列入清单的图片、样式等附件可通过完整拉取获取。订阅文稿首次阅读时下载，已下载内容可离线阅读；刷新失败保留缓存和未读状态。本地修改过的订阅缓存在更新前会保留副本。

六、外观、语言与插件
默认跟随系统深浅模式，支持青松、玉石、墨竹、麦田、石墨配色。设置中切换简体中文或 English；英文品牌名为 Vela。
本地 Acode 插件 ZIP 支持 JavaScript 生命周期、CodeMirror、编辑事件、命令、设置和包内资源；依赖 Cordova、Ace 或未实现的原生接口的插件可能无法运行。

七、LaTeX 与 PDF
.tex / .latex / .ltx 支持语法高亮、命令与代码片段补全。预览中选择 XeLaTeX 或 pdfLaTeX，点击“编译 PDF”，可查看日志、定位错误与导出 PDF。编译使用真正的 TeX Live WebAssembly 引擎，在设备本地完成，自动处理多遍编译、BibTeX 参考文献和索引；相对路径子文件、图片、字体从当前工作区读取。中文推荐 XeLaTeX + ctexart，首次编译自动安装内置中文宏包和 Fandol 字体。编译失败保留源码；已显示的成功 PDF 不被失败结果覆盖。
可以通过插件导入额外 .sty、.cls、.bst、字体及其依赖。宏包 ZIP 根目录需要 plugin.json，声明 vela.type 为 tex-package，TeX 资源放在 texmf/ 下。普通 JS 插件限 8 MB；宏包 ZIP 限 64 MB、解压限 128 MB。宏包可在插件页启停或删除。引擎支持 XeTeX 和 pdfTeX；LuaTeX、Biber 和外部 shell 工具不提供，需相应工具的工程不能直接编译。完整的插件 API、兼容范围和宏包示例见仓库 docs/PLUGINS.md 与 docs/LATEX.md。

八、快捷键
Tab：两个全角空格
Shift+Tab：取消行首缩进
${shortcuts.map(([, ,key,name])=>`${key}：${name}`).join('\n')}
Ctrl+Space：自动补全
Ctrl+加号 / 减号：调整文字字号；Ctrl+0：重置字号。

Vela — Open-source novel writing / reading tool
Use the top bar to switch between Write, GitHub, Subscriptions and Read. The folder button only toggles the file panel. Create a workspace to add a .vela JSON configuration, then select reading files, font size and chapter templates in its preview editor. Read mode is read-only; click Read again to return to the library. Settings include English, system appearance and scrolling / paginated reading. Subscribe using a GitHub HTTPS repository URL; .vela projects notify only changes to their reading files. Keep backups: uninstalling clears internal documents. Tab always inserts two full-width spaces; Ctrl+Space opens completion suggestions.
`;
export async function isOriginalDemo(doc) {
  if(doc.name!=='长篇小说.txt'||doc.remote||doc.text.length!==846)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')==='ba39e755fbaf6d6344db635df1fa62d874b9fa84657e965a72ad9a0f0f3c26da';
}
