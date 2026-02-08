/**
 * Plan Progress Module
 *
 * Track completion status of plan items by extracting task signals
 * from JSONL transcripts and matching them to plan markdown items.
 */

// Types
export type {
  PlanItem,
  ParsedPlan,
  TaskSignal,
  PlanItemMatch,
  PlanItemStatus,
  PlanItemProgress,
  PlanProgressSummary,
  PlanProgress,
  PlanProgressListItem,
} from "./types.js";

// Parser
export { parsePlanMarkdown, normalizeText, extractKeywords } from "./plan-parser.js";

// Task extraction
export { extractTaskSignals, getModifiedFiles } from "./task-extractor.js";

// Matching
export {
  matchSignalsToPlanItems,
  determineItemStatus,
  isTrackableForProgress,
} from "./progress-matcher.js";

// Progress computation
export {
  computePlanProgress,
  computePlanProgressSummary,
  clearProgressCache,
  clearAllProgressCache,
} from "./progress-computer.js";
