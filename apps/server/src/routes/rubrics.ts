import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { Rubric } from '../types';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function rowToRubric(row: Record<string, unknown>): Rubric {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    prompt: row.prompt as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// GET all rubrics (visible to everyone)
router.get('/', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM rubrics ORDER BY created_at DESC').all() as Record<string, unknown>[];
    res.json(rows.map(rowToRubric));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST create rubric
router.post('/', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const { name, description, prompt } = req.body as { name?: string; description?: string; prompt?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    if (!prompt?.trim()) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO rubrics (id, name, description, prompt, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), description?.trim() ?? null, prompt.trim(), currentUser.id, now, now);

    const row = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(rowToRubric(row));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH update rubric (owner or admin)
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Rubric not found' });
      return;
    }
    if (currentUser.role !== 'admin' && row.created_by !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { name, description, prompt } = req.body as { name?: string; description?: string; prompt?: string };
    const now = new Date().toISOString();

    db.prepare(
      'UPDATE rubrics SET name = ?, description = ?, prompt = ?, updated_at = ? WHERE id = ?'
    ).run(
      name?.trim() ?? row.name,
      description !== undefined ? (description?.trim() ?? null) : row.description,
      prompt?.trim() ?? row.prompt,
      now,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json(rowToRubric(updated));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE rubric (owner or admin)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Rubric not found' });
      return;
    }
    if (currentUser.role !== 'admin' && row.created_by !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    db.prepare('DELETE FROM rubrics WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
