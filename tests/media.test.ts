import { describe, expect, it, vi } from "vitest";
import { generateImage, understandImage } from "../src/ai/media";
import { assertProviderUrl } from "../src/ai/credentials";

describe("provider adapters", () => {
  it("rejects public http addresses", () => {
    expect(() => assertProviderUrl("http://example.test/v1")).toThrow(/https/);
    expect(assertProviderUrl("http://127.0.0.1:11434/v1")).toContain("127.0.0.1");
    expect(() => assertProviderUrl("https://169.254.169.254/latest")).toThrow(/元数据/);
    expect(() => assertProviderUrl("http://192.168.1.8:11434/v1")).toThrow(/https/);
    expect(() => assertProviderUrl("https://192.168.1.8:11434/v1")).toThrow(/TRUSTED_PROVIDER_HOSTS/);
    expect(assertProviderUrl("http://192.168.1.8:11434/v1", ["192.168.1.8"])).toContain("192.168.1.8");
    expect(() => assertProviderUrl("https://metadata.google.internal/computeMetadata/v1/")).toThrow(/元数据/);
  });

  it("sends an image part for vision and a b64 image request for illustration", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("images")) {
        return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "图中有书架" } }] }), { status: 200 });
    });
    const lookup = async () => ["1.1.1.1"];
    const vision = await understandImage({
      baseUrl: "https://example.test/v1",
      apiKey: "KEY123",
      model: "vision-model",
      prompt: "描述图片",
      imageBase64: "aaaa",
      mime: "image/png",
      fetchImpl,
      lookup,
    });
    expect(vision).toBe("图中有书架");
    const visionBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? ""));
    expect(JSON.stringify(visionBody.messages[0].content)).toContain("image_url");
    expect(JSON.stringify(visionBody.messages[0].content)).toContain("data:image/png;base64,aaaa");
    const bytes = await generateImage({ baseUrl: "https://example.test/v1", apiKey: "KEY123", model: "image-model", prompt: "书架", fetchImpl, lookup });
    expect(bytes[0]).toBe(0x89);
    const imageBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body ?? ""));
    expect(imageBody.response_format).toBe("b64_json");
  });
});
