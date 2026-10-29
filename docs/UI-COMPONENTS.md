# 基础组件（阶段 1）

本阶段只新增变量和以 `ui-` 开头的样式，尚未接入 `app.js`。页面迁移安排在阶段 2–5。样式位于 `web/style.css` 的 `tokens` 层与 `app` 层末尾的独立组件节；保留原有 `--control`、`--radius`、`--panel-spacing`、颜色、动效和阴影变量的值。

## 变量与通用约定

| 变量 | 值 |
| --- | --- |
| `--text-xs/sm/md/lg/xl` | 12 / 14 / 16 / 20 / 24 px |
| `--leading-tight` / `--leading` / `--leading-loose` | 1.3 / 1.5 / 1.75 |
| `--weight-regular/medium/bold` | 400 / 500 / 600 |
| `--space-1` … `--space-6` | 4 / 8 / 12 / 16 / 24 / 32 px |
| `--radius-sm/md/lg/full` | 6 / 10 / 16 / 999 px |
| `--control-h` | 36 px；`(pointer: coarse)` 下 44 px |
| `--elev-1/2/3` | 沿用既有阴影 |

组件文字下限为 12 px；正文仍使用用户的 `--editor-font-size`。紧凑按钮减少字号与内边距，仍保留控件高度下限。触屏控件的宽、高均至少为 44 px，依据指针能力而非屏幕宽度判断。

组件通过现有颜色变量适配 `body.dark`。动画和过渡仅在 `prefers-reduced-motion: no-preference` 时启用。禁用态保留颜色、降低透明度；使用原生 `disabled`，而非仅添加样式。需要错误反馈的表单控件添加 `aria-invalid="true"`，并用 `aria-describedby` 关联说明；说明必须指出问题与修复方法。错误状态不会自动禁止编辑。

`web/ui-components.mjs` 的助手返回 HTML 字符串，文本与属性均经过 `escapeHtml`。调用方先用 `t()` / `say()` 翻译文案。只有 `settingRow` 的 `control` 是可信 HTML 槽位，不可直接传入用户内容。其余静态结构直接编写标记即可，无须额外脚本。

```js
import {t} from './i18n.mjs';
import {settingRow,stepper,bindSteppers} from './ui-components.mjs';
container.innerHTML=settingRow({name:t('文字字号'),help:t('文稿正文'),helpId:'font-help',
  control:stepper('font',16,{label:t('文字字号'),min:12,max:24,step:2,describedBy:'font-help'})});
const dispose=bindSteppers(container);
// 卸载视图时调用 dispose()，释放事件和属性观察器。
```

## 按钮

```html
<button type="button" class="ui-button ui-button--primary">保存</button>
<button type="button" class="ui-button ui-button--secondary">取消</button>
<button type="button" class="ui-button ui-button--text">返回</button>
<button type="button" class="ui-button ui-button--danger">删除</button>
<button type="button" class="ui-button ui-button--secondary ui-button--compact" disabled>保存</button>
```

主要按钮用于当前区域的首要操作；次要按钮用于普通操作；文字按钮用于低强调操作；危险按钮用于删除等操作。每种支持常规、`--compact`、悬停、键盘焦点和禁用。表单提交需显式使用 `type="submit"`。助手为 `button(label,{variant='secondary',compact=false,disabled=false})`，默认生成 `type="button"`。操作失败通过提示条或失败组件解释，不为按钮另设错误颜色。

## 开关

```html
<label class="ui-switch">
  <input type="checkbox" role="switch" name="autocomplete" value="on" aria-label="自动补全">
  <span class="ui-switch-track" aria-hidden="true"></span><span>自动补全</span>
</label>
```

用于立即生效的开/关设置。保留原生勾选值、表单提交、空格键、标签点击、焦点和禁用行为。支持未选、已选、两种禁用状态及错误描边；不额外维护 `aria-checked`。助手为 `switchControl(name,checked,label,{disabled,invalid,describedBy})`。滑轨只是视觉呈现，原生输入覆盖完整点击区域。

## 分段按钮

```html
<fieldset class="ui-segmented" aria-label="外观">
  <label class="ui-segmented-option"><input type="radio" name="theme" value="light" checked><span>浅色模式</span></label>
  <label class="ui-segmented-option"><input type="radio" name="theme" value="dark"><span>深色模式</span></label>
</fieldset>
```

用于最多 4 个互斥选项。使用同名原生 radio，保留方向键切换、空格键选中、Tab 组导航和表单值。支持组禁用、单项禁用、选中、焦点、组错误态；窄屏允许换行。助手为 `segmented(name,options,value,{label=name,disabled,invalid,describedBy})`，每项为 `{value,label,disabled}`。调用方为不同的组提供不同 `name`，并提供可读的组名。

## 下拉框

```html
<select class="ui-select" name="palette" aria-label="配色方案">
  <option value="pine">青松</option><option value="jade">玉石</option>
</select>
```

选项较多时沿用 `app-choices.mjs` 的 `bindAppChoices()`，每个页面只绑定一次；`ui-select` 仅统一控件外观，不复制下拉脚本。保留 select 表单值；支持已选、禁用、焦点和 `aria-invalid` 错误态。画廊验证指针选择以及 Enter 打开和选择。

## 步进器

```html
<span class="ui-stepper">
  <button type="button" data-ui-step="-1" aria-label="减小字号">−</button>
  <input type="number" name="font" value="16" min="12" max="24" step="2" aria-label="文字字号">
  <button type="button" data-ui-step="1" aria-label="增大字号">+</button>
</span>
```

