/**
 * Plan Progress Types
 *
 * Type definitions for tracking plan completion status by matching
 * task signals from JSONL transcripts to plan markdown items.
 */

/**
 * A single item parsed from plan markdown.
 * Represents trackable items like headings, numbered lists, bullets, and checkboxes.
 */
export interface PlanItem {
  /** Unique ID within the plan, e.g. "item-3-2" */
  id: string;
  /** Raw text, stripped of markdown syntax */
  text: string;
  /** Depth level: 0=h1, 1=h2, 2=h3, 3+=list items */
  depth: number;
  /** Item type */
  type: "heading" | "numbered" | "bullet" | "checkbox";
  /** 1-indexed line number in the source markdown */
  lineNumber: number;
  /** Parent item ID, null for top-level items */
  parentId: string | null;
  /** Child item IDs */
  childIds: string[];
  /** For checkbox items, whether it's checked in the source: - [x] */
  isCheckedInSource: boolean;
}

/**
 * Parsed plan structure with metadata.
 */
export interface ParsedPlan {
  /** All items in document order */
  items: PlanItem[];
  /** Count of trackable items (excludes pure structural headings) */
  trackableCount: number;
  /** Map of line number to item for fast lookup */
  lineToItem: Map<number, PlanItem>;
}

/**
 * A task signal extracted from session JSONL.
 * Represents evidence of work on a task.
 */
export interface TaskSignal {
  /** How this signal was detected */
  source:
    | "todo_write"
    | "task_create"
    | "task_update"
    | "task_list"
    | "agent_progress"
    | "bash_progress"
    | "file_heuristic";
  /** Task description text */
  text: string;
  /** Task status */
  status: "pending" | "in_progress" | "completed" | "unknown";
  /** ISO timestamp when this signal was recorded */
  timestamp: string;
  /** Task ID from TaskCreate/TaskUpdate tool calls */
  taskId?: string;
  /** File path for file_heuristic signals */
  filePath?: string;
  /** Session ID where this signal was found */
  sessionId: string;
}

/**
 * A match between a task signal and a plan item.
 */
export interface PlanItemMatch {
  /** ID of the plan item that was matched */
  planItemId: string;
  /** The signal that matched */
  signal: TaskSignal;
  /** Confidence score 0-1 */
  confidence: number;
  /** How the match was determined */
  matchMethod: "exact_text" | "keyword_overlap" | "file_path" | "substring";
}

/**
 * Status of a plan item based on matched signals.
 */
export type PlanItemStatus = "not_started" | "in_progress" | "completed";

/**
 * Progress status for a single plan item.
 */
export interface PlanItemProgress {
  /** Plan item ID */
  planItemId: string;
  /** Computed status */
  status: PlanItemStatus;
  /** Best matching signal, if any */
  bestMatch: PlanItemMatch | null;
}

/**
 * Summary of plan progress.
 */
export interface PlanProgressSummary {
  /** Total trackable items */
  total: number;
  /** Items with completed status */
  completed: number;
  /** Items with in_progress status */
  inProgress: number;
  /** Items with not_started status */
  notStarted: number;
  /** Completion percentage (0-100) */
  percentage: number;
}

/**
 * Full progress data for a plan.
 */
export interface PlanProgress {
  /** Plan ID (matches PlanEntry.id) */
  planId: string;
  /** ISO timestamp when progress was computed */
  computedAt: string;
  /** Per-item progress status */
  items: PlanItemProgress[];
  /** Summary statistics */
  summary: PlanProgressSummary;
  /** Session IDs that contributed signals */
  sessionIds: string[];
  /** Cache key for invalidation (hash of plan content + session mtimes) */
  cacheKey: string;
}

/**
 * Lightweight progress summary for list views.
 */
export interface PlanProgressListItem {
  /** Plan ID */
  planId: string;
  /** Completion percentage */
  percentage: number;
  /** Whether progress is still being computed */
  loading: boolean;
}
