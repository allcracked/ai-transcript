import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db';
import { CallBrief, Segment } from '../types';
import { FALLBACK_MODEL, isRetryableError } from './gemini-retry';

const MODEL = 'gemini-3.1-flash-lite-preview';

// Same prompt as brief.ts — applied to all calls concatenated
const PROMPT = `You are analyzing a series of phone call transcripts (callbacks). Each line is prefixed with a timestamp in seconds and the speaker label. Multiple calls are separated by === Call N === headers.

Extract the following information across ALL calls and return ONLY a valid JSON object with no markdown, no code blocks, no extra text.

Fields to extract:
- "workType": A brief description of the type of construction or service work requested or discussed. If not mentioned, use null.
- "workTypeTimestamp": The timestamp (in seconds, as a number) of the line where the work type is first mentioned. If not found, use null.
- "appointmentAgreed": true if an appointment was agreed upon during any of the calls, false if explicitly declined or not possible, null if not mentioned.
- "appointmentAgreedTimestamp": The timestamp (in seconds, as a number) of the line where the appointment agreement is mentioned. If not found, use null.
- "ownerPresent": A short answer (e.g. "Yes", "No", "Unknown") on whether the owner or owners of the property can be present during a free evaluation or visit. If not mentioned, use null.
- "ownerPresentTimestamp": The timestamp (in seconds, as a number) of the line where owner presence is mentioned. If not found, use null.
- "appointmentDate": The specific date and/or time of the appointment if one was agreed. Include day, date, and time if mentioned. If not mentioned, use null.
- "appointmentDateTimestamp": The timestamp (in seconds, as a number) of the line where the appointment date/time is mentioned. If not found, use null.

Always respond in English regardless of the language of the transcripts.

Transcripts:
`;

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(sec).padStart(2, '0')].join(':');
}

export async function generateCombinedAnalysis(batchId: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[BATCH-BRIEF] GEMINI_API_KEY not set — skipping batch brief');
    return;
  }

  const transcriptRows = db.prepare(
    'SELECT id, original_filename, segments FROM transcripts WHERE batch_id = ? ORDER BY batch_order ASC'
  ).all(batchId) as { id: string; original_filename: string; segments: string | null }[];

  if (!transcriptRows.length) {
    console.warn(`[BATCH-BRIEF] No transcripts found for batch ${batchId}`);
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

  const fullText = callBlocks.join('\n\n');

  db.prepare('UPDATE call_batches SET combined_analysis_status = ?, updated_at = ? WHERE id = ?').run(
    'processing',
    new Date().toISOString(),
    batchId
  );

  try {
    console.log(`[BATCH-BRIEF] Generating brief for batch ${batchId} (${transcriptRows.length} calls)`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const t0 = Date.now();
    let usedModel = MODEL;
    let result = await model.generateContent(PROMPT + fullText).catch((err) => {
      if (!isRetryableError(err)) throw err;
      console.warn(`[BATCH-BRIEF] Retrying with fallback model for batch ${batchId}`);
      usedModel = FALLBACK_MODEL;
      const fallback = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      return fallback.generateContent(PROMPT + fullText);
    });
    const text = result.response.text().trim();

    let brief: CallBrief;
    try {
      brief = JSON.parse(text) as CallBrief;
    } catch {
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      brief = JSON.parse(cleaned) as CallBrief;
    }

    db.prepare(
      'UPDATE call_batches SET combined_analysis = ?, combined_analysis_status = ?, brief_model = ?, brief_duration_ms = ?, status = ?, updated_at = ? WHERE id = ?'
    ).run(
      JSON.stringify(brief),
      'done',
      usedModel,
      Date.now() - t0,
      'done',
      new Date().toISOString(),
      batchId
    );

    console.log(`[BATCH-BRIEF] ✓ Brief saved for batch ${batchId}`);
  } catch (err) {
    console.error(`[BATCH-BRIEF] ✗ Failed for batch ${batchId}:`, err);
    db.prepare(
      'UPDATE call_batches SET combined_analysis_status = ?, updated_at = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), batchId);
  }
}
