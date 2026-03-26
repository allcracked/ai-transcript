import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db';
import { CallBrief, Segment } from '../types';
import { FALLBACK_MODEL, isRetryableError } from './gemini-retry';

const MODEL = 'gemini-3.1-flash-lite-preview';

const PROMPT = `You are analyzing a phone call transcript. Each line is prefixed with a timestamp in seconds and the speaker label.

Extract the following information and return ONLY a valid JSON object with no markdown, no code blocks, no extra text.

Fields to extract:
- "workType": A brief description of the type of construction or service work requested or discussed. If not mentioned, use null.
- "workTypeTimestamp": The timestamp (in seconds, as a number) of the line where the work type is first mentioned. If not found, use null.
- "appointmentAgreed": true if an appointment was agreed upon during the call, false if explicitly declined or not possible, null if not mentioned.
- "appointmentAgreedTimestamp": The timestamp (in seconds, as a number) of the line where the appointment agreement is mentioned. If not found, use null.
- "ownerPresent": A short answer (e.g. "Yes", "No", "Unknown") on whether the owner or owners of the property can be present during a free evaluation or visit. If not mentioned, use null.
- "ownerPresentTimestamp": The timestamp (in seconds, as a number) of the line where owner presence is mentioned. If not found, use null.
- "appointmentDate": The specific date and/or time of the appointment if one was agreed. Include day, date, and time if mentioned. If not mentioned, use null.
- "appointmentDateTimestamp": The timestamp (in seconds, as a number) of the line where the appointment date/time is mentioned. If not found, use null.

Always respond in English regardless of the language of the transcript.

Transcript:
`;

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(sec).padStart(2, '0')].join(':');
}

export async function generateBrief(transcriptId: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[BRIEF] GEMINI_API_KEY not set — skipping brief generation');
    return;
  }

  const row = db.prepare('SELECT segments FROM transcripts WHERE id = ?').get(transcriptId) as
    | { segments: string | null }
    | undefined;

  if (!row?.segments) {
    console.warn(`[BRIEF] No segments found for transcript ${transcriptId}`);
    return;
  }

  const segments: Segment[] = JSON.parse(row.segments);
  const transcriptText = segments
    .map((s) => `[${s.start}s / ${formatSeconds(s.start)}] [${s.speaker}]: ${s.text}`)
    .join('\n');

  db.prepare('UPDATE transcripts SET brief_status = ?, updated_at = ? WHERE id = ?').run(
    'processing',
    new Date().toISOString(),
    transcriptId
  );

  try {
    console.log(`[BRIEF] Generating brief for transcript ${transcriptId}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    let result = await model.generateContent(PROMPT + transcriptText).catch((err) => {
      if (!isRetryableError(err)) throw err;
      console.warn(`[BRIEF] Retrying with fallback model for transcript ${transcriptId}`);
      const fallback = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      return fallback.generateContent(PROMPT + transcriptText);
    });
    const text = result.response.text().trim();

    let brief: CallBrief;
    try {
      brief = JSON.parse(text) as CallBrief;
    } catch {
      // Strip markdown code fences if the model wrapped the JSON anyway
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      brief = JSON.parse(cleaned) as CallBrief;
    }

    db.prepare(
      'UPDATE transcripts SET brief = ?, brief_status = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(brief), 'done', new Date().toISOString(), transcriptId);

    console.log(`[BRIEF] ✓ Brief saved for transcript ${transcriptId}`);
  } catch (err) {
    console.error(`[BRIEF] ✗ Failed for transcript ${transcriptId}:`, err);
    db.prepare(
      'UPDATE transcripts SET brief_status = ?, updated_at = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), transcriptId);
  }
}