用于字号等有限范围数字。助手为 `stepper(name,value,{label,min,max,step=1,disabled,invalid,decreaseLabel,increaseLabel,describedBy})`。建议为加减按钮提供完整的已翻译名称，默认名称为符号加字段名。

挂载后调用 `bindSteppers(root)`，支持多次调用而不重复绑定；返回清理函数。点击加减、按钮 Enter/空格使用原生 `stepUp()` / `stepDown()`，遵守整数、小数、范围和步长对齐规则；值变化时在 number 输入上依次派发冒泡的 `input` 与 `change`，无变化时不派发。直接输入和上下方向键沿用原生行为；提交时使用 number 的值与校验，不另建隐藏字段。

支持最小/最大边界禁用对应按钮、整个控件禁用、输入只读、错误态、表单重置。监听输入事件与 `disabled/readonly/min/max/step/value` 属性变化；代码直接修改 `.value` 后应派发 `input` 更新边界按钮。调用方负责保存和业务校验；不自动把用户正在输入的越界值截断。

## 设置行

```html
<div class="ui-setting-row">
  <div class="ui-setting-copy"><strong>文字字号</strong><span class="ui-setting-help" id="font-help">用于文稿正文。</span></div>
  <div class="ui-setting-control"><!-- 带名称与 aria-describedby="font-help" 的控件 --></div>
</div>
```

设置项名称、单行说明和控件始终处于同一行容器中。宽屏控件居右，宽度不超过 600 px 时放到下一行。说明超长时省略显示，完整内容仍保留在 DOM，使用 `helpId` 与控件的 `describedBy` 关联以供读屏读取。助手为 `settingRow({name,help,control,helpId})`。禁用与错误态由槽位内的控件承担。

## 卡片与列表行

```html
<article class="ui-card">
  <strong>最近文件</strong>
  <button type="button" class="ui-list-row"><span>空白文件</span><span aria-hidden="true">→</span></button>
  <div class="ui-list-row">只读信息</div>
</article>
```

卡片用于一组相关信息或操作，采用第一级阴影；列表行用于信息或入口。可操作列表行使用原生按钮，支持悬停、焦点、`disabled`，不要给不可操作的容器添加 Tab 焦点。卡片本身无选中、禁用或错误语义；在内部控件或提示条上表达状态。

## 空状态、加载中、失败与提示条

```html
<div class="ui-empty"><strong>暂无文件</strong><button type="button" class="ui-button ui-button--secondary">导入文件</button></div>
<div class="ui-loading" role="status" aria-live="polite">正在读取…</div>
<div class="ui-failure" role="alert"><span>连接检测未通过。</span><button type="button" class="ui-button ui-button--secondary">检测连接</button></div>
<div class="ui-notice" role="status">工作区配置已保存</div>
<div class="ui-notice ui-notice--error" role="alert">配置无效，请切换源码修复。</div>
```

空状态解释当前没有内容并提供可行操作；加载中保留文字，减少动态效果时转圈静止；失败说明发生了什么并提供重试或修复入口。提示条用于局部状态和可恢复问题，错误加 `--error`。这些容器无禁用态；其中的操作仍使用标准按钮。后续阶段再把 `chunkLoading` / `chunkFailure` 切换到这些类。

## 图标按钮

```html
<button type="button" class="ui-icon-button" aria-label="关闭" title="关闭"><span aria-hidden="true">×</span></button>
```

用于空间有限且图标含义明确的操作。必须有已翻译的 `aria-label` 和 `title`；桌面悬停使用原生提示。支持焦点、悬停和禁用。助手为 `iconButton(label,icon,{disabled})`，`icon` 是转义后的文字符号；SVG 图标可按上述结构直接编写并加 `aria-hidden="true"`。

## 对话框与底部弹出层

```html
<dialog class="ui-dialog" aria-labelledby="settings-title">
  <form method="dialog">
    <h2 id="settings-title">设置</h2>
    <button class="ui-button ui-button--primary" autofocus>关闭</button>
  </form>
</dialog>
```

使用原生 `showModal()` / `close()`、Escape 关闭、焦点约束和返回触发按钮的行为。桌面居中，窄屏贴底；需要手机全屏时添加 `ui-dialog--fullscreen`。保留安全区内边距和内容滚动。支持关闭、打开、手机底部层、手机全屏；错误信息和禁用操作在内容内部表达。无需新建对话框脚本或提前改动应用现有弹窗。

## 开发与验证

运行 `node tests/source-app-server.mjs`，访问输出地址的 `/ui-gallery.html`。`?theme=dark` 展示深色，`?lang=en` 展示英文，可组合使用。画廊列出全部组件及适用的正常、选中、禁用、边界和错误状态；Tab、方向键、空格与指针可测试焦点和悬停。两个对话框入口可打开真实模态层。

画廊及脚本仅由源码服务器提供。构建脚本继续使用显式入口和复制清单，`app.js` 不导入组件模块，`dist/web` 与 `rawfile/web` 不包含画廊或独立组件脚本。

`node tests/ui-components-browser.mjs` 检查 390×844、1280×850 的浅色和深色，以及宽屏触摸环境；截图和结果保存在 `test-results/ui-redesign/phase-1/`。截图名为 `<宽度>-<主题>-gallery/focus/hover/sheet/fullscreen.png`（手机不生成 hover 图）。

`tests/css-refactor-equivalence-browser.mjs` 保持固定基准 `f818cc5`，仅允许上述 22 个新变量从未定义变为已定义；所有原有变量和可见 CSS 属性继续严格比较，包括伪元素。新增变量值由组件测试检查，未更新外观基准。
