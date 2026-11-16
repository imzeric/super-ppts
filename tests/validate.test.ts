import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/errors";
import { parseDiagram, parseOutline } from "../src/domain/validate";

const title = { id: "s1", kind: "title", title: "开场" };

describe("parseOutline", () => {
  it("rejects an empty section list", () => {
    expect(() => parseOutline([])).toThrow(AppError);
    try {
      parseOutline([]);
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION" });
      expect((error as Error).message).toContain("1");
    }
  });

  it("accepts nine sections and rejects a forty-first", () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({
      id: `s${index}`,
      kind: "bullets" as const,
      title: `第${index}节`,
      bullets: ["要点"],
    }));
    expect(parseOutline(nine)).toHaveLength(9);
    const tooMany = Array.from({ length: 41 }, (_, index) => ({
      id: `s${index}`,
      kind: "bullets" as const,
      title: `第${index}节`,
      bullets: ["要点"],
    }));
    expect(() => parseOutline(tooMany)).toThrowError(expect.objectContaining({ code: "VALIDATION" }));
  });

  it("rejects a pie chart with two series", () => {
    expect(() =>
      parseOutline([
        title,
        {
          id: "c1",
          kind: "chart",
          title: "占比",
          chart: {
            type: "pie",
            categories: ["甲", "乙"],
            series: [
              { name: "A", values: [1, 2] },
              { name: "B", values: [3, 4] },
            ],
          },
        },
      ]),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION" }));
  });

  it("accepts one section of each kind", () => {
    const sections = parseOutline([
      { id: "s1", kind: "title", title: "社区图书角", subtitle: "试点" },
      { id: "s2", kind: "bullets", title: "做法", bullets: ["登记", "借出"] },
      {
        id: "s3",
        kind: "table",
        title: "月表",
        table: { headers: ["月份", "册数"], rows: [["一月", "10"]] },
      },
      { id: "s4", kind: "diagram", title: "流程", bullets: ["登记", "归还"] },
      {
        id: "s5",
        kind: "chart",
        title: "趋势",
        chart: { type: "bar", categories: ["一月", "二月"], series: [{ name: "册数", values: [10, 16] }] },
      },
    ]);
    expect(sections).toHaveLength(5);
    expect(sections[4]?.chart?.series[0]?.values[0]).toBe(10);
  });
});

describe("parseDiagram", () => {
  it("rejects an edge whose target does not exist", () => {
    expect(() =>
      parseDiagram({
        id: "d1",
        version: 1,
        nodes: [{ id: "n1", label: "登记", shape: "rect", x: 0, y: 0, w: 1000, h: 1000 }],
        edges: [
          {
            id: "e1",
            source: "n1",
            target: "missing",
            routing: "straight",
            sourceAnchor: "auto",
            targetAnchor: "auto",
          },
        ],
        layout: { algorithm: "manual", direction: "TB" },
        theme: {
          fontLatin: "Microsoft YaHei",
          fontEa: "Microsoft YaHei",
          ink: "1A1714",
          paper: "EFE6D6",
          accent: "C23B22",
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "DANGLING_EDGE" }));
  });
});
