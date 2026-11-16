# Python 持久绘制任务

## 目标

在已合并的六步编辑器上增加一个内部 Python 服务，让批量绘制可以在页面刷新和进程重启后继续查询，并给出明确的中断、取消和重试。Next.js 继续负责编辑器、项目数据和原生 PPTX。Python 只负责任务队列。不引入 NestJS、Redis 或 Postgres。

## 所有权

- Next.js SQLite（`DATABASE_PATH`）是项目、大纲、页面、占位、图 IR、供应商密钥和导出记录的唯一写入者。
- Python SQLite（`WORKER_DATABASE_PATH`）是任务、逐项检查点和租约的唯一写入者。
- Python 不打开、不迁移 Next.js 的数据库文件。
- 浏览器只访问 Next.js。Compose 只发布 `127.0.0.1:3000`。Worker 没有宿主机端口。
- 两边用同一个 `INTERNAL_SERVICE_TOKEN`。请求带 `Authorization: Bearer` 和 `X-Contract-Version: 1`。
- 任务体只有项目 id、占位 id 和版本。密钥留在 Next.js，由内部执行接口现取现用，不进入任务库、日志或浏览器响应。

## 契约

`contracts/v1/job.schema.json` 是创建任务的版本源。FastAPI 同时提供 `/openapi.json`。`contractVersion` 不是 `1` 时返回 412 `SCHEMA_MISMATCH`。

创建任务：

```json
{
  "contractVersion": 1,
  "projectId": "…",
  "idempotencyKey": "…",
  "items": [{ "slotId": "…", "slotVersion": "…", "force": false }]
}
```

Worker 执行时调用 Next.js `POST /api/internal/generate-item`。Next.js 只有在占位的 `updated_at` 仍等于 `expectedVersion` 时才写入。成功结果由 Next.js 落库；Python 只记录状态。

## 状态

任务：`queued`、`running`、`cancelling`、`completed`、`cancelled`、`interrupted`。

单项：`pending`、`leased`、`succeeded`、`skipped`、`failed`、`cancelled`、`interrupted`。

- 同一项目最多一个 `queued|running|cancelling` 任务，否则 409 `JOB_ACTIVE`，并带回该任务 id。
- 相同幂等键和相同占位集合返回原任务。键相同但内容不同则 409 `IDEMPOTENCY_CONFLICT`。
- 已成功的项在非 force 时由 Next.js 返回 `skipped`，不再次调用模型。
- 取消把未开始项标为 `cancelled`，并关闭当前的内部 HTTP 调用。已经写成功的项保留。
- 取消只能传到当前这次内部调用。供应商若已经收到请求，仍可能计费。这不是 exactly-once。
- 进程启动时，把上一进程遗留的 `leased` 项标为 `interrupted`，不自动重试。尚未开始的 `pending` 可以继续。
- 连不上 Next.js 时，单项最多重试 3 次连接（200ms、500ms、1000ms）。一旦请求已经发出但没有完整响应，就标 `interrupted`，不再自动重试。
- 租约默认 10 秒，处理中每 3 秒续约。过期租约在下一轮循环里按启动恢复同样处理。

## 这一版不做什么

不把 PDF/DOCX 提取或另一套 Mermaid 编译器放进本版。原生形状、绑定连接线、图表工作簿仍由现有 PptxGenJS 和 OOXML 后处理产生。Python 不把位图声明成原生对象。

## 迁移与回退

只增加 `schema_migrations` 和 `generation_runs` 的可空列。不删除用户数据。升级前复制 `data/super-ppts.db`。回退时停止进程，用该副本换回数据库文件。

## 密钥与地址

本地 SQLite 里的供应商密钥仍是明文。不在数据库旁边再放一把“加密密钥”假装加密。

公网模型地址必须是 https。解析出的每个地址都不能是未信任的内网、回环、运营商级 NAT、链路本地或云元数据地址。重定向直接失败，不跟随。

默认信任 `localhost`、`127.0.0.1`、`::1`、`host.docker.internal`，这些地址允许 http。其他内网主机只有写在 `TRUSTED_PROVIDER_HOSTS` 里才允许。云元数据主机名和 `169.254.169.254` 始终拒绝。

## 限额

产品原有限额不变：说明最多 100 万字，最多 40 页，每页最多 8 个占位。一次任务最多 320 项。模型调用超时 30 秒。Worker 等待内部执行最多 45 秒。只运行一个 worker 副本。
