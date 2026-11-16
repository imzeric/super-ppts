import { errorResponse } from "@/server/http";
import { getServices } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const { id, slotId } = await context.params;
    const format = new URL(request.url).searchParams.get("format");
    const slot = getServices().getProject(id).slots.find((item) => item.id === slotId);
    if (!slot) return Response.json({ code: "NOT_FOUND", message: "没有找到这个占位。" }, { status: 404 });
    if (format === "svg" && slot.svg) {
      return new Response(slot.svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `attachment; filename="${slotId}.svg"` } });
    }
    if (format === "png" && slot.imageBase64) {
      return new Response(Buffer.from(slot.imageBase64, "base64"), {
        headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${slotId}.png"` },
      });
    }
    return Response.json({ code: "VALIDATION", message: "这个占位没有可下载的 PNG 或 SVG。原生结果请导出 PPTX。" }, { status: 422 });
  } catch (error) {
    return errorResponse(error);
  }
}
