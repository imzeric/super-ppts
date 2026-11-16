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

export type MarkdownIssue = { line: number; message: string };
export type SlideCopy = { id: string; title: string; lines: string[] };
export type OutputType =
  | "diagram-flow"
  | "diagram-org"
  | "diagram-architecture"
  | "diagram-relation"
  | "chart-bar"
  | "chart-line"
  | "chart-pie"
  | "table"
  | "illustration";

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
  status: "empty" | "succeeded" | "failed";
  stale: boolean;
  error?: string;
  diagramId?: string;
  resultKind?: "native" | "raster";
};

export type ProjectView = {
  mode: "demo" | "live";
  project: { id: string; title: string; background: string };
  outline: {
    versionId: string;
    versionNo: number;
    status: "draft" | "confirmed";
    markdown: string;
    title: string;
    sections: Array<{ id: string; kind: string; title: string }>;
    issues: MarkdownIssue[];
  };
  candidate: null | { versionId: string; versionNo: number; markdown: string };
  copy: null | { status: "draft" | "confirmed"; stale: boolean; slides: SlideCopy[] };
  slots: Slot[];
  diagrams: Array<{ id: string; label: string }>;
};
