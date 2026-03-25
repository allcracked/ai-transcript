import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Check, Play, Pause, RotateCcw, Sparkles, RefreshCw, Calendar, Wrench, UserCheck, CheckCircle2, XCircle, HelpCircle, Scissors, GripHorizontal } from 'lucide-react';
import { api, Transcript, Segment, CallBrief, Rubric } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPlayerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SPEAKER_COLORS = [
  'text-blue-400 border-blue-500/30 bg-blue-500/10',
  'text-purple-400 border-purple-500/30 bg-purple-500/10',
  'text-green-400 border-green-500/30 bg-green-500/10',
  'text-orange-400 border-orange-500/30 bg-orange-500/10',
  'text-pink-400 border-pink-500/30 bg-pink-500/10',
  'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
];

function getSpeakerColorIndex(speaker: string): number {
  const lower = speaker.toLowerCase();
  if (lower.includes('_a') || lower.includes('_0')) return 0;
  if (lower.includes('_b') || lower.includes('_1')) return 1;
  if (lower.includes('_c') || lower.includes('_2')) return 2;
  if (lower.includes('_d') || lower.includes('_3')) return 3;
  if (lower.includes('_e') || lower.includes('_4')) return 4;
  if (lower.includes('_f') || lower.includes('_5')) return 5;
  const hash = speaker.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return hash % SPEAKER_COLORS.length;
}

function transcriptToText(segments: Segment[]): string {
  return segments
    .map(
      (seg) =>
        `[${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}] [${seg.speaker}]\n${seg.text}`
    )
    .join('\n\n');
}

