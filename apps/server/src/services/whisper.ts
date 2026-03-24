import OpenAI from 'openai';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export async function transcribeWithApi(
  filePath: string,
  language?: string
): Promise<WhisperSegment[]> {
  console.log(`[WHISPER:API] Transcribing: ${filePath}`);
  console.log(`[WHISPER:API] Language: ${language || 'auto-detect'}`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const fileStream = fs.createReadStream(filePath);
  const originalName = path.basename(filePath);

  type VerboseJsonParams = {
    file: ReturnType<typeof fs.createReadStream>;
    model: string;
    response_format: 'verbose_json';
    timestamp_granularities: Array<'segment'>;
    language?: string;
  };

  const params: VerboseJsonParams = {
    file: fileStream,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  };

  if (language && language !== 'auto') {
    params.language = language;
  }

  console.log(`[WHISPER:API] Sending request to OpenAI whisper-1...`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.audio.transcriptions as any).create(params);
  console.log(`[WHISPER:API] Response received`);

  const verboseResponse = response as unknown as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  if (!verboseResponse.segments || verboseResponse.segments.length === 0) {
    console.warn(`[WHISPER:API] No segments returned`);
    return [];
  }

  console.log(`[WHISPER:API] Got ${verboseResponse.segments.length} segments`);
  return verboseResponse.segments.map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));
}

export async function transcribeLocally(
  filePath: string,
  model: string,
  language?: string,
  onProgress?: (line: string) => void
): Promise<WhisperSegment[]> {
  const outputDir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  const args: string[] = [
    filePath,
    '--model', model,
    '--output_format', 'json',
    '--task', 'transcribe',
    '--output_dir', outputDir,
  ];

  if (language && language !== 'auto') {
    args.push('--language', language);
  }

  console.log(`[WHISPER:LOCAL] Spawning: whisper ${args.join(' ')}`);
  console.log(`[WHISPER:LOCAL] Output dir: ${outputDir}`);
  console.log(`[WHISPER:LOCAL] Expected JSON: ${path.join(outputDir, `${baseName}.json`)}`);

  return new Promise<WhisperSegment[]>((resolve, reject) => {
    const proc = spawn('whisper', args);
    let settled = false;

    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        fn();
      }
    };

    // Kill the process if it runs for more than 30 minutes
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      done(() => reject(new Error('Whisper process timed out after 30 minutes')));
    }, 30 * 60 * 1000);

    proc.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        console.log(`[WHISPER:LOCAL] ${line}`);
        onProgress?.(line);
      }
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        console.log(`[WHISPER:LOCAL] ${line}`);
        onProgress?.(line);
      }
    });

    proc.on('close', (code) => {
      console.log(`[WHISPER:LOCAL] Process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        done(() => reject(new Error(`Whisper CLI exited with code ${code}`)));
        return;
      }

      const jsonPath = path.join(outputDir, `${baseName}.json`);

      if (!fs.existsSync(jsonPath)) {
        done(() => reject(new Error(`Whisper output file not found: ${jsonPath}`)));
        return;
      }

      try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as {
          segments: Array<{ start: number; end: number; text: string }>;
        };

        fs.unlinkSync(jsonPath);

        const segments: WhisperSegment[] = (parsed.segments || []).map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        }));

        console.log(`[WHISPER:LOCAL] Parsed ${segments.length} segments from JSON output`);
        done(() => resolve(segments));
      } catch (err) {
        done(() => reject(new Error(`Failed to parse Whisper output: ${String(err)}`)));
      }
    });

    proc.on('error', (err) => {
      done(() => reject(new Error(`Failed to spawn whisper process: ${err.message}`)));
    });
  });
}
