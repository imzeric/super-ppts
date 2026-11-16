# super-ppts 首版规格

状态：用户已于 2026-11-16 回复「可以」批准。本文件是实现合同。日期：2026-11-16。

## 目标

单进程、单用户、中文界面的 Next.js 应用。用户从主题或粘贴内容得到可编辑大纲，确认优化候选，批准后生成 16:9 幻灯片预览，并下载可在 PowerPoint 中继续编辑的 `.pptx`。图编辑器与幻灯片共用 diagram id。节点是原生形状，边是带端点绑定的原生连接线。柱状、折线、饼图是带嵌入工作簿的原生图表。

## 非目标

登录、协作、部署、付费服务、导入已有 PPTX、模板库、多智能体、视觉 QA、动画、SmartArt、公式、音视频、组合图表、字体嵌入、把整页 SVG/PNG/EMF 当作可编辑结果。

## 部署边界

本机受信任的单用户。数据库是服务器上的 SQLite 文件。没有账号隔离。不要把进程暴露到不受信任的网络。

## 技术选择

- Next.js 16 App Router，React 19，TypeScript 5.9，一个 Node 进程。
- 持久化使用 Node 22 内置 `node:sqlite` 的 `DatabaseSync`。该 API 在 Node 22 仍标为实验特性；启动脚本关闭 ExperimentalWarning。不引入需要编译的原生 SQLite 绑定。
- 校验使用 Zod 3.25（MIT）。
- PPTX 文字、形状、表格、图表由 PptxGenJS 4（MIT）写出。连接线端点绑定和东亚字体 `a:ea` 由导出后的 OOXML 后处理写入。库文档不作为已验证能力。
- 解压断言使用 fflate（MIT）。
- 测试使用 Vitest 5（MIT）与 Playwright（Apache-2.0）。

引入上述包之前已用 `npm view <name> license` 核对许可证。不复制未核实的第三方仓库代码。

## 数据

SQLite 文件默认 `data/super-ppts.db`，可用 `DATABASE_PATH` 覆盖。文件不入库。

表：

- `projects`：id、title、source_kind（topic 或 paste）、source_text、created_at
- `outline_versions`：id、project_id、version_no、status（draft 或 approved）、role（current、candidate、archived）、sections_json、created_at
- `decks`：id、project_id（唯一）、outline_version_id、stale、slides_json、created_at
- `diagrams`：id、project_id、ir_json、updated_at
- `export_jobs`：id、project_id、deck_id、status、error_code、byte_size、created_at

同一项目同时最多一份 current 大纲、一份 candidate、一份 deck。

## 大纲

节种类只有：`title`、`bullets`、`table`、`diagram`、`chart`。

节数 1 到 8。界面写明：「首版一次最多 8 张幻灯片，用来逐张核对原生文字、表格、形状、连接线和图表。」这是验收范围，不是内容质量上限。

其他边界：

- 源文本 1 到 8000 字
- 标题最多 80 字，副标题最多 120 字
- 要点最多 12 条，每条最多 200 字
- 表格最多 6 列、12 行，单元格最多 80 字，每行长度等于表头
- 图最多 24 个节点、40 条边，标签最多 80 字
- 图表最多 12 个类别、4 个系列；饼图恰好 1 个系列；每个系列的数值个数等于类别个数，且为有限数字
- 优化说明最多 500 字

生成、人工保存、采用优化都新增版本。人工修改已批准大纲后，当前版本回到 draft，deck.stale 置 1，未采用的候选作废。未批准或 deck 已过期时导出返回 409 `OUTLINE_NOT_APPROVED`。

优化只写入 candidate。采用后 candidate 变为 current 且 status 为 draft。放弃则只归档候选。

## 图

Diagram IR 版本 1：节点（id、label、shape、x、y、w、h，单位 EMU）、边（id、source、target、可选 label、routing 为 straight 或 orthogonal、锚点）、layout（layered 或 manual，方向 TB 或 LR）、theme（fontLatin、fontEa、ink、paper、accent）。

形状只允许 rect、roundRect、ellipse、diamond。边的两端必须指向现存节点。

分层布局对同一 IR 连续两次结果相同，不使用随机数。manual 布局保持坐标。物化图节时，若该节还没有 diagramId，按要点顺序播种节点并串成边，写入 layered 布局，把 diagramId 回写到大纲节。再次物化不覆盖已有图。图页面提供明确动作「按要点重排」，才会用当前要点替换节点。

独立页面 `/diagrams/[id]` 与幻灯片预览使用同一个 id。保存后重新加载仍在。

幻灯片坐标空间为 12192000 × 6858000 EMU（16:9）。

## 幻灯片与导出

一节一张幻灯片。预览是 HTML/SVG，页面固定文案：「屏幕预览，不是 PowerPoint 的像素结果。」

导出文件必须满足：

