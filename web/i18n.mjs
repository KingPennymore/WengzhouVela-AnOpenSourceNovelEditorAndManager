import {planningTranslations} from './planning-i18n.mjs';
import {appTranslations} from './i18n-app.mjs';
import {editorTranslations} from './i18n-editor.mjs';
import {extensionsTranslations} from './i18n-extensions.mjs';
import {shellTranslations} from './i18n-shell.mjs';
import {syncTranslations} from './i18n-sync.mjs';
import {viewsTranslations} from './i18n-views.mjs';
let language='zh-CN',observer,scheduled=false;
const originals=new WeakMap(),attributes=new WeakMap();
const dictionary={'恢复上次配置':'Restore previous configuration','独立预览':'Open separate preview','在独立页面中调试 HTML':'Debug HTML in a separate page','当前章节':'Current chapter','编译引擎':'Typesetting engine','编译 PDF':'Compile PDF','导出 PDF':'Export PDF','编译日志':'Compilation log','正在编译…':'Compiling…','编译完成':'Compilation complete','已取消':'Cancelled','编译失败':'Compilation failed','编译失败，请查看日志与缺失宏包。':'Compilation failed. Check the log and missing packages.','多选':'Select multiple','全选本页':'Select this page','拉取选中项':'Pull selection','取消多选':'Cancel selection','已选 ':'Selected ','代码':'Code','行':'Rows','列':'Columns','VELA 工作区配置':'VELA workspace configuration','模板需包含 {序号} 或 {标题}。':'A template must contain {number} or {title}.',"编辑 CSV 源码":"Edit CSV source","支持 TXT、Markdown、HTML、CSV；TXT 小说的全部章节可写在同一文件中。":"Supports TXT, Markdown, HTML and CSV. A whole novel can be written in one TXT file.","目标路径":"Destination path","填写包含文件名或文件夹名称的相对路径。":"Enter a relative path including the file or folder name.","不会删除 GitHub 中的文件。":"GitHub files will remain.","在当前小说文件的末尾追加章节，保留现有正文。":"Append a chapter to this novel while preserving its existing text.","正在读取 GitHub 仓库…":"Loading GitHub repositories…","细粒度令牌需授予目标仓库 Contents 读写权限及 Metadata 读取权限；创建、修改仓库还需相应管理权限。令牌不会写入文稿或日志。":"Grant your fine-grained token Contents read/write and Metadata read permissions. Creating or modifying repositories requires the corresponding administrative permissions. Tokens are never written to documents or logs.","设备授权请在文舟应用中使用。浏览器预览可以使用个人访问令牌。":"Use device authorization in the Vela app. Browser previews can use a personal access token.","在 GitHub 开发者设置中注册 OAuth App 并启用 Device Flow。只填写 Client ID，无需 Client Secret。本次授权请求 repo 与 read:user 权限。":"Register a GitHub OAuth app with Device Flow enabled. Enter its client ID; no client secret is required. Authorization requests repo and read:user permissions.","获取授权码":"Get authorization code","正在获取设备授权码…":"Requesting an authorization code…","请在 GitHub 页面输入以下授权码：":"Enter this code on GitHub:","打开 GitHub 授权页面 ↗":"Open GitHub authorization ↗","将在当前账号下新建仓库并初始化 README。":"Create a repository under the current account with a README.","修改会直接更新 GitHub 仓库的名称与简介。":"This updates the repository name and description on GitHub.","↰ 上级目录":"↰ Parent directory","上级目录":"Parent directory","文件夹":"Folder","打开":"Open","正在从 Gitee / GitHub 检查新版本…":"Checking Gitee / GitHub for a new version…","发现新版本":"New version available","正在整理更新信息…":"Preparing update details…","组件更新":"Component updates","在插件与组件中更新":"Update in Plugins and components","发布清单签名已验证。":"Release manifest signature verified.","签名机制启用前的旧版发布，校验值只采信 GitHub。":"Legacy release from before signing; checksums are trusted from GitHub only.","安装包较大，建议在 Wi‑Fi 下下载。":"The installer is large; Wi‑Fi is recommended.","鸿蒙版不能在应用内安装，请在发布页或应用市场获取新版本。":"The HarmonyOS version cannot install updates in the app; get the new version from the release page or the app store.","未找到适用于此设备的安装包，请在发布页下载。":"No installer for this device was found; download it from the release page.","浏览器预览版请在发布页下载对应平台的安装包。":"For the browser preview, download the installer for your platform from the release page.","打开发布页":"Open release page","点击“立即安装”会保存文稿、关闭文舟并启动安装程序。":"“Install now” saves your documents, closes Vela and starts the installer.","点击“立即安装”打开系统安装器；首次使用需要允许文舟安装应用。":"“Install now” opens the system installer; the first time, allow Vela to install apps.","立即安装":"Install now","当前文稿尚未保存，已取消更新安装。":"The current document is not saved; the update installation was cancelled.","页":"Page","移动项目":"Move item","新标题需要符合自动识别规则。":"The new title must match the chapter detection rules.","删除和移动会先保留本地历史，也可以在当前编辑器撤销。":"Deleting and moving keep local history first, and can be undone in the current editor.","文字位置有多处匹配，请重新确认标记。":"The text matches in several places; please confirm the mark again.","已自动保存":"Saved automatically","正在保存…":"Saving…","术语库名称":"Glossary name","修改会自动保存":"Changes are saved automatically","搜索词条、别名或释义…":"Search terms, aliases or definitions…","新建词条":"New term","按分类筛选":"Filter by category","个词条":"terms","点按查看，长按复制词条":"Tap to view, long-press to copy a term","没有匹配的词条":"No matching terms","还没有词条。点“新建词条”添加人物、地名、设定等。":"No terms yet. Choose “New term” to add characters, places, settings and more.","无释义":"No definition","已复制":"Copied","复制失败：":"Copy failed:","全部词条":"All terms","填写词条后自动保存":"Saved automatically once the term is filled in","上一条":"Previous","下一条":"Next","人物、地名、设定…":"Characters, places, settings…","复制词条":"Copy term","已删除":"Deleted","显示更多":"Show more","将填充保存为独立地形":"Save fills as separate terrain","保留形状和颜色，转换后可用选择工具点选、拖动和设置地形。":"Shapes and colours are kept; after converting, use the select tool to pick, drag and edit the terrain.","移除已转换区域的普通绘制点；信息、箭头引用及未封闭的绘制点会保留。应用后可撤销，保存并关闭后不再保留原始普通绘制点。":"Plain drawn points inside converted areas are removed; information points, arrow references and unclosed drawings are kept. You can undo after applying; once saved and closed, the original plain points are gone.","移除 {n} 个绘制点，保留 {k} 个关联点。文件 {a} → {b} KB；复杂轮廓可能增大文件。":"Removes {n} drawn points and keeps {k} linked points. File {a} → {b} KB; complex outlines may make the file larger.","查找地点，定位到地图":"Find a place and locate it on the map","搜索信息点":"Search information points","搜索名称或备注":"Search names or notes","筛选列表类别":"Filter list by category","全部类别":"All categories","{n} / {m} 个信息点":"{n} / {m} information points","未命名信息点":"Untitled information point","定位":"Locate","没有匹配的信息点":"No matching information points","使用信息点工具，在地图上添加地点。":"Use the information point tool to add places to the map.","按类别控制地图上的名称，圆点与图标始终保留。":"Show or hide names on the map by category; dots and icons always stay.","全部显示":"Show all","全部隐藏":"Hide all","添加信息点后可设置名称显示。":"Add information points to control which names are shown.","未分类":"Uncategorized","类别":"Category","其他":"Other","元素图标":"Element icon","无图标":"No icon","暂不可用":"Unavailable","圆点标记位置，图标显示在上方":"The dot marks the position; the icon appears above it","地形元素":"Terrain element","填充区域":"Filled area","不透明度":"Opacity","保存地形":"Save terrain","删除地形":"Delete terrain","地形":"Terrain","信息点目录":"Information point directory","地图名称类别":"Map name categories","正在生成填充…":"Generating fill…","填充预览计算失败，请使用地图整理重试。":"Could not compute the fill preview; try again from Map cleanup.","方向键选择节点，回车查看":"Arrow keys select a node, Enter opens it","点击图中区域放大 · 方向键选择节点":"Click an area to zoom in · Arrow keys select a node","排版工具":"Typesetting tools","停止输入 2 秒后自动编译":"Compile automatically 2 seconds after typing stops","自动编译":"Auto compile","适合宽度":"Fit width","在 PDF 中定位光标所在行":"Locate the cursor line in the PDF","定位到 PDF":"Locate in PDF","PDF 页面":"PDF pages","点击“编译 PDF”生成预览。":"Choose “Compile PDF” to generate a preview.","个错误":"errors","个警告":"warnings","请先编译 PDF。":"Compile the PDF first.","当前行没有可定位的正文。":"The current line has no text to locate.","未在 PDF 中找到当前行。":"The current line was not found in the PDF.","已定位到第 {n} 页":"Located on page {n}","未在源码中找到这段文字。":"This text was not found in the source.","收起侧栏":"Collapse sidebar","管理排版组件":"Manage typesetting component","请在插件与组件列表中安装并启用排版组件":"Install and enable the typesetting component in Plugins and components","全局配置":"Global settings","内置":"Built-in","TXT 格式工具":"TXT format tools","启用后，TXT 文稿显示格式工具。已有格式的 TXT 总会显示。":"When on, TXT documents show format tools. TXT files that already have formats always show them.","命名样式":"Named styles","管理样式…":"Manage styles…","选中文字时样式只作用于选中的字；没有选中时作用于整段。":"With text selected, a style applies to the selection only; otherwise it applies to the whole paragraph.","文稿格式":"Document formats","文字格式":"Text formats","段落格式":"Paragraph formats","插图":"Illustrations","无格式":"No formats","待确认":"Needs review","移除格式":"Remove format","还没有 TXT 保存格式。打开 TXT 并使用格式工具后，格式记录会出现在这里。":"No TXT formats saved yet. Open a TXT and use the format tools, and the records appear here.","还有 {n} 个 0.9.7 的格式旁注（.txt.vela）。打开对应 TXT 并保存后，格式会并入此文件，旁注移入回收站。":"{n} format sidecars from 0.9.7 (.txt.vela) remain. Open and save the matching TXT to merge their formats into this file; the sidecar moves to the trash.","格式保存在此 .vela 中，TXT 正文保持纯文字。在文舟外改过正文后，格式按所在段落和原文重新定位，找不到的进入“待确认”。":"Formats are stored in this .vela and the TXT stays plain text. If the text was edited outside Vela, formats are relocated by paragraph and original text; those not found go to “Needs review”.","确认移除":"Confirm removal","TXT 格式":"TXT formats","中英文模板通用：{序号} / {number} 识别中文数字、阿拉伯数字、英文数字和罗马数字；{标题} / {title} 识别标题。":"Chinese and English templates both work: {序号} / {number} matches Chinese, Arabic, English and Roman numerals; {标题} / {title} matches the title.","自动包含文件夹内全部文稿":"Include every document in the folder automatically","勾选时不保存清单，新文件自动加入；取消勾选后按下方选择保存清单和顺序。":"When checked no list is saved and new files join automatically; when unchecked, the selection and order below are saved.","旧版格式旁注":"Legacy format sidecar","文舟 0.9.8 起，TXT 格式保存在作品配置 .vela 的“TXT 格式”页。打开同名 TXT 并保存后，这些格式会并入 .vela，此文件移入回收站。":"Since Vela 0.9.8, TXT formats are stored on the “TXT formats” page of the work's .vela. Open and save the TXT with the same name to merge these formats into the .vela; this file then moves to the trash.","行内格式":"Inline formats","插入内容":"Inserted content","切换到“源码”可直接查看 JSON。":"Switch to “Source” to view the JSON directly.","未安装":"Not installed","下载并安装":"Download and install","更新":"Update","已安装最新版":"Up to date","大小未知":"Size unknown","下载进度":"Download progress","正在校验并安装…":"Verifying and installing…","下载已取消。":"Download cancelled.","重新下载":"Download again","组件较大，建议在 Wi‑Fi 下下载。":"Components are large; Wi‑Fi is recommended.","浏览器预览版不能直接下载组件。请在文舟应用中使用此功能，或从 GitHub / Gitee 发布页下载 ZIP 后点击“从 ZIP 安装”。":"The browser preview cannot download components. Use the Vela app, or download the ZIP from the GitHub / Gitee release page and choose “Install from ZIP”.","签名已验证":"Signature verified","发布签名前的旧清单，仅接受 GitHub":"Legacy unsigned manifest; GitHub only","组件目录":"Component catalog","正在从 Gitee / GitHub 获取组件目录…":"Fetching the component catalog from Gitee / GitHub…","在线组件":"Online components","没有可下载的组件。":"No components available.","下载失败。":"Download failed.","无法获取组件目录：":"Could not load the component catalog:","取消拉取":"Cancel pull","文件路径":"File path","只提交此文稿。已关联文件使用上次读取的版本；同名远端文件不会被自动覆盖。发生冲突时，请到仓库页打开远端副本进行对照。":"Commit this document only, using its last-read revision. Existing remote files are not automatically overwritten. Open the remote file to compare if a conflict occurs.","拉取并覆盖此文件":"Pull and replace this file","Tab：缩进两个全角空格；Shift+Tab：取消缩进。Ctrl+加号 / 减号 / 0：调整或重置文字字号。":"Tab inserts two full-width spaces; Shift+Tab removes indentation. Ctrl + / − / 0 adjusts or resets text size.","从 ZIP 安装":"Install ZIP","支持 JavaScript / CodeMirror 插件。依赖 Android、Cordova、Ace 或未实现的 Acode 模块的插件会显示加载原因。":"Supports JavaScript / CodeMirror plugins. Plugins requiring unavailable Android, Cordova, Ace or Acode modules display a compatibility error.","卸载":"Uninstall","尚未安装插件。":"No plugins installed.","无法读取本地文稿":"Cannot load local documents","原始数据已保留，请勿清除应用数据。可先导出原始文件进行恢复。":"Original data is preserved. Export it for recovery before clearing application data.","导出原始数据":"Export original data","请先保存当前文稿。":"Save the current document first.","请选择 8 MB 以内的文本文件。":"Select a text file no larger than 8 MB.","请输入令牌。":"Enter an access token.","不允许的 GitHub 请求路径。":"This GitHub request path is not allowed.","登录已失效，请重新登录 GitHub。":"Your session has expired. Sign in to GitHub again.","请求受限：请检查令牌权限、组织授权或 GitHub 速率限制。":"Request restricted. Check token permissions, organization authorization and GitHub rate limits.","仓库、分支或文件不存在，或当前账号没有访问权限。":"The repository, branch or file does not exist or you do not have access.","远端版本已变化。请重新读取远端并对照修改，本地文稿已保留。":"The remote revision changed. Read and compare it before committing. Your local text is preserved.","GitHub 未接受此操作，请检查名称、权限及文件版本。":"GitHub rejected this operation. Check the name, permissions and file revision.","工作区配置不能超过 256 KB。":"Workspace configuration cannot exceed 256 KB.","不支持此 .vela 配置版本，请使用 version: 1。":"Unsupported .vela version. Use version: 1.","请填写工作区名称（最多 160 字符）。":"Enter a workspace name of up to 160 characters.","字号须在 10–40 之间。":"Font size must be between 10 and 40.","reading.files 必须是文件路径数组（最多 5000 项）。":"reading.files must be an array of up to 5000 file paths.","阅读文件路径必须为字符串。":"Reading file paths must be strings.","阅读清单只支持 TXT、Markdown、HTML 和 CSV。":"Reading lists support TXT, Markdown, HTML and CSV.","titleTemplates 必须是字符串数组。":"titleTemplates must be an array of strings.","最多添加 32 个标题模板。":"Add up to 32 chapter templates.","单个标题模板最多 256 字符。":"Each template may contain up to 256 characters.","提交文稿到 GitHub":"Commit document to GitHub","拉取到工作区":"Pull into workspace","搜索命令":"Search commands","关闭当前标签":"Close active tab","刷新工作区":"Refresh workspace","Markdown 加粗":"Markdown bold","Markdown 斜体":"Markdown italic","Markdown 删除线":"Markdown strikethrough","Markdown 行内代码":"Markdown inline code","Markdown 一级标题":"Markdown heading","Markdown 无序列表":"Markdown list","Markdown 任务列表":"Markdown task list","Markdown 引用":"Markdown quote","添加行":"Add row","添加列":"Add column","分隔符":"Delimiter","逗号":"Comma","分号":"Semicolon","制表符":"Tab","正文":"Text","已启用":"Enabled","已停用":"Disabled","Git 仓库与提交":"Git repositories and commits",'拉取文件':'Pull files','仅拉取阅读清单':'Only reading-list files','保存到内部文件夹；对应 .vela 配置会同时保留，同路径文件覆盖。':'Save to the internal folder with associated .vela configurations. Same paths are replaced.','文件已拉取到内部文件夹。':'Files pulled into the internal folder.','创建 .vela 配置':'Create .vela configuration','提交整个工作区':'Commit entire workspace','仓库目录':'Repository directory','留空提交到仓库根目录':'Leave empty for repository root','提交说明':'Commit message','包含配置、文稿和附件；同路径文件覆盖，仓库其他文件保留。':'Includes configuration, documents and attachments. Same paths are replaced; other remote files remain.','工作区已提交到 GitHub。':'Workspace committed to GitHub.','提交到 GitHub':'Commit to GitHub','当前工作区没有文件。':'This workspace has no files.',
  '文舟':'Vela','开源小说创作 / 阅读工具':'Open-source novel writing / reading tool','主导航':'Main navigation','写作':'Write','阅读':'Read','订阅':'Subscriptions','GitHub 仓库':'GitHub repositories','文件':'Files','新建文件':'New file','新建小说文件':'New novel file','搜索文稿…':'Search documents…','搜索文稿':'Search documents','内部文件夹':'Internal folder','内部工作区':'Internal folder','刷新':'Refresh','新建工作区':'New workspace','新建文件夹':'New workspace','根目录':'Root','粘贴':'Paste','回收站':'Trash','名称':'Name','修改时间':'Modified','大小':'Size','本地文件':'Local files','导入':'Import','连接 GitHub':'Connect GitHub','仓库、分支与版本提交':'Repositories, branches and commits','退出当前账户':'Sign out','文件侧栏':'File panel','打开文件侧栏':'Toggle file panel','启动页':'Start page','已保存到本机':'Saved locally','未保存':'Unsaved','查找与替换':'Find and replace','预览 / 源码':'Preview / source','章节目录':'Chapters','专注模式':'Focus mode','外观模式':'Appearance','命令与快捷键':'Commands and shortcuts','Acode 插件':'Acode plugins','插件与组件':'Plugins and components','编辑器设置':'Settings','导出小说文件':'Export novel','小说文件':'Novel files','小说编辑器':'Novel editor','文稿正文':'Document text','列表':'List','任务':'Task','引用':'Quote','收起章节目录':'Hide chapters','筛选章节标题':'Filter chapters','＋ 追加章节':'+ Append chapter','定位当前章节':'Locate chapter','保存':'Save','撤回':'Undo','重做':'Redo','文件顶部':'File start','文件底部':'File end','章节顶部':'Chapter start','章节底部':'Chapter end','全文':'Entire document','取消':'Cancel','确定':'OK','关闭':'Close','源码':'Source','预览':'Preview','表格':'Table','文本':'Text','选择文件类型':'File type','文件类型':'File type','编辑格式':'Format','按扩展名识别':'Detect extension','纯文本':'Plain text','CSV 表格':'CSV table','文件工作区':'File workspace','导入文件':'Import files','操作指南':'User guide','设置':'Settings','最近文件':'Recent files','暂无本地文件':'No local files','文件名':'File name','初始内容':'Initial content','单文件章节模板':'Single-file chapter template','空白文件':'Empty file','相对路径':'Relative path','工作区':'Workspace','工作区名称':'Workspace name','阅读文件':'Reading files','标题模板':'Chapter templates','文字字号':'Font size','字数规则':'Character counting','非空白字符（含标点）':'Non-whitespace characters (with punctuation)','仅文字与数字':'Letters and digits only','字数包含章节标题':'Include chapter headings','外观':'Appearance','跟随系统':'System','浅色模式':'Light','深色模式':'Dark','配色方案':'Color scheme','青松':'Pine','玉石':'Jade','墨竹':'Bamboo','麦田':'Wheat','石墨':'Graphite','语言':'Language','阅读方式':'Reading layout','上下滑动':'Vertical scrolling','左右翻页':'Horizontal pages','自动补全':'Autocomplete','导出全部文稿备份':'Export all documents','开源许可':'Open-source licenses','组件':'Component','许可全文':'License text','只读':'Read-only','书库':'Library','上一页':'Previous page','下一页':'Next page','打开 HTML 阅读':'Open HTML reader','暂无发布版本':'No releases yet','正在读取…':'Loading…','未找到 Changelog 文件':'No changelog found','正在刷新…':'Refreshing…','全选':'Select all','忽略':'Dismiss','删除订阅':'Unsubscribe','选择':'Select','订阅仓库':'Subscribe repository','订阅 GitHub 仓库以查看发布版本和更新日志。':'Subscribe to GitHub repositories to read releases and changelogs.','删除所选订阅？本地已保存的文件保留。':'Remove selected subscriptions? Saved local files will remain.','没有可阅读的文件，请在工作区 .vela 中选择阅读文件。':'No readable files. Select reading files in your workspace .vela configuration.','文件夹操作':'Folder actions','文件操作':'File actions','重命名':'Rename','移动':'Move','复制':'Copy','剪切':'Cut','保存副本':'Duplicate','导出文件':'Export file','属性':'Properties','移入回收站':'Move to trash','恢复':'Restore','永久删除':'Delete permanently','当前工作区的回收站为空。':'The trash is empty.','章节标题':'Chapter heading','追加章节':'Append chapter','GitHub 仓库管理':'GitHub repositories','← 返回编辑器':'← Back to editor','浏览与创建仓库、管理分支、读取文件并提交修改。':'Browse and create repositories, manage branches, read files and commit changes.','使用访问令牌':'Use access token','设备授权登录':'Device authorization','检测连接':'Test connection','仓库':'Repositories','＋ 新建仓库':'+ New repository','退出登录':'Sign out','搜索仓库名称…':'Search repositories…','搜索仓库':'Search repositories','暂无仓库，或没有匹配结果。':'No repositories or matching results.','还没有仓库简介。':'No description.','私有':'Private','公开':'Public','已归档':'Archived','← 返回仓库列表':'← Repository list','拉取整个仓库':'Pull repository','仓库设置':'Repository settings','提交当前文件':'Commit current file','分支':'Branch','＋ 新建分支':'+ New branch','正在读取文件…':'Loading files…','新建 GitHub 仓库':'New GitHub repository','仓库名称':'Repository name','简介':'Description','设为私有仓库':'Private repository','创建仓库':'Create repository','创建分支':'Create branch','分支名称':'Branch name','新建分支':'New branch','保存到 GitHub':'Save to GitHub','使用 GitHub 访问令牌':'GitHub access token','个人访问令牌':'Personal access token','验证并登录':'Verify and sign in','检测 GitHub 连接':'Test GitHub connection','正在检测连接…':'Testing connection…','GitHub 连接正常，可以继续登录。':'GitHub connection is available. You can sign in.','连接检测未通过。':'Connection test failed.','文稿保存在本机，GitHub 提交由你主动发起。':'Documents are stored locally. GitHub commits are initiated by you.','可留空并使用个人访问令牌。应用内不需要 Client Secret。':'Leave empty to use a personal access token. No client secret is required.','令牌使用 Android Keystore 加密保存在应用内部。':'Your token is encrypted with Android Keystore.','令牌保存在鸿蒙安全资产存储中。':'Your token is stored in HarmonyOS secure asset storage.','浏览器预览的令牌仅保留在内存中，刷新后需重新登录。':'Browser preview tokens remain in memory only; sign in again after reloading.','令牌不会写入文稿或日志。':'Tokens are never written into documents or logs.','已退出，设备上的文稿保留。':'Signed out. Local documents remain.','文件已保存到本机':'File saved locally.','文稿已导出':'Document exported.','工作区已刷新':'Workspace refreshed.','文件已导入工作区':'Files imported.','已移入回收站':'Moved to trash.','已保存副本':'Duplicate saved.','项目已移动或重命名':'Item moved or renamed.','已剪切，请选择目标文件夹后粘贴':'Cut. Select a destination folder and paste.','已复制，请选择目标文件夹后粘贴':'Copied. Select a destination folder and paste.','保存失败 · 请导出备份':'Save failed · Export a backup','没有找到文稿。':'No documents found.','没有匹配的章节。':'No matching chapters.','自动识别标准中英章节标题；额外模板保存在工作区 .vela 配置中。':'Standard Chinese and English headings are detected automatically. Additional templates belong in workspace .vela configurations.','每行一个模板，最多 32 个。使用 {序号}、{标题} 或 {number}、{title}。':'One template per line, up to 32. Use {number} and {title} placeholders.','配置无效，请切换源码修复。':'Invalid configuration. Switch to source to repair it.','保存配置':'Save configuration','暂无文件':'No files yet','此路径已存在。':'This path already exists.','此仓库已订阅。':'Already subscribed.','工作区配置已保存':'Workspace configuration saved.','请输入 HTTPS GitHub 仓库地址。':'Enter an HTTPS GitHub repository URL.','请输入仓库首页地址，例如 https://github.com/owner/repository。':'Enter a repository homepage, such as https://github.com/owner/repository.','当前版本':'Current version','安装本地插件 ZIP':'Install plugin ZIP','未安装插件':'No plugins installed','启用':'Enable','停用':'Disable','删除':'Delete','插件设置':'Plugin settings','返回':'Back'
};
Object.assign(dictionary,{
 '正在处理…':'Working…',
 '文稿操作':'Document actions','外观与布局':'Appearance and layout','扩展功能':'Extensions','应用':'App',
 '视图切换':'Switch view','绘图工具':'Drawing tools','导航与侧栏':'Navigation and sidebars','地图显示':'Map display','删除范围':'Deletion scope','大纲操作':'Outline actions',
 '令牌使用 Windows 安全存储加密保存在应用内部。':'Your token is encrypted using Windows secure storage.',
 '立即拉取？':'Pull now?', '订阅已添加。是否现在拉取仓库文件？取消后可在订阅详情中手动拉取。':'Subscription added. Pull repository files now? You can cancel and pull later from its details.',
 '使用全局 .vela 覆盖区域配置':'Override regional configurations with global .vela','编辑全局 .vela':'Edit global .vela','全局阅读配置':'Global reading configuration','工作区配置':'Workspace configuration','名称与章节':'Name and chapters','阅读排版':'Reading typography','行距':'Line spacing','上边距':'Top margin','下边距':'Bottom margin','左边距':'Left margin','右边距':'Right margin','第一章 航程':'Chapter 1 Voyage','文字与留白共同构成阅读节奏。调整排版后，阅读页面会使用这些设置。':'Text and space shape the rhythm of reading. The reader will use this typography.','清空选择':'Clear selection','文件不存在':'File missing','每行一个模板，使用 {序号}、{标题} 或 {number}、{title}。':'One template per line. Use {number} and {title} placeholders.', '行距须在 1–3.5 之间。':'Line spacing must be between 1 and 3.5.','阅读边距须在 0–240 px 之间。':'Margins must be between 0 and 240 px.'
});
Object.assign(dictionary,{'已同步远端 · 与上次版本一致':'Synced remotely · matches last version','清除冗余文件':'Clean up redundant files','查看保存状态与同步目标':'View save status and sync target','未关联远端':'No remote linked','远端目标':'Remote target','保存与同步状态':'Save and sync status','确认清理冗余文件':'Review redundant files','扫描并预览':'Scan and preview'});
Object.assign(dictionary,planningTranslations,appTranslations,editorTranslations,extensionsTranslations,shellTranslations,syncTranslations,viewsTranslations);
// Gitea and repository sync messages.
Object.assign(dictionary,{
 "请稍后重试":"Please try again later",
 "GitHub 返回的数据格式不正确。":"GitHub returned data in an unexpected format.",
 "列表超过 10000 条，请缩小仓库范围。":"The list exceeds 10,000 items. Narrow the repository scope.",
 "无效的 Git SHA":"Invalid Git SHA",
 "文件无法作为文本预览":"This file cannot be previewed as text",
 "请输入分支名称。":"Enter a branch name.",
 "仅支持 8 MB 以内的 UTF-8 文本文件。":"Only UTF-8 text files up to 8 MB are supported.",
 "GitHub 未提供可读取的文本内容。":"GitHub did not return readable text.",
 "此文件是二进制文件，无法作为文稿打开。":"This is a binary file and cannot be opened as a document.",
 "请填写提交说明。":"Enter a commit message.",
 "单次提交文稿不能超过 8 MB。":"A single committed document cannot exceed 8 MB.",
 "工作区须包含 1–5000 个文件。":"A workspace must contain 1–5000 files.",
 "工作区含重复文件路径。":"The workspace contains duplicate file paths.",
 "工作区文件不能超过 8 MB。":"Workspace files cannot exceed 8 MB.",
 "一次工作区提交不能超过 64 MB。":"A workspace commit cannot exceed 64 MB.",
 "远端分支已变化。":"The remote branch has changed.",
 "GitHub 未返回有效的设备授权码。":"GitHub did not return a valid device code.",
 "已取消登录。":"Sign-in cancelled.",
 "你已拒绝本次授权。":"You declined this authorization.",
 "设备授权失败。":"Device authorization failed.",
 "设备授权码已过期，请重新登录。":"The device code expired. Sign in again.",
 "远端更新":"Remote update",
 "配置修改可自动合并":"Configuration changes can be merged automatically",
 "相同":"Identical",
 "仅本地修改 · 保留":"Local changes only · kept",
 "本地修改 · 请选择处理方式":"Local changes · choose how to resolve",
 "未勾选的文件保留本地内容。拉取不会自动打开文稿。":"Unselected files keep their local content. Pulling does not open documents.",
 "此文件需要保留，请刷新并核对本地内容：":"This file must be kept. Refresh and check the local content:",
 "本地文稿已变化，请重新拉取。":"The local document has changed. Pull again.",
 "合并后的文件超过 8 MB。":"The merged file exceeds 8 MB.",
 "备份本地历史失败，未写入拉取文件。":"Backing up local history failed; pulled files were not written.",
 "此文件正在同步，请稍后重试。":"This file is syncing. Try again shortly.",
 "使用访问令牌登录":"Sign in with an access token",
 "在该 Gitea 站点的用户设置中生成令牌，授予用户信息读取和仓库读写权限；在应用内新建仓库还需用户写权限。":"Generate a token in the user settings of this Gitea site with user read and repository read/write permissions. Creating repositories in the app also requires user write permission.",
 "Gitea 仓库目录无效或超过 5000 项，工作区未修改。":"The Gitea repository tree is invalid or exceeds 5000 items. The workspace was not changed.",
 "Gitea 目录分页不完整，工作区未修改。":"Gitea returned an incomplete directory listing. The workspace was not changed.",
 "Gitea 返回的数据格式不正确。":"Gitea returned data in an unexpected format.",
 "Gitea 列表过大，请缩小仓库范围。":"The Gitea list is too large. Narrow the repository scope.",
 "工作区文件超过提交大小限制。":"Workspace files exceed the commit size limit.",
 "没有可提交的变更。":"There are no changes to commit.",
 "附件不可读":"Attachment unreadable",
 "正在同步，请等待完成后再切换分支。":"Syncing. Wait for it to finish before switching branches.",
 "本地保存失败，未切换分支。":"Saving locally failed; the branch was not switched.",
 "切换分支前确认":"Confirm before switching branches",
 "切换仅改变仓库浏览目标，不会将当前文稿重新关联到新分支，也不会自动拉取或提交。":"Switching only changes which branch you browse. It does not relink the current documents to the new branch, and nothing is pulled or committed automatically.",
 "保留本地变更并切换":"Keep local changes and switch",
 "请选择 1–5000 个文件或文件夹。":"Select 1–5000 files or folders.",
 "已取消拉取，工作区未修改。":"Pull cancelled. The workspace was not changed.",
 "GitHub 目录列表不完整，工作区未修改。":"GitHub returned an incomplete directory listing. The workspace was not changed.",
 "仓库超过 5000 个文件与目录，工作区未修改。":"The repository has more than 5000 files and folders. The workspace was not changed.",
 "仓库目录无效或超过 5000 项，工作区未修改。":"The repository tree is invalid or exceeds 5000 items. The workspace was not changed.",
 "选中的路径已不存在：":"The selected path no longer exists:",
 "仓库存在重复路径。":"The repository contains duplicate paths.",
 "仓库包含子模块，暂时无法完整拉取，工作区未修改。":"The repository contains submodules and cannot be pulled completely yet. The workspace was not changed.",
 "仓库文件超过 8 MB：":"Repository file exceeds 8 MB:",
 "仓库超过 64 MB，工作区未修改。":"The repository exceeds 64 MB. The workspace was not changed.",
 "无法读取仓库文件：":"Cannot read repository file:",
 "仓库文件超过限制：":"Repository file exceeds the limit:",
 "仓库文件大小不一致：":"Repository file size mismatch:",
 "依赖文件超过限制：":"Dependency exceeds the limit:",
 "依赖资源超过拉取限制。":"Dependencies exceed the pull limit.",
 "下载缓存清理失败，请重试。":"Clearing the download cache failed. Try again.",
 "扫描已关联仓库中远端已删除的旧文件。仅确认未修改的文件可移入回收站，本地独有文稿保留。":"Scan linked repositories for old files deleted remotely. Only files confirmed unmodified can be moved to the trash; local-only documents are kept.",
 "正在同步，请完成后再清理。":"Syncing. Finish before cleaning up.",
 "下载缓存已清理，文稿保留。":"Download cache cleared; documents kept.",
 "请先保存本地文稿。":"Save local documents first.",
 "仅处理远端已删除的旧文件；未勾选项继续保留。":"Only old files deleted remotely are handled; unselected items are kept.",
 "远端已删除 · 本地保留（勾选将重新上传）":"Deleted remotely · kept locally (select to upload again)",
 "请选择变更。":"Select changes.",
 "仍有本地与远端冲突，请先拉取并处理这些文件：":"Local and remote conflicts remain. Pull and resolve these files first:",
 "预览后文件已变化，请重新生成提交预览。":"Files changed after the preview. Generate the commit preview again.",
 "此文件夹已关联其他仓库或分支，请使用独立文件夹。":"This folder is linked to another repository or branch. Use a separate folder.",
 "本地路径属于其他分支，请使用独立文件夹。":"This local path belongs to another branch. Use a separate folder.",
 "删除预览超过大小限制。":"The deletion preview exceeds the size limit.",
 "缺少附件同步版本。":"The attachment sync revision is missing.",
 "附件已在本地修改。":"The attachment was modified locally.",
 "工作区根目录":"Workspace root",
 "工作区已提交到 Gitee。":"Workspace committed to Gitee.",
 "工作区已提交到 Gitea。":"Workspace committed to Gitea.",
 "正在同步，请等待完成后重试。":"Syncing. Wait for it to finish and try again.",
 "工作区已切换，请重新扫描。":"The workspace changed. Scan again.",
 "远端分支在预览后已变化，请重新拉取。工作区未修改。":"The remote branch changed after the preview. Pull again. The workspace was not changed.",
 "附件和回收站同步请在应用中操作。":"Sync attachments and the trash in the app.",
 "请输入有效的 HTTPS Gitea 服务器地址，例如 https://git.example.com。":"Enter a valid HTTPS Gitea server address, for example https://git.example.com.",
 "Gitea 服务器地址的端口或路径无效。":"The Gitea server address has an invalid port or path.",
 "不支持此代码托管平台。":"This code hosting platform is not supported.",
 "不允许的代码托管请求路径。":"This code hosting request path is not allowed.",
});

