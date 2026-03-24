import React, { useEffect, useRef } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { useJobProgress, ProgressStep } from '../hooks/useJobProgress';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface ProcessingStatusProps {
  jobId: string;
  onComplete: (transcriptId: string) => void;
  onError: () => void;
}

const STEPS: Array<{ key: ProgressStep; label: string }> = [
  { key: 'uploading', label: 'Upload' },
  { key: 'transcribing', label: 'Transcribe' },
  { key: 'diarizing', label: 'Diarize' },
  { key: 'aligning', label: 'Align' },
  { key: 'saving', label: 'Save' },
  { key: 'done', label: 'Done' },
];

const STEP_ORDER: ProgressStep[] = STEPS.map((s) => s.key);

function getStepStatus(stepKey: ProgressStep, currentStep: ProgressStep | null) {
  if (!currentStep) return 'pending';
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepKey);
  if (currentStep === 'done') return 'done';
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

export function ProcessingStatus({ jobId, onComplete, onError }: ProcessingStatusProps) {
  const progress = useJobProgress(jobId);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progress.done && progress.transcriptId) {
      const timer = setTimeout(() => {
        onComplete(progress.transcriptId!);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [progress.done, progress.transcriptId, onComplete]);

  // Auto-scroll log to bottom on new entries
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress.logs]);

  const hasError = progress.step === 'error';

  return (
    <div className="space-y-8">
      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key, progress.step);
          const isLast = idx === STEPS.length - 1;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
                    status === 'done'
                      ? 'border-green-500 bg-green-500/20 text-green-400'
                      : status === 'active'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-600',
                    hasError && status === 'active'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : ''
                  )}
                >
                  {status === 'done' ? (
                    <Check className="h-4 w-4" />
                  ) : status === 'active' && hasError ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : status === 'active' ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium">{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium',
                    status === 'done'
                      ? 'text-green-400'
                      : status === 'active'
                      ? hasError
                        ? 'text-red-400'
                        : 'text-blue-400'
                      : 'text-zinc-600'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'mb-5 h-px flex-1 mx-1 transition-all duration-500',
                    getStepStatus(step.key, progress.step) === 'done'
                      ? 'bg-green-500/50'
                      : 'bg-zinc-800'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{progress.message || 'Initializing...'}</span>
          <span className="font-medium text-zinc-300">{progress.progress}%</span>
        </div>
        <Progress
          value={progress.progress}
          className={cn(hasError && '[&>div]:bg-red-500')}
        />
      </div>

      {/* Live command log */}
      {progress.logs.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="ml-2 text-xs text-zinc-500 font-mono">process output</span>
          </div>
          <div className="h-48 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
            {progress.logs.map((line, i) => {
              const isTranscribe = line.includes('[TRANSCRIBING]');
              const isError = line.includes('[ERROR]');
              const isDone = line.includes('[DONE]');
              return (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    isError ? 'text-red-400' :
                    isDone  ? 'text-green-400' :
                    isTranscribe ? 'text-yellow-300/80' :
                    'text-zinc-400'
                  )}
                >
                  <span className="text-zinc-600 select-none mr-2">{String(i + 1).padStart(3, '0')}</span>
                  {line}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="space-y-4">
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-medium text-red-400">Processing failed</p>
            <p className="mt-1 text-sm text-red-300/70">
              {progress.error || 'An unknown error occurred.'}
            </p>
          </div>
          <Button variant="outline" onClick={onError} className="w-full">
            Try Again
          </Button>
        </div>
      )}

      {/* Done state */}
      {progress.done && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-center">
          <p className="text-sm font-medium text-green-400">
            Processing complete! Loading transcript...
          </p>
        </div>
      )}
    </div>
  );
}
