export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'error';
export type BatchStatus = 'pending' | 'processing' | 'done' | 'error';
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

export interface CallBatch {
  id: string;
  name: string | null;
  status: BatchStatus;
  brief: CallBrief | null;
  briefStatus: BriefStatus | null;
  briefModel: string | null;
  rubricId: string | null;
  rubricResult: string | null;
  rubricStatus: BriefStatus | null;
  rubricModel: string | null;
  userId: string | null;
  uploaderName: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  transcripts?: Transcript[];
}

export interface Transcript {
  id: string;
  name: string;
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
  briefModel: string | null;
  rubricId: string | null;
  rubricResult: string | null;
  rubricStatus: BriefStatus | null;
  rubricModel: string | null;
  batchId: string | null;
  batchOrder: number | null;
}

export interface Rubric {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgressStep = 'uploading' | 'transcribing' | 'diarizing' | 'aligning' | 'saving' | 'done' | 'error';

export interface ProgressEvent {
  step: ProgressStep;
  progress: number;
  message: string;
  transcriptId?: string;
  error?: string;
  // Batch-specific fields
  callIndex?: number;
  callCount?: number;
  batchDone?: boolean;
  batchId?: string;
}
