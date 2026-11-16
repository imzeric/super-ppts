import { describe, expect, it, vi } from "vitest";
import { resolveProvider } from "../src/ai/provider";

describe("resolveProvider", () => {
  it("returns the markdown fixture and does not call fetch without a key", async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("demo must not use the network");
    });
    const resolved = resolveProvider({ AI_API_KEY: "  " }, fetchImpl);
    expect(resolved.mode).toBe("demo");
    const markdown = await resolved.provider.generateMarkdown({ background: "社区图书角试点" });
    expect(markdown).toContain("# 社区图书角三个月试点");
    expect(markdown).toContain("kind: diagram");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tightens only the requested heading", async () => {
    const resolved = resolveProvider({});
    const markdown = await resolved.provider.generateMarkdown({ background: "背景" });
    const next = await resolved.provider.optimizeMarkdown({ markdown, instruction: "收紧", headingId: "sec-bullets" });
    expect(next).toContain("## 试点做了什么（收紧）");
    expect(next).toContain("## 开场\n");
  });

  it("does not turn a live failure into the demo fixture", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket reset for KEY123");
    });
    const resolved = resolveProvider(
      { AI_API_KEY: "KEY123", AI_BASE_URL: "https://example.test/v1", AI_MODEL: "demo-model" },
      fetchImpl,
    );
    expect(resolved.mode).toBe("live");
    await expect(resolved.provider.generateMarkdown({ background: "背景" })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    try {
      await resolved.provider.generateMarkdown({ background: "背景" });
    } catch (error) {
      expect((error as Error).message.includes("KEY123")).toBe(false);
      expect((error as Error).message.includes("社区图书角")).toBe(false);
    }
  });

  it("refuses the network when the key exists but the base URL does not", async () => {
    const fetchImpl = vi.fn();
    const resolved = resolveProvider({ AI_API_KEY: "KEY123", AI_BASE_URL: "", AI_MODEL: "demo-model" }, fetchImpl);
    await expect(resolved.provider.generateMarkdown({ background: "背景" })).rejects.toMatchObject({ code: "PROVIDER_CONFIG" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects markdown that does not match the outline syntax", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ markdown: "# 只有标题" }) } }] }), { status: 200 }),
    );
    const resolved = resolveProvider(
      { AI_API_KEY: "KEY123", AI_BASE_URL: "https://example.test/v1", AI_MODEL: "demo-model" },
      fetchImpl,
    );
    await expect(resolved.provider.generateMarkdown({ background: "背景" })).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer KEY123");
  });
});
