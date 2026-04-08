/**
 * Sync service for pdf2epub books.
 *
 * Performs incremental sync: compares remote pdf2epub tasks against
 * local library and returns only new books that don't exist locally.
 * Does not delete or overwrite local books.
 * Respects `deletedAt` — books the user has deleted won't be re-synced.
 */

import type { Book } from '@/types/book';
import { fetchTasks } from '@/services/pdf2epubApi';
import { taskToBook, taskIdToHash } from '@/utils/taskToBook';

/**
 * Sync completed pdf2epub tasks into the local library.
 * Returns an array of new books that are not already in the local library.
 *
 * @param localBooks - The current local library books (including soft-deleted ones)
 * @returns New books to be added to the library
 */
export async function syncPdf2EpubBooks(localBooks: Book[]): Promise<Book[]> {
  // Fetch all completed tasks from pdf2epub (up to 200)
  const response = await fetchTasks(1, 200, 'completed');
  const remoteTasks = response.items;

  // Build a set of all known hashes (including deleted books, to prevent re-sync)
  const localHashes = new Set(localBooks.map((b) => b.hash));

  const newBooks: Book[] = [];
  for (const task of remoteTasks) {
    const hash = taskIdToHash(task.id);
    if (!localHashes.has(hash)) {
      newBooks.push(taskToBook(task));
    }
  }

  return newBooks;
}
