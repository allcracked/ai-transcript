import { useState, useEffect, useRef } from 'react';
import { ProgressStep } from './useJobProgress';

export interface CallState {
  status: 'waiting' | 'processing' | 'done' | 'error';
  transcriptId: string | null;
  step: ProgressStep | null;
  message: string;
}

export interface BatchProgressState {
  callStates: CallState[];
  currentCallIndex: number;
  overallProgress: number;
  message: string;
  logs: string[];
  done: boolean;
  error: string | null;
  batchId: string | null;
}

export function useBatchProgress(batchId: string | null, callCount: number): BatchProgressState {
  const [state, setState] = useState<BatchProgressState>({
    callStates: Array.from({ length: callCount }, () => ({
      status: 'waiting',
      transcriptId: null,
      step: null,
      message: '',
    })),
    currentCallIndex: 0,
    overallProgress: 0,
    message: 'Connecting…',
    logs: [],
    done: false,
    error: null,
    batchId: null,
  });

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!batchId) return;

    setState({
      callStates: Array.from({ length: callCount }, () => ({
        status: 'waiting',
        transcriptId: null,
        step: null,
        message: '',
      })),
      currentCallIndex: 0,
      overallProgress: 0,
      message: 'Connecting…',
      logs: [],
      done: false,
      error: null,
      batchId: null,
    });

    const es = new EventSource(`/api/batches/${batchId}/progress`);
    esRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          step: ProgressStep;
          progress: number;
          message: string;
          callIndex?: number;
          callCount?: number;
          transcriptId?: string;
          batchDone?: boolean;
          batchId?: string;
          error?: string;
        };

        setState((prev) => {
          const callIdx = data.callIndex ?? prev.currentCallIndex;
          const newCallStates = [...prev.callStates];

          if (data.step === 'error') {
            if (newCallStates[callIdx]) {
              newCallStates[callIdx] = {
                ...newCallStates[callIdx],
                status: 'error',
                step: 'error',
                message: data.error || data.message,
              };
            }
            return {
              ...prev,
              callStates: newCallStates,
              overallProgress: data.progress,
              message: data.message,
              logs: [...prev.logs, `[ERROR] ${data.message}`],
              error: data.error || data.message,
              done: false,
            };
          }

          if (data.batchDone) {
            return {
              ...prev,
              overallProgress: 100,
              message: data.message,
              logs: [...prev.logs, `[DONE] ${data.message}`],
              done: true,
              batchId: data.batchId ?? null,
            };
          }

          // A call just completed (step=done with transcriptId but not batchDone)
          if (data.step === 'done' && data.transcriptId && !data.batchDone) {
            if (newCallStates[callIdx]) {
              newCallStates[callIdx] = {
                status: 'done',
                transcriptId: data.transcriptId,
                step: 'done',
                message: data.message,
              };
            }
            return {
              ...prev,
              callStates: newCallStates,
              currentCallIndex: callIdx + 1,
              overallProgress: data.progress,
              message: data.message,
              logs: [...prev.logs, `[DONE] Call ${callIdx + 1}: ${data.message}`],
            };
          }

          // Ongoing progress for a call
          if (newCallStates[callIdx]) {
            newCallStates[callIdx] = {
              ...newCallStates[callIdx],
              status: 'processing',
              step: data.step,
              message: data.message,
            };
          }

          return {
            ...prev,
            callStates: newCallStates,
            currentCallIndex: callIdx,
            overallProgress: data.progress,
            message: data.message,
            logs: data.message
              ? [...prev.logs, `[${data.step.toUpperCase()}] Call ${callIdx + 1}: ${data.message}`]
              : prev.logs,
          };
        });

        if (data.batchDone || data.step === 'error') {
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
  }, [batchId, callCount]);

  return state;
}
