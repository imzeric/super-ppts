import PptxGenJS from "pptxgenjs";
import type { ChartSpec, Diagram, ShapeName } from "../domain/types";
import { bindDiagramConnectors } from "./ooxml";

const FONT = "Microsoft YaHei";
const INK = "1A1714";
const PAPER = "EFE6D6";

export type ExportSlide =
  | { kind: "title"; title: string; subtitle?: string }
  | { kind: "bullets"; title: string; bullets: string[] }
  | { kind: "table"; title: string; headers: string[]; rows: string[][] }
  | { kind: "diagram"; title: string; diagram: Diagram }
  | { kind: "chart"; title: string; chart: ChartSpec };

export type ExportDeck = { title: string; slides: ExportSlide[] };

const SHAPES: Record<ShapeName, keyof typeof PptxGenJS.ShapeType> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  diamond: "diamond",
};

function inches(emu: number): number {
  return emu / 914400;
}

export async function buildPptx(deck: ExportDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  for (const spec of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "F7F1E6" };
    if (spec.kind === "title") {
      slide.addText(spec.title, textBox(0.8, 2.15, 11.6, 1.5, 40, "title"));
      if (spec.subtitle) slide.addText(spec.subtitle, textBox(0.8, 3.85, 10, 0.7, 20, "subtitle"));
      continue;
    }
    slide.addText(spec.title, textBox(0.62, 0.32, 12, 0.72, 28, "slide-title"));
    if (spec.kind === "bullets") {
      slide.addText(
        spec.bullets.map((text) => ({ text, options: { bullet: false, breakLine: true } })),
        { ...textBox(0.9, 1.5, 11.4, 5.2, 22, "bullets"), paraSpaceAfter: 14 },
      );
    }
    if (spec.kind === "table") {
      slide.addTable(
        [
          spec.headers.map((text) => ({
            text,
            options: { fill: { color: INK }, color: PAPER, bold: true, align: "center" as const, fontFace: FONT },
          })),
          ...spec.rows.map((row) => row.map((text) => ({ text, options: { align: "center" as const, color: INK, fontFace: FONT } }))),
        ],
        {
          x: 0.8,
          y: 1.55,
          w: 11.7,
          h: 4.8,
          colW: spec.headers.map(() => 11.7 / spec.headers.length),
          border: [
            { pt: 0.75, color: INK },
            { pt: 0.75, color: INK },
            { pt: 0.75, color: INK },
            { pt: 0.75, color: INK },
          ],
          fontFace: FONT,
          objectName: "table",
        },
      );
    }
    if (spec.kind === "diagram") {
      for (const node of spec.diagram.nodes) {
        slide.addText(node.label, {
          x: inches(node.x),
          y: inches(node.y),
          w: inches(node.w),
          h: inches(node.h),
          shape: pptx.ShapeType[SHAPES[node.shape]],
          fill: { color: PAPER },
          line: { color: INK, width: 1.25 },
          fontFace: FONT,
          fontSize: 16,
          color: INK,
          align: "center",
          valign: "middle",
          objectName: `node-${node.id}`,
        });
      }
    }
    if (spec.kind === "chart") {
      const type = spec.chart.type === "line" ? pptx.ChartType.line : spec.chart.type === "pie" ? pptx.ChartType.pie : pptx.ChartType.bar;
      slide.addChart(
        type,
        spec.chart.series.map((series) => ({ name: series.name, labels: spec.chart.categories, values: series.values })),
        {
          x: 0.8,
          y: 1.35,
          w: 11.6,
          h: 5.5,
          barDir: "col",
          showLegend: true,
          legendPos: "b",
          chartColors: ["C23B22", "1A1714", "8A7048"],
          fontFace: FONT,
          objectName: "chart",
        },
      );
    }
  }

  const written = await pptx.write({ outputType: "uint8array" });
  const bytes = written instanceof Uint8Array ? written : new Uint8Array(written as ArrayBuffer);
  return bindDiagramConnectors(bytes, deck.slides);
}

function textBox(x: number, y: number, w: number, h: number, fontSize: number, objectName: string) {
  return { x, y, w, h, fontFace: FONT, fontSize, color: INK, margin: 0, objectName };
}
