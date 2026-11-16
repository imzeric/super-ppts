import { AppError } from "../domain/errors";
import { parseOutline } from "../domain/validate";
import type { OutlineSection, SourceKind } from "../domain/types";
import { cloneSections, DEMO_SECTIONS, tightenSections } from "./fixture";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GenerateInput = { sourceKind: SourceKind; sourceText: string };
export type OptimizeInput = { sections: OutlineSection[]; instruction: string; sectionId?: string };

export type OutlineProvider = {
  generate(input: GenerateInput): Promise<OutlineSection[]>;
  optimize(input: OptimizeInput): Promise<OutlineSection[]>;
};

type Env = {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  [key: string]: string | undefined;
};

const SYSTEM = [
  "你是中文演示文稿编辑。只返回一个 JSON 对象，形如 {\"sections\":[]}。",
  "节种类只能是 title、bullets、table、diagram、chart。节数 1 到 8。",
  "title 节包含 title 和可选 subtitle。bullets 节包含 title 和 bullets。",
  "table 节包含 title 与 table.headers、table.rows。",
  "diagram 节包含 title 和至少两个 bullets，表示流程节点。",
  "chart 节包含 title 与 chart.type（bar、line 或 pie）、categories、series。",
  "饼图只能有一个系列，数值必须是数字。不要输出 Markdown。",
].join("");

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function createLiveProvider(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl: FetchLike;
}): OutlineProvider {
  const { baseUrl, apiKey, model, fetchImpl } = options;

  const complete = async (user: string): Promise<OutlineSection[]> => {
    if (!baseUrl || !model) {
      throw new AppError("PROVIDER_CONFIG", "已填写 AI_API_KEY，还需要同时填写 AI_BASE_URL 和 AI_MODEL。", 400);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetchImpl(endpoint(baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
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
    if (!response.ok) {
      throw new AppError("PROVIDER_UNAVAILABLE", `模型服务返回 ${response.status}，大纲未更新。`, 502);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AppError("PROVIDER_SCHEMA", "模型没有返回 JSON，大纲未更新。", 422);
    }
    const content = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (!content) throw new AppError("PROVIDER_SCHEMA", "模型返回里没有大纲内容。", 422);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError("PROVIDER_SCHEMA", "模型返回的大纲无法解析。", 422);
    }
    const sections = (parsed as { sections?: unknown }).sections ?? parsed;
    try {
      return parseOutline(sections);
    } catch (error) {
      if (error instanceof AppError && error.code === "VALIDATION") {
        throw new AppError("PROVIDER_SCHEMA", "模型返回的大纲不符合结构，未替换当前稿。", 422);
      }
      throw error;
    }
  };

  return {
    generate(input) {
      return complete(`请根据以下${input.sourceKind === "topic" ? "主题" : "材料"}生成大纲：\n${input.sourceText}`);
    },
    optimize(input) {
      const scope = input.sectionId ? `只改 id 为 ${input.sectionId} 的节，其他节保持原样。` : "可以调整每一节的标题和文字。";
      return complete(`${scope}\n优化要求：${input.instruction}\n当前大纲：\n${JSON.stringify({ sections: input.sections })}`);
    },
  };
}

const demoProvider: OutlineProvider = {
  async generate() {
    return cloneSections(DEMO_SECTIONS);
  },
  async optimize(input) {
    return tightenSections(cloneSections(input.sections), input.sectionId);
  },
};

export function resolveProvider(env: Env, fetchImpl: FetchLike = fetch): { mode: "demo" | "live"; provider: OutlineProvider } {
  const apiKey = env.AI_API_KEY?.trim() ?? "";
  if (!apiKey) return { mode: "demo", provider: demoProvider };
  return {
    mode: "live",
    provider: createLiveProvider({
      baseUrl: env.AI_BASE_URL?.trim() ?? "",
      apiKey,
      model: env.AI_MODEL?.trim() ?? "",
      fetchImpl,
    }),
  };
}
