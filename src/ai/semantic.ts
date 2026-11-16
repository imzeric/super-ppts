import { seedByIntent } from "../domain/layout";
import type { ChartSpec, Diagram, DiagramIntent, TableSpec } from "../domain/types";
import type { OutputType, Slot } from "../domain/slots";
import { DEMO_PNG_BASE64 } from "./media";

export type SemanticResult =
  | { resultKind: "native"; diagram: Diagram }
  | { resultKind: "native"; chart: ChartSpec }
  | { resultKind: "native"; table: TableSpec }
  | { resultKind: "raster"; imageBase64: string };

export function semanticFromSlot(slot: Pick<Slot, "id" | "title" | "description" | "instruction" | "outputType" | "x" | "y" | "w" | "h">): SemanticResult {
  if (slot.outputType === "illustration") {
    return { resultKind: "raster", imageBase64: DEMO_PNG_BASE64 };
  }
  if (slot.outputType.startsWith("diagram-")) {
    const labels = labelsFrom(slot.description, slot.instruction, slot.title);
    if (labels.length < 2) {
      throw new Error("图至少需要两个节点。请在画面描述里一行写一个节点。");
    }
    return {
      resultKind: "native",
      diagram: seedByIntent(slot.id, labels, intentOf(slot.outputType), { x: slot.x, y: slot.y, w: slot.w, h: slot.h }),
    };
  }
  if (slot.outputType.startsWith("chart-")) {
    const chart = chartFrom(slot);
    if (!chart) throw new Error("请在画面描述里按「一月 10」这样一行写一个类别和数值。");
    return { resultKind: "native", chart };
  }
  const table = tableFrom(slot.description);
  if (!table) throw new Error("请在画面描述里用「列一 | 列二」写表头，下一行写数据。");
  return { resultKind: "native", table };
}

function intentOf(type: OutputType): DiagramIntent {
  if (type === "diagram-org") return "org";
  if (type === "diagram-architecture") return "architecture";
  if (type === "diagram-relation") return "relation";
  return "flow";
}

function labelsFrom(description: string, instruction: string, title: string): string[] {
  const lines = description.split(/\n|、/).map((item) => item.trim()).filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 12);
  const extra = instruction.split(/\n|、/).map((item) => item.trim()).filter(Boolean);
  return [...lines, ...extra, title].filter(Boolean).slice(0, 12);
}

function chartFrom(slot: Pick<Slot, "title" | "description" | "outputType">): ChartSpec | undefined {
  const rows = slot.description
    .split("\n")
    .map((line) => /^(.+?)\s+(-?\d+(?:\.\d+)?)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match));
  if (rows.length === 0) return undefined;
  const type = slot.outputType === "chart-line" ? "line" : slot.outputType === "chart-pie" ? "pie" : "bar";
  return {
    type,
    categories: rows.map((row) => row[1] ?? ""),
    series: [{ name: slot.title || "数值", values: rows.map((row) => Number(row[2])) }],
  };
}

function tableFrom(description: string): TableSpec | undefined {
  const lines = description.split("\n").map((line) => line.trim()).filter((line) => line.includes("|"));
  if (lines.length < 2) return undefined;
  const cells = lines.map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  return { headers: cells[0] ?? [], rows: cells.slice(1) };
}
