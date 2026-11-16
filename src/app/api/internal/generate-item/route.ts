import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (!token || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) return Response.json({ code: "UNAUTHORIZED", message: "内部调用未通过校验。" }, { status: 401 });
    if (request.headers.get("x-contract-version") !== "1") {
      return Response.json({ code: "SCHEMA_MISMATCH", message: "服务契约版本不一致。" }, { status: 412 });
    }
    const body = (await request.json()) as {
      contractVersion?: number;
      projectId?: string;
      slotId?: string;
      expectedVersion?: string;
      force?: boolean;
    };
    if (body.contractVersion !== 1 || !body.projectId || !body.slotId || !body.expectedVersion) {
      return Response.json({ code: "VALIDATION", message: "内部绘制请求不符合契约。" }, { status: 422 });
    }
    const result = await getServices().executeJobItem(
      body.projectId,
      { slotId: body.slotId, expectedVersion: body.expectedVersion, force: body.force },
      request.signal,
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
