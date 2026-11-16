import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ mode: getServices().mode });
}
