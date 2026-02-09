/**
 * Metadata Extractor
 *
 * Extracts session metadata from JSONL files and catalog data.
 * Builds the session index using a catalog-first strategy.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { parseJSONL, getEntryStatistics, type ParsedEntry } from "../session/parser.js";
import { listSubagentFiles, decodeProjectPath, type SubagentFile } from "../session/detector.js";
import { readProjectIndex } from "../context/indexer.js";
import type { SubagentEntry as CatalogSubagentEntry, PlanEntry as CatalogPlanEntry } from "../context/types.js";
import type { SessionManifest } from "../catalog/types.js";
import type { SessionEntry, SessionIndex, PlanRef, ExploreAgentRef, WebSearchRef } from "./types.js";
import { CLAUDE_PROJECTS_PATH } from "./types.js";
import { detectGitInfo, readGitBranchFromJsonl } from "./git-utils.js";
import { detectModeAndPlans } from "./mode-detector.js";
import { writeSessionIndex } from "./persistence.js";
import { isNotFoundError, getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";

const logger: Logger = createLogger({ prefix: "[Metadata]" });

/**
 * Extract session title from parsed JSONL entries.
 * Priority:
 *   1. Summary entry (Claude's auto-generated title)
 *   2. First real user message (skips internal command messages)
 */
export function extractTitle(
  entries: Array<{ type: string; content: { summary?: string; text?: string } }>
): string {
  // Try summary first
  const summaryEntry = entries.find((e) => e.type === "summary" && e.content.summary);
  if (summaryEntry?.content.summary) {
    return summaryEntry.content.summary;
  }

  // Fallback to first real user message (skip internal command messages)
  const userMessage = entries.find(
    (e) => {
      if (e.type !== "user_message" || !e.content.text) return false;
      const text = e.content.text.trim();
      // Skip internal Claude Code messages
      if (text.startsWith("<local-command")) return false;
      if (text.startsWith("<command-")) return false;
      if (text.length === 0) return false;
      return true;
    }
  );
  if (userMessage?.content.text) {
    // Truncate long messages
    const text = userMessage.content.text.trim();
    if (text.length > 100) {
      return text.slice(0, 97) + "...";
    }
    return text;
  }

  return "Untitled Session";
}

/**
 * Extract timestamps from entries
 */
export function extractTimestamps(
  entries: Array<{ timestamp: string }>
): { startedAt: string; endedAt: string } {
  if (entries.length === 0) {
    const now = new Date().toISOString();
    return { startedAt: now, endedAt: now };
  }

  // Find earliest and latest timestamps
  let startedAt = entries[0].timestamp;
  let endedAt = entries[0].timestamp;

  for (const entry of entries) {
    if (entry.timestamp < startedAt) {
      startedAt = entry.timestamp;
    }
    if (entry.timestamp > endedAt) {
      endedAt = entry.timestamp;
    }
  }

  return { startedAt, endedAt };
}

/**
 * Extract explore agents and web searches from entries.
 * For explore agents, computes token cost from their subagent JSONL files.
 */
