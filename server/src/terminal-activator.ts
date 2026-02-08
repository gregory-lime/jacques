/**
 * Terminal Activator
 *
 * Activates (brings to foreground with keyboard focus) a terminal window
 * identified by its terminal_key. Supports iTerm2, Kitty, WezTerm,
 * Terminal.app, and PID-based fallback.
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { runAppleScript, extractItermUuid } from './connection/index.js';

const execAsync = promisify(execCb);

export type ActivationMethod =
  | 'iterm'
  | 'kitty'
  | 'wezterm'
  | 'terminal_app'
  | 'pid'
  | 'unsupported';

export interface ActivationResult {
  success: boolean;
  method: ActivationMethod;
  error?: string;
}

/**
 * Activate a terminal window by its terminal_key.
 *
 * Terminal key formats:
 * - ITERM:<w0t0p0:UUID>  (ITERM_SESSION_ID = "w0t0p0:UUID")
 * - KITTY:<window-id>
 * - WEZTERM:<pane-id>
 * - TERM:<session-id>    (from statusline.sh using TERM_SESSION_ID)
 * - TTY:<tty-path>
 * - PID:<process-id>
 * - AUTO:* or UNKNOWN:* (unsupported)
 * - DISCOVERED:<type>:<value>[:extra] (from process scanner, unwrapped to inner type)
 */
export async function activateTerminal(terminalKey: string): Promise<ActivationResult> {
  const colonIndex = terminalKey.indexOf(':');
  if (colonIndex === -1) {
    return { success: false, method: 'unsupported', error: `Invalid terminal key format: ${terminalKey}` };
  }

  const prefix = terminalKey.substring(0, colonIndex);
  const value = terminalKey.substring(colonIndex + 1);

  switch (prefix) {
    case 'DISCOVERED':
      // DISCOVERED keys have format: DISCOVERED:<type>:<value>[:pid]
      // Extract the inner key and try to activate it
      return activateDiscoveredTerminal(value);
    case 'ITERM':
      return activateITerm(value);
    case 'KITTY':
      return activateKitty(value);
    case 'WEZTERM':
      return activateWezTerm(value);
    case 'TERM':
      // TERM_SESSION_ID from Terminal.app - no reliable activation API
      return { success: false, method: 'unsupported', error: 'TERM_SESSION_ID does not support remote activation' };
    case 'TTY':
      return activateByTTY(value);
    case 'PID':
      return activateByPid(value);
    case 'AUTO':
    case 'UNKNOWN':
      return { success: false, method: 'unsupported', error: 'Terminal does not support remote activation' };
    default:
      return { success: false, method: 'unsupported', error: `Unknown terminal key prefix: ${prefix}` };
  }
}

/**
 * Activate a terminal from a DISCOVERED key.
 *
 * Discovered key formats (after DISCOVERED: prefix is stripped):
 * - iTerm2:w0t0p0:<uuid>  → use ITERM activation with uuid
 * - TTY:<tty-path>:<pid>  → use TTY activation with tty-path
 * - PID:<pid>             → use PID activation
 */
async function activateDiscoveredTerminal(innerKey: string): Promise<ActivationResult> {
  const colonIndex = innerKey.indexOf(':');
  if (colonIndex === -1) {
    return { success: false, method: 'unsupported', error: `Invalid discovered key format: ${innerKey}` };
  }

  const innerType = innerKey.substring(0, colonIndex);
  const innerValue = innerKey.substring(colonIndex + 1);

  switch (innerType) {
    case 'iTerm2': {
      // iTerm2 discovered keys have format: iTerm2:w0t0p0:<uuid>
      // The UUID is after the second colon
      const secondColon = innerValue.indexOf(':');
      if (secondColon === -1) {
        // Just a single value, use it directly
        return activateITerm(innerValue);
      }
      // Extract UUID (everything after w0t0p0:)
      const uuid = innerValue.substring(secondColon + 1);
      return activateITerm(uuid);
    }
    case 'TTY': {
      // TTY discovered keys have format: TTY:<tty-path>:<pid>
      // We need just the tty-path for activation
      const lastColon = innerValue.lastIndexOf(':');
      if (lastColon === -1) {
        // No PID suffix, use value as-is
        return activateByTTY(innerValue);
      }
      // Check if the last segment is a PID (all digits)
      const possiblePid = innerValue.substring(lastColon + 1);
      if (/^\d+$/.test(possiblePid)) {
        // Last part is a PID, strip it
        const ttyPath = innerValue.substring(0, lastColon);
        return activateByTTY(ttyPath);
      }
      // Not a PID suffix, use full value
      return activateByTTY(innerValue);
    }
    case 'PID':
      return activateByPid(innerValue);
    default:
      // Unknown inner type, try using it as-is by reconstructing the key
      return activateTerminal(`${innerType}:${innerValue}`);
  }
}

