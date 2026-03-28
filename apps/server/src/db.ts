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

// Call batches table
db.exec(`
  CREATE TABLE IF NOT EXISTS call_batches (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    combined_analysis TEXT,
    combined_analysis_status TEXT,
    user_id TEXT,
    rubric_id TEXT,
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
if (!transcriptCols.find((c) => c.name === 'batch_id')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN batch_id TEXT`);
}
if (!transcriptCols.find((c) => c.name === 'batch_order')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN batch_order INTEGER`);
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

// Add rubric columns to call_batches if they don't exist
const batchCols = db.prepare(`PRAGMA table_info(call_batches)`).all() as { name: string }[];
if (!batchCols.find((c) => c.name === 'rubric_result')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN rubric_result TEXT`);
}
if (!batchCols.find((c) => c.name === 'rubric_status')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN rubric_status TEXT`);
}
if (!batchCols.find((c) => c.name === 'brief_model')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN brief_model TEXT`);
}
if (!batchCols.find((c) => c.name === 'rubric_model')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN rubric_model TEXT`);
}

// Add AI model tracking columns to transcripts if they don't exist
const transcriptColsV2 = db.prepare(`PRAGMA table_info(transcripts)`).all() as { name: string }[];
if (!transcriptColsV2.find((c) => c.name === 'brief_model')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN brief_model TEXT`);
}
if (!transcriptColsV2.find((c) => c.name === 'rubric_model')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN rubric_model TEXT`);
}
if (!transcriptColsV2.find((c) => c.name === 'name')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN name TEXT`);
}
if (!transcriptColsV2.find((c) => c.name === 'transcription_duration_ms')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN transcription_duration_ms INTEGER`);
}
if (!transcriptColsV2.find((c) => c.name === 'brief_duration_ms')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN brief_duration_ms INTEGER`);
}
if (!transcriptColsV2.find((c) => c.name === 'rubric_duration_ms')) {
  db.exec(`ALTER TABLE transcripts ADD COLUMN rubric_duration_ms INTEGER`);
}

// Add duration columns to call_batches if they don't exist
const batchColsV2 = db.prepare(`PRAGMA table_info(call_batches)`).all() as { name: string }[];
if (!batchColsV2.find((c) => c.name === 'brief_duration_ms')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN brief_duration_ms INTEGER`);
}
if (!batchColsV2.find((c) => c.name === 'rubric_duration_ms')) {
  db.exec(`ALTER TABLE call_batches ADD COLUMN rubric_duration_ms INTEGER`);
}

export default db;
