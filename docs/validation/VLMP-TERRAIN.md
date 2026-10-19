# VLMP 独立地形验证

在地图整理中新增“独立地形”。转换把当前封闭绘制区域的填充复制为 `generated` 中的 `algorithm: "terrain"` 元素，保留区域轮廓、颜色和未知图层元数据。多个不相连的区域在本次转换中属于同一元素；后续绘制可以再次转换为另一个元素。文件版本保持 1，使用现有的 `paths` / `regions` 矢量结构。

只有已封闭组中不带附加字段、没有箭头引用的普通绘制点会移除。信息点、旧地形数据、箭头路径、带名称和未知字段的点保留；其中属于已转换绘制组的关联点增加 `drawingBaked: true`，继续供信息和箭头使用，不再参与填充计算。再次明确绘制该点会清除标记。未封闭的绘制点保留为绘制源。

转换在现有地图整理 Worker 内执行。应用点数据变化时，取消先前打开地图时启动的填充 Worker，避免旧计算结果在转换后继续运行。预览和关闭不写文件；应用前比较源内容，地图发生变化就要求重新预览；应用通过现有格式大小校验和撤销记录。保存后不额外保留已删除普通点的副本，避免抵消体积收益。重新打开后仍可编辑地形元素，原始点的撤销记录仅保留在当前会话。

选择工具支持区域内部命中、拖动、名称、位置、分区域颜色与不透明度、删除；移动和删除不改变保留的信息点、箭头和插件图层。填充命中遵守 evenodd 规则，孔洞不算地形内部。符号、箭头、信息点保留各自的点击优先级。Canvas、SVG、PNG 沿用同一份轮廓数据。

地图文字继续使用主题或原有阵营颜色，并绘制反差描边；描边按屏幕尺寸计算，不读取 Canvas 像素。SVG 导出也包含描边，信息点文字置于地形之后，避免被填充覆盖。

## 验证命令与结果

在 Linux / Node 24 / 无界面 Chromium 中执行：

```sh
TZ=UTC node --test --test-concurrency=2 tests/*.test.mjs vendor/acode-writer/tests/*.test.cjs
WENZHOU_CHROME=/path/to/chromium TZ=UTC node tests/map-terrain-browser.mjs
WENZHOU_CHROME=/path/to/chromium TZ=UTC node tests/planning-centering-browser.mjs
WENZHOU_CHROME=/path/to/chromium TZ=UTC node tests/planning-refinement-browser.mjs
TZ=UTC npm run build:lite
TZ=UTC node scripts/check-build.mjs
```

- 接入最新主线 `86907da` 后，全量 372 项单元测试通过（独立开发阶段为 357 项）。
- 1280px 与 390px：转换前后填充和信息点像素一致（隐藏普通绘制点后比较）；主题文字与反差描边；预览取消；过期结果拒绝应用；引用保护；移动、属性、撤销重做、重新打开和删除通过。
- 原有首次居中与切换恢复、地图整理保形精简及侧栏行为回归通过。
- 轻量构建和构建完整性检查通过。未构建或实测 Windows / HarmonyOS / Android 原生安装包。

两个旧脚本仍有失败，已在改动前的 `4fcda06` 独立工作树复现同一断言，不作为本功能验证通过项：`map-interaction-browser.mjs` 的触摸缩放平移断言；`planning-workflows-browser.mjs` 的旧填充固定坐标取样断言。

## 合成地图性能

运行 `TZ=UTC node tests/map-terrain-benchmark.mjs`。比较两份均保存相同填充的规范化文件；每份预热 5 次，测量 25 次 `parseMap`（JSON 解析与格式校验），取中位数。下表为一次本环境测量，非整机启动性能或真实用户地图承诺。

| 普通绘制点 | 转换前字节 | 转换后字节 | 读取校验中位数（前 → 后） |
| --- | ---: | ---: | ---: |
| 900 | 115,623 | 77,530 | 1.48 → 0.53 ms |
| 19,600 | 1,223,774 | 372,581 | 28.02 → 1.48 ms |

两份合成图均移除了全部普通绘制点。收益依赖点数、轮廓和附加信息；稀疏点的复杂矢量轮廓可能比源点更大，因此预览展示转换前后保存大小，不承诺固定压缩率。未保存填充的旧文件还需要首次生成轮廓，转换是一次性成本。
