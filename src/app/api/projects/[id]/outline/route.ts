import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { sections?: unknown };
    return Response.json(await getServices().updateOutline(id, body.sections));
  } catch (error) {
    return errorResponse(error);
  }
}