async function extractAgentsAndSearches(
  entries: ParsedEntry[],
  subagentFiles: SubagentFile[]
): Promise<{
  exploreAgents: ExploreAgentRef[];
  webSearches: WebSearchRef[];
}> {
  const exploreAgents: ExploreAgentRef[] = [];
  const webSearches: WebSearchRef[] = [];
  const seenAgentIds = new Set<string>();
  const seenQueries = new Set<string>();

  // Build a map of agentId -> subagent file for quick lookup
  const subagentFileMap = new Map<string, SubagentFile>();
  for (const f of subagentFiles) {
    subagentFileMap.set(f.agentId, f);
  }

  for (const entry of entries) {
    // Extract explore agents from agent_progress entries
    if (entry.type === 'agent_progress' && entry.content.agentType === 'Explore') {
      const agentId = entry.content.agentId;
      if (agentId && !seenAgentIds.has(agentId)) {
        seenAgentIds.add(agentId);
        exploreAgents.push({
          id: agentId,
          description: entry.content.agentDescription || 'Explore codebase',
          timestamp: entry.timestamp,
        });
      }
    }

    // Extract web searches from web_search entries with results
    if (entry.type === 'web_search' && entry.content.searchType === 'results') {
      const query = entry.content.searchQuery;
      if (query && !seenQueries.has(query)) {
        seenQueries.add(query);
        webSearches.push({
          query,
          resultCount: entry.content.searchResultCount || 0,
          timestamp: entry.timestamp,
        });
      }
    }
  }

  // Compute token costs for explore agents from their subagent JSONL files
  for (const agent of exploreAgents) {
    const subagentFile = subagentFileMap.get(agent.id);
    if (subagentFile) {
      try {
        const subEntries = await parseJSONL(subagentFile.filePath);
        if (subEntries.length > 0) {
          const subStats = getEntryStatistics(subEntries);
          // Total cost = last turn's context window size + estimated output
          const inputCost = subStats.lastInputTokens + subStats.lastCacheRead;
          const outputCost = subStats.totalOutputTokensEstimated;
          agent.tokenCost = inputCost + outputCost;
        }
      } catch (err) {
        logger.warn(`Failed to parse subagent ${agent.id}:`, getErrorMessage(err));
      }
    }
  }

  return { exploreAgents, webSearches };
}

/**
 * Convert a catalog SubagentEntry (type=exploration) to an ExploreAgentRef.
 */
function catalogSubagentToExploreRef(entry: CatalogSubagentEntry): ExploreAgentRef {
  return {
    id: entry.id,
    description: entry.title,
    timestamp: entry.timestamp,
    tokenCost: entry.tokenCost,
  };
}

/**
 * Convert a catalog SubagentEntry (type=search) to a WebSearchRef.
 */
function catalogSubagentToSearchRef(entry: CatalogSubagentEntry): WebSearchRef {
  return {
    query: entry.title,
    resultCount: entry.resultCount || 0,
    timestamp: entry.timestamp,
  };
}

/**
 * Convert a catalog PlanEntry to a partial PlanRef.
 * messageIndex is set to 0 since catalog doesn't track this.
 */
function catalogPlanToPlanRef(plan: CatalogPlanEntry): PlanRef {
  return {
    title: plan.title,
    source: "embedded",
    messageIndex: 0,
    catalogId: plan.id,
  };
}

/**
 * Read the session manifest JSON from .jacques/sessions/{id}.json.
 * Returns null if file doesn't exist or is unreadable.
 */
async function readSessionManifest(
  projectPath: string,
  sessionId: string
): Promise<SessionManifest | null> {
  try {
    const manifestPath = path.join(projectPath, ".jacques", "sessions", `${sessionId}.json`);
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content) as SessionManifest;
  } catch (err) {
    if (!isNotFoundError(err)) {
      logger.warn(`Failed to read session manifest ${sessionId}:`, getErrorMessage(err));
    }
    return null;
  }
}

/**
 * Extract metadata from a single JSONL file
 */
