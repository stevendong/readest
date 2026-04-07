// Stub: web database service removed in Phase 1 trimming
import type { DatabaseService, DatabaseOpts } from '@/types/database';

export class WebDatabaseService {
  static async open(_url: string, _opts?: DatabaseOpts): Promise<DatabaseService> {
    throw new Error('WebDatabaseService not available');
  }
}
