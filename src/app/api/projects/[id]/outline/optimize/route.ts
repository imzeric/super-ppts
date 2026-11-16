import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { instruction?: string; headingId?: string };
    return Response.json(await getServices().optimize(id, { instruction: body.instruction ?? "", headingId: body.headingId }));
  } catch (error) {
    return errorResponse(error);
  }
}
