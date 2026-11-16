import { type Diagram, type DiagramIntent, type DiagramNode } from "./types";

const CONTENT = { x: 548640, y: 1371600, w: 11094720, h: 4572000 };
const NODE_W = 2743200;
const NODE_H = 800000;
const GAP_X = 360000;
const GAP_Y = 480000;

export type LayoutBox = { x: number; y: number; w: number; h: number };

export function layoutDiagram(diagram: Diagram, box: LayoutBox = CONTENT): Diagram {
  if (diagram.layout.algorithm === "manual") return structuredClone(diagram);
  const layers = assignLayers(diagram);
  const gapX = Math.min(GAP_X, Math.max(40000, Math.floor(box.w / 10)));
  const gapY = Math.min(GAP_Y, Math.max(40000, Math.floor(box.h / 10)));
  const nodeW = Math.max(300000, Math.min(NODE_W, Math.floor(box.w / 3)));
  const nodeH = Math.max(240000, Math.min(NODE_H, Math.floor(box.h / 4)));
  const positions = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, layerIndex) => {
    const count = layer.length;
    const totalW = count * nodeW + Math.max(0, count - 1) * gapX;
    const totalH = count * nodeH + Math.max(0, count - 1) * gapY;
    layer.forEach((id, index) => {
      if (diagram.layout.direction === "LR") {
        positions.set(id, {
          x: box.x + layerIndex * (nodeW + gapX),
          y: box.y + Math.round((box.h - totalH) / 2) + index * (nodeH + gapY),
        });
      } else {
        positions.set(id, {
          x: box.x + Math.round((box.w - totalW) / 2) + index * (nodeW + gapX),
          y: box.y + layerIndex * (nodeH + gapY),
        });
      }
    });
  });
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const pos = positions.get(node.id);
      return pos ? { ...node, x: pos.x, y: pos.y, w: nodeW, h: nodeH } : node;
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

export function seedDiagram(id: string, labels: string[], direction: "TB" | "LR" = "TB", box?: LayoutBox): Diagram {
  const nodes: DiagramNode[] = labels.map((label, index) => ({
    id: `n${index + 1}`,
    label,
    shape: index === 0 ? "roundRect" : index === labels.length - 1 ? "ellipse" : "rect",
    x: 0,
    y: 0,
    w: NODE_W,
    h: NODE_H,
  }));
  return layoutDiagram(diagramFrom(id, nodes, chainEdges(nodes), direction), box);
}

export function seedByIntent(id: string, labels: string[], intent: DiagramIntent, box?: LayoutBox): Diagram {
  const direction = intent === "architecture" ? "LR" : "TB";
  const nodes: DiagramNode[] = labels.map((label, index) => ({
    id: `n${index + 1}`,
    label,
    shape: intent === "relation" ? "ellipse" : intent === "architecture" ? "rect" : index === 0 ? "roundRect" : "rect",
    x: 0,
    y: 0,
    w: NODE_W,
    h: NODE_H,
  }));
  const edges =
    intent === "relation"
      ? nodes.slice(1).map((node, index) => edge(`e${index + 1}`, nodes[0]!.id, node.id))
      : chainEdges(nodes);
  return layoutDiagram(diagramFrom(id, nodes, edges, direction), box);
}

function chainEdges(nodes: DiagramNode[]): Diagram["edges"] {
  return nodes.slice(0, -1).map((node, index) => edge(`e${index + 1}`, node.id, nodes[index + 1]!.id));
}

function edge(id: string, source: string, target: string): Diagram["edges"][number] {
  return { id, source, target, routing: "straight", sourceAnchor: "auto", targetAnchor: "auto" };
}

function diagramFrom(id: string, nodes: DiagramNode[], edges: Diagram["edges"], direction: "TB" | "LR"): Diagram {
  return {
    id,
    version: 1,
    nodes,
    edges,
    layout: { algorithm: "layered", direction },
    theme: {
      fontLatin: "Microsoft YaHei",
      fontEa: "Microsoft YaHei",
      ink: "1A1714",
      paper: "EFE6D6",
      accent: "C23B22",
    },
  };
}