// extractItermUuid is re-exported from connection module for backwards compatibility
export { extractItermUuid } from './connection/index.js';

/**
 * Activate an iTerm2 tab by session UUID using AppleScript.
 * Iterates all windows/tabs/sessions to find the matching UUID,
 * selects the tab, and activates the window.
 *
 * ITERM_SESSION_ID env var is "w0t0p0:UUID" format.
 * AppleScript's `unique ID of session` returns just the UUID.
 */
async function activateITerm(itermSessionId: string): Promise<ActivationResult> {
  const uuid = extractItermUuid(itermSessionId);

  const script = `
    tell application "iTerm2"
      repeat with w in windows
        repeat with t in tabs of w
          repeat with s in sessions of t
            if unique ID of s is "${uuid}" then
              select t
              set index of w to 1
              activate
              return "ok"
            end if
          end repeat
        end repeat
      end repeat
      return "not_found"
    end tell
  `;

  try {
    const result = await runAppleScript(script);
    if (result === 'ok') {
      return { success: true, method: 'iterm' };
    }
    return { success: false, method: 'iterm', error: `Session not found: ${uuid}` };
  } catch (err) {
    return { success: false, method: 'iterm', error: formatError(err) };
  }
}

/**
 * Activate a Kitty window by ID.
 * Requires `allow_remote_control yes` in kitty.conf.
 */
async function activateKitty(windowId: string): Promise<ActivationResult> {
  try {
    await execAsync(`kitten @ focus-window --match id:${windowId}`);
    return { success: true, method: 'kitty' };
  } catch (err) {
    return { success: false, method: 'kitty', error: formatError(err) };
  }
}

/**
 * Activate a WezTerm pane by pane ID.
 */
async function activateWezTerm(paneId: string): Promise<ActivationResult> {
  try {
    await execAsync(`wezterm cli activate-pane --pane-id ${paneId}`);
    return { success: true, method: 'wezterm' };
  } catch (err) {
    return { success: false, method: 'wezterm', error: formatError(err) };
  }
}

/**
 * Activate a terminal by TTY path, trying all known terminal apps.
 * Tries iTerm2 first (most common for discovered sessions), then Terminal.app.
 */
async function activateByTTY(ttyPath: string): Promise<ActivationResult> {
  const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;

  // Try iTerm2 first
  try {
    const itermScript = `
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s contains "${normalizedPath}" then
                select t
                set index of w to 1
                activate
                return "ok"
              end if
            end repeat
          end repeat
        end repeat
        return "not_found"
      end tell
    `;
    const result = await runAppleScript(itermScript);
    if (result === 'ok') {
      return { success: true, method: 'iterm' };
    }
  } catch {
    // iTerm2 not running or errored, fall through to Terminal.app
  }

  // Try Terminal.app
  return activateTerminalApp(normalizedPath);
}

/**
 * Activate a Terminal.app tab by matching its TTY path.
 * Uses AppleScript to iterate windows/tabs and match the tty.
 */
async function activateTerminalApp(ttyPath: string): Promise<ActivationResult> {
  // Normalize TTY path - ps returns "ttys012" but Terminal.app expects "/dev/ttys012"
  const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;

  const script = `
    tell application "Terminal"
      repeat with w in windows
        repeat with t in tabs of w
          if tty of t is "${normalizedPath}" then
            set selected tab of w to t
            set index of w to 1
            activate
            return "ok"
          end if
        end repeat
      end repeat
      return "not_found"
    end tell
  `;

  try {
    const result = await runAppleScript(script);
    if (result === 'ok') {
      return { success: true, method: 'terminal_app' };
    }
    return { success: false, method: 'terminal_app', error: `TTY not found: ${normalizedPath}` };
  } catch (err) {
    return { success: false, method: 'terminal_app', error: formatError(err) };
  }
}

/**
 * Activate a terminal by its process ID using System Events.
 * This is app-level only (cannot select specific tabs).
 */
async function activateByPid(pid: string): Promise<ActivationResult> {
  const script = `tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true`;

  try {
    await runAppleScript(script);
    return { success: true, method: 'pid' };
  } catch (err) {
    return { success: false, method: 'pid', error: formatError(err) };
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
