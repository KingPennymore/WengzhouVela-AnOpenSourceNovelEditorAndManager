# ODF 组件修订验证

验证日期：2026-10-10。保留 Vela 0.9.5 版本号，共享前端为轻量构建。此源码包包含此前完成的统一组件管理和带 PDF 的电子书阅读组件。

通过的检查：

- `npm test`：200 / 200 项逻辑测试通过。
- `node scripts/check-build.mjs`：三端版本、源码摘要、前端资源和轻量版组件清单一致。
- `npm run test:odf`：包条目字节保留、兼容段落编辑、特殊段落保护、附件保留、同名自动样式的部件归属、纸张样式导出、签名只读/修改拒绝、加密拒绝、路径/DTD/深度限制；安装、停用、重启、启用、卸载；ODS/ODP/ODG 及 OTT/OTS/OTP/OTG；确认主 bundle 不含 ODF 引擎。
- `npm run test:vodt`：HarmonyOS、Android、Windows 三种浏览器 UI 模拟，验证固定布局、模板、竖向选区菜单、粗体、图像插入/缩放、保存/重开、VODT 别名、A5/页边距持久化和 ODT 回读。
- `npm run test:components`：旧排版组件迁移、启停/重启/卸载、EPUB 章节顺序和隔离、FB2/PalmDOC/MOBI7、DRM/KF8 错误提示、PDF 分页/文字层/搜索/缩放/移动宽度。

原始结构化结果见 validation/。组件 ZIP 约 25 KiB；带 PDF 的电子书 ZIP 约 2.1 MiB。组件空间不是最终 APK/HAP 的净节省量，TeX PDF 预览的依赖仍在宿主。

未验证：LibreOffice/Word 交叉打开的标准一致性、三端 SDK 的发布构建与真机。未制作签名 HAP/APK/Windows 安装器。支持矩阵与当前边界见 [ODF-COMPONENT.md](ODF-COMPONENT.md)，不能把“未知 XML 与附件保留”理解为所有 ODF 特性都可视化编辑。