- 幻灯片尺寸为 16:9
- 文字在 `p:sp` / `a:t`，并同时存在 `a:latin` 与 `a:ea`，字体名 Microsoft YaHei。字体不嵌入
- 图节点是 `p:sp`，`cNvPr` 名称可追溯到节点 id
- 图的边是 `p:cxnSp`，`a:stCxn` 与 `a:endCxn` 的 id 等于源、目标形状的 `cNvPr` id
- 表格是 `a:tbl`
- 图表有 `ppt/charts/chartN.xml`，以及 `ppt/embeddings/` 下的 xlsx；工作簿内容包含图表类别和数值
- 图和图表不产生 `ppt/media` 图片部件
- 端点无法绑定、悬空边、缺失图或图表数据时导出失败，禁止改成图片

不支持的能力直接拒绝：SmartArt、公式、音视频、动画、组合图表、图片化的图。

## 模型

环境变量只在服务端读取：`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。

- 三个值都为空：演示模式。界面出现「演示模式」。使用仓库内中文夹具。演示路径不得调用 fetch。
- `AI_API_KEY` 非空：在线模式。`AI_BASE_URL` 或 `AI_MODEL` 缺失时返回配置错误，不访问网络，也不退回演示数据。
- 在线请求为 OpenAI 兼容 `chat/completions`，要求 JSON 对象。超时 30 秒。
- 网络失败、非成功状态或 JSON 不符合大纲结构时，保留上一版，返回 `PROVIDER_UNAVAILABLE` 或 `PROVIDER_SCHEMA`。错误正文不得包含密钥。不得把失败伪装成演示成功。

演示夹具主题是「社区图书角三个月试点」，覆盖五种版式。优化夹具把目标节标题加上「（收紧）」。

## 界面

路径：

- `/` 创建项目
- `/projects/[id]` 编辑大纲、优化、采用或放弃、批准并生成预览
- `/projects/[id]/preview` 预览与导出
- `/diagrams/[id]` 编辑节点、边、标签、形状、坐标、方向，以及确定性重排

空状态、生成中、保存中、错误都要有中文说明和下一步。进度可见：大纲、预览、导出。

视觉方向是印刷校对台：暖纸色、墨色、朱印红，而不是通用紫渐变后台。中文使用本机可显示的字体栈，保证无外网字体时仍能阅读。

## 错误

| code | 含义 | HTTP |
| --- | --- | --- |
| VALIDATION | 输入超出边界或结构不合法 | 400 |
| OUTLINE_NOT_APPROVED | 未批准或预览已过期 | 409 |
| DANGLING_EDGE | 边指向不存在的节点 | 422 |
| DIAGRAM_NOT_FOUND | 幻灯片引用的图不存在 | 422 |
| PROVIDER_SCHEMA | 模型输出无法解析 | 422 |
| PROVIDER_UNAVAILABLE | 模型服务失败或超时 | 502 |
| PROVIDER_CONFIG | 有密钥但缺少地址或模型名 | 400 |
| EXPORT_CONNECTOR_BIND | 连接线不能绑定到形状 | 500 |
| NOT_FOUND | 项目或图不存在 | 404 |

响应体只有 `{ code, message }`。message 使用中文，说明可以怎么改。

## 验收

1. 无密钥时界面标明演示模式，生成大纲不发起模型请求。
2. 大纲可编辑并在重新加载后仍在。优化产生候选；采用后替换；放弃后保留原大纲。
3. 已批准后再编辑，状态回到草稿，导出被拒绝。
4. 批准并物化后，预览含五种版式之一的演示文稿，并标明预览不是像素级 PowerPoint。
5. 图编辑保存、重新加载后标签仍在；预览链接打开同一 id。
6. 下载的 pptx 经解压后：形状 id、`p:cxnSp` 的 `stCxn`/`endCxn` 指向源和目标、`a:tbl`、图表部件和嵌入工作簿中的类别与数值都存在；图和图表没有图片部件。
7. 有密钥时失败不会变成演示夹具，响应中没有密钥。
8. `pnpm exec tsc --noEmit`、`pnpm test`、`pnpm build` 成功。浏览器跑通演示主路径。

## 自检

- 节数上限与「不要无故压低内容上限」同时成立：保留设计中的 1–8，并在界面说明原因。
- 演示模式与在线失败分开：只有密钥为空才用夹具。
- 预览 SVG 与导出 OOXML 分开写明，预览不算可编辑成品。
- 图表验收看工作簿内容，不只看 `c:numCache`。
- 图 id 在大纲节、deck 幻灯片和独立路由之间是同一个值。
- 单用户 SQLite 与「无登录」一致；多用户不在本版。
- 验收第 6 条补上了连接线 id 解析、表格、图表工作簿和禁止图片化，避免只有手工打开 PowerPoint 才算数。
