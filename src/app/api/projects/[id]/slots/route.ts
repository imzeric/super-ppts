import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(getServices().addSlot(id, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
