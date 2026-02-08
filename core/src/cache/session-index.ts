/**
 * Session Index
 *
 * Lightweight index for fast session listing and search.
 * Reads directly from Claude Code JSONL files - no content copying.
 *
 * Architecture:
 *   ~/.claude/projects/...           (SOURCE OF TRUTH)
 *          ↓ read directly
 *   GUI Viewer
 *          ↑
 *   ~/.jacques/cache/
 *     └── sessions-index.json        (~5KB, metadata only)
 */

import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { parseJSONL, getEntryStatistics, type ParsedEntry } from "../session/parser.js";
import { listSubagentFiles, decodeProjectPath, getClaudeProjectsDir, type SubagentFile } from "../session/detector.js";
import { PLAN_TRIGGER_PATTERNS, extractPlanTitle } from "../archive/plan-extractor.js";
import { readProjectIndex } from "../context/indexer.js";
import type { SubagentEntry as CatalogSubagentEntry, PlanEntry as CatalogPlanEntry, SessionEntry as IndexSessionEntry } from "../context/types.js";
import type { SessionManifest } from "../catalog/types.js";

/** Claude projects directory (resolved via config/env) */
const CLAUDE_PROJECTS_PATH = getClaudeProjectsDir();

/** Jacques cache directory */
const JACQUES_CACHE_PATH = path.join(homedir(), ".jacques", "cache");

/** Session index filename */
const SESSION_INDEX_FILE = "sessions-index.json";

/**
 * Entry in the session index
 * Contains only metadata - content is read directly from JSONL
 */
export interface SessionEntry {
  /** Session UUID */
  id: string;
  /** Full path to JSONL file */
  jsonlPath: string;
  /** Decoded project path (e.g., "/Users/gole/Desktop/my-project") */
  projectPath: string;
  /** Project name (basename of project path) */
  projectSlug: string;
  /** Session title (from summary or first user message) */
  title: string;
  /** First timestamp in session */
  startedAt: string;
  /** Last timestamp in session */
  endedAt: string;
  /** Count of user + assistant messages */
  messageCount: number;
  /** Count of tool calls */
  toolCallCount: number;
  /** Whether user-visible subagents exist (excludes internal agents) */
  hasSubagents: boolean;
  /** User-visible subagent IDs (excludes prompt_suggestion, acompact) */
  subagentIds?: string[];
  /** Whether auto-compact occurred during this session */
  hadAutoCompact?: boolean;
  /** Timestamp when auto-compact occurred (ISO string) */
  autoCompactAt?: string;
  /** Token usage stats */
  tokens?: {
    /** Fresh input tokens (non-cached) */
    input: number;
    /** Output tokens generated */
    output: number;
    /** Tokens written to cache */
    cacheCreation: number;
    /** Tokens read from cache */
    cacheRead: number;
  };
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  gitRepoRoot?: string;
  /** Git branch name at time of indexing */
  gitBranch?: string;
  /** Git worktree name (basename of project dir, only set for worktrees) */
  gitWorktree?: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** File modification time */
  modifiedAt: string;
  /** Session mode: 'planning' if EnterPlanMode tool was called, 'execution' if started with plan trigger */
  mode?: 'planning' | 'execution' | null;
  /** Number of plans detected in this session */
  planCount?: number;
  /** Plan references for display */
  planRefs?: Array<{
    /** Plan title extracted from content */
    title: string;
    /** Source: 'embedded' for inline plans, 'write' for Write tool plans, 'agent' for Plan subagent */
    source: 'embedded' | 'write' | 'agent';
    /** All detection methods that found this plan (when deduplicated) */
    sources?: Array<'embedded' | 'write' | 'agent'>;
    /** Index of the message containing this plan */
    messageIndex: number;
    /** File path if plan was written to disk */
    filePath?: string;
    /** Agent ID for Plan subagent source */
    agentId?: string;
    /** Links to PlanEntry.id in catalog (.jacques/index.json) */
    catalogId?: string;
  }>;
  /** Explore agent references */
  exploreAgents?: Array<{
    /** Agent ID from agent_progress */
    id: string;
    /** Short description from Task tool call */
    description: string;
    /** Timestamp when agent was called */
    timestamp: string;
    /** Estimated total token cost (input + output) from subagent JSONL */
    tokenCost?: number;
  }>;
  /** Web search references */
  webSearches?: Array<{
    /** Search query */
    query: string;
    /** Number of results returned */
    resultCount: number;
    /** Timestamp of search */
    timestamp: string;
  }>;
}

