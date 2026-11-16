import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outline_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      status TEXT NOT NULL,
      role TEXT NOT NULL,
      sections_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      outline_version_id TEXT NOT NULL,
      stale INTEGER NOT NULL,
      slides_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS diagrams (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      ir_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slide_copies (
      project_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      stale INTEGER NOT NULL,
      slides_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      external_job_id TEXT,
      idempotency_key TEXT,
      contract_version INTEGER
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_profiles (
      capability TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      deck_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT,
      byte_size INTEGER,
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "outline_versions", "markdown", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "projects", "aspect", "TEXT NOT NULL DEFAULT '16:9'");
  ensureColumn(db, "projects", "width_emu", "INTEGER NOT NULL DEFAULT 12192000");
  ensureColumn(db, "projects", "height_emu", "INTEGER NOT NULL DEFAULT 6858000");
  ensureColumn(db, "projects", "template_id", "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, "projects", "properties_confirmed", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "generation_runs", "external_job_id", "TEXT");
  ensureColumn(db, "generation_runs", "idempotency_key", "TEXT");
  ensureColumn(db, "generation_runs", "contract_version", "INTEGER");
  const applied = db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
  const has = (version: number) => applied.some((row) => row.version === version);
  const stamp = new Date().toISOString();
  if (!has(1)) db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(stamp);
  if (!has(2)) db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(stamp);
  return db;
}

export function withTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
