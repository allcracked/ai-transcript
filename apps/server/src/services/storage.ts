import fs from 'fs';
import db from '../db';

const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

interface FileRow {
  id: string;
  file_path: string;
  created_at: string;
}

/**
 * Checks total audio file usage and deletes the oldest files until
 * the total is under STORAGE_LIMIT_BYTES. Transcript records are kept.
 */
export function enforceStorageLimit(): void {
  const rows = db
    .prepare(
      `SELECT id, file_path, created_at FROM transcripts
       WHERE file_path IS NOT NULL AND file_path != ''
       ORDER BY created_at ASC`
    )
    .all() as FileRow[];

  let totalBytes = 0;
  const withSize = rows.map((row) => {
    try {
      const size = fs.statSync(row.file_path).size;
      totalBytes += size;
      return { ...row, size };
    } catch {
      return { ...row, size: 0 };
    }
  });

  if (totalBytes <= STORAGE_LIMIT_BYTES) return;

  console.log(
    `[STORAGE] Usage ${(totalBytes / 1e9).toFixed(2)} GB exceeds 10 GB limit — pruning oldest files`
  );

  for (const row of withSize) {
    if (totalBytes <= STORAGE_LIMIT_BYTES) break;
    if (row.size === 0) continue;

    try {
      fs.unlinkSync(row.file_path);
      totalBytes -= row.size;
      console.log(`[STORAGE] Deleted audio file for transcript ${row.id}`);
    } catch {
      // Already gone from disk — just clear the path
    }

    db.prepare(
      `UPDATE transcripts SET file_path = NULL, updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), row.id);
  }

  console.log(`[STORAGE] Usage after pruning: ${(totalBytes / 1e9).toFixed(2)} GB`);
}
