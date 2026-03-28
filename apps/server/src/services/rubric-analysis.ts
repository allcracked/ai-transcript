import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db';
import { Segment } from '../types';
import { FALLBACK_MODEL, isRetryableError } from './gemini-retry';

const MODEL = 'gemini-3.1-flash-lite-preview';

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export async function runRubricAnalysis(transcriptId: string, rubricId: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[RUBRIC] GEMINI_API_KEY not set — skipping rubric analysis');
    return;
  }

  const rubric = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(rubricId) as
    | { id: string; name: string; prompt: string }
    | undefined;

  if (!rubric) {
    console.warn(`[RUBRIC] Rubric not found: ${rubricId}`);
    db.prepare('UPDATE transcripts SET rubric_status = ?, updated_at = ? WHERE id = ?').run(
      'error', new Date().toISOString(), transcriptId
    );
    return;
  }

  const row = db.prepare('SELECT segments FROM transcripts WHERE id = ?').get(transcriptId) as
    | { segments: string | null }
    | undefined;

  if (!row?.segments) {
    console.warn(`[RUBRIC] No segments found for transcript ${transcriptId}`);
    return;
  }

  const segments: Segment[] = JSON.parse(row.segments);
  const transcriptText = segments
    .map((s) => `[${s.start}s / ${formatSeconds(s.start)}] [${s.speaker}]: ${s.text}`)
    .join('\n');

  db.prepare('UPDATE transcripts SET rubric_id = ?, rubric_status = ?, updated_at = ? WHERE id = ?').run(
    rubricId, 'processing', new Date().toISOString(), transcriptId
  );

  try {
    console.log(`[RUBRIC] Running "${rubric.name}" on transcript ${transcriptId}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const prompt = `${rubric.prompt}\n\nTranscript:\n${transcriptText}`;
    const t0 = Date.now();
    let usedModel = MODEL;
    let result = await model.generateContent(prompt).catch((err) => {
      if (!isRetryableError(err)) throw err;
      console.warn(`[RUBRIC] Retrying with fallback model for transcript ${transcriptId}`);
      usedModel = FALLBACK_MODEL;
      const fallback = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      return fallback.generateContent(prompt);
    });
    const text = result.response.text().trim();

    db.prepare(
      'UPDATE transcripts SET rubric_result = ?, rubric_status = ?, rubric_model = ?, rubric_duration_ms = ?, updated_at = ? WHERE id = ?'
    ).run(text, 'done', usedModel, Date.now() - t0, new Date().toISOString(), transcriptId);

    console.log(`[RUBRIC] ✓ Analysis saved for transcript ${transcriptId}`);
  } catch (err) {
    console.error(`[RUBRIC] ✗ Failed for transcript ${transcriptId}:`, err);
    db.prepare(
      'UPDATE transcripts SET rubric_status = ?, updated_at = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), transcriptId);
  }
}
