import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { instruction?: string; sectionId?: string };
    return Response.json(await getServices().optimize(id, { instruction: body.instruction ?? "", sectionId: body.sectionId }));
  } catch (error) {
    return errorResponse(error);
  }
}
