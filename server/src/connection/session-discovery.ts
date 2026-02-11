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
import * as os from 'os';
import { promises as fs } from 'fs';
import {
  encodeProjectPath,
  getClaudeProjectsDir,
  parseJSONLContent,
  parseJSONL,
  getEntryStatistics,
} from '@jacques/core/session';
import {
  detectModeAndPlans,
  type SessionEntry,
} from '@jacques/core/cache';
import type { ContextMetrics, SessionMode } from '../types.js';
import {
  ACTIVE_SESSION_THRESHOLD_MS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
} from './constants.js';
import { detectGitInfo } from './git-info.js';

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
    let contextMetrics: ContextMetrics | null = null;
    if (catalogEntry.tokens && catalogEntry.tokens.input > 0) {
      const contextWindowSize = DEFAULT_CONTEXT_WINDOW_SIZE;
      const usedPercentage = (catalogEntry.tokens.input / contextWindowSize) * 100;
      contextMetrics = {
        used_percentage: Math.min(usedPercentage, 100),
        remaining_percentage: Math.max(100 - usedPercentage, 0),
        context_window_size: contextWindowSize,
        total_input_tokens: catalogEntry.tokens.input,
        total_output_tokens: catalogEntry.tokens.output,
        is_estimate: true,
      };
    }

    // Always use live git detection for discovered sessions — catalog git info
    // may be stale (e.g., detected from decoded project path instead of actual worktree)
    const gitInfo = await detectGitInfo(cwd);
    const gitBranch = gitInfo.branch || catalogEntry.gitBranch || null;
    const gitWorktree = gitInfo.worktree || catalogEntry.gitWorktree || null;
    const gitRepoRoot = gitInfo.repoRoot || catalogEntry.gitRepoRoot || null;

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
    };
  }

  // Priority 2: Fall back to JSONL parsing for uncataloged sessions
  const metadata = await extractSessionMetadataFromJSONL(filePath);

  if (!metadata.sessionId) {
    return null;
  }

  const gitInfo = await detectGitInfo(cwd);
  const mode = await detectSessionModeFromJSONL(filePath);

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
  const projectDir = getProjectDir(cwd);

  try {
    await fs.access(projectDir);
  } catch {
    return [];
  }

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return [];
    }

    const now = Date.now();
    const activeSessions: SessionFileInfo[] = [];

    for (const filename of jsonlFiles) {
      const filePath = path.join(projectDir, filename);
      const stats = await fs.stat(filePath);
      const mtime = stats.mtime.getTime();

      if (now - mtime <= ACTIVE_SESSION_THRESHOLD_MS) {
        const sessionId = path.basename(filename, '.jsonl');
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
  } catch {
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
  const projectDir = getProjectDir(cwd);

  try {
    await fs.access(projectDir);
  } catch {
    return null;
  }

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return null;
    }

    // Find most recent file
    let mostRecent: { filePath: string; mtime: Date; filename: string } | null = null;

    for (const filename of jsonlFiles) {
      const filePath = path.join(projectDir, filename);
      const stats = await fs.stat(filePath);

      if (!mostRecent || stats.mtime > mostRecent.mtime) {
        mostRecent = { filePath, mtime: stats.mtime, filename };
      }
    }

    if (!mostRecent) {
      return null;
    }

    const sessionId = path.basename(mostRecent.filename, '.jsonl');
    return resolveSessionMetadata(
      mostRecent.filePath, sessionId, mostRecent.mtime, cwd, catalogMap,
    );
  } catch {
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
  const projectDir = getProjectDir(cwd);

  try {
    await fs.access(projectDir);
  } catch {
    return [];
  }

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return [];
    }

    // Stat all files and sort by recency
    const fileStats: { filePath: string; mtime: Date; filename: string }[] = [];
    for (const filename of jsonlFiles) {
      const sessionId = path.basename(filename, '.jsonl');
      if (excludeIds.has(sessionId)) continue;

      const filePath = path.join(projectDir, filename);
      const stats = await fs.stat(filePath);
      fileStats.push({ filePath, mtime: stats.mtime, filename });
    }

    // Sort by most recent first, take top N
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const topN = fileStats.slice(0, count);

    const results: SessionFileInfo[] = [];
    for (const { filePath, mtime, filename } of topN) {
      const sessionId = path.basename(filename, '.jsonl');
      const resolved = await resolveSessionMetadata(
        filePath, sessionId, mtime, cwd, catalogMap,
      );
      if (resolved) {
        results.push(resolved);
      }
    }

    return results;
  } catch {
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
 * Detect session mode (planning/execution) from JSONL file
 */
async function detectSessionModeFromJSONL(filePath: string): Promise<SessionMode> {
  try {
    const entries = await parseJSONL(filePath);
    if (entries.length === 0) return null;

    const { mode } = detectModeAndPlans(entries);
    return mode;
  } catch {
    return null;
  }
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
  contextMetrics: ContextMetrics | null;
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
        continue;
      }
    }

    // Parse full content for statistics
    let contextMetrics: ContextMetrics | null = null;
    try {
      const entries = parseJSONLContent(content);
      const stats = getEntryStatistics(entries);

      if (stats.lastInputTokens > 0) {
        const contextWindowSize = DEFAULT_CONTEXT_WINDOW_SIZE;
        const usedPercentage = (stats.lastInputTokens / contextWindowSize) * 100;

        contextMetrics = {
          used_percentage: Math.min(usedPercentage, 100),
          remaining_percentage: Math.max(100 - usedPercentage, 0),
          context_window_size: contextWindowSize,
          total_input_tokens: stats.totalInputTokens,
          total_output_tokens: stats.totalOutputTokens,
          is_estimate: true,
        };
      }
    } catch {
      // Statistics extraction failed, metrics remain null
    }

    return { sessionId, gitBranch, title, contextMetrics };
  } catch {
    return {
      sessionId: null,
      gitBranch: null,
      title: null,
      contextMetrics: null,
    };
  }
}
