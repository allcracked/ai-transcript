import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { processJob } from '../services/processor';
import { generateCombinedAnalysis } from '../services/combined-analysis';
import { enforceStorageLimit } from '../services/storage';
import { AuthRequest } from '../middleware/auth';
import { ProgressEvent, CallBatch, Transcript, Segment, CallBrief } from '../types';
import { runBatchRubricAnalysis } from '../services/batch-rubric-analysis';

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
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

interface TranscriptDbRow {
  id: string;
  original_filename: string;
  file_path: string | null;
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
  brief_model: string | null;
  rubric_id: string | null;
  rubric_result: string | null;
  rubric_status: string | null;
  rubric_model: string | null;
  batch_id: string | null;
  batch_order: number | null;
}

interface BatchDbRow {
  id: string;
  name: string | null;
  status: string;
  combined_analysis: string | null;
  combined_analysis_status: string | null;
  brief_model: string | null;
  user_id: string | null;
  uploader_name: string | null;
  transcript_model: string | null;
  rubric_id: string | null;
  rubric_result: string | null;
  rubric_status: string | null;
  rubric_model: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTranscript(row: TranscriptDbRow): Transcript {
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
    briefModel: row.brief_model ?? null,
    rubricId: row.rubric_id ?? null,
    rubricResult: row.rubric_result ?? null,
    rubricStatus: (row.rubric_status ?? null) as Transcript['rubricStatus'],
    rubricModel: row.rubric_model ?? null,
    batchId: row.batch_id ?? null,
    batchOrder: row.batch_order ?? null,
  };
}

function rowToBatch(row: BatchDbRow, transcripts?: Transcript[]): CallBatch {
  return {
    id: row.id,
    name: row.name,
    status: row.status as CallBatch['status'],
    brief: row.combined_analysis ? (JSON.parse(row.combined_analysis) as CallBrief) : null,
    briefStatus: (row.combined_analysis_status ?? null) as CallBatch['briefStatus'],
    briefModel: row.brief_model ?? null,
    userId: row.user_id,
    uploaderName: row.uploader_name ?? null,
    model: row.transcript_model ?? null,
    rubricId: row.rubric_id ?? null,
    rubricResult: row.rubric_result ?? null,
    rubricStatus: (row.rubric_status ?? null) as CallBatch['rubricStatus'],
    rubricModel: row.rubric_model ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    transcripts,
  };
}

const router = Router();

