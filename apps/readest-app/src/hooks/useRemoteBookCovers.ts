/**
 * Hook to lazily load cover images for remote pdf2epub books.
 * Covers are cached in IndexedDB so they persist across page refreshes
 * without re-downloading the full EPUB each time.
 */

import { useEffect, useRef } from 'react';
import { Book } from '@/types/book';
import { getEpubUrl } from '@/services/pdf2epubApi';
import { hashToTaskId } from '@/utils/taskToBook';
import { useLibraryStore } from '@/store/libraryStore';

// --- IndexedDB cover cache ---

const DB_NAME = 'readest-cover-cache';
const STORE_NAME = 'covers';
const DB_VERSION = 1;

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedCover(hash: string): Promise<Blob | null> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedCover(hash: string, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(blob, hash);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently ignore cache write failures
  }
}

// --- Cover extraction ---

/**
 * Check if a book is a remote pdf2epub book.
 * Supports both new books (with `source` field) and legacy persisted books
 * that were saved before the `source` field was introduced.
 */
function isRemoteBook(book: Book): boolean {
  return book.source === 'pdf2epub' || (!book.source && !book.filePath && !book.url);
}

/**
 * Check if a cover URL is a valid, live blob URL.
 * Blob URLs from previous page navigations become invalid.
 */
function hasValidCover(book: Book): boolean {
  const coverUrl = book.coverImageUrl || book.metadata?.coverImageUrl;
  if (!coverUrl) return false;
  // blob: URLs from previous navigations are invalidated
  // http/https URLs (e.g. from metadata) are always valid
  if (coverUrl.startsWith('blob:')) return true;
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) return true;
  // Local file-based cover paths (e.g. "cover.png") are not valid for remote books
  return false;
}

/**
 * Load cover for a book: try IndexedDB cache first, then fetch EPUB and extract.
 * Returns a blob URL for the cover image, or null if extraction fails.
 */
async function loadCover(bookHash: string): Promise<string | null> {
  // 1. Try cache
  const cached = await getCachedCover(bookHash);
  if (cached) {
    return URL.createObjectURL(cached);
  }

  // 2. Fetch EPUB and extract cover
  try {
    const taskId = hashToTaskId(bookHash);
    const epubUrl = await getEpubUrl(taskId);
    const response = await fetch(epubUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const file = new File([blob], 'book.epub', { type: 'application/epub+zip' });

    const { DocumentLoader } = await import('@/libs/document');
    const { book: bookDoc } = await new DocumentLoader(file).open();
    const cover = await bookDoc.getCover();
    if (!cover) return null;

    // 3. Cache the cover blob for next time
    await setCachedCover(bookHash, cover);

    return URL.createObjectURL(cover);
  } catch (err) {
    console.warn('Failed to extract cover for book:', bookHash, err);
    return null;
  }
}

// --- Hook ---

function updateBookCover(bookHash: string, coverUrl: string) {
  const { library, setLibrary } = useLibraryStore.getState();
  const updatedLibrary = library.map((b) =>
    b.hash === bookHash ? { ...b, coverImageUrl: coverUrl } : b,
  );
  setLibrary(updatedLibrary);
}

/**
 * For each remote book without a valid cover, load from IndexedDB cache or fetch EPUB and extract.
 * Updates the library store with cover blob URLs as they become available.
 */
export function useRemoteBookCovers(books: Book[]) {
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const remoteBooksNeedingCover = books.filter(
      (book) => isRemoteBook(book) && !hasValidCover(book) && !loadedRef.current.has(book.hash),
    );

    if (remoteBooksNeedingCover.length === 0) return;

    // Mark as loading to avoid duplicate requests
    for (const book of remoteBooksNeedingCover) {
      loadedRef.current.add(book.hash);
    }

    // Load covers concurrently with a concurrency limit
    const CONCURRENCY = 3;
    let index = 0;

    const processNext = async () => {
      while (index < remoteBooksNeedingCover.length) {
        const book = remoteBooksNeedingCover[index++]!;
        const coverUrl = await loadCover(book.hash);
        if (coverUrl) {
          updateBookCover(book.hash, coverUrl);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, remoteBooksNeedingCover.length) },
      () => processNext(),
    );
    Promise.all(workers).catch(console.warn);
  }, [books]);
}
