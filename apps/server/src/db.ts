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
