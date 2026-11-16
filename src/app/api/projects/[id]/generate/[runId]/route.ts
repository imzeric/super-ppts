import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";
import { readDurableJob } from "@/server/workerClient";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const { id, runId } = await context.params;
    getServices().requireOwnedRun(id, runId);
    return Response.json(await readDurableJob(id, runId));
  } catch (error) {
    return errorResponse(error);
  }
}
