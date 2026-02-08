/**
 * Bulk Archive (Legacy)
 *
 * @deprecated This module is being replaced by the hybrid architecture in core/src/cache/.
 * The new architecture reads directly from JSONL files without copying content.
 *
 * This module remains for backwards compatibility with the old archive system.
 * New code should use the session-index module from core/src/cache/ instead.
 *
 * Functions for scanning and bulk-archiving Claude Code conversations.
 * Scans ~/.claude/projects/ for all session files and archives them
 * to the global archive.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import type {
  ArchiveProgress,
  ArchiveInitResult,
  SessionFileInfo,
  SubagentSummary,
} from "./types.js";
import { extractManifest } from "./manifest-extractor.js";
import { archiveConversation, listManifests } from "./archive-store.js";
import { parseJSONL, getEntryStatistics } from "../session/parser.js";
import { transformToSavedContext } from "../session/transformer.js";
import { FilterType, applyFilter } from "../session/filters.js";
import { listSubagentFiles, decodeProjectPath, decodeProjectPathNaive } from "../session/detector.js";

// Re-export for backwards compatibility (archive/index.ts exports these)
export { decodeProjectPath, decodeProjectPathNaive };
import {
  archiveSubagent,
  isSubagentArchived,
  type ArchivedSubagent,
  type SubagentReference,
  createSubagentReference,
} from "./subagent-store.js";

/** Claude projects directory */
const CLAUDE_PROJECTS_PATH = path.join(homedir(), ".claude", "projects");

/**
 * List all project directories in ~/.claude/projects/
 */
export async function listAllProjects(): Promise<
  Array<{ encodedPath: string; projectId: string; projectPath: string; projectSlug: string }>
> {
  const projects: Array<{
    encodedPath: string;
    projectId: string;
    projectPath: string;
    projectSlug: string;
  }> = [];

  try {
    const entries = await fs.readdir(CLAUDE_PROJECTS_PATH, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = await decodeProjectPath(entry.name);
        // Generate projectId from full path using dash-encoding
        const projectId = projectPath.replace(/\//g, "-");
        const projectSlug = path.basename(projectPath);

        projects.push({
          encodedPath: path.join(CLAUDE_PROJECTS_PATH, entry.name),
          projectId,
          projectPath,
          projectSlug,
        });
      }
    }
  } catch {
    // Projects directory doesn't exist
  }

  return projects;
}

/**
 * List all session JSONL files across all projects.
 */