// POST /api/batches — upload multiple files and create a batch
router.post('/', upload.array('files', 5), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }
    if (files.length < 2) {
      res.status(400).json({ error: 'Batch requires at least 2 files' });
      return;
    }

    const mode = (req.body.mode as string) || 'assemblyai';
    if (mode === 'local') {
      res.status(400).json({ error: 'Local mode is not available in this deployment.' });
      return;
    }

    const model = (req.body.model as string) || 'universal-2';
    const language = (req.body.language as string) || null;
    const numSpeakersRaw = parseInt(req.body.numSpeakers as string, 10);
    const numSpeakers = isNaN(numSpeakersRaw) ? 0 : numSpeakersRaw;
    const rubricId = (req.body.rubricId as string) || null;

    // fileOrder is a JSON array of original filenames in the desired processing order
    let fileOrder: string[] = [];
    try {
      fileOrder = JSON.parse((req.body.fileOrder as string) || '[]') as string[];
    } catch {
      fileOrder = [];
    }

    // Sort uploaded files by the specified order; unordered files go to the end
    const orderedFiles = [...files].sort((a, b) => {
      const ai = fileOrder.indexOf(a.originalname);
      const bi = fileOrder.indexOf(b.originalname);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    const userId = (req as AuthRequest).currentUser.id;
    const batchId = uuidv4();
    const now = new Date().toISOString();

    // Derive a batch name from the first filename
    const batchName = `Batch — ${orderedFiles[0].originalname}`;

    db.prepare(`
      INSERT INTO call_batches (id, name, status, combined_analysis, combined_analysis_status, user_id, rubric_id, created_at, updated_at)
      VALUES (?, ?, 'pending', NULL, NULL, ?, ?, ?, ?)
    `).run(batchId, batchName, userId, rubricId, now, now);

    for (let i = 0; i < orderedFiles.length; i++) {
      const file = orderedFiles[i];
      const transcriptId = uuidv4();
      db.prepare(`
        INSERT INTO transcripts (id, original_filename, file_path, status, mode, model, language, num_speakers, segments, created_at, updated_at, error_message, user_id, rubric_id, batch_id, batch_order)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)
      `).run(
        transcriptId,
        file.originalname,
        file.path,
        mode,
        model,
        language && language !== 'auto' ? language : null,
        numSpeakers,
        now,
        now,
        userId,
        rubricId,
        batchId,
        i
      );
    }

    enforceStorageLimit();
    res.json({ id: batchId });
  } catch (err) {
    console.error('Error creating batch:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/batches — list batches for current user
router.get('/', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const listQuery = `
      SELECT cb.*,
        t.model AS transcript_model,
        u.name AS uploader_name
      FROM call_batches cb
      LEFT JOIN transcripts t ON t.batch_id = cb.id
        AND t.batch_order = (SELECT MIN(batch_order) FROM transcripts WHERE batch_id = cb.id)
      LEFT JOIN "user" u ON t.user_id = u.id
      ${currentUser.role !== 'admin' ? 'WHERE cb.user_id = ?' : ''}
      ORDER BY cb.created_at DESC
    `;
    const rows = (
      currentUser.role === 'admin'
        ? db.prepare(listQuery).all()
        : db.prepare(listQuery).all(currentUser.id)
    ) as BatchDbRow[];

    res.json(rows.map((r) => rowToBatch(r)));
  } catch (err) {
    console.error('Error listing batches:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/batches/:id — get a single batch with its transcripts
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const batchRow = db.prepare(`
      SELECT cb.*,
        t.model AS transcript_model,
        u.name AS uploader_name
      FROM call_batches cb
      LEFT JOIN transcripts t ON t.batch_id = cb.id
        AND t.batch_order = (SELECT MIN(batch_order) FROM transcripts WHERE batch_id = cb.id)
      LEFT JOIN "user" u ON t.user_id = u.id
      WHERE cb.id = ?
    `).get(req.params.id) as BatchDbRow | undefined;

    if (!batchRow) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    if (currentUser.role !== 'admin' && batchRow.user_id !== currentUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const transcriptRows = db.prepare(
      'SELECT t.*, u.name as uploader_name FROM transcripts t LEFT JOIN "user" u ON t.user_id = u.id WHERE t.batch_id = ? ORDER BY t.batch_order ASC'
    ).all(req.params.id) as TranscriptDbRow[];

    res.json(rowToBatch(batchRow, transcriptRows.map(rowToTranscript)));
  } catch (err) {
    console.error('Error getting batch:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/batches/:id/progress — SSE endpoint that processes all calls sequentially
router.get('/:id/progress', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  const send = (event: ProgressEvent) => {
    if (!closed) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      (res as any).flush?.();
    }
  };

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(': ping\n\n');
      (res as any).flush?.();
    }
  }, 15_000);

  try {
    const { currentUser } = req as AuthRequest;
    const batchRow = db.prepare('SELECT * FROM call_batches WHERE id = ?').get(req.params.id) as BatchDbRow | undefined;

    if (!batchRow) {
      send({ step: 'error', progress: 0, message: 'Batch not found', error: 'Batch not found' });
      return;
    }

    if (currentUser.role !== 'admin' && batchRow.user_id !== currentUser.id) {
      send({ step: 'error', progress: 0, message: 'Access denied', error: 'Access denied' });
      return;
    }

    const transcriptRows = db.prepare(
      'SELECT id FROM transcripts WHERE batch_id = ? ORDER BY batch_order ASC'
    ).all(req.params.id) as { id: string }[];

    const callCount = transcriptRows.length;
    // Each call occupies an equal share of 0–90%; final 10% for combined analysis
    const callSlice = 90 / callCount;

    db.prepare('UPDATE call_batches SET status = ?, updated_at = ? WHERE id = ?')
      .run('processing', new Date().toISOString(), req.params.id);

    for (let i = 0; i < transcriptRows.length; i++) {
      const { id: transcriptId } = transcriptRows[i];
      const callBase = Math.round(i * callSlice);

      send({
        step: 'uploading',
        progress: callBase,
        message: `Processing call ${i + 1} of ${callCount}…`,
        callIndex: i,
        callCount,
      });

      await processJob(
        transcriptId,
        (event: ProgressEvent) => {
          const scaledProgress = Math.round(callBase + (event.progress / 100) * callSlice);
          send({ ...event, callIndex: i, callCount, progress: scaledProgress });
        },
        { skipBrief: true }  // combined analysis covers all calls together
      );

      send({
        step: 'done',
        progress: Math.round((i + 1) * callSlice),
        message: `Call ${i + 1} of ${callCount} complete.`,
        callIndex: i,
        callCount,
        transcriptId,
      });
    }

    // Batch brief
    send({
      step: 'saving',
      progress: 92,
      message: 'Generating brief across all calls…',
      callIndex: callCount - 1,
      callCount,
    });

    await generateCombinedAnalysis(req.params.id);

    // Auto-run rubric if one was selected at upload
    if (batchRow.rubric_id) {
      runBatchRubricAnalysis(req.params.id, batchRow.rubric_id).catch((err) =>
        console.error('[BATCH-RUBRIC] Background analysis error:', err)
      );
    }

    send({
      step: 'done',
      progress: 100,
      message: 'All calls processed!',
      callIndex: callCount - 1,
      callCount,
      batchDone: true,
      batchId: req.params.id,
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (!closed) {
      send({ step: 'error', progress: 0, message: msg, error: msg });
    }
    try {
      db.prepare('UPDATE call_batches SET status = ?, updated_at = ? WHERE id = ?')
        .run('error', new Date().toISOString(), req.params.id);
    } catch { /* ignore */ }
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

// POST /api/batches/:id/brief — (re-)generate brief for a batch
router.post('/:id/brief', async (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db.prepare('SELECT id, user_id, status, combined_analysis_status FROM call_batches WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null; status: string; combined_analysis_status: string | null } | undefined;

    if (!row) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) { res.status(403).json({ error: 'Access denied' }); return; }
    if (row.status === 'pending' || row.status === 'processing') { res.status(400).json({ error: 'Batch is not yet complete' }); return; }
    if (row.combined_analysis_status === 'processing') { res.status(409).json({ error: 'Brief is already being generated' }); return; }

    generateCombinedAnalysis(row.id).catch((err) => console.error('[BATCH-BRIEF] Manual error:', err));
    res.json({ status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/batches/:id/rubric — run rubric analysis on combined batch transcript
router.post('/:id/rubric', async (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const { rubricId } = req.body as { rubricId?: string };

    if (!rubricId) { res.status(400).json({ error: 'rubricId is required' }); return; }

    const row = db.prepare('SELECT id, user_id, status, rubric_status FROM call_batches WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null; status: string; rubric_status: string | null } | undefined;

    if (!row) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) { res.status(403).json({ error: 'Access denied' }); return; }
    if (row.status === 'pending' || row.status === 'processing') { res.status(400).json({ error: 'Batch is not yet complete' }); return; }
    if (row.rubric_status === 'processing') { res.status(409).json({ error: 'Rubric analysis is already running' }); return; }

    runBatchRubricAnalysis(row.id, rubricId).catch((err) => console.error('[BATCH-RUBRIC] Manual error:', err));
    res.json({ status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/batches/:id/reprocess — reset batch and all its transcripts back to pending
router.post('/:id/reprocess', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db.prepare('SELECT id, user_id FROM call_batches WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null } | undefined;

    if (!row) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) { res.status(403).json({ error: 'Access denied' }); return; }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE call_batches SET status = 'pending', combined_analysis = NULL, combined_analysis_status = NULL,
       rubric_result = NULL, rubric_status = NULL, updated_at = ? WHERE id = ?`
    ).run(now, row.id);
    db.prepare(
      `UPDATE transcripts SET status = 'pending', segments = NULL, error_message = NULL,
       brief = NULL, brief_status = NULL, rubric_result = NULL, rubric_status = NULL, updated_at = ? WHERE batch_id = ?`
    ).run(now, row.id);

    res.json({ id: row.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/batches/:id — delete a batch, its transcripts, and uploaded audio files
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { currentUser } = req as AuthRequest;
    const row = db.prepare('SELECT id, user_id FROM call_batches WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string | null } | undefined;

    if (!row) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (currentUser.role !== 'admin' && row.user_id !== currentUser.id) { res.status(403).json({ error: 'Access denied' }); return; }

    const transcriptFiles = db.prepare('SELECT file_path FROM transcripts WHERE batch_id = ?')
      .all(row.id) as { file_path: string | null }[];

    db.prepare('DELETE FROM transcripts WHERE batch_id = ?').run(row.id);
    db.prepare('DELETE FROM call_batches WHERE id = ?').run(row.id);

    for (const { file_path } of transcriptFiles) {
      if (file_path && fs.existsSync(file_path)) {
        try { fs.unlinkSync(file_path); } catch { /* ignore */ }
      }
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
