export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'error';
export type BriefStatus = 'pending' | 'processing' | 'done' | 'error';

export interface CallBrief {
  workType: string | null;
  workTypeTimestamp: number | null;
  appointmentAgreed: boolean | null;
  appointmentAgreedTimestamp: number | null;
  ownerPresent: string | null;
  ownerPresentTimestamp: number | null;
  appointmentDate: string | null;
  appointmentDateTimestamp: number | null;
}
export type TranscriptMode = 'assemblyai' | 'local' | 'api';

export interface Segment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export interface Transcript {
  id: string;
  originalFilename: string;
  filePath: string | null;
  audioUrl: string | null;
  status: TranscriptStatus;
  mode: TranscriptMode;
  model: string;
  language: string | null;
  numSpeakers: number;
  segments: Segment[] | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  uploaderName: string | null;
  brief: CallBrief | null;
  briefStatus: BriefStatus | null;
}

export type ProgressStep = 'uploading' | 'transcribing' | 'diarizing' | 'aligning' | 'saving' | 'done' | 'error';

export interface ProgressEvent {
  step: ProgressStep;
  progress: number;
  message: string;
  transcriptId?: string;
  error?: string;
}
