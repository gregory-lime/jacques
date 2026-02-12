/**
 * Process Detection
 *
 * Cross-platform detection of running Claude Code processes.
 * Supports macOS, Linux, and Windows.
 *
 * @module connection/process-detection
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { platform } from 'process';

const execAsync = promisify(execCb);

const isWindows = platform === 'win32';
const isLinux = platform === 'linux';

/**
 * Information about a detected running Claude process
 */
export interface DetectedProcess {
  pid: number;
  tty: string;
  cwd: string;
  /** Terminal type detected from environment (if available) */
  terminalType?: string;
  /** Terminal session ID (WT_SESSION, ITERM_SESSION_ID, etc.) */
  terminalSessionId?: string;
  /** Whether the process was launched with --dangerously-skip-permissions */
  isBypass?: boolean;
}

/**
 * Get all running Claude Code processes.
 *
 * Platform-specific:
 * - macOS/Linux: Uses pgrep, ps, lsof
 * - Windows: Uses PowerShell (Get-Process, Get-WmiObject)
 */
export async function getClaudeProcesses(): Promise<DetectedProcess[]> {
  if (isWindows) {
    return getClaudeProcessesWindows();
  } else {
    return getClaudeProcessesUnix();
  }
}

/**
 * Check if a process is still running.
 *
 * Uses `kill -0` on Unix (checks existence without sending a signal)
 * and PowerShell on Windows.
 *
 * @param pid Process ID to check
 * @returns True if the process is still running
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
  if (pid <= 0) return false;

  try {
    if (isWindows) {
      await execAsync(`powershell.exe -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction Stop"`, { timeout: 3000 });
    } else {
      await execAsync(`kill -0 ${pid} 2>/dev/null`);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a specific process was launched with --dangerously-skip-permissions.
 * Reads the process command line to determine this.
 *
 * @param pid Process ID to check
 * @returns True if the process has the bypass flag
 */
