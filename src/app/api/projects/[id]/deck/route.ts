import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { aspect?: string; templateId?: string };
    return Response.json(getServices().updateDeck(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(getServices().confirmDeck(id));
  } catch (error) {
    return errorResponse(error);
  }
}
