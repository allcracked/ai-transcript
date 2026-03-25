import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { Transcript, Segment, CallBrief } from '../types';
import { AuthRequest } from '../middleware/auth';
import { generateBrief } from '../services/brief';
import { runRubricAnalysis } from '../services/rubric-analysis';

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
  brief: string | null;
  brief_status: string | null;
  rubric_id: string | null;
  rubric_result: string | null;
  rubric_status: string | null;
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
    brief: row.brief ? (JSON.parse(row.brief) as CallBrief) : null,
    briefStatus: (row.brief_status ?? null) as Transcript['briefStatus'],
    rubricId: row.rubric_id ?? null,
    rubricResult: row.rubric_result ?? null,
    rubricStatus: (row.rubric_status ?? null) as Transcript['rubricStatus'],
    batchId: (row as any).batch_id ?? null,
    batchOrder: (row as any).batch_order ?? null,
  };
}

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const rows = (
      currentUser.role === 'admin'
        ? db.prepare('SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id WHERE t.batch_id IS NULL ORDER BY t.created_at DESC').all()
        : db.prepare('SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id WHERE t.user_id = ? AND t.batch_id IS NULL ORDER BY t.created_at DESC').all(currentUser.id)
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

router.post('/:id/brief', async (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db
      .prepare('SELECT id, user_id, status, brief_status FROM transcripts WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null; status: string; brief_status: string | null } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (row.status !== 'done') {
      res.status(400).json({ error: 'Transcript is not yet complete' });
      return;
    }

    if (row.brief_status === 'processing') {
      res.status(409).json({ error: 'Brief is already being generated' });
      return;
    }

    // Fire and forget
    generateBrief(row.id).catch((err) =>
      console.error('[BRIEF] Manual generation error:', err)
    );

    res.json({ status: 'processing' });
  } catch (err) {
    console.error('Error triggering brief generation:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/rubric', async (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const { rubricId } = req.body as { rubricId?: string };

    if (!rubricId) {
      res.status(400).json({ error: 'rubricId is required' });
      return;
    }

    const row = db
      .prepare('SELECT id, user_id, status, rubric_status FROM transcripts WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null; status: string; rubric_status: string | null } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }
    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (row.status !== 'done') {
      res.status(400).json({ error: 'Transcript is not yet complete' });
      return;
    }
    if (row.rubric_status === 'processing') {
      res.status(409).json({ error: 'Rubric analysis is already running' });
      return;
    }

    runRubricAnalysis(row.id, rubricId).catch((err) =>
      console.error('[RUBRIC] Manual analysis error:', err)
    );

    res.json({ status: 'processing' });
  } catch (err) {
    console.error('Error triggering rubric analysis:', err);
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
