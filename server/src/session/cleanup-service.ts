/**
 * Cleanup Service
 *
 * Manages recently-ended session tracking and periodic stale session cleanup.
 * Extracted from SessionRegistry to separate cleanup/TTL concerns
 * from session state management.
 */

import type { Session } from '../types.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';
import {
  RECENTLY_ENDED_TTL_MS,
  CLEANUP_INTERVAL_MS,
} from '../connection/constants.js';

export interface CleanupServiceCallbacks {
  getAllSessions: () => [string, Session][];
  removeSession: (sessionId: string) => void;
}

export interface CleanupServiceOptions {
  callbacks: CleanupServiceCallbacks;
  logger?: Logger;
}

export class CleanupService {
  private callbacks: CleanupServiceCallbacks;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger: Logger;

  // Track recently ended sessions to prevent re-registration
  private recentlyEndedSessions = new Map<string, number>();

  constructor(options: CleanupServiceOptions) {
    this.callbacks = options.callbacks;
    this.logger = options.logger ?? createLogger({ silent: true });
  }

  private get log() { return this.logger.log.bind(this.logger); }

  /**
   * Record a session as recently ended to prevent re-registration.
   */
  markRecentlyEnded(sessionId: string): void {
    this.recentlyEndedSessions.set(sessionId, Date.now());
  }

  /**
   * Check if a session was recently ended.
   * Returns true if the session ended within the TTL window.
   */
  wasRecentlyEnded(sessionId: string): boolean {
    const endedAt = this.recentlyEndedSessions.get(sessionId);
    if (endedAt && Date.now() - endedAt < RECENTLY_ENDED_TTL_MS) {
      return true;
    }
    return false;
  }

  /**
   * Clean up expired entries from the recently-ended sessions map.
   */
  private cleanupRecentlyEnded(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [id, timestamp] of this.recentlyEndedSessions) {
      if (now - timestamp > RECENTLY_ENDED_TTL_MS) {
        this.recentlyEndedSessions.delete(id);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.log(`[Registry] Cleaned up ${cleanedCount} expired recently-ended session entries`);
    }
  }

  /**
   * Start periodic cleanup of stale sessions.
   */
  startCleanup(maxIdleMinutes: number = 60): void {
    if (this.cleanupInterval) {
      return;
    }

    const runCleanup = (): void => {
      const cutoff = Date.now() - (maxIdleMinutes * 60 * 1000);
      const staleSessionIds: string[] = [];

      for (const [id, session] of this.callbacks.getAllSessions()) {
        if (session.status === 'idle' && session.last_activity < cutoff) {
          staleSessionIds.push(id);
        }
      }

      for (const id of staleSessionIds) {
        this.log(`[Registry] Cleaning up stale session: ${id}`);
        this.callbacks.removeSession(id);
      }

      if (staleSessionIds.length > 0) {
        this.log(`[Registry] Cleaned up ${staleSessionIds.length} stale session(s)`);
      }

      this.cleanupRecentlyEnded();
    };

    this.cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    this.log(`[Registry] Stale session cleanup started (threshold: ${maxIdleMinutes} minutes)`);
  }

  /**
   * Stop periodic cleanup.
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.log('[Registry] Stale session cleanup stopped');
    }
  }

  /**
   * Clear all recently-ended entries (for testing/reset).
   */
  clear(): void {
    this.recentlyEndedSessions.clear();
  }
}
