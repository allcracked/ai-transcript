import { useState } from 'react';
import { Mic } from 'lucide-react';
import { UploadForm } from './components/UploadForm';
import { ProcessingStatus } from './components/ProcessingStatus';
import { TranscriptView } from './components/TranscriptView';
import { HistoryList } from './components/HistoryList';
import { api } from './lib/api';
import { cn } from './lib/utils';

type Tab = 'new' | 'history';
type View = 'upload' | 'processing' | 'transcript';

export default function App() {
  const [tab, setTab] = useState<Tab>('new');
  const [view, setView] = useState<View>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleJobStarted = (id: string) => {
    setJobId(id);
    setView('processing');
  };

  const handleProcessingComplete = (id: string) => {
    setTranscriptId(id);
    setView('transcript');
    setHistoryRefreshTrigger((n) => n + 1);
  };

  const handleProcessingError = () => {
    setView('upload');
    setJobId(null);
  };

  const handleViewFromHistory = (id: string) => {
    setTranscriptId(id);
    setView('transcript');
    setTab('new');
  };

  const handleReprocess = async (id: string) => {
    try {
      const { id: newId } = await api.reprocess(id);
      setJobId(newId);
      setView('processing');
      setTab('new');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start reprocessing');
    }
  };

  const handleBackFromTranscript = () => {
    setView('upload');
    setTranscriptId(null);
    setJobId(null);
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30">
              <Mic className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                Whisper For Calls
              </h1>
              <p className="text-xs text-zinc-500">
                AI-powered transcription & speaker diarization
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Tabs - only show when not in transcript view */}
        {view !== 'transcript' && (
          <div className="mb-6 flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 w-fit">
            <button
              onClick={() => {
                setTab('new');
              }}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                tab === 'new'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              New Transcript
            </button>
            <button
              onClick={() => setTab('history')}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                tab === 'history'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              History
            </button>
          </div>
        )}

        {/* Content */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          {tab === 'new' ? (
            <>
              {view === 'upload' && (
                <div className="space-y-2">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-zinc-100">
                      New Transcript
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                      Upload an audio recording to transcribe and identify speakers.
                    </p>
                  </div>
                  <UploadForm onJobStarted={handleJobStarted} />
                </div>
              )}

              {view === 'processing' && jobId && (
                <div className="space-y-2">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-zinc-100">
                      Processing...
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                      This may take a few minutes depending on the audio length and model.
                    </p>
                  </div>
                  <ProcessingStatus
                    jobId={jobId}
                    onComplete={handleProcessingComplete}
                    onError={handleProcessingError}
                  />
                </div>
              )}

              {view === 'transcript' && transcriptId && (
                <TranscriptView
                  transcriptId={transcriptId}
                  onBack={handleBackFromTranscript}
                />
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-100">History</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  View and manage your past transcripts.
                </p>
              </div>
              <HistoryList
                onView={handleViewFromHistory}
                onReprocess={handleReprocess}
                refreshTrigger={historyRefreshTrigger}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
