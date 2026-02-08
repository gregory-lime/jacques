/**
 * macOS Window Manager
 *
 * Implements window positioning and tiling using AppleScript.
 * Supports iTerm2, Terminal.app, and PID-based fallback.
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type {
  WindowManager,
  WindowGeometry,
  Display,
  TileLayout,
  PositionResult,
  TileResult,
} from './types.js';
import { calculateAllSlots } from './smart-layouts.js';
import { extractItermUuid, parseTerminalKey, runAppleScript } from '../connection/index.js';

const execAsync = promisify(execCb);

/**
 * macOS Window Manager using AppleScript
 */
export class MacOSWindowManager implements WindowManager {
  getPlatform(): string {
    return 'darwin';
  }

  isSupported(): boolean {
    return process.platform === 'darwin';
  }

  /**
   * Get all displays using NSScreen via JXA (JavaScript for Automation).
   * Falls back to Finder AppleScript (primary only) if JXA fails.
   */
  async getDisplays(): Promise<Display[]> {
    try {
      return await this.getDisplaysViaJXA();
    } catch {
      // Fallback: try Finder AppleScript for primary display only
      try {
        return await this.getDisplaysViaFinder();
      } catch {
        return [this.defaultDisplay()];
      }
    }
  }

  /**
   * Enumerate all displays via JXA using NSScreen.
   * Returns displays with screen coordinates (top-left origin, Y-down).
   */
  private async getDisplaysViaJXA(): Promise<Display[]> {
    const jxaScript = `
ObjC.import('AppKit');
var screens = $.NSScreen.screens;
var main = $.NSScreen.mainScreen;
var mainFrame = main.frame;
var primaryHeight = mainFrame.size.height;

var result = [];
for (var i = 0; i < screens.count; i++) {
  var s = screens.objectAtIndex(i);
  var f = s.frame;
  var v = s.visibleFrame;
  var isMain = (f.origin.x === mainFrame.origin.x && f.origin.y === mainFrame.origin.y &&
                f.size.width === mainFrame.size.width && f.size.height === mainFrame.size.height);

  // Convert Cocoa coords (bottom-left origin, Y-up) to screen coords (top-left origin, Y-down)
  var screenX = f.origin.x;
  var screenY = primaryHeight - f.origin.y - f.size.height;
  var visibleX = v.origin.x;
  var visibleY = primaryHeight - v.origin.y - v.size.height;

  result.push({
    index: i,
    bounds: { x: screenX, y: screenY, width: f.size.width, height: f.size.height },
    workArea: { x: visibleX, y: visibleY, width: v.size.width, height: v.size.height },
    isPrimary: isMain
  });
}
JSON.stringify(result);
`;

    const output = await runAppleScript(jxaScript, 'JavaScript');
    const screens: Array<{
      index: number;
      bounds: { x: number; y: number; width: number; height: number };
      workArea: { x: number; y: number; width: number; height: number };
      isPrimary: boolean;
    }> = JSON.parse(output);

    if (!Array.isArray(screens) || screens.length === 0) {
      throw new Error('No screens returned from JXA');
    }

    return screens.map(s => ({
      id: s.isPrimary ? 'primary' : `display-${s.index}`,
      bounds: s.bounds,
      workArea: s.workArea,
      isPrimary: s.isPrimary,
    }));
  }

  /**
   * Fallback: get primary display via Finder AppleScript
   */
  private async getDisplaysViaFinder(): Promise<Display[]> {
    const script = `
      tell application "Finder"
        get bounds of window of desktop
      end tell
    `;
    const result = await runAppleScript(script);
    const parts = result.split(',').map(s => parseInt(s.trim(), 10));

    if (parts.length === 4) {
      const [x1, y1, x2, y2] = parts;
      return [
        {
          id: 'primary',
          bounds: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
          workArea: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
          isPrimary: true,
        },
      ];
    }

    return [this.defaultDisplay()];
  }

