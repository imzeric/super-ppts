import { describe, expect, it, vi } from "vitest";
import { resolveProvider } from "../src/ai/provider";

const input = { sourceKind: "topic" as const, sourceText: "社区图书角试点" };

describe("resolveProvider", () => {
  it("uses the fixture and does not call fetch when no key is set", async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("demo must not use the network");
    });
    const resolved = resolveProvider({ AI_API_KEY: "  " }, fetchImpl);
    expect(resolved.mode).toBe("demo");
    const sections = await resolved.provider.generate(input);
    expect(sections.some((section) => section.title.includes("社区图书角"))).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks only the requested section as tightened", async () => {
    const resolved = resolveProvider({});
    const sections = await resolved.provider.generate(input);
    const target = sections[1];
    expect(target).toBeDefined();
    const next = await resolved.provider.optimize({
      sections,
      instruction: "把表述收紧",
      sectionId: target?.id,
    });
    expect(next.find((section) => section.id === target?.id)?.title.endsWith("（收紧）")).toBe(true);
    expect(next.find((section) => section.id === sections[0]?.id)?.title.endsWith("（收紧）")).toBe(false);
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
    await expect(resolved.provider.generate(input)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    try {
      await resolved.provider.generate(input);
      throw new Error("live failure returned success");
    } catch (error) {
      expect((error as Error).message.includes("KEY123")).toBe(false);
      expect((error as Error).message.includes("社区图书角")).toBe(false);
    }
  });

  it("refuses to call the network when the key is set but the base URL is missing", async () => {
    const fetchImpl = vi.fn();
    const resolved = resolveProvider({ AI_API_KEY: "KEY123", AI_BASE_URL: "", AI_MODEL: "demo-model" }, fetchImpl);
    await expect(resolved.provider.generate(input)).rejects.toMatchObject({ code: "PROVIDER_CONFIG" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a live payload that is not an outline", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sections: [] }) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const resolved = resolveProvider(
      { AI_API_KEY: "KEY123", AI_BASE_URL: "https://example.test/v1", AI_MODEL: "demo-model" },
      fetchImpl,
    );
    await expect(resolved.provider.generate(input)).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer KEY123");
  });
});
