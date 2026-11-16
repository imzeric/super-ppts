import { describe, expect, it } from "vitest";
import { clampFrame, clientDeltaToEmu, resizeFrame } from "../src/editor/geometry";
import { plainText } from "../src/editor/text";

describe("editor geometry", () => {
  it("scales a drag in a fitted viewport into EMU", () => {
    expect(clientDeltaToEmu(100, 800, 12_192_000)).toBe(1_524_000);
    expect(clientDeltaToEmu(10, 0, 12_192_000)).toBe(0);
  });

  it("keeps a resized frame inside the slide", () => {
    const next = resizeFrame({ x: 10_000_000, y: 6_000_000, w: 2_000_000, h: 1_000_000 }, "se", 5_000_000, 5_000_000, 12_192_000, 6_858_000);
    expect(next.x + next.w).toBeLessThanOrEqual(12_192_000);
    expect(next.y + next.h).toBeLessThanOrEqual(6_858_000);
    expect(next.w).toBeGreaterThanOrEqual(600_000);
  });

  it("moves from the top-left handle without leaving the slide", () => {
    const next = resizeFrame({ x: 1_000_000, y: 1_000_000, w: 2_000_000, h: 1_000_000 }, "nw", -2_000_000, -2_000_000, 12_192_000, 6_858_000);
    expect(next).toEqual(clampFrame(next, 12_192_000, 6_858_000));
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });
});

describe("plain text editing", () => {
  it("drops tags and scripts instead of executing them", () => {
    expect(plainText("社区<script>alert(1)</script><b>图书</b>")).toBe("社区图书");
  });
});
