/**
 * Terminal Launcher
 *
 * Launches a new terminal window in a given directory and runs `claude` in it.
 * Supports iTerm2, Terminal.app, Kitty, WezTerm, Windows Terminal, PowerShell,
 * and GNOME Terminal. Auto-detects the best available terminal per platform.
 *
 * Once claude starts, the existing hook infrastructure (SessionStart) handles
 * auto-registration — the new session appears in Jacques automatically.
 */

import { spawn, exec as execCb } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { runAppleScript, isAppleScriptAvailable } from './connection/index.js';

const execAsync = promisify(execCb);

export type LaunchMethod =
  | 'iterm'
  | 'terminal_app'
  | 'kitty'
  | 'wezterm'
  | 'gnome_terminal'
  | 'windows_terminal'
  | 'powershell'
  | 'unsupported';

export interface LaunchResult {
  success: boolean;
  method: LaunchMethod;
  error?: string;
  /** PID of the spawned terminal process (if detectable) */
  pid?: number;
}

export interface LaunchOptions {
  /** Working directory to run claude in */
  cwd: string;
  /** Preferred terminal emulator (overrides auto-detection) */
  preferredTerminal?: string;
  /** Target display bounds for window positioning (used for display-targeted launching) */
  targetBounds?: { x: number; y: number; width: number; height: number };
  /** Launch with --dangerously-skip-permissions flag */
  dangerouslySkipPermissions?: boolean;
}

/**
 * Launch a new terminal session running `claude` in the given directory.
 *
 * Terminal detection priority:
 * - macOS: iTerm2 → Kitty → WezTerm → Terminal.app
 * - Windows: Windows Terminal → PowerShell
 * - Linux: Kitty → WezTerm → GNOME Terminal
 */
export async function launchTerminalSession(options: LaunchOptions): Promise<LaunchResult> {
  const { cwd, preferredTerminal, targetBounds, dangerouslySkipPermissions } = options;

  if (!cwd) {
    return { success: false, method: 'unsupported', error: 'Missing cwd' };
  }

  if (!existsSync(cwd)) {
    return { success: false, method: 'unsupported', error: `Directory does not exist: ${cwd}` };
  }

  const claudeCmd = dangerouslySkipPermissions ? 'claude --dangerously-skip-permissions' : 'claude';

  // Use preferred terminal if specified
  if (preferredTerminal) {
    return launchWithMethod(preferredTerminal as LaunchMethod, cwd, claudeCmd, targetBounds);
  }

  // Auto-detect best available terminal
  const method = await detectAvailableTerminal();
  if (method === 'unsupported') {
    return { success: false, method: 'unsupported', error: 'No supported terminal emulator found' };
  }

  return launchWithMethod(method, cwd, claudeCmd, targetBounds);
}

/**
 * Detect the best available terminal emulator for the current platform.
 */
export async function detectAvailableTerminal(): Promise<LaunchMethod> {
  if (process.platform === 'darwin') {
    if (existsSync('/Applications/iTerm.app')) return 'iterm';
    if (await isCommandOnPath('kitty')) return 'kitty';
    if (await isCommandOnPath('wezterm')) return 'wezterm';
    return 'terminal_app'; // Always available on macOS
  }

  if (process.platform === 'win32') {
    if (await isCommandOnPath('wt')) return 'windows_terminal';
    return 'powershell'; // Always available on Windows
  }

  // Linux
  if (await isCommandOnPath('kitty')) return 'kitty';
  if (await isCommandOnPath('wezterm')) return 'wezterm';
  if (await isCommandOnPath('gnome-terminal')) return 'gnome_terminal';

  return 'unsupported';
}

/**
 * Check if a command is available on the system PATH.
 */
