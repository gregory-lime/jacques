/**
 * AppleScript Utilities
 *
 * Centralized utilities for executing AppleScript on macOS.
 * Used for terminal activation, focus detection, and window management.
 *
 * @module connection/applescript
 */

import { exec as execCb, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(execCb);
const execFileAsync = promisify(execFileCb);

/**
 * Escape single quotes in AppleScript for shell execution.
 *
 * When passing AppleScript to `osascript -e`, single quotes in the script
 * must be escaped. This function replaces ' with '\'' which:
 * 1. Ends the single-quoted string
 * 2. Adds an escaped single quote
 * 3. Starts a new single-quoted string
 *
 * @param script The AppleScript code to escape
 * @returns Escaped script safe for shell execution
 *
 * @example
 * escapeAppleScript("tell app 'Finder'") // "tell app '\\''Finder'\\''"
 */
export function escapeAppleScript(script: string): string {
  return script.replace(/'/g, "'\\''");
}

/**
 * Execute an AppleScript or JXA script and return the result.
 *
 * For AppleScript: wraps the script in proper shell escaping and executes via `osascript`.
 * For JavaScript (JXA): uses `execFile` to avoid shell injection with complex scripts.
 * Returns the trimmed stdout from the script execution.
 *
 * @param script The script code to execute
 * @param language The scripting language: 'AppleScript' (default) or 'JavaScript' (JXA)
 * @returns Promise resolving to the trimmed output string
 * @throws Error if script execution fails
 */
export async function runAppleScript(
  script: string,
  language: 'AppleScript' | 'JavaScript' = 'AppleScript'
): Promise<string> {
  if (language === 'JavaScript') {
    // Use execFile to avoid shell injection with complex JXA scripts
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script]);
    return stdout.trim();
  }
  const { stdout } = await execAsync(`osascript -e '${escapeAppleScript(script)}'`);
  return stdout.trim();
}

/**
 * Check if AppleScript is available on this platform.
 *
 * AppleScript is only available on macOS (darwin).
 *
 * @returns True if running on macOS
 */
export function isAppleScriptAvailable(): boolean {
  return process.platform === 'darwin';
}
