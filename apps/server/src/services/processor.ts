import db from '../db';
import { ProgressEvent, Transcript } from '../types';
import { transcribeWithApi, transcribeLocally } from './whisper';
import { diarize, transcribeAndDiarize } from './diarize';
import { diarizeWithPyannote } from './diarize-pyannote';
import { align } from './align';

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
}

export async function processJob(
  transcriptId: string,
  emitProgress: (event: ProgressEvent) => void
): Promise<void> {
  let filePath = '';

  try {
    const row = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(transcriptId) as DbRow | undefined;

    if (!row) {
      throw new Error(`Transcript not found: ${transcriptId}`);
    }

    filePath = row.file_path;

    console.log(`[PROCESSOR] Starting job: ${transcriptId}`);
    console.log(`[PROCESSOR] File: ${row.original_filename} → ${row.file_path}`);
    console.log(`[PROCESSOR] Mode: ${row.mode} | Model: ${row.model} | Language: ${row.language ?? 'auto'} | Speakers: ${row.num_speakers}`);

    db.prepare(
      'UPDATE transcripts SET status = ?, updated_at = ? WHERE id = ?'
    ).run('processing', new Date().toISOString(), transcriptId);

    emitProgress({
      step: 'uploading',
      progress: 10,
      message: 'Preparing audio file...',
    });

    let segments;

    if (row.mode === 'assemblyai') {
      // Full AssemblyAI pipeline: transcription + diarization in one pass
      console.log(`[PROCESSOR] → AssemblyAI full pipeline (transcription + diarization)`);
      emitProgress({
        step: 'transcribing',
        progress: 20,
        message: 'Uploading to AssemblyAI...',
      });

      segments = await transcribeAndDiarize(
        row.file_path,
        row.num_speakers,
        row.language ?? undefined,
        (message: string) => {
          emitProgress({
            step: 'diarizing',
            progress: 60,
            message,
          });
        }
      );

      console.log(`[PROCESSOR] AssemblyAI done — ${segments.length} segments`);
      emitProgress({
        step: 'diarizing',
        progress: 85,
        message: `Done — ${segments.length} segments across ${new Set(segments.map(s => s.speaker)).size} speaker(s)`,
      });

    } else if (row.mode === 'local') {
      // Local Whisper + pyannote
      emitProgress({
        step: 'transcribing',
        progress: 20,
        message: `Transcribing locally with model: ${row.model}...`,
      });

      console.log(`[PROCESSOR] → Transcription: local whisper (model: ${row.model})`);
      const whisperSegments = await transcribeLocally(
        row.file_path,
        row.model,
        row.language ?? undefined,
        (line: string) => {
          emitProgress({
            step: 'transcribing',
            progress: 35,
            message: line.substring(0, 120),
          });
        }
      );

      console.log(`[PROCESSOR] Transcription done — ${whisperSegments.length} segments`);
      emitProgress({
        step: 'transcribing',
        progress: 50,
        message: `Transcription complete — ${whisperSegments.length} segments found`,
      });

      console.log(`[PROCESSOR] → Starting pyannote diarization`);
      emitProgress({
        step: 'diarizing',
        progress: 55,
        message: 'Starting speaker diarization with pyannote...',
      });

      const speakerTurns = await diarizeWithPyannote(
        row.file_path,
        row.num_speakers,
        (message: string) => {
          emitProgress({
            step: 'diarizing',
            progress: 65,
            message,
          });
        }
      );

      console.log(`[PROCESSOR] Diarization done — ${speakerTurns.length} speaker turns`);
      emitProgress({
        step: 'diarizing',
        progress: 70,
        message: `Diarization complete — ${speakerTurns.length} speaker turns found`,
      });

      console.log(`[PROCESSOR] → Aligning ${whisperSegments.length} Whisper segments with ${speakerTurns.length} speaker turns`);
      emitProgress({
        step: 'aligning',
        progress: 80,
        message: `Aligning ${whisperSegments.length} segments with speaker turns...`,
      });

      segments = align(whisperSegments, speakerTurns);

      console.log(`[PROCESSOR] Alignment done — ${segments.length} merged segments`);
      emitProgress({
        step: 'aligning',
        progress: 85,
        message: `Alignment complete — ${segments.length} merged segments`,
      });

    } else {
      // Legacy 'api' mode (old records): OpenAI Whisper API + AssemblyAI diarization
      console.log(`[PROCESSOR] → Transcription: OpenAI Whisper API (legacy)`);
      emitProgress({
        step: 'transcribing',
        progress: 20,
        message: 'Transcribing with OpenAI Whisper API...',
      });

      const whisperSegments = await transcribeWithApi(
        row.file_path,
        row.language ?? undefined
      );

      console.log(`[PROCESSOR] Transcription done — ${whisperSegments.length} segments`);
      emitProgress({
        step: 'transcribing',
        progress: 50,
        message: `Transcription complete — ${whisperSegments.length} segments found`,
      });

      console.log(`[PROCESSOR] → Starting AssemblyAI diarization`);
      emitProgress({
        step: 'diarizing',
        progress: 55,
        message: 'Starting speaker diarization with AssemblyAI...',
      });

      const speakerTurns = await diarize(
        row.file_path,
        row.num_speakers,
        row.language ?? undefined,
        (message: string) => {
          emitProgress({
            step: 'diarizing',
            progress: 65,
            message,
          });
        }
      );

      console.log(`[PROCESSOR] Diarization done — ${speakerTurns.length} speaker turns`);
      emitProgress({
        step: 'diarizing',
        progress: 70,
        message: `Diarization complete — ${speakerTurns.length} speaker turns found`,
      });

      console.log(`[PROCESSOR] → Aligning segments`);
      emitProgress({
        step: 'aligning',
        progress: 80,
        message: `Aligning ${whisperSegments.length} segments with speaker turns...`,
      });

      segments = align(whisperSegments, speakerTurns);

      console.log(`[PROCESSOR] Alignment done — ${segments.length} merged segments`);
      emitProgress({
        step: 'aligning',
        progress: 85,
        message: `Alignment complete — ${segments.length} merged segments`,
      });
    }

    console.log(`[PROCESSOR] → Saving to database`);
    emitProgress({
      step: 'saving',
      progress: 90,
      message: 'Saving to database...',
    });

    db.prepare(
      'UPDATE transcripts SET status = ?, segments = ?, updated_at = ? WHERE id = ?'
    ).run(
      'done',
      JSON.stringify(segments),
      new Date().toISOString(),
      transcriptId
    );

    emitProgress({
      step: 'saving',
      progress: 95,
      message: 'Saved successfully.',
    });

    console.log(`[PROCESSOR] ✓ Job complete: ${transcriptId}`);
    emitProgress({
      step: 'done',
      progress: 100,
      message: 'Processing complete!',
      transcriptId,
    });
  } catch (err) {
    const errorMessage = String(err instanceof Error ? err.message : err);
    console.error(`[PROCESSOR] ✗ Job failed: ${transcriptId} — ${errorMessage}`);

    try {
      db.prepare(
        'UPDATE transcripts SET status = ?, error_message = ?, updated_at = ? WHERE id = ?'
      ).run('error', errorMessage, new Date().toISOString(), transcriptId);
    } catch (dbErr) {
      console.error('Failed to update error status in DB:', dbErr);
    }

    emitProgress({
      step: 'error',
      progress: 0,
      message: errorMessage,
      error: errorMessage,
    });

    throw err;
  }
}
