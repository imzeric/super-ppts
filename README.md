# 校对台

单用户、单进程的中文文稿工具。从主题或粘贴内容生成大纲，确认优化，批准后预览 16:9 幻灯片，并下载可在 PowerPoint 里继续编辑的 `.pptx`。

本机受信任即可。没有登录，数据库是服务器上的 SQLite 文件。不要把进程暴露到不受信任的网络。

## 环境

- Node.js 22
- pnpm 10

## 安装与运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

浏览器打开 `http://127.0.0.1:3000`。

三个模型变量都留空时进入演示模式：界面会写明「演示模式」，使用内置的「社区图书角」大纲，不访问网络。

在线模式把下面三项写在 `.env.local`，只由服务端读取：

```bash
AI_BASE_URL=https://example.invalid/v1
AI_API_KEY=
AI_MODEL=
```

`AI_BASE_URL` 指向 OpenAI 兼容的 `/v1` 根路径。密钥已填写但地址或模型名为空时，请求会失败，不会改用演示数据。模型失败也不会被记成成功。

可选：

```bash
DATABASE_PATH=data/super-ppts.db
```

## 检查

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` 会先要求已经执行过 `pnpm build`，并下载 Playwright 的 Chromium。第一次可运行：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

生产进程：

```bash
pnpm build
pnpm start
```

## 首版能做什么

1. 用主题或粘贴内容生成大纲，逐节编辑后保存。重新打开仍在。
2. 优化只生成候选。采用后替换，放弃后保持原大纲。已批准的大纲再改，会回到草稿。
3. 批准后一节一张 16:9 幻灯片：标题、要点、表格、流程图、柱状/折线/饼图。
4. 流程图有独立页面，和幻灯片共用 diagram id。可以改文字、形状、坐标，并做确定性重排。
5. 导出 `.pptx`。未批准或批准后改过大纲时，导出被拒绝。

节数限制是 1 到 8。界面写明：这是为了逐张核对原生对象，不是内容质量上限。

## 原生、预览、不支持

| 能力 | 结果 |
| --- | --- |
| 文字 | 原生文本框，`a:latin` 与 `a:ea` 都写 Microsoft YaHei。字体不嵌入，机器没有雅黑时由 PowerPoint 替换 |
| 表格 | 原生 `a:tbl` |
| 图的节点 | 原生形状 `p:sp`，名称对应节点 id |
| 图的边 | 原生连接线 `p:cxnSp`，`stCxn` / `endCxn` 绑定两端形状 |
| 柱状、折线、饼图 | 原生图表部件，并嵌入含类别和数值的 xlsx 工作簿 |
| 屏幕预览 | HTML/SVG。页面写明它不是 PowerPoint 的像素结果 |
| SmartArt、公式、音视频、动画、组合图表、导入旧 pptx、图片化的图 | 不生成。导出若出现图片部件会失败 |

演示文稿和测试都用解压后的 OOXML 检查上述对象。本环境没有安装桌面版 PowerPoint，因此没有在 PowerPoint 界面里做人工拖拽验收。

## 依赖许可

这些直接依赖在引入前核对过许可证：

| 包 | 版本 | 许可 |
| --- | --- | --- |
| next | 16.4.6 | MIT |
| react / react-dom | 19.3.1 | MIT |
| zod | 3.25.76 | MIT |
| pptxgenjs | 4.0.1 | MIT |
| fflate | 0.8.3 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 5.1.0 | MIT |
| @playwright/test | 1.65.1 | Apache-2.0 |

持久化使用 Node 22 内置的 `node:sqlite`。Node 仍把它标为实验 API，启动脚本关闭了 ExperimentalWarning。没有加入需要编译的原生 SQLite 包。

## 不在本版

登录、协作、部署、付费接口、模板库、多智能体、视觉修复、导入已有 PPTX。
