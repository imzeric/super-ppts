import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { slotIds?: string[]; force?: boolean };
    return Response.json(await getServices().generateSlots(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
