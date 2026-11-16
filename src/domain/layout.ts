import { type Diagram, type DiagramNode } from "./types";

const CONTENT = { x: 548640, y: 1371600, w: 11094720, h: 4572000 };
const NODE_W = 2743200;
const NODE_H = 800000;
const GAP_X = 360000;
const GAP_Y = 480000;

export function layoutDiagram(diagram: Diagram): Diagram {
  if (diagram.layout.algorithm === "manual") return structuredClone(diagram);
  const layers = assignLayers(diagram);
  const positions = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, layerIndex) => {
    const count = layer.length;
    const totalW = count * NODE_W + Math.max(0, count - 1) * GAP_X;
    const totalH = count * NODE_H + Math.max(0, count - 1) * GAP_Y;
    layer.forEach((id, index) => {
      if (diagram.layout.direction === "LR") {
        positions.set(id, {
          x: CONTENT.x + layerIndex * (NODE_W + GAP_X),
          y: CONTENT.y + Math.round((CONTENT.h - totalH) / 2) + index * (NODE_H + GAP_Y),
        });
      } else {
        positions.set(id, {
          x: CONTENT.x + Math.round((CONTENT.w - totalW) / 2) + index * (NODE_W + GAP_X),
          y: CONTENT.y + layerIndex * (NODE_H + GAP_Y),
        });
      }
    });
  });
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const pos = positions.get(node.id);
      return pos ? { ...node, x: pos.x, y: pos.y, w: NODE_W, h: NODE_H } : node;
    }),
  };
}

function assignLayers(diagram: Diagram): string[][] {
  const ids = diagram.nodes.map((node) => node.id);
  const order = new Map(ids.map((id, index) => [id, index]));
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of diagram.edges) incoming.get(edge.target)?.push(edge.source);
  const layerOf = new Map<string, number>();
  const visiting = new Set<string>();

  const depth = (id: string): number => {
    const known = layerOf.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    const layer = preds.length === 0 ? 0 : Math.max(...preds.map((pred) => depth(pred))) + 1;
    visiting.delete(id);
    layerOf.set(id, layer);
    return layer;
  };

  ids.forEach((id) => depth(id));
  const height = Math.max(0, ...layerOf.values());
  const layers: string[][] = Array.from({ length: height + 1 }, () => []);
  for (const id of ids) layers[layerOf.get(id) ?? 0]?.push(id);
  for (const layer of layers) layer.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return layers;
}

export function seedDiagram(id: string, labels: string[], direction: "TB" | "LR" = "TB"): Diagram {
  const nodes: DiagramNode[] = labels.map((label, index) => ({
    id: `n${index + 1}`,
    label,
    shape: index === 0 ? "roundRect" : index === labels.length - 1 ? "ellipse" : "rect",
    x: 0,
    y: 0,
    w: NODE_W,
    h: NODE_H,
  }));
  return layoutDiagram({
    id,
    version: 1,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `e${index + 1}`,
      source: node.id,
      target: nodes[index + 1]!.id,
      routing: "straight",
      sourceAnchor: "auto",
      targetAnchor: "auto",
    })),
    layout: { algorithm: "layered", direction },
    theme: {
      fontLatin: "Microsoft YaHei",
      fontEa: "Microsoft YaHei",
      ink: "1A1714",
      paper: "EFE6D6",
      accent: "C23B22",
    },
  });
}