export function t(value){if(language!=='en')return value;const direct=dictionary[value];if(direct)return direct;
 // A fixed message followed by a path or name, e.g. "选中的路径已不存在：a/b.txt".
 const label=/^([^：]+：)(.+?)(。工作区未修改。)?$/.exec(value);if(label&&dictionary[label[1]])return dictionary[label[1]]+' '+label[2]+(label[3]?'. The workspace was not changed.':'');
return value.replace(/^(.+) 必须是对象。$/,'$1 must be an object.').replace(/^(.+) 必须是字符串。$/,'$1 must be a string.').replace(/^(.+) 必须是有限数字。$/,'$1 must be a finite number.').replace(/^(.+) 必须为布尔值。$/,'$1 must be a boolean.').replace(/^(.+) 超出允许范围。$/,'$1 is out of range.').replace(/^(.+) 不支持此值。$/,'Unsupported value for $1.').replace(/^(.+) 数量无效。$/,'Invalid count for $1.').replace(/^文舟 (\d+\.\d+\.\d+)/,'Vela $1').replace(/到文件顶部/g,'File start').replace(/到文件底部/g,'File end').replace(/到章节顶部/g,'Chapter start').replace(/到章节底部/g,'Chapter end').replace(/查找与替换/g,'Find and replace').replace(/保存 \(/g,'Save (').replace(/撤回 \(/g,'Undo (').replace(/重做 \(/g,'Redo (').replace(/字 · 行/g,'characters · line').replace(/^(\d+) 章$/,'$1 chapters').replace(/^本章 (\d+) 字 · 全文 (\d+) 字$/,'Chapter $1 chars · Total $2 chars').replace(/^行 (\d+)，列 (\d+)$/,'Ln $1, Col $2').replace(/^选中 (\d+) 字$/,'$1 selected chars').replace(/^关闭 (.*) \(Ctrl\+W\)$/,'Close $1 (Ctrl+W)').replace(/^(.+) 文稿操作$/,'$1 actions').replace(/^(.+) 文件操作$/,'$1 file actions').replace(/^第 (\d+) 页$/,'Page $1').replace(/^文字字号 (\d+) px$/,'Font size $1 px');}
export const getLanguage=()=>language;
// Sentences with values in them are written out in both languages; fixed strings go through t().
export const say=(zh,en)=>language==='en'?en:zh;
const skip=element=>element?.closest('.cm-editor,#preview:not(.vela-preview),[data-user-content],#license-text,.plugin-page-body,.doc-info strong,.tab-open strong,.reader-book strong,.reader-book small,#current-name,.chapter,.repo-card strong,.repo-card p,.reader-content,.csv-grid-stage,.outline-node-title,.outline-node-summary,.outline-node-detail,.outline-lines');
// Mutations only re-translate the changed subtrees; in Chinese t() is the identity and setLanguage() already restored
// every source string, so editor/status-bar updates (e.g. on each selection change) no longer walk the whole document.
let pending=new Set(),pendingAttributes=new Set();
function translateText(node){const parent=node.parentElement;if(!parent||skip(parent)||parent.matches('script,style,textarea'))return;const previous=originals.get(node),source=previous&&node.nodeValue===previous.translated?previous.source:node.nodeValue;const trimmed=source.trim(),translated=source.replace(trimmed,t(trimmed));originals.set(node,{source,translated});if(node.nodeValue!==translated)node.nodeValue=translated;}
function translateAttributes(element){if(skip(element))return;const cache=attributes.get(element)||{};for(const key of ['title','aria-label','placeholder']){if(!element.hasAttribute(key))continue;const value=element.getAttribute(key),old=cache[key],source=old&&value===old.translated?old.source:value,translated=t(source);cache[key]={source,translated};if(value!==translated)element.setAttribute(key,translated);}attributes.set(element,cache);}
function translateTree(root){if(root.nodeType===3){translateText(root);return;}if(root.nodeType!==1||!root.isConnected||skip(root))return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())translateText(node);if(root.matches('[title],[aria-label],[placeholder]'))translateAttributes(root);for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]'))translateAttributes(element);}
function translateDOM(roots=[document.body]){scheduled=false;if(!document.body)return;observer?.disconnect();const changed=[...pendingAttributes];pending=new Set();pendingAttributes=new Set();for(const root of roots)if(root?.isConnected)translateTree(root);for(const element of changed)if(element.isConnected)translateAttributes(element);
  observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});}
