/**
 * Process Scanner
 *
 * Cross-platform scanner for detecting running Claude Code sessions.
 * Supports macOS, Linux, and Windows.
 *
 * ## How It Works
 *
 * 1. Enumerate all running Claude processes with their PIDs and TTYs
 * 2. Get working directory (CWD) for each process
 * 3. Map CWD to Claude's project directory (~/.claude/projects/{encoded-path})
 * 4. Find ALL active JSONL files in that directory (not just most recent)
 * 5. Parse each for sessionId, gitBranch, context metrics
 * 6. Return all detected sessions
 *
 * ## Platform Support
 *
 * - macOS/Linux: Uses pgrep, ps, lsof
 * - Windows: Uses PowerShell (Get-Process, Get-WmiObject)
 *
 * ## Multi-Session Detection
 *
 * Multiple Claude processes can run in the same directory. We detect all of them by:
 * - Finding all JSONL files modified within ACTIVE_SESSION_THRESHOLD_MS
 * - Using TTY to create unique terminal keys for each process
 * - Matching processes to sessions by recency when exact match isn't possible
 */

import * as path from "path";
import {
  getSessionIndex,
  type SessionEntry,
} from "@jacques-ai/core/cache";
import type { ContextMetrics, SessionMode, SessionStatus } from "./types.js";
import { CATALOG_CACHE_MAX_AGE_MS } from "./connection/constants.js";
import {
  findActiveSessionFiles,
  findMostRecentSessionFile,
  findRecentSessionFiles,
} from "./connection/session-discovery.js";
import {
  getClaudeProcesses,
  type DetectedProcess,
} from "./connection/process-detection.js";

// DetectedProcess re-exported from connection/process-detection
export type { DetectedProcess } from "./connection/process-detection.js";

/**
 * A session detected from a running Claude process
 */
export interface DetectedSession {
  /** Session ID from the JSONL file */
  sessionId: string;
  /** Working directory of the Claude process */
  cwd: string;
  /** Path to the session transcript JSONL file */
  transcriptPath: string;
  /** Git branch if detected */
  gitBranch: string | null;
  /** Git worktree name (basename of worktree dir, only set for worktrees) */
  gitWorktree: string | null;
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  gitRepoRoot: string | null;
  /** Context metrics from parsing the transcript */
  contextMetrics: ContextMetrics | null;
  /** Last modification time of the transcript */
  lastActivity: number;
  /** Session title extracted from transcript */
  title: string | null;
  /** Process ID */
  pid: number;
  /** TTY of the process */
  tty: string;
  /** Project name derived from CWD */
  project: string;
  /** Terminal type (iTerm2, Windows Terminal, etc.) */
  terminalType?: string;
  /** Terminal session ID for unique identification */
  terminalSessionId?: string;
  /** Session mode: planning if EnterPlanMode was called, execution if started with plan trigger */
  mode?: SessionMode;
  /** Whether the process was launched with --dangerously-skip-permissions */
  isBypass?: boolean;
  /** Status detected from JSONL tail analysis */
  detectedStatus?: SessionStatus;
  /** Last tool name from detected status (when awaiting) */
  lastToolName?: string | null;
}

// Process detection delegated to connection/process-detection.ts
// Session discovery delegated to connection/session-discovery.ts

// ============================================================
// Main Scanner Function
// ============================================================

/**
 * Scan for active Claude Code sessions
 *
 * Detects running Claude processes, matches them to session files,
 * and extracts metadata for registration.
 *
 * ## Catalog-First Strategy
 *
 * Uses Jacques session index (from @jacques-ai/core/cache) for pre-extracted metadata:
 * - Session titles (from summary or first user message)
 * - Git info (branch, worktree, repo root)
 * - Token usage stats
 *
 * Falls back to JSONL parsing only for sessions not in the catalog.
 *
 * ## Multi-Session Support
 *
 * When multiple Claude processes run in the same directory:
 * - Finds ALL recently modified JSONL files (within 1 minute)
 * - Creates unique terminal keys using TTY + PID
 * - Returns one DetectedSession per active session file
 *
 * ## Platform Support
 *
 * - macOS/Linux: Uses pgrep, ps, lsof
 * - Windows: Uses PowerShell (Get-Process, Get-WmiObject)
 */
