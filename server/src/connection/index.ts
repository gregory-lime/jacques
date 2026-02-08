/**
 * Connection Layer
 *
 * Centralized module for Claude Code/Cursor session connection logic:
 * - Process detection and PID handling
 * - Terminal identity and activation
 * - Session discovery and lifecycle
 * - Focus detection and tracking
 *
 * @module connection
 */

// Constants and configuration
export {
  // Context window limits
  DEFAULT_CONTEXT_WINDOW_SIZE,
  AUTOCOMPACT_BUG_THRESHOLD,
  DEFAULT_AUTOCOMPACT_THRESHOLD,

  // Session timing thresholds
  ACTIVE_SESSION_THRESHOLD_MS,
  RECENTLY_ENDED_TTL_MS,
  IDLE_TIMEOUT_MS,
  PROCESS_VERIFY_INTERVAL_MS,
  CLEANUP_INTERVAL_MS,
  CATALOG_CACHE_MAX_AGE_MS,

  // Focus detection
  FOCUS_WATCHER_POLL_MS,
  FOCUS_WATCHER_IDLE_POLL_MS,

  // Terminal key prefixes
  TerminalKeyPrefix,
  TERMINAL_APP_NAMES,
  type TerminalAppName,
} from './constants.js';

// Terminal key utilities
export {
  parseTerminalKey,
  buildTerminalKey,
  extractPid,
  extractItermUuid,
  matchTerminalKeys,
  describeTerminalKey,
  type ParsedTerminalKey,
  type TerminalIdentity,
} from './terminal-key.js';

// AppleScript utilities
export {
  escapeAppleScript,
  runAppleScript,
  isAppleScriptAvailable,
} from './applescript.js';

// Git detection
export {
  detectGitInfo,
  type GitInfo,
} from './git-info.js';

// Session discovery
export {
  findActiveSessionFiles,
  findMostRecentSessionFile,
  findRecentSessionFiles,
  type SessionFileInfo,
} from './session-discovery.js';

// Process detection
export {
  getClaudeProcesses,
  isProcessRunning,
  isProcessBypass,
  getPlatformInfo,
  type DetectedProcess,
} from './process-detection.js';

// Worktree management
export {
  createWorktree,
  listWorktrees,
  listWorktreesWithStatus,
  removeWorktree,
  type CreateWorktreeOptions,
  type CreateWorktreeResult,
  type WorktreeEntry,
  type WorktreeWithStatus,
  type WorktreeStatus,
  type RemoveWorktreeOptions,
  type RemoveWorktreeResult,
} from './worktree.js';

// Focus tracking remains in server/src/focus-watcher.ts (refactored to use shared utilities)
// Terminal activation remains in server/src/terminal-activator.ts (uses shared applescript)
