export const runtime = "nodejs";

export async function GET() {
  const workerUrl = process.env.WORKER_URL?.trim();
  if (!workerUrl) {
    return Response.json({ ok: true, worker: "down", message: "批量绘制服务没有配置。编辑和已保存的文稿仍可使用。" });
  }
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/health`);
    if (!response.ok) throw new Error("down");
    const body = (await response.json()) as { contractVersion?: number };
    if (body.contractVersion !== 1) {
      return Response.json({ ok: true, worker: "mismatch", message: "绘制服务版本不一致。请重新启动同一版本。" });
    }
    return Response.json({ ok: true, worker: "up", message: "绘制服务可用。" });
  } catch {
    return Response.json({ ok: true, worker: "down", message: "批量绘制服务没有连上。已保存的内容还在。" });
  }
}
