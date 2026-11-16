import { describe, expect, it } from "vitest";
import { seedByIntent } from "../src/domain/layout";
import { buildPptx } from "../src/pptx/build";
import { shapeNames, textFiles, unzip } from "./helpers/zip";

describe("composed slides", () => {
  it("exports an unfilled placeholder as native text and a drawn diagram as bound shapes", async () => {
    const diagram = seedByIntent("slot-diagram", ["登记", "借出"], "flow", { x: 800000, y: 1800000, w: 5000000, h: 3000000 });
    const bytes = await buildPptx({
      title: "占位",
      slides: [
        {
          kind: "composed",
          title: "借阅",
          lines: ["先写文字"],
          slots: [
            {
              id: "slot-a",
              mode: "placeholder",
              x: 700000,
              y: 1600000,
              w: 3600000,
              h: 1800000,
              title: "尚未绘制",
              outputType: "diagram-flow",
              description: "登记、借出",
              instruction: "自上而下",
            },
          ],
        },
        {
          kind: "composed",
          title: "已绘制",
          lines: ["原生图"],
          slots: [{ id: "slot-diagram", mode: "diagram", x: 800000, y: 1800000, w: 5000000, h: 3000000, diagram }],
        },
      ],
    });
    const files = textFiles(unzip(bytes));
    const slides = Object.entries(files)
      .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .map(([, xml]) => xml);
    const placeholder = slides.find((xml) => xml.includes("尚未绘制"));
    expect(placeholder).toContain("占位：流程图");
    expect(placeholder).toContain("<p:sp");
    expect(placeholder).not.toContain("<p:pic");
    const drawn = slides.find((xml) => xml.includes("node-slot-diagram-n1")) ?? "";
    const names = shapeNames(drawn);
    const source = names.find((shape) => shape.name === "node-slot-diagram-n1");
    const target = names.find((shape) => shape.name === "node-slot-diagram-n2");
    expect(drawn).toContain("<p:cxnSp");
    expect(drawn).toContain(`<a:stCxn id="${source?.id}"`);
    expect(drawn).toContain(`<a:endCxn id="${target?.id}"`);
  });

  it("writes a chart workbook and an image only for an explicit illustration", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = await buildPptx({
      title: "混合",
      slides: [
        {
          kind: "composed",
          title: "数据",
          lines: [],
          slots: [
            {
              id: "chart-1",
              mode: "chart",
              x: 700000,
              y: 1500000,
              w: 6000000,
              h: 3600000,
              chart: { type: "bar", categories: ["一月", "二月"], series: [{ name: "册数", values: [10, 16] }] },
            },
            {
              id: "pic-1",
              mode: "illustration",
              x: 7000000,
              y: 1500000,
              w: 2000000,
              h: 1500000,
              pngBase64: png,
              title: "封面插画",
            },
          ],
        },
      ],
    });
    const raw = unzip(bytes);
    const files = textFiles(raw);
    expect(Object.values(files).some((xml) => xml.includes("<c:chart"))).toBe(true);
    const embed = Object.keys(raw).find((name) => name.includes("embeddings") && name.endsWith(".xlsx"));
    const book = textFiles(unzip(raw[embed ?? ""] ?? new Uint8Array()));
    expect(book["xl/sharedStrings.xml"]).toContain("一月");
    expect(book["xl/worksheets/sheet1.xml"]).toContain(">10<");
    expect(Object.keys(raw).some((name) => name.startsWith("ppt/media/") && !name.endsWith("/"))).toBe(true);
    expect(Object.values(files).join("\n")).toContain("位图，内部像素不可逐项编辑");
  });
});
