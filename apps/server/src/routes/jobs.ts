import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { processJob } from '../services/processor';
import { ProgressEvent } from '../types';

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

const router = Router();

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const mode = (req.body.mode as string) || 'assemblyai';

    if (mode === 'local') {
      res.status(400).json({ error: 'Local mode is not available in this deployment.' });
      return;
    }
    const model = (req.body.model as string) || (mode === 'local' ? 'base' : 'universal-2');
    const language = (req.body.language as string) || null;
    const numSpeakers = parseInt(req.body.numSpeakers as string, 10) || 2;

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO transcripts (id, original_filename, file_path, status, mode, model, language, num_speakers, segments, created_at, updated_at, error_message)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, NULL)
    `).run(
      id,
      req.file.originalname,
      req.file.path,
      mode,
      model,
      language && language !== 'auto' ? language : null,
      numSpeakers,
      now,
      now
    );

    res.json({ id });
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id/progress', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;

  req.on('close', () => {
    closed = true;
  });

  const send = (event: ProgressEvent) => {
    if (!closed) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Force-flush so the browser receives each event immediately
      (res as any).flush?.();
    }
  };

  // Keepalive ping every 15 s to prevent proxies/browsers timing out
  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(': ping\n\n');
      (res as any).flush?.();
    }
  }, 15_000);

  try {
    await processJob(req.params.id, send);
  } catch (e) {
    if (!closed) {
      send({
        step: 'error',
        progress: 0,
        message: String(e instanceof Error ? e.message : e),
        error: String(e instanceof Error ? e.message : e),
      });
    }
  } finally {
    clearInterval(heartbeat);
    if (!closed) {
      res.end();
    }
  }
});

export default router;
