import {shortcuts} from './shortcuts.mjs';
export const guide = `文舟操作指南

一、文件与章节
在“新建文件”中创建 TXT、Markdown、HTML 或 CSV 文件。整部小说可写在一个 TXT 文件中，使用“第一章 标题”等章节标题自动生成目录。Tab 在正文插入两个全角空格；Shift+Tab 取消行首缩进。
标签右侧的 × 关闭标签，本地文件保留。文件及文件夹的“···”菜单支持重命名、移动、复制、剪切、副本、属性及回收站；删除后可从当前工作区回收站恢复。没有操作指南.txt 时，重启进入启动页，从最近文件继续写作。
文件侧栏仅由左上角文件夹按钮展开或收起；切换文件、Git 页面和专注模式均保持侧栏状态。

二、保存与 GitHub
首次启动直接使用内部工作区，无需文件访问授权。内部文稿会随清空应用数据或卸载应用而删除，请定期导出或同步。全部本地文件保存在内部工作区；子目录和空文件夹显示在侧栏。Ctrl+S 保存到当前工作区；导出另存独立文件，设置中可导出全部文稿备份。
章节始终自动识别中英标题及 Markdown 标题。可在设置中添加多个标题模板，每行一个，例如“幕{序号}：{标题}”和“Episode {number}: {title}”；这些模板与标准标题同时识别。
底部 Git 用于连接 GitHub，推荐选择“使用访问令牌”，再选择仓库和提交当前文件；仓库页可拉取整个仓库。同仓库同路径文件再次拉取会覆盖本地内容，不同仓库或不同目录的同名文件保留独立文件。

三、外观与阅读
默认跟随系统深浅模式，也可在设置中固定浅色或深色，并选择青松、玉石、墨竹、麦田、石墨配色。双指在正文区域缩放只改变文字字号；工具栏大小不变。标签旁可切换源码与预览，HTML 支持隔离阅读，CSV 显示可编辑表格，并识别逗号、分号和 Tab 分隔。
Markdown 支持 .md、.markdown、.mdown、.mkd 文件；可使用格式栏编辑标题、加粗、斜体、删除线、代码、列表和引用。预览支持表格、任务列表及工作区内的图片。扩展名错误时，可点击标签旁的文件类型手动指定格式。

四、Acode 插件
打开“Acode 插件”，选择本地插件 ZIP 安装。支持 JavaScript 插件生命周期、CodeMirror、编辑器事件、命令、设置与包内资源。Android / Cordova、Ace 和未实现的 Acode 模块不能在鸿蒙上直接运行；加载失败会显示具体原因。插件注册的命令在命令面板中可用。

五、快捷键
Tab：两个全角空格
Shift+Tab：取消行首缩进
${shortcuts.map(([, ,key,name])=>`${key}：${name}`).join('\n')}
Ctrl+加号 / 减号：增大 / 减小文字字号
Ctrl+0：重置文字字号

可随时从启动页再次打开本操作指南。
`;
export async function isOriginalDemo(doc) {
  if(doc.name!=='长篇小说.txt'||doc.remote||doc.text.length!==846)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')==='ba39e755fbaf6d6344db635df1fa62d874b9fa84657e965a72ad9a0f0f3c26da';
}
