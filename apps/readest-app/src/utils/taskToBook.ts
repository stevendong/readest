/** Convert pdf2epub Task to Readest Book format */

import type { Book } from '@/types/book';
import type { Pdf2EpubTask } from '@/services/pdf2epubTypes';

/**
 * Convert a task UUID to a book hash by removing hyphens.
 * This is necessary because Readest uses `key.split('-')[0]` throughout the codebase
 * to extract the book ID from composite keys like `${id}-${uniqueId}`.
 * UUID hyphens would cause the ID to be truncated.
 */
export function taskIdToHash(taskId: string): string {
  return taskId.replace(/-/g, '');
}

/**
 * Convert a book hash back to a task UUID format.
 * Inserts hyphens at positions 8-4-4-4-12 to reconstruct the UUID.
 */
export function hashToTaskId(hash: string): string {
  if (hash.includes('-')) return hash; // Already a UUID
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

/**
 * Convert a single pdf2epub task to a Readest Book object.
 * The task's `id` (with hyphens removed) is used as the book `hash` (unique identifier).
 * The `url` field is left empty — it will be set dynamically via `getEpubUrl()` when opening.
 */
export function taskToBook(task: Pdf2EpubTask): Book {
  const metadata = task.book_metadata;
  const title = metadata?.title || task.filename.replace(/\.[^.]+$/, '') || 'Untitled';
  const author = metadata?.author || '';
  const language = metadata?.language || '';
  const coverImageUrl = metadata?.cover_url || null;

  return {
    hash: taskIdToHash(task.id),
    format: 'EPUB',
    title,
    author,
    primaryLanguage: language || undefined,
    coverImageUrl,
    createdAt: new Date(task.created_at).getTime(),
    updatedAt: task.completed_at
      ? new Date(task.completed_at).getTime()
      : task.updated_at
        ? new Date(task.updated_at).getTime()
        : new Date(task.created_at).getTime(),
    // Mark as remote task — the reader will use this to fetch the EPUB via API
    // We use `url` field since the existing loading pipeline already handles remote URLs
    url: undefined,
  };
}

/**
 * Convert an array of pdf2epub tasks to Readest Book objects.
 * Only includes tasks with status 'completed'.
 */
export function tasksToBooks(tasks: Pdf2EpubTask[]): Book[] {
  return tasks.filter((task) => task.status === 'completed').map(taskToBook);
}
