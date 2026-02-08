/**
 * Catalog Types
 *
 * Type definitions for the catalog extraction system.
 * Extracts lightweight artifacts from JSONL files for fast dashboard loading.
 */

/**
 * Session manifest stored in .jacques/sessions/{id}.json
 * Lightweight metadata (~1-2KB) extracted from JSONL files.
 */
export interface SessionManifest {
  /** Session UUID */
  id: string;
  /** Session title (from summary or first user message) */
  title: string;
  /** Full project path */
  projectPath: string;
  /** Project slug (basename) */
  projectSlug: string;

  /** Session timestamps */
  startedAt: string;
  endedAt: string;
  durationMinutes: number;

  /** User questions (truncated to 200 chars each) */
  userQuestions: string[];
  /** Files modified via Write/Edit tool calls */
  filesModified: string[];
  /** Unique tool names used */
  toolsUsed: string[];
  /** Auto-detected technologies */
  technologies: string[];

  /** Statistics */
  messageCount: number;
  toolCallCount: number;

  /** Token usage stats */
  tokens?: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };

  /** Subagent metadata */
  hasSubagents: boolean;
  hadAutoCompact?: boolean;

  /** Session mode */
  mode?: "planning" | "execution" | null;

  /** Linked plan IDs (references PlanEntry.id in index.json) */
  planIds: string[];
  /** Linked subagent IDs (references SubagentEntry.id in index.json) */
  subagentIds: string[];

  /** Plan references with source info for display (deduplicated by catalogId) */
  planRefs?: Array<{
    title: string;
    source: "embedded" | "write" | "agent";
    /** All detection methods that found this plan (when deduplicated) */
    sources?: Array<"embedded" | "write" | "agent">;
    messageIndex: number;
    filePath?: string;
    agentId?: string;
    catalogId?: string;
  }>;

  /** JSONL file modification time (for incremental extraction) */
  jsonlModifiedAt: string;
  /** When this manifest was extracted */
  extractedAt: string;
}

/**
 * Options for single-session catalog extraction
 */
export interface ExtractSessionOptions {
  /** Force re-extraction even if JSONL hasn't changed */
  force?: boolean;
}

/**
 * Result of single-session catalog extraction
 */
export interface ExtractSessionResult {
  /** Session ID */
  sessionId: string;
  /** Whether extraction was skipped (unchanged) */
  skipped: boolean;
  /** Number of subagent artifacts extracted */
  subagentsExtracted: number;
  /** Number of plans extracted */
  plansExtracted: number;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * Options for bulk catalog extraction
 */
export interface BulkExtractOptions {
  /** Force re-extraction of all sessions */
  force?: boolean;
  /** Progress callback */
  onProgress?: (progress: CatalogProgress) => void;
}

/**
 * Progress callback for catalog extraction
 */
export interface CatalogProgress {
  /** Current phase */
  phase: "scanning" | "extracting";
  /** Total items to process */
  total: number;
  /** Items completed */
  completed: number;
  /** Current item being processed */
  current: string;
  /** Items skipped (unchanged) */
  skipped: number;
  /** Items that failed */
  errors: number;
}

/**
 * Result of bulk catalog extraction
 */
export interface BulkExtractResult {
  /** Total sessions found */
  totalSessions: number;
  /** Sessions successfully extracted */
  extracted: number;
  /** Sessions skipped (unchanged) */
  skipped: number;
  /** Sessions that failed */
  errors: number;
}
