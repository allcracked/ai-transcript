import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileAudio } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { cn } from '../lib/utils';

interface UploadFormProps {
  onJobStarted: (jobId: string) => void;
}

const ACCEPTED_TYPES = '.wav,.mp3,.m4a,.flac,.ogg,.webm';

export function UploadForm({ onJobStarted }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('auto');
  const [numSpeakers, setNumSpeakers] = useState(2);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFile: File) => {
    setFile(newFile);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an audio file.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'assemblyai');
      formData.append('model', 'universal-2');
      formData.append('language', language);
      formData.append('numSpeakers', String(numSpeakers));

      const { id } = await api.startJob(formData);
      onJobStarted(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200',
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : file
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileChange(f);
          }}
        />

        <div className="flex flex-col items-center gap-3">
          {file ? (
            <>
              <FileAudio className="h-10 w-10 text-green-400" />
              <div>
                <p className="font-medium text-zinc-100">{file.name}</p>
                <p className="text-sm text-zinc-400">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <p className="text-xs text-zinc-500">Click to change file</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-zinc-500" />
              <div>
                <p className="font-medium text-zinc-300">
                  Drop audio file here or click to browse
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  WAV, MP3, M4A, FLAC, OGG, WebM supported
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Language selector */}
        <Select
          label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="auto">Auto-detect</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </Select>

        {/* Num speakers */}
        <Select
          label="Number of Speakers"
          value={String(numSpeakers)}
          onChange={(e) => setNumSpeakers(parseInt(e.target.value, 10))}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={String(n)}>
              {n} {n === 1 ? 'Speaker' : 'Speakers'}
              {n === 2 ? ' (default)' : ''}
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
        disabled={!file || isSubmitting}
        size="lg"
        className="w-full"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Starting...
          </span>
        ) : (
          'Transcribe'
        )}
      </Button>
    </form>
  );
}
