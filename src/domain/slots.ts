import { z } from "zod";
import { AppError } from "./errors";
import type { ChartSpec, TableSpec } from "./types";

export const SLIDE_CX = 12_192_000;
export const SLIDE_CY = 6_858_000;

export const OUTPUT_TYPES = [
  "diagram-flow",
  "diagram-org",
  "diagram-architecture",
  "diagram-relation",
  "chart-bar",
  "chart-line",
  "chart-pie",
  "table",
  "illustration",
] as const;

export type OutputType = (typeof OUTPUT_TYPES)[number];

export const OUTPUT_LABEL: Record<OutputType, string> = {
  "diagram-flow": "流程图",
  "diagram-org": "组织图",
  "diagram-architecture": "架构图",
  "diagram-relation": "关系图",
  "chart-bar": "柱状图",
  "chart-line": "折线图",
  "chart-pie": "饼图",
  "table": "表格",
  illustration: "插图",
};

export type Slot = {
  id: string;
  slideId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  description: string;
  instruction: string;
  outputType: OutputType;
  sourceKind: "native" | "mermaid" | "antv" | "chart" | "image";
  sourceText: string;
  outputMode: "png" | "svg" | "native";
  status: "empty" | "succeeded" | "failed";
  stale: boolean;
  detached?: boolean;
  error?: string;
  diagramId?: string;
  chart?: ChartSpec;
  table?: TableSpec;
  imageBase64?: string;
  svg?: string;
  resultKind?: "native" | "raster" | "vector";
};

const slotSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    slideId: z.string().trim().min(1).max(80),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().min(600_000, "占位宽度至少约 1.7 厘米。"),
    h: z.number().int().min(400_000, "占位高度至少约 1.1 厘米。"),
    title: z.string().trim().min(1, "占位需要标题。").max(80),
    description: z.string().max(400, "画面描述最多 400 字。"),
    instruction: z.string().max(400, "绘图说明最多 400 字。"),
    outputType: z.enum(OUTPUT_TYPES),
    sourceKind: z.enum(["native", "mermaid", "antv", "chart", "image"]).default("native"),
    sourceText: z.string().max(20_000).default(""),
    outputMode: z.enum(["png", "svg", "native"]).default("native"),
    status: z.enum(["empty", "succeeded", "failed"]).default("empty"),
    stale: z.boolean().default(false),
    detached: z.boolean().default(false),
    error: z.string().max(300).optional(),
    diagramId: z.string().min(1).max(80).optional(),
    chart: z.any().optional(),
    table: z.any().optional(),
    imageBase64: z.string().max(2_000_000).optional(),
    svg: z.string().max(500_000).optional(),
    resultKind: z.enum(["native", "raster", "vector"]).optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.x + slot.w > SLIDE_CX || slot.y + slot.h > SLIDE_CY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "占位框超出 16:9 幻灯片。" });
    }
  });

export function parseSlot(input: unknown): Slot {
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "占位不符合要求。", 400);
  return parsed.data as Slot;
}

export function isRaster(type: OutputType): boolean {
  return type === "illustration";
}
