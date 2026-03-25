import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'transcripts.db');
const db: BetterSqlite3.Database = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    file_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    mode TEXT NOT NULL,
    model TEXT NOT NULL,
    language TEXT,
    num_speakers INTEGER NOT NULL DEFAULT 2,
    segments TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    error_message TEXT
  )
`);

// App settings table (registration toggle, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);
db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('registration_enabled', 'true')`).run();

// Email/domain allowlist table
db.exec(`
  CREATE TABLE IF NOT EXISTS allowlist (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('email', 'domain')),
    created_at TEXT NOT NULL
  )
`);

// Rubrics table
db.exec(`
  CREATE TABLE IF NOT EXISTS rubrics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Add user_id column to transcripts if it doesn't exist
const transcriptCols = db.prepare(`PRAGMA table_info(transcripts)`).all() as { name: string }[];
if (!transcriptCols.find((c) => c.name === 'user_id')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN user_id TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'brief')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN brief TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'brief_status')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN brief_status TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'rubric_id')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN rubric_id TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'rubric_result')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN rubric_result TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'rubric_status')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN rubric_status TEXT`);
}

// Migration: make file_path nullable on existing databases
const cols = db.prepare(`PRAGMA table_info(transcripts)`).all() as { name: string; notnull: number }[];
const filePathCol = cols.find((c) => c.name === 'file_path');
if (filePathCol && filePathCol.notnull === 1) {
  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    ALTER TABLE transcripts RENAME TO _transcripts_old;
    CREATE TABLE transcripts (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      file_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      mode TEXT NOT NULL,
      model TEXT NOT NULL,
      language TEXT,
      num_speakers INTEGER NOT NULL DEFAULT 2,
      segments TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error_message TEXT
    );
    INSERT INTO transcripts SELECT * FROM _transcripts_old;
    DROP TABLE _transcripts_old;
    COMMIT;
    PRAGMA foreign_keys=on;
  `);
}

export default db;
