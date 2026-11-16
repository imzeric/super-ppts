import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { direction?: "TB" | "LR" };
    const direction = body.direction === "LR" ? "LR" : "TB";
    return Response.json(getServices().relayoutDiagram(id, direction));
  } catch (error) {
    return errorResponse(error);
  }
}
