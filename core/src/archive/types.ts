/**
 * Archive Types
 *
 * Type definitions for the conversation archive system.
 * Supports cross-project search over saved Claude Code conversations.
 */

/**
 * Reference to a plan file used in a conversation
 */
export interface PlanReference {
  /** Original path (e.g., ~/.claude/plans/foo.md) */
  path: string;
  /** Plan filename (e.g., "foo.md") */
  name: string;
  /** Path in archive (e.g., plans/foo.md) */
  archivedPath: string;
  /** Detection method: embedded (from user message), write (from Write tool), or agent (from Plan subagent) */
  source: "embedded" | "write" | "agent";
}

/**
 * Summary of subagents used in a conversation
 * Full subagent content stored separately in ~/.jacques/archive/subagents/
 */
export interface SubagentSummary {
  /** Number of subagents invoked */
  count: number;
  /** Total tokens used across all subagents */
  totalTokens: number;
  /** List of subagent IDs (for linking to full archives) */
  ids: string[];
}

/**
 * Lightweight manifest for a conversation (~1-2KB)
 * Contains all searchable metadata without full content
 */
export interface ConversationManifest {
  /** Session UUID */
  id: string;
  /** Unique project identifier using encoded full path (e.g., "-Users-gole-Desktop-jacques-context-manager") */
  projectId: string;
  /** Project slug for display (e.g., "jacques-context-manager") */
  projectSlug: string;
  /** Full project path (e.g., "/Users/gole/Desktop/jacques-context-manager") */
  projectPath: string;
  /** ISO timestamp when archived */
  archivedAt: string;
  /** true = SessionEnd hook, false = manual save */
  autoArchived: boolean;

  /** Claude's auto-generated summary (or fallback) */
  title: string;

  /** Session timestamps */
  startedAt: string;
  endedAt: string;
  durationMinutes: number;

  /** Searchable content */
  userQuestions: string[];
  filesModified: string[];
  toolsUsed: string[];
  technologies: string[];

  /** Plans created/edited in this conversation */
  plans: PlanReference[];

  /** Subagents invoked during this conversation */
  subagents?: SubagentSummary;

  /** Optional context snippets from assistant responses */
  contextSnippets?: string[];

  /** Statistics */
  messageCount: number;
  toolCallCount: number;

  /** Manual save metadata */
  userLabel?: string;
}

/**
 * Reference to a manifest in the search index
 */
export interface IndexReference {
  /** Manifest/conversation ID */
  id: string;
  /** Frequency-based weight */
  score: number;
  /** Source field: "title" | "question" | "file" | "tech" */
  field: string;
}

/**
 * Project info in the search index
 */
export interface ProjectInfo {
  /** Full project path */
  path: string;
  /** Number of conversations */
  conversationCount: number;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Inverted search index for keywords
 */
export interface SearchIndex {
  version: string;
  lastUpdated: string;

  /** Inverted index: keyword → manifest references */
  keywords: {
    [keyword: string]: IndexReference[];
  };

  /** Quick access to project list (keyed by projectId for uniqueness) */
  projects: {
    [projectId: string]: ProjectInfo;
  };

  metadata: {
    totalConversations: number;
    totalKeywords: number;
  };
}

/**
 * Search input parameters
 */
export interface SearchInput {
  /** Keywords to search */
  query: string;
  /** Filter by project slug */
  project?: string;
  /** ISO date filter (from) */
  dateFrom?: string;
  /** ISO date filter (to) */
  dateTo?: string;
  /** Filter by tech stack */
  technologies?: string[];
  /** Default 10, max 50 */
  limit?: number;
  /** Default 0 */
  offset?: number;
}

/**
 * Single search result
 */
export interface SearchResult {
  rank: number;
  id: string;
  score: number;
  /** Session title */
  title: string;
  /** Project slug */
  project: string;
  /** ISO date */
  date: string;
  /** First user question (truncated) */
  preview: string;
  /** Top 5 modified files */
  filesModified: string[];
  technologies: string[];
  messageCount: number;
  durationMinutes: number;
}

/**
 * Search output response
 */
export interface SearchOutput {
  query: string;
  filters: {
    project?: string;
    dateFrom?: string;
    dateTo?: string;
    technologies?: string[];
  };
  totalMatches: number;
  showing: { from: number; to: number };
  hasMore: boolean;
  results: SearchResult[];
}

/**
 * Archive settings stored in ~/.jacques/config.json
 */
export interface ArchiveSettings {
  /** Auto-archive on session end (default false) */
  autoArchive: boolean;
}

/**
 * Default archive settings
 */
export function getDefaultArchiveSettings(): ArchiveSettings {
  return {
    autoArchive: false,
  };
}

/**
 * Default empty search index
 */
export function getDefaultSearchIndex(): SearchIndex {
  return {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    keywords: {},
    projects: {},
    metadata: {
      totalConversations: 0,
      totalKeywords: 0,
    },
  };
}

/**
 * Progress callback for archive initialization
 */
export interface ArchiveProgress {
  /** Current phase: scanning for sessions or archiving them */
  phase: "scanning" | "archiving";
  /** Total items to process */
  total: number;
  /** Items completed */
  completed: number;
  /** Current item being processed (filename or path) */
  current: string;
  /** Number of items skipped (already archived) */
  skipped: number;
  /** Number of items that failed */
  errors: number;
}

/**
 * Result of archive initialization
 */
export interface ArchiveInitResult {
  /** Total sessions found */
  totalSessions: number;
  /** Sessions successfully archived */
  archived: number;
  /** Sessions skipped (already archived) */
  skipped: number;
  /** Sessions that failed to archive */
  errors: number;
}

/**
 * Session file info for bulk archiving
 */
export interface SessionFileInfo {
  /** Full path to the JSONL file */
  filePath: string;
  /** Session ID (from filename) */
  sessionId: string;
  /** Unique project identifier using encoded full path */
  projectId: string;
  /** Project path (decoded from Claude projects path) */
  projectPath: string;
  /** Project slug (basename of project path) */
  projectSlug: string;
  /** File modification time */
  modifiedAt: Date;
  /** File size in bytes */
  sizeBytes: number;
}
