import { seedByIntent } from "../domain/layout";
import type { Slot } from "../domain/slots";
import { OUTPUT_LABEL } from "../domain/slots";
import type { ChartSpec, Diagram } from "../domain/types";
import { DEFAULT_THEME } from "../domain/types";
import { parseAntvGraph, antvLabel } from "./antv";
import { diagramToPng, diagramToSvg, sanitizeSvg } from "./figure";
import { parseMermaidFlow } from "./mermaid";

export type Asset = {
  resultKind: "native" | "raster" | "vector";
  diagram?: Diagram;
  chart?: ChartSpec;
  svg?: string;
  pngBase64?: string;
};

export function assetFromSource(slot: Slot, widthEmu: number, heightEmu: number): Asset {
  if (slot.sourceKind === "image" || slot.outputType === "illustration") {
    if (slot.outputMode !== "png") throw new Error("模型插图只能输出 PNG。SVG 和原生形状都不能由一张生成图冒充。");
    return { resultKind: "raster" };
  }
  const diagram = diagramFromSource(slot);
  const chart = slot.sourceKind === "chart" || slot.outputType.startsWith("chart-") ? chartFrom(slot) : undefined;
  if (slot.outputMode === "native" && chart) return { resultKind: "native", chart };
  if (!diagram && !chart) throw new Error("没有可绘制的图或图表数据。");
  if (slot.outputMode === "native") {
    if (!diagram) throw new Error("这个来源不能变成 PowerPoint 原生形状。");
    return { resultKind: "native", diagram };
  }
  const figure = diagram ?? chartDiagram(chart!, slot);
  const svg = diagramToSvg(figure, widthEmu, heightEmu);
  if (slot.outputMode === "svg") {
    return { resultKind: "vector", svg, diagram: figure, pngBase64: diagramToPng(figure, widthEmu, heightEmu).toString("base64") };
  }
  const png = diagramToPng(figure, widthEmu, heightEmu);
  return { resultKind: "raster", pngBase64: png.toString("base64"), svg, diagram: figure };
}

function diagramFromSource(slot: Slot): Diagram | undefined {
  const box = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
  if (slot.sourceKind === "mermaid") {
    const graph = parseMermaidFlow(slot.sourceText || slot.description);
    return seedByIntent(
      slot.id,
      graph.nodes.map((node) => node.label),
      "flow",
      box,
    );
  }
  if (slot.sourceKind === "antv") {
    const config = parseAntvGraph(slot.sourceText || slot.description);
    return seedByIntent(slot.id, config.nodes.map(antvLabel), "relation", box);
  }
  if (slot.sourceKind === "native" || slot.outputType.startsWith("diagram-")) {
    const labels = (slot.sourceText || slot.description).split(/\n|、/).map((item) => item.trim()).filter(Boolean);
    if (labels.length < 2) return undefined;
    const intent = slot.outputType === "diagram-org" ? "org" : slot.outputType === "diagram-architecture" ? "architecture" : slot.outputType === "diagram-relation" ? "relation" : "flow";
    return seedByIntent(slot.id, labels, intent, box);
  }
  return undefined;
}

function chartFrom(slot: Slot): ChartSpec {
  if (slot.sourceText.trim().startsWith("{")) {
    const body = JSON.parse(slot.sourceText) as { type?: string; categories?: string[]; values?: number[] };
    if (!body.categories || !body.values || body.categories.length !== body.values.length) throw new Error("图表 JSON 需要等长的 categories 和 values。");
    const type = body.type === "line" || body.type === "pie" ? body.type : "bar";
    return { type, categories: body.categories, series: [{ name: slot.title || "数值", values: body.values }] };
  }
  const rows = (slot.sourceText || slot.description)
    .split("\n")
    .map((line) => /^(.+?)\s+(-?\d+(?:\.\d+)?)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match));
  if (rows.length === 0) throw new Error("图表请写成「一月 10」，或 JSON：{\"type\":\"bar\",\"categories\":[\"一月\"],\"values\":[10]}。");
  const type = slot.outputType === "chart-line" ? "line" : slot.outputType === "chart-pie" ? "pie" : "bar";
  return { type, categories: rows.map((row) => row[1] ?? ""), series: [{ name: slot.title || "数值", values: rows.map((row) => Number(row[2])) }] };
}

function chartDiagram(chart: ChartSpec, slot: Slot): Diagram {
  const max = Math.max(...chart.series[0]!.values, 1);
  return {
    id: slot.id,
    version: 1,
    nodes: chart.categories.map((category, index) => ({
      id: `b${index + 1}`,
      label: `${category} ${chart.series[0]!.values[index]}`,
      shape: "rect" as const,
      x: slot.x + index * (slot.w / chart.categories.length),
      y: slot.y + slot.h - (chart.series[0]!.values[index]! / max) * slot.h,
      w: slot.w / chart.categories.length - 40_000,
      h: Math.max(80_000, (chart.series[0]!.values[index]! / max) * slot.h),
    })),
    edges: [],
    layout: { algorithm: "manual", direction: "LR" },
    theme: DEFAULT_THEME,
  };
}

export function placeholderCaption(slot: Slot): string {
  return [`占位：${OUTPUT_LABEL[slot.outputType]}`, slot.title, slot.description, slot.instruction].filter(Boolean).join("\n");
}

export { sanitizeSvg };