export function setLanguage(value){language=value==='en'?'en':'zh-CN';document.documentElement.lang=language;document.title=language==='en'?'Vela · Novel writing and reading':'文舟 · 小说创作与阅读';translateDOM();}
export function initI18n(value){observer=new MutationObserver(records=>{if(language!=='en')return;for(const record of records){const target=record.target.nodeType===1?record.target:record.target.parentElement;if(skip(target))continue;if(record.type==='childList')for(const node of record.addedNodes)pending.add(node);else if(record.type==='characterData')pending.add(record.target);else pendingAttributes.add(record.target);}if((pending.size||pendingAttributes.size)&&!scheduled){scheduled=true;queueMicrotask(()=>translateDOM([...pending]));}});setLanguage(value);}

Object.assign(dictionary,{'双页阅读':'Two-page reading'});

Object.assign(dictionary,{'全局默认配置':'Global defaults','作品配置':'Project configuration','作品信息':'Project information','编辑':'Editing','高级':'Advanced','简介':'Description','作者':'Author','封面':'Cover','继承':'Inherit','留空恢复继承':'Leave empty to inherit','编辑字号':'Editor text size','编辑行距':'Editor line spacing','缩进空格数':'Indentation spaces','正文最大宽度':'Maximum text width','自动换行':'Word wrap','自动补全':'Autocomplete','启用':'Enabled','关闭':'Disabled','自动':'Automatic','阅读字号':'Reading text size','阅读清单':'Reading list','个人书库':'Personal library','书库方式':'Library selection','自动书库':'Automatic library','自选书库':'Personal selection','采用作品推荐排版':'Use project typography','使用我的阅读排版':'Use personal typography','统一使用我的阅读排版':'Use personal reading typography','排版来源':'Typography source','章节标题页':'Chapter title page','独立标题页':'Separate title page','标题与正文同页':'Title with body','阅读顺序':'Reading order','每行一个已选路径；未列出的已选文件追加到末尾。':'One selected path per line. Other selected files are appended.','最终生效配置':'Effective configuration','主文件':'Main file','单文件配置':'Per-file overrides','选择文件':'Choose file','新工作区默认配置':'New workspace defaults','仅用于新建工作区；已有作品保持自己的配置。':'Applies only to new projects. Existing projects keep their settings.','恢复上次有效配置':'Restore last valid configuration','阅读与编辑仍使用上一次有效配置。':'Reading and editing use the last valid configuration.','搜索与标记':'Search and annotations','全文搜索':'Search book','批注':'Annotation','添加书签':'Add bookmark','添加批注':'Add annotation','书签':'Bookmark','位置待确认':'Location needs review','本地历史与恢复':'Local history and recovery','恢复所选版本':'Restore selected version','章节管理':'Manage chapters','工作区搜索与替换':'Search and replace workspace','词库与写作片段':'Glossary and snippets','书签、批注与写作标记':'Bookmarks, notes and writing marks','源码与预览并排':'Show source and preview side by side','检查更新':'Check for updates','自动检查更新':'Check for updates automatically','查看发布与安装包':'View release and installers','当前已是最新版本。':'You are up to date.','确认拉取文件':'Review download','写入选中文件':'Save selected files','确认提交变更':'Review changes','提交选中变更':'Commit selected changes','新增':'New','修改':'Modified','未变化':'Unchanged','删除远端文件':'Delete remote file','对照内容':'Compare content','此 PDF 未提供目录':'This PDF has no outline','章节':'Chapters','高级配置':'Advanced configuration'});

