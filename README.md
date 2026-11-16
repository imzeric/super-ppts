# 校对台

单用户、单进程的中文文稿工具。四步完成一份可编辑的 PowerPoint：

1. 输入背景，生成并编辑 Markdown 大纲。
2. 确认大纲后，单独生成并确认每页文字。
3. 手工添加、移动、缩放占位框，写下标题、画面描述、绘图说明和输出类型。
4. 按所选占位批量绘制。原生图、表、图表保持可编辑；插图明确是位图。

本机受信任即可。没有登录。不要把进程暴露到不受信任的网络。

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

文本、视觉、插图三个密钥都留空时，文本能力进入演示模式：界面写明「演示模式」，大纲使用内置的「社区图书角」示例，不访问网络。插图在演示模式写入一张标明为位图的演示 PNG，不请求生图接口。

也可以在「接口设置」里保存地址、模型名和密钥。密钥留空不会覆盖已保存的值；清除密钥是单独按钮。接口返回只有掩码，例如 `••••ey`。

环境变量由服务端读取，优先级低于已保存的密钥：

```bash
AI_TEXT_BASE_URL=
AI_TEXT_API_KEY=
AI_TEXT_MODEL=
AI_VISION_BASE_URL=
AI_VISION_API_KEY=
AI_VISION_MODEL=
AI_IMAGE_BASE_URL=
AI_IMAGE_API_KEY=
AI_IMAGE_MODEL=

# 只作为文本能力的后备
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=

DATABASE_PATH=data/super-ppts.db
```

密钥会明文写在本地 SQLite。这是单用户本机边界，没有额外加密。

## 检查

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

生产进程：

```bash
pnpm build
pnpm start
```

## 协议

只实现下面两种 OpenAI 兼容调用，不表示任意供应商都能用。地址必须是 https；只有 `127.0.0.1` 和 `localhost` 允许 http。地址中不能带账号密码。超时 30 秒，重定向视为失败。

| 能力 | 请求 | 成功响应 |
| --- | --- | --- |
| 文本规划 | `POST {base}/chat/completions`，`response_format: json_object`，消息为字符串 | `choices[0].message.content` 是 JSON，其中 `markdown` 符合下面的大纲语法 |
| 视觉理解 | 同上，但 user content 是数组：`{type:text}` 和 `{type:image_url, image_url:{url:"data:image/png;base64,..."}}` | `choices[0].message.content` 为文字 |
| 插图生成 | `POST {base}/images/generations`，`response_format: b64_json`，`size: 1024x1024` | `data[0].b64_json` 是 PNG 或 JPEG |

在线失败不会改用演示稿或演示位图。

## 大纲语法

```markdown
# 文稿标题

## 幻灯片标题
<!-- id: sec-flow -->
kind: diagram
diagram: flow
- 到馆登记
- 挑选图书
```

`kind` 可以是 `title`、`bullets`、`table`、`diagram`、`chart`。图的 `diagram` 只能是 `flow`、`org`、`architecture`、`relation`。图表还要 `chart: bar|line|pie`，并用第二列为数字的表格。一次最多 8 张幻灯片。诊断会写明行号。

## 输出

| 类型 | 导出 |
| --- | --- |
| 未绘制占位 | 原生圆角文本框，写着占位类型、标题、描述和绘图说明 |
| 流程图、组织图、架构图、关系图 | 原生形状和带端点绑定的连接线。关系图以第一个节点为中心 |
| 柱状图、折线图、饼图 | 原生图表和嵌入工作簿 |
| 表格 | 原生 `a:tbl` |
| 插图 | 图片部件。界面和文件都写明「位图，内部像素不可逐项编辑」 |
| 屏幕预览 | HTML。页面写明不是 PowerPoint 的像素结果 |
| 字体 | 引用 Microsoft YaHei，不嵌入 |

本环境没有安装桌面版 PowerPoint，也没有向真实模型服务发请求。

## 不在本版

登录、协作、部署、导入旧 PPTX、模板库、多智能体、SmartArt、公式、音视频、动画，以及把位图还原成可编辑形状。
