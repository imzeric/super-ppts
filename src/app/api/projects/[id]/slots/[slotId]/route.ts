import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const { id, slotId } = await context.params;
    return Response.json(getServices().updateSlot(id, slotId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const { id, slotId } = await context.params;
    return Response.json(getServices().deleteSlot(id, slotId));
  } catch (error) {
    return errorResponse(error);
  }
}
