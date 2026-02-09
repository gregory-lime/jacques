/**
 * Logging Module
 *
 * Provides logging utilities for Claude Code CLI operations
 * and structured error handling for core modules.
 */

export {
  ClaudeOperationLogger,
  type ClaudeOperation,
  type ClaudeOperationDebug,
} from "./claude-operations.js";

export type { Logger } from "./logger.js";
export { createLogger } from "./logger.js";
export { isNotFoundError, isPermissionError, getErrorMessage } from "./error-utils.js";
