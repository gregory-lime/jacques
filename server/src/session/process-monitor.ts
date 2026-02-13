/**
 * Process Monitor
 *
 * Handles process verification, bypass detection, and PID management.
 * Extracted from SessionRegistry to separate process-level concerns
 * from session state management.
 */

import type { Session } from '../types.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';
import {
  IDLE_TIMEOUT_MS,
  PROCESS_VERIFY_INTERVAL_MS,
} from '../connection/constants.js';
import { extractPid } from '../connection/terminal-key.js';
import { isProcessRunning, isProcessBypass, getClaudeProcesses } from '../connection/process-detection.js';
import type { DetectedProcess } from '../connection/process-detection.js';

/** Grace period for newly registered sessions before considering them dead (ms) */
const NEW_SESSION_GRACE_MS = 60_000; // 60 seconds

export interface ProcessMonitorCallbacks {
  getSession: (sessionId: string) => Session | undefined;
  getAllSessions: () => [string, Session][];
  removeSession: (sessionId: string) => void;
}

export interface ProcessMonitorOptions {
  callbacks: ProcessMonitorCallbacks;
  logger?: Logger;
}

export class ProcessMonitor {
  private callbacks: ProcessMonitorCallbacks;
  private processVerifyInterval: NodeJS.Timeout | null = null;
  private logger: Logger;

