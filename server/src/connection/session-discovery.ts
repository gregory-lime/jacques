/**
 * Session Discovery
 *
 * Finds and resolves metadata for JSONL session files in Claude's project directories.
 * Uses a catalog-first strategy: reads pre-extracted metadata from Jacques session index
 * when available, falls back to JSONL parsing for uncataloged sessions.
 *
 * @module connection/session-discovery
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import {
  encodeProjectPath,
  getClaudeProjectsDir,
  parseJSONL,
} from '@jacques-ai/core/session';
import {
  detectModeAndPlans,
  type SessionEntry,
} from '@jacques-ai/core/cache';
import type { ContextMetrics, SessionMode, SessionStatus } from '../types.js';
import {
  ACTIVE_SESSION_THRESHOLD_MS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
} from './constants.js';
import { detectGitInfo } from './git-info.js';

/**
 * Status detected from JSONL tail analysis
 */
export interface DetectedStatus {
  status: SessionStatus;
  lastToolName: string | null;
}

/**
 * JSONL file info with parsed metadata
 */
export interface SessionFileInfo {
  filePath: string;
  sessionId: string;
  modifiedAt: Date;
  gitBranch: string | null;
  gitWorktree: string | null;
  gitRepoRoot: string | null;
  title: string | null;
  contextMetrics: ContextMetrics | null;
  mode: SessionMode;
  detectedStatus: SessionStatus;
  lastToolName: string | null;
}

/**
 * Compute estimated ContextMetrics from token counts.
 * Shared helper for both catalog and JSONL paths.
 */
export function computeEstimatedMetrics(
  inputTokens: number,
  outputTokens: number,
): ContextMetrics {
  const contextWindowSize = DEFAULT_CONTEXT_WINDOW_SIZE;
  const usedPercentage = (inputTokens / contextWindowSize) * 100;
  return {
    used_percentage: Math.min(usedPercentage, 100),
    remaining_percentage: Math.max(100 - usedPercentage, 0),
    context_window_size: contextWindowSize,
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    is_estimate: true,
  };
}

/**
 * Resolve metadata for a session file using catalog-first strategy.
 *
 * Priority 1: Use pre-extracted catalog metadata (fast, no file I/O)
 * Priority 2: Fall back to JSONL parsing (slow, reads full file)
 */
async function resolveSessionMetadata(
  filePath: string,
  sessionId: string,
  modifiedAt: Date,
  cwd: string,
  catalogMap: Map<string, SessionEntry>,
): Promise<SessionFileInfo | null> {
  // Priority 1: Use existing Jacques catalog metadata
  const catalogEntry = catalogMap.get(sessionId);
  if (catalogEntry) {
    const contextMetrics = (catalogEntry.tokens && catalogEntry.tokens.input > 0)
      ? computeEstimatedMetrics(catalogEntry.tokens.input, catalogEntry.tokens.output)
      : null;

    // Always use live git detection for discovered sessions — catalog git info
    // may be stale (e.g., detected from decoded project path instead of actual worktree)
    const gitInfo = await detectGitInfo(cwd);
    const gitBranch = gitInfo.branch || catalogEntry.gitBranch || null;
    const gitWorktree = gitInfo.worktree || catalogEntry.gitWorktree || null;
    const gitRepoRoot = gitInfo.repoRoot || catalogEntry.gitRepoRoot || null;

    const { status: detectedStatus, lastToolName } = await detectStatusFromJSONLTail(filePath);

    return {
      filePath,
      sessionId,
      modifiedAt,
      gitBranch,
      gitWorktree,
      gitRepoRoot,
      title: catalogEntry.title,
      contextMetrics,
      mode: catalogEntry.mode || null,
      detectedStatus,
      lastToolName,
    };
  }

  // Priority 2: Fall back to JSONL parsing for uncataloged sessions
  const metadata = await extractSessionMetadataFromJSONL(filePath);

  if (!metadata.sessionId) {
    return null;
  }

  const gitInfo = await detectGitInfo(cwd);
  const mode = await detectSessionModeFromJSONL(filePath);
  const { status: detectedStatus, lastToolName } = await detectStatusFromJSONLTail(filePath);

  return {
    filePath,
    sessionId: metadata.sessionId,
    modifiedAt,
    gitBranch: metadata.gitBranch || gitInfo.branch,
    gitWorktree: gitInfo.worktree,
    gitRepoRoot: gitInfo.repoRoot,
    title: metadata.title,
    // Don't estimate context for discovered sessions - show null until hooks fire
    contextMetrics: null,
    mode,
    detectedStatus,
    lastToolName,
  };
}

/**
 * Find all active session files for a given CWD.
 * Uses catalog-first strategy: reads from Jacques session index when available,
 * falls back to JSONL parsing for uncataloged sessions.
 *
 * @param cwd Working directory to find sessions for
 * @param catalogMap Pre-loaded session catalog (sessionId -> SessionEntry)
 * @returns Sessions modified within ACTIVE_SESSION_THRESHOLD_MS, sorted by recency
 */
