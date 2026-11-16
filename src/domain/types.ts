export type SourceKind = "topic" | "paste" | "background";
export type DiagramIntent = "flow" | "org" | "architecture" | "relation";
export type SectionKind = "title" | "bullets" | "table" | "diagram" | "chart";
export type ChartTypeName = "bar" | "line" | "pie";
export type ShapeName = "rect" | "roundRect" | "ellipse" | "diamond";
export type Anchor = "top" | "right" | "bottom" | "left" | "auto";
export type Routing = "straight" | "orthogonal";

export type ChartSpec = {
  type: ChartTypeName;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
};

export type TableSpec = {
  headers: string[];
  rows: string[][];
};

export type OutlineSection = {
  id: string;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  bullets?: string[];
  table?: TableSpec;
  chart?: ChartSpec;
  diagramId?: string;
  diagramIntent?: DiagramIntent;
  notes?: string;
};

export type DiagramNode = {
  id: string;
  label: string;
  shape: ShapeName;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  routing: Routing;
  sourceAnchor: Anchor;
  targetAnchor: Anchor;
};

export type Diagram = {
  id: string;
  version: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  layout: { algorithm: "layered" | "manual"; direction: "TB" | "LR" };
  theme: { fontLatin: string; fontEa: string; ink: string; paper: string; accent: string };
};

export const DEFAULT_THEME: Diagram["theme"] = {
  fontLatin: "Microsoft YaHei",
  fontEa: "Microsoft YaHei",
  ink: "1A1714",
  paper: "EFE6D6",
  accent: "C23B22",
};

export const LIMITS = {
  transportText: 1_000_000,
  sectionsMin: 1,
  sectionsMax: 40,
  title: 80,
  subtitle: 120,
  bullet: 200,
  bulletsMax: 12,
  tableCols: 6,
  tableRows: 12,
  cell: 80,
  nodesMax: 24,
  edgesMax: 40,
  nodeLabel: 80,
  categoriesMax: 12,
  seriesMax: 4,
  instruction: 500,
  notes: 500,
} as const;
