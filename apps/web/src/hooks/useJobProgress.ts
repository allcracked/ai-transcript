import { useState, useEffect, useRef } from 'react';

export type ProgressStep =
  | 'uploading'
  | 'transcribing'
  | 'diarizing'
  | 'aligning'
  | 'saving'
  | 'done'
  | 'error';

export interface ProgressState {
  step: ProgressStep | null;
  progress: number;
  message: string;
  logs: string[];
  done: boolean;
  error: string | null;
  transcriptId: string | null;
}

export function useJobProgress(jobId: string | null): ProgressState {
  const [state, setState] = useState<ProgressState>({
    step: null,
    progress: 0,
    message: '',
    logs: [],
    done: false,
    error: null,
    transcriptId: null,
  });

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setState({
      step: null,
      progress: 0,
      message: 'Connecting...',
      logs: [],
      done: false,
      error: null,
      transcriptId: null,
    });

    const es = new EventSource(`/api/jobs/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          step: ProgressStep;
          progress: number;
          message: string;
          transcriptId?: string;
          error?: string;
        };

        setState((prev) => ({
          ...prev,
          step: data.step,
          progress: data.progress,
          message: data.message,
          logs: data.message ? [...prev.logs, `[${data.step.toUpperCase()}] ${data.message}`] : prev.logs,
          done: data.step === 'done',
          error: data.step === 'error' ? (data.error || data.message) : null,
          transcriptId: data.transcriptId || prev.transcriptId,
        }));

        if (data.step === 'done' || data.step === 'error') {
          es.close();
          esRef.current = null;
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    es.onerror = () => {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: 'Connection lost. Please try again.',
        done: false,
      }));
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId]);

  return state;
}
