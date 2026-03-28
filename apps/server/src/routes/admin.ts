import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// All admin routes require admin role (requireAuth is applied globally in index.ts)
router.use(requireAdmin);

// ── Users ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  role: string;
  banned: number | null;
  banReason: string | null;
}

router.get('/users', (_req: Request, res: Response) => {
  try {
    const users = db
      .prepare(`SELECT id, name, email, image, createdAt, role, banned, banReason FROM "user" ORDER BY createdAt DESC`)
      .all() as UserRow[];

    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        createdAt: u.createdAt,
        role: u.role ?? 'user',
        banned: Boolean(u.banned),
        banReason: u.banReason,
      }))
    );
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.patch('/users/:id/role', (req: Request, res: Response) => {
  const { role } = req.body as { role: string };
  if (!['admin', 'user'].includes(role)) {
    res.status(400).json({ error: 'Role must be admin or user' });
    return;
  }
  try {
    db.prepare(`UPDATE "user" SET role = ? WHERE id = ?`).run(role, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch('/users/:id/ban', (req: Request, res: Response) => {
  const { banned, reason } = req.body as { banned: boolean; reason?: string };
  try {
    db.prepare(`UPDATE "user" SET banned = ?, banReason = ? WHERE id = ?`).run(
      banned ? 1 : 0,
      banned ? (reason ?? null) : null,
      req.params.id
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/users/:id', (req: Request, res: Response) => {
  try {
    db.prepare(`DELETE FROM "user" WHERE id = ?`).run(req.params.id);
    // Cascade: remove their sessions and transcripts
    db.prepare(`DELETE FROM session WHERE userId = ?`).run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Settings ─────────────────────────────────────────────────────────────────

router.get('/settings', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as { key: string; value: string }[];
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch('/settings', (req: Request, res: Response) => {
  const { registration_enabled } = req.body as { registration_enabled?: boolean };
  try {
    if (registration_enabled !== undefined) {
      db.prepare(`UPDATE app_settings SET value = ? WHERE key = 'registration_enabled'`).run(
        registration_enabled ? 'true' : 'false'
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Allowlist ─────────────────────────────────────────────────────────────────

interface AllowlistRow {
  id: string;
  value: string;
  type: string;
  created_at: string;
}

router.get('/allowlist', (_req: Request, res: Response) => {
  try {
    const entries = db.prepare(`SELECT * FROM allowlist ORDER BY created_at ASC`).all() as AllowlistRow[];
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/allowlist', (req: Request, res: Response) => {
  const { value, type } = req.body as { value: string; type: 'email' | 'domain' };

  if (!value || !['email', 'domain'].includes(type)) {
    res.status(400).json({ error: 'Provide value and type (email or domain)' });
    return;
  }

  const normalised = value.trim().toLowerCase();

  try {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO allowlist (id, value, type, created_at) VALUES (?, ?, ?, ?)`
    ).run(id, normalised, type, new Date().toISOString());
    res.json({ id, value: normalised, type });
  } catch (err: unknown) {
    // UNIQUE constraint
    if (String(err).includes('UNIQUE')) {
      res.status(409).json({ error: 'Entry already exists' });
    } else {
      res.status(500).json({ error: String(err) });
    }
  }
});

router.delete('/allowlist/:id', (req: Request, res: Response) => {
  try {
    db.prepare(`DELETE FROM allowlist WHERE id = ?`).run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Analytics ──────────────────────────────────────────────────────────────────

router.get('/analytics', (_req: Request, res: Response) => {
  try {
    // Overview KPIs
    const overview = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM transcripts) AS total_transcripts,
        (SELECT COUNT(*) FROM call_batches) AS total_batches,
        (SELECT COUNT(*) FROM "user") AS total_users,
        (SELECT COUNT(*) FROM transcripts WHERE status = 'done') AS done_count,
        (SELECT COUNT(*) FROM transcripts WHERE status = 'error') AS error_count,
        (SELECT COUNT(*) FROM transcripts WHERE created_at >= datetime('now', '-7 days')) AS this_week,
        (SELECT COUNT(*) FROM transcripts WHERE created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')) AS last_week
    `).get() as {
      total_transcripts: number;
      total_batches: number;
      total_users: number;
      done_count: number;
      error_count: number;
      this_week: number;
      last_week: number;
    };

    // Uploads per day, last 30 days
    const activityByDay = db.prepare(`
      SELECT date(created_at) AS date, COUNT(*) AS count
      FROM transcripts
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    // Per-user breakdown
    const perUser = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        COUNT(t.id) AS transcripts,
        SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) AS errors,
        MAX(t.created_at) AS last_active
      FROM "user" u
      LEFT JOIN transcripts t ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY transcripts DESC
    `).all() as { id: string; name: string; email: string; transcripts: number; errors: number; last_active: string | null }[];

    const batchesPerUser = db.prepare(`
      SELECT user_id, COUNT(*) AS batches FROM call_batches GROUP BY user_id
    `).all() as { user_id: string; batches: number }[];
    const batchMap = Object.fromEntries(batchesPerUser.map((b) => [b.user_id, b.batches]));
    const perUserResult = perUser.map((u) => ({ ...u, batches: batchMap[u.id] ?? 0 }));

    // Processing performance by mode+model
    const performance = db.prepare(`
      SELECT mode, model,
        ROUND(AVG(transcription_duration_ms)) AS avg_transcription_ms,
        ROUND(AVG(brief_duration_ms)) AS avg_brief_ms,
        COUNT(*) AS count
      FROM transcripts
      WHERE status = 'done' AND transcription_duration_ms IS NOT NULL
      GROUP BY mode, model
      ORDER BY count DESC
    `).all() as { mode: string; model: string; avg_transcription_ms: number; avg_brief_ms: number | null; count: number }[];

    // AI feature adoption
    const aiAdoption = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN brief_status = 'done' THEN 1 ELSE 0 END) AS briefs,
        SUM(CASE WHEN rubric_status = 'done' THEN 1 ELSE 0 END) AS rubrics
      FROM transcripts
      WHERE status = 'done'
    `).get() as { total: number; briefs: number; rubrics: number };

    // Top errors
    const errors = db.prepare(`
      SELECT error_message, mode, COUNT(*) AS count
      FROM transcripts
      WHERE status = 'error' AND error_message IS NOT NULL
      GROUP BY error_message, mode
      ORDER BY count DESC
      LIMIT 10
    `).all() as { error_message: string; mode: string; count: number }[];

    res.json({ overview, activityByDay, perUser: perUserResult, performance, aiAdoption, errors });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
