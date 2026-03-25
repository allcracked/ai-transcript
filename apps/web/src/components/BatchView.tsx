import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Download, Check, Play, Pause, RotateCcw,
  Sparkles, RefreshCw, Calendar, Wrench, UserCheck,
  CheckCircle2, XCircle, HelpCircle, X, ChevronDown,
} from 'lucide-react';
import { api, CallBatch, CallBrief, Rubric, Segment } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const SPEAKER_COLORS = [
  'text-blue-400 border-blue-500/30 bg-blue-500/10',
  'text-purple-400 border-purple-500/30 bg-purple-500/10',
  'text-green-400 border-green-500/30 bg-green-500/10',
  'text-orange-400 border-orange-500/30 bg-orange-500/10',
  'text-pink-400 border-pink-500/30 bg-pink-500/10',
  'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
];

function speakerColor(speaker: string): string {
  const l = speaker.toLowerCase();
  if (l.includes('_a') || l.includes('_0')) return SPEAKER_COLORS[0];
  if (l.includes('_b') || l.includes('_1')) return SPEAKER_COLORS[1];
  if (l.includes('_c') || l.includes('_2')) return SPEAKER_COLORS[2];
  if (l.includes('_d') || l.includes('_3')) return SPEAKER_COLORS[3];
  if (l.includes('_e') || l.includes('_4')) return SPEAKER_COLORS[4];
  if (l.includes('_f') || l.includes('_5')) return SPEAKER_COLORS[5];
  const hash = speaker.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
}

function batchToText(batch: CallBatch): string {
  return (batch.transcripts ?? [])
    .map((t, i) => {
      const header = `=== Call ${i + 1}: ${t.originalFilename} ===`;
      const body = (t.segments ?? [])
        .map((s) => `[${formatTimestamp(s.start)} → ${formatTimestamp(s.end)}] [${s.speaker}]\n${s.text}`)
        .join('\n\n');
      return `${header}\n\n${body}`;
    })
    .join('\n\n\n');
}

// ── BriefField — identical to TranscriptView's ────────────────────────────────

function BriefField({
  icon, label, value, timestamp, hasAudio, onSeek,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  timestamp: number | null;
  hasAudio: boolean;
  onSeek: (t: number) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-zinc-200">{value}</p>
        {timestamp !== null && hasAudio && (
          <button
            onClick={() => onSeek(timestamp)}
            className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Play className="h-2.5 w-2.5" />
            {formatTimestamp(timestamp)}
          </button>
        )}
      </div>
    </div>
  );
}

function AppointmentIcon({ value }: { value: boolean | null }) {
  if (value === true) return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (value === false) return <XCircle className="h-4 w-4 text-red-400" />;
  return <HelpCircle className="h-4 w-4 text-zinc-500" />;
}

// ── Main ───────────────────────────────────────────────────────────────────────

interface FlatSegment { callIdx: number; seg: Segment; }

