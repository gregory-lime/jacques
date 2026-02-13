/**
 * Terminal Activator
 *
 * Activates (brings to foreground with keyboard focus) or raises (z-order only)
 * a terminal window identified by its terminal_key. Supports iTerm2, Kitty,
 * WezTerm, Terminal.app, and PID-based fallback.
 *
 * Two modes:
 * - activate: select tab + raise window + activate app (steals focus)
 * - raise:    raise window only (no tab switch, no focus steal)
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
 * Mode controls what AppleScript commands are emitted:
 * - activate: `select t` + `set index of w to 1` + `activate`
 * - raise:    `set index of w to 1` only
 */
type WindowMode = 'activate' | 'raise';

// ============================================================
// Public API
// ============================================================

/**
 * Activate a terminal window by its terminal_key (steals focus).
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
  return dispatchByKey(terminalKey, 'activate');
}

/**
 * Raise a terminal window to the front (z-order) WITHOUT stealing keyboard focus.
 *
 * Unlike activateTerminal(), this only changes window z-order:
 * - No `select t` (don't switch tabs)
 * - No `activate` (don't steal keyboard focus)
 * - Only `set index of w to 1` (bring window to front)
 *
 * Falls back to activateTerminal() for unsupported terminal types.
 */
export async function raiseTerminal(terminalKey: string): Promise<ActivationResult> {
  return dispatchByKey(terminalKey, 'raise');
}

// ============================================================
// Key dispatch (shared between activate and raise)
// ============================================================

async function dispatchByKey(terminalKey: string, mode: WindowMode): Promise<ActivationResult> {
  const colonIndex = terminalKey.indexOf(':');
  if (colonIndex === -1) {
    return { success: false, method: 'unsupported', error: `Invalid terminal key format: ${terminalKey}` };
  }

  const prefix = terminalKey.substring(0, colonIndex);
  const value = terminalKey.substring(colonIndex + 1);

  switch (prefix) {
    case 'DISCOVERED':
      return dispatchDiscovered(value, mode);
    case 'ITERM':
      return handleITerm(value, mode);
    case 'KITTY':
      // Kitty only supports full activation (focus-window)
      return activateKitty(value);
    case 'WEZTERM':
      // WezTerm only supports full activation (activate-pane)
      return activateWezTerm(value);
    case 'TERM':
      return { success: false, method: 'unsupported', error: 'TERM_SESSION_ID does not support remote activation' };
    case 'TTY':
      return handleByTTY(value, mode);
    case 'PID':
      // PID-based uses System Events (always app-level, no tab control)
      return activateByPid(value);
    case 'AUTO':
    case 'UNKNOWN':
      return { success: false, method: 'unsupported', error: 'Terminal does not support remote activation' };
    default:
      return { success: false, method: 'unsupported', error: `Unknown terminal key prefix: ${prefix}` };
  }
}

/**
 * Dispatch a DISCOVERED key by unwrapping to the inner type.
 *
 * Discovered key formats (after DISCOVERED: prefix is stripped):
 * - iTerm2:w0t0p0:<uuid>  → use ITERM activation with uuid
 * - TTY:<tty-path>:<pid>  → use TTY activation with tty-path
 * - PID:<pid>             → use PID activation
 */
async function dispatchDiscovered(innerKey: string, mode: WindowMode): Promise<ActivationResult> {
  const colonIndex = innerKey.indexOf(':');
  if (colonIndex === -1) {
    return { success: false, method: 'unsupported', error: `Invalid discovered key format: ${innerKey}` };
  }

  const innerType = innerKey.substring(0, colonIndex);
  const innerValue = innerKey.substring(colonIndex + 1);

  switch (innerType) {
    case 'iTerm2': {
      // iTerm2 discovered keys have format: iTerm2:w0t0p0:<uuid>
      const secondColon = innerValue.indexOf(':');
      const uuid = secondColon === -1 ? innerValue : innerValue.substring(secondColon + 1);
      return handleITerm(uuid, mode);
    }
    case 'TTY': {
      // TTY discovered keys have format: TTY:<tty-path>:<pid>
      // Strip PID suffix if present
      const lastColon = innerValue.lastIndexOf(':');
      if (lastColon === -1) {
        return handleByTTY(innerValue, mode);
      }
      const possiblePid = innerValue.substring(lastColon + 1);
      const ttyPath = /^\d+$/.test(possiblePid)
        ? innerValue.substring(0, lastColon)
        : innerValue;
      return handleByTTY(ttyPath, mode);
    }
    case 'PID':
      return activateByPid(innerValue);
    default:
      // Unknown inner type, try dispatching as a top-level key
      return dispatchByKey(`${innerType}:${innerValue}`, mode);
  }
}

// ============================================================
// iTerm2 helpers
// ============================================================

/**
 * Build iTerm2 AppleScript commands based on mode.
 * - activate: `select t` + `set index of w to 1` + `activate`
 * - raise: `set index of w to 1` only
 */
function itermMatchCommands(mode: WindowMode): string {
  if (mode === 'activate') {
    return `
              select t
              set index of w to 1
              activate`;
  }
  return `
              set index of w to 1`;
}

async function handleITerm(itermSessionId: string, mode: WindowMode): Promise<ActivationResult> {
  const uuid = extractItermUuid(itermSessionId);

  const script = `
    tell application "iTerm2"
      repeat with w in windows
        repeat with t in tabs of w
          repeat with s in sessions of t
            if unique ID of s is "${uuid}" then${itermMatchCommands(mode)}
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

// ============================================================
// TTY helpers (tries iTerm2 then Terminal.app)
// ============================================================

async function handleByTTY(ttyPath: string, mode: WindowMode): Promise<ActivationResult> {
  const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;

  // Try iTerm2 first
  try {
    const itermScript = `
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s contains "${normalizedPath}" then${itermMatchCommands(mode)}
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
  return handleTerminalApp(normalizedPath, mode);
}

/**
 * Terminal.app commands based on mode.
 * - activate: `set selected tab of w to t` + `set index of w to 1` + `activate`
 * - raise: `set index of w to 1` only
 */
async function handleTerminalApp(normalizedPath: string, mode: WindowMode): Promise<ActivationResult> {
  const matchCommands = mode === 'activate'
    ? `
            set selected tab of w to t
            set index of w to 1
            activate`
    : `
            set index of w to 1`;

  const script = `
    tell application "Terminal"
      repeat with w in windows
        repeat with t in tabs of w
          if tty of t is "${normalizedPath}" then${matchCommands}
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

// ============================================================
// Kitty / WezTerm / PID (no mode distinction)
// ============================================================

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

// ============================================================
// Utilities
// ============================================================

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
