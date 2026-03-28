import { AssemblyAI } from 'assemblyai';
import { Segment } from '../types';

export interface SpeakerTurn {
  start: number;
  end: number;
  speaker: string;
}

// Used for old 'api' records being reprocessed
export async function diarize(
  filePath: string,
  numSpeakers: number,
  language?: string,
  onProgress?: (message: string) => void
): Promise<SpeakerTurn[]> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

  const log = (msg: string) => {
    console.log(`[DIARIZE] ${msg}`);
    onProgress?.(msg);
  };

  log(`Uploading audio to AssemblyAI: ${filePath}`);

  const params: Parameters<typeof client.transcripts.transcribe>[0] = {
    audio: filePath,
    speaker_labels: true,
    ...(numSpeakers > 0 ? { speakers_expected: numSpeakers } : {}),
    speech_models: ['universal-2'],
  };

  if (language && language !== 'auto') {
    params.language_code = language;
    log(`Language forced to: ${language}`);
  } else {
    log('Language: auto-detect');
  }

  log(`Submitting to AssemblyAI (expected speakers: ${numSpeakers > 0 ? numSpeakers : 'auto-detect'})...`);
  const transcript = await client.transcripts.transcribe(params);
  log(`AssemblyAI job status: ${transcript.status}`);

  if (transcript.status === 'error') {
    console.error(`[DIARIZE] AssemblyAI error: ${transcript.error}`);
    throw new Error(`AssemblyAI transcription failed: ${transcript.error || 'Unknown error'}`);
  }

  if (!transcript.words || transcript.words.length === 0) {
    log('No word-level data returned — skipping speaker turns');
    return [];
  }

  log(`Processing ${transcript.words.length} words into speaker turns...`);

  const turns: SpeakerTurn[] = [];
  let currentTurn: SpeakerTurn | null = null;

  for (const word of transcript.words) {
    if (!word.speaker) continue;

    const wordStart = (word.start ?? 0) / 1000;
    const wordEnd = (word.end ?? 0) / 1000;

    if (!currentTurn || currentTurn.speaker !== word.speaker) {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = { start: wordStart, end: wordEnd, speaker: word.speaker };
    } else {
      currentTurn.end = wordEnd;
    }
  }

  if (currentTurn) turns.push(currentTurn);

  const speakerSet = [...new Set(turns.map(t => t.speaker))];
  log(`Found ${turns.length} speaker turns across ${speakerSet.length} speaker(s): ${speakerSet.join(', ')}`);

  return turns;
}

// Full AssemblyAI pipeline: transcription + diarization in one pass
export async function transcribeAndDiarize(
  filePath: string,
  numSpeakers: number,
  language?: string,
  onProgress?: (message: string) => void
): Promise<{ segments: Segment[]; durationMs: number }> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

  const log = (msg: string) => {
    console.log(`[DIARIZE] ${msg}`);
    onProgress?.(msg);
  };

  log(`Uploading audio to AssemblyAI: ${filePath}`);

  const params: Parameters<typeof client.transcripts.transcribe>[0] = {
    audio: filePath,
    speaker_labels: true,
    ...(numSpeakers > 0 ? { speakers_expected: numSpeakers } : {}),
    speech_models: ['universal-2'],
  };

  if (language && language !== 'auto') {
    params.language_code = language;
    log(`Language forced to: ${language}`);
  } else {
    log('Language: auto-detect');
  }

  log(`Submitting to AssemblyAI (expected speakers: ${numSpeakers > 0 ? numSpeakers : 'auto-detect'})...`);
  const t0 = Date.now();
  const transcript = await client.transcripts.transcribe(params);
  const durationMs = Date.now() - t0;
  log(`AssemblyAI job status: ${transcript.status}`);

  if (transcript.status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error || 'Unknown error'}`);
  }

  if (!transcript.utterances || transcript.utterances.length === 0) {
    log('No utterances returned from AssemblyAI');
    return { segments: [], durationMs };
  }

  log(`Processing ${transcript.utterances.length} utterances...`);

  const segments: Segment[] = transcript.utterances.map((u) => ({
    start: (u.start ?? 0) / 1000,
    end: (u.end ?? 0) / 1000,
    speaker: u.speaker ?? 'Unknown',
    text: u.text.trim(),
  }));

  const speakerSet = [...new Set(segments.map(s => s.speaker))];
  log(`Found ${segments.length} segments across ${speakerSet.length} speaker(s): ${speakerSet.join(', ')}`);

  return { segments, durationMs };
}
