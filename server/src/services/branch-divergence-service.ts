/**
 * Branch Divergence Service
 *
 * Periodically computes ahead/behind counts and dirty status for all active sessions.
 * Groups by (repoRoot, branch) to avoid duplicate git calls for sessions on the same branch.
 */

import type { Session } from '../types.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';
import { computeBranchDivergence, checkDirtyStatus } from '@jacques-ai/core';
import { detectDefaultBranch } from '../connection/worktree.js';
import { BRANCH_DIVERGENCE_INTERVAL_MS } from '../connection/constants.js';

export interface BranchDivergenceServiceOptions {
  getAllSessions: () => Session[];
  broadcastSessionUpdate: (session: Session) => void;
  logger?: Logger;
}

export class BranchDivergenceService {
  private interval: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private checking = false;
  private getAllSessions: () => Session[];
  private broadcastSessionUpdate: (session: Session) => void;
  private logger: Logger;

  private static readonly DEBOUNCE_MS = 3000;

  /** Cache of default branch per repo root (cleared each cycle) */
  private defaultBranchCache = new Map<string, string>();

  constructor(options: BranchDivergenceServiceOptions) {
    this.getAllSessions = options.getAllSessions;
    this.broadcastSessionUpdate = options.broadcastSessionUpdate;
    this.logger = options.logger ?? createLogger({ silent: true });
  }

  /**
   * Start periodic divergence checking.
   */
  start(intervalMs: number = BRANCH_DIVERGENCE_INTERVAL_MS): void {
    if (this.interval) return;

    // Run immediately
    this.check().catch((err) => {
      this.logger.warn(`[Divergence] Check failed: ${err}`);
    });

    // Then periodically
    this.interval = setInterval(() => {
      this.check().catch((err) => {
        this.logger.warn(`[Divergence] Check failed: ${err}`);
      });
    }, intervalMs);

    this.logger.log(`[Divergence] Started (interval: ${intervalMs / 1000}s)`);
  }

  /**
   * Stop periodic checking.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Schedule a debounced divergence check.
   * Multiple calls within DEBOUNCE_MS coalesce into one check.
   */
  scheduleCheck(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.check().catch((err) => {
        this.logger.warn(`[Divergence] Scheduled check failed: ${err}`);
      });
    }, BranchDivergenceService.DEBOUNCE_MS);
  }

  /**
   * Run a single divergence check across all active sessions.
   */
  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      await this.runCheck();
    } finally {
      this.checking = false;
    }
  }

  private async runCheck(): Promise<void> {
    const sessions = this.getAllSessions();
    if (sessions.length === 0) return;

    // Clear default branch cache each cycle
    this.defaultBranchCache.clear();

    // Group sessions by (repoRoot, branch) for divergence
    const divergenceGroups = new Map<string, Session[]>();
    // Group sessions by cwd for dirty status
    const dirtyGroups = new Map<string, Session[]>();

    for (const session of sessions) {
      if (session.git_repo_root && session.git_branch) {
        const key = `${session.git_repo_root}\0${session.git_branch}`;
        const group = divergenceGroups.get(key) || [];
        group.push(session);
        divergenceGroups.set(key, group);
      }

      if (session.cwd) {
        const group = dirtyGroups.get(session.cwd) || [];
        group.push(session);
        dirtyGroups.set(session.cwd, group);
      }
    }

    // Compute divergence per unique (repoRoot, branch)
    for (const [key, groupSessions] of divergenceGroups) {
      const [repoRoot, branch] = key.split('\0');
      const defaultBranch = await this.getDefaultBranch(repoRoot);

      // Skip if this IS the default branch
      if (branch === defaultBranch) {
        for (const session of groupSessions) {
          if (session.git_ahead !== 0 || session.git_behind !== 0) {
            session.git_ahead = 0;
            session.git_behind = 0;
            this.broadcastSessionUpdate(session);
          }
        }
        continue;
      }

      const { ahead, behind } = await computeBranchDivergence(repoRoot, branch, defaultBranch);

      for (const session of groupSessions) {
        if (session.git_ahead !== ahead || session.git_behind !== behind) {
          session.git_ahead = ahead;
          session.git_behind = behind;
          this.broadcastSessionUpdate(session);
        }
      }
    }

    // Compute dirty status per unique cwd
    for (const [cwd, groupSessions] of dirtyGroups) {
      const dirty = await checkDirtyStatus(cwd);

      for (const session of groupSessions) {
        if (session.git_dirty !== dirty) {
          session.git_dirty = dirty;
          this.broadcastSessionUpdate(session);
        }
      }
    }
  }

  /**
   * Get default branch for a repo, with per-cycle caching.
   */
  private async getDefaultBranch(repoRoot: string): Promise<string> {
    const cached = this.defaultBranchCache.get(repoRoot);
    if (cached) return cached;

    const branch = await detectDefaultBranch(repoRoot);
    this.defaultBranchCache.set(repoRoot, branch);
    return branch;
  }
}
