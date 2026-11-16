import type { DatabaseSync } from "node:sqlite";
import { AppError } from "../domain/errors";

export type Capability = "text" | "vision" | "image";

export type CapabilityView = {
  capability: Capability;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyMask: string | null;
  source: "saved" | "env" | "none";
};

export type ResolvedCapability = CapabilityView & { apiKey: string };

type Env = Record<string, string | undefined>;

const CAPABILITIES: Capability[] = ["text", "vision", "image"];

export function assertProviderUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("VALIDATION", "接口地址必须是完整的 http 或 https URL。", 400);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password) throw new AppError("VALIDATION", "接口地址里不能带账号或密码。", 400);
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.toString().replace(/\/$/, "");
  throw new AppError("VALIDATION", "除本机外，接口地址只接受 https。", 400);
}

export function maskKey(key: string): string | null {
  if (!key) return null;
  if (key.length <= 4) return "已设置";
  return `••••${key.slice(-2)}`;
}

export function readCapability(db: DatabaseSync | undefined, env: Env, capability: Capability): ResolvedCapability {
  const saved = db
    ? (db.prepare("SELECT base_url, model, api_key FROM provider_profiles WHERE capability = ?").get(capability) as
        | { base_url: string; model: string; api_key: string }
        | undefined)
    : undefined;
  const envKey = envValue(env, capability, "API_KEY");
  const envUrl = envValue(env, capability, "BASE_URL");
  const envModel = envValue(env, capability, "MODEL");
  const savedKey = saved?.api_key?.trim() ?? "";
  const apiKey = savedKey || envKey;
  const source = savedKey ? "saved" : envKey ? "env" : "none";
  return {
    capability,
    baseUrl: saved?.base_url?.trim() || envUrl,
    model: saved?.model?.trim() || envModel,
    hasKey: Boolean(apiKey),
    keyMask: maskKey(apiKey),
    source,
    apiKey,
  };
}

export function publicCapability(config: ResolvedCapability): CapabilityView {
  const { apiKey: _secret, ...view } = config;
  return view;
}

export function listCapabilities(db: DatabaseSync | undefined, env: Env): CapabilityView[] {
  return CAPABILITIES.map((capability) => publicCapability(readCapability(db, env, capability)));
}

export function saveCapability(
  db: DatabaseSync,
  input: { capability: Capability; baseUrl: string; model: string; apiKey?: string },
): CapabilityView {
  if (!CAPABILITIES.includes(input.capability)) throw new AppError("VALIDATION", "能力只能是 text、vision 或 image。", 400);
  const baseUrl = input.baseUrl.trim() ? assertProviderUrl(input.baseUrl.trim()) : "";
  const model = input.model.trim();
  const existing = db.prepare("SELECT api_key FROM provider_profiles WHERE capability = ?").get(input.capability) as { api_key: string } | undefined;
  const nextKey = input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : (existing?.api_key ?? "");
  db.prepare(
    `INSERT INTO provider_profiles (capability, base_url, model, api_key, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(capability) DO UPDATE SET base_url = excluded.base_url, model = excluded.model, api_key = excluded.api_key, updated_at = excluded.updated_at`,
  ).run(input.capability, baseUrl, model, nextKey, new Date().toISOString());
  return publicCapability(readCapability(db, {}, input.capability));
}

export function clearCapabilityKey(db: DatabaseSync, capability: Capability): void {
  db.prepare("UPDATE provider_profiles SET api_key = '', updated_at = ? WHERE capability = ?").run(new Date().toISOString(), capability);
}

function envValue(env: Env, capability: Capability, suffix: "API_KEY" | "BASE_URL" | "MODEL"): string {
  const specific = env[`AI_${capability.toUpperCase()}_${suffix}`]?.trim() ?? "";
  if (specific) return specific;
  if (capability !== "text") return "";
  if (suffix === "API_KEY") return env.AI_API_KEY?.trim() ?? "";
  if (suffix === "BASE_URL") return env.AI_BASE_URL?.trim() ?? "";
  return env.AI_MODEL?.trim() ?? "";
}
