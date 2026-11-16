import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";
import type { SlideCopy } from "@/server/service";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { slides?: SlideCopy[]; slots?: unknown[] };
    return Response.json(getServices().saveWorkspace(id, { slides: body.slides ?? [], slots: body.slots ?? [] }));
  } catch (error) {
    return errorResponse(error);
  }
}