Object.assign(dictionary,{"筛选订阅": "Filter subscriptions", "全部": "All", "未读更新": "Unread updates", "已下载": "Downloaded", "刷新失败": "Refresh failed", "取消刷新": "Cancel refresh", "每本文稿最多保存 1000 个标记。": "Each book supports up to 1,000 annotations.", "表格操作": "Table operations", "删除行": "Delete row", "删除列": "Delete column", "按列排序": "Sort by column", "排序保留第一行表头": "Keep the first row as a header", "降序": "Descending", "应用修改": "Apply changes", "更改标题": "Rename chapter", "移动章节": "Move chapter", "删除章节及正文": "Delete chapter and body", "新标题": "New title", "移到第几个位置": "Move to position", "词库": "Glossary", "片段": "Snippets", "搜索": "Search", "替换为": "Replace with", "范围": "Scope", "当前工作区": "Current workspace", "当前文稿": "Current document", "内部文件夹全部文本": "All internal text files", "区分大小写": "Case sensitive", "预览替换": "Preview replacement", "确认批量替换": "Review replacement", "替换全部": "Replace all", "标记当前位置或选择文字": "Mark current location or selection", "待修改": "To revise", "内容": "Content"} );

Object.assign(dictionary,{'编辑模式':'Editing mode','小说':'Novel','小说缩进':'Novel indentation','两个全角空格':'Two full-width spaces','普通空格':'Spaces','滑动':'Slide'});

