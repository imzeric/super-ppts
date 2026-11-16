import { AppError } from "../domain/errors";
import { assertResolvedProviderUrl, type Lookup } from "./guard";
import type { FetchLike } from "./provider";

export const DEMO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TIMEOUT_MS = 30_000;

function linkedSignal(parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (parent?.aborted) controller.abort();
  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

export function demoPngBytes(): Uint8Array {
  return Buffer.from(DEMO_PNG_BASE64, "base64");
}

export async function generateImage(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl: FetchLike;
  trustedHosts?: string[];
  lookup?: Lookup;
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  if (!options.baseUrl || !options.model) {
    throw new AppError("PROVIDER_CONFIG", "插图接口还需要地址和模型名。", 400);
  }
  const endpoint = `${await assertResolvedProviderUrl(options.baseUrl, options.trustedHosts ?? [], options.lookup)}/images/generations`;
  const linked = linkedSignal(options.signal);
  let response: Response;
  try {
    response = await options.fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      signal: linked.signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model, prompt: options.prompt, size: "1024x1024", response_format: "b64_json" }),
    });
  } catch {
    throw new AppError("PROVIDER_UNAVAILABLE", "插图服务没有连上，这个占位未替换。", 502);
  } finally {
    linked.clear();
  }
  if (!response.ok) throw new AppError("PROVIDER_UNAVAILABLE", `插图服务返回 ${response.status}，这个占位未替换。`, 502);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError("PROVIDER_SCHEMA", "插图服务没有返回 JSON。", 422);
  }
  const encoded = (payload as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
  if (!encoded) throw new AppError("PROVIDER_SCHEMA", "插图响应里没有 b64_json。", 422);
  const bytes = Buffer.from(encoded, "base64");
  if (!isPng(bytes) && !isJpeg(bytes)) throw new AppError("PROVIDER_SCHEMA", "插图不是 PNG 或 JPEG。", 422);
  return bytes;
}

export async function understandImage(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  imageBase64: string;
  mime: "image/png" | "image/jpeg";
  fetchImpl: FetchLike;
  trustedHosts?: string[];
  lookup?: Lookup;
  signal?: AbortSignal;
}): Promise<string> {
  if (!options.baseUrl || !options.model) throw new AppError("PROVIDER_CONFIG", "视觉接口还需要地址和模型名。", 400);
  const endpoint = `${await assertResolvedProviderUrl(options.baseUrl, options.trustedHosts ?? [], options.lookup)}/chat/completions`;
  const linked = linkedSignal(options.signal);
  let response: Response;
  try {
    response = await options.fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      signal: linked.signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: options.prompt },
              { type: "image_url", image_url: { url: `data:${options.mime};base64,${options.imageBase64}` } },
            ],
          },
        ],
      }),
    });
  } catch {
    throw new AppError("PROVIDER_UNAVAILABLE", "视觉服务没有连上。", 502);
  } finally {
    linked.clear();
  }
  if (!response.ok) throw new AppError("PROVIDER_UNAVAILABLE", `视觉服务返回 ${response.status}。`, 502);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError("PROVIDER_SCHEMA", "视觉服务没有返回文字。", 422);
  return text;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
