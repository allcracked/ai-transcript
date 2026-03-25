import { useEffect, useRef } from 'react';
import { Check, AlertCircle, Clock, FileAudio } from 'lucide-react';
import { useBatchProgress } from '../hooks/useBatchProgress';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface BatchProcessingStatusProps {
  batchId: string;
  filenames: string[];
  onComplete: (batchId: string) => void;
  onError: () => void;
}

export function BatchProcessingStatus({ batchId, filenames, onComplete, onError }: BatchProcessingStatusProps) {
  const progress = useBatchProgress(batchId, filenames.length);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progress.done && progress.batchId) {
      const timer = setTimeout(() => onComplete(progress.batchId!), 800);
      return () => clearTimeout(timer);
    }
  }, [progress.done, progress.batchId, onComplete]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress.logs]);

  const hasError = !!progress.error;

  return (
    <div className="space-y-6">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{progress.message || 'Initializing…'}</span>
          <span className="font-medium text-zinc-300">{progress.overallProgress}%</span>
        </div>
        <Progress
          value={progress.overallProgress}
          className={cn(hasError && '[&>div]:bg-red-500')}
        />
      </div>

      {/* Per-call status list */}
      <div className="space-y-2">
        {filenames.map((name, idx) => {
          const callState = progress.callStates[idx];
          const status = callState?.status ?? 'waiting';

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300',
                status === 'done'
                  ? 'border-green-500/30 bg-green-500/5'
                  : status === 'processing'
                  ? 'border-blue-500/40 bg-blue-500/8'
                  : status === 'error'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-zinc-800 bg-zinc-800/30'
              )}
            >
              {/* Status icon */}
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
                  status === 'done'
                    ? 'border-green-500 bg-green-500/20 text-green-400'
                    : status === 'processing'
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                    : status === 'error'
                    ? 'border-red-500 bg-red-500/20 text-red-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-600'
                )}
              >
                {status === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : status === 'processing' ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : status === 'error' ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
              </div>

              {/* Call info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      status === 'done' ? 'text-green-300' :
                      status === 'processing' ? 'text-zinc-100' :
                      status === 'error' ? 'text-red-300' :
                      'text-zinc-500'
                    )}
                  >
                    Call {idx + 1} — {name}
                  </span>
                </div>
                {callState?.message && status !== 'waiting' && (
                  <p className={cn(
                    'mt-0.5 text-xs truncate',
                    status === 'error' ? 'text-red-400' : 'text-zinc-500'
                  )}>
                    {callState.message}
                  </p>
                )}
              </div>

              {/* Step badge */}
              {status === 'processing' && callState?.step && (
                <span className="shrink-0 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300 capitalize">
                  {callState.step}
                </span>
              )}
            </div>
          );
        })}

        {/* Combined analysis step */}
        {progress.overallProgress >= 90 && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300',
              progress.done
                ? 'border-green-500/30 bg-green-500/5'
                : progress.overallProgress >= 90
                ? 'border-purple-500/40 bg-purple-500/8'
                : 'border-zinc-800 bg-zinc-800/30'
            )}
          >
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
                progress.done
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-purple-500 bg-purple-500/20 text-purple-400'
              )}
            >
              {progress.done ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className={cn(
                'text-sm font-medium',
                progress.done ? 'text-green-300' : 'text-zinc-200'
              )}>
                Combined Analysis
              </span>
              <p className="mt-0.5 text-xs text-zinc-500">
                {progress.done ? 'Complete' : 'Analyzing all calls together…'}
              </p>
            </div>
            {!progress.done && (
              <span className="shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
                analyzing
              </span>
            )}
          </div>
        )}
      </div>

      {/* Live log */}
      {progress.logs.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="ml-2 text-xs text-zinc-500 font-mono">process output</span>
          </div>
          <div className="h-40 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
            {progress.logs.map((line, i) => {
              const isError = line.includes('[ERROR]');
              const isDone = line.includes('[DONE]');
              return (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    isError ? 'text-red-400' : isDone ? 'text-green-400' : 'text-zinc-400'
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
            <p className="mt-1 text-sm text-red-300/70">{progress.error || 'An unknown error occurred.'}</p>
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
            All calls processed! Loading batch view…
          </p>
        </div>
      )}
    </div>
  );
}