Object.assign(dictionary,{'当前显示缓存的仓库列表；网络恢复后请刷新，写入操作暂不可用。':'Showing cached repositories. Refresh when connected; writes are temporarily unavailable.','离线':'Offline'});

Object.assign(dictionary,{'更多操作':'More actions','设置分类':'Settings categories','外观与语言':'Appearance and language','工作区配置':'Workspace configuration','备份与应用':'Backup and app','工作区':'Workspaces','阅读文件':'Reading files','中英文模板通用：{序号} / {number} 识别中文数字、阿拉伯数字、英文数字和罗马数字；{标题} / {title} 识别标题。':'Templates work in both languages: {序号} / {number} match Chinese, Arabic, English and Roman numerals; {标题} / {title} match the heading text.'});

Object.assign(dictionary,{'术语库':'Glossary','术语库文件':'Glossary files','新建术语库':'New glossary','词条':'Term','添加词条':'Add term','删除词条':'Delete term','保存术语库':'Save glossary','搜索词条…':'Search terms…','搜索词条':'Search terms','暂无匹配词条':'No matching terms','分类':'Category','别名':'Aliases','释义':'Definition','多个别名用逗号分隔':'Separate aliases with commas','选中词加入术语库':'Add selection to glossary','术语库已保存':'Glossary saved','词条已加入术语库':'Term added to glossary','请先选中要加入术语库的词汇。':'Select a term first.','新术语库文件名':'New glossary filename','加入后会将术语库关联到当前工作区配置。':'This links the glossary to the current workspace configuration.','每行一个 .gly 或 .glossary 相对路径':'One relative .gly or .glossary path per line','路径相对于当前配置文件；留空继承，输入 [] 停用术语库。':'Paths are relative to this configuration. Leave empty to inherit; enter [] to disable.','词条须为 1–120 字符且不能换行。':'Terms must contain 1–120 characters without line breaks.'});

