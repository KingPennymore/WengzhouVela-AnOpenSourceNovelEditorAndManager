# ADR 0002：系统字体选择

- 日期：2026-10-24
- 状态：已采纳

## 背景与决定

界面与编辑器过去使用固定字体回退链，用户无法从已安装字体中选择。
在设置中增加共享字体偏好，保留“文舟默认”和“跟随系统字体”。偏好存入 `settings.fontFamily`，
不写入作品的排版配置或文稿正文。CSS 自定义属性统一提供界面和正文的字体，保留显式富文本样式与代码字体。

字体名单只从本机获取，不上传、不下载字体。原生桥接只返回字体名，不提供任意文件读取能力。
浏览器使用 `queryLocalFonts`，只在用户点击按钮时调用，不在启动时请求权限。
枚举失败不阻止保存其他设置；旧原生壳仍能选择默认与跟随系统。

## 平台边界

- Windows 使用系统的 InstalledFontCollection 查询字体族，由固定的无窗口命令读取，不插入用户输入。
- 鸿蒙 API 12 使用 UI 字体配置；API 14 及以上补充图形接口返回的已安装字体族，并去掉样式重复项。
  不只调用 getSystemFontList，因为该接口在手机上返回空数组。
- Android 读取固定的系统字体配置路径中的命名字体族和别名，保留始终可用的通用字体族。
  不把字体文件名当作可用 CSS 字体名，不声称可以访问系统未公开的主题字体。

鸿蒙接口及设备限制依据 [OpenHarmony Font 文档](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkui/arkts-apis-uicontext-font.md)
与 [Text 字体管理接口](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkgraphics2d/js-apis-graphics-text.md)。
Android 配置包含命名字体族、别名和无名回退字体，见 [AOSP SystemFonts](https://android.googlesource.com/platform/prebuilts/fullsdk/sources/android-29/+/refs/heads/main/android/graphics/fonts/SystemFonts.java)。

## 实现约束

名称限制长度并拒绝控制字符；非通用字体名作为带引号的 CSS 字符串处理，列表用 DOM 文本节点展示。
字体缺失时交给系统字体回退，保留已存偏好。设置中的字体变化只预览，确认后才应用。
异步列表返回时保留正在编辑的选择，关闭或替换设置后不操作新的设置面板。
字体变化参与阅读分页和长文测量的缓存键，防止沿用旧字体的页数。

前端模块使用 JSDoc 严格检查及统一 lint / 格式检查。测试覆盖名单规范化、平台版本回退、
浏览器授权失败、实际字体渲染、取消、保存和重启、阅读、窄屏布局及恢复默认。
