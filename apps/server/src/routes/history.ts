import { Router, Request, Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

interface HistoryRow {
  kind: string;
  id: string;
  name: string;
  status: string;
  created_at: string;
  uploader_name: string | null;
  model: string | null;
  mode: string | null;
  error_message: string | null;
  call_count: number | null;
}

const router = Router();

// GET /api/history
// Query params:
//   limit     — default 40, max 100
//   offset    — default 0
//   status    — 'pending' | 'processing' | 'done' | 'error'
//   type      — 'transcript' | 'batch'
//   search    — filename / batch name contains
//   dateFrom  — YYYY-MM-DD
//   dateTo    — YYYY-MM-DD (inclusive)
//   uploader  — uploader name contains
router.get('/', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const isAdmin = currentUser.role === 'admin';

    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '40', 10), 1), 100);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
    const status = (req.query.status as string) || undefined;
    const type = (req.query.type as string) || undefined;
    const search = (req.query.search as string) || undefined;
    const dateFrom = (req.query.dateFrom as string) || undefined;
    const dateTo = (req.query.dateTo as string) || undefined;
    const uploader = (req.query.uploader as string) || undefined;

    // ── Transcript subquery ────────────────────────────────────────────────
    const tConds: string[] = ['t.batch_id IS NULL'];
    const tParams: (string | number)[] = [];

    if (!isAdmin) { tConds.push('t.user_id = ?'); tParams.push(currentUser.id); }
    if (status)   { tConds.push('t.status = ?');  tParams.push(status); }
    if (search)   { tConds.push('t.original_filename LIKE ?'); tParams.push(`%${search}%`); }
    if (dateFrom) { tConds.push('t.created_at >= ?'); tParams.push(dateFrom); }
    if (dateTo)   { tConds.push('t.created_at <= ?'); tParams.push(`${dateTo}T23:59:59.999Z`); }
    if (uploader) { tConds.push('u.name LIKE ?'); tParams.push(`%${uploader}%`); }

    const transcriptSub = `
      SELECT 'transcript' AS kind, t.id, t.original_filename AS name,
             t.status, t.created_at, u.name AS uploader_name,
             t.model, t.mode, t.error_message, NULL AS call_count
      FROM transcripts t
      LEFT JOIN "user" u ON t.user_id = u.id
      WHERE ${tConds.join(' AND ')}`;

    // ── Batch subquery ─────────────────────────────────────────────────────
    const bConds: string[] = [];
    const bParams: (string | number)[] = [];

    if (!isAdmin) { bConds.push('cb.user_id = ?'); bParams.push(currentUser.id); }
    if (status)   { bConds.push('cb.status = ?');  bParams.push(status); }
    if (search)   { bConds.push("COALESCE(cb.name, '') LIKE ?"); bParams.push(`%${search}%`); }
    if (dateFrom) { bConds.push('cb.created_at >= ?'); bParams.push(dateFrom); }
    if (dateTo)   { bConds.push('cb.created_at <= ?'); bParams.push(`${dateTo}T23:59:59.999Z`); }
    if (uploader) { bConds.push('u.name LIKE ?'); bParams.push(`%${uploader}%`); }

    const batchSub = `
      SELECT 'batch' AS kind, cb.id, COALESCE(cb.name, 'Call Batch') AS name,
             cb.status, cb.created_at, u.name AS uploader_name,
             tf.model, NULL AS mode, NULL AS error_message,
             (SELECT COUNT(*) FROM transcripts WHERE batch_id = cb.id) AS call_count
      FROM call_batches cb
      LEFT JOIN transcripts tf ON tf.batch_id = cb.id
        AND tf.batch_order = (SELECT MIN(batch_order) FROM transcripts WHERE batch_id = cb.id)
      LEFT JOIN "user" u ON cb.user_id = u.id
      ${bConds.length ? 'WHERE ' + bConds.join(' AND ') : ''}`;

    // ── Combine ────────────────────────────────────────────────────────────
    let unionSql: string;
    let unionParams: (string | number)[];

    if (type === 'transcript') {
      unionSql = transcriptSub;
      unionParams = tParams;
    } else if (type === 'batch') {
      unionSql = batchSub;
      unionParams = bParams;
    } else {
      unionSql = `${transcriptSub} UNION ALL ${batchSub}`;
      unionParams = [...tParams, ...bParams];
    }

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM (${unionSql})`)
      .get(...unionParams) as { total: number };

    const rows = db
      .prepare(`SELECT * FROM (${unionSql}) ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...unionParams, limit, offset) as HistoryRow[];

    const items = rows.map((row) => ({
      kind: row.kind as 'transcript' | 'batch',
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      uploaderName: row.uploader_name ?? null,
      model: row.model ?? null,
      mode: row.mode ?? null,
      errorMessage: row.error_message ?? null,
      callCount: row.call_count ?? null,
    }));

    res.json({ items, total, hasMore: offset + items.length < total });
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
