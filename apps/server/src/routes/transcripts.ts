import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { Transcript, Segment } from '../types';
import { AuthRequest } from '../middleware/auth';

interface DbRow {
  id: string;
  original_filename: string;
  file_path: string;
  status: string;
  mode: string;
  model: string;
  language: string | null;
  num_speakers: number;
  segments: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  user_id: string | null;
  uploader_name: string | null;
}

function rowToTranscript(row: DbRow): Transcript {
  const audioUrl = row.file_path ? `/uploads/${path.basename(row.file_path)}` : null;
  return {
    id: row.id,
    originalFilename: row.original_filename,
    filePath: row.file_path,
    audioUrl,
    status: row.status as Transcript['status'],
    mode: row.mode as Transcript['mode'],
    model: row.model,
    language: row.language,
    numSpeakers: row.num_speakers,
    segments: row.segments ? (JSON.parse(row.segments) as Segment[]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    uploaderName: row.uploader_name ?? null,
  };
}

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const rows = (
      currentUser.role === 'admin'
        ? db.prepare('SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id ORDER BY t.created_at DESC').all()
        : db.prepare('SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id WHERE t.user_id = ? ORDER BY t.created_at DESC').all(currentUser.id)
    ) as DbRow[];
    res.json(rows.map(rowToTranscript));
  } catch (err) {
    console.error('Error listing transcripts:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db
      .prepare('SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id WHERE t.id = ?')
      .get(req.params.id) as DbRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(rowToTranscript(row));
  } catch (err) {
    console.error('Error getting transcript:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/reprocess', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db
      .prepare('SELECT * FROM transcripts WHERE id = ?')
      .get(req.params.id) as DbRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE transcripts
      SET status = 'pending', segments = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, req.params.id);

    res.json({ id: req.params.id });
  } catch (err) {
    console.error('Error reprocessing transcript:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db
      .prepare('SELECT * FROM transcripts WHERE id = ?')
      .get(req.params.id) as DbRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    db.prepare('DELETE FROM transcripts WHERE id = ?').run(req.params.id);

    if (row.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.unlinkSync(row.file_path);
      } catch (fileErr) {
        console.warn('Could not delete uploaded file:', fileErr);
      }
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting transcript:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
