import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourceKind?: "topic" | "paste"; sourceText?: string };
    const view = await getServices().createProject({
      sourceKind: body.sourceKind ?? "topic",
      sourceText: body.sourceText ?? "",
    });
    return Response.json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
