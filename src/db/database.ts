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
      created_at TEXT NOT NULL
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
  return db;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
