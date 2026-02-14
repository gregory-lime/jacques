/**
 * Linux Window Manager
 *
 * Implements window positioning and tiling using wmctrl and xrandr for X11.
 * Note: Wayland does not support window positioning by design.
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

const execAsync = promisify(execCb);

/**
 * Check if a command exists on the system
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running under Wayland
 */
function isWayland(): boolean {
  return process.env.XDG_SESSION_TYPE === 'wayland' ||
         process.env.WAYLAND_DISPLAY !== undefined;
}

/**
 * Linux Window Manager using wmctrl and xrandr
 */
export class LinuxWindowManager implements WindowManager {
  private wmctrlAvailable: boolean | null = null;
  private xdotoolAvailable: boolean | null = null;

  getPlatform(): string {
    return 'linux';
  }

  isSupported(): boolean {
    // Linux is supported, but Wayland has limitations
    return process.platform === 'linux';
  }

  /**
   * Check if wmctrl is available (lazy check)
   */
  private async checkWmctrl(): Promise<boolean> {
    if (this.wmctrlAvailable === null) {
      this.wmctrlAvailable = await commandExists('wmctrl');
    }
    return this.wmctrlAvailable;
  }

  /**
   * Check if xdotool is available (lazy check)
   */
  private async checkXdotool(): Promise<boolean> {
    if (this.xdotoolAvailable === null) {
      this.xdotoolAvailable = await commandExists('xdotool');
    }
    return this.xdotoolAvailable;
  }

  /**
   * Get all displays using xrandr
   */
  async getDisplays(): Promise<Display[]> {
    if (isWayland()) {
      // Wayland doesn't provide standard display enumeration
      // Return a single display with estimated dimensions
      return [
        {
          id: 'wayland-primary',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1080 },
          isPrimary: true,
        },
      ];
    }

    try {
      const { stdout } = await execAsync('xrandr --query');
      const displays: Display[] = [];

      // Parse xrandr output
      // Example: "DP-1 connected primary 2560x1440+0+0 (normal left inverted right x axis y axis)"
      const lines = stdout.split('\n');
      let displayIndex = 0;

      for (const line of lines) {
        const match = line.match(
          /^(\S+)\s+connected\s*(primary)?\s*(\d+)x(\d+)\+(\d+)\+(\d+)/
        );
        if (match) {
          const [, name, primary, width, height, x, y] = match;
          displays.push({
            id: name,
            bounds: {
              x: parseInt(x, 10),
              y: parseInt(y, 10),
              width: parseInt(width, 10),
              height: parseInt(height, 10),
            },
            workArea: {
              // Estimate work area (subtract common panel sizes)
              x: parseInt(x, 10),
              y: parseInt(y, 10) + 28, // Assume 28px top panel
              width: parseInt(width, 10),
              height: parseInt(height, 10) - 28,
            },
            isPrimary: primary === 'primary' || displayIndex === 0,
          });
          displayIndex++;
        }
      }

      if (displays.length === 0) {
        // Fallback
        return [
          {
            id: 'primary',
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            workArea: { x: 0, y: 28, width: 1920, height: 1052 },
            isPrimary: true,
          },
        ];
      }

      return displays;
    } catch {
      // Fallback to reasonable defaults
      return [
        {
          id: 'primary',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 28, width: 1920, height: 1052 },
          isPrimary: true,
        },
      ];
    }
  }

  /**
   * Position a terminal window by its terminal key
   */
  async positionWindow(terminalKey: string, geometry: WindowGeometry): Promise<PositionResult> {
    if (isWayland()) {
      return {
        success: false,
        error: 'Window positioning is not supported on Wayland. Use your compositor\'s built-in tiling.',
      };
    }

    const hasWmctrl = await this.checkWmctrl();
    if (!hasWmctrl) {
      return {
        success: false,
        error: 'wmctrl not installed. Install with: sudo apt install wmctrl',
      };
    }

    const colonIndex = terminalKey.indexOf(':');
    if (colonIndex === -1) {
      return { success: false, error: `Invalid terminal key format: ${terminalKey}` };
    }

    const prefix = terminalKey.substring(0, colonIndex);
    const value = terminalKey.substring(colonIndex + 1);

    switch (prefix) {
      case 'PID':
        return this.positionByPid(value, geometry);
      case 'WINDOWID':
      case 'X11':
        return this.positionByWindowId(value, geometry);
      default:
        // Try PID-based positioning as fallback
        if (/^\d+$/.test(value)) {
          return this.positionByPid(value, geometry);
        }
        return { success: false, error: `Unsupported terminal key prefix: ${prefix}` };
    }
  }

  /**
   * Position a window by X11 window ID using wmctrl
   */
  private async positionByWindowId(
    windowId: string,
    geometry: WindowGeometry
  ): Promise<PositionResult> {
    const { x, y, width, height } = geometry;

    try {
      // wmctrl -e format: gravity,x,y,width,height
      // gravity 0 means use current gravity
      await execAsync(
        `wmctrl -i -r ${windowId} -e 0,${x},${y},${width},${height}`
      );

      // Activate the window
      await execAsync(`wmctrl -i -a ${windowId}`);

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Position a window by process ID
   */
  private async positionByPid(pid: string, geometry: WindowGeometry): Promise<PositionResult> {
    const { x, y, width, height } = geometry;

    try {
      // First, try to find the window ID for this PID using wmctrl
      const { stdout } = await execAsync('wmctrl -l -p');

      // Parse wmctrl output to find window with matching PID
      // Format: 0x0400006  0 12345  hostname Window Title
      const lines = stdout.split('\n');
      let windowId: string | null = null;

      for (const line of lines) {
        const match = line.match(/^(0x[\da-f]+)\s+\d+\s+(\d+)/i);
        if (match && match[2] === pid) {
          windowId = match[1];
          break;
        }
      }

      // If not found directly, try xdotool to search by PID
      if (!windowId) {
        const hasXdotool = await this.checkXdotool();
        if (hasXdotool) {
          try {
            const { stdout: xdoResult } = await execAsync(`xdotool search --pid ${pid}`);
            const ids = xdoResult.trim().split('\n').filter(Boolean);
            if (ids.length > 0) {
              // Convert decimal to hex for wmctrl
              windowId = '0x' + parseInt(ids[0], 10).toString(16);
            }
          } catch {
            // xdotool search failed
          }
        }
      }

      if (!windowId) {
        return { success: false, error: `No window found for PID ${pid}` };
      }

      // Position using wmctrl
      await execAsync(
        `wmctrl -i -r ${windowId} -e 0,${x},${y},${width},${height}`
      );

      // Activate the window
      await execAsync(`wmctrl -i -a ${windowId}`);

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
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

    if (isWayland()) {
      return {
        success: false,
        positioned: 0,
        total: terminalKeys.length,
        errors: ['Window tiling is not supported on Wayland. Use your compositor\'s built-in tiling.'],
      };
    }

    const hasWmctrl = await this.checkWmctrl();
    if (!hasWmctrl) {
      return {
        success: false,
        positioned: 0,
        total: terminalKeys.length,
        errors: ['wmctrl not installed. Install with: sudo apt install wmctrl'],
      };
    }

    // Get display info
    const displays = await this.getDisplays();
    const targetDisplay = display || displays.find(d => d.isPrimary) || displays[0];

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

      try {
        const result = await this.positionWindow(terminalKey, geometry);
        if (result.success) {
          positioned++;
        } else if (result.error) {
          errors.push(`${terminalKey}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`${terminalKey}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Small delay between windows
      if (i < terminalKeys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
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

