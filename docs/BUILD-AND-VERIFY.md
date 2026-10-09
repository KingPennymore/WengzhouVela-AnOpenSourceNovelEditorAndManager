# 构建与发布检查

`npm run verify` 是统一检查入口：构建共享前端、核对三端版本和资源摘要、运行所有逻辑测试，启动独立端口的预览服务，依次检查文件管理、侧栏、编辑、阅读、三端界面、术语库、GitHub / Gitee、同步和本次改进。服务退出时自动关闭，不占用已有的 4173 预览端口。任一检查失败立即返回失败，记录在 `test-results/verify/`，摘要为 `results.json`。

`npm run verify:release` 额外执行真实中文 TeX / PDF 编译及 Windows 原生检查。Windows 原生检查需要先安装 `windows/` 的开发依赖；设置 `VELA_TEST_EXECUTABLE` 可以检查最终打包的程序。共享界面检查通过不代表鸿蒙、安卓真机验收。

GitHub Actions 的 `Verify` 工作流在 master 推送、拉取请求或手动启动时分别执行完整版和轻量版的共享检查与真实 TeX 编译。工作流只有仓库读取权限，不使用发布签名或私人账号，也不会自动发布。

## 完整版与轻量版

默认 `npm run build`、`npm run build:android` 和 `npm run build:windows` 继续生成完整版，内置离线 TeX 引擎及中文包。

- `npm run build:lite`：生成轻量前端，仍包含编辑、术语库、同步、阅读、PDF 阅读与 Markdown 数学公式；不内置 TeX 引擎和中文字体。
- `npm run build:android:lite`：生成安卓轻量发布 APK / AAB，名称包含 `-lite-`。与完整版使用相同包名，不用于同时安装；签名发布时必须沿用原证书。轻量签名使用 `scripts/sign-android.ps1 -Lite`，完整版不加 `-Lite`。
- `npm run build:windows:lite`：生成 Windows 轻量安装程序及 ZIP，放在 `dist/windows-lite/`，名称包含 `-lite-`。
- 鸿蒙轻量版：先执行 `npm run build:lite`，再按现有鸿蒙构建流程打包。构建前端时可设置 `VELA_BUILD_FLAVOR=lite`；环境变量会传递给安卓的资源准备任务。

轻量构建同时生成 `dist/tex-components/Vela-TeX-0.1.1-engine.zip` 和 `Vela-TeX-0.1.1-chinese.zip`。在 LaTeX 预览的“导入离线排版组件”或“更多 → Acode 插件 → 从 ZIP 安装”入口分别导入两个 ZIP，之后可完全离线编译。每个包小于 64 MB；不自动下载，不将原始组件包写入当前文稿。组件在后台解压，逐文件检查内置清单的大小和 SHA-256，校验通过后按包原子保存；错误包不会替换现有组件。

安装组件后数据保存在应用自己的浏览器存储中，卸载应用或清除应用数据会移除它们。完整版与轻量版功能差别仅在 TeX 是否预装；轻量版并不减少编译时 TeX 引擎自身所需内存。

`npm run verify:lite` 自动构建轻量版并运行共享回归及组件导入、离线中文编译检查。也可先构建轻量版，再运行 `node tests/tex-lite-browser.mjs` 可检查缺少组件提示、分别导入、重启保留、离线中文 PDF 编译与渲染。返回完整版时重新执行 `npm run build`；不要在不同构建版本之间并行执行打包，以免共享资源互相覆盖。

## 发布前

1. 检查根版本、鸿蒙版本及移动版本代码、安卓版本和 Windows 版本一致；更新发布说明与验证记录。
2. 运行统一检查，再验证最终原生安装包和实际设备上尚未覆盖的行为。
3. 使用原有移动端证书签名，检查签名、包内版本、共享前端构建清单及组件版本。
4. 源码归档排除本地凭据、密钥、缓存及个人材料；生成所有附件的 SHA-256。
5. 推送版本提交和标签，以草稿上传附件，逐项验证服务器上的大小和 SHA-256 后再公开。

工作流配置依据 [checkout](https://github.com/actions/checkout) 与 [setup-node](https://github.com/actions/setup-node) 的官方用法。

## dist 目录与精简版发布

`python scripts/package.py --source-only` 仅打包源码，不复制完整版安装包。`python scripts/finalize-release.py --lite-only` 将三端精简版、源码、两个组件和 SHA-256 收集到 `dist/releases/<版本>/`，发布说明及附件清单写入 `dist/metadata/<版本>/`。替换当前发布文件时保留旧修订。

`python scripts/organize-dist.py` 将其余根目录产物按版本归档：历史文件在 `archive/`，当前中间文件在 `intermediates/`；保留 `web/`、`windows-lite/`、`tex-components/` 和 `plugins/` 工作目录。整理前后路径记录在 `dist/organization-index.json`，不会删除历史文件。详情见生成的 `dist/README.md`。

Android 大 ZIP 通过私有缓存与同源二进制 URL 传输，读取后释放临时文件；不再把整包转成 Base64 经过页面脚本。普通插件的限制保持不变，排版组件在解压前分流，按内置组件清单校验。专用 `Wenzhou_QA_API36` 模拟器可运行 `node tests/android-tex-browser.mjs`，覆盖系统文件选择器安装两个实际 ZIP、重启保留、中文 PDF 与临时文件清理；先执行 `npm run test:android:native` 安装调试版，轻量测试设置 `VELA_BUILD_FLAVOR=lite`。