export async function extractSessionMetadata(
  jsonlPath: string,
  projectPath: string,
  projectSlug: string
): Promise<SessionEntry | null> {
  try {
    // Get file stats
    const stats = await fs.stat(jsonlPath);
    const sessionId = path.basename(jsonlPath, ".jsonl");

    // Parse JSONL to get metadata
    const entries = await parseJSONL(jsonlPath);

    if (entries.length === 0) {
      return null;
    }

    // Get statistics
    const entryStats = getEntryStatistics(entries);

    // Get timestamps
    const { startedAt, endedAt } = extractTimestamps(entries);

    // Get title
    const title = extractTitle(entries);

    // Check for subagents
    const subagentFiles = await listSubagentFiles(jsonlPath);

    // Filter out internal agents (prompt_suggestion, acompact) from user-visible count
    // These are system agents that shouldn't appear in the subagent count
    const userVisibleSubagents = subagentFiles.filter((f: SubagentFile) =>
      !f.agentId.startsWith('aprompt_suggestion-') &&
      !f.agentId.startsWith('acompact-')
    );

    // Track if auto-compact occurred (for showing indicator in UI)
    const autoCompactFile = subagentFiles.find((f: SubagentFile) =>
      f.agentId.startsWith('acompact-')
    );
    const hadAutoCompact = !!autoCompactFile;
    const autoCompactAt = autoCompactFile?.modifiedAt.toISOString();

    const hasSubagents = userVisibleSubagents.length > 0;

    // Detect mode and plans
    const { mode, planRefs } = detectModeAndPlans(entries);

    // Extract explore agents and web searches (with token costs from subagent files)
    const { exploreAgents, webSearches } = await extractAgentsAndSearches(entries, subagentFiles);

    // Detect git info from project path
    const gitInfo = detectGitInfo(projectPath);

    // If detectGitInfo failed (e.g., deleted worktree), read gitBranch from raw JSONL
    if (!gitInfo.branch) {
      gitInfo.branch = await readGitBranchFromJsonl(jsonlPath) || undefined;
    }

    // Use LAST turn's input tokens for context window size
    // Each turn reports the FULL context, so summing would overcount
    // Total context = fresh input + cache read (cache_creation is subset of fresh, not additional)
    const totalInput = entryStats.lastInputTokens + entryStats.lastCacheRead;
    // Use tiktoken-estimated output tokens (cumulative - each turn generates NEW output)
    const totalOutput = entryStats.totalOutputTokensEstimated;
    const hasTokens = totalInput > 0 || totalOutput > 0;

    return {
      id: sessionId,
      jsonlPath,
      projectPath,
      projectSlug,
      title,
      startedAt,
      endedAt,
      messageCount: entryStats.userMessages + entryStats.assistantMessages,
      toolCallCount: entryStats.toolCalls,
      hasSubagents,
      subagentIds: hasSubagents
        ? userVisibleSubagents.map((f: SubagentFile) => f.agentId)
        : undefined,
      hadAutoCompact: hadAutoCompact || undefined,
      autoCompactAt: autoCompactAt || undefined,
      tokens: hasTokens ? {
        input: totalInput,
        output: totalOutput,
        cacheCreation: entryStats.lastCacheCreation,
        cacheRead: entryStats.lastCacheRead,
      } : undefined,
      fileSizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      mode: mode || undefined,
      planCount: planRefs.length > 0 ? planRefs.length : undefined,
      planRefs: planRefs.length > 0 ? planRefs : undefined,
      gitRepoRoot: gitInfo.repoRoot || undefined,
      gitBranch: gitInfo.branch || undefined,
      gitWorktree: gitInfo.worktree || undefined,
      exploreAgents: exploreAgents.length > 0 ? exploreAgents : undefined,
      webSearches: webSearches.length > 0 ? webSearches : undefined,
    };
  } catch (err) {
    const sessionId = path.basename(jsonlPath, ".jsonl");
    logger.error(`Failed to extract metadata for ${sessionId}:`, getErrorMessage(err));
    return null;
  }
}

/**
 * List all project directories in ~/.claude/projects/
 */
export async function listAllProjects(): Promise<
  Array<{ encodedPath: string; projectPath: string; projectSlug: string }>
> {
  const projects: Array<{
    encodedPath: string;
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
        const projectSlug = path.basename(projectPath);

        projects.push({
          encodedPath: path.join(CLAUDE_PROJECTS_PATH, entry.name),
          projectPath,
          projectSlug,
        });
      }
    }
  } catch (err) {
    if (!isNotFoundError(err)) {
      logger.warn("Failed to list projects:", getErrorMessage(err));
    }
  }

  return projects;
}

/**
 * Build session entries from catalog data (fast path).
 *
 * For each project:
 * 1. Read .jacques/index.json for catalog metadata
 * 2. List JSONL files in the encoded project dir
 * 3. Stat JSONL files for size/mtime (in parallel)
 * 4. Convert catalog entries to SessionEntry
 * 5. Identify uncataloged JSONL files for fallback parsing
 */