export async function findActiveSessionFiles(
  cwd: string,
  catalogMap: Map<string, SessionEntry>,
): Promise<SessionFileInfo[]> {
  const filePaths = await getJsonlFiles(cwd);
  if (!filePaths) return [];

  try {
    const now = Date.now();
    const activeSessions: SessionFileInfo[] = [];

    for (const filePath of filePaths) {
      const stats = await fs.stat(filePath);
      const mtime = stats.mtime.getTime();

      if (now - mtime <= ACTIVE_SESSION_THRESHOLD_MS) {
        const sessionId = path.basename(filePath, '.jsonl');
        const resolved = await resolveSessionMetadata(
          filePath, sessionId, stats.mtime, cwd, catalogMap,
        );
        if (resolved) {
          activeSessions.push(resolved);
        }
      }
    }

    // Sort by modification time (most recent first)
    activeSessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    return activeSessions;
  } catch (err) {
    // Failed to stat/resolve session files — non-critical
    return [];
  }
}

/**
 * Find the most recent session file for a CWD (fallback for inactive detection).
 * Uses catalog-first strategy when available.
 *
 * @param cwd Working directory to find sessions for
 * @param catalogMap Pre-loaded session catalog (sessionId -> SessionEntry)
 */
export async function findMostRecentSessionFile(
  cwd: string,
  catalogMap: Map<string, SessionEntry>,
): Promise<SessionFileInfo | null> {
  const filePaths = await getJsonlFiles(cwd);
  if (!filePaths) return null;

  try {
    // Find most recent file
    let mostRecent: { filePath: string; mtime: Date } | null = null;

    for (const filePath of filePaths) {
      const stats = await fs.stat(filePath);

      if (!mostRecent || stats.mtime > mostRecent.mtime) {
        mostRecent = { filePath, mtime: stats.mtime };
      }
    }

    if (!mostRecent) {
      return null;
    }

    const sessionId = path.basename(mostRecent.filePath, '.jsonl');
    return resolveSessionMetadata(
      mostRecent.filePath, sessionId, mostRecent.mtime, cwd, catalogMap,
    );
  } catch (err) {
    // Failed to stat/resolve session files — non-critical
    return null;
  }
}

/**
 * Find the N most recently modified session files for a CWD, regardless of activity threshold.
 * Used when there are more running processes than active session files to discover idle sessions.
 *
 * @param cwd Working directory to find sessions for
 * @param catalogMap Pre-loaded session catalog (sessionId -> SessionEntry)
 * @param count Maximum number of files to return
 * @param excludeIds Session IDs to skip (already registered)
 * @returns Up to `count` most recent session files, sorted by recency
 */