export async function scanForActiveSessions(): Promise<DetectedSession[]> {
  const processes = await getClaudeProcesses();

  if (processes.length === 0) {
    return [];
  }

  // Load existing session metadata from Jacques catalog
  // Use a short maxAge since we want fresh data but can tolerate recent cache
  let catalogMap = new Map<string, SessionEntry>();
  try {
    const sessionIndex = await getSessionIndex({ maxAge: CATALOG_CACHE_MAX_AGE_MS });
    catalogMap = new Map(sessionIndex.sessions.map(s => [s.id, s]));
  } catch {
    // Catalog unavailable, will fall back to JSONL parsing for all sessions
  }

  const sessions: DetectedSession[] = [];
  const processedSessionIds = new Set<string>();

  // Group processes by CWD
  const processesByCwd = new Map<string, DetectedProcess[]>();
  for (const proc of processes) {
    const existing = processesByCwd.get(proc.cwd) || [];
    existing.push(proc);
    processesByCwd.set(proc.cwd, existing);
  }

  // Process each unique CWD
  for (const [cwd, cwdProcesses] of processesByCwd) {
    // Find all active session files for this CWD (uses catalog when available)
    let sessionFiles = await findActiveSessionFiles(cwd, catalogMap);

    // If no active sessions found, fall back to most recent
    if (sessionFiles.length === 0) {
      const mostRecent = await findMostRecentSessionFile(cwd, catalogMap);
      if (mostRecent) {
        sessionFiles = [mostRecent];
      }
    }

    if (sessionFiles.length === 0) {
      continue;
    }

    // Match processes to session files
    // Strategy: If N processes and M sessions, pair them by recency
    const numPairs = Math.min(cwdProcesses.length, sessionFiles.length);
    const project = path.basename(cwd) || "Unknown";

    for (let i = 0; i < numPairs; i++) {
      const proc = cwdProcesses[i];
      const sessionFile = sessionFiles[i];

      // Skip if we already registered this session ID
      if (processedSessionIds.has(sessionFile.sessionId)) {
        continue;
      }
      processedSessionIds.add(sessionFile.sessionId);

      sessions.push({
        sessionId: sessionFile.sessionId,
        cwd,
        transcriptPath: sessionFile.filePath,
        gitBranch: sessionFile.gitBranch,
        gitWorktree: sessionFile.gitWorktree,
        gitRepoRoot: sessionFile.gitRepoRoot,
        contextMetrics: sessionFile.contextMetrics,
        lastActivity: sessionFile.modifiedAt.getTime(),
        title: sessionFile.title,
        pid: proc.pid,
        tty: proc.tty,
        project,
        terminalType: proc.terminalType,
        terminalSessionId: proc.terminalSessionId,
        mode: sessionFile.mode,
        isBypass: proc.isBypass,
        detectedStatus: sessionFile.detectedStatus,
        lastToolName: sessionFile.lastToolName,
      });
    }

    // If more session files than processes, register remaining sessions
    // with synthetic process info (they might be from recently closed terminals)
    for (let i = numPairs; i < sessionFiles.length; i++) {
      const sessionFile = sessionFiles[i];

      if (processedSessionIds.has(sessionFile.sessionId)) {
        continue;
      }
      processedSessionIds.add(sessionFile.sessionId);

      sessions.push({
        sessionId: sessionFile.sessionId,
        cwd,
        transcriptPath: sessionFile.filePath,
        gitBranch: sessionFile.gitBranch,
        gitWorktree: sessionFile.gitWorktree,
        gitRepoRoot: sessionFile.gitRepoRoot,
        contextMetrics: sessionFile.contextMetrics,
        lastActivity: sessionFile.modifiedAt.getTime(),
        title: sessionFile.title,
        pid: 0, // Unknown PID
        tty: "?",
        project,
        mode: sessionFile.mode,
        detectedStatus: sessionFile.detectedStatus,
        lastToolName: sessionFile.lastToolName,
      });
    }

    // If more processes than session files, look for idle sessions
    // (JSONL files not modified within the active threshold but still belonging to running processes)
    if (cwdProcesses.length > sessionFiles.length) {
      const excessCount = cwdProcesses.length - sessionFiles.length;
      const recentFiles = await findRecentSessionFiles(
        cwd, catalogMap, excessCount, processedSessionIds,
      );

      for (let i = 0; i < recentFiles.length; i++) {
        const sessionFile = recentFiles[i];
        // Pair with remaining unmatched processes
        const procIndex = sessionFiles.length + i;
        const proc = procIndex < cwdProcesses.length ? cwdProcesses[procIndex] : null;

        processedSessionIds.add(sessionFile.sessionId);

        sessions.push({
          sessionId: sessionFile.sessionId,
          cwd,
          transcriptPath: sessionFile.filePath,
          gitBranch: sessionFile.gitBranch,
          gitWorktree: sessionFile.gitWorktree,
          gitRepoRoot: sessionFile.gitRepoRoot,
          contextMetrics: sessionFile.contextMetrics,
          lastActivity: sessionFile.modifiedAt.getTime(),
          title: sessionFile.title,
          pid: proc?.pid ?? 0,
          tty: proc?.tty ?? "?",
          project,
          terminalType: proc?.terminalType,
          terminalSessionId: proc?.terminalSessionId,
          mode: sessionFile.mode,
          isBypass: proc?.isBypass,
          detectedStatus: sessionFile.detectedStatus,
          lastToolName: sessionFile.lastToolName,
        });
      }
    }
  }

  return sessions;
}

// getPlatformInfo re-exported from connection/process-detection
export { getPlatformInfo } from "./connection/process-detection.js";
