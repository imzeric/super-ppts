# 编辑器参考与改动

日期：2026-11-16。只记录实际读过的公开材料。许可证不允许把对方代码抄进本仓库。

## 身份

用户说的 Dashi PPT 与公开仓库 [chuspeeism/dashi-ppt-skill](https://github.com/chuspeeism/dashi-ppt-skill) 对得上：README 标题是「大师 PPT」，说明为多主题、浏览器可编辑、可导出 HTML / PDF / PPTX。该仓库星数最高，创建于 2026-06-10，协议 AGPL-3.0。同名仓库还有 SanHsien、louiseliu、xingchenyd 等分支，描述写明是维护分支或主题分支，不作为本次观察对象。

导出子包 `project/packages/html-deck-to-pptx` 被 README 标成专有组件。本次没有阅读或运行它的脚本。

## 从 README 看到的编辑交互

来源：<https://github.com/chuspeeism/dashi-ppt-skill/blob/main/README.md>，以及其中的 `text-edit.gif`、`add-image.gif`、`html-vs-pptx.gif` 说明文字。

- 左侧缩略图可以拖拽重排，页面可以跳过、删除、复制。
- 顶栏有放映、明暗主题、重置。
- 点击文字就地修改。
- 图片槽可以点击或拖拽替换。
- 每页有控制台：布局、模块数量、重点、配色、翻页动画。
- 导出 PPTX 时文字尽量仍可编辑。README 同时承认 HTML 能力不能全部进入 PPT。

本次没有在浏览器里打开他们的生成结果，所以没有把动图里的像素间距当成测量值。

## 其他参考里和编辑器有关的事实

- [presenton/presenton](https://github.com/presenton/presenton) README 有一张名为 “Drag-and-drop editing in the Presenton slide editor” 的动图，并说明模板可预览后生成可编辑 PPTX。没有逐行读它的编辑器源码。
- [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) 是 MIT 许可的本地生成流程，强调原生形状、连接线和图表，不是浏览器里的幻灯片编辑器。
- [icip-cas/PPTAgent](https://github.com/icip-cas/PPTAgent) 这次没有逐页对照编辑器实现。

## 采用与不采用

采用：

- 左缩略图标明当前页，并支持新增、复制、删除、上移、下移。删除前把状态放进撤销栈，占位不直接从数据库抹掉，而是标成未挂页。
- 画布上直接改标题和正文，只保存纯文本。
- 选中占位后出现边框和八个手柄，在缩放后的视口里拖动和缩放，坐标按视口像素换算成 EMU，并限制在幻灯片内。
- 顶栏提供缩放、适合宽度、撤销、主题切换和保存状态。
- 右侧检查器只显示当前页或当前占位。

不采用：

- 不把整页 HTML 截图当作 PPT。
- 不承诺任意 HTML 变成原生形状。
- 不复制 Dashi 的版式库、专有导出器或 AGPL 代码。
- 不实现放映模式和九种翻页动画。

## 几何

`clientDeltaToEmu(deltaPx, viewportPx, slideEmu)` 用 `deltaPx / viewportPx * slideEmu`。拖动和缩放结束后调用同一套保存，导出读取同一组 `x,y,w,h`。