export async function findRecentSessionFiles(
  cwd: string,
  catalogMap: Map<string, SessionEntry>,
  count: number,
  excludeIds: Set<string>,
): Promise<SessionFileInfo[]> {
  const filePaths = await getJsonlFiles(cwd);
  if (!filePaths) return [];

  try {
    // Stat all files and sort by recency
    const fileStats: { filePath: string; mtime: Date }[] = [];
    for (const filePath of filePaths) {
      const sessionId = path.basename(filePath, '.jsonl');
      if (excludeIds.has(sessionId)) continue;

      const stats = await fs.stat(filePath);
      fileStats.push({ filePath, mtime: stats.mtime });
    }

    // Sort by most recent first, take top N
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const topN = fileStats.slice(0, count);

    const results: SessionFileInfo[] = [];
    for (const { filePath, mtime } of topN) {
      const sessionId = path.basename(filePath, '.jsonl');
      const resolved = await resolveSessionMetadata(
        filePath, sessionId, mtime, cwd, catalogMap,
      );
      if (resolved) {
        results.push(resolved);
      }
    }

    return results;
  } catch (err) {
    // Failed to stat/resolve session files — non-critical
    return [];
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Get the Claude project directory for a given CWD
 */
function getProjectDir(cwd: string): string {
  const claudeDir = getClaudeProjectsDir();
  const encodedPath = encodeProjectPath(cwd);
  return path.join(claudeDir, encodedPath);
}

/**
 * List JSONL files in the Claude project directory for a given CWD.
 * Returns full file paths sorted alphabetically, or null if directory is missing/empty.
 */
async function getJsonlFiles(cwd: string): Promise<string[] | null> {
  const projectDir = getProjectDir(cwd);
  try {
    await fs.access(projectDir);
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    return jsonlFiles.length > 0
      ? jsonlFiles.map(f => path.join(projectDir, f))
      : null;
  } catch {
    return null;
  }
}

/**
 * Detect session mode (planning/execution) from JSONL file
 */
async function detectSessionModeFromJSONL(filePath: string): Promise<SessionMode> {
  try {
    const entries = await parseJSONL(filePath);
    if (entries.length === 0) return null;

    const { mode } = detectModeAndPlans(entries);
    return mode;
  } catch (err) {
    // Mode detection failed — non-critical, default to null
    return null;
  }
}

// Entry types to skip when walking backwards through JSONL tail
const SKIP_ENTRY_TYPES = new Set(['progress', 'file-history-snapshot']);

/**
 * Detect session status by reading the tail of the JSONL transcript file.
 *
 * Reads the last ~32KB and walks backwards to find the last substantive entry
 * (skipping progress and file-history-snapshot entries).
 *
 * Status mapping:
 * - system → idle (Claude finished a turn: turn_duration, stop_hook_summary, etc.)
 * - summary → idle (context was compacted)
 * - assistant with tool_use blocks → awaiting (waiting for tool approval)
 * - assistant without tool_use → idle (Claude finished responding)
 * - user / queue-operation → working (Claude is processing)
 * - fallback → active
 */
export async function detectStatusFromJSONLTail(filePath: string): Promise<DetectedStatus> {
  const TAIL_BYTES = 32768;

  try {
    const fd = await fs.open(filePath, 'r');
    try {
      const stat = await fd.stat();
      if (stat.size === 0) {
        return { status: 'active', lastToolName: null };
      }

      const readSize = Math.min(TAIL_BYTES, stat.size);
      const offset = stat.size - readSize;
      const buffer = Buffer.alloc(readSize);
      await fd.read(buffer, 0, readSize, offset);

      const tail = buffer.toString('utf-8');
      // Split into lines, filter empty, reverse to walk backwards
      const lines = tail.split('\n').filter(l => l.trim());

      for (let i = lines.length - 1; i >= 0; i--) {
        let entry: any;
        try {
          entry = JSON.parse(lines[i]);
        } catch {
          // Possibly a partial line from the offset cut — skip
          continue;
        }

        const type = entry.type;
        if (!type || SKIP_ENTRY_TYPES.has(type)) {
          continue;
        }

        // system entry → Claude finished a turn (turn_duration, stop_hook_summary, etc.)
        if (type === 'system') {
          return { status: 'idle', lastToolName: null };
        }

        // summary → context was compacted, session is idle
        if (type === 'summary') {
          return { status: 'idle', lastToolName: null };
        }

        // assistant → check for tool_use content blocks
        if (type === 'assistant') {
          const content = entry.message?.content;
          if (Array.isArray(content)) {
            // Find the last tool_use block
            let lastTool: string | null = null;
            for (const block of content) {
              if (block.type === 'tool_use') {
                lastTool = block.name || null;
              }
            }
            if (lastTool) {
              return { status: 'awaiting', lastToolName: lastTool };
            }
          }
          // Assistant without tool_use — finished responding
          return { status: 'idle', lastToolName: null };
        }

        // user or queue-operation → Claude is processing
        if (type === 'user' || type === 'queue-operation') {
          return { status: 'working', lastToolName: null };
        }

        // Any other known type — treat as active
        return { status: 'active', lastToolName: null };
      }
    } finally {
      await fd.close();
    }
  } catch {
    // File read error — non-critical, default to active
  }

  return { status: 'active', lastToolName: null };
}

/**
 * Extract session metadata from JSONL file (fallback for uncataloged sessions)
 */
async function extractSessionMetadataFromJSONL(
  filePath: string,
): Promise<{
  sessionId: string | null;
  gitBranch: string | null;
  title: string | null;
}> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    let sessionId: string | null = null;
    let gitBranch: string | null = null;
    let title: string | null = null;

    // Parse first few lines to get session metadata
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      try {
        const entry = JSON.parse(lines[i]);

        if (!sessionId && entry.sessionId) {
          sessionId = entry.sessionId;
        }

        if (!gitBranch && entry.data?.gitBranch) {
          gitBranch = entry.data.gitBranch;
        }

        if (!title && entry.type === 'user' && entry.message?.content) {
          const userContent =
            typeof entry.message.content === 'string'
              ? entry.message.content
              : entry.message.content[0]?.text || '';
          if (
            userContent &&
            !userContent.trim().startsWith('<local-command') &&
            !userContent.trim().startsWith('<command-')
          ) {
            title = userContent.split('\n')[0].slice(0, 60);
            if (userContent.length > 60) {
              title += '...';
            }
          }
        }

        if (sessionId && gitBranch && title) break;
      } catch {
        // Malformed JSON line — skip
        continue;
      }
    }

    return { sessionId, gitBranch, title };
  } catch (err) {
    // File read failed — non-critical
    return {
      sessionId: null,
      gitBranch: null,
      title: null,
    };
  }
}
