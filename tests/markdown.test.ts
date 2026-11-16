import { describe, expect, it } from "vitest";
import { DEMO_MARKDOWN } from "../src/ai/fixture";
import { parseMarkdownOutline } from "../src/domain/markdown";

describe("parseMarkdownOutline", () => {
  it("parses the demo outline without diagnostics", () => {
    const parsed = parseMarkdownOutline(DEMO_MARKDOWN);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sections.map((section) => section.kind)).toEqual(["title", "bullets", "table", "diagram", "chart"]);
    expect(parsed.sections[3]?.diagramIntent).toBe("flow");
    expect(parsed.sections[4]?.chart?.series[0]?.values[0]).toBe(42);
  });

  it("reports the line of a missing kind", () => {
    const parsed = parseMarkdownOutline("# 标题\n\n## 没有种类\n- 只有要点\n");
    expect(parsed.issues.some((issue) => issue.line === 3 && issue.message.includes("kind"))).toBe(true);
  });

  it("rejects a ninth slide", () => {
    const slides = Array.from({ length: 9 }, (_, index) => `## 第${index}页\nkind: bullets\n- 要点`).join("\n");
    const parsed = parseMarkdownOutline(`# 太多\n${slides}\n`);
    expect(parsed.issues.some((issue) => issue.message.includes("8"))).toBe(true);
  });
});
