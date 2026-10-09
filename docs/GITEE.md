# Gitee 登录与仓库

在仓库连接页或访问令牌登录对话框中选择 **GitHub** 或 **Gitee**。Gitee 使用私人令牌，需授予 `user_info` 与 `projects` 权限；设备授权登录仍用于 GitHub。

Gitee 支持仓库列表、创建与修改仓库、分支切换与创建、文件读取、按固定提交拉取仓库、单文件提交与删除、提交历史和工作区多文件提交。多文件提交使用 Gitee 的 `POST /repos/{owner}/{repo}/commits`，一次发送新增、修改、删除及二进制附件；变更预览后检查分支版本，更新和删除同时传入文件最后提交版本。

GitHub 与 Gitee 的安全凭据、本地文件关联和同步基线相互隔离。旧版未标记平台的仓库关联继续视为 GitHub。浏览器预览只在内存保留令牌；应用版分别使用鸿蒙安全资产、Android Keystore 或 Windows 安全存储。

订阅入口目前仍接受 GitHub 地址。Gitee 的令牌、仓库读写适配依据 [Gitee 官方 API v5 文档](https://gitee.com/api/v5/swagger)。自动验证使用模拟凭据和响应，不向真实账号提交变更。
