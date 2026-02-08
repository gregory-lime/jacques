/**
 * Handoff Module
 *
 * Session handoff generation and catalog management.
 */

// Types
export type { HandoffEntry, HandoffCatalog } from "./types.js";

// Catalog operations
export {
  getHandoffsDir,
  ensureHandoffsDir,
  parseTimestampFromFilename,
  generateHandoffFilename,
  formatHandoffDate,
  estimateTokens,
  formatTokenEstimate,
  listHandoffs,
  getHandoffContent,
  hasHandoffs,
  getLatestHandoff,
} from "./catalog.js";

// Prompts
export {
  HANDOFF_INVOCATION,
  getHandoffPrompt,
  getHandoffPromptDisplay,
} from "./prompts.js";

// Generator
export type { HandoffData, HandoffResult, CompactContextResult } from "./generator.js";
export {
  extractHandoffData,
  formatHandoffMarkdown,
  generateHandoffFromTranscript,
  generateHandoffFromEntries,
  formatAsSkillContext,
  getCompactContextForSkill,
  getCompactContextFromEntries,
} from "./generator.js";

// LLM Generator
export type { LLMHandoffResult, LLMHandoffOptions, LLMStreamCallbacks } from "./llm-generator.js";
export {
  generateHandoffWithLLM,
  isSkillInstalled,
  getSkillPath,
  ClaudeCodeError,
} from "./llm-generator.js";
