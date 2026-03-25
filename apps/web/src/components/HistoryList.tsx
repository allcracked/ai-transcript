import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Eye, RotateCcw, Trash2, FileAudio, Layers } from 'lucide-react';
import { api, Transcript, CallBatch, TranscriptStatus, BatchStatus } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface HistoryListProps {
  onView?: (id: string) => void;
  onReprocess: (id: string) => void;
  refreshTrigger?: number;
}

type HistoryEntry =
  | { kind: 'transcript'; data: Transcript }
  | { kind: 'batch'; data: CallBatch };

function transcriptStatusVariant(status: TranscriptStatus): 'secondary' | 'default' | 'success' | 'destructive' {
  switch (status) {
    case 'pending': return 'secondary';
    case 'processing': return 'default';
    case 'done': return 'success';
    case 'error': return 'destructive';
  }
}

function batchStatusVariant(status: BatchStatus): 'secondary' | 'default' | 'success' | 'destructive' {
  switch (status) {
    case 'pending': return 'secondary';
    case 'processing': return 'default';
    case 'done': return 'success';
    case 'error': return 'destructive';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryList({ onView, onReprocess, refreshTrigger }: HistoryListProps) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.getTranscripts(), api.getBatches()])
      .then(([transcripts, batches]) => {
        const merged: HistoryEntry[] = [
          ...transcripts.map((t): HistoryEntry => ({ kind: 'transcript', data: t })),
          ...batches.map((b): HistoryEntry => ({ kind: 'batch', data: b })),
        ];
        // Sort descending by creation date
        merged.sort((a, b) => {
          const da = a.kind === 'transcript' ? a.data.createdAt : a.data.createdAt;
          const db_ = b.kind === 'transcript' ? b.data.createdAt : b.data.createdAt;
          return new Date(db_).getTime() - new Date(da).getTime();
        });
        setEntries(merged);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteBatch = async (batch: CallBatch) => {
    const confirmed = window.confirm(
      `Delete batch "${batch.name ?? 'Call Batch'}" and all its recordings? This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(batch.id);
    try {
      await api.deleteBatch(batch.id);
      setEntries((prev) => prev.filter((e) => !(e.kind === 'batch' && e.data.id === batch.id)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprocessBatch = async (batch: CallBatch) => {
    try {
      const { id } = await api.reprocessBatch(batch.id);
      navigate(`/batch/${id}/processing`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start reprocessing');
    }
  };

  const handleDeleteTranscript = async (transcript: Transcript) => {
    const confirmed = window.confirm(
      `Delete transcript for "${transcript.originalFilename}"? This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(transcript.id);
    try {
      await api.deleteTranscript(transcript.id);
      setEntries((prev) => prev.filter((e) => !(e.kind === 'transcript' && e.data.id === transcript.id)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transcript');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="h-8 w-8 animate-spin text-zinc-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
        <FileAudio className="mx-auto h-10 w-10 text-zinc-700 mb-3" />
        <p className="text-zinc-400 font-medium">No transcripts yet</p>
        <p className="text-sm text-zinc-600 mt-1">Upload an audio file to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{entries.length} item{entries.length !== 1 ? 's' : ''}</p>
        <Button variant="ghost" size="sm" onClick={fetchAll}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => {
          if (entry.kind === 'transcript') {
            const t = entry.data;
            return (
              <div
                key={`transcript-${t.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileAudio className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100 truncate">{t.originalFilename}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={transcriptStatusVariant(t.status)}>{t.status}</Badge>
                        <span className="text-xs text-zinc-500">{t.model}</span>
                        <span className="text-xs text-zinc-600">
                          {t.mode === 'assemblyai' ? 'AssemblyAI' : t.mode === 'api' ? 'API (legacy)' : 'Local'}
                        </span>
                        <span className="text-xs text-zinc-600">{formatDate(t.createdAt)}</span>
                        {t.uploaderName && (
                          <span className="text-xs text-zinc-600">· {t.uploaderName}</span>
                        )}
                      </div>
                      {t.status === 'error' && t.errorMessage && (
                        <p className="mt-1 text-xs text-red-400 truncate max-w-xs">{t.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {t.status === 'done' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { onView?.(t.id); navigate(`/transcript/${t.id}`); }}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onReprocess(t.id)} title="Re-process">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTranscript(t)}
                      disabled={deletingId === t.id}
                      className={cn('text-zinc-500 hover:text-red-400 hover:bg-red-500/10')}
                      title="Delete"
                    >
                      {deletingId === t.id ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          // Batch entry
          const b = entry.data;
          const callCount = b.transcripts?.length;
          return (
            <div
              key={`batch-${b.id}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Layers className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-400" />
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-100 truncate">
                      {b.name ?? 'Call Batch'}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant={batchStatusVariant(b.status)}>{b.status}</Badge>
                      <span className="text-xs text-zinc-500">
                        {callCount != null ? `${callCount} call${callCount !== 1 ? 's' : ''}` : 'batch'}
                      </span>
                      {b.model && (
                        <span className="text-xs text-zinc-500">{b.model}</span>
                      )}
                      {b.uploaderName && (
                        <span className="text-xs text-zinc-600">· {b.uploaderName}</span>
                      )}
                      <span className="text-xs text-zinc-600">{formatDate(b.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {b.status === 'done' && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/batch/${b.id}`)}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleReprocessBatch(b)} title="Re-process">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteBatch(b)}
                    disabled={deletingId === b.id}
                    className={cn('text-zinc-500 hover:text-red-400 hover:bg-red-500/10')}
                    title="Delete"
                  >
                    {deletingId === b.id ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
