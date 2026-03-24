import { spawn } from 'child_process';
import path from 'path';
import { SpeakerTurn } from './diarize';

export async function diarizeWithPyannote(
  filePath: string,
  numSpeakers: number,
  onProgress?: (message: string) => void
): Promise<SpeakerTurn[]> {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'diarize_pyannote.py');

  const log = (msg: string) => {
    console.log(`[PYANNOTE] ${msg}`);
    onProgress?.(msg);
  };

  log(`Running diarization on: ${filePath}`);
  log(`Expected speakers: ${numSpeakers}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, filePath, String(numSpeakers)], {
      env: process.env,
    });

    let stdout = '';
    let settled = false;

    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) log(line);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        done(() => reject(new Error(`pyannote script exited with code ${code}`)));
        return;
      }
      try {
        const turns = JSON.parse(stdout.trim()) as SpeakerTurn[];
        log(`Found ${turns.length} speaker turns`);
        done(() => resolve(turns));
      } catch (err) {
        done(() => reject(new Error(`Failed to parse pyannote output: ${String(err)}`)));
      }
    });

    proc.on('error', (err) => {
      done(() => reject(new Error(`Failed to spawn pyannote script: ${err.message}`)));
    });
  });
}
