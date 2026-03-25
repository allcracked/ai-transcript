import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileAudio, GripVertical, X } from 'lucide-react';
import { api, Rubric } from '../lib/api';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { cn } from '../lib/utils';

interface UploadFormProps {
  onJobStarted: (jobId: string) => void;
  onBatchStarted: (batchId: string) => void;
}

const ACCEPTED_TYPES = '.wav,.mp3,.m4a,.flac,.ogg,.webm';
const MAX_FILES = 5;

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function UploadForm({ onJobStarted, onBatchStarted }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState('auto');
  const [numSpeakers, setNumSpeakers] = useState(0);
  const [rubricId, setRubricId] = useState('');
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const dragItemIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  useEffect(() => {
    api.getRubrics().then(setRubrics).catch(() => {});
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    const newFiles = Array.from(incoming);
    setFiles((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setError(null);
  };

  // Drop zone handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  // List reorder drag handlers
  const onItemDragStart = (idx: number) => { dragItemIdx.current = idx; };
  const onItemDragEnter = (idx: number) => { dragOverIdx.current = idx; };
  const onItemDragEnd = () => {
    const from = dragItemIdx.current;
    const to = dragOverIdx.current;
    if (from !== null && to !== null && from !== to) {
      setFiles((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    }
    dragItemIdx.current = null;
    dragOverIdx.current = null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please select at least one audio file.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (files.length === 1) {
        // Single file — existing single-job flow
        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('mode', 'assemblyai');
        formData.append('model', 'universal-2');
        formData.append('language', language);
        formData.append('numSpeakers', String(numSpeakers));
        if (rubricId) formData.append('rubricId', rubricId);

        const { id } = await api.startJob(formData);
        onJobStarted(id);
      } else {
        // Multiple files — batch flow
        const formData = new FormData();
        for (const f of files) {
          formData.append('files', f);
        }
        formData.append('mode', 'assemblyai');
        formData.append('model', 'universal-2');
        formData.append('language', language);
        formData.append('numSpeakers', String(numSpeakers));
        if (rubricId) formData.append('rubricId', rubricId);
        // Send order as JSON array of filenames
        formData.append('fileOrder', JSON.stringify(files.map((f) => f.name)));

        const { id } = await api.startBatch(formData);
        // Store filenames so the processing page can display them
        sessionStorage.setItem(`batch-filenames-${id}`, JSON.stringify(files.map((f) => f.name)));
        onBatchStarted(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
      setIsSubmitting(false);
    }
  };

  const isBatch = files.length > 1;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200',
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : files.length > 0
            ? 'border-zinc-600 bg-zinc-800/30 hover:border-zinc-500'
            : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFiles(e.target.files);
              // Reset input so the same file can be re-added after removal
              e.target.value = '';
            }
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-zinc-500" />
          <div>
            <p className="font-medium text-zinc-300">
              {files.length === 0
                ? 'Drop audio files here or click to browse'
                : `Add more files (${files.length}/${MAX_FILES})`}
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              WAV, MP3, M4A, FLAC, OGG, WebM · up to {MAX_FILES} files
            </p>
          </div>
        </div>
      </div>

      {/* File list with drag-to-reorder */}
      {files.length > 0 && (
        <div className="space-y-2">
          {isBatch && (
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <GripVertical className="h-3.5 w-3.5" />
              Drag to reorder — calls will be processed and analyzed in this order
            </p>
          )}
          <div className="space-y-1.5">
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                draggable
                onDragStart={() => onItemDragStart(idx)}
                onDragEnter={() => onItemDragEnter(idx)}
                onDragEnd={onItemDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 transition-colors hover:border-zinc-600 cursor-grab active:cursor-grabbing active:opacity-60"
              >
                {isBatch && (
                  <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" />
                )}
                <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-300">
                  {idx + 1}
                </span>
                <FileAudio className="h-4 w-4 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">{file.name}</p>
                  <p className="text-xs text-zinc-500">{formatSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                  className="shrink-0 rounded p-0.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Options grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="auto">Auto-detect</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </Select>

        {rubrics.length > 0 && (
          <Select
            label="Analysis Rubric"
            value={rubricId}
            onChange={(e) => setRubricId(e.target.value)}
          >
            <option value="">None</option>
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        )}

        <Select
          label="Number of Speakers"
          value={String(numSpeakers)}
          onChange={(e) => setNumSpeakers(parseInt(e.target.value, 10))}
        >
          <option value="0">Auto-detect</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={String(n)}>
              {n} {n === 1 ? 'Speaker' : 'Speakers'}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={files.length === 0 || isSubmitting}
        size="lg"
        className="w-full"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Starting…
          </span>
        ) : isBatch ? (
          `Transcribe ${files.length} Calls`
        ) : (
          'Transcribe'
        )}
      </Button>
    </form>
  );
}
