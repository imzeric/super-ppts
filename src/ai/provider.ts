import { AppError } from "../domain/errors";
import { parseMarkdownOutline, tightenMarkdown } from "../domain/markdown";
import { DEMO_MARKDOWN } from "./fixture";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OutlineProvider = {
  generateMarkdown(input: { background: string }): Promise<string>;
  optimizeMarkdown(input: { markdown: string; instruction: string; headingId?: string }): Promise<string>;
};

type Env = {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_TEXT_BASE_URL?: string;
  AI_TEXT_API_KEY?: string;
  AI_TEXT_MODEL?: string;
  [key: string]: string | undefined;
};

const SYSTEM = [
  "你是中文演示文稿编辑。只返回 JSON：{\"markdown\":\"...\"}。",
  "markdown 必须以 # 标题开头。每张幻灯片用 ## 标题，并包含 <!-- id: 英文编号 --> 和 kind: title|bullets|table|diagram|chart。",
  "图还要有 diagram: flow|org|architecture|relation，以及至少两个 - 节点。",
  "表格和图表使用 | 表格。图表还要有 chart: bar|line|pie，第二列是数字。",
  "最多 8 张幻灯片。不要输出解释。",
].join("");

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function createLiveProvider(options: { baseUrl: string; apiKey: string; model: string; fetchImpl: FetchLike }): OutlineProvider {
  const complete = async (user: string): Promise<string> => {
    if (!options.baseUrl || !options.model) {
      throw new AppError("PROVIDER_CONFIG", "已填写文本密钥，还需要同时填写文本接口地址和模型名。", 400);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await options.fetchImpl(endpoint(options.baseUrl), {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE", "模型服务没有连上，大纲未更新。请稍后重试。", 502);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new AppError("PROVIDER_UNAVAILABLE", `模型服务返回 ${response.status}，大纲未更新。`, 502);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AppError("PROVIDER_SCHEMA", "模型没有返回 JSON，大纲未更新。", 422);
    }
    const content = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (!content) throw new AppError("PROVIDER_SCHEMA", "模型返回里没有大纲。", 422);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError("PROVIDER_SCHEMA", "模型返回的大纲无法解析。", 422);
    }
    const markdown = (parsed as { markdown?: unknown }).markdown;
    if (typeof markdown !== "string") throw new AppError("PROVIDER_SCHEMA", "模型需要返回 markdown 字符串。", 422);
    const outline = parseMarkdownOutline(markdown);
    if (outline.issues.length > 0) throw new AppError("PROVIDER_SCHEMA", "模型返回的 Markdown 不符合大纲语法，未替换当前稿。", 422);
    return markdown;
  };

  return {
    generateMarkdown(input) {
      return complete(`请根据这段背景写大纲：\n${input.background}`);
    },
    optimizeMarkdown(input) {
      const scope = input.headingId ? `只收紧 id 为 ${input.headingId} 的 ## 标题，其余原样保留。` : "可以收紧标题，但必须保留 id 注释和 kind。";
      return complete(`${scope}\n要求：${input.instruction}\n当前 Markdown：\n${input.markdown}`);
    },
  };
}

const demoProvider: OutlineProvider = {
  async generateMarkdown() {
    return DEMO_MARKDOWN;
  },
  async optimizeMarkdown(input) {
    return tightenMarkdown(input.markdown, input.headingId);
  },
};

export async function chatJson(options: { baseUrl: string; apiKey: string; model: string; system: string; user: string; fetchImpl: FetchLike }): Promise<unknown> {
  if (!options.baseUrl || !options.model) throw new AppError("PROVIDER_CONFIG", "文本接口还需要地址和模型名。", 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await options.fetchImpl(endpoint(options.baseUrl), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    });
  } catch {
    throw new AppError("PROVIDER_UNAVAILABLE", "模型服务没有连上，这个占位未替换。", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new AppError("PROVIDER_UNAVAILABLE", `模型服务返回 ${response.status}，这个占位未替换。`, 502);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new AppError("PROVIDER_SCHEMA", "模型没有返回 JSON。", 422);
  return JSON.parse(content) as unknown;
}

export function resolveProvider(env: Env, fetchImpl: FetchLike = fetch): { mode: "demo" | "live"; provider: OutlineProvider } {
  const apiKey = env.AI_TEXT_API_KEY?.trim() || env.AI_API_KEY?.trim() || "";
  if (!apiKey) return { mode: "demo", provider: demoProvider };
  return {
    mode: "live",
    provider: createLiveProvider({
      baseUrl: env.AI_TEXT_BASE_URL?.trim() || env.AI_BASE_URL?.trim() || "",
      apiKey,
      model: env.AI_TEXT_MODEL?.trim() || env.AI_MODEL?.trim() || "",
      fetchImpl,
    }),
  };
}
