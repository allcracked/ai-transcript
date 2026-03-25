import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db';
import { CallBrief, Segment } from '../types';

const MODEL = 'gemini-3.1-flash-lite-preview';

const PROMPT = `You are analyzing a phone call transcript. Extract the following information and return ONLY a valid JSON object with no markdown, no code blocks, no extra text.

Fields to extract:
- "workType": A brief description of the type of construction or service work requested or discussed. If not mentioned, use null.
- "appointmentAgreed": true if an appointment was agreed upon during the call, false if explicitly declined or not possible, null if not mentioned.
- "ownerPresent": A short answer (e.g. "Yes", "No", "Unknown") on whether the owner or owners of the property can be present during a free evaluation or visit. If not mentioned, use null.
- "appointmentDate": The specific date and/or time of the appointment if one was agreed. Include day, date, and time if mentioned. If not mentioned, use null.

Always respond in English regardless of the language of the transcript.

Transcript:
`;

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
    .map((s) => `[${s.speaker}]: ${s.text}`)
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

    const result = await model.generateContent(PROMPT + transcriptText);
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
