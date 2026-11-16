import { clearCapabilityKey, publicCapability, readCapability, type Capability } from "@/ai/credentials";
import { errorResponse } from "@/server/http";
import { getDatabase } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { capability?: Capability };
    const capability = body.capability ?? "text";
    clearCapabilityKey(getDatabase(), capability);
    return Response.json(publicCapability(readCapability(getDatabase(), process.env, capability)));
  } catch (error) {
    return errorResponse(error);
  }
}