// Stub: database service removed in Phase 1 trimming
import type { DatabaseService } from '@/types/database';

export type SchemaType = string;

export async function migrate(_db: DatabaseService, _schema: SchemaType): Promise<void> {
  // No-op: database migrations removed
}
