import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";
import { retryDurableJob } from "@/server/workerClient";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const { id, runId } = await context.params;
    getServices().requireOwnedRun(id, runId);
    return Response.json(await retryDurableJob(id, runId));
  } catch (error) {
    return errorResponse(error);
  }
}
