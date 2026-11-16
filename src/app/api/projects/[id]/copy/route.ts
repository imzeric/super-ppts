import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";
import type { SlideCopy } from "@/server/service";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(getServices().generateCopy(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { slides?: SlideCopy[] };
    return Response.json(getServices().updateCopy(id, body.slides ?? []));
  } catch (error) {
    return errorResponse(error);
  }
}