/**
 * Session index structure
 */
export interface SessionIndex {
  version: "2.0.0";
  lastScanned: string;
  sessions: SessionEntry[];
}

/**
 * Get default empty session index
 */
export function getDefaultSessionIndex(): SessionIndex {
  return {
    version: "2.0.0",
    lastScanned: new Date().toISOString(),
    sessions: [],
  };
}

// Re-export for backwards compatibility (cache/index.ts exports this)
export { decodeProjectPath };

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return JACQUES_CACHE_PATH;
}

/**
 * Get the session index file path
 */
export function getIndexPath(): string {
  return path.join(JACQUES_CACHE_PATH, SESSION_INDEX_FILE);
}

/**
 * Ensure cache directory exists
 */
export async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(JACQUES_CACHE_PATH, { recursive: true });
}

/**
 * Read the session index from disk
 */
export async function readSessionIndex(): Promise<SessionIndex> {
  try {
    const indexPath = getIndexPath();
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content) as SessionIndex;
  } catch {
    return getDefaultSessionIndex();
  }
}

/**
 * Write the session index to disk
 */
export async function writeSessionIndex(index: SessionIndex): Promise<void> {
  await ensureCacheDir();
  const indexPath = getIndexPath();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Extract session title from parsed JSONL entries.
 * Priority:
 *   1. Summary entry (Claude's auto-generated title)
 *   2. First real user message (skips internal command messages)
 */
function extractTitle(
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
function extractTimestamps(
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
 * Plan reference for session display
 */
interface PlanRef {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  /** All detection methods that found this plan (when deduplicated) */
  sources?: Array<'embedded' | 'write' | 'agent'>;
  messageIndex: number;
  filePath?: string;
  agentId?: string;
  catalogId?: string;
}

/**
 * Detect session mode (planning vs execution) and extract plan references.
 *
 * - Planning mode: EnterPlanMode tool was called during session
 * - Execution mode: First user message contains plan trigger pattern
 */
export function detectModeAndPlans(entries: ParsedEntry[]): {
  mode: 'planning' | 'execution' | null;
  planRefs: PlanRef[];
} {
  let mode: 'planning' | 'execution' | null = null;
  const planRefs: PlanRef[] = [];

  // Track if EnterPlanMode was called (planning mode)
  let hasEnterPlanMode = false;
  // Track first real user message for execution mode detection
  let firstUserMessageChecked = false;

  entries.forEach((entry, index) => {
    // Check for EnterPlanMode tool call (planning mode)
    if (entry.type === 'tool_call' && entry.content.toolName === 'EnterPlanMode') {
      hasEnterPlanMode = true;
    }

    // Check first user message for execution mode
    if (entry.type === 'user_message' && entry.content.text && !firstUserMessageChecked) {
      const text = entry.content.text.trim();

      // Skip internal command messages
      if (
        text.startsWith('<local-command') ||
        text.startsWith('<command-') ||
        text.length === 0
      ) {
        return;
      }

      firstUserMessageChecked = true;

      // Check if first message matches plan trigger patterns
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        if (pattern.test(text)) {
          mode = 'execution';

          // Extract plan content and title
          const match = text.match(pattern);
          if (match) {
            const planContent = text.substring(match[0].length).trim();
            // Only count as plan if it has content with markdown heading
            if (planContent.length >= 100 && planContent.includes('#')) {
              const title = extractPlanTitle(planContent);
              planRefs.push({
                title,
                source: 'embedded',
                messageIndex: index,
              });
            }
          }
          break;
        }
      }
    }

    // Check for embedded plans in other user messages (not just first)
    if (entry.type === 'user_message' && entry.content.text && firstUserMessageChecked) {
      const text = entry.content.text.trim();

      // Skip internal command messages
      if (
        text.startsWith('<local-command') ||
        text.startsWith('<command-') ||
        text.length === 0
      ) {
        return;
      }

      // Check for plan trigger patterns in subsequent messages
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        if (pattern.test(text)) {
          const match = text.match(pattern);
          if (match) {
            const planContent = text.substring(match[0].length).trim();
            if (planContent.length >= 100 && planContent.includes('#')) {
              const title = extractPlanTitle(planContent);
              // Avoid duplicate entries for the same message
              if (!planRefs.some(r => r.messageIndex === index)) {
                planRefs.push({
                  title,
                  source: 'embedded',
                  messageIndex: index,
                });
              }
            }
          }
          break;
        }
      }
    }

    // Check for Plan agent responses from agent_progress entries
    if (entry.type === 'agent_progress' && entry.content.agentType === 'Plan') {
      const agentId = entry.content.agentId;
      if (agentId && !planRefs.some(r => r.source === 'agent' && r.agentId === agentId)) {
        planRefs.push({
          title: entry.content.agentDescription || 'Agent-Generated Plan',
          source: 'agent',
          messageIndex: index,
          agentId,
        });
      }
    }

    // Check for Write tool calls to plan files
    if (entry.type === 'tool_call' && entry.content.toolName === 'Write') {
      const input = entry.content.toolInput as { file_path?: string; content?: string } | undefined;
      const filePath = input?.file_path || '';
      const content = input?.content || '';

      // Skip code files - they're not plans even if "plan" is in the name
      const codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
        '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
        '.vue', '.svelte', '.astro',
        '.css', '.scss', '.less', '.sass',
        '.html', '.htm', '.xml', '.svg',
        '.json', '.yaml', '.yml', '.toml',
        '.sh', '.bash', '.zsh', '.fish',
        '.sql', '.graphql', '.prisma',
      ];
      const isCodeFile = codeExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
      if (isCodeFile) {
        return;
      }

      // Check if path looks like a plan file
      const pathLooksLikePlan =
        filePath.toLowerCase().includes('plan') ||
        filePath.endsWith('.plan.md') ||
        filePath.includes('.jacques/plans/');

      // Check if content looks like markdown plan (not code)
      const hasHeading = /^#+\s+.+/m.test(content);
      const hasListOrParagraph = /^[-*]\s+.+/m.test(content) || content.split('\n\n').length > 1;
      const firstLine = content.split('\n').find(line => line.trim().length > 0) || '';
      const codePatterns = [
        /^import\s+/,
        /^export\s+/,
        /^const\s+/,
        /^function\s+/,
        /^class\s+/,
        /^interface\s+/,
        /^type\s+/,
      ];
      const looksLikeCode = codePatterns.some(p => p.test(firstLine.trim()));
      const looksLikeMarkdown = hasHeading && hasListOrParagraph && !looksLikeCode;

      if (pathLooksLikePlan && looksLikeMarkdown) {
        const title = extractPlanTitle(content);
        planRefs.push({
          title,
          source: 'write',
          messageIndex: index,
          filePath,
        });
      }
    }
  });

  // Planning mode takes precedence if EnterPlanMode was called
  if (hasEnterPlanMode) {
    mode = 'planning';
  }

  return { mode, planRefs };
}

/**
 * Explore agent reference for session display
 */
interface ExploreAgentRef {
  id: string;
  description: string;
  timestamp: string;
  /** Estimated total token cost (input + output) from subagent JSONL */
  tokenCost?: number;
}

/**
 * Web search reference for session display
 */
interface WebSearchRef {
  query: string;
  resultCount: number;
  timestamp: string;
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
      } catch {
        // Subagent file couldn't be parsed, leave tokenCost undefined
      }
    }
  }

  return { exploreAgents, webSearches };
}

