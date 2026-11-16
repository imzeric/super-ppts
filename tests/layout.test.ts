import { describe, expect, it } from "vitest";
import { layoutDiagram } from "../src/domain/layout";
import type { Diagram } from "../src/domain/types";

function sample(direction: "TB" | "LR", algorithm: "layered" | "manual" = "layered"): Diagram {
  return {
    id: "d1",
    version: 1,
    nodes: [
      { id: "a", label: "甲", shape: "rect", x: 42, y: 7, w: 100, h: 80 },
      { id: "b", label: "乙", shape: "ellipse", x: 42, y: 7, w: 100, h: 80 },
    ],
    edges: [
      {
        id: "e",
        source: "a",
        target: "b",
        routing: "straight",
        sourceAnchor: "auto",
        targetAnchor: "auto",
      },
    ],
    layout: { algorithm, direction },
    theme: {
      fontLatin: "Microsoft YaHei",
      fontEa: "Microsoft YaHei",
      ink: "1A1714",
      paper: "EFE6D6",
      accent: "C23B22",
    },
  };
}

describe("layoutDiagram", () => {
  it("returns the same coordinates on a second run", () => {
    const once = layoutDiagram(sample("TB"));
    const twice = layoutDiagram(sample("TB"));
    expect(once.nodes.map((node) => [node.id, node.x, node.y])).toEqual(
      twice.nodes.map((node) => [node.id, node.x, node.y]),
    );
  });

  it("places the source above the target for a top-to-bottom flow", () => {
    const laid = layoutDiagram(sample("TB"));
    const source = laid.nodes.find((node) => node.id === "a");
    const target = laid.nodes.find((node) => node.id === "b");
    expect(source && target && source.y < target.y).toBe(true);
  });

  it("places the source to the left of the target for a left-to-right flow", () => {
    const laid = layoutDiagram(sample("LR"));
    const source = laid.nodes.find((node) => node.id === "a");
    const target = laid.nodes.find((node) => node.id === "b");
    expect(source && target && source.x < target.x).toBe(true);
  });

  it("keeps coordinates when the layout is manual", () => {
    const laid = layoutDiagram(sample("TB", "manual"));
    expect(laid.nodes[0]?.x).toBe(42);
    expect(laid.nodes[0]?.y).toBe(7);
  });
});