Object.assign(dictionary,{'阅读进度':'Reading progress'});

Object.assign(dictionary,{'术语库最多 1 MB。':'Glossaries are limited to 1 MB.','术语库需要 version: 1 和 entries 数组（最多 5000 项）。':'A glossary needs version: 1 and an entries array of up to 5,000 terms.','词条 ID 重复或无效。':'Term IDs must be valid and unique.','释义最多 4000 字符。':'Definitions are limited to 4,000 characters.','分类最多 120 字符。':'Categories are limited to 120 characters.','别名须为词语数组（最多 32 项）。':'Aliases must be an array of up to 32 terms.','术语库名称最多 160 字符。':'Glossary names are limited to 160 characters.','术语库文件需要 .gly 或 .glossary 后缀。':'Glossary filenames need a .gly or .glossary extension.','请选择当前工作区内的术语库。':'Choose a glossary inside the current workspace.','当前 .vela 配置无效，请先修复。':'Repair the current .vela configuration first.','editor.glossaries 须为术语库相对路径数组（最多 32 项）。':'editor.glossaries must contain up to 32 relative glossary paths.','术语库路径不能重复。':'Glossary paths must be unique.'});

Object.assign(dictionary,{'返回书库':'Back to library'});

Object.assign(dictionary,{'术语':'Term','正文':'Text','关键词':'Keyword','函数':'Function','变量':'Variable','类':'Class','属性':'Property','方法':'Method','类型':'Type','命名空间':'Namespace','常量':'Constant'});

