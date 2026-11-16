# 校对台

单用户的中文文稿工具。编辑器和原生 PPTX 在 Next.js 里，批量绘制的任务队列在一个不对外发布的 Python 服务里。六步完成一份可编辑的 PowerPoint：

1. 在首页写下生成说明。产品不设字数上限，也不截断；超过 100 万字会拒绝并说明。
2. 编辑 Markdown 大纲，保存、重新加载、采用优化。
3. 选择 16:9、4:3 或 16:10，以及可选的内置模板。不选模板也可以。
4. 确认后生成每页文字。
5. 在左侧缩略图、中间画布、右侧属性的编辑器里改文字并添加占位。
6. 按占位生成 PNG、SVG 或 PowerPoint 可编辑对象，然后导出。

本机受信任即可。没有登录。不要把网页暴露到不受信任的网络。供应商密钥明文存在 Next.js 的 SQLite 里，这是本机单用户边界，没有另做一层密钥就在旁边的加密。

## 环境

- Node.js 22.23.4
- pnpm 10.33.4
- Python 3.12

## 本机运行

```bash
pnpm install
python3 -m venv .venv
.venv/bin/pip install -r worker/requirements.txt
cp .env.example .env.local
```

在 `.env.local` 里给 `INTERNAL_SERVICE_TOKEN` 填同一个本地令牌。然后开两个终端：

```bash
INTERNAL_SERVICE_TOKEN=本地令牌 WEB_INTERNAL_URL=http://127.0.0.1:3000 \
  WORKER_DATABASE_PATH=data/jobs.db \
  .venv/bin/python -m uvicorn app.main:app --app-dir worker --host 127.0.0.1 --port 8080
```

```bash
WORKER_URL=http://127.0.0.1:8080 INTERNAL_SERVICE_TOKEN=本地令牌 pnpm dev
```

浏览器打开 `http://127.0.0.1:3000`。没有模型密钥时仍是演示模式，但批量绘制会走 Python 任务。绘制服务没启动时，页面会说明服务没有连上，已保存的大纲、页面和占位不会被清空。

## 一条命令启动

```bash
export INTERNAL_SERVICE_TOKEN=本地令牌
docker compose up --build
```

只发布 `127.0.0.1:3000`。Python 服务在 Compose 网络内，没有宿主机端口。数据卷分别保存 `super-ppts.db` 和 `jobs.db`。网页镜像安装了 Noto CJK 字体；原生 PPTX 仍由 Node 里的 PptxGenJS 写出，不把位图当成形状。

升级前复制数据库：

```bash
cp data/super-ppts.db data/super-ppts.db.bak
cp data/jobs.db data/jobs.db.bak
```

迁移只增加 `schema_migrations` 和任务关联列，不删除文稿。回退时停止进程，用这两个副本覆盖回去。不要手写删除语句。

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

GitHub Actions 还会跑同一套浏览器端到端测试，以及 `docker compose build` 后的启动检查。容器检查只确认网页能打开，并且 `/api/health` 里绘制服务为 `up`。它不在容器里走完生成和导出。

生产进程：

```bash
pnpm build
pnpm start
```

## 协议

只实现下面两种 OpenAI 兼容调用，不表示任意供应商都能用。公网地址必须是 https。`localhost`、`127.0.0.1`、`::1` 和 `host.docker.internal` 允许 http。其他内网主机要写进 `TRUSTED_PROVIDER_HOSTS`，不会被静默禁用。云元数据地址和链路本地地址始终拒绝。请求前会检查解析出的 IP。重定向直接失败，不跟随。超时 30 秒。地址中不能带账号密码。

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

`kind` 可以是 `title`、`bullets`、`table`、`diagram`、`chart`。图的 `diagram` 只能是 `flow`、`org`、`architecture`、`relation`。图表还要 `chart: bar|line|pie`，并用第二列为数字的表格。一次最多 40 张幻灯片，每页最多 8 个占位，一次绘制任务最多 320 项。诊断会写明行号。

## 来源和输出

| 来源 | PNG | SVG | PowerPoint 原生 |
| --- | --- | --- | --- |
| Mermaid `flowchart`/`graph` 的 TD、TB、LR | 位图文件 | 矢量文件，已去掉脚本和外部引用 | 形状和带端点绑定的连接线 |
| AntV G6 的 `{ nodes, edges }` JSON | 位图文件 | 矢量文件 | 形状和连接线 |
| 图表数据 `一月 10` 或 JSON | 由数据画出的预览图 | 矢量预览 | 图表部件和嵌入工作簿 |
| 模型插图 | 可以，并标明位图 | 拒绝 | 拒绝 |
| 其他 Mermaid 图种、带多余字段的 AntV JSON | 拒绝 | 拒绝 | 拒绝 |

编辑器里的 Mermaid 预览调用 `mermaid@12.3.0`。AntV 预览调用 `@antv/g6@5.1.1`，配置只经 JSON 解析，不执行脚本。PNG 用 `pngjs` 从同一份节点数据绘制。这三份库的许可证分别是 MIT、MIT、MIT。字体 Noto Sans SC 来自 Fontsource，许可证 OFL-1.1。

界面按本地安装的 Impeccable 4.5.1 技能阅读后实现（Apache-2.0）。已运行它的 `context` 脚本。没有名为 taste 的技能文件，因此没有加载。也没有跑概念选型骰子，因为这次要求直接按写好的旅程实现。视觉系统写在 `DESIGN.md`。

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