  private defaultDisplay(): Display {
    return {
      id: 'primary',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 23, width: 1920, height: 1057 },
      isPrimary: true,
    };
  }

  /**
   * Position a terminal window by its terminal key.
   * Handles DISCOVERED: wrapper by extracting the inner terminal type.
   */
  async positionWindow(terminalKey: string, geometry: WindowGeometry): Promise<PositionResult> {
    // Unwrap DISCOVERED keys to get the actual terminal type
    const parsed = parseTerminalKey(terminalKey);
    const effective = parsed.isDiscovered && parsed.innerKey ? parsed.innerKey : parsed;

    switch (effective.prefix) {
      case 'ITERM':
        return this.positionITerm(effective.value, geometry);
      case 'TTY': {
        const ttyPath = effective.tty || effective.value.split(':')[0];
        // Skip iTerm/Terminal lookup when TTY is ?? or ? (invalid path)
        if (ttyPath !== '??' && ttyPath !== '?') {
          const result = await this.findAndPositionByTTY(ttyPath, geometry);
          if (result.success) return result;
        }
        // Fallback: if PID is available, try PID → lsof → TTY → position
        if (effective.pid) {
          return this.resolveAndPositionByPid(effective.pid, geometry);
        }
        return { success: false, error: `TTY not found and no PID fallback: ${ttyPath}` };
      }
      case 'PID':
        // Try PID → lsof → TTY → iTerm (tab-specific) before app-level PID
        if (effective.pid) {
          return this.resolveAndPositionByPid(effective.pid, geometry);
        }
        return this.positionByPid(effective.value, geometry);
      case 'KITTY':
      case 'WEZTERM':
        return { success: false, error: `${effective.prefix} window positioning not supported yet` };
      case 'TERM':
      case 'AUTO':
      case 'UNKNOWN':
        return { success: false, error: `${effective.prefix} window positioning not supported` };
      default:
        return { success: false, error: `Unknown terminal key prefix: ${effective.prefix}` };
    }
  }

  /**
   * Position an iTerm2 window by session UUID
   */
  private async positionITerm(
    itermSessionId: string,
    geometry: WindowGeometry
  ): Promise<PositionResult> {
    const uuid = extractItermUuid(itermSessionId);
    const { x, y, width, height } = geometry;

    // AppleScript bounds format: {left, top, right, bottom}
    const bounds = `{${x}, ${y}, ${x + width}, ${y + height}}`;

    const script = `
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if unique ID of s is "${uuid}" then
                -- Select the tab first
                select t
                -- Position the window
                set bounds of w to ${bounds}
                -- Bring to front
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
        return { success: true };
      }
      return { success: false, error: `Session not found: ${uuid}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Position a Terminal.app window by TTY path
   */
  private async positionTerminalApp(
    ttyPath: string,
    geometry: WindowGeometry
  ): Promise<PositionResult> {
    // Normalize TTY path - ps returns "ttys012" but Terminal.app expects "/dev/ttys012"
    const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;
    const { x, y, width, height } = geometry;
    const bounds = `{${x}, ${y}, ${x + width}, ${y + height}}`;

    const script = `
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${normalizedPath}" then
              -- Select the tab
              set selected tab of w to t
              -- Position the window
              set bounds of w to ${bounds}
              -- Bring to front
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
        return { success: true };
      }
      return { success: false, error: `TTY not found: ${ttyPath}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Find a TTY across all known terminal apps and position the window.
   * Tries iTerm2 first (most common for discovered sessions), then Terminal.app.
   */
  private async findAndPositionByTTY(
    ttyPath: string,
    geometry: WindowGeometry
  ): Promise<PositionResult> {
    const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;
    const { x, y, width, height } = geometry;
    const bounds = `{${x}, ${y}, ${x + width}, ${y + height}}`;

    // Try iTerm2 first
    try {
      const itermScript = `
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if tty of s contains "${normalizedPath}" then
                  select t
                  set bounds of w to ${bounds}
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
        return { success: true };
      }
    } catch {
      // iTerm2 not running or errored, fall through to Terminal.app
    }

    // Try Terminal.app
    return this.positionTerminalApp(ttyPath, geometry);
  }

  /**
   * Find a TTY across all known terminal apps and return window bounds.
   * Tries iTerm2 first, then Terminal.app.
   */
  private async findBoundsByTTY(ttyPath: string): Promise<WindowGeometry | null> {
    const normalizedPath = ttyPath.startsWith('/dev/') ? ttyPath : `/dev/${ttyPath}`;

    // Try iTerm2 first
    try {
      const itermScript = `
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if tty of s contains "${normalizedPath}" then
                  set b to bounds of w
                  return (item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text)
                end if
              end repeat
            end repeat
          end repeat
          return ""
        end tell
      `;
      const result = await runAppleScript(itermScript);
      if (result) {
        const parts = result.split(',').map(s => parseInt(s.trim(), 10));
        if (parts.length === 4) {
          const [x1, y1, x2, y2] = parts;
          return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }
      }
    } catch {
      // iTerm2 not running or errored, fall through to Terminal.app
    }

    // Try Terminal.app
    try {
      const terminalScript = `
        tell application "Terminal"
          repeat with w in windows
            repeat with t in tabs of w
              if tty of t is "${normalizedPath}" then
                set b to bounds of w
                return (item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text)
              end if
            end repeat
          end repeat
          return ""
        end tell
      `;
      const result = await runAppleScript(terminalScript);
      if (result) {
        const parts = result.split(',').map(s => parseInt(s.trim(), 10));
        if (parts.length === 4) {
          const [x1, y1, x2, y2] = parts;
          return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }
      }
    } catch {
      // Terminal.app not running or errored
    }

    return null;
  }

  /**
   * Position a window by process ID using System Events
   * Note: This is app-level only (cannot select specific tabs)
   */
  private async positionByPid(pid: string, geometry: WindowGeometry): Promise<PositionResult> {
    const { x, y, width, height } = geometry;

    // First, get the app name from the PID
    const getAppScript = `
      tell application "System Events"
        set theProcess to first process whose unix id is ${pid}
        return name of theProcess
      end tell
    `;

    try {
      const appName = await runAppleScript(getAppScript);

      // Now position the app's frontmost window
      const positionScript = `
        tell application "${appName}"
          if (count of windows) > 0 then
            set bounds of front window to {${x}, ${y}, ${x + width}, ${y + height}}
            activate
          end if
        end tell
      `;

      await runAppleScript(positionScript);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Resolve a TTY device path from a PID using lsof.
   * Useful when ps returns ?? but the process has a controlling TTY.
   */
  private async resolveTtyFromPid(pid: number): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `lsof -p ${pid} 2>/dev/null | awk '$4 ~ /^[0-9]+u?$/ && $8 ~ /\\/dev\\/ttys/ {print $8; exit}'`,
        { timeout: 3000 },
      );
      const tty = stdout.trim();
      return (tty && tty.startsWith('/dev/')) ? tty : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve a PID to a positioned window via TTY lookup with PID fallback.
   * Chain: PID → lsof → TTY → iTerm/Terminal.app (tab-specific) → PID app-level
   */
  private async resolveAndPositionByPid(pid: number, geometry: WindowGeometry): Promise<PositionResult> {
    // Step 1: Try PID → TTY → iTerm/Terminal.app session (tab-specific positioning)
    const resolvedTty = await this.resolveTtyFromPid(pid);
    if (resolvedTty) {
      const result = await this.findAndPositionByTTY(resolvedTty, geometry);
      if (result.success) return result;
    }
    // Step 2: Fall back to app-level PID positioning
    return this.positionByPid(String(pid), geometry);
  }

  /**
   * Resolve a PID to window bounds via TTY lookup.
   * Chain: PID → lsof → TTY → findBoundsByTTY
   */
  private async resolveBoundsByPid(pid: number): Promise<WindowGeometry | null> {
    const resolvedTty = await this.resolveTtyFromPid(pid);
    if (resolvedTty) {
      return this.findBoundsByTTY(resolvedTty);
    }
    return null;
  }

  /**
   * Position the browser window showing the Jacques GUI.
   * Searches for a window with "Jacques" in its title across common browsers.
   */
  async positionBrowserWindow(geometry: WindowGeometry): Promise<PositionResult> {
    const { x, y, width, height } = geometry;
    const browsers = [
      'Google Chrome', 'Arc', 'Safari', 'Firefox',
      'Microsoft Edge', 'Brave Browser', 'Chromium',
    ];

    for (const browser of browsers) {
      const script = `
        tell application "System Events"
          if exists process "${browser}" then
            tell process "${browser}"
              repeat with w in windows
                if name of w contains "Jacques" then
                  tell application "${browser}"
                    set bounds of front window to {${x}, ${y}, ${x + width}, ${y + height}}
                    activate
                  end tell
                  return "ok"
                end if
              end repeat
            end tell
          end if
        end tell
        return "not_found"
      `;

      try {
        const result = await runAppleScript(script);
        if (result === 'ok') {
          return { success: true };
        }
      } catch {
        continue;
      }
    }

    return { success: false, error: 'Browser window with Jacques GUI not found' };
  }

  /**
   * Get current bounds of a terminal window.
   * Returns null if bounds cannot be determined.
   * Handles DISCOVERED: wrapper by extracting the inner terminal type.
   */
  private async getWindowBounds(terminalKey: string): Promise<WindowGeometry | null> {
    // Unwrap DISCOVERED keys to get the actual terminal type
    const parsed = parseTerminalKey(terminalKey);
    const effective = parsed.isDiscovered && parsed.innerKey ? parsed.innerKey : parsed;

    try {
      switch (effective.prefix) {
        case 'ITERM': {
          const uuid = extractItermUuid(effective.value);
          const script = `
            tell application "iTerm2"
              repeat with w in windows
                repeat with t in tabs of w
                  repeat with s in sessions of t
                    if unique ID of s is "${uuid}" then
                      set b to bounds of w
                      return (item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text)
                    end if
                  end repeat
                end repeat
              end repeat
              return ""
            end tell
          `;
          const result = await runAppleScript(script);
          if (!result) return null;
          const parts = result.split(',').map(s => parseInt(s.trim(), 10));
          if (parts.length === 4) {
            const [x1, y1, x2, y2] = parts;
            return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
          }
          return null;
        }

        case 'TTY': {
          // For TTY keys, strip any PID suffix to get the tty path
          const ttyPath = effective.tty || effective.value.split(':')[0];
          // Skip lookup when TTY is ?? or ? (invalid path)
          if (ttyPath !== '??' && ttyPath !== '?') {
            const bounds = await this.findBoundsByTTY(ttyPath);
            if (bounds) return bounds;
          }
          // Fallback: if PID is available, try PID → lsof → TTY → bounds
          if (effective.pid) {
            return this.resolveBoundsByPid(effective.pid);
          }
          return null;
        }

        case 'PID': {
          // Try PID → lsof → TTY → bounds (tab-specific)
          if (effective.pid) {
            return this.resolveBoundsByPid(effective.pid);
          }
          return null;
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Detect which display contains the center point of the given bounds.
   * Returns the matching display, or null if no display contains the center.
   */
  private detectDisplayForBounds(bounds: WindowGeometry, displays: Display[]): Display | null {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    for (const display of displays) {
      const db = display.bounds;
      if (
        centerX >= db.x &&
        centerX < db.x + db.width &&
        centerY >= db.y &&
        centerY < db.y + db.height
      ) {
        return display;
      }
    }

    return null;
  }

  /**
   * Auto-detect the best display for tiling based on where windows currently are.
   * Uses majority vote: tiles on the display with the most windows.
   */
  private async detectTargetDisplay(terminalKeys: string[], displays: Display[]): Promise<Display | null> {
    if (displays.length <= 1) return null; // No point detecting with single display

    const displayVotes = new Map<string, number>();

    for (const key of terminalKeys) {
      const bounds = await this.getWindowBounds(key);
      if (!bounds) continue;

      const display = this.detectDisplayForBounds(bounds, displays);
      if (display) {
        displayVotes.set(display.id, (displayVotes.get(display.id) || 0) + 1);
      }
    }

    if (displayVotes.size === 0) return null;

    // Find display with most votes
    let bestId = '';
    let bestCount = 0;
    for (const [id, count] of displayVotes) {
      if (count > bestCount) {
        bestId = id;
        bestCount = count;
      }
    }

    return displays.find(d => d.id === bestId) || null;
  }

  /**
   * Get the target display for a set of terminal windows using majority vote.
   * Returns the display with the most terminal windows, or primary display as fallback.
   */
  async getTargetDisplayForTerminals(terminalKeys: string[]): Promise<Display | null> {
    const displays = await this.getDisplays();
    if (displays.length <= 1) return displays[0] || null;
    const detected = await this.detectTargetDisplay(terminalKeys, displays);
    return detected || displays.find(d => d.isPrimary) || displays[0];
  }

  /**
   * Tile multiple terminal windows
   */
  async tileWindows(
    terminalKeys: string[],
    layout: TileLayout,
    display?: Display
  ): Promise<TileResult> {
    if (terminalKeys.length === 0) {
      return { success: true, positioned: 0, total: 0 };
    }

    // Get display info
    const displays = await this.getDisplays();

    // Determine target display:
    // 1. Explicit display parameter
    // 2. Auto-detect from current window positions (majority vote)
    // 3. Primary display fallback
    let targetDisplay = display || null;

    if (!targetDisplay && displays.length > 1) {
      targetDisplay = await this.detectTargetDisplay(terminalKeys, displays);
    }

    if (!targetDisplay) {
      targetDisplay = displays.find(d => d.isPrimary) || displays[0];
    }

    if (!targetDisplay) {
      return {
        success: false,
        positioned: 0,
        total: terminalKeys.length,
        errors: ['No display available'],
      };
    }

    // Use smart layout engine for all window counts (consistent with tile state)
    const allSlots = calculateAllSlots(targetDisplay.workArea, terminalKeys.length);

    const errors: string[] = [];
    let positioned = 0;

    // Position each window
    for (let i = 0; i < terminalKeys.length; i++) {
      const terminalKey = terminalKeys[i];
      const geometry = allSlots[i].geometry;

      const result = await this.positionWindow(terminalKey, geometry);
      if (result.success) {
        positioned++;
      } else if (result.error) {
        errors.push(`${terminalKey}: ${result.error}`);
      }

      // Small delay between windows to let AppleScript complete
      if (i < terminalKeys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: positioned === terminalKeys.length,
      positioned,
      total: terminalKeys.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

