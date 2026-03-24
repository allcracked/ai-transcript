import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Download, Check } from 'lucide-react';
import { api, Transcript, Segment } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { cn } from '../lib/utils';

interface TranscriptViewProps {
  transcriptId: string;
  onBack: () => void;
}

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

export function TranscriptView({ transcriptId, onBack }: TranscriptViewProps) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTranscript(transcriptId)
      .then(setTranscript)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load transcript');
      })
      .finally(() => setLoading(false));
  }, [transcriptId]);

  const handleCopy = async () => {
    if (!transcript?.segments) return;
    const text = transcriptToText(transcript.segments);
    await navigator.clipboard.writeText(text);
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
    const base = transcript.originalFilename.replace(/\.[^.]+$/, '');
    a.download = `${base}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold text-zinc-100 truncate max-w-xs sm:max-w-md">
              {transcript.originalFilename}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{createdDate}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary">
            {transcript.mode === 'api' ? 'API' : 'Local'}
          </Badge>
          <Badge variant="outline">{transcript.model}</Badge>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      {transcript.segments && transcript.segments.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Transcript
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download .txt
          </Button>
        </div>
      )}

      {/* Segments */}
      {!transcript.segments || transcript.segments.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-zinc-500">
          No transcript segments available.
        </div>
      ) : (
        <div className="space-y-4">
          {transcript.segments.map((seg, idx) => {
            const colorIdx = getSpeakerColorIndex(seg.speaker);
            const colorClass = SPEAKER_COLORS[colorIdx];

            return (
              <div
                key={idx}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2"
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
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">{seg.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
