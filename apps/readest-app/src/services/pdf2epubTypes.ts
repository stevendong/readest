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
  user_email?: string;
  filename: string;
  status: Pdf2EpubTaskStatus;
  progress?: number;
  current_step?: string;
  total_pages?: number;
  processed_pages?: number;
  max_pages?: number | null;
  quality_mode?: string;
  is_pro_mode?: boolean;
  pro_stage?: string | null;
  book_metadata?: Pdf2EpubBookMetadata;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  deleted_at?: string | null;
  download_url?: string;
}

export interface Pdf2EpubTaskListResponse {
  items: Pdf2EpubTask[];
  total: number;
  page: number;
  size: number;
  pages?: number;
}

export interface Pdf2EpubEpubUrlResponse {
  url: string;
  expires_in?: number;
}

export interface Pdf2EpubDownloadUrlResponse {
  url: string;
  expires_in?: number;
}
