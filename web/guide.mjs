import {shortcuts} from './shortcuts.mjs';
export const previousGuideHash='64d887a7f0a3766af964913f9fbfa890e1e2bef6eb55d35dc3c70015e41f08dd';
export const previousGuideHashes=["a9dda38a4cda51cdaab1ed8baba36216d24e210265be963e9d011e2bd5ba3b7a","ed531551b6b19eb92e041cf27a2888e92729852a9d211b4397e05551149a1f52","3b307fda9b4b5ca7e928ee50b68a438c7163ac13c0e7310a3236a2bb5a07fcb7",previousGuideHash,"9336b918ca455334e98cca7050a185343c32580d4ae011857d6e6bf8ae9b8e1d","04b7720026eb6f3e8c8a65e44797511c61564539ecf22afb56d586133ffa7f9f","70ee96243c71fe28c3150a59dc7588e913468a72c464345c89ce48371befff84","d4945f9104ff48f9421881b54a658e65f774bf6757a8bef59cbe8fa033c581b5","6a06e8f9cd3abc519ad80ee8704281d145ab5ec3a16f5b78d6b7df6b8cf4f775","d685b53b07b6f3a26cfe341060b5b736a93072c522b640c65e1a7945d1aaa397","46d5e7b7ec168f801f066ebc69e28831300695a89aa206aaed60f3713444b170","71cd8dc85b15375830975c3a5d46c60be4c4cfd4d92ecb6189e2416bacfcec75","378b486bf5017d9695859a418647105f60347225a199a849cf50d2526c51f82c"];
export const guide = `文舟操作指南 · Vela 0.9.8.1
开源小说创作 / 阅读工具。隐私协议与源码：https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager

本指南是一份普通 TXT，可随意修改；修改后新版本不会覆盖它。没有修改时，升级后自动换成新版指南。

一、界面
顶栏左起：文件夹按钮（展开 / 收起文件面板），写作、GitHub、订阅、阅读四个页面。右侧“更多操作”里有专注模式、深浅切换、命令与快捷键、术语库、插件与组件和设置。
宽屏时文件标签、格式工具和视图切换（源码 / 预览）在同一行，保存、撤回、跳转等快捷操作在底部状态栏；窄屏和手机上格式工具单独一行，可左右滑动，快捷操作在底栏。
文稿保存在应用内部文件夹，不需要存储权限。卸载或清空应用数据会删除这些文件，请定期导出备份或同步到 GitHub / Gitee。
文件菜单：新建、重命名、移动、复制、剪切、副本、属性、导出、移入回收站。回收站可恢复，永久删除需要再次确认。

二、写作
整部小说可写在一个 TXT 或 Markdown 里，“第一章 标题”这类标题自动分章；章节目录、字数统计和章节跳转帮助管理长篇。小说模式默认隐藏行号，可在设置“编辑”中打开。
再次打开文稿时，光标回到上次离开的位置；位置记在作品 .vela 的 positions 中（不在作品里的文稿记在已有的全局 .global.vela），只在切换、关闭文稿或退出时写入。
Tab 插入两个全角空格，Shift+Tab 取消缩进。输入时显示补全候选（术语库优先，其次是正文里推测的人名、地名），Ctrl+Space 手动唤起，Enter 确认，Escape 关闭。
命令面板（Ctrl+Shift+K）按类别列出全部命令：章节改名 / 移动 / 删除、工作区搜索与替换、写作词库和片段、书签 / 批注 / 待修改标记、本地历史恢复、各类导出。批量替换先预览，替换后仍能从本地历史恢复。
选中文字后，文字上方出现横向菜单：剪切、复制、粘贴，以及右侧的“更多”（搜索、加入术语库、插件提供的操作等）。选区开头已经滚出编辑区时，菜单固定在编辑区工具栏下方；滚动时菜单暂时隐藏，停下后回到新位置。工具栏上已有的格式命令不会在菜单里重复。

三、TXT 格式
在设置“编辑”或命令面板中打开“TXT 格式工具”，也可在作品 .vela 的“TXT 格式”页为整部作品打开或关闭。TXT 正文始终是纯文字，复制到网文平台不用清洗；格式另外保存在作品配置 .vela 里。
工具栏从左到右：粗体（Ctrl+B）、着重号（Ctrl+Shift+E）、注音｜居中（Ctrl+Alt+E）、右对齐｜样式、插图｜清除格式，有待确认的格式时最右侧显示“待确认”。
样式：点“样式”打开样式面板，列出全部命名样式（系统提示、书信、回忆、旁注及自定义样式）。选中文字时默认“选中文字”，样式只作用于这些字；没有选中时作用于光标所在段落，也可手动切到“整段”。对齐和缩进只在整段时生效。“样式”按钮显示光标处的样式名。“管理样式…”可新建或修改样式：字体、字号、颜色、加粗、对齐、缩进、边框。宽屏上样式面板在按钮下方弹出，手机上从底部弹出。
清除格式（Tx）：去掉选中文字的粗体、着重号、注音和样式，以及所在段落的对齐和段落样式；没有选中时清除光标所在段落的全部格式，没有格式可清除时会提示。插图不受影响，可以撤回。
注音写在字的上方；插图挂在段落末尾，点击插图可修改说明或删除（浏览器预览只显示占位框）。
在文舟外改过正文后，打开时格式按所在段落和原文自动重新定位；找不到的进入“待确认”，可在正文中选中正确的文字后“应用到选区”，或删除。格式不会被静默丢弃。
0.9.7 的格式旁注（正文.txt.vela）仍能读取：打开对应 TXT 并保存后，格式并入 .vela，旧旁注移入回收站。

四、导出
“导出章节”可选章节范围，导出为 TXT、Markdown 或 HTML，或直接复制（复制 HTML 时同时带上格式）。“导出 EPUB…”生成 EPUB 3 电子书：含目录、格式、注音和插图，可选封面；书名、作者、简介取自作品配置，可在导出时修改。

五、作品与 .vela
“新建工作区”创建文件夹和作品配置 .vela。打开 .vela 显示两页：
· 作品配置：作品信息、编辑、章节标题模板、阅读排版、阅读清单、高级（单文件配置、最终生效配置）。
· TXT 格式：格式工具开关、全部命名样式、每个 TXT 的格式数量和待确认数。已删除文件的格式记录会标出，可以移除。
配置按“内置默认 → 全局 .global.vela → 最近的作品 .vela → 单文件配置”继承，留空表示继承。阅读清单可勾选“自动包含文件夹内全部文稿”，此时新文件自动进入书库；取消勾选后按选择和顺序保存。重命名、移动文件会同步更新清单和格式记录；移到另一个作品时格式随文件过去。
章节标题始终自动识别中文、英文和 Markdown 标题；作品 .vela 可再加最多 32 个模板，支持 {序号}、{标题}、{number}、{title}。
配置示例：
{"version":3,"kind":"workspace","id":"my-novel","project":{"name":"我的小说"},"chapters":{"templates":["幕 {number}：{title}"]},"reading":{"layout":{"fontSize":20}},"richText":{"enabled":true}}
配置写错时保留原文，并继续使用最近一次有效配置；修改配置会保留最近 5 次备份。

六、术语库
术语库是 .gly 或 .glossary 文件。打开后是词条列表：每行显示词条、分类、释义第一行和别名数，可搜索、按分类筛选。
· 点按词条进入详情，编辑词条、分类、别名和释义，可用 ‹ › 切换上一条 / 下一条。
· 长按词条（或右键）复制词条名。
· 新建、删除和修改都会自动保存，不需要保存按钮。删除需要再点一次“确认删除”。新建时没填词条就返回，不会留下空词条。
在作品 .vela“编辑 → 术语库文件”中每行填一个相对路径即可关联（字段 editor.glossaries；留空继承全局，填 [] 停用），同一作品可关联多个术语库。选中词语后按 Ctrl+Alt+G，或使用“更多操作 → 选中词加入术语库”，可加入已有术语库或新建一个。设置中可开启“正文与术语库同屏”和“正文术语高亮与释义”。

七、阅读
点击阅读进入书库，选择文稿开始阅读，左上角返回书库。阅读不会修改文稿。可选上下滑动、左右翻页或双页（宽度不足 760 px 时自动单页）。点按正文左侧 30% 向前、右侧 30% 向后，中间关闭面板；方向键和 PageUp / PageDown 也能翻页，双指调整字号。
TXT 的格式、注音、样式和插图在阅读页同样显示，阅读位置、书签和搜索仍按原文计算。顶部右侧为目录、搜索和批注；每本书单独记住阅读位置。TXT / Markdown 预览中跳转章节、到顶 / 到底时停留在预览中。

八、GitHub、Gitee 与订阅
GitHub 推荐用个人访问令牌登录，退出不会删除文稿。可拉取单个文件、文件夹或整个仓库，管理分支，提交单个文件或“提交整个工作区”。拉取和提交前先预览变更。Gitee 同样支持，见设置中的仓库连接。
订阅页填写仓库首页地址（如 https://github.com/owner/repository），可阅读 Release 与 Changelog，启动和手动刷新时检查更新。包含 .vela 的项目只提示阅读清单内文件的更新，可选“仅拉取阅读清单”，保留原来的相对路径。

九、插件与组件
“更多操作 → 插件与组件”管理插件和可选组件，可以启用、停用、卸载。
在线组件：应用读取发布在 GitHub / Gitee 上的组件目录（Gitee 优先，失败时用 GitHub），列出可下载的组件及其版本和大小。已安装的组件有新版本时显示“可更新”，标题旁显示可更新数量；需要更新版文舟才能使用的组件会写明所需版本。点“检查更新”重新读取目录。读不到目录时，改为列出最新应用发布附带的组件。下载后先校验整个 ZIP 的 SHA-256，再逐个文件校验安装；单个组件不超过 96 MB，手机上建议在 Wi‑Fi 下下载。
也可点“从 ZIP 安装”导入本地组件或插件。插件使用插件接口 4，可在顶栏、文稿工具区、底栏、两侧侧栏和选区菜单添加按钮与面板；只安装可信来源的插件。开发说明见仓库 docs/PLUGINS.md 与 docs/COMPONENTS.md。

十、LaTeX 与 PDF
.tex / .latex / .ltx 有语法高亮、命令和环境补全、即时检查（括号、\\begin / \\end 配对、重复 \\label）与大纲折叠。在预览中选择 XeLaTeX（中文推荐）或 pdfLaTeX，点“编译 PDF”（Ctrl+Enter），点击问题列表可跳到源码；成功后可导出 PDF。可开启“自动编译”，Ctrl+Alt+J 从源码定位到 PDF，双击 PDF 文字跳回源码。
编译在设备本地进行，不上传源码。轻量版需要先在“插件与组件”下载 LaTeX 排版组件（约 77 MB）；完整版已内置。额外宏包可用 tex-package 插件导入。LuaTeX、Biber 和外部命令不可用。详见 docs/LATEX.md。

十一、外观与语言
默认跟随系统深浅模式。可选青松、玉石、墨竹、麦田、石墨配色，也可新建自选配色（浅色和深色分别选纸张、文字、强调色，附对比度提示）。设置中可切换简体中文或 English。

十二、Windows
提供 x64 安装包与便携 ZIP，功能与移动端相同，额外支持本地 PDF 编译。没有系统菜单栏，操作通过应用内按钮和快捷键完成，F11 切换全屏；窗口位置和大小会被记住。可在应用内检查更新并下载安装；卸载默认保留文稿。令牌用 Windows 安全存储加密。

十三、快捷键
Tab：两个全角空格
Shift+Tab：取消行首缩进
${shortcuts.map(([, ,key,name])=>`${key}：${name}`).join('\n')}
Ctrl+Shift+F：工作区搜索与替换
Ctrl+Alt+B：添加书签
Ctrl+Space：自动补全
Ctrl+加号 / 减号：调整文字字号；Ctrl+0：重置字号

Vela — Open-source novel writing / reading tool
Switch between Write, GitHub, Subscriptions and Read in the top bar; the folder button toggles the file panel. Turn on "TXT format tools" to add bold, emphasis dots, ruby, alignment, named styles (for whole paragraphs or selected characters) and illustrations; formats are stored in the work's .vela, the TXT stays plain text. Open a .vela to edit the work configuration and its TXT formats on two pages. Glossaries (.gly) open as a list: tap an entry to edit it, long-press to copy it; changes save automatically. Plugins and components can be downloaded from the online component catalog under More → Plugins & components.
`;
export async function isOriginalDemo(doc) {
  if(doc.name!=='长篇小说.txt'||doc.remote||doc.text.length!==846)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')==='ba39e755fbaf6d6344db635df1fa62d874b9fa84657e965a72ad9a0f0f3c26da';
}
