import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Mic, LogOut } from 'lucide-react';
import { authClient } from './lib/auth-client';
import { LoginPage } from './components/LoginPage';
import { UploadForm } from './components/UploadForm';
import { ProcessingStatus } from './components/ProcessingStatus';
import { BatchProcessingStatus } from './components/BatchProcessingStatus';
import { BatchView } from './components/BatchView';
import { TranscriptView } from './components/TranscriptView';
import { HistoryList } from './components/HistoryList';
import { AdminPanel } from './components/AdminPanel';
import { RubricsPage } from './components/RubricsPage';
import { api } from './lib/api';
import { cn } from './lib/utils';

// ── Layout ────────────────────────────────────────────────────────────────────

function AppLayout() {
  const { data: session } = authClient.useSession();
  const location = useLocation();
  const isAdmin = (session?.user as { role?: string })?.role === 'admin';

  // Hide tabs on transcript, processing, and batch pages
  const hideTabs =
    location.pathname.startsWith('/transcript/') ||
    location.pathname.startsWith('/processing/') ||
    location.pathname.startsWith('/batch/');

  const handleSignOut = () => authClient.signOut();

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
              <h1 className="text-lg font-semibold text-zinc-100">Audio Transcription Tool</h1>
              <p className="text-xs text-zinc-500">AI-powered transcription & speaker diarization</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session?.user.image && (
              <img src={session.user.image} alt="" className="h-7 w-7 rounded-full" />
            )}
            <span className="hidden sm:block text-sm text-zinc-400 max-w-[140px] truncate">
              {session?.user.name || session?.user.email}
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

      {/* Main */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        {!hideTabs && (
          <div className="mb-6 flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 w-fit">
            {[
              { to: '/new', label: 'New Transcript' },
              { to: '/history', label: 'History' },
              { to: '/rubrics', label: 'Rubrics' },
              ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function NewTranscriptPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">New Transcript</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Upload one audio file, or up to 5 for a callback batch.
        </p>
      </div>
      <UploadForm
        onJobStarted={(id) => navigate(`/processing/${id}`)}
        onBatchStarted={(id) => navigate(`/batch/${id}/processing`)}
      />
    </div>
  );
}

function ProcessingPage() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">Processing…</h2>
        <p className="text-sm text-zinc-400 mt-1">
          This may take a few minutes depending on the audio length.
        </p>
      </div>
      <ProcessingStatus
        jobId={jobId!}
        onComplete={(id) => navigate(`/transcript/${id}`, { replace: true })}
        onError={() => navigate('/new', { replace: true })}
      />
    </div>
  );
}

function BatchProcessingPage() {
  const navigate = useNavigate();
  const { batchId } = useParams<{ batchId: string }>();
  // We store filenames in sessionStorage so the processing screen can show them
  const [filenames] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`batch-filenames-${batchId}`) || '[]') as string[];
    } catch {
      return [];
    }
  });

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">Processing Batch…</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Calls are being processed one at a time. This may take several minutes.
        </p>
      </div>
      <BatchProcessingStatus
        batchId={batchId!}
        filenames={filenames}
        onComplete={(id) => navigate(`/batch/${id}`, { replace: true })}
        onError={() => navigate('/new', { replace: true })}
      />
    </div>
  );
}

function BatchViewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  return (
    <div className="space-y-2">
      <BatchView batchId={batchId!} />
    </div>
  );
}

function HistoryPage() {
  const navigate = useNavigate();

  const handleReprocess = async (id: string) => {
    try {
      const { id: newId } = await api.reprocess(id);
      navigate(`/processing/${newId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start reprocessing');
    }
  };

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">History</h2>
        <p className="text-sm text-zinc-400 mt-1">View and manage your past transcripts.</p>
      </div>
      <HistoryList
        onView={(id) => navigate(`/transcript/${id}`)}
        onReprocess={handleReprocess}
      />
    </div>
  );
}

function AdminPage() {
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string })?.role === 'admin';

  if (!isAdmin) return <Navigate to="/new" replace />;
  return <AdminPanel />;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { data: session, isPending } = authClient.useSession();

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

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/new" replace />} />
        <Route path="/new" element={<NewTranscriptPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/processing/:jobId" element={<ProcessingPage />} />
        <Route path="/batch/:batchId/processing" element={<BatchProcessingPage />} />
        <Route path="/batch/:batchId" element={<BatchViewPage />} />
        <Route path="/transcript/:id" element={<TranscriptView />} />
        <Route path="/rubrics" element={<RubricsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/new" replace />} />
      </Route>
    </Routes>
  );
}
