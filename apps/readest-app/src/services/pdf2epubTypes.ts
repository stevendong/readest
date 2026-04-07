/** Types for pdf2epub API responses */

export interface Pdf2EpubBookMetadata {
  title?: string;
  author?: string;
  language?: string;
  publisher?: string;
  description?: string;
  cover_url?: string;
}

export type Pdf2EpubTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Pdf2EpubTask {
  id: string;
  user_id: string;
  filename: string;
  status: Pdf2EpubTaskStatus;
  book_metadata?: Pdf2EpubBookMetadata;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface Pdf2EpubTaskListResponse {
  tasks: Pdf2EpubTask[];
  total: number;
  page: number;
  size: number;
}

export interface Pdf2EpubEpubUrlResponse {
  url: string;
  expires_in?: number;
}

export interface Pdf2EpubDownloadUrlResponse {
  url: string;
  expires_in?: number;
}
