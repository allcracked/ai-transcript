const BASE = '/api';

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'error';
export type TranscriptMode = 'assemblyai' | 'local' | 'api';
export type BriefStatus = 'pending' | 'processing' | 'done' | 'error';

export interface Rubric {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface Segment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export type BatchStatus = 'pending' | 'processing' | 'done' | 'error';

export interface CallBatch {
  id: string;
  name: string | null;
  status: BatchStatus;
  brief: CallBrief | null;
  briefStatus: BriefStatus | null;
  rubricId: string | null;
  rubricResult: string | null;
  rubricStatus: BriefStatus | null;
  userId: string | null;
  uploaderName: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  transcripts?: Transcript[];
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
  rubricId: string | null;
  rubricResult: string | null;
  rubricStatus: BriefStatus | null;
  batchId: string | null;
  batchOrder: number | null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  async startJob(formData: FormData): Promise<{ id: string }> {
    const res = await fetch(`${BASE}/jobs`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<{ id: string }>(res);
  },

  async getTranscripts(): Promise<Transcript[]> {
    const res = await fetch(`${BASE}/transcripts`);
    return handleResponse<Transcript[]>(res);
  },

  async getTranscript(id: string): Promise<Transcript> {
    const res = await fetch(`${BASE}/transcripts/${id}`);
    return handleResponse<Transcript>(res);
  },

  async reprocess(id: string): Promise<{ id: string }> {
    const res = await fetch(`${BASE}/transcripts/${id}/reprocess`, {
      method: 'POST',
    });
    return handleResponse<{ id: string }>(res);
  },

  async deleteTranscript(id: string): Promise<void> {
    const res = await fetch(`${BASE}/transcripts/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async generateBrief(id: string): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/transcripts/${id}/brief`, {
      method: 'POST',
    });
    return handleResponse<{ status: string }>(res);
  },

  async runRubricAnalysis(id: string, rubricId: string): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/transcripts/${id}/rubric`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubricId }),
    });
    return handleResponse<{ status: string }>(res);
  },

  async getRubrics(): Promise<Rubric[]> {
    const res = await fetch(`${BASE}/rubrics`);
    return handleResponse<Rubric[]>(res);
  },

  async createRubric(data: { name: string; description?: string; prompt: string }): Promise<Rubric> {
    const res = await fetch(`${BASE}/rubrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Rubric>(res);
  },

  async updateRubric(id: string, data: { name?: string; description?: string; prompt?: string }): Promise<Rubric> {
    const res = await fetch(`${BASE}/rubrics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Rubric>(res);
  },

  async deleteRubric(id: string): Promise<void> {
    const res = await fetch(`${BASE}/rubrics/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  async startBatch(formData: FormData): Promise<{ id: string }> {
    const res = await fetch(`${BASE}/batches`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<{ id: string }>(res);
  },

  async getBatches(): Promise<CallBatch[]> {
    const res = await fetch(`${BASE}/batches`);
    return handleResponse<CallBatch[]>(res);
  },

  async getBatch(id: string): Promise<CallBatch> {
    const res = await fetch(`${BASE}/batches/${id}`);
    return handleResponse<CallBatch>(res);
  },

  async generateBatchBrief(batchId: string): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/batches/${batchId}/brief`, { method: 'POST' });
    return handleResponse<{ status: string }>(res);
  },

  async runBatchRubricAnalysis(batchId: string, rubricId: string): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/batches/${batchId}/rubric`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubricId }),
    });
    return handleResponse<{ status: string }>(res);
  },
};