async function buildFromCatalog(
  projects: Array<{ encodedPath: string; projectPath: string; projectSlug: string }>
): Promise<{
  catalogSessions: SessionEntry[];
  uncatalogedFiles: Array<{ filePath: string; projectPath: string; projectSlug: string }>;
}> {
  const catalogSessions: SessionEntry[] = [];
  const uncatalogedFiles: Array<{ filePath: string; projectPath: string; projectSlug: string }> = [];

  for (const project of projects) {
    // Read catalog index (returns empty default if missing)
    const index = await readProjectIndex(project.projectPath);

    // List JSONL files in the encoded project directory
    let jsonlFilenames: string[] = [];
    try {
      const dirEntries = await fs.readdir(project.encodedPath, { withFileTypes: true });
      jsonlFilenames = dirEntries
        .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
        .map((e) => e.name);
    } catch (err) {
      if (!isNotFoundError(err)) {
        logger.warn(`Skipping unreadable project dir ${project.projectSlug}:`, getErrorMessage(err));
      }
      continue;
    }

    // Build set of cataloged session IDs
    const catalogedSessionIds = new Set(index.sessions.map((s) => s.id));

    // Stat all JSONL files in parallel
    const statResults = await Promise.all(
      jsonlFilenames.map(async (filename) => {
        const jsonlPath = path.join(project.encodedPath, filename);
        const sessionId = path.basename(filename, ".jsonl");
        try {
          const stats = await fs.stat(jsonlPath);
          return { sessionId, jsonlPath, stats, filename };
        } catch {
          return null; // File disappeared between readdir and stat (race condition)
        }
      })
    );

    for (const result of statResults) {
      if (!result) continue;
      const { sessionId, jsonlPath, stats } = result;

      if (!catalogedSessionIds.has(sessionId)) {
        // Not in catalog - needs JSONL parsing
        uncatalogedFiles.push({
          filePath: jsonlPath,
          projectPath: project.projectPath,
          projectSlug: project.projectSlug,
        });
        continue;
      }

      // Find catalog session entry
      const catalogSession = index.sessions.find((s) => s.id === sessionId);
      if (!catalogSession) continue;

      // Staleness check: if JSONL is newer than catalog savedAt, re-parse
      const jsonlMtime = stats.mtime.toISOString();
      // Read the session manifest for planRefs and precise mtime check
      const manifest = await readSessionManifest(project.projectPath, sessionId);

      if (catalogSession.savedAt && jsonlMtime > catalogSession.savedAt) {
        if (!manifest || jsonlMtime > manifest.jsonlModifiedAt) {
          uncatalogedFiles.push({
            filePath: jsonlPath,
            projectPath: project.projectPath,
            projectSlug: project.projectSlug,
          });
          continue;
        }
      }

      // Map subagents from index
      const exploreSubagents = index.subagents.filter(
        (s) => s.sessionId === sessionId && s.type === "exploration"
      );
      const searchSubagents = index.subagents.filter(
        (s) => s.sessionId === sessionId && s.type === "search"
      );

      // Use planRefs from manifest (preserves source: embedded/write/agent)
      // Fall back to reconstructing from PlanEntry if manifest lacks planRefs
      let planRefs: PlanRef[] = [];
      if (manifest?.planRefs && manifest.planRefs.length > 0) {
        // Manifest has full planRefs with correct source types
        planRefs = manifest.planRefs.map((ref) => {
          // Find matching catalogId from planIds
          const catalogId = catalogSession.planIds?.find((pid) =>
            index.plans.some((p) => p.id === pid)
          );
          return {
            title: ref.title,
            source: ref.source,
            messageIndex: ref.messageIndex,
            filePath: ref.filePath,
            agentId: ref.agentId,
            catalogId: ref.catalogId || catalogId,
          };
        });
      } else if (catalogSession.planIds) {
        // Fallback: reconstruct from PlanEntry (older manifests without planRefs)
        for (const planId of catalogSession.planIds) {
          const plan = index.plans.find((p) => p.id === planId);
          if (plan) {
            planRefs.push(catalogPlanToPlanRef(plan));
          }
        }
      }

      const exploreAgents = exploreSubagents.map(catalogSubagentToExploreRef);
      const webSearches = searchSubagents.map(catalogSubagentToSearchRef);

      // Detect git info — probe filesystem first, fall back to JSONL
      const gitInfo = detectGitInfo(project.projectPath);
      if (!gitInfo.branch) {
        gitInfo.branch = await readGitBranchFromJsonl(jsonlPath) || undefined;
      }

      // Build SessionEntry from catalog data + file stats
      const entry: SessionEntry = {
        id: sessionId,
        jsonlPath,
        projectPath: project.projectPath,
        projectSlug: project.projectSlug,
        title: catalogSession.title,
        startedAt: catalogSession.startedAt,
        endedAt: catalogSession.endedAt,
        messageCount: catalogSession.messageCount,
        toolCallCount: catalogSession.toolCallCount,
        hasSubagents: catalogSession.hasSubagents ?? false,
        subagentIds: catalogSession.subagentIds,
        hadAutoCompact: catalogSession.hadAutoCompact || undefined,
        tokens: catalogSession.tokens,
        fileSizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        mode: catalogSession.mode || undefined,
        planCount: planRefs.length > 0 ? planRefs.length : (catalogSession.planCount || undefined),
        planRefs: planRefs.length > 0 ? planRefs : undefined,
        gitRepoRoot: gitInfo.repoRoot || undefined,
        gitBranch: gitInfo.branch || undefined,
        gitWorktree: gitInfo.worktree || undefined,
        exploreAgents: exploreAgents.length > 0 ? exploreAgents : undefined,
        webSearches: webSearches.length > 0 ? webSearches : undefined,
      };

      catalogSessions.push(entry);
    }
  }

  return { catalogSessions, uncatalogedFiles };
}

