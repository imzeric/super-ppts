import type { DiagramIntent } from "../domain/types";

export type MermaidGraph = {
  direction: "TB" | "LR";
  nodes: Array<{ id: string; label: string; shape: "rect" | "roundRect" | "ellipse" | "diamond" }>;
  edges: Array<{ source: string; target: string; label?: string }>;
};

const SUPPORTED = "当前只支持 Mermaid 的 flowchart/graph，方向为 TD、TB 或 LR。节点可用 A[文字]、A(文字)、A((文字))、A{文字}，连线用 -->。";

export function parseMermaidFlow(source: string): MermaidGraph {
  const lines = source.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("%%"));
  const first = lines[0] ?? "";
  const header = /^(flowchart|graph)\s+(TD|TB|LR)$/i.exec(first);
  if (!header) {
    if (/^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey)\b/i.test(first)) {
      throw new Error(`${SUPPORTED}「${first.split(/\s/)[0]}」不会被改成图片冒充。`);
    }
    throw new Error(SUPPORTED);
  }
  const direction = header[2]!.toUpperCase() === "LR" ? "LR" : "TB";
  const nodes = new Map<string, MermaidGraph["nodes"][number]>();
  const edges: MermaidGraph["edges"] = [];
  lines.slice(1).forEach((line, index) => {
    const parts = line.split(/\s+-->\s*/);
    if (parts.length < 2) throw new Error(`第 ${index + 2} 行不是支持的连线。`);
    let previous: string | undefined;
    parts.forEach((part, partIndex) => {
      let label: string | undefined;
      let chunk = part.trim();
      if (partIndex > 0) {
        const labeled = /^\|([^|]*)\|\s*(.*)$/.exec(chunk);
        if (labeled) {
          label = labeled[1]?.trim();
          chunk = labeled[2] ?? "";
        }
      }
      const node = readNode(chunk);
      if (!node) throw new Error(`第 ${index + 2} 行有无法识别的节点。`);
      if (!nodes.has(node.id)) nodes.set(node.id, node);
      if (previous) edges.push({ source: previous, target: node.id, label });
      previous = node.id;
    });
  });
  if (nodes.size < 2 || edges.length < 1) throw new Error("流程图至少需要两个节点和一条连线。");
  return { direction, nodes: [...nodes.values()], edges };
}

function readNode(chunk: string): MermaidGraph["nodes"][number] | undefined {
  const match = /^([A-Za-z][\w-]*)\s*(?:\[\s*([^\]]+?)\s*\]|\(\(\s*([^)]+?)\s*\)\)|\(\s*([^)]+?)\s*\)|\{\s*([^}]+?)\s*\})?$/.exec(chunk.trim());
  if (!match) return undefined;
  const id = match[1] ?? "";
  const rect = match[2];
  const ellipse = match[3];
  const round = match[4];
  const diamond = match[5];
  const label = rect ?? ellipse ?? round ?? diamond ?? id;
  const shape = ellipse ? "ellipse" : round ? "roundRect" : diamond ? "diamond" : "rect";
  return { id, label, shape };
}

export function mermaidIntent(): DiagramIntent {
  return "flow";
}
