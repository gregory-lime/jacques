/**
 * Terminal Focus Watcher
 *
 * Monitors which terminal window is focused on macOS and sends
 * focus hints to the Jacques server to update the active session.
 *
 * Supports:
 * - iTerm2 (via ITERM_SESSION_ID)
 * - Terminal.app (via TTY)
 * - Other terminals (via window ID / PID)
 */

import type { Logger } from './logging/logger-factory.js';
import { createLogger } from './logging/logger-factory.js';
import { FOCUS_WATCHER_POLL_MS, TERMINAL_APP_NAMES } from './connection/constants.js';
import { runAppleScript } from './connection/applescript.js';

export interface FocusInfo {
  app: string;
  iterm_session_id?: string;
  tty?: string;
  window_id?: string;
  terminal_pid?: number;
}

/**
 * Get the currently focused application name
 */
async function getFrontmostApp(): Promise<string | null> {
  try {
    return await runAppleScript(
      'tell application "System Events" to get name of first application process whose frontmost is true'
    );
  } catch {
    return null;
  }
}

/**
 * Get iTerm2 session ID for the active tab
 */
async function getITermSessionId(): Promise<string | null> {
  try {
    const result = await runAppleScript(
      'tell application "iTerm2" to tell current session of current tab of current window to return unique ID'
    );
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Get Terminal.app TTY for the active tab
 */
async function getTerminalTTY(): Promise<string | null> {
  try {
    const result = await runAppleScript(`
      tell application "Terminal"
        return tty of selected tab of front window
      end tell
    `);
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Get iTerm2 TTY for the active session
 */
async function getITermTTY(): Promise<string | null> {
  try {
    const result = await runAppleScript(
      'tell application "iTerm2" to tell current session of current tab of current window to return tty'
    );
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Get focus info for the currently active terminal
 */
export async function getTerminalFocusInfo(): Promise<FocusInfo | null> {
  const app = await getFrontmostApp();

  if (!app) return null;

  // Check if it's a terminal application
  const isTerminal = TERMINAL_APP_NAMES.some(t => app.toLowerCase().includes(t.toLowerCase()));

  if (!isTerminal) {
    return null; // Not a terminal, ignore
  }

  const focusInfo: FocusInfo = { app };

  if (app.includes('iTerm')) {
    focusInfo.iterm_session_id = await getITermSessionId() || undefined;
    // Also get TTY for iTerm — discovered sessions may only have TTY-based keys
    focusInfo.tty = await getITermTTY() || undefined;
  } else if (app === 'Terminal') {
    focusInfo.tty = await getTerminalTTY() || undefined;
  }

  return focusInfo;
}

/**
 * Build terminal key candidates from focus info, ordered by specificity.
 * Returns multiple keys to try (e.g., ITERM key first, then TTY fallback)
 * because discovered sessions may use TTY keys even when running in iTerm.
 */
export function buildTerminalKeysFromFocus(focus: FocusInfo): string[] {
  const keys: string[] = [];
  if (focus.iterm_session_id) {
    keys.push(`ITERM:${focus.iterm_session_id}`);
  }
  if (focus.tty) {
    keys.push(`TTY:${focus.tty}`);
  }
  if (focus.terminal_pid) {
    keys.push(`PID:${focus.terminal_pid}`);
  }
  return keys;
}

/**
 * Build a single terminal key from focus info (primary key for change detection)
 */
export function buildTerminalKeyFromFocus(focus: FocusInfo): string | null {
  const keys = buildTerminalKeysFromFocus(focus);
  return keys[0] || null;
}

export interface FocusWatcherCallbacks {
  onFocusChange: (terminalKey: string | null, allKeys?: string[]) => void;
  /** Return true if the watcher should retry matching even when the terminal key hasn't changed */
  shouldRetry?: () => boolean;
}

export interface FocusWatcherOptions {
  /** Suppress console output */
  silent?: boolean;
  /** Optional logger for dependency injection */
  logger?: Logger;
}

/**
 * Start watching for terminal focus changes
 */
export function startFocusWatcher(
  callbacks: FocusWatcherCallbacks,
  pollIntervalMs: number = FOCUS_WATCHER_POLL_MS,
  options: FocusWatcherOptions = {}
): { stop: () => void } {
  // Support both old silent flag and new logger injection (messages already include [FocusWatcher] prefix)
  const logger = options.logger ?? createLogger({ silent: options.silent });
  const log = logger.log.bind(logger);
  const error = logger.error.bind(logger);

  let lastTerminalKey: string | null = null;
  let isRunning = true;
  // Poll slower when no terminal is focused (non-terminal app in foreground)
  const idleMultiplier = 3;

  const poll = async () => {
    if (!isRunning) return;

    let nextDelay = pollIntervalMs;

    try {
      const focusInfo = await getTerminalFocusInfo();
      const terminalKey = focusInfo ? buildTerminalKeyFromFocus(focusInfo) : null;
      const allKeys = focusInfo ? buildTerminalKeysFromFocus(focusInfo) : [];

      // Poll slower when no terminal is focused
      if (!focusInfo) {
        nextDelay = pollIntervalMs * idleMultiplier;
      }

      // Notify on terminal key change, or re-notify same key if no session
      // is currently focused (sessions may have registered since last poll)
      if (terminalKey !== lastTerminalKey || (terminalKey && callbacks.shouldRetry?.()) ) {
        if (terminalKey !== lastTerminalKey) {
          log(`[FocusWatcher] Focus changed: ${lastTerminalKey} -> ${terminalKey}`);
          if (focusInfo) {
            log(`[FocusWatcher] App: ${focusInfo.app}, iTerm ID: ${focusInfo.iterm_session_id || 'none'}, TTY: ${focusInfo.tty || 'none'}`);
          }
        }
        lastTerminalKey = terminalKey;
        callbacks.onFocusChange(terminalKey, allKeys);
      }
    } catch (err) {
      error(`[FocusWatcher] Poll error: ${err}`);
      nextDelay = pollIntervalMs * idleMultiplier;
    }

    if (isRunning) {
      setTimeout(poll, nextDelay);
    }
  };

  // Start polling
  log('[FocusWatcher] Starting focus polling...');
  poll();

  return {
    stop: () => {
      isRunning = false;
      log('[FocusWatcher] Stopped');
    }
  };
}