Object.assign(dictionary,{'正文名词候选补全':'Suggest names from manuscript','正文与术语库同屏':'Show glossary alongside manuscript','正文术语高亮与释义':'Highlight glossary terms and definitions','本地推测人名、地名等候选，不自动加入术语库。':'Infer names locally without adding them to glossaries.','正文候选':'Manuscript candidate','候选':'Candidate','从当前正文推测，未加入术语库。':'Inferred from this manuscript; not in a glossary.','提交记录':'Commit history','暂无提交记录':'No commits','差异过长，仅显示前 300 行。':'Long diff: showing the first 300 lines.','对照内容':'Compare changes','二进制附件':'Binary attachment','取消拉取':'Cancel download'});

Object.assign(dictionary,{'查找':'Find','输入要查找的内容':'Search text','输入替换内容，可留空':'Replacement text (may be empty)','上一处':'Previous','下一处':'Next','选择全部匹配':'Select all matches','替换当前':'Replace current','全部替换':'Replace all','全词匹配':'Whole words','正则表达式':'Regular expression','输入内容开始查找':'Enter text to search','正则表达式无效':'Invalid regular expression','没有找到匹配内容':'No matches found','处匹配':'matches','关闭查找与替换':'Close find and replace','本地内容':'Local content','远端内容':'Remote content','合并结果':'Merged result','冲突':'Conflict','保留本地这一段':'Keep local section','采用远端这一段':'Use remote section','编辑这一段的合并内容':'Edit merged section','确认这一段':'Confirm section','缺少共同版本，请核对完整文件。':'No common version. Review the entire file.','尚待处理的冲突':'Unresolved conflicts','冲突已处理，可保存合并结果。':'Conflicts resolved. The merged result can be saved.','正在同步…':'Syncing…','同步失败':'Sync failed','本地已修改 · 待同步':'Local changes · Pending sync','已与远端同步':'Synced with remote','导入离线排版组件':'Import offline typesetting components','离线排版组件已就绪':'Offline typesetting components are ready','分别导入引擎包和中文包':'Import both the engine and Chinese packages','引擎':'Engine','中文':'Chinese','正在校验并保存组件…':'Verifying and saving components…'});

