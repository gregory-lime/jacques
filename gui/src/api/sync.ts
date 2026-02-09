/**
 * Sync API
 *
 * Unified catalog extraction + session index rebuild via SSE stream.
 */

import { streamSSE } from './client';

export interface SyncProgress {
  phase: 'extracting' | 'indexing';
  total: number;
  completed: number;
  current: string;
  skipped?: number;
  errors?: number;
}

export interface SyncResult {
  totalSessions: number;
  extracted: number;
  skipped: number;
  errors: number;
  indexed: number;
}

/**
 * Sync sessions: extract catalogs then rebuild the session index
 * Returns an SSE stream for progress updates
 *
 * @param options.force - If true, re-extract all sessions (no skipping)
 */
export function syncSessions(
  callbacks: {
    onProgress?: (progress: SyncProgress) => void;
    onComplete?: (result: SyncResult) => void;
    onError?: (error: string) => void;
  },
  options: { force?: boolean } = {}
): { abort: () => void } {
  return streamSSE<SyncProgress, SyncResult>(
    '/sync',
    callbacks,
    {
      queryParams: options.force ? { force: 'true' } : undefined,
      errorPrefix: 'Failed to sync',
    }
  );
}
