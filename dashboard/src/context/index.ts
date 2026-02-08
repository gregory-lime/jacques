/**
 * Context Module
 *
 * Manages project knowledge in .jacques/
 * - context/: External files imported from Obsidian, Google Docs, etc.
 * - sessions/: Saved Claude Code conversations
 * - plans/: Implementation plans
 */

// Types
export type {
  ProjectIndex,
  ContextFile,
  SessionEntry,
  PlanEntry,
  ContextSource,
  AddContextOptions,
  // Legacy
  ContextIndex,
} from "./types.js";
export { getDefaultIndex, migrateIndex } from "./types.js";

// Indexer - unified project index
export {
  getIndexPath,
  readProjectIndex,
  writeProjectIndex,
  // Context operations
  addContextToIndex,
  removeContextFromIndex,
  // Session operations
  addSessionToIndex,
  removeSessionFromIndex,
  // Plan operations
  addPlanToIndex,
  removePlanFromIndex,
  // Utilities
  fileExistsInIndex,
  // Legacy compatibility
  readContextIndex,
  writeContextIndex,
  addToIndex,
  removeFromIndex,
} from "./indexer.js";

// Manager - file operations
export {
  generateContextId,
  sanitizeFilename,
  getContextDir,
  addContext,
  removeContext,
  hasContextFiles,
  formatFileSize,
  estimateTokensFromSize,
  countTokens,
  countFileTokens,
  formatTokenCount,
  extractTags,
} from "./manager.js";