Object.assign(dictionary,{
 '重置筛选':'Reset filters',
 '仅筛选下方列表，不改变地图上的名称。':'Only filters the list below; map labels stay unchanged.',
 '返回启动页':'Back to start',
 '启动页操作':'Start page actions',
 '开始新的文稿或工作区文件':'Start a manuscript or workspace file',
 '从设备添加文稿与阅读文件':'Add writing and reading files from your device',
 '继续查看或编辑已有文件':'Continue reading or editing existing files',
 '连接 GitHub / Gitee，管理与同步文件':'Connect GitHub / Gitee to manage and sync files',
 '了解文舟的功能与使用方法':'Learn about Vela and how to use it',
 '查找操作与键盘快捷键':'Find commands and keyboard shortcuts',
 '安装、启停和管理扩展功能':'Install, enable and manage extensions',
 '调整外观、语言与编辑偏好':'Adjust appearance, language and editor preferences'
});
Object.assign(dictionary, {
 '字体':'Font',
 '界面与正文字体':'Interface and text font',
 '获取系统字体':'Get system fonts',
 '点击获取本机可用字体；浏览器可能会请求授权。':'Get fonts available on this device. Your browser may ask for permission.',
 '海风吹过港湾，文舟记录故事。':'The sea breeze crosses the harbour. Vela records the story.',
 '用于界面、正文编辑和普通阅读；文档指定样式与 PDF 排版保持原样。':'Used for the interface, editing and plain text reading. Document styles and PDF typography are preserved.',
 '文舟默认':'Vela default',
 '跟随系统字体':'System font',
 '当前设置':'Current selection',
 '正在读取系统字体…':'Loading system fonts…',
 '已读取本机可用字体。':'Fonts available on this device are ready.',
 '系统未提供可选字体，仍可使用默认或跟随系统。':'No selectable fonts were provided. You can still use Vela default or the system font.',
 '未能读取字体列表，可重试或选择跟随系统字体。':'Could not read the font list. Retry or choose the system font.',
});

Object.assign(dictionary, {
 '连接 GitHub / Gitee / Gitea':'Connect GitHub / Gitee / Gitea',
 '连接 GitHub / Gitee / Gitea，管理与同步文件':'Connect GitHub / Gitee / Gitea to manage and sync files',
 'Gitea 服务器地址':'Gitea server address',
 '填写 HTTPS 站点地址，可包含端口和部署子目录。':'Enter an HTTPS site address, including its port and deployment subpath if needed.',
 '在该 Gitea 站点的用户设置中生成令牌，授予用户信息读取和仓库读写权限；在应用内新建仓库还需用户写权限。令牌由平台安全存储保存，不会写入文稿或日志。':'Generate a token in your Gitea user settings with user read and repository write access. Creating repositories also needs user write access. Tokens are kept in secure platform storage, outside documents and logs.'
});

Object.assign(dictionary, {
 '本地与上次同步版本一致':'Local content matches the last synced version',
 '远端已删除 · 本地保留':'Deleted remotely · Kept locally',
 '应用选中变更':'Apply selected changes',
 '远端已删除 · 勾选后移入回收站':'Deleted remotely · Select to move to trash',
 '远端已删除 · 本地有修改，保留':'Deleted remotely · Local edits are kept',
 '远端已删除 · 无法确认本地版本，保留':'Deleted remotely · Unverified local content is kept',
 '此路径属于其他分支或仓库 · 保留':'This path belongs to another branch or repository · Kept locally',
 '远端删除项默认不勾选。只有确认未修改的文件可以移入回收站，本地独有文件保留。':'Remote deletions are unchecked by default. Only verified unchanged files can be moved to trash. Local-only files are kept.'
});

Object.assign(dictionary, {
 '表格编辑':'Table editing', '表格阅读':'Table reading', '阅读正文':'Document text',
 '首行为表头':'First row as header', '表格分隔符':'Table delimiter', '概览阈值':'Overview threshold',
 '重置列宽':'Reset column widths', '恢复原始显示顺序':'Restore original row order',
 '在表格中查找':'Find in table', '筛选行':'Filter rows', '下一处':'Next',
 '选中':'Selected', '合计':'Total', '平均':'Average', '选择单元格':'Select a cell', '编辑单元格':'Edit cell',
 '表格导航':'Table navigation', '调整列宽':'Resize column', '扩大选区':'Extend selection',
 '适应宽度':'Fit width', '适应全表':'Fit', '缩放比例':'Zoom level', '放大':'Zoom in', '缩小':'Zoom out',
 '正在读取表格…':'Reading table…', '各行列数不一致':'Rows have different column counts',
 '在源码中定位':'Locate in source',
 '当前文稿暂不可编辑，请稍后重试。':'This document cannot be edited right now. Try again later.',
 '表格已变化，请重新打开单元格。':'The table changed. Reopen the cell.',
 '新增行':'Add row', '新增列':'Column',
 '在上方插入行':'Insert row above', '在下方插入行':'Insert row below', '删除行':'Delete row',
 '上移行':'Move row up', '下移行':'Move row down',
 '在左侧插入列':'Insert column left', '在右侧插入列':'Insert column right', '删除列':'Delete column',
 '左移列':'Move column left', '右移列':'Move column right',
 '升序 · 仅显示':'Ascending · Display only', '降序 · 仅显示':'Descending · Display only',
 '升序 · 写入文件':'Ascending · Write to file', '降序 · 写入文件':'Descending · Write to file',
 '清空选择':'Clear selection', '清空选区':'Clear selection',
 '表格不能超过 8 MB。':'Tables cannot exceed 8 MB.',
 'CSV 引号格式不正确。':'CSV quoting is invalid.',
 '表格超过 200000 个单元格，请拆分文件或使用源码查看。':'The table exceeds 200,000 cells. Split the file or use source view.',
 'CSV 结束引号后只能跟分隔符或换行。':'A closing CSV quote must be followed by a delimiter or newline.',
 'CSV 存在未闭合的引号，请切换到源码修正。':'A CSV quote is not closed. Fix it in source view.',
 '行号或列号无效。':'Row or column number is invalid.',
 '表格超过 200000 个单元格。':'The table exceeds 200,000 cells.',
 '表格改动重叠。':'Table changes overlap.'
});
Object.assign(dictionary, {
 '找回最近删除的文件':'Recover recently deleted files',
 '恢复到原位置；永久删除后无法找回。':'Restore to the original location. Permanent deletion cannot be undone.',
 '搜索回收站':'Search trash','搜索名称或原路径':'Search name or original path',
 '恢复所选':'Restore selected','永久删除所选':'Delete selected permanently',
 '全选当前列表':'Select all shown','已删除的文件':'Deleted files','没有匹配的项目':'No matching items',
 '已选择 {n} 项':'{n} selected','{n} 项':'{n} items',
 '永久删除选中的 {n} 项？':'Permanently delete {n} selected items?',
 '此操作无法恢复。':'This action cannot be undone.',
 '正在处理 {done}/{total}':'Processing {done}/{total}', '已完成 {n} 项':'Completed {n} items'
});

Object.assign(dictionary, {
 '搜索章节':'Search chapters','上移章节':'Move chapter up','下移章节':'Move chapter down',
 '搜索批注或原文':'Search notes or quoted text','暂无批注':'No annotations','删除所选':'Delete selected',
 '文稿已变化，请重新预览。':'The document changed. Reopen the preview.',
 'PDF 页面尺寸无效。':'Invalid PDF page dimensions.',
 '回收站批量项目无效。':'Invalid trash selection.'
});

Object.assign(dictionary,{'左栏视图':'Left sidebar views','右栏视图':'Right sidebar views','全局':'Global','本作品':'This project','默认':'Default','跟随应用设置':'Follow app setting','常用于整段':'Usually for paragraphs','常用于文字':'Usually for text','默认配置':'Default configuration','转换地形':'Convert terrain'});