/**
 * Scan all sessions and build the index.
 *
 * Uses catalog-first loading: reads pre-extracted metadata from .jacques/index.json
 * for each project, only falling back to JSONL parsing for new/uncataloged sessions.
 */
export async function buildSessionIndex(options?: {
  /** Progress callback - called for each session scanned */
  onProgress?: (progress: {
    phase: "scanning" | "processing";
    total: number;
    completed: number;
    current: string;
  }) => void;
}): Promise<SessionIndex> {
  const { onProgress } = options || {};

  onProgress?.({
    phase: "scanning",
    total: 0,
    completed: 0,
    current: "Scanning projects...",
  });

  // Get all projects
  const projects = await listAllProjects();

  // Phase 1: Read catalog data (fast - reads .jacques/index.json + stats JSONL files)
  const { catalogSessions, uncatalogedFiles } = await buildFromCatalog(projects);

  const totalFiles = catalogSessions.length + uncatalogedFiles.length;

  onProgress?.({
    phase: "processing",
    total: totalFiles,
    completed: catalogSessions.length,
    current: `${catalogSessions.length} from catalog, ${uncatalogedFiles.length} to parse...`,
  });

  // Phase 2: Parse only uncataloged/stale sessions (slow path - only for new sessions)
  const sessions: SessionEntry[] = [...catalogSessions];

  for (let i = 0; i < uncatalogedFiles.length; i++) {
    const file = uncatalogedFiles[i];
    const sessionId = path.basename(file.filePath, ".jsonl");

    onProgress?.({
      phase: "processing",
      total: totalFiles,
      completed: catalogSessions.length + i,
      current: `${file.projectSlug}/${sessionId.substring(0, 8)}...`,
    });

    const metadata = await extractSessionMetadata(
      file.filePath,
      file.projectPath,
      file.projectSlug
    );

    if (metadata) {
      sessions.push(metadata);
    }
  }

  // Sort by modification time (newest first)
  sessions.sort(
    (a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  );

  const index: SessionIndex = {
    version: "2.0.0",
    lastScanned: new Date().toISOString(),
    sessions,
  };

  // Save to disk
  await writeSessionIndex(index);

  onProgress?.({
    phase: "processing",
    total: totalFiles,
    completed: totalFiles,
    current: "Complete",
  });

  return index;
}
