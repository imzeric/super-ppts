export type SourceKind = "topic" | "paste";
export type SectionKind = "title" | "bullets" | "table" | "diagram" | "chart";

export type ChartSpec = {
  type: "bar" | "line" | "pie";
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
};

export type OutlineSection = {
  id: string;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  chart?: ChartSpec;
  diagramId?: string;
  notes?: string;
};

export type DeckSlide =
  | { id: string; kind: "title"; title: string; subtitle?: string }
  | { id: string; kind: "bullets"; title: string; bullets: string[] }
  | { id: string; kind: "table"; title: string; headers: string[]; rows: string[][] }
  | { id: string; kind: "diagram"; title: string; diagramId: string }
  | { id: string; kind: "chart"; title: string; chart: ChartSpec };

export type ProjectView = {
  mode: "demo" | "live";
  project: { id: string; title: string; sourceKind: SourceKind; sourceText: string };
  outline: { versionId: string; versionNo: number; status: "draft" | "approved"; sections: OutlineSection[] };
  candidate: null | { versionId: string; versionNo: number; sections: OutlineSection[] };
  deck: null | { id: string; stale: boolean; slides: DeckSlide[] };
};

export type DiagramNode = {
  id: string;
  label: string;
  shape: "rect" | "roundRect" | "ellipse" | "diamond";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DiagramModel = {
  id: string;
  version: 1;
  nodes: DiagramNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    routing: "straight" | "orthogonal";
    sourceAnchor: "top" | "right" | "bottom" | "left" | "auto";
    targetAnchor: "top" | "right" | "bottom" | "left" | "auto";
  }>;
  layout: { algorithm: "layered" | "manual"; direction: "TB" | "LR" };
  theme: { fontLatin: string; fontEa: string; ink: string; paper: string; accent: string };
};

export async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || "请求失败。");
  return body;
}
