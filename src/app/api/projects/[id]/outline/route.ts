import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { markdown?: string };
    return Response.json(getServices().updateMarkdown(id, body.markdown ?? ""));
  } catch (error) {
    return errorResponse(error);
  }
}
