import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    getServices().cancelRun(runId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
