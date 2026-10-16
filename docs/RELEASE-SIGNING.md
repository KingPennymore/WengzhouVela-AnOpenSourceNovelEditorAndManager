# 发布清单签名

应用更新、可选组件和组件目录的下载都先核对 SHA-256。以前这些哈希值取自同一发布的 API 摘要或 `SHA256SUMS-<标签>.txt`，组件目录 `catalog.json` 也优先从 Gitee 读取：这只能发现传输损坏，镜像被篡改时安装包和校验文件可以一起被换掉。现在发布者用自己的私钥给清单签名，应用内置公钥，先验签再采信清单中的哈希。

## 算法

ECDSA P-256 / SHA-256，签名为 IEEE P1363 格式（r‖s，64 字节）。选它而不是 Ed25519，是因为验签放在页面里用 WebCrypto 完成，三端共用一份代码：

- ECDSA P-256 从 Chromium 37 起就在 WebCrypto 中可用，覆盖 Android WebView 105+、鸿蒙 ArkWeb 和 Windows 的 Electron。
- WebCrypto 的 Ed25519 到 Chromium 137 才默认开启。在 `Wenzhou_QA_API36` 模拟器上实测：Android System WebView 133 生成 Ed25519 密钥报 `NotSupportedError`，ECDSA P-256 签名和验签正常。

因此不需要原生端验签。原生下载器仍按页面给出的 SHA-256 核对文件。

## 文件

- 应用发布 `v<版本>`：`SHA256SUMS-<版本>.txt` 和 `SHA256SUMS-<版本>.txt.sig`。
- 组件目录（标签 `catalog`）：`catalog.json` 和 `catalog.json.sig`。
- TeX 组件发布 `tex-<版本>`：从 0.1.2 起同样附 `SHA256SUMS-tex-<版本>.txt.sig`（应用当前随包携带的 TeX 包哈希来自构建时的组件描述，不依赖它）。

`.sig` 是一行 JSON：

```json
{"format":1,"algorithm":"ECDSA-P256-SHA256","key":"vela-b042e2de130a329a","signature":"<base64，64 字节>"}
```

签名对象是被签文件的原始字节（不做换行或编码转换）。`key` 是公钥 SPKI 的 SHA-256 前 16 位十六进制，前缀 `vela-`。

## 密钥

- 公钥列在 `web/release-keys.mjs` 的 `RELEASE_KEYS` 中，随应用发布。换密钥时先把新公钥加入并发布一个版本，等旧版应用都升级后再停用旧密钥。
- 私钥只在发布者本机：默认 `~/.vela-release-signing/release-ecdsa-p256.pem`，可用环境变量 `VELA_RELEASE_SIGNING_KEY` 改路径。`scripts/release-signing.mjs` 只在签名时读取它，不打印、不复制、不写日志，路径位于仓库内时直接拒绝。请把私钥备份到离线的安全位置；丢失后只能发布带新公钥的版本，已安装的旧版无法再验证新发布。
- 当前密钥 `vela-b042e2de130a329a` 于 2026-10-17 用 `node scripts/release-signing.mjs keygen` 生成。

命令：

```
node scripts/release-signing.mjs keygen [--out 路径]     生成密钥对，只显示公钥条目
node scripts/release-signing.mjs public [--key 路径]     显示私钥对应的公钥条目（核对用）
node scripts/release-signing.mjs sign 文件... [--key 路径]
node scripts/release-signing.mjs verify 文件...
```

`sign` 要求私钥对应的公钥已在 `RELEASE_KEYS` 中，并在写出 `.sig` 前用应用的验签代码自检。`scripts/finalize-release.py` 在写出 `SHA256SUMS-<版本>.txt` 后签名并把 `.sig` 加入附件清单；`scripts/build-catalog.mjs` 写出 `catalog.json` 后签名；`scripts/mirror-tex-gitee.ps1` 把 `.sig` 一并同步到 Gitee。

## 应用如何采信（`web/release-signing.mjs`、`web/component-downloads.mjs`）

1. `downloadSignedText` 按 Gitee、GitHub 的顺序，从同一个镜像下载文件和对应的 `.sig`，验签通过才使用。签名无效（内容被改、未知密钥、格式错误）的文件在任何镜像上都不使用，继续尝试下一个镜像；都不行就报错 `E_SIGNATURE`，界面显示“无法验证 … 的签名，已拒绝使用”。
2. 应用更新和发布附带的组件：哈希只取自签名的 `SHA256SUMS`，不再采信镜像 API 返回的摘要。
3. 组件目录：签名通过后才列出其中的组件。界面在来源后注明“签名已验证”。

## 过渡

0.9.8.1 及更早的发布（以及 `tex-0.1.1`）、现在已发布的 `catalog.json` 都没有签名：

- 这些旧发布仍可使用，但只采信 GitHub：GitHub API 的摘要由 GitHub 自己计算，或者使用 GitHub 上未签名的 `SHA256SUMS`。Gitee 镜像上未签名的数据一律不用。界面注明“签名机制启用前的旧版发布，校验值只采信 GitHub”。
- 0.9.8.1 之后的发布必须签名：缺少或无效的签名都会让更新检查失败，不会提供安装。
- 组件目录：设备在见到一份签名有效的目录之前，接受 GitHub 上未签名的旧目录（注明“发布签名前的旧清单，仅接受 GitHub”）；见过一次之后，记住这一点（localStorage `vela.catalog.signed`），此后拒绝未签名的目录，防止镜像回退到未签名版本。
- 发布者应在下一次发布时用 `build-catalog.mjs` 重新生成并签名目录，同时上传 `catalog.json.sig`。

## 测试

- `tests/component-catalog.test.mjs`：签名有效、签名后改动哈希、缺少签名三种情况下的目录和发布校验列表，未知密钥，旧发布只采信 GitHub，以及见过签名目录后拒绝未签名目录。
- `tests/component-download-browser.mjs`（已加入 `npm run verify`）：在页面中模拟原生下载桥，覆盖同样的三种情况，包括 0.9.9 安装包使用签名清单中的哈希而不是镜像摘要。测试用的临时公钥通过 `tests/source-app-server.mjs` 的 esbuild `define`（`__VELA_TEST_RELEASE_KEYS__`）注入；正式构建把它定义为空数组，`scripts/check-build.mjs` 检查发布包中没有测试密钥。
