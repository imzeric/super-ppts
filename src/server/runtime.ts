import path from "node:path";
import { readCapability } from "../ai/credentials";
import { resolveProvider } from "../ai/provider";
import { openDatabase } from "../db/database";
import type { DatabaseSync } from "node:sqlite";
import { createServices, type Services } from "./service";

let database: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (!database) {
    const filename = process.env.DATABASE_PATH?.trim() || path.join(process.cwd(), "data", "super-ppts.db");
    database = openDatabase(filename);
  }
  return database;
}

export function getServices(): Services {
  const db = getDatabase();
  const text = readCapability(db, process.env, "text");
  const resolved = resolveProvider({
    AI_TEXT_API_KEY: text.apiKey,
    AI_TEXT_BASE_URL: text.baseUrl,
    AI_TEXT_MODEL: text.model,
  });
  return createServices(db, resolved.provider, resolved.mode, { env: process.env });
}
