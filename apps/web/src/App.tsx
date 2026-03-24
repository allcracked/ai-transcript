import { useState } from 'react';
import { Mic, LogOut } from 'lucide-react';
import { authClient } from './lib/auth-client';
import { LoginPage } from './components/LoginPage';
import { UploadForm } from './components/UploadForm';
import { ProcessingStatus } from './components/ProcessingStatus';
import { TranscriptView } from './components/TranscriptView';
import { HistoryList } from './components/HistoryList';
import { AdminPanel } from './components/AdminPanel';
import { api } from './lib/api';
import { cn } from './lib/utils';

type Tab = 'new' | 'history' | 'admin';
type View = 'upload' | 'processing' | 'transcript';

export default function App() {
  const { data: session, isPending } = authClient.useSession();

  const [tab, setTab] = useState<Tab>('new');
  const [view, setView] = useState<View>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Show a blank screen while session is loading to avoid flash
  if (isPending) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <svg className="h-7 w-7 animate-spin text-zinc-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!session) return <LoginPage />;

  const isAdmin = (session.user as { role?: string }).role === 'admin';

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

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30">
              <Mic className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Whisper For Calls</h1>
              <p className="text-xs text-zinc-500">AI-powered transcription & speaker diarization</p>
            </div>
          </div>

          {/* User info + sign out */}
          <div className="flex items-center gap-3">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            <span className="hidden sm:block text-sm text-zinc-400 max-w-[140px] truncate">
              {session.user.name || session.user.email}
            </span>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Tabs — hidden when viewing a transcript */}
        {view !== 'transcript' && (
          <div className="mb-6 flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 w-fit">
            {(['new', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize',
                  tab === t ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {t === 'new' ? 'New Transcript' : 'History'}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => setTab('admin')}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  tab === 'admin' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Admin
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          {tab === 'admin' && isAdmin ? (
            <AdminPanel />
          ) : tab === 'history' ? (
            <div className="space-y-2">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-100">History</h2>
                <p className="text-sm text-zinc-400 mt-1">View and manage your past transcripts.</p>
              </div>
              <HistoryList
                onView={handleViewFromHistory}
                onReprocess={handleReprocess}
                refreshTrigger={historyRefreshTrigger}
              />
            </div>
          ) : (
            <>
              {view === 'upload' && (
                <div className="space-y-2">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-zinc-100">New Transcript</h2>
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
                    <h2 className="text-lg font-semibold text-zinc-100">Processing…</h2>
                    <p className="text-sm text-zinc-400 mt-1">
                      This may take a few minutes depending on the audio length.
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
          )}
        </div>
      </main>
    </div>
  );
}