interface GitInfo {
  repoRoot?: string;
  branch?: string;
  worktree?: string;
}

/**
 * Detect git info for a project path: repo root, branch, and worktree name.
 * If the path doesn't exist, walks up parent directories to find a git repo.
 */
function detectGitInfo(projectPath: string): GitInfo {
  // Try the exact path first, then walk up parents if it doesn't exist
  const candidates = [projectPath];
  let dir = projectPath;
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    candidates.push(parent);
    dir = parent;
  }

  for (const candidate of candidates) {
    try {
      const output = execSync(
        `git -C "${candidate}" rev-parse --abbrev-ref HEAD --git-common-dir`,
        { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      if (!output) continue;

      const lines = output.split("\n");
      const branch = lines[0] || undefined;
      const commonDir = lines[1];

      if (!commonDir) return { branch };

      // Resolve relative paths (e.g., "../.git" from subdirectories) to absolute
      const resolved = path.resolve(candidate, commonDir);

      let repoRoot: string;
      let worktree: string | undefined;

      if (resolved.endsWith(`${path.sep}.git`) || resolved.endsWith("/.git")) {
        // Normal repo or subdirectory: .git parent is repo root
        repoRoot = path.dirname(resolved);
      } else {
        // Worktree: common dir points to shared .git dir
        repoRoot = path.dirname(resolved);
        worktree = path.basename(projectPath);
      }

      return { repoRoot, branch, worktree };
    } catch {
      // This candidate didn't work, try the next parent
      continue;
    }
  }
  return {};
}

/**
 * Read the gitBranch field from early JSONL entries.
 * Used when detectGitInfo fails (e.g., deleted worktrees).
 */
async function readGitBranchFromJsonl(jsonlPath: string): Promise<string | null> {
  try {
    const handle = await fs.open(jsonlPath, "r");
    try {
      const buf = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buf, 0, 8192, 0);
      const chunk = buf.toString("utf-8", 0, bytesRead);
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (typeof entry.gitBranch === "string") {
            return entry.gitBranch;
          }
        } catch {
          // Partial line
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    // File unreadable
  }
  return null;
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
  } catch {
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
  } catch {
    // Projects directory doesn't exist
  }

  return projects;
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
  } catch {
    return null;
  }
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
    } catch {
      continue; // Skip unreadable directories
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
          return null; // File disappeared
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

/**
 * In-flight build promise — deduplicates concurrent buildSessionIndex() calls.
 * When multiple callers (e.g. /api/sessions/by-project and /api/projects)
 * request the index simultaneously, only one build runs.
 */
let buildInProgress: Promise<SessionIndex> | null = null;

/**
 * Get the session index, building if necessary.
 * Concurrent calls that trigger a rebuild share a single build.
 * @param maxAge Maximum age in milliseconds before rebuilding (default: 5 minutes)
 */
export async function getSessionIndex(
  options?: { maxAge?: number }
): Promise<SessionIndex> {
  const { maxAge = 5 * 60 * 1000 } = options || {};

  const existing = await readSessionIndex();

  // Check if index is fresh enough
  const lastScanned = new Date(existing.lastScanned).getTime();
  const age = Date.now() - lastScanned;

  if (age < maxAge && existing.sessions.length > 0) {
    return existing;
  }

  // Deduplicate concurrent builds
  if (buildInProgress) {
    return buildInProgress;
  }

  buildInProgress = buildSessionIndex().finally(() => {
    buildInProgress = null;
  });
  return buildInProgress;
}

/**
 * Get a single session entry by ID
 */
export async function getSessionEntry(
  sessionId: string
): Promise<SessionEntry | null> {
  const index = await getSessionIndex();
  return index.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Get sessions grouped by project.
 * Uses basename of gitRepoRoot when available to group worktrees together.
 */
export async function getSessionsByProject(): Promise<
  Map<string, SessionEntry[]>
> {
  const index = await getSessionIndex();
  const byProject = new Map<string, SessionEntry[]>();

  for (const session of index.sessions) {
    // Group by git repo root basename when available (groups worktrees together)
    const groupKey = session.gitRepoRoot
      ? path.basename(session.gitRepoRoot)
      : session.projectSlug;
    const existing = byProject.get(groupKey) || [];
    existing.push(session);
    byProject.set(groupKey, existing);
  }

  return byProject;
}

/**
 * A discovered project, grouped by git repo root for git projects.
 * Non-git projects are standalone (one entry per directory).
 */
export interface DiscoveredProject {
  /** Display name — basename of gitRepoRoot, or projectSlug for non-git */
  name: string;
  /** Canonical git repo root path (null for non-git projects) */
  gitRepoRoot: string | null;
  /** Whether this is a git-based project */
  isGitProject: boolean;
  /** All decoded project paths that map to this project (multiple for worktrees) */
  projectPaths: string[];
  /** All encoded directory names in ~/.claude/projects/ */
  encodedPaths: string[];
  /** Total number of indexed sessions across all paths */
  sessionCount: number;
  /** Most recent session activity (ISO string), or null if no sessions */
  lastActivity: string | null;
}

/**
 * Discover all projects from ~/.claude/projects/, grouped by git repo root.
 * Git worktrees of the same repo are merged into a single project entry.
 * Non-git projects are standalone entries.
 */
export async function discoverProjects(): Promise<DiscoveredProject[]> {
  const rawProjects = await listAllProjects();
  const index = await getSessionIndex();

  // Build a lookup: encoded directory name -> sessions
  // Uses the encoded dir (literal folder name in ~/.claude/projects/) rather than
  // decoded projectPath, because the session index cache may have been built with
  // stale/naive path decoding. The encoded dir name is always stable.
  const sessionsByEncodedDir = new Map<string, SessionEntry[]>();
  for (const session of index.sessions) {
    const encodedDir = path.basename(path.dirname(session.jsonlPath));
    const existing = sessionsByEncodedDir.get(encodedDir) || [];
    existing.push(session);
    sessionsByEncodedDir.set(encodedDir, existing);
  }

  const projectMap = new Map<string, DiscoveredProject>();

  for (const raw of rawProjects) {
    const encodedDir = path.basename(raw.encodedPath);
    const matchingSessions = sessionsByEncodedDir.get(encodedDir) || [];

    // Determine group key and git repo root
    let groupKey: string;
    let gitRepoRoot: string | null = null;
    let isGitProject = false;

    // First: check if any indexed session has gitRepoRoot
    const sessionWithGit = matchingSessions.find((s) => s.gitRepoRoot);
    if (sessionWithGit?.gitRepoRoot) {
      gitRepoRoot = sessionWithGit.gitRepoRoot;
      groupKey = path.basename(gitRepoRoot);
      isGitProject = true;
    } else {
      // No git info in index — probe the filesystem
      const gitInfo = detectGitInfo(raw.projectPath);
      if (gitInfo.repoRoot) {
        gitRepoRoot = gitInfo.repoRoot;
        groupKey = path.basename(gitInfo.repoRoot);
        isGitProject = true;
      } else {
        // Non-git project: standalone entry
        groupKey = raw.projectSlug;
        isGitProject = false;
      }
    }

    // Find most recent activity among matching sessions
    let latestActivity: string | null = null;
    for (const s of matchingSessions) {
      if (s.endedAt && (!latestActivity || s.endedAt > latestActivity)) {
        latestActivity = s.endedAt;
      }
    }

    // Merge into existing group or create new
    const existing = projectMap.get(groupKey);
    if (existing) {
      existing.projectPaths.push(raw.projectPath);
      existing.encodedPaths.push(raw.encodedPath);
      existing.sessionCount += matchingSessions.length;
      if (latestActivity && (!existing.lastActivity || latestActivity > existing.lastActivity)) {
        existing.lastActivity = latestActivity;
      }
    } else {
      projectMap.set(groupKey, {
        name: groupKey,
        gitRepoRoot,
        isGitProject,
        projectPaths: [raw.projectPath],
        encodedPaths: [raw.encodedPath],
        sessionCount: matchingSessions.length,
        lastActivity: latestActivity,
      });
    }
  }

  // Second pass: merge non-git projects that have gitBranch into matching git projects.
  // This handles deleted worktrees whose directories no longer exist on disk —
  // detectGitInfo fails but the JSONL sessions still have gitBranch set.
  const nonGitKeys = Array.from(projectMap.entries())
    .filter(([, p]) => !p.isGitProject)
    .map(([key]) => key);
  const gitProjects = Array.from(projectMap.values()).filter((p) => p.isGitProject && p.gitRepoRoot);

  for (const key of nonGitKeys) {
    const project = projectMap.get(key);
    if (!project) continue;

    // Check if any session in this project had a git branch
    const allSessions = project.encodedPaths.flatMap((ep) => sessionsByEncodedDir.get(path.basename(ep)) || []);
    const hasGitBranch = allSessions.some((s) => s.gitBranch);
    if (!hasGitBranch) continue;

    // Find a git project in the same parent directory
    const projectParent = path.dirname(project.projectPaths[0]);
    const matchingGit = gitProjects.find(
      (gp) => gp.gitRepoRoot && path.dirname(gp.gitRepoRoot) === projectParent
    );
    if (!matchingGit) continue;

    // Merge into the git project
    matchingGit.projectPaths.push(...project.projectPaths);
    matchingGit.encodedPaths.push(...project.encodedPaths);
    matchingGit.sessionCount += project.sessionCount;
    if (project.lastActivity && (!matchingGit.lastActivity || project.lastActivity > matchingGit.lastActivity)) {
      matchingGit.lastActivity = project.lastActivity;
    }
    projectMap.delete(key);
  }

  // Filter out hidden projects
  const hidden = await getHiddenProjects();
  if (hidden.size > 0) {
    for (const [key, project] of projectMap) {
      if (hidden.has(project.name)) {
        projectMap.delete(key);
      }
    }
  }

  // Sort: most recent activity first, then alphabetically
  return Array.from(projectMap.values()).sort((a, b) => {
    if (a.lastActivity && b.lastActivity) {
      return b.lastActivity.localeCompare(a.lastActivity);
    }
    if (a.lastActivity && !b.lastActivity) return -1;
    if (!a.lastActivity && b.lastActivity) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Path to hidden projects file */
const HIDDEN_PROJECTS_FILE = path.join(homedir(), ".jacques", "hidden-projects.json");

/**
 * Get the set of hidden project names.
 */
async function getHiddenProjects(): Promise<Set<string>> {
  try {
    const content = await fs.readFile(HIDDEN_PROJECTS_FILE, "utf-8");
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return new Set(data);
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return new Set();
}

/**
 * Hide a project from the discovered list.
 */
export async function hideProject(name: string): Promise<void> {
  const hidden = await getHiddenProjects();
  hidden.add(name);
  await fs.mkdir(path.dirname(HIDDEN_PROJECTS_FILE), { recursive: true });
  await fs.writeFile(HIDDEN_PROJECTS_FILE, JSON.stringify([...hidden], null, 2));
}

/**
 * Unhide a project (restore it to the discovered list).
 */
export async function unhideProject(name: string): Promise<void> {
  const hidden = await getHiddenProjects();
  hidden.delete(name);
  await fs.writeFile(HIDDEN_PROJECTS_FILE, JSON.stringify([...hidden], null, 2));
}

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
  totalSessions: number;
  totalProjects: number;
  totalSizeBytes: number;
  lastScanned: string;
}> {
  const index = await getSessionIndex();

  // Count unique projects
  const projects = new Set(index.sessions.map((s) => s.projectSlug));

  // Sum file sizes
  const totalSize = index.sessions.reduce((sum, s) => sum + s.fileSizeBytes, 0);

  return {
    totalSessions: index.sessions.length,
    totalProjects: projects.size,
    totalSizeBytes: totalSize,
    lastScanned: index.lastScanned,
  };
}

/**
 * Invalidate the index (force rebuild on next read)
 */
export async function invalidateIndex(): Promise<void> {
  try {
    const indexPath = getIndexPath();
    await fs.unlink(indexPath);
  } catch {
    // Index doesn't exist, nothing to do
  }
}
