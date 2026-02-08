/**
 * Context Types
 *
 * Type definitions for the unified project index (.jacques/index.json)
 * This is the single entry point for all project knowledge:
 * - context: External files imported from Obsidian, Google Docs, etc.
 * - sessions: Saved Claude Code conversations
 * - plans: Implementation plans created during conversations
 */

/**
 * Unified index of all project knowledge (.jacques/index.json)
 */
export interface ProjectIndex {
  version: string;
  updatedAt: string;
  context: ContextFile[];
  sessions: SessionEntry[];
  plans: PlanEntry[];
  subagents: SubagentEntry[];
  /** Currently active plan IDs (cross-session tracking) */
  activePlanIds?: string[];
}

/**
 * A single context file entry (imported from external sources)
 */
export interface ContextFile {
  id: string;
  name: string;
  path: string;
  source: ContextSource;
  sourceFile: string;
  addedAt: string;
  description?: string;
  sizeBytes: number;
  tags?: string[];
}

/**
 * A single session entry (saved conversation)
 */
export interface SessionEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  savedAt: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  messageCount: number;
  toolCallCount: number;
  technologies: string[];
  userLabel?: string;
  /** Files modified via Write/Edit tool calls */
  filesModified?: string[];
  /** Unique tool names used */
  toolsUsed?: string[];
  /** Token usage stats */
  tokens?: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  /** Whether session has user-visible subagents */
  hasSubagents?: boolean;
  /** Whether auto-compact occurred */
  hadAutoCompact?: boolean;
  /** Session mode: planning or execution */
  mode?: "planning" | "execution" | null;
  /** Number of plans in this session */
  planCount?: number;
  /** Number of subagent artifacts */
  subagentCount?: number;
  /** Linked plan IDs (references PlanEntry.id) */
  planIds?: string[];
  /** Linked subagent IDs (references SubagentEntry.id) */
  subagentIds?: string[];
}

/**
 * A single subagent entry (exploration or search result)
 */
export interface SubagentEntry {
  /** Unique ID: agentId for explorations, generated hash for searches */
  id: string;
  /** Parent session ID */
  sessionId: string;
  /** Type: exploration (Explore agent) or search (web search) */
  type: "exploration" | "search";
  /** Description (exploration) or query (search) */
  title: string;
  /** Output filename */
  filename: string;
  /** Relative path: "subagents/{filename}" */
  path: string;
  /** When the subagent ran or search was performed */
  timestamp: string;
  /** Estimated token cost (for explorations) */
  tokenCost?: number;
  /** Number of results (for searches) */
  resultCount?: number;
  /** When this was extracted */
  extractedAt: string;
}

/**
 * A single plan entry
 */
export interface PlanEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  contentHash?: string;      // SHA-256 of normalized content, used for dedup
  bodyHash?: string;         // SHA-256 of body only (excludes title), for cross-title dedup
  createdAt: string;
  updatedAt: string;
  sessions: string[]; // Session IDs that used this plan
}

/**
 * Supported context sources
 */
export type ContextSource = "obsidian" | "google_docs" | "notion" | "local";

/**
 * Options for adding a new context file
 */
export interface AddContextOptions {
  cwd: string;
  sourceFile: string;
  name: string;
  source: ContextSource;
  description?: string;
}

/**
 * Default empty index
 */
export function getDefaultIndex(): ProjectIndex {
  return {
    version: "2.0.0",
    updatedAt: new Date().toISOString(),
    context: [],
    sessions: [],
    plans: [],
    subagents: [],
  };
}

/**
 * Legacy ContextIndex type for backwards compatibility
 * @deprecated Use ProjectIndex instead
 */
export interface ContextIndex {
  version: string;
  updatedAt: string;
  files: ContextFile[];
}

/**
 * Migrate legacy index to new format
 */
export function migrateIndex(legacy: ContextIndex): ProjectIndex {
  return {
    version: "2.0.0",
    updatedAt: legacy.updatedAt,
    context: legacy.files,
    sessions: [],
    plans: [],
    subagents: [],
  };
}
