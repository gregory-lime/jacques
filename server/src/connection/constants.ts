/**
 * Connection Layer Constants
 *
 * Centralized configuration values for the Claude Code connection layer.
 * These control timing thresholds, context window sizes, and terminal key formats.
 */

// ============================================================================
// Context Window Limits
// ============================================================================

/** Default Claude context window size in tokens */
export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

/**
 * Bug threshold for autocompact.
 * When autocompact is disabled, it still triggers at ~78% instead of the configured threshold.
 * See: https://github.com/anthropics/claude-code/issues/XXX
 */
export const AUTOCOMPACT_BUG_THRESHOLD = 78;

/** Default autocompact threshold percentage when enabled */
export const DEFAULT_AUTOCOMPACT_THRESHOLD = 95;

// ============================================================================
// Session Timing Thresholds
// ============================================================================

/**
 * Active session threshold for process discovery.
 * Sessions with JSONL files modified within this window are considered "active".
 */
export const ACTIVE_SESSION_THRESHOLD_MS = 60 * 1000; // 1 minute

/**
 * Recently ended session TTL.
 * Prevents re-registration of sessions via stale context_update events
 * (fixes duplicate sessions on /clear command).
 */
export const RECENTLY_ENDED_TTL_MS = 30_000; // 30 seconds

/**
 * Idle session timeout.
 * Sessions with no activity for this duration are considered stale and removed.
 * Catches sessions where user walked away without /exit or closing terminal.
 */
export const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Interval between process liveness verification checks */
export const PROCESS_VERIFY_INTERVAL_MS = 30_000; // 30 seconds

/** Interval between stale session cleanup runs */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Max age for session catalog cache at startup */
export const CATALOG_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Focus Detection
// ============================================================================

/** Polling interval for focus watcher when terminal is focused */
export const FOCUS_WATCHER_POLL_MS = 500;

/** Polling interval for focus watcher when terminal is not focused (slower) */
export const FOCUS_WATCHER_IDLE_POLL_MS = 1500;

// ============================================================================
// Terminal Key Prefixes
// ============================================================================

/**
 * Terminal key prefix identifiers.
 * Terminal keys follow the format: PREFIX:value
 *
 * Examples:
 * - ITERM:w0t0p0:ABC123-DEF456 (iTerm2 with window/tab/pane + UUID)
 * - ITERM:ABC123-DEF456 (iTerm2 UUID only)
 * - TTY:/dev/ttys001 (Terminal.app or generic Unix)
 * - PID:12345 (Fallback when no better identifier)
 * - KITTY:42 (Kitty window ID)
 * - WEZTERM:pane:0 (WezTerm pane ID)
 * - DISCOVERED:TTY:ttys001:12345 (Session discovered at startup)
 * - AUTO:session-uuid (Auto-registered from context_update)
 */
export enum TerminalKeyPrefix {
  /** iTerm2 terminal (macOS) */
  ITERM = 'ITERM',

  /** Kitty terminal (cross-platform) */
  KITTY = 'KITTY',

  /** WezTerm terminal (cross-platform) */
  WEZTERM = 'WEZTERM',

  /** TTY path-based identifier (Unix) */
  TTY = 'TTY',

  /** Process ID-based identifier (fallback) */
  PID = 'PID',

  /** Terminal.app (macOS) */
  TERM = 'TERM',

  /** Windows Terminal */
  WT = 'WT',

  /** Session discovered at server startup (wraps inner key) */
  DISCOVERED = 'DISCOVERED',

  /** Auto-registered from context_update (temporary key) */
  AUTO = 'AUTO',

  /** Unknown terminal type */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Terminal application names for focus detection.
 * These are the process names as reported by the system.
 */
export const TERMINAL_APP_NAMES = [
  'iTerm2',
  'iTerm',
  'Terminal',
  'Alacritty',
  'kitty',
  'WezTerm',
  'Hyper',
  'Windows Terminal',
  'wt',
] as const;

export type TerminalAppName = (typeof TERMINAL_APP_NAMES)[number];
