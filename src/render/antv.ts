import { z } from "zod";

const configSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            label: z.string().max(80).optional(),
            style: z.object({ labelText: z.string().max(80).optional() }).strict().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    edges: z
      .array(
        z
          .object({
            source: z.string().min(1),
            target: z.string().min(1),
            label: z.string().max(80).optional(),
          })
          .strict(),
      )
      .max(80),
  })
  .strict();

export type AntvGraphConfig = z.infer<typeof configSchema>;

export function parseAntvGraph(source: string): AntvGraphConfig {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("AntV 配置必须是 JSON，不能是可执行脚本。");
  }
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) throw new Error("AntV 配置只接受 nodes 和 edges。不认识的字段会被拒绝。");
  const ids = new Set(parsed.data.nodes.map((node) => node.id));
  if (ids.size !== parsed.data.nodes.length) throw new Error("AntV 节点 id 不能重复。");
  for (const edge of parsed.data.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error("AntV 连线指向了不存在的节点。");
  }
  return parsed.data;
}

export function antvLabel(node: AntvGraphConfig["nodes"][number]): string {
  return node.label || node.style?.labelText || node.id;
}