export function BatchView({ batchId }: { batchId: string }) {
  const navigate = useNavigate();

  const [batch, setBatch] = useState<CallBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Audio
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeCallIdx, setActiveCallIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const pendingSeekRef = useRef<number | null>(null);

  // Brief
  const [brief, setBrief] = useState<CallBrief | null>(null);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rubric
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [rubricResult, setRubricResult] = useState<string | null>(null);
  const [rubricStatus, setRubricStatus] = useState<string | null>(null);
  const rubricPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [briefSectionOpen, setBriefSectionOpen] = useState(true);
  const [analysisSectionOpen, setAnalysisSectionOpen] = useState(true);

  // Layout
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(56);
  const [autoScroll, setAutoScroll] = useState(true);
  const isAutoScrollingRef = useRef(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Load batch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    api.getBatch(batchId)
      .then((b) => {
        setBatch(b);
        setBrief(b.brief);
        setBriefStatus(b.briefStatus);
        if (b.brief || b.rubricResult) setAiPanelOpen(true);
        setRubricResult(b.rubricResult);
        setRubricStatus(b.rubricStatus);
        if (b.rubricId) setSelectedRubricId(b.rubricId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load batch'))
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => { api.getRubrics().then(setRubrics).catch(() => {}); }, []);

  // ── Brief polling ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (briefStatus === 'processing' || briefStatus === 'pending') {
      briefPollRef.current = setInterval(async () => {
        try {
          const b = await api.getBatch(batchId);
          setBrief(b.brief);
          setBriefStatus(b.briefStatus);
          if (b.briefStatus !== 'processing' && b.briefStatus !== 'pending') {
            clearInterval(briefPollRef.current!);
            if (b.brief) setAiPanelOpen(true);
          }
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => { if (briefPollRef.current) clearInterval(briefPollRef.current); };
  }, [briefStatus, batchId]);

  // ── Rubric polling ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (rubricStatus === 'processing' || rubricStatus === 'pending') {
      rubricPollRef.current = setInterval(async () => {
        try {
          const b = await api.getBatch(batchId);
          setRubricResult(b.rubricResult);
          setRubricStatus(b.rubricStatus);
          if (b.rubricStatus !== 'processing' && b.rubricStatus !== 'pending') {
            clearInterval(rubricPollRef.current!);
            if (b.rubricResult) setAiPanelOpen(true);
          }
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => { if (rubricPollRef.current) clearInterval(rubricPollRef.current); };
  }, [rubricStatus, batchId]);

  // ── Bottom bar height ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!bottomBarRef.current) return;
    const obs = new ResizeObserver(() => setBottomBarHeight(bottomBarRef.current?.offsetHeight ?? 56));
    obs.observe(bottomBarRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleScroll = () => { if (!isAutoScrollingRef.current) setAutoScroll(false); };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Flat segment list ───────────────────────────────────────────────────────

  const flatSegments = useMemo<FlatSegment[]>(() => {
    if (!batch?.transcripts) return [];
    return batch.transcripts.flatMap((t, callIdx) =>
      (t.segments ?? []).map((seg) => ({ callIdx, seg }))
    );
  }, [batch?.transcripts]);

  const activeGlobalIdx = useMemo(() => {
    let result = -1;
    for (let i = 0; i < flatSegments.length; i++) {
      const { callIdx, seg } = flatSegments[i];
      if (callIdx === activeCallIdx && seg.start <= currentTime) result = i;
    }
    return result;
  }, [flatSegments, activeCallIdx, currentTime]);

  useEffect(() => {
    if (!autoScroll || activeGlobalIdx < 0) return;
    const el = segmentRefs.current[activeGlobalIdx];
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    return () => clearTimeout(t);
  }, [activeGlobalIdx, autoScroll]);

  // ── Audio ───────────────────────────────────────────────────────────────────

  const activeAudioUrl = batch?.transcripts?.[activeCallIdx]?.audioUrl ?? null;
  const hasAudio = !!activeAudioUrl && !audioError;

  useEffect(() => {
    setCurrentTime(0); setDuration(0); setIsPlaying(false); setAudioError(false);
  }, [activeCallIdx]);

  const handleAudioLoaded = () => {
    setDuration(audioRef.current?.duration ?? 0);
    if (pendingSeekRef.current !== null && audioRef.current) {
      audioRef.current.currentTime = pendingSeekRef.current;
      audioRef.current.play().catch(() => {});
      pendingSeekRef.current = null;
    }
  };

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause(); else audioRef.current.play();
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const handleSegmentClick = useCallback((callIdx: number, start: number) => {
    if (callIdx !== activeCallIdx) {
      pendingSeekRef.current = start;
      setActiveCallIdx(callIdx);
      setAutoScroll(true);
    } else if (audioRef.current) {
      audioRef.current.currentTime = start;
      setCurrentTime(start);
      setAutoScroll(true);
      audioRef.current.play().catch(() => {});
    }
  }, [activeCallIdx]);

  // Brief seek — seeks within the currently active call's audio
  const handleBriefSeek = useCallback((t: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    setCurrentTime(t);
    setAutoScroll(true);
    audioRef.current.play().catch(() => {});
  }, []);

  // ── Brief actions ───────────────────────────────────────────────────────────

  const handleGenerateBrief = useCallback(async () => {
    setBriefStatus('processing');
    try { await api.generateBatchBrief(batchId); } catch { setBriefStatus('error'); }
  }, [batchId]);

  // ── Rubric actions ──────────────────────────────────────────────────────────

  const handleRunRubric = useCallback(async (rid: string) => {
    setRubricStatus('processing');
    setSelectedRubricId(rid);
    try { await api.runBatchRubricAnalysis(batchId, rid); } catch { setRubricStatus('error'); }
  }, [batchId]);

  // ── Copy / Download ─────────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!batch) return;
    await navigator.clipboard.writeText(batchToText(batch));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!batch) return;
    const blob = new Blob([batchToText(batch)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_${batchId}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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

  if (error || !batch) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error ?? 'Batch not found.'}
        </div>
        <Button variant="outline" onClick={() => navigate('/history')}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back
        </Button>
      </div>
    );
  }

  const transcripts = batch.transcripts ?? [];

  return (
    <>
      {activeAudioUrl && (
        <audio
          key={activeAudioUrl}
          ref={audioRef}
          src={activeAudioUrl}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={handleAudioLoaded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => setAudioError(true)}
        />
      )}

      <div className="space-y-4" style={{
        ...(hasAudio ? { paddingBottom: bottomBarHeight + 16 } : {}),
        ...(aiPanelOpen ? { paddingRight: '320px' } : {}),
      }}>

        {/* ── Sticky toolbar ── */}
        <div className="sticky top-[69px] z-[9] -mx-6 px-6 pt-4 pb-4 bg-zinc-900 border-b border-zinc-800/80 space-y-3">
          {/* Row 1: back + title + badges */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="flex-shrink-0 -ml-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="font-semibold text-zinc-100 truncate">{batch.name ?? 'Call Batch'}</h2>
                <p className="text-xs text-zinc-500">
                  {batch.uploaderName && (
                    <span className="text-zinc-400">{batch.uploaderName} · </span>
                  )}
                  {transcripts.length} call{transcripts.length !== 1 ? 's' : ''} · {new Date(batch.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            {batch.model && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="secondary">AssemblyAI</Badge>
                <Badge variant="outline">{batch.model}</Badge>
              </div>
            )}
          </div>

          {/* Row 2: action buttons */}
          {flatSegments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <><Check className="mr-1.5 h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy All</>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />Download
              </Button>
            </div>
          )}
        </div>

        {/* ── Transcript: all calls in one flow ── */}
        {flatSegments.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-zinc-500">
            No transcript segments available.
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {transcripts.map((t, callIdx) => {
              const segs = t.segments ?? [];
              if (segs.length === 0) return null;
              const globalStart = flatSegments.findIndex((fs) => fs.callIdx === callIdx);

              return (
                <div key={t.id}>
                  <div className="flex items-center gap-3 py-2 mb-1">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="flex-shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-0.5 text-xs font-semibold text-zinc-400">
                      Call {callIdx + 1} — {t.originalFilename}
                    </span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                  <div className="space-y-3">
                    {segs.map((seg, segIdx) => {
                      const gIdx = globalStart + segIdx;
                      const isActive = hasAudio && activeCallIdx === callIdx && gIdx === activeGlobalIdx;
                      return (
                        <div
                          key={segIdx}
                          ref={(el) => { segmentRefs.current[gIdx] = el; }}
                          className={cn(
                            'rounded-xl border p-4 space-y-2 transition-colors duration-150',
                            isActive ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              onClick={() => handleSegmentClick(callIdx, seg.start)}
                              className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer', speakerColor(seg.speaker))}
                            >
                              {seg.speaker}
                            </span>
                            <span
                              onClick={() => handleSegmentClick(callIdx, seg.start)}
                              className="text-xs text-zinc-300 font-mono bg-zinc-800 px-2 py-0.5 rounded-md cursor-pointer"
                            >
                              {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                            </span>
                            {isActive && <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          </div>
                          <p
                            onClick={() => handleSegmentClick(callIdx, seg.start)}
                            className="text-sm leading-relaxed text-zinc-200 cursor-pointer"
                          >
                            {seg.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Fixed bottom bar ── */}
      {hasAudio && (
        <div ref={bottomBarRef} className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">

          {/* Player row */}
          <div className="px-4 py-3">
            <div className="mx-auto max-w-3xl space-y-2">
              {/* Call selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 flex-shrink-0">Listening to:</span>
                <select
                  value={activeCallIdx}
                  onChange={(e) => { setActiveCallIdx(Number(e.target.value)); setAutoScroll(true); }}
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  {transcripts.map((t, i) => (
                    <option key={t.id} value={i}>Call {i + 1} — {t.originalFilename}</option>
                  ))}
                </select>
              </div>
              {/* Seek + controls */}
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors">
                  {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white translate-x-px" />}
                </button>
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <span className="text-xs text-zinc-400 font-mono flex-shrink-0 w-10 text-right">{formatTimestamp(currentTime)}</span>
                  <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime} onChange={handleSeek}
                    className="flex-1 h-1.5 appearance-none rounded-full bg-zinc-700 accent-blue-500 cursor-pointer" />
                  <span className="text-xs text-zinc-500 font-mono flex-shrink-0 w-10">{formatTimestamp(duration)}</span>
                </div>
                <button
                  onClick={() => setAutoScroll(true)}
                  className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                    autoScroll ? 'text-zinc-600 pointer-events-none' : 'text-blue-400 hover:bg-blue-500/10 border border-blue-500/30')}
                >
                  <RotateCcw className="h-3 w-3" />Sync
                </button>
                {batch.status === 'done' && (
                  <button
                    onClick={() => setAiPanelOpen((v) => !v)}
                    className={cn('relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      aiPanelOpen
                        ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800')}
                  >
                    <Sparkles className="h-3 w-3" />
                    AI Insights
                    {((briefStatus === 'processing' || briefStatus === 'pending') || (rubricStatus === 'processing' || rubricStatus === 'pending')) && (
                      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Insights side panel ── */}
      {aiPanelOpen && (
        <div className="fixed right-0 top-[69px] bottom-0 z-40 w-80 flex flex-col bg-zinc-950 border-l border-t border-zinc-800 shadow-2xl shadow-black/40">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-zinc-100">AI Insights</span>
            </div>
            <button
              onClick={() => setAiPanelOpen(false)}
              className="rounded-md p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto pb-20">

            {/* ── Brief section ── */}
            {batch && batch.status === 'done' && (
              <div className="border-b border-zinc-800">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900/60 transition-colors"
                  onClick={() => setBriefSectionOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-zinc-400" />
                    Call Brief
                    {(briefStatus === 'processing' || briefStatus === 'pending') && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </div>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-500 transition-transform duration-150', briefSectionOpen ? '' : '-rotate-90')} />
                </button>
                {briefSectionOpen && (
                  <div className="px-4 pb-4">
                    {briefStatus === 'processing' || briefStatus === 'pending' ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                        <svg className="h-4 w-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating call brief…
                      </div>
                    ) : briefStatus === 'error' ? (
                      <div className="flex items-center justify-between py-2">
                        <p className="text-sm text-red-400">Failed to generate.</p>
                        <button onClick={handleGenerateBrief} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 rounded px-1.5 py-1 hover:bg-zinc-800 transition-colors">
                          <RefreshCw className="h-3 w-3" />Retry
                        </button>
                      </div>
                    ) : brief ? (
                      <div className="space-y-3">
                        <button onClick={handleGenerateBrief} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition-colors">
                          <RefreshCw className="h-3 w-3" />Re-run
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                          <BriefField
                            icon={<Wrench className="h-3.5 w-3.5" />}
                            label="Work Requested"
                            value={brief.workType ?? 'Not mentioned'}
                            timestamp={brief.workTypeTimestamp ?? null}
                            hasAudio={hasAudio}
                            onSeek={handleBriefSeek}
                          />
                          <BriefField
                            icon={<AppointmentIcon value={brief.appointmentAgreed} />}
                            label="Appointment Agreed"
                            value={brief.appointmentAgreed === true ? 'Yes' : brief.appointmentAgreed === false ? 'No' : 'Not mentioned'}
                            timestamp={brief.appointmentAgreedTimestamp ?? null}
                            hasAudio={hasAudio}
                            onSeek={handleBriefSeek}
                          />
                          <BriefField
                            icon={<UserCheck className="h-3.5 w-3.5" />}
                            label="Owner Present"
                            value={brief.ownerPresent ?? 'Not mentioned'}
                            timestamp={brief.ownerPresentTimestamp ?? null}
                            hasAudio={hasAudio}
                            onSeek={handleBriefSeek}
                          />
                          <BriefField
                            icon={<Calendar className="h-3.5 w-3.5" />}
                            label="Appointment Date"
                            value={brief.appointmentDate ?? 'Not mentioned'}
                            timestamp={brief.appointmentDateTimestamp ?? null}
                            hasAudio={hasAudio}
                            onSeek={handleBriefSeek}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { handleGenerateBrief(); setBriefSectionOpen(true); }}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 rounded-md px-2.5 py-1.5 hover:bg-zinc-800 transition-colors border border-zinc-700"
                      >
                        <Sparkles className="h-3 w-3" />Generate brief
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Analysis section ── */}
            {batch && batch.status === 'done' && rubrics.length > 0 && (
              <div>
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900/60 transition-colors"
                  onClick={() => setAnalysisSectionOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                    Analysis
                    {(rubricStatus === 'processing' || rubricStatus === 'pending') && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </div>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-500 transition-transform duration-150', analysisSectionOpen ? '' : '-rotate-90')} />
                </button>
                {analysisSectionOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-2">
                      <select
                        value={selectedRubricId}
                        onChange={(e) => setSelectedRubricId(e.target.value)}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select rubric…</option>
                        {rubrics.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!selectedRubricId || rubricStatus === 'processing' || rubricStatus === 'pending'}
                        onClick={() => selectedRubricId && handleRunRubric(selectedRubricId)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {rubricStatus === 'processing' || rubricStatus === 'pending' ? (
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        {rubricResult ? 'Re-run' : 'Analyse'}
                      </button>
                    </div>
                    {(rubricStatus === 'processing' || rubricStatus === 'pending') ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 py-1">
                        <svg className="h-4 w-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Running analysis…
                      </div>
                    ) : rubricStatus === 'error' ? (
                      <p className="text-sm text-red-400 py-1">Analysis failed. Try re-running.</p>
                    ) : rubricResult ? (
                      <div className="prose prose-sm prose-invert max-w-none
                        prose-headings:text-zinc-100 prose-headings:font-semibold
                        prose-p:text-zinc-300 prose-p:leading-relaxed
                        prose-strong:text-zinc-100 prose-em:text-zinc-300
                        prose-li:text-zinc-300
                        prose-code:text-blue-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                        prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700
                        prose-blockquote:border-l-blue-500 prose-blockquote:text-zinc-400
                        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                        prose-hr:border-zinc-700 prose-table:text-sm prose-th:text-zinc-300 prose-td:text-zinc-400">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rubricResult}</ReactMarkdown>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
