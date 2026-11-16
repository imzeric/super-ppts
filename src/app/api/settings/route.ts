import { listCapabilities, saveCapability, type Capability } from "@/ai/credentials";
import { errorResponse } from "@/server/http";
import { getDatabase } from "@/server/runtime";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ profiles: listCapabilities(getDatabase(), process.env) });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { capability?: Capability; baseUrl?: string; model?: string; apiKey?: string };
    const profile = saveCapability(getDatabase(), {
      capability: body.capability ?? "text",
      baseUrl: body.baseUrl ?? "",
      model: body.model ?? "",
      apiKey: body.apiKey,
    });
    return Response.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