  // CWDs where a session was launched with --dangerously-skip-permissions
  private pendingBypassCwds = new Set<string>();
  private pendingBypassTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ProcessMonitorOptions) {
    this.callbacks = options.callbacks;
    this.logger = options.logger ?? createLogger({ silent: true });
  }

  private get log() { return this.logger.log.bind(this.logger); }
  private get warn() { return this.logger.warn.bind(this.logger); }

  /**
   * Get PID for a session from any available source.
   * Priority: terminal_key → session.terminal.terminal_pid
   */
  getSessionPid(session: Session): number | null {
    const keyPid = extractPid(session.terminal_key);
    if (keyPid !== null) {
      return keyPid;
    }
    if (session.terminal?.terminal_pid) {
      return session.terminal.terminal_pid;
    }
    return null;
  }

  /**
   * Store terminal_pid on a session if not already known.
   * When a PID is first stored, checks if the process is running with
   * --dangerously-skip-permissions and marks the session accordingly.
   */
  storeTerminalPid(session: Session, terminalPid: number): void {
    if (!terminalPid || terminalPid <= 0) return;

    const existingPid = this.getSessionPid(session);
    if (existingPid === null) {
      if (!session.terminal) {
        session.terminal = {
          tty: null,
          terminal_pid: terminalPid,
          term_program: null,
          iterm_session_id: null,
          term_session_id: null,
          kitty_window_id: null,
          wezterm_pane: null,
          vscode_injection: null,
          windowid: null,
          term: null,
        };
      } else if (!session.terminal.terminal_pid) {
        session.terminal.terminal_pid = terminalPid;
      }
      this.log(`[Registry] Stored terminal_pid ${terminalPid} for session ${session.session_id}`);
    }

    // Now check if this process is bypass (async, non-blocking)
    if (!session.is_bypass) {
      isProcessBypass(terminalPid).then((bypass: boolean) => {
        if (bypass) {
          session.is_bypass = true;
          this.log(`[Registry] Detected bypass from stored PID ${terminalPid} for session ${session.session_id}`);
        }
      }).catch(() => {});
    }
  }

  /**
   * Verify sessions are still valid:
   * 1. Process is still running (checks all PID sources)
   * 2. CWD is not in Trash
   * 3. Session is not idle beyond timeout
   * 4. PID-less sessions cross-referenced against running Claude processes
   */
  async verifyProcesses(): Promise<void> {
    const sessionsToRemove: string[] = [];
    const pidlessSessions: [string, Session][] = [];
    const now = Date.now();

    for (const [id, session] of this.callbacks.getAllSessions()) {
      // 1. Check if process is still running
      const pid = this.getSessionPid(session);
      if (pid !== null) {
        const isRunning = await isProcessRunning(pid);
        if (!isRunning) {
          this.log(`[Registry] Process ${pid} no longer running for session ${id}`);
          sessionsToRemove.push(id);
          continue;
        }
      } else {
        // Track PID-less sessions for batch process scan
        pidlessSessions.push([id, session]);
      }

      // 2. Check if CWD is in Trash
      if (session.cwd && session.cwd.includes('.Trash')) {
        this.log(`[Registry] CWD in Trash for session ${id}: ${session.cwd}`);
        sessionsToRemove.push(id);
        continue;
      }

      // 3. Check for idle timeout
      if (now - session.last_activity > IDLE_TIMEOUT_MS) {
        const hoursIdle = ((now - session.last_activity) / (1000 * 60 * 60)).toFixed(1);
        this.log(`[Registry] Session ${id} idle for ${hoursIdle}h, marking as stale`);
        sessionsToRemove.push(id);
        continue;
      }
    }

    // 4. Process re-scan for PID-less sessions
    if (pidlessSessions.length > 0) {
      const removeSet = new Set(sessionsToRemove);
      const remainingPidless = pidlessSessions.filter(([id]) => !removeSet.has(id));
      if (remainingPidless.length > 0) {
        await this.verifyPidlessSessions(remainingPidless, sessionsToRemove, now);
      }
    }

    for (const id of sessionsToRemove) {
      this.log(`[Registry] Removing stale/dead session: ${id}`);
      this.callbacks.removeSession(id);
    }

    if (sessionsToRemove.length > 0) {
      this.log(`[Registry] Removed ${sessionsToRemove.length} stale/dead session(s)`);
    }
  }

  /**
   * Verify PID-less sessions by scanning running Claude processes.
   *
   * For sessions without a PID, we can't use `kill -0`. Instead:
   * 1. Enumerate all running Claude processes
   * 2. Exclude PIDs already claimed by verified-alive sessions
   * 3. Match PID-less sessions to unclaimed processes by CWD
   * 4. If matched: enrich session with PID for future fast verification
   * 5. If unmatched: session is dead, mark for removal
   */
  private async verifyPidlessSessions(
    pidlessSessions: [string, Session][],
    sessionsToRemove: string[],
    now: number,
  ): Promise<void> {
    let processes: DetectedProcess[];
    try {
      processes = await getClaudeProcesses();
    } catch (err) {
      // If process enumeration fails, don't remove anything (fail-safe)
      this.warn(`[Registry] Failed to enumerate Claude processes for PID-less verification: ${err}`);
      return;
    }

    // Build set of PIDs already claimed by sessions WITH PIDs
    const claimedPids = new Set<number>();
    for (const [, session] of this.callbacks.getAllSessions()) {
      const pid = this.getSessionPid(session);
      if (pid !== null) {
        claimedPids.add(pid);
      }
    }

    // Build pool of unclaimed processes, indexed by normalized CWD
    const unclaimedByCwd = new Map<string, DetectedProcess[]>();
    for (const proc of processes) {
      if (claimedPids.has(proc.pid)) continue;
      const normalizedCwd = proc.cwd.replace(/\/+$/, '');
      const existing = unclaimedByCwd.get(normalizedCwd) || [];
      existing.push(proc);
      unclaimedByCwd.set(normalizedCwd, existing);
    }

    for (const [id, session] of pidlessSessions) {
      // Grace period: skip sessions registered less than 60s ago
      if (now - session.registered_at < NEW_SESSION_GRACE_MS) {
        this.log(`[Registry] Skipping PID-less session ${id} (within grace period)`);
        continue;
      }

      const sessionCwd = (session.cwd || '').replace(/\/+$/, '');
      const candidates = unclaimedByCwd.get(sessionCwd);

      if (candidates && candidates.length > 0) {
        // Match found — claim the first unclaimed process and enrich with PID
        const matched = candidates.shift()!;
        if (candidates.length === 0) {
          unclaimedByCwd.delete(sessionCwd);
        }

        this.storeTerminalPid(session, matched.pid);
        claimedPids.add(matched.pid);
        this.log(`[Registry] Enriched PID-less session ${id} with PID ${matched.pid} (matched by CWD: ${sessionCwd})`);
      } else {
        // No matching Claude process — session is dead
        this.log(`[Registry] No matching Claude process for PID-less session ${id} (CWD: ${sessionCwd})`);
        sessionsToRemove.push(id);
      }
    }
  }

  /**
   * Detect bypass sessions by checking each session's actual process command line.
   */
  async detectBypassSessions(): Promise<string[]> {
    const updated: string[] = [];

    for (const [id, session] of this.callbacks.getAllSessions()) {
      if (session.is_bypass) continue;

      const pid = this.getSessionPid(session);
      if (pid === null) continue;

      const bypass = await isProcessBypass(pid);
      if (bypass) {
        session.is_bypass = true;
        updated.push(id);
        this.log(`[Registry] Detected bypass from PID ${pid} for session ${id}`);
      }
    }

    return updated;
  }

  /**
   * Start periodic process verification.
   */
  startProcessVerification(intervalMs: number = PROCESS_VERIFY_INTERVAL_MS): void {
    if (this.processVerifyInterval) {
      return;
    }

    // Run immediately on start
    this.verifyProcesses().catch((err) => {
      this.warn(`[Registry] Process verification failed: ${err}`);
    });

    // Then run periodically
    this.processVerifyInterval = setInterval(() => {
      this.verifyProcesses().catch((err) => {
        this.warn(`[Registry] Process verification failed: ${err}`);
      });
    }, intervalMs);

    this.log(`[Registry] Process verification started (interval: ${intervalMs / 1000}s)`);
  }

  /**
   * Stop process verification interval.
   */
  stopProcessVerification(): void {
    if (this.processVerifyInterval) {
      clearInterval(this.processVerifyInterval);
      this.processVerifyInterval = null;
    }
    // Clear all pending bypass timers
    for (const timer of this.pendingBypassTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingBypassTimers.clear();
  }

  /**
   * Mark a CWD as expecting a bypass session.
   * Auto-expires after 60s.
   */
  markPendingBypass(cwd: string): void {
    const normalized = cwd.replace(/\/+$/, '');
    this.pendingBypassCwds.add(normalized);
    this.log(`[Registry] Marked pending bypass for: ${normalized}`);
    // Clear any existing timer for this CWD before scheduling a new one
    const existing = this.pendingBypassTimers.get(normalized);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingBypassCwds.delete(normalized);
      this.pendingBypassTimers.delete(normalized);
    }, 60_000);
    this.pendingBypassTimers.set(normalized, timer);
  }

  /**
   * Check if a CWD has a pending bypass flag, and consume it if so.
   */
  consumePendingBypass(cwd: string): boolean {
    const normalized = cwd.replace(/\/+$/, '');
    if (this.pendingBypassCwds.has(normalized)) {
      this.pendingBypassCwds.delete(normalized);
      // Cancel the expiry timer since we consumed it
      const timer = this.pendingBypassTimers.get(normalized);
      if (timer) {
        clearTimeout(timer);
        this.pendingBypassTimers.delete(normalized);
      }
      return true;
    }
    return false;
  }
}
