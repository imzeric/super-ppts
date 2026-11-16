import { lookup as dnsLookup } from "node:dns/promises";
import { AppError } from "../domain/errors";

const ALWAYS_TRUSTED = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata.internal"]);

export type Lookup = (hostname: string) => Promise<string[]>;

export function trustedHostsFromEnv(env: Record<string, string | undefined>): string[] {
  return (env.TRUSTED_PROVIDER_HOSTS ?? "")
    .split(",")
    .map((item) => normalizeHost(item))
    .filter(Boolean);
}

export async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function assertProviderUrl(raw: string, trustedHosts: string[] = []): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("VALIDATION", "接口地址必须是完整的 http 或 https URL。", 400);
  }
  if (url.username || url.password) throw new AppError("VALIDATION", "接口地址里不能带账号或密码。", 400);
  const host = normalizeHost(url.hostname);
  if (!host || /^\d+$/.test(host)) throw new AppError("VALIDATION", "接口主机名不能是纯数字。", 400);
  if (METADATA_HOSTS.has(host) || isMetadataIp(host)) throw new AppError("VALIDATION", "不能使用云元数据地址。", 400);
  if (isLinkLocal(host)) throw new AppError("VALIDATION", "不能使用链路本地地址。", 400);
  const trusted = isTrustedHost(host, trustedHosts);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && trusted)) {
    throw new AppError("VALIDATION", "除已信任的本机或内网地址外，接口只接受 https。", 400);
  }
  if (isIp(host) && isNonPublic(host) && !trusted) {
    throw new AppError("VALIDATION", "内网地址需要写入 TRUSTED_PROVIDER_HOSTS 后才能使用。", 400);
  }
  return url.toString().replace(/\/$/, "");
}

export async function assertResolvedProviderUrl(raw: string, trustedHosts: string[] = [], lookup: Lookup = defaultLookup): Promise<string> {
  const normalized = assertProviderUrl(raw, trustedHosts);
  const host = normalizeHost(new URL(normalized).hostname);
  if (isIp(host)) return normalized;
  let ips: string[];
  try {
    ips = await lookup(host);
  } catch {
    throw new AppError("VALIDATION", "无法解析模型地址。", 400);
  }
  if (ips.length === 0) throw new AppError("VALIDATION", "模型地址没有解析到 IP。", 400);
  const allowed = isTrustedHost(host, trustedHosts) ? [...trustedHosts, ...ips.map((ip) => normalizeHost(ip))] : trustedHosts;
  for (const ip of ips) {
    const literal = ip.includes(":") ? `[${ip}]` : ip;
    assertProviderUrl(`https://${literal}/`, allowed);
  }
  return normalized;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isTrustedHost(host: string, extra: string[]): boolean {
  return ALWAYS_TRUSTED.has(host) || extra.map((item) => normalizeHost(item)).includes(host);
}

function isIp(host: string): boolean {
  return ipv4(host) !== null || host.includes(":");
}

function isMetadataIp(host: string): boolean {
  return host === "169.254.169.254" || host === "fd00:ec2::254";
}

function isLinkLocal(host: string): boolean {
  const v4 = ipv4(host);
  if (v4) return v4[0] === 169 && v4[1] === 254;
  return /^fe[89ab][0-9a-f]:/i.test(host);
}

function isNonPublic(host: string): boolean {
  const v4 = ipv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (host === "::" || host === "::1") return true;
  return /^f[cd][0-9a-f]{2}:/i.test(host) || isLinkLocal(host);
}

function ipv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return nums as [number, number, number, number];
}
