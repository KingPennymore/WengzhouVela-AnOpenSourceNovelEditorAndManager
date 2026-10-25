# Gitea 文稿同步

仓库页选择 **Gitea**，填写服务器的 HTTPS 站点地址，再使用个人访问令牌登录。
支持端口和部署子目录，例如 `https://git.example.com:8443/team`；不要附加 `/api/v1`、仓库路径、查询参数或令牌。
首版使用系统信任的 HTTPS 证书，不提供跳过证书检查或 HTTP 登录。

在该服务器的用户设置中生成令牌。使用带权限范围的令牌时，授予 `read:user` 和 `write:repository`；
在应用内新建仓库还需要 `write:user`。账号自身还需要目标仓库的写权限。令牌只保存在各端安全凭据存储中，浏览器预览仅在内存中保存。
浏览器预览需要实例或反向代理允许该预览站点跨域访问；原生应用通过本机网络层访问。

支持仓库列表、新建及修改仓库、分支列表和创建分支、单文件读取/提交/删除、整个仓库或选中目录拉取、
工作区多文件提交、历史记录，以及已有的同步预览和冲突合并。操作方式和 GitHub/Gitee 相同，仍由用户主动拉取或提交。
订阅阅读来源和应用安装包下载源保持原来的范围，本次接入针对仓库文稿同步。

## 身份和凭据

Gitea 的服务器地址经过规范化：域名转小写、默认 443 端口及末尾斜杠移除，端口和部署路径保留。
仓库缓存、文稿的 remote 关联、工作区同步基线和冲突记录按 `provider + server + repo` 区分。
同一实例每次登录使用一个账号；更换账号先退出。不同实例的同名仓库不会共享同步基线。

Windows 的纯 JavaScript 地址校验模块 `windows/git-host.mjs` 同时由前端封装入口 `web/git-host.mjs` 使用，
使打包后的 Windows 主进程仍可独立校验请求。Android、HarmonyOS 的原生校验遵循相同规则。
Windows/Android/HarmonyOS 的 Gitea 凭据键均为 `gitea-` 加 `SHA256("gitea:" + canonicalServer)`。
请求仅发送到该实例的 `/api/v1`，关闭自动重定向，不将已有 GitHub/Gitee 凭据用于自定义实例。
浏览器的 CSP 仅对连接目标开放 HTTPS，以支持用户配置的实例；脚本、预览及其他来源限制不变。

## 接口和一致性

- API v1，单文件通过 Contents 接口，更新时使用已知 blob SHA，不抓取新 SHA 后强行覆盖。
- 工作区通过 `POST /repos/{owner}/{repo}/contents` 一次提交创建、更新、删除；文本按 UTF-8/Base64 编码。
- 提交前检查分支头，准备完文件列表后再次检查；更新和删除带上原文件 SHA，写入失败不自动重试。
  与 GitHub 更新 ref 的接口不同，Gitea 多文件接口没有客户端传入的整分支 compare-and-swap 条件；
  最后一次检查后的无关文件提交可能与本次提交共存。并发修改本次涉及的文件由服务端 SHA 检查拒绝。
- 列表使用 Gitea 的分页参数，短页不当作结束；目录树按 `total_count` 读取所有分页，拒绝不完整快照。
- 沿用单文件 8 MiB、一次工作区 64 MiB、目录及文件最多 5000 项的限制。
- 较旧或定制的实例若不支持相应接口会显示错误，不降级成可能部分成功的逐文件工作区提交。

官方参考：[API v1.25](https://docs.gitea.com/api/1.25/operations/repo-change-files/)。

## 验证

`npm run test:gitea` 运行适配器及浏览器检查，覆盖自定义端口/子路径、登录失败、跨实例隔离、中文文件、
分页、不完整快照、冲突及宽窄屏登录页；常规 `npm run verify` 也包含这些单元和浏览器检查。

可另用官方 Gitea 可执行文件运行真实接口验证：

```powershell
$env:VELA_GITEA_BIN = 'C:/tools/gitea.exe'
node tests/gitea-live.mjs
```

脚本在临时目录创建仅监听回环地址的测试实例，使用临时测试账号，不连接用户线上仓库，结束后关闭并清理。
已使用校验过官方 SHA-256 的 **Gitea 1.25.4** 完成仓库、分支、中文及二进制文件、多文件提交、删除、历史和过期版本检查。
Windows 的 `node tests/gitea-windows.mjs` 另验证原生网络边界、DPAPI 凭据隔离、重载和退出登录。
Android 与 HarmonyOS 已通过编译/构建；Android 原生凭据检查收录在专用模拟器测试中，本次未运行真机或模拟器检查。
这不代表所有旧版及第三方修改版本均已验证。