export async function isCommandOnPath(cmd: string): Promise<boolean> {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    await execAsync(`${which} ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

// ─── Platform-Specific Launchers ──────────────────────────────

type Bounds = { x: number; y: number; width: number; height: number };

async function launchWithMethod(method: LaunchMethod, cwd: string, claudeCmd: string, targetBounds?: Bounds): Promise<LaunchResult> {
  switch (method) {
    case 'iterm':
      return launchITerm(cwd, claudeCmd, targetBounds);
    case 'terminal_app':
      return launchTerminalApp(cwd, claudeCmd, targetBounds);
    case 'kitty':
      return launchKitty(cwd, claudeCmd);
    case 'wezterm':
      return launchWezTerm(cwd, claudeCmd);
    case 'windows_terminal':
      return launchWindowsTerminal(cwd, claudeCmd);
    case 'powershell':
      return launchPowerShell(cwd, claudeCmd);
    case 'gnome_terminal':
      return launchGnomeTerminal(cwd, claudeCmd);
    default:
      return { success: false, method: 'unsupported', error: `Unknown launch method: ${method}` };
  }
}

/**
 * Launch iTerm2 with a new window running claude.
 * Uses AppleScript via the existing runAppleScript() infrastructure.
 *
 * We create a window with default profile (login shell), then write text
 * to the session. This ensures the user's PATH is loaded (e.g. ~/.zshrc)
 * so `claude` is found even if it's in ~/.local/bin.
 */
async function launchITerm(cwd: string, claudeCmd: string, targetBounds?: Bounds): Promise<LaunchResult> {
  if (!isAppleScriptAvailable()) {
    return { success: false, method: 'iterm', error: 'AppleScript not available (macOS only)' };
  }

  const escapedCwd = escapeForAppleScript(cwd);

  // If targetBounds provided, position window on that display instead of cascading
  const positionBlock = targetBounds
    ? `set bounds of newWindow to {${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`
    : `-- Cascade position from existing window
      if hasExisting then
        -- Wrap if cascade would push off screen edge
        if (cascadeX + winW) > 2400 then set cascadeX to 100
        if (cascadeY + winH) > 1500 then set cascadeY to 100
        set bounds of newWindow to {cascadeX, cascadeY, cascadeX + winW, cascadeY + winH}
      end if`;

  const script = `
    tell application "iTerm2" to activate
    delay 0.6

    tell application "iTerm2"
      -- Capture existing front window bounds for cascade
      set hasExisting to false
      set cascadeX to 100
      set cascadeY to 100
      set winW to 800
      set winH to 600

      if (count of windows) > 0 then
        set hasExisting to true
        set {x1, y1, x2, y2} to bounds of front window
        set winW to x2 - x1
        set winH to y2 - y1
        set cascadeX to x1 + 30
        set cascadeY to y1 + 30
      end if

      set newWindow to (create window with default profile)
      tell current session of newWindow
        write text "cd '${escapedCwd}' && ${claudeCmd}"
      end tell

      ${positionBlock}
    end tell
  `;

  try {
    await runAppleScript(script);
    return { success: true, method: 'iterm' };
  } catch (err) {
    return { success: false, method: 'iterm', error: formatError(err) };
  }
}

/**
 * Launch Terminal.app with a new window running claude.
 * Uses `do script` which opens a login shell with full PATH.
 */
async function launchTerminalApp(cwd: string, claudeCmd: string, targetBounds?: Bounds): Promise<LaunchResult> {
  if (!isAppleScriptAvailable()) {
    return { success: false, method: 'terminal_app', error: 'AppleScript not available (macOS only)' };
  }

  const escapedCwd = escapeForAppleScript(cwd);

  const positionBlock = targetBounds
    ? `set bounds of front window to {${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`
    : `-- Cascade position
      if hasExisting then
        if (cascadeX + winW) > 2400 then set cascadeX to 100
        if (cascadeY + winH) > 1500 then set cascadeY to 100
        set bounds of front window to {cascadeX, cascadeY, cascadeX + winW, cascadeY + winH}
      end if`;

  const script = `
    tell application "Terminal"
      -- Capture existing window bounds for cascade
      set hasExisting to false
      set cascadeX to 100
      set cascadeY to 100
      set winW to 800
      set winH to 600

      if (count of windows) > 0 then
        set hasExisting to true
        set {x1, y1, x2, y2} to bounds of front window
        set winW to x2 - x1
        set winH to y2 - y1
        set cascadeX to x1 + 30
        set cascadeY to y1 + 30
      end if

      do script "cd '${escapedCwd}' && ${claudeCmd}"
      activate

      ${positionBlock}
    end tell
  `;

  try {
    await runAppleScript(script);
    return { success: true, method: 'terminal_app' };
  } catch (err) {
    return { success: false, method: 'terminal_app', error: formatError(err) };
  }
}

/**
 * Launch Kitty terminal with claude.
 * Works on macOS and Linux.
 */
async function launchKitty(cwd: string, claudeCmd: string): Promise<LaunchResult> {
  return spawnDetached('kitty', ['--directory', cwd, ...claudeCmd.split(' ')], 'kitty');
}

/**
 * Launch WezTerm with claude.
 * Uses `wezterm start` for new window (not `wezterm cli spawn` which targets existing).
 * Works on macOS, Linux, and Windows.
 */
async function launchWezTerm(cwd: string, claudeCmd: string): Promise<LaunchResult> {
  return spawnDetached('wezterm', ['start', '--cwd', cwd, '--', ...claudeCmd.split(' ')], 'wezterm');
}

/**
 * Launch Windows Terminal with claude.
 */
async function launchWindowsTerminal(cwd: string, claudeCmd: string): Promise<LaunchResult> {
  return spawnDetached('wt', ['-d', cwd, ...claudeCmd.split(' ')], 'windows_terminal', { shell: true });
}

/**
 * Launch PowerShell with claude (Windows fallback).
 */
async function launchPowerShell(cwd: string, claudeCmd: string): Promise<LaunchResult> {
  const escapedCwd = cwd.replace(/"/g, '`"');
  return spawnDetached('powershell', [
    '-NoProfile',
    '-Command',
    `Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "${escapedCwd}"; ${claudeCmd}'`,
  ], 'powershell');
}

/**
 * Launch GNOME Terminal with claude (Linux).
 */
async function launchGnomeTerminal(cwd: string, claudeCmd: string): Promise<LaunchResult> {
  return spawnDetached('gnome-terminal', ['--working-directory=' + cwd, '--', ...claudeCmd.split(' ')], 'gnome_terminal');
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Spawn a detached process and handle ENOENT/errors gracefully.
 * The spawn() call emits 'error' asynchronously for ENOENT, so we
 * wait briefly for the error event before declaring success.
 */
function spawnDetached(
  cmd: string,
  args: string[],
  method: LaunchMethod,
  extraOpts?: Record<string, unknown>,
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        ...extraOpts,
      });

      let resolved = false;

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, method, error: formatError(err) });
        }
      });

      proc.unref();

      // Give a brief window for ENOENT to fire before declaring success
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: true, method, pid: proc.pid });
        }
      }, 100);
    } catch (err) {
      resolve({ success: false, method, error: formatError(err) });
    }
  });
}

/**
 * Escape a string for use inside single-quoted AppleScript strings.
 */
function escapeForAppleScript(str: string): string {
  return str.replace(/'/g, "'\\''");
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
