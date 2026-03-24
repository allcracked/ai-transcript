import { useEffect, useState } from 'react';
import { RefreshCw, Eye, RotateCcw, Trash2, FileAudio } from 'lucide-react';
import { api, Transcript, TranscriptStatus } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface HistoryListProps {
  onView: (id: string) => void;
  onReprocess: (id: string) => void;
  refreshTrigger?: number;
}

function statusVariant(status: TranscriptStatus): 'secondary' | 'default' | 'success' | 'destructive' {
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
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTranscripts = () => {
    setLoading(true);
    setError(null);
    api
      .getTranscripts()
      .then(setTranscripts)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTranscripts();
  }, [refreshTrigger]);

  const handleDelete = async (transcript: Transcript) => {
    const confirmed = window.confirm(
      `Delete transcript for "${transcript.originalFilename}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(transcript.id);
    try {
      await api.deleteTranscript(transcript.id);
      setTranscripts((prev) => prev.filter((t) => t.id !== transcript.id));
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
        <Button variant="outline" size="sm" onClick={fetchTranscripts}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (transcripts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
        <FileAudio className="mx-auto h-10 w-10 text-zinc-700 mb-3" />
        <p className="text-zinc-400 font-medium">No transcripts yet</p>
        <p className="text-sm text-zinc-600 mt-1">
          Upload an audio file to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''}
        </p>
        <Button variant="ghost" size="sm" onClick={fetchTranscripts}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {transcripts.map((transcript) => (
          <div
            key={transcript.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <FileAudio className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100 truncate">
                    {transcript.originalFilename}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(transcript.status)}>
                      {transcript.status}
                    </Badge>
                    <span className="text-xs text-zinc-500">{transcript.model}</span>
                    <span className="text-xs text-zinc-600">
                      {transcript.mode === 'assemblyai' ? 'AssemblyAI' : transcript.mode === 'api' ? 'API (legacy)' : 'Local'}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {formatDate(transcript.createdAt)}
                    </span>
                  </div>
                  {transcript.status === 'error' && transcript.errorMessage && (
                    <p className="mt-1 text-xs text-red-400 truncate max-w-xs">
                      {transcript.errorMessage}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {transcript.status === 'done' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onView(transcript.id)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReprocess(transcript.id)}
                  title="Re-process"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(transcript)}
                  disabled={deletingId === transcript.id}
                  className={cn('text-zinc-500 hover:text-red-400 hover:bg-red-500/10')}
                  title="Delete"
                >
                  {deletingId === transcript.id ? (
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
        ))}
      </div>
    </div>
  );
}