function BriefField({
  icon,
  label,
  value,
  timestamp,
  hasAudio,
  onSeek,
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
            {formatPlayerTime(timestamp)}
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


export function TranscriptView() {
  const { id: transcriptId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const onBack = () => navigate('/history');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Rubric analysis state
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [rubricId, setRubricId] = useState<string | null>(null);
  const [rubricResult, setRubricResult] = useState<string | null>(null);
  const [rubricStatus, setRubricStatus] = useState<string | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const rubricPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Floating window drag state
  const [floatPos, setFloatPos] = useState({ x: 40, y: 120 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // Snippet export state
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Brief state
  const [brief, setBrief] = useState<CallBrief | null>(null);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(56);

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  const isAutoScrollingRef = useRef(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTranscript(transcriptId!)
      .then((t) => {
        setTranscript(t);
        setBrief(t.brief);
        setBriefStatus(t.briefStatus);
        if (t.brief) setBriefOpen(true);
        setRubricId(t.rubricId);
        setRubricResult(t.rubricResult);
        setRubricStatus(t.rubricStatus);
        if (t.rubricResult) setRubricOpen(true);
        if (t.rubricId) setSelectedRubricId(t.rubricId);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load transcript');
      })
      .finally(() => setLoading(false));
  }, [transcriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for brief updates while it is being generated
  useEffect(() => {
    if (briefStatus === 'processing' || briefStatus === 'pending') {
      briefPollRef.current = setInterval(async () => {
        try {
          const t = await api.getTranscript(transcriptId!);
          setBrief(t.brief);
          setBriefStatus(t.briefStatus);
          if (t.briefStatus !== 'processing' && t.briefStatus !== 'pending') {
            clearInterval(briefPollRef.current!);
            if (t.brief) setBriefOpen(true);
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
    }
    return () => {
      if (briefPollRef.current) clearInterval(briefPollRef.current);
    };
  }, [briefStatus, transcriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset audio + rubric state when transcript changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setAudioError(false);
    setAutoScroll(true);
    setRubricId(null);
    setRubricResult(null);
    setRubricStatus(null);
    setRubricOpen(false);
    setSelectedRubricId('');
    setBrief(null);
    setBriefStatus(null);
    setBriefOpen(false);
  }, [transcriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active segment: last one whose start <= currentTime
  const activeIdx = useMemo(() => {
    if (!transcript?.segments) return -1;
    let result = -1;
    for (let i = 0; i < transcript.segments.length; i++) {
      if (transcript.segments[i].start <= currentTime) result = i;
      else break;
    }
    return result;
  }, [transcript?.segments, currentTime]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (!autoScroll || activeIdx < 0) return;
    const el = segmentRefs.current[activeIdx];
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 800);
    return () => clearTimeout(t);
  }, [activeIdx, autoScroll]);

  // Detect manual scroll → disable auto-scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!isAutoScrollingRef.current) setAutoScroll(false);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCopy = async () => {
    if (!transcript?.segments) return;
    await navigator.clipboard.writeText(transcriptToText(transcript.segments));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!transcript?.segments) return;
    const text = transcriptToText(transcript.segments);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.originalFilename.replace(/\.[^.]+$/, '')}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const handleSegmentClick = useCallback((start: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = start;
    setCurrentTime(start);
    setAutoScroll(true);
    audioRef.current.play();
  }, []);

  const toggleSegmentSelection = useCallback((idx: number) => {
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleExportSnippet = useCallback(async () => {
    if (!transcript?.segments || !transcript.audioUrl || selectedSegments.size === 0) return;
    setIsExporting(true);
    try {
      const selected = [...selectedSegments].map((i) => transcript.segments![i]);
      const startTime = Math.min(...selected.map((s) => s.start));
      const endTime = Math.max(...selected.map((s) => s.end));

      const response = await fetch(transcript.audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.floor(endTime * sampleRate);
      const channels = audioBuffer.numberOfChannels;

      const leftFloat = audioBuffer.getChannelData(0).slice(startSample, endSample);
      const rightFloat = channels > 1
        ? audioBuffer.getChannelData(1).slice(startSample, endSample)
        : leftFloat;

      const toInt16 = (f32: Float32Array): Int16Array => {
        const i16 = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i]));
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return i16;
      };

      const { Mp3Encoder } = await import('@breezystack/lamejs');
      const encoder = new Mp3Encoder(channels, sampleRate, 128);
      const mp3Chunks: Uint8Array[] = [];
      const CHUNK = 1152;
      const leftInt16 = toInt16(leftFloat);
      const rightInt16 = toInt16(rightFloat);

      for (let i = 0; i < leftInt16.length; i += CHUNK) {
        const l = leftInt16.subarray(i, i + CHUNK);
        const r = rightInt16.subarray(i, i + CHUNK);
        const buf = channels > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
        if (buf.length > 0) mp3Chunks.push(buf);
      }
      const tail = encoder.flush();
      if (tail.length > 0) mp3Chunks.push(tail);

      const blob = new Blob(mp3Chunks as BlobPart[], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = transcript.originalFilename.replace(/\.[^.]+$/, '');
      a.download = `${baseName}_${formatPlayerTime(startTime)}-${formatPlayerTime(endTime)}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      await audioCtx.close();
    } catch (err) {
      console.error('Snippet export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [transcript, selectedSegments]);

  const handleRunRubric = useCallback(async (rid: string) => {
    if (!transcriptId || !rid) return;
    setRubricStatus('processing');
    setSelectedRubricId(rid);
    try {
      await api.runRubricAnalysis(transcriptId, rid);
    } catch {
      setRubricStatus('error');
    }
  }, [transcriptId]);

  const handleGenerateBrief = useCallback(async () => {
    if (!transcriptId) return;
    setBriefStatus('processing');
    try {
      await api.generateBrief(transcriptId);
    } catch {
      setBriefStatus('error');
    }
  }, [transcriptId]);

  // Fetch rubrics list once
  useEffect(() => {
    api.getRubrics().then(setRubrics).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for rubric analysis while processing
  useEffect(() => {
    if (rubricStatus === 'processing' || rubricStatus === 'pending') {
      rubricPollRef.current = setInterval(async () => {
        try {
          const t = await api.getTranscript(transcriptId!);
          setRubricId(t.rubricId);
          setRubricResult(t.rubricResult);
          setRubricStatus(t.rubricStatus);
          if (t.rubricStatus !== 'processing' && t.rubricStatus !== 'pending') {
            clearInterval(rubricPollRef.current!);
            if (t.rubricResult) setRubricOpen(true);
          }
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => { if (rubricPollRef.current) clearInterval(rubricPollRef.current); };
  }, [rubricStatus, transcriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep bottom padding in sync with the bar's actual height
  useEffect(() => {
    if (!bottomBarRef.current) return;
    const obs = new ResizeObserver(() => {
      setBottomBarHeight(bottomBarRef.current?.offsetHeight ?? 56);
    });
    obs.observe(bottomBarRef.current);
    return () => obs.disconnect();
  }, []);

  const hasAudio = !!transcript?.audioUrl && !audioError;

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
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  if (!transcript) return null;

  const createdDate = new Date(transcript.createdAt).toLocaleString();

  return (
    <>
      {/* Hidden audio element */}
      {transcript.audioUrl && (
        <audio
          ref={audioRef}
          src={transcript.audioUrl}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => setAudioError(true)}
        />
      )}

      <div className="space-y-4" style={hasAudio ? { paddingBottom: bottomBarHeight + 16 } : undefined}>
        {/* Sticky toolbar */}
        <div className="sticky top-[69px] z-[9] -mx-6 px-6 pt-4 pb-4 bg-zinc-900 border-b border-zinc-800/80 space-y-3">
          {/* Row 1: left = back + filename/date, right = badges + uploader */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0 -ml-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h2
                  title={transcript.originalFilename}
                  className="font-semibold text-zinc-100 truncate cursor-default"
                >
                  {transcript.originalFilename}
                </h2>
                <p className="text-xs text-zinc-500">
                  {transcript.uploaderName && (
                    <span className="text-zinc-400">{transcript.uploaderName} · </span>
                  )}
                  {createdDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="secondary">
                {transcript.mode === 'api' ? 'API' : transcript.mode === 'assemblyai' ? 'AssemblyAI' : 'Local'}
              </Badge>
              <Badge variant="outline">{transcript.model}</Badge>
            </div>
          </div>

          {/* Row 2: transcript action buttons */}
          {transcript.segments && transcript.segments.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
              {hasAudio && selectedSegments.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSnippet}
                  disabled={isExporting}
                  className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                >
                  {isExporting ? (
                    <>
                      <svg className="mr-1.5 h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Exporting…
                    </>
                  ) : (
                    <>
                      <Scissors className="mr-1.5 h-3.5 w-3.5" />
                      Export Snippet ({selectedSegments.size})
                    </>
                  )}
                </Button>
              )}
              {transcript.status === 'done' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!brief && briefStatus !== 'processing' && briefStatus !== 'pending') {
                      handleGenerateBrief();
                      setBriefOpen(true);
                    } else {
                      setBriefOpen((v) => !v);
                    }
                  }}
                  className={cn(
                    'relative',
                    briefOpen && (brief || briefStatus)
                      ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                      : ''
                  )}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Brief
                  {(briefStatus === 'processing' || briefStatus === 'pending') && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Row 3: rubric analysis */}
          {transcript.status === 'done' && rubrics.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedRubricId}
                onChange={(e) => setSelectedRubricId(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select rubric…</option>
                {rubrics.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedRubricId || rubricStatus === 'processing' || rubricStatus === 'pending'}
                onClick={() => {
                  if (selectedRubricId) {
                    handleRunRubric(selectedRubricId);
                    setRubricOpen(true);
                  }
                }}
                className={cn(
                  'relative',
                  rubricOpen && rubricResult ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' : ''
                )}
              >
                {rubricStatus === 'processing' || rubricStatus === 'pending' ? (
                  <svg className="h-3.5 w-3.5 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                Analyse
              </Button>
              {rubricResult && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRubricOpen((v) => !v)}
                  className="text-zinc-500"
                >
                  {rubricOpen ? 'Hide' : 'Show'} result
                </Button>
              )}
            </div>
          )}
        </div>


        {/* Segments */}
        {!transcript.segments || transcript.segments.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-zinc-500">
            No transcript segments available.
          </div>
        ) : (
          <div className="space-y-3">
            {transcript.segments.map((seg, idx) => {
              const colorIdx = getSpeakerColorIndex(seg.speaker);
              const colorClass = SPEAKER_COLORS[colorIdx];
              const isActive = hasAudio && idx === activeIdx;
              const isSelected = selectedSegments.has(idx);

              return (
                <div
                  key={idx}
                  ref={(el) => { segmentRefs.current[idx] = el; }}
                  className={cn(
                    'rounded-xl border p-4 space-y-2 transition-colors duration-150',
                    isSelected
                      ? 'border-blue-500/40 bg-blue-500/5'
                      : isActive
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSegmentSelection(idx)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 flex-shrink-0 rounded accent-blue-500 cursor-pointer"
                    />
                    <span
                      onClick={() => hasAudio && handleSegmentClick(seg.start)}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        hasAudio && 'cursor-pointer',
                        colorClass
                      )}
                    >
                      {seg.speaker}
                    </span>
                    <span
                      onClick={() => hasAudio && handleSegmentClick(seg.start)}
                      className={cn(
                        'text-xs text-zinc-300 font-mono bg-zinc-800 px-2 py-0.5 rounded-md',
                        hasAudio && 'cursor-pointer'
                      )}
                    >
                      {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                    </span>
                    {isActive && (
                      <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </div>
                  <p
                    onClick={() => hasAudio && handleSegmentClick(seg.start)}
                    className={cn('text-sm leading-relaxed text-zinc-200', hasAudio && 'cursor-pointer')}
                  >
                    {seg.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed bottom bar: brief panel + audio player */}
      {hasAudio && (
        <div ref={bottomBarRef} className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">

          {/* Collapsible brief panel */}
          {briefOpen && (brief || briefStatus === 'processing' || briefStatus === 'pending' || briefStatus === 'error') && (
            <div className="border-b border-zinc-800 px-4 py-4">
              <div className="mx-auto max-w-3xl">
                {briefStatus === 'processing' || briefStatus === 'pending' ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <svg className="h-4 w-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating call brief…
                  </div>
                ) : briefStatus === 'error' ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-400">Failed to generate brief.</p>
                    <Button variant="ghost" size="sm" onClick={handleGenerateBrief} className="text-zinc-500 hover:text-zinc-200">
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </div>
                ) : brief ? (
                  <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={handleGenerateBrief}
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Re-run brief analysis"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-run analysis
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <BriefField
                      icon={<Wrench className="h-3.5 w-3.5" />}
                      label="Work Requested"
                      value={brief.workType ?? 'Not mentioned'}
                      timestamp={brief.workTypeTimestamp ?? null}
                      hasAudio={hasAudio}
                      onSeek={handleSegmentClick}
                    />
                    <BriefField
                      icon={<AppointmentIcon value={brief.appointmentAgreed} />}
                      label="Appointment Agreed"
                      value={brief.appointmentAgreed === true ? 'Yes' : brief.appointmentAgreed === false ? 'No' : 'Not mentioned'}
                      timestamp={brief.appointmentAgreedTimestamp ?? null}
                      hasAudio={hasAudio}
                      onSeek={handleSegmentClick}
                    />
                    <BriefField
                      icon={<UserCheck className="h-3.5 w-3.5" />}
                      label="Owner Present"
                      value={brief.ownerPresent ?? 'Not mentioned'}
                      timestamp={brief.ownerPresentTimestamp ?? null}
                      hasAudio={hasAudio}
                      onSeek={handleSegmentClick}
                    />
                    <BriefField
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Appointment Date"
                      value={brief.appointmentDate ?? 'Not mentioned'}
                      timestamp={brief.appointmentDateTimestamp ?? null}
                      hasAudio={hasAudio}
                      onSeek={handleSegmentClick}
                    />
                  </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Player controls row */}
          <div className="px-4 py-3">
            <div className="mx-auto max-w-3xl flex items-center gap-4">
              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 text-white" />
                ) : (
                  <Play className="h-4 w-4 text-white translate-x-px" />
                )}
              </button>

              {/* Time + seek bar */}
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <span className="text-xs text-zinc-400 font-mono flex-shrink-0 w-10 text-right">
                  {formatPlayerTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 appearance-none rounded-full bg-zinc-700 accent-blue-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-500 font-mono flex-shrink-0 w-10">
                  {formatPlayerTime(duration)}
                </span>
              </div>

              {/* Sync button */}
              <button
                onClick={() => setAutoScroll(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                  autoScroll
                    ? 'text-zinc-600 pointer-events-none'
                    : 'text-blue-400 hover:bg-blue-500/10 border border-blue-500/30'
                )}
                title="Re-enable auto-scroll"
              >
                <RotateCcw className="h-3 w-3" />
                Sync
              </button>

              {/* Brief toggle / generate */}
              {transcript.status === 'done' && (
                <button
                  onClick={() => {
                    if (!brief && briefStatus !== 'processing' && briefStatus !== 'pending') {
                      handleGenerateBrief();
                      setBriefOpen(true);
                    } else {
                      setBriefOpen((v) => !v);
                    }
                  }}
                  title={brief ? (briefOpen ? 'Hide brief' : 'Show brief') : 'Generate brief'}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                    briefOpen && (brief || briefStatus)
                      ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  Brief
                  {(briefStatus === 'processing' || briefStatus === 'pending') && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rubric analysis floating window */}
      {rubricOpen && (rubricResult || rubricStatus === 'processing' || rubricStatus === 'pending' || rubricStatus === 'error') && (
        <div
          style={{ left: floatPos.x, top: floatPos.y }}
          className="fixed z-50 w-[480px] max-w-[calc(100vw-2rem)] max-h-[70vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60"
        >
          {/* Drag handle / header */}
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-800 cursor-grab active:cursor-grabbing select-none rounded-t-xl bg-zinc-900"
            onMouseDown={(e) => {
              e.preventDefault();
              dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: floatPos.x, startPosY: floatPos.y };
              const onMove = (ev: MouseEvent) => {
                if (!dragRef.current) return;
                const nx = dragRef.current.startPosX + ev.clientX - dragRef.current.startX;
                const ny = dragRef.current.startPosY + ev.clientY - dragRef.current.startY;
                setFloatPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
              };
              const onUp = () => {
                dragRef.current = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
              <Sparkles className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-100 truncate">
                {rubrics.find((r) => r.id === rubricId)?.name ?? 'Rubric Analysis'}
              </span>
              <Badge variant="secondary" className="text-xs flex-shrink-0">AI</Badge>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {rubricStatus === 'done' && (
                <button
                  onClick={() => selectedRubricId && handleRunRubric(selectedRubricId)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Re-run analysis"
                >
                  <RefreshCw className="h-3 w-3" />
                  Re-run
                </button>
              )}
              <button
                onClick={() => setRubricOpen(false)}
                className="rounded-md p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto px-4 py-3 flex-1">
            {(rubricStatus === 'processing' || rubricStatus === 'pending') ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                <svg className="h-4 w-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running analysis…
              </div>
            ) : rubricStatus === 'error' ? (
              <p className="text-sm text-red-400 py-2">Analysis failed. Try re-running.</p>
            ) : rubricResult ? (
              <div className="prose prose-sm prose-invert max-w-none
                prose-headings:text-zinc-100 prose-headings:font-semibold
                prose-p:text-zinc-300 prose-p:leading-relaxed
                prose-strong:text-zinc-100
                prose-em:text-zinc-300
                prose-li:text-zinc-300
                prose-code:text-blue-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700
                prose-blockquote:border-l-blue-500 prose-blockquote:text-zinc-400
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                prose-hr:border-zinc-700
                prose-table:text-sm prose-th:text-zinc-300 prose-td:text-zinc-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{rubricResult}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
