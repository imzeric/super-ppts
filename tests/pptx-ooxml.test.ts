import { describe, expect, it } from "vitest";
import type { Diagram } from "../src/domain/types";
import { buildPptx } from "../src/pptx/build";
import { shapeNames, textFiles, unzip } from "./helpers/zip";

const diagram: Diagram = {
  id: "diagram-1",
  version: 1,
  nodes: [
    { id: "n1", label: "登记", shape: "roundRect", x: 800000, y: 1800000, w: 2400000, h: 800000 },
    { id: "n2", label: "借出", shape: "ellipse", x: 4600000, y: 1800000, w: 2400000, h: 800000 },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      target: "n2",
      routing: "straight",
      sourceAnchor: "right",
      targetAnchor: "left",
    },
  ],
  layout: { algorithm: "manual", direction: "LR" },
  theme: {
    fontLatin: "Microsoft YaHei",
    fontEa: "Microsoft YaHei",
    ink: "1A1714",
    paper: "EFE6D6",
    accent: "C23B22",
  },
};

describe("buildPptx", () => {
  it("writes native text, a table, bound connectors, and a chart workbook", async () => {
    const bytes = await buildPptx({
      title: "社区图书角",
      slides: [
        { kind: "title", title: "社区图书角三个月试点", subtitle: "居民借阅" },
        { kind: "bullets", title: "试点做法", bullets: ["固定开放", "志愿者值班"] },
        { kind: "table", title: "月度记录", headers: ["月份", "册数"], rows: [["一月", "10"]] },
        { kind: "diagram", title: "借阅流程", diagram },
        {
          kind: "chart",
          title: "借阅册数",
          chart: { type: "bar", categories: ["一月", "二月"], series: [{ name: "册数", values: [10, 16] }] },
        },
      ],
    });

    const raw = unzip(bytes);
    const files = textFiles(raw);
    const presentation = files["ppt/presentation.xml"] ?? "";
    expect(presentation).toContain('cx="12192000"');
    expect(presentation).toContain('cy="6858000"');

    const slides = Object.entries(files)
      .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .map(([, xml]) => xml);
    const titleSlide = slides.find((xml) => xml.includes("社区图书角三个月试点"));
    expect(titleSlide).toBeTruthy();
    expect(titleSlide).toContain("<a:t");
    expect(titleSlide).toContain('a:ea typeface="Microsoft YaHei"');
    expect(titleSlide).toContain('a:latin typeface="Microsoft YaHei"');

    const tableSlide = slides.find((xml) => xml.includes("<a:tbl"));
    expect(tableSlide).toContain("一月");

    const diagramSlide = slides.find((xml) => xml.includes("登记") && xml.includes("借出"));
    expect(diagramSlide).toBeTruthy();
    const names = shapeNames(diagramSlide ?? "");
    const source = names.find((shape) => shape.name === "node-n1");
    const target = names.find((shape) => shape.name === "node-n2");
    expect(source?.id).toBeTruthy();
    expect(target?.id).toBeTruthy();
    expect(diagramSlide).toContain("<p:cxnSp");
    expect(diagramSlide).toContain(`<a:stCxn id="${source?.id}"`);
    expect(diagramSlide).toContain(`<a:endCxn id="${target?.id}"`);

    const chart = files["ppt/charts/chart1.xml"] ?? "";
    expect(chart).toContain("<c:chart");
    expect(chart).toContain("<c:externalData");
    const embedName = Object.keys(raw).find((name) => name.startsWith("ppt/embeddings/") && name.endsWith(".xlsx"));
    expect(embedName).toBeTruthy();
    const workbook = textFiles(unzip(raw[embedName ?? ""] ?? new Uint8Array()));
    expect(workbook["xl/sharedStrings.xml"]).toContain("一月");
    expect(workbook["xl/worksheets/sheet1.xml"]).toContain(">10<");

    expect(Object.keys(raw).some((name) => name.startsWith("ppt/media/"))).toBe(false);
    const diagramRels = Object.entries(files).filter(([name]) => name.includes("slides/_rels/"));
    for (const [, rels] of diagramRels) {
      expect(rels).not.toContain("/image");
    }
  });
});
