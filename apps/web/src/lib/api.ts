const BASE = '/api';

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'error';
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
  filePath: string;
  status: TranscriptStatus;
  mode: TranscriptMode;
  model: string;
  language: string | null;
  numSpeakers: number;
  segments: Segment[] | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
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
};
