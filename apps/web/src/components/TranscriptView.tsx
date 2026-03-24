import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Check, Play, Pause, RotateCcw } from 'lucide-react';
import { api, Transcript, Segment } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
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

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  const isAutoScrollingRef = useRef(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTranscript(transcriptId!)
      .then(setTranscript)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load transcript');
      })
      .finally(() => setLoading(false));
  }, [transcriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset audio state when transcript changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setAudioError(false);
    setAutoScroll(true);
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

      <div className={cn('space-y-4', hasAudio && 'pb-24')}>
        {/* Sticky toolbar — back button, filename, badges, copy/download */}
        <div className="sticky top-[69px] z-[9] -mx-6 px-6 pt-4 pb-3 bg-zinc-900 border-b border-zinc-800/80">
          <div className="flex items-center justify-between gap-3">
            {/* Left: back + filename + actions */}
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 mr-2">
                <h2
                  title={transcript.originalFilename}
                  className="font-semibold text-zinc-100 truncate max-w-[140px] sm:max-w-xs cursor-default"
                >
                  {transcript.originalFilename}
                </h2>
                <p className="text-xs text-zinc-500">
                  {createdDate}
                  {transcript.uploaderName && (
                    <span className="ml-2 text-zinc-600">· {transcript.uploaderName}</span>
                  )}
                </p>
              </div>
              {transcript.segments && transcript.segments.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
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
                  <Button variant="outline" size="sm" onClick={handleDownload} className="flex-shrink-0">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </Button>
                </>
              )}
            </div>

            {/* Right: model info badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="secondary">
                {transcript.mode === 'api' ? 'API' : transcript.mode === 'assemblyai' ? 'AssemblyAI' : 'Local'}
              </Badge>
              <Badge variant="outline">{transcript.model}</Badge>
            </div>
          </div>
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

              return (
                <div
                  key={idx}
                  ref={(el) => { segmentRefs.current[idx] = el; }}
                  onClick={() => hasAudio && handleSegmentClick(seg.start)}
                  className={cn(
                    'rounded-xl border p-4 space-y-2 transition-colors duration-150',
                    hasAudio && 'cursor-pointer',
                    isActive
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        colorClass
                      )}
                    >
                      {seg.speaker}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                    </span>
                    {isActive && (
                      <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-200">{seg.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed bottom audio player */}
      {hasAudio && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-3">
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

            {/* Sync button — only shown when auto-scroll is off */}
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
          </div>
        </div>
      )}
    </>
  );
}
