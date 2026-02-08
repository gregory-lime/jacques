/**
 * Handoff File Watcher
 *
 * Watches for handoff files in project directories and broadcasts
 * notifications when they are created or modified.
 *
 * BUG FIX: Previous implementation used projectDir as the Map key,
 * causing collisions when multiple sessions shared the same project.
 * Now uses sessionId as the key with a compound value storing both
 * the watcher and projectDir.
 */

import { watch, existsSync, type FSWatcher } from 'fs';
import { join } from 'path';
import type { Logger } from '../logging/logger-factory.js';
import type { HandoffReadyMessage, ServerMessage } from '../types.js';
import { createLogger } from '../logging/logger-factory.js';

/**
 * Watcher entry storing watcher and associated project directory
 */
interface WatcherEntry {
  watcher: FSWatcher;
  projectDir: string;
}

/**
 * Broadcast function type for sending handoff notifications
 */
export type BroadcastFn = (message: ServerMessage) => void;

/**
 * Configuration for HandoffWatcher
 */
export interface HandoffWatcherConfig {
  /** Handoff filename to watch for */
  handoffFilename: string;
  /** Function to broadcast messages to clients */
  broadcast: BroadcastFn;
  /** Optional logger */
  logger?: Logger;
}

/**
 * HandoffWatcher - manages file watchers for handoff files
 *
 * Keyed by sessionId to allow multiple sessions in the same project
 * to have independent watchers without collisions.
 */
export class HandoffWatcher {
  /** Map of sessionId -> { watcher, projectDir } */
  private watchers = new Map<string, WatcherEntry>();
  private handoffFilename: string;
  private broadcast: BroadcastFn;
  private logger: Logger;

  constructor(config: HandoffWatcherConfig) {
    this.handoffFilename = config.handoffFilename;
    this.broadcast = config.broadcast;
    this.logger = config.logger ?? createLogger({ silent: true });
  }

  /**
   * Start watching for handoff file in a project directory
   *
   * @param sessionId Session ID (used as key to avoid collisions)
   * @param projectDir Project directory to watch
   */
  startWatching(sessionId: string, projectDir: string): void {
    if (!projectDir) {
      return;
    }

    // Check if we're already watching this session
    if (this.watchers.has(sessionId)) {
      this.logger.log(`[HandoffWatcher] Already watching session: ${sessionId}`);
      return;
    }

    try {
      const handoffPath = join(projectDir, this.handoffFilename);

      const watcher = watch(projectDir, (eventType, filename) => {
        if (filename === this.handoffFilename) {
          this.logger.log(`[HandoffWatcher] Handoff file ${eventType}: ${handoffPath}`);

          const message: HandoffReadyMessage = {
            type: 'handoff_ready',
            session_id: sessionId,
            path: handoffPath,
          };
          this.broadcast(message);
        }
      });

      watcher.on('error', (err) => {
        this.logger.error(`[HandoffWatcher] Error for session ${sessionId}: ${err.message}`);
        this.watchers.delete(sessionId);
      });

      this.watchers.set(sessionId, { watcher, projectDir });
      this.logger.log(`[HandoffWatcher] Watching for handoff file: ${handoffPath} (session: ${sessionId})`);

      // If handoff file already exists, notify immediately
      if (existsSync(handoffPath)) {
        const message: HandoffReadyMessage = {
          type: 'handoff_ready',
          session_id: sessionId,
          path: handoffPath,
        };
        this.broadcast(message);
      }
    } catch (err) {
      this.logger.error(`[HandoffWatcher] Failed to start for session ${sessionId}: ${err}`);
    }
  }

  /**
   * Stop watching for a specific session
   *
   * @param sessionId Session ID to stop watching
   */
  stopWatching(sessionId: string): void {
    const entry = this.watchers.get(sessionId);
    if (entry) {
      entry.watcher.close();
      this.watchers.delete(sessionId);
      this.logger.log(`[HandoffWatcher] Stopped watching session: ${sessionId} (${entry.projectDir})`);
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [sessionId, entry] of this.watchers.entries()) {
      entry.watcher.close();
      this.logger.log(`[HandoffWatcher] Stopped watching session: ${sessionId} (${entry.projectDir})`);
    }
    this.watchers.clear();
  }

  /**
   * Get the number of active watchers
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Check if a session is being watched
   *
   * @param sessionId Session ID to check
   */
  isWatching(sessionId: string): boolean {
    return this.watchers.has(sessionId);
  }

  /**
   * Get all watched session IDs
   */
  getWatchedSessionIds(): string[] {
    return Array.from(this.watchers.keys());
  }
}
