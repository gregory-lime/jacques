/**
 * Windows Window Manager
 *
 * Implements window positioning and tiling using PowerShell and Win32 API.
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
 * Execute a PowerShell script and return the result
 */
async function runPowerShell(script: string): Promise<string> {
  // Escape for PowerShell command line
  const escapedScript = script.replace(/"/g, '\\"');
  const { stdout } = await execAsync(
    `powershell -NoProfile -NonInteractive -Command "${escapedScript}"`,
    { timeout: 10000 }
  );
  return stdout.trim();
}

/**
 * Windows Window Manager using PowerShell and Win32 API
 */
export class WindowsWindowManager implements WindowManager {
  getPlatform(): string {
    return 'win32';
  }

  isSupported(): boolean {
    return process.platform === 'win32';
  }

  /**
   * Get all displays using .NET System.Windows.Forms.Screen
   */
  async getDisplays(): Promise<Display[]> {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $screens = [System.Windows.Forms.Screen]::AllScreens
      $result = @()
      foreach ($screen in $screens) {
        $obj = @{
          name = $screen.DeviceName
          primary = $screen.Primary
          x = $screen.Bounds.X
          y = $screen.Bounds.Y
          width = $screen.Bounds.Width
          height = $screen.Bounds.Height
          workX = $screen.WorkingArea.X
          workY = $screen.WorkingArea.Y
          workWidth = $screen.WorkingArea.Width
          workHeight = $screen.WorkingArea.Height
        }
        $result += $obj
      }
      $result | ConvertTo-Json -Compress
    `;

    try {
      const result = await runPowerShell(script);
      const screens = JSON.parse(result);

      // Handle single display (not an array)
      const screenArray = Array.isArray(screens) ? screens : [screens];

      return screenArray.map((screen: {
        name: string;
        primary: boolean;
        x: number;
        y: number;
        width: number;
        height: number;
        workX: number;
        workY: number;
        workWidth: number;
        workHeight: number;
      }, index: number) => ({
        id: screen.name || `display-${index}`,
        bounds: {
          x: screen.x,
          y: screen.y,
          width: screen.width,
          height: screen.height,
        },
        workArea: {
          x: screen.workX,
          y: screen.workY,
          width: screen.workWidth,
          height: screen.workHeight,
        },
        isPrimary: screen.primary,
      }));
    } catch {
      // Fallback to reasonable defaults
      return [
        {
          id: 'primary',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 }, // Account for taskbar
          isPrimary: true,
        },
      ];
    }
  }

  /**
   * Position a terminal window by its terminal key
   */
  async positionWindow(terminalKey: string, geometry: WindowGeometry): Promise<PositionResult> {
    const colonIndex = terminalKey.indexOf(':');
    if (colonIndex === -1) {
      return { success: false, error: `Invalid terminal key format: ${terminalKey}` };
    }

    const prefix = terminalKey.substring(0, colonIndex);
    const value = terminalKey.substring(colonIndex + 1);

    switch (prefix) {
      case 'PID':
        return this.positionByPid(value, geometry);
      case 'CONPTY':
      case 'WINTERM':
        // Windows Terminal specific handling
        return this.positionByPid(value, geometry);
      default:
        // Try PID-based positioning as fallback
        if (/^\d+$/.test(value)) {
          return this.positionByPid(value, geometry);
        }
        return { success: false, error: `Unsupported terminal key prefix: ${prefix}` };
    }
  }

  /**
   * Position a window by process ID using Win32 API
   */
  private async positionByPid(pid: string, geometry: WindowGeometry): Promise<PositionResult> {
    const { x, y, width, height } = geometry;

    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32Window {
          [DllImport("user32.dll")]
          public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);

          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
      try {
        $process = Get-Process -Id ${pid} -ErrorAction Stop
        $hwnd = $process.MainWindowHandle
        if ($hwnd -eq [IntPtr]::Zero) {
          Write-Output "no_window"
          exit
        }
        # SW_RESTORE = 9 (restore if minimized)
        [Win32Window]::ShowWindow($hwnd, 9) | Out-Null
        # SWP_NOZORDER = 0x0004, SWP_SHOWWINDOW = 0x0040
        $result = [Win32Window]::SetWindowPos($hwnd, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0044)
        [Win32Window]::SetForegroundWindow($hwnd) | Out-Null
        if ($result) {
          Write-Output "ok"
        } else {
          Write-Output "failed"
        }
      } catch {
        Write-Output "error: $($_.Exception.Message)"
      }
    `;

    try {
      const result = await runPowerShell(script);
      if (result === 'ok') {
        return { success: true };
      } else if (result === 'no_window') {
        return { success: false, error: 'Process has no main window' };
      } else if (result.startsWith('error:')) {
        return { success: false, error: result.substring(7) };
      }
      return { success: false, error: 'Failed to position window' };
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

      const result = await this.positionWindow(terminalKey, geometry);
      if (result.success) {
        positioned++;
      } else if (result.error) {
        errors.push(`${terminalKey}: ${result.error}`);
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

