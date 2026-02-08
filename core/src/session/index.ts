/**
 * Session module exports
 */

export {
  detectCurrentSession,
  listProjectSessions,
  getProjectDirPath,
  getClaudeProjectsDir,
  getClaudeSettingsPath,
  encodeProjectPath,
  decodeProjectPath,
  decodeProjectPathNaive,
  findSessionById,
  listSubagentFiles,
} from "./detector.js";
export type { SessionFile, DetectorOptions, SubagentFile } from "./detector.js";

export { parseJSONL, parseJSONLContent, categorizeEntry, getEntryStatistics } from "./parser.js";
export type {
  ParsedEntry,
  ParsedEntryType,
  ParsedContent,
  RawEntry,
  RawAssistantEntry,
  RawProgressEntry,
  RawQueueOperationEntry,
  RawUserEntry,
  RawSystemEntry,
  RawSummaryEntry,
  ContentBlock,
} from "./parser.js";

export { transformToSavedContext, getSessionPreview } from "./transformer.js";
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
