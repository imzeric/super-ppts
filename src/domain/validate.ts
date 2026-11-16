import { z } from "zod";
import { AppError } from "./errors";
import { LIMITS, type Diagram, type OutlineSection } from "./types";

const text = (max: number, label: string) => z.string().trim().min(1, `${label}不能为空。`).max(max, `${label}最多 ${max} 个字。`);

const chartSchema = z
  .object({
    type: z.enum(["bar", "line", "pie"]),
    categories: z.array(text(LIMITS.cell, "图表类别")).min(1, "图表至少要有一个类别。").max(LIMITS.categoriesMax),
    series: z
      .array(
        z.object({
          name: text(LIMITS.title, "系列名称"),
          values: z.array(z.number().finite("图表数值必须是有限数字。")).min(1).max(LIMITS.categoriesMax),
        }),
      )
      .min(1, "图表至少要有一个系列。")
      .max(LIMITS.seriesMax, `图表最多 ${LIMITS.seriesMax} 个系列。`),
  })
  .superRefine((chart, ctx) => {
    if (chart.type === "pie" && chart.series.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "饼图只能有一个系列。" });
    }
    chart.series.forEach((series, index) => {
      if (series.values.length !== chart.categories.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `系列「${series.name}」的数值个数必须和类别个数一致。`,
          path: ["series", index],
        });
      }
    });
  });

const tableSchema = z
  .object({
    headers: z.array(text(LIMITS.cell, "表头")).min(1).max(LIMITS.tableCols, `表格最多 ${LIMITS.tableCols} 列。`),
    rows: z.array(z.array(z.string().max(LIMITS.cell))).min(1, "表格至少要有一行。").max(LIMITS.tableRows),
  })
  .superRefine((table, ctx) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.headers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `第 ${index + 1} 行的列数和表头不一致。`,
          path: ["rows", index],
        });
      }
    });
  });

const sectionSchema = z
  .object({
    id: text(80, "节编号"),
    kind: z.enum(["title", "bullets", "table", "diagram", "chart"]),
    title: text(LIMITS.title, "标题"),
    subtitle: z.string().max(LIMITS.subtitle, `副标题最多 ${LIMITS.subtitle} 个字。`).optional(),
    bullets: z.array(text(LIMITS.bullet, "要点")).max(LIMITS.bulletsMax).optional(),
    table: tableSchema.optional(),
    chart: chartSchema.optional(),
    diagramId: z.string().min(1).max(80).optional(),
    diagramIntent: z.enum(["flow", "org", "architecture", "relation"]).optional(),
    notes: z.string().max(LIMITS.notes).optional(),
  })
  .superRefine((section, ctx) => {
    if (section.kind === "bullets" && (section.bullets?.length ?? 0) < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "要点页至少要有一条要点。" });
    }
    if (section.kind === "diagram" && (section.bullets?.length ?? 0) < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "流程图至少要有两个节点要点。" });
    }
    if (section.kind === "table" && !section.table) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "表格页缺少表格。" });
    }
    if (section.kind === "chart" && !section.chart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "图表页缺少图表数据。" });
    }
  });

const outlineSchema = z
  .array(sectionSchema)
  .min(LIMITS.sectionsMin, `大纲至少要有 ${LIMITS.sectionsMin} 节。`)
  .max(LIMITS.sectionsMax, `一次最多解析 ${LIMITS.sectionsMax} 张幻灯片。原文会完整保留，超出的部分不会悄悄删掉，但需要拆开后再确认。`);

const diagramSchema = z
  .object({
    id: text(80, "图编号"),
    version: z.literal(1),
    nodes: z
      .array(
        z.object({
          id: text(80, "节点编号"),
          label: text(LIMITS.nodeLabel, "节点文字"),
          shape: z.enum(["rect", "roundRect", "ellipse", "diamond"]),
          x: z.number().int().finite(),
          y: z.number().int().finite(),
          w: z.number().int().positive("节点宽度必须大于 0。"),
          h: z.number().int().positive("节点高度必须大于 0。"),
        }),
      )
      .min(1, "图至少要有一个节点。")
      .max(LIMITS.nodesMax, `图最多 ${LIMITS.nodesMax} 个节点。`),
    edges: z
      .array(
        z.object({
          id: text(80, "连线编号"),
          source: text(80, "起点"),
          target: text(80, "终点"),
          label: z.string().max(LIMITS.nodeLabel).optional(),
          routing: z.enum(["straight", "orthogonal"]),
          sourceAnchor: z.enum(["top", "right", "bottom", "left", "auto"]),
          targetAnchor: z.enum(["top", "right", "bottom", "left", "auto"]),
        }),
      )
      .max(LIMITS.edgesMax),
    layout: z.object({
      algorithm: z.enum(["layered", "manual"]),
      direction: z.enum(["TB", "LR"]),
    }),
    theme: z.object({
      fontLatin: z.string().min(1),
      fontEa: z.string().min(1),
      ink: z.string().regex(/^[0-9A-Fa-f]{6}$/),
      paper: z.string().regex(/^[0-9A-Fa-f]{6}$/),
      accent: z.string().regex(/^[0-9A-Fa-f]{6}$/),
    }),
  })
  .superRefine((diagram, ctx) => {
    const nodeIds = new Set(diagram.nodes.map((node) => node.id));
    if (nodeIds.size !== diagram.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "节点编号不能重复。" });
    }
    const edgeIds = new Set<string>();
    diagram.edges.forEach((edge) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "连线编号不能重复。" });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "有连线指向不存在的节点。" });
      }
    });
  });

function fail(error: z.ZodError, code: "VALIDATION" | "DANGLING_EDGE"): never {
  const dangling = error.issues.some((issue) => issue.message.includes("指向不存在"));
  throw new AppError(
    dangling ? "DANGLING_EDGE" : code,
    error.issues[0]?.message ?? "内容不符合要求。",
    dangling ? 422 : 400,
  );
}

export function parseOutline(input: unknown): OutlineSection[] {
  const parsed = outlineSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error, "VALIDATION");
  return parsed.data;
}

export function parseDiagram(input: unknown): Diagram {
  const parsed = diagramSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error, "VALIDATION");
  return parsed.data;
}

export function parseSourceText(input: unknown): string {
  const parsed = z.string().trim().min(1, "请先写下生成说明。").max(LIMITS.transportText, "超过单次传输上限 100 万字，内容没有被截断保存。请分成多份再试。").safeParse(input);
  if (!parsed.success) fail(parsed.error, "VALIDATION");
  return parsed.data;
}