export async function listAllSessions(): Promise<SessionFileInfo[]> {
  const sessions: SessionFileInfo[] = [];
  const projects = await listAllProjects();

  for (const project of projects) {
    try {
      const entries = await fs.readdir(project.encodedPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const sessionId = entry.name.replace(".jsonl", "");
          const filePath = path.join(project.encodedPath, entry.name);

          try {
            const stats = await fs.stat(filePath);
            sessions.push({
              filePath,
              sessionId,
              projectId: project.projectId,
              projectPath: project.projectPath,
              projectSlug: project.projectSlug,
              modifiedAt: stats.mtime,
              sizeBytes: stats.size,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip projects we can't read
    }
  }

  // Sort by modification time (newest first)
  sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

  return sessions;
}

/**
 * Check if a session is already archived.
 */
export async function isSessionArchived(sessionId: string): Promise<boolean> {
  const manifestIds = await listManifests();
  return manifestIds.includes(sessionId);
}

/**
 * Parse and archive a single subagent file.
 * Returns the archived subagent data or null if archiving fails.
 */
async function archiveSubagentFile(
  subagentFilePath: string,
  agentId: string,
  sessionId: string,
  projectSlug: string,
  force: boolean = false
): Promise<ArchivedSubagent | null> {
  try {
    // Check if already archived (unless forcing)
    if (!force && (await isSubagentArchived(agentId))) {
      return null;
    }

    // Parse the subagent JSONL
    const entries = await parseJSONL(subagentFilePath);
    if (entries.length === 0) {
      return null;
    }

    // Get statistics
    const stats = getEntryStatistics(entries);

    // Transform to display messages
    const savedContext = transformToSavedContext(entries, {
      sessionFile: {
        filePath: subagentFilePath,
        sessionId: agentId,
        modifiedAt: new Date(),
        sizeBytes: 0,
      },
      sessionSlug: `agent-${agentId}`,
      workingDirectory: "",
    });

    // Extract prompt from first user message
    const firstUserEntry = entries.find((e) => e.type === "user_message");
    const prompt = firstUserEntry?.content.text || "Unknown task";

    // Extract model from first assistant entry
    const firstAssistant = entries.find(
      (e) => e.type === "assistant_message" || e.type === "tool_call"
    );
    const model = firstAssistant?.content.model;

    // Create archived subagent
    const archivedSubagent: ArchivedSubagent = {
      id: agentId,
      sessionId,
      projectSlug,
      archivedAt: new Date().toISOString(),
      prompt,
      model,
      conversation: savedContext.conversation,
      statistics: {
        messageCount: stats.userMessages + stats.assistantMessages,
        toolCallCount: stats.toolCalls,
        tokens: {
          totalInput: stats.totalInputTokens,
          totalOutput: stats.totalOutputTokens,
          cacheCreation:
            stats.totalCacheCreation > 0 ? stats.totalCacheCreation : undefined,
          cacheRead:
            stats.totalCacheRead > 0 ? stats.totalCacheRead : undefined,
        },
        durationMs:
          stats.totalDurationMs > 0 ? stats.totalDurationMs : undefined,
      },
    };

    // Archive to storage
    await archiveSubagent(archivedSubagent);

    return archivedSubagent;
  } catch {
    return null;
  }
}

/**
 * Archive a single session file.
 * Returns true if archived, false if skipped (already archived or error).
 * Also archives any subagent conversations associated with this session.
 */
export async function archiveSessionFile(
  session: SessionFileInfo,
  options: { saveToLocal?: boolean; filterType?: FilterType; force?: boolean } = {}
): Promise<{ archived: boolean; error?: string; subagentsArchived?: number }> {
  try {
    // Use provided filter type or default to EVERYTHING (preserves all content types)
    const filterType = options.filterType ?? FilterType.EVERYTHING;
    const force = options.force ?? false;

    // Parse the JSONL file
    const entries = await parseJSONL(session.filePath);

    if (entries.length === 0) {
      return { archived: false, error: "Empty session file" };
    }

    // Detect and archive subagents
    const subagentFiles = await listSubagentFiles(session.filePath);
    const subagentRefs: SubagentReference[] = [];
    let subagentTotalTokens = 0;
    const subagentIds: string[] = [];

    // Find agent_progress entries to determine position in parent conversation
    const agentProgressIndices = new Map<string, number>();
    entries.forEach((entry, index) => {
      if (entry.type === "agent_progress" && entry.content.agentId) {
        agentProgressIndices.set(entry.content.agentId, index);
      }
    });

    for (const subagentFile of subagentFiles) {
      const archivedSubagent = await archiveSubagentFile(
        subagentFile.filePath,
        subagentFile.agentId,
        session.sessionId,
        session.projectSlug,
        force
      );

      if (archivedSubagent) {
        const positionIndex =
          agentProgressIndices.get(subagentFile.agentId) ?? subagentRefs.length;
        const ref = createSubagentReference(
          archivedSubagent,
          positionIndex,
          entries[positionIndex - 1]?.uuid
        );
        subagentRefs.push(ref);
        subagentTotalTokens += ref.tokenCount;
        subagentIds.push(subagentFile.agentId);
      }
    }

    // Extract manifest
    const manifest = await extractManifest(
      session.filePath,
      session.projectPath,
      { autoArchived: false }
    );

    // Add subagent summary to manifest if any were found
    if (subagentIds.length > 0) {
      manifest.subagents = {
        count: subagentIds.length,
        totalTokens: subagentTotalTokens,
        ids: subagentIds,
      };
    }

    // Apply selected filter and transform
    const filteredEntries = applyFilter(entries, filterType);
    const savedContext = transformToSavedContext(filteredEntries, {
      sessionFile: {
        filePath: session.filePath,
        sessionId: session.sessionId,
        modifiedAt: session.modifiedAt,
        sizeBytes: session.sizeBytes,
      },
      sessionSlug: manifest.title.substring(0, 30),
      workingDirectory: session.projectPath,
      filterType,
    });

    // Archive the conversation
    await archiveConversation(savedContext, manifest, {
      saveToLocal: options.saveToLocal ?? false,
    });

    return {
      archived: true,
      subagentsArchived: subagentIds.length,
    };
  } catch (error) {
    return {
      archived: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Initialize the archive by bulk-archiving all sessions.
 * Skips sessions that are already archived (unless force=true).
 */
export async function initializeArchive(options: {
  /** Whether to save to local project directories as well */
  saveToLocal?: boolean;
  /** Force re-archiving of all sessions (skips already-archived check) */
  force?: boolean;
  /** Filter type to use when archiving (default: EVERYTHING for full content) */
  filterType?: FilterType;
  /** Progress callback - called for each step */
  onProgress?: (progress: ArchiveProgress) => void;
}): Promise<ArchiveInitResult> {
  const {
    saveToLocal = false,
    force = false,
    filterType = FilterType.EVERYTHING,
    onProgress,
  } = options;

  const result: ArchiveInitResult = {
    totalSessions: 0,
    archived: 0,
    skipped: 0,
    errors: 0,
  };

  // Phase 1: Scan for sessions
  onProgress?.({
    phase: "scanning",
    total: 0,
    completed: 0,
    current: "Scanning projects...",
    skipped: 0,
    errors: 0,
  });

  const sessions = await listAllSessions();
  result.totalSessions = sessions.length;

  if (sessions.length === 0) {
    return result;
  }

  // Get already archived session IDs (only needed when not forcing)
  const archivedIds = force ? new Set<string>() : new Set(await listManifests());

  // Phase 2: Archive sessions
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];

    onProgress?.({
      phase: "archiving",
      total: sessions.length,
      completed: i,
      current: `${session.projectSlug}/${session.sessionId.substring(0, 8)}...`,
      skipped: result.skipped,
      errors: result.errors,
    });

    // Check if already archived (skip check when force=true)
    if (!force && archivedIds.has(session.sessionId)) {
      result.skipped++;
      continue;
    }

    // Archive the session with the specified filter type
    const archiveResult = await archiveSessionFile(session, {
      saveToLocal,
      filterType,
      force,
    });

    if (archiveResult.archived) {
      result.archived++;
    } else if (archiveResult.error) {
      result.errors++;
    } else {
      result.skipped++;
    }
  }

  // Final progress update
  onProgress?.({
    phase: "archiving",
    total: sessions.length,
    completed: sessions.length,
    current: "Complete",
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}
