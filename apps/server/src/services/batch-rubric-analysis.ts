import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db';
import { Segment } from '../types';

const MODEL = 'gemini-3.1-flash-lite-preview';

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export async function runBatchRubricAnalysis(batchId: string, rubricId: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[BATCH-RUBRIC] GEMINI_API_KEY not set — skipping');
    return;
  }

  const rubric = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(rubricId) as
    | { id: string; name: string; prompt: string }
    | undefined;

  if (!rubric) {
    console.warn(`[BATCH-RUBRIC] Rubric not found: ${rubricId}`);
    db.prepare('UPDATE call_batches SET rubric_status = ?, updated_at = ? WHERE id = ?').run(
      'error', new Date().toISOString(), batchId
    );
    return;
  }

  const transcriptRows = db.prepare(
    'SELECT id, original_filename, segments FROM transcripts WHERE batch_id = ? ORDER BY batch_order ASC'
  ).all(batchId) as { id: string; original_filename: string; segments: string | null }[];

  if (!transcriptRows.length) {
    console.warn(`[BATCH-RUBRIC] No transcripts found for batch ${batchId}`);
    return;
  }

  const callBlocks = transcriptRows.map((row, idx) => {
    if (!row.segments) return `=== Call ${idx + 1} (${row.original_filename}) ===\n[No transcript available]`;
    const segments: Segment[] = JSON.parse(row.segments);
    const text = segments
      .map((s) => `[${s.start}s / ${formatSeconds(s.start)}] [${s.speaker}]: ${s.text}`)
      .join('\n');
    return `=== Call ${idx + 1} (${row.original_filename}) ===\n${text}`;
  });

  const transcriptText = callBlocks.join('\n\n');

  db.prepare('UPDATE call_batches SET rubric_id = ?, rubric_status = ?, updated_at = ? WHERE id = ?').run(
    rubricId, 'processing', new Date().toISOString(), batchId
  );

  try {
    console.log(`[BATCH-RUBRIC] Running "${rubric.name}" on batch ${batchId}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const prompt = `${rubric.prompt}\n\nTranscripts:\n${transcriptText}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    db.prepare(
      'UPDATE call_batches SET rubric_result = ?, rubric_status = ?, updated_at = ? WHERE id = ?'
    ).run(text, 'done', new Date().toISOString(), batchId);

    console.log(`[BATCH-RUBRIC] ✓ Analysis saved for batch ${batchId}`);
  } catch (err) {
    console.error(`[BATCH-RUBRIC] ✗ Failed for batch ${batchId}:`, err);
    db.prepare(
      'UPDATE call_batches SET rubric_status = ?, updated_at = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), batchId);
  }
}
