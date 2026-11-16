import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const { id, slotId } = await context.params;
    const body = (await request.json()) as { diagramId?: string };
    return Response.json(getServices().attachDiagram(id, slotId, body.diagramId ?? ""));
  } catch (error) {
    return errorResponse(error);
  }
}