export async function isProcessBypass(pid: number): Promise<boolean> {
  if (pid <= 0) return false;

  try {
    if (isWindows) {
      const { stdout } = await execAsync(
        `powershell.exe -NoProfile -Command "(Get-WmiObject Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
        { timeout: 3000 },
      );
      return stdout.includes('--dangerously-skip-permissions');
    } else {
      const { stdout } = await execAsync(`ps -o args= -p ${pid}`, { timeout: 3000 });
      return stdout.includes('--dangerously-skip-permissions');
    }
  } catch {
    return false;
  }
}

/**
 * Get platform information for diagnostics
 */
export function getPlatformInfo(): {
  platform: string;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
} {
  const isMac = platform === 'darwin';
  return { platform, isWindows, isMac, isLinux };
}

// ============================================================
// Unix Process Detection
// ============================================================

async function getClaudeProcessesUnix(): Promise<DetectedProcess[]> {
  try {
    const { stdout: pgrepOut } = await execAsync('pgrep -x claude');
    const pids = pgrepOut
      .trim()
      .split('\n')
      .filter((p) => p)
      .map((p) => parseInt(p, 10));

    if (pids.length === 0) {
      return [];
    }

    const processes: DetectedProcess[] = [];

    for (const pid of pids) {
      try {
        // Get TTY and full command line in one ps call
        const { stdout: psOut } = await execAsync(`ps -o tty=,args= -p ${pid}`);
        const psLine = psOut.trim();
        // First token is TTY, rest is the command
        const firstSpace = psLine.indexOf(' ');
        const rawTty = firstSpace > 0 ? psLine.slice(0, firstSpace).trim() : psLine;
        const tty = (!rawTty || rawTty === '??' || rawTty === '?') ? '?' : rawTty;
        const cmdLine = firstSpace > 0 ? psLine.slice(firstSpace).trim() : '';
        const isBypass = cmdLine.includes('--dangerously-skip-permissions');

        const { stdout: lsofOut } = await execAsync(
          `lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`,
        );
        const cwd = lsofOut.trim();

        if (cwd) {
          const terminalInfo = await getTerminalInfoUnix(pid);

          processes.push({
            pid,
            tty,
            cwd,
            terminalType: terminalInfo.type,
            terminalSessionId: terminalInfo.sessionId,
            isBypass,
          });
        }
      } catch {
        continue;
      }
    }

    return processes;
  } catch {
    // pgrep returns exit code 1 if no processes found
    return [];
  }
}

/**
 * Try to get terminal info from process environment on Unix
 */
async function getTerminalInfoUnix(
  pid: number,
): Promise<{ type?: string; sessionId?: string }> {
  try {
    if (isLinux) {
      const { stdout } = await execAsync(
        `cat /proc/${pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep -E '^(ITERM_SESSION_ID|TERM_SESSION_ID|KITTY_WINDOW_ID|WEZTERM_PANE|WT_SESSION)='`,
      );
      return parseTerminalEnvOutput(stdout);
    }

    // On macOS, we can't easily read another process's environment
    return {};
  } catch {
    return {};
  }
}

/**
 * Parse terminal environment variable output
 */
function parseTerminalEnvOutput(
  output: string,
): { type?: string; sessionId?: string } {
  const lines = output.trim().split('\n');
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (!value) continue;

    switch (key) {
      case 'ITERM_SESSION_ID':
        return { type: 'iTerm2', sessionId: value };
      case 'TERM_SESSION_ID':
        return { type: 'Terminal.app', sessionId: value };
      case 'KITTY_WINDOW_ID':
        return { type: 'Kitty', sessionId: value };
      case 'WEZTERM_PANE':
        return { type: 'WezTerm', sessionId: value };
      case 'WT_SESSION':
        return { type: 'Windows Terminal', sessionId: value };
    }
  }
  return {};
}

// ============================================================
// Windows Process Detection
// ============================================================

async function getClaudeProcessesWindows(): Promise<DetectedProcess[]> {
  try {
    const psScript = `
      $ErrorActionPreference = 'SilentlyContinue'
      Get-Process -Name claude,claude-code 2>$null | ForEach-Object {
        $proc = $_
        try {
          $wmi = Get-WmiObject Win32_Process -Filter "ProcessId=$($proc.Id)" 2>$null
          if ($wmi) {
            $cwd = $null
            $cmdLine = $wmi.CommandLine
            if ($cmdLine) {
              $cmdClean = $cmdLine -replace '^\\"[^\\"]*\\"\\s*|^\\S+\\s*', ''
              $cmdClean = $cmdClean.Trim().Trim('"')
              if ($cmdClean -and (Test-Path $cmdClean -PathType Container -ErrorAction SilentlyContinue)) {
                $cwd = $cmdClean
              }
            }
            if (-not $cwd -and $wmi.ExecutablePath) {
              $cwd = Split-Path -Parent $wmi.ExecutablePath
            }
            $wtSession = [System.Environment]::GetEnvironmentVariable('WT_SESSION', 'Process')
            @{
              PID = $proc.Id
              CWD = $cwd
              WT_SESSION = $wtSession
              CommandLine = $cmdLine
            } | ConvertTo-Json -Compress
          }
        } catch {}
      }
    `.replace(/\n/g, ' ');

    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "${psScript}"`,
      { timeout: 10000 },
    );

    const processes: DetectedProcess[] = [];
    const lines = stdout.trim().split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.CWD) {
          processes.push({
            pid: data.PID,
            tty: `PID:${data.PID}`,
            cwd: data.CWD,
            terminalType: data.WT_SESSION ? 'Windows Terminal' : 'PowerShell/cmd',
            terminalSessionId: data.WT_SESSION || undefined,
            isBypass: data.CommandLine?.includes('--dangerously-skip-permissions') || false,
          });
        }
      } catch {
        // Skip malformed JSON
      }
    }

    return processes;
  } catch {
    return [];
  }
}
