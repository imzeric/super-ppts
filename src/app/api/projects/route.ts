import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { background?: string };
    return Response.json(await getServices().createProject({ background: body.background ?? "" }));
  } catch (error) {
    return errorResponse(error);
  }
}
