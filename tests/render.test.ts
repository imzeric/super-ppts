import { mkdirSync, writeFileSync } from "node:fs";
import { Graph } from "@antv/g6";
import { describe, expect, it } from "vitest";
import { parseAntvGraph } from "../src/render/antv";
import { assetFromSource } from "../src/render/asset";
import { parseMermaidFlow } from "../src/render/mermaid";
import { sanitizeSvg } from "../src/render/figure";
import { openDatabase } from "../src/db/database";
import { resolveProvider } from "../src/ai/provider";
import { createServices } from "../src/server/service";
import { textFiles, unzip } from "./helpers/zip";

describe("diagram sources", () => {
  it("parses a real Mermaid flowchart and rejects an unsupported diagram", () => {
    const graph = parseMermaidFlow("flowchart TD\n  A[登记] --> B(挑选)\n  B --> C{完成}");
    expect(graph.direction).toBe("TB");
    expect(graph.nodes.map((node) => node.label)).toEqual(["登记", "挑选", "完成"]);
    expect(graph.nodes[2]?.shape).toBe("diamond");
    expect(() => parseMermaidFlow("sequenceDiagram\n  Alice->>Bob: hi")).toThrow(/flowchart/);
  });

  it("accepts a bounded AntV graph and loads it in G6", () => {
    const config = parseAntvGraph(JSON.stringify({ nodes: [{ id: "a", style: { labelText: "登记" } }, { id: "b", label: "借出" }], edges: [{ source: "a", target: "b" }] }));
    const graph = new Graph({ data: { nodes: config.nodes.map((node) => ({ id: node.id })), edges: config.edges } });
    expect(typeof graph.render).toBe("function");
    graph.destroy();
    expect(() => parseAntvGraph(JSON.stringify({ nodes: [{ id: "a" }], edges: [], evil: "function(){}" }))).toThrow(/字段/);
  });

  it("writes PNG and SVG signatures and refuses image-to-native", () => {
    const png = assetFromSource(slot("mermaid", "png", "flowchart LR\n  A[甲] --> B[乙]"), 12_192_000, 6_858_000);
    const pngBytes = Buffer.from(png.pngBase64 ?? "", "base64");
    expect(pngBytes.subarray(0, 4).toString("hex")).toBe("89504e47");
    const svg = assetFromSource(slot("antv", "svg", JSON.stringify({ nodes: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }], edges: [{ source: "a", target: "b" }] })), 9_144_000, 6_858_000);
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/mermaid-flow.png", pngBytes);
    writeFileSync("/opt/cursor/artifacts/antv-graph.svg", svg.svg ?? "");
    expect(svg.svg).toContain("<svg");
    expect(svg.svg).not.toContain("<script");
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject></foreignObject><rect onload="x" href="http://evil.test"/></svg>`)).not.toContain("script");
    expect(() => assetFromSource(slot("image", "native", "画一张书架"), 12_192_000, 6_858_000)).toThrow(/PNG/);
  });

  it("stores a prompt longer than the old 8000-character cap and exports 4:3", async () => {
    const db = openDatabase(":memory:");
    const api = createServices(db, resolveProvider({}).provider, "demo", { env: {} });
    const background = `社区图书角。${"借阅记录".repeat(3000)}`;
    expect(background.length).toBeGreaterThan(8000);
    const created = await api.createProject({ background });
    expect(created.project.background).toBe(background);
    api.confirmOutline(created.project.id);
    api.updateDeck(created.project.id, { aspect: "4:3", templateId: "lecture" });
    api.confirmDeck(created.project.id);
    api.generateCopy(created.project.id);
    api.confirmCopy(created.project.id);
    const bytes = await api.exportProject(created.project.id);
    const presentation = textFiles(unzip(bytes))["ppt/presentation.xml"] ?? "";
    expect(presentation).toContain('cx="9144000"');
    expect(presentation).toContain('cy="6858000"');
  });
});

function slot(sourceKind: "mermaid" | "antv" | "image", outputMode: "png" | "svg" | "native", sourceText: string) {
  return {
    id: "slot",
    slideId: "s",
    x: 400_000,
    y: 400_000,
    w: 4_000_000,
    h: 2_400_000,
    title: "图",
    description: "",
    instruction: "",
    outputType: "diagram-flow" as const,
    sourceKind,
    sourceText,
    outputMode,
    status: "empty" as const,
    stale: false,
  };
}
