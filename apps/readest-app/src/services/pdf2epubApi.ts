/** pdf2epub API client */

import { supabase } from '@/utils/supabase';
import type {
  Pdf2EpubTask,
  Pdf2EpubTaskListResponse,
  Pdf2EpubEpubUrlResponse,
  Pdf2EpubDownloadUrlResponse,
} from './pdf2epubTypes';

const API_BASE_URL = process.env['NEXT_PUBLIC_PDF2EPUB_API_URL'] || '';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Pdf2EpubAuthError('Not authenticated. Please sign in at pdf2epub.com');
  }

  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Clear session on 401
    await supabase.auth.signOut();
    throw new Pdf2EpubAuthError('Session expired. Please sign in again at pdf2epub.com');
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Pdf2EpubApiError(`API error ${response.status}: ${errorBody}`, response.status);
  }

  return response.json() as Promise<T>;
}

/** Fetch completed tasks (book list) */
export async function fetchTasks(
  page = 1,
  size = 50,
  status: 'completed' | 'all' = 'completed',
): Promise<Pdf2EpubTaskListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  if (status !== 'all') {
    params.set('status', status);
  }
  return apiFetch<Pdf2EpubTaskListResponse>(`/api/tasks?${params.toString()}`);
}

/** Fetch a single task by ID */
export async function fetchTask(taskId: string): Promise<Pdf2EpubTask> {
  return apiFetch<Pdf2EpubTask>(`/api/tasks/${taskId}`);
}

/** Get a presigned URL for the EPUB file of a task */
export async function getEpubUrl(taskId: string): Promise<string> {
  const data = await apiFetch<Pdf2EpubEpubUrlResponse>(`/api/tasks/${taskId}/reader/epub`);
  return data.url;
}

/** Get a download URL for the original file of a task */
export async function getDownloadUrl(taskId: string): Promise<string> {
  const data = await apiFetch<Pdf2EpubDownloadUrlResponse>(`/api/tasks/${taskId}/download`);
  return data.url;
}

/** Custom error for authentication issues */
export class Pdf2EpubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Pdf2EpubAuthError';
  }
}

/** Custom error for API issues */
export class Pdf2EpubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'Pdf2EpubApiError';
    this.status = status;
  }
}
