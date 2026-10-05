import {shortcuts} from './shortcuts.mjs';
export const previousGuideHash='64d887a7f0a3766af964913f9fbfa890e1e2bef6eb55d35dc3c70015e41f08dd';
export const previousGuideHashes=["3b307fda9b4b5ca7e928ee50b68a438c7163ac13c0e7310a3236a2bb5a07fcb7",previousGuideHash,"9336b918ca455334e98cca7050a185343c32580d4ae011857d6e6bf8ae9b8e1d","04b7720026eb6f3e8c8a65e44797511c61564539ecf22afb56d586133ffa7f9f","70ee96243c71fe28c3150a59dc7588e913468a72c464345c89ce48371befff84","d4945f9104ff48f9421881b54a658e65f774bf6757a8bef59cbe8fa033c581b5","6a06e8f9cd3abc519ad80ee8704281d145ab5ec3a16f5b78d6b7df6b8cf4f775","d685b53b07b6f3a26cfe341060b5b736a93072c522b640c65e1a7945d1aaa397","46d5e7b7ec168f801f066ebc69e28831300695a89aa206aaed60f3713444b170"];
export const guide = `文舟操作指南 · Vela 0.8.3
开源小说创作 / 阅读工具

一、导航与内部文件夹
顶栏最右侧“更多操作”提供专注模式、深浅切换、命令与快捷键、术语库和 Acode 插件；设置按外观、编辑、阅读、工作区、GitHub 和备份分类，从底部滑出，上边界位于屏幕三分之一处，内容填满下方三分之二。顶栏依次提供写作、GitHub、订阅、阅读页面，切换按钮始终显示。最左侧文件夹按钮仅展开或收起文件面板；进入阅读页面会自动收起文件面板。
本地文档保存在应用内部文件夹，无需特殊存储权限。卸载或清空应用数据会删除内部文件，请定期导出或同步 GitHub。文件菜单支持新建、重命名、移动、复制、剪切、副本、属性、导出和回收站。

二、工作区与 .vela
“新建工作区”创建文件夹及第二版 .vela 配置。配置中编辑字号与阅读字号相互独立；留空表示继承。全局 .global.vela 保存个人默认值、新工作区默认设置和书库方式；作品 .vela 保存作品信息、标题模板、有顺序的阅读条目、单文件排版和 LaTeX 主文件。仅名为 .vela 的配置管理所在文件夹；其他 .vela 文件可编辑，但不自动管理文件夹。
通常采用内置默认 → 全局默认 → 最近的作品配置 → 单文件配置。全局“使用我的阅读排版”只统一字号、行距与留白，不替换作品清单或标题模板。自动书库按作品清单显示，没有作品配置的文档也可阅读；自选书库可选择内部文件夹任意文档。路径相对于配置所在文件夹；重命名会更新清单及工程引用，删除后保留缺失条目以便修复。
第二版配置示例：
{"version":2,"kind":"workspace","id":"my-novel","project":{"name":"我的小说"},"editor":{"fontSize":18},"chapters":{"templates":["幕 {number}：{title}"]},"reading":{"items":[{"id":"main","path":"正文.txt"}],"layout":{"fontSize":20,"lineHeight":1.9}}}
仅支持 version: 2 配置，不读取或转换旧格式。配置修改保留备份；错误配置保留原文，并使用最近一次有效配置继续阅读。
章节自动识别标准中文、英文及 Markdown 标题。额外模板只在工作区 .vela 中设置，支持 {序号}、{标题}、{number}、{title}，每行一个，最多 32 个。

三、创作与自动补全
整部小说可写在一个 TXT 或 Markdown 文件中，以“第一章 标题”等标题分章。行号、章节目录、字数与快捷跳转辅助长篇创作。Tab 插入两个全角空格；Shift+Tab 取消缩进。
输入时可显示补全候选；Ctrl+Space 手动唤起，方向键选择，Enter 确认，Escape 关闭；Tab 始终执行小说缩进。HTML 支持标签及属性补全，文本使用当前文稿附近的词汇作为候选。双指捏合或触摸板捏合只调整文字字号，普通双指滑动继续滚动。
命令按钮提供章节改名、移动、删除、工作区搜索与替换、词库和片段、书签/批注/待修改标记，以及本地历史恢复。批量替换先搜索再预览，修改后仍能恢复旧内容；本地历史为有容量限制的恢复辅助，不代替导出备份。宽屏可选择源码与预览并排。
术语库使用 .gly 或 .glossary 后缀，内容为 JSON：{"version":1,"name":"人物与地名","entries":[{"term":"林舟","definition":"航海日志的记录者","aliases":["舟"],"category":"人物"}]}。打开后默认显示图形界面，可搜索、新增、编辑和删除词条，切换源码可直接编辑 JSON。
在作品 .vela 的“编辑 → 术语库文件”中每行填写一个相对路径；对应字段为 editor.glossaries，例如 ["术语库.gly"]。留空继承全局，填 [] 停用。选中词汇后按 Ctrl+Alt+G，或使用“更多操作 → 选中词加入术语库”，可以选择已有库或新建库，添加时自动关联当前工作区。同一工作区可关联多个术语库；自动补全以单行优先显示术语，类型、分类及来源跟在术语后面，同词条会合并候选及全部来源，别名补全为标准词条；非法术语库需切换源码修复，原文会保留。

文件标签的 × 仅关闭标签，不删除文件。CSV 使用表格预览，可增删行列、按列排序和粘贴制表符分隔的区域；HTML 预览嵌入源码区域并保留文件标签与工具栏，支持本地 CSS、图片和字体；嵌入预览不执行脚本、不联网，需要交互测试时点击“独立预览”。Markdown 支持格式工具、表格、任务列表和本地图片。

四、只读阅读
点击阅读按钮进入书库，选择文档后书库向左滑动收起；点击阅读顶栏左侧返回按钮返回书库。阅读不会修改文稿，文件标签不显示，CSV 表格也不可编辑。
在设置中选择上下滑动、左右翻页或双页阅读。双页阅读在宽屏上同时显示左右两页，一次翻动两页，底部显示页码范围；可用宽度不足 760px 时自动显示单页，旋转或改变窗口宽度后保留附近的阅读位置。TXT、Markdown、HTML 和 PDF 均支持双页。点击正文左侧 30% 向前翻页或上滚一屏，右侧 30% 向后翻页或下滚一屏；中间 40% 关闭目录及搜索/批注面板。顶部左侧为返回书库图标和不带后缀的书名，右侧为章节、搜索和批注图标，中间留空避开摄像头。左右模式可横向或纵向滑动翻页，并提供覆盖滑动动画；方向键、PageUp / PageDown 同样可翻页，双指调整字号。阅读时隐藏系统状态栏与导航栏，返回书库恢复。底部两侧向内留白，左侧时间、右侧页码及百分比，中间显示去掉尾部标点的章节名。上下模式的页数以当前窗口一屏估算。章节按钮打开只读目录；左右模式的章节标题单独一页并居中，上下模式的章节标题前留出一行。排版可以在 .vela 预览中修改；PDF 按 TeX 源码排版。阅读工具提供全文搜索、书签和批注；PDF 读取自身目录并按页保存标记，扫描 PDF 若没有文字层则无法全文搜索。HTML 的进度与标记保存在隔离阅读器内部，和普通文稿标记分开。长篇 TXT/代码正文按区块显示；上下模式保留邻近区块，左右模式在后台渐进计算总页数，尚未计算的页数显示省略号。每本文稿分别保存阅读位置，重新打开时恢复；字号变化和窗口大小变化时尽量保持相同文本位置。HTML 保持系统 Web 渲染；返回后继续在书库切换文档。

五、GitHub 与订阅
GitHub 推荐使用访问令牌登录；账号下方提供退出按钮，退出不会删除文稿。拉取文件后保持当前页面和已打开的文稿，不自动打开新文件。长按远端文件或文件夹进入多选，也可点击“多选”；选中文件夹会包含其全部子目录，路径保持不变。同仓库同路径文件重复拉取会覆盖本地，支持拉取整个仓库、分支管理和主动提交；“提交整个工作区”将配置、文稿与附件合为一次提交。
订阅页输入 HTTPS 仓库首页地址，例如 https://github.com/owner/repository。可阅读 Release 与 Changelog；启动、进入页面和手动刷新会检查更新。公开仓库可匿名订阅；私有仓库需要已登录账号具有读取权限，未登录时 GitHub API 速率限制较低。
页面按钮上的点表示尚未进入页面查看更新，进入页面后消失；仓库旁的点在打开仓库详情或忽略后消失。长按约半秒再向左滑动可忽略，也可勾选后批量忽略或删除订阅。删除订阅保留已经缓存到本机的文件。
添加订阅只保存仓库信息，不创建空文件；随后询问是否立即拉取，取消后可在详情页手动拉取。包含 .vela 的项目只提示阅读清单内文件的更新；未修改的本地 .vela 自身变化静默同步；修改过的配置保留并提示冲突。拉取 .vela 项目时可勾选“仅拉取阅读清单”，保留原相对路径与配置，不平铺目录；同时补充可解析的本地图片、样式、脚本和 TeX 子文件依赖；无法静态识别的资源可使用完整拉取。拉取完成的文稿可离线阅读；刷新失败保留缓存和未读状态。本地修改过的订阅缓存在更新前会保留副本。

六、外观、语言与插件
默认跟随系统深浅模式，支持青松、玉石、墨竹、麦田、石墨配色。设置中切换简体中文或 English；英文品牌名为 Vela。
本地 Acode 插件 ZIP 支持 JavaScript 生命周期、CodeMirror、编辑事件、命令、设置和包内资源；依赖 Cordova、Ace 或未实现的原生接口的插件可能无法运行。

七、LaTeX 与 PDF
.tex / .latex / .ltx 支持语法高亮、命令与代码片段补全。预览中选择 XeLaTeX 或 pdfLaTeX，点击“编译 PDF”，可查看日志、定位错误与导出 PDF。编译使用真正的 TeX Live WebAssembly 引擎，在设备本地完成，自动处理多遍编译、BibTeX 参考文献和索引；相对路径子文件、图片、字体从当前工作区读取。中文推荐 XeLaTeX + ctexart，首次编译自动安装内置中文宏包和 Fandol 字体。编译失败保留源码；已显示的成功 PDF 不被失败结果覆盖。
可以通过插件导入额外 .sty、.cls、.bst、字体及其依赖。宏包 ZIP 根目录需要 plugin.json，声明 vela.type 为 tex-package，TeX 资源放在 texmf/ 下。普通 JS 插件限 8 MB；宏包 ZIP 限 64 MB、解压限 128 MB。宏包可在插件页启停或删除。引擎支持 XeTeX 和 pdfTeX；LuaTeX、Biber 和外部 shell 工具不提供，需相应工具的工程不能直接编译。完整的插件 API、兼容范围和宏包示例见仓库 docs/PLUGINS.md 与 docs/LATEX.md。

八、Windows
Windows 版本提供 x64 安装包与 ZIP，复用编辑、阅读、订阅、GitHub、插件与本地 PDF 编译功能。主窗口不显示系统菜单栏，文件及编辑操作通过应用内按钮和快捷键完成，F11 切换全屏。ZIP 版同样使用 Windows 用户应用数据目录保存文稿，记忆窗口位置与大小并适配显示器变化；设置可检查 GitHub 发布更新，仅跳转下载页面，不自动安装；卸载默认保留文稿。令牌使用 Windows 安全存储加密。

九、快捷键
Tab：两个全角空格
Shift+Tab：取消行首缩进
${shortcuts.map(([, ,key,name])=>`${key}：${name}`).join('\n')}
Ctrl+Shift+F：工作区搜索与替换
Ctrl+Alt+B：添加书签
Ctrl+Space：自动补全
Ctrl+加号 / 减号：调整文字字号；Ctrl+0：重置字号。

Vela — Open-source novel writing / reading tool
Use the top bar to switch between Write, GitHub, Subscriptions and Read. The folder button only toggles the file panel. Create a workspace to add a .vela JSON configuration, then select reading files, font size and chapter templates in its preview editor. Read mode is read-only; use the back icon to return to the library. Reading titles omit filename extensions; the header keeps the camera area empty. Settings include English, system appearance and scrolling / single-page / two-page reading. Two-page mode shows page ranges and turns a spread at a time; narrow windows automatically show one page. Subscribe using a GitHub HTTPS repository URL; .vela projects notify only changes to their reading files. V2 global defaults and project settings use explicit inheritance. Personal typography never replaces a project reading list. Choose an automatic or personal library; Only version 2 manifests are supported; configuration edits keep backups. Reading includes fullscreen, swipe animation, centered chapter names and chapter title pages. Subscribing creates no empty files and asks whether to pull now. Windows includes native import/export, fullscreen and encrypted GitHub credentials; its main window has no menu bar. Keep backups: mobile uninstalling clears internal documents. Tab always inserts two full-width spaces; Ctrl+Space opens completion suggestions.
`;
export async function isOriginalDemo(doc) {
  if(doc.name!=='长篇小说.txt'||doc.remote||doc.text.length!==846)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')==='ba39e755fbaf6d6344db635df1fa62d874b9fa84657e965a72ad9a0f0f3c26da';
}
