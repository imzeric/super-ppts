import path from "node:path";
import { resolveProvider } from "../ai/provider";
import { openDatabase } from "../db/database";
import { createServices, type Services } from "./service";

const globalForServices = globalThis as unknown as { services?: Services };

export function getServices(): Services {
  if (!globalForServices.services) {
    const filename = process.env.DATABASE_PATH?.trim() || path.join(process.cwd(), "data", "super-ppts.db");
    const db = openDatabase(filename);
    const resolved = resolveProvider(process.env);
    globalForServices.services = createServices(db, resolved.provider, resolved.mode);
  }
  return globalForServices.services;
}
