import { randomUUID } from "node:crypto";
import { AppError } from "@/domain/errors";
import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";
import { createDurableJob } from "@/server/workerClient";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || randomUUID();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
      throw new AppError("VALIDATION", "幂等键长度需要在 8 到 120 之间。", 400);
    }
    const body = (await request.json()) as { slotIds?: string[]; force?: boolean };
    const items = getServices().prepareGeneration(id, body);
    try {
      const job = await createDurableJob({ projectId: id, idempotencyKey, items });
      getServices().recordGenerationRun(id, job.jobId, idempotencyKey);
      return Response.json({ runId: job.jobId, status: job.status, items: job.items, project: getServices().getProject(id) }, { status: 201 });
    } catch (error) {
      if (error instanceof AppError && error.jobId) getServices().recordGenerationRun(id, error.jobId, idempotencyKey);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
