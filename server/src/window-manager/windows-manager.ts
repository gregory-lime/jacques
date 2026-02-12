/**
 * Windows Window Manager
 *
 * Implements window positioning and tiling using PowerShell and Win32 API.
 */

import { execFile as execFileCb } from 'child_process';
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

const execFileAsync = promisify(execFileCb);

/**
 * Execute a PowerShell script and return the result.
 *
 * Uses -EncodedCommand (Base64-encoded UTF-16LE) to avoid all quoting and
 * escaping issues. Previous approach used exec() with inline double-quote
 * escaping which broke PowerShell here-strings (@"..."@) and embedded quotes.
 */
async function runPowerShell(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { timeout: 10000 }
  );
  return stdout.trim();
}

/**
 * Windows Window Manager using PowerShell and Win32 API
 */
export class WindowsWindowManager implements WindowManager {
  /** Cache display info to avoid repeated slow .NET assembly loads */
  private displayCache: { displays: Display[]; timestamp: number } | null = null;
  private static DISPLAY_CACHE_TTL = 30000; // 30 seconds

  getPlatform(): string {
    return 'win32';
  }

  isSupported(): boolean {
    return process.platform === 'win32';
  }

  /**
   * Get all displays using .NET System.Windows.Forms.Screen.
   * Results are cached for 30s to avoid repeated slow PowerShell/.NET loads.
   */
  async getDisplays(): Promise<Display[]> {
    if (this.displayCache && Date.now() - this.displayCache.timestamp < WindowsWindowManager.DISPLAY_CACHE_TTL) {
      return this.displayCache.displays;
    }

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

      const displays = screenArray.map((screen: {
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

      this.displayCache = { displays, timestamp: Date.now() };
      return displays;
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
   * Position a terminal window by its terminal key.
   *
   * Handles DISCOVERED: prefix wrapping (e.g., DISCOVERED:PID:12345).
   * Extracts the PID from any key format that contains one.
   */
  async positionWindow(terminalKey: string, geometry: WindowGeometry): Promise<PositionResult> {
    // Strip DISCOVERED: prefix if present
    const effectiveKey = terminalKey.startsWith('DISCOVERED:')
      ? terminalKey.substring(11)
      : terminalKey;

    // Extract PID from the key using regex (handles PID:xxx, TTY:xxx:pid, etc.)
    const pidMatch = effectiveKey.match(/(?:^PID:|^CONPTY:|^WINTERM:)(\d+)$/);
    if (pidMatch) {
      return this.positionByPid(pidMatch[1], geometry);
    }

    // Fallback: try to extract trailing PID (e.g., TTY:ttys001:12345)
    const trailingPidMatch = effectiveKey.match(/:(\d+)$/);
    if (trailingPidMatch) {
      return this.positionByPid(trailingPidMatch[1], geometry);
    }

    return { success: false, error: `Cannot extract PID from terminal key: ${terminalKey}` };
  }

  /**
   * Position a window by process ID using Win32 EnumWindows + parent PID traversal.
   *
   * Console apps like node.exe (Claude Code) don't own their window — the visible
   * terminal window belongs to a parent host process (wt.exe, conhost.exe, or
   * powershell.exe). We use EnumWindows to find visible windows by PID, and if
   * none are found, walk up the process tree until we find the window-owning parent.
   *
   * This is the same approach used by production tiling WMs (Komorebi, GlazeWM, FancyWM).
   */
  private async positionByPid(pid: string, geometry: WindowGeometry): Promise<PositionResult> {
    const { x, y, width, height } = geometry;

    const script = `
      Add-Type @"
        using System;
        using System.Collections.Generic;
        using System.Runtime.InteropServices;

        public class Win32Window {
          [DllImport("user32.dll")]
          public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);

          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

          public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

          [DllImport("user32.dll")]
          public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

          [DllImport("user32.dll")]
          public static extern bool IsWindowVisible(IntPtr hWnd);

          [DllImport("user32.dll")]
          public static extern int GetWindowTextLength(IntPtr hWnd);

          public static List<IntPtr> FindWindowsByPid(uint targetPid) {
            var result = new List<IntPtr>();
            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
              uint pid;
              GetWindowThreadProcessId(hWnd, out pid);
              if (pid == targetPid && IsWindowVisible(hWnd) && GetWindowTextLength(hWnd) > 0) {
                result.Add(hWnd);
              }
              return true;
            }, IntPtr.Zero);
            return result;
          }
        }
"@
      try {
        $targetPid = [uint32]${pid}
        $hwnd = [IntPtr]::Zero
        $maxDepth = 5

        # Walk up the process tree to find the window-owning process
        for ($depth = 0; $depth -lt $maxDepth; $depth++) {
          $windows = [Win32Window]::FindWindowsByPid($targetPid)
          if ($windows.Count -gt 0) {
            $hwnd = $windows[0]
            break
          }
          # Get parent PID via CIM (modern replacement for WMI)
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction Stop
          if (-not $proc -or -not $proc.ParentProcessId -or $proc.ParentProcessId -eq 0) {
            break
          }
          $targetPid = [uint32]$proc.ParentProcessId
        }

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

