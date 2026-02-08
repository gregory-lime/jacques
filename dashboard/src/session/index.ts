/**
 * Session module exports
 */

export {
  detectCurrentSession,
  listProjectSessions,
  getProjectDirPath,
  encodeProjectPath,
  findSessionById,
} from "./detector.js";
export type { SessionFile, DetectorOptions } from "./detector.js";

export {
  parseJSONL,
  categorizeEntry,
  getEntryStatistics,
} from "./parser.js";
export type {
  ParsedEntry,
  ParsedEntryType,
  ParsedContent,
  RawEntry,
  RawAssistantEntry,
  RawProgressEntry,
  RawQueueOperationEntry,
  RawSystemEntry,
  RawSummaryEntry,
  ContentBlock,
} from "./parser.js";

export {
  transformToSavedContext,
  getSessionPreview,
} from "./transformer.js";
export type {
  SavedContext,
  SessionInfo,
  SessionStatistics,
  DisplayMessage,
  MessageContent,
  MessageMetadata,
  TransformOptions,
} from "./transformer.js";

export { FilterType, FILTER_CONFIGS, applyFilter } from "./filters.js";
export type { FilterConfig } from "./filters.js";

export {
  estimateTokensForFilters,
  formatTokenCount,
  countEntryTokens,
} from "./token-estimator.js";
export type { TokenEstimate, FilterTokenEstimates } from "./token-estimator.js";
