# Windows 版本

Vela Windows 与移动版本使用同一套编辑、阅读、章节识别、GitHub、订阅和插件功能。桌面窗口默认 1280×850，支持缩放、多列书库、鼠标、键盘及触摸板；阅读模式进入全屏，返回书库后恢复窗口。系统菜单提供新建、保存、导入、导出和编辑命令。

发布包含 Windows x64 安装程序与 ZIP。ZIP 解压后运行 `Vela.exe`，文稿仍保存在当前 Windows 用户的应用数据目录，并非 ZIP 目录。内部数据默认位于 `%APPDATA%\vela-windows\workspaces\Vela`；实际路径可在应用内部文件夹标题的提示中查看。删除安装目录不删除文稿，卸载程序默认保留应用数据。

GitHub 访问令牌使用 Windows DPAPI 加密，保存于应用数据目录，文稿、配置和导出备份不包含令牌。HTML 在隔离的系统 Chromium Web 组件中显示，默认禁用用户脚本；独立预览可明确启用本地脚本，预览页面不包含文件管理或账号桥。TeX 与 PDF 使用随应用打包的本地引擎，离线可编译。

Windows 包目前没有 Authenticode 发布证书，安装程序未签名。移动版本继续使用原有发布签名。

开发构建：在项目根目录运行 `npm ci`，在 `windows` 目录运行 `npm ci`，然后回到根目录运行 `npm run build:windows`。需要 Node.js 22.12+，Windows x64。首次安装 Electron 会下载运行时，需要能够连接其官方发布源。自动测试使用独立临时数据目录。
