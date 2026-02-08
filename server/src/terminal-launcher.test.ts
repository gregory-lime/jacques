/**
 * Terminal Launcher Tests
 *
 * Tests input validation, terminal detection logic, and method dispatch.
 * Terminal spawning is mocked to prevent opening real windows during tests.
 */

import { jest } from '@jest/globals';

// ─── MOCKS (must be before module-under-test import) ──────────

// Get real exec before mocking (needed for isCommandOnPath/detectAvailableTerminal)
const { exec: realExec } = await import('child_process');

const mockSpawn = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  exec: realExec,
}));

const mockRunAppleScript = jest.fn<(script: string, language?: string) => Promise<string>>();
const mockIsAppleScriptAvailable = jest.fn<() => boolean>();
jest.unstable_mockModule('./connection/index.js', () => ({
  runAppleScript: mockRunAppleScript,
  isAppleScriptAvailable: mockIsAppleScriptAvailable,
}));

// ─── IMPORTS (after mocks) ────────────────────────────────────

const { launchTerminalSession, detectAvailableTerminal, isCommandOnPath } =
  await import('./terminal-launcher.js');

// ─── HELPERS ──────────────────────────────────────────────────

/** Create a fake child process that spawn() can return */
function createFakeProcess(pid = 12345) {
  return {
    pid,
    on: jest.fn(),
    unref: jest.fn(),
  };
}

// ─── TESTS ────────────────────────────────────────────────────

describe('launchTerminalSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: spawn returns a successful fake process
    mockSpawn.mockImplementation(() => createFakeProcess());

    // Default: AppleScript available and succeeds
    mockIsAppleScriptAvailable.mockReturnValue(true);
    mockRunAppleScript.mockResolvedValue('');
  });

  describe('input validation', () => {
    it('should reject empty cwd', async () => {
      const result = await launchTerminalSession({ cwd: '' });
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Missing cwd');
    });

    it('should reject non-existent directory', async () => {
      const result = await launchTerminalSession({ cwd: '/tmp/jacques-nonexistent-dir-12345' });
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('does not exist');
    });

    it('should reject unknown preferred terminal', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'unsupported',
      });
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Unknown launch method');
    });
  });

  describe('detectAvailableTerminal', () => {
    it('should return a valid launch method', async () => {
      const method = await detectAvailableTerminal();
      const validMethods = [
        'iterm', 'terminal_app', 'kitty', 'wezterm',
        'gnome_terminal', 'windows_terminal', 'powershell', 'unsupported',
      ];
      expect(validMethods).toContain(method);
    });

    // On macOS, should always find at least Terminal.app
    if (process.platform === 'darwin') {
      it('should find Terminal.app on macOS at minimum', async () => {
        const method = await detectAvailableTerminal();
        expect(method).not.toBe('unsupported');
      });
    }

    // On Windows, should always find at least PowerShell
    if (process.platform === 'win32') {
      it('should find PowerShell on Windows at minimum', async () => {
        const method = await detectAvailableTerminal();
        expect(method).not.toBe('unsupported');
      });
    }
  });

  describe('isCommandOnPath', () => {
    it('should find common commands', async () => {
      // These should exist on any system running tests
      const cmd = process.platform === 'win32' ? 'cmd' : 'ls';
      const result = await isCommandOnPath(cmd);
      expect(result).toBe(true);
    });

    it('should return false for nonexistent command', async () => {
      const result = await isCommandOnPath('jacques-nonexistent-command-12345');
      expect(result).toBe(false);
    });
  });

  // Method dispatch tests - mocked so no real terminals open
  describe('method dispatch', () => {
    it('should dispatch to iterm and run AppleScript', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'iterm',
      });
      expect(result.method).toBe('iterm');
      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
      const script = mockRunAppleScript.mock.calls[0][0];
      expect(script).toContain('tell application "iTerm2"');
      expect(script).toContain("cd '/tmp' && claude");
    });

    it('should dispatch to terminal_app and run AppleScript', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'terminal_app',
      });
      expect(result.method).toBe('terminal_app');
      expect(result.success).toBe(true);
      expect(mockRunAppleScript).toHaveBeenCalledTimes(1);
      const script = mockRunAppleScript.mock.calls[0][0];
      expect(script).toContain('tell application "Terminal"');
      expect(script).toContain("cd '/tmp' && claude");
    });

    it('should dispatch to kitty and spawn correct command', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'kitty',
      });
      expect(result.method).toBe('kitty');
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'kitty',
        ['--directory', '/tmp', 'claude'],
        expect.objectContaining({ detached: true, stdio: 'ignore' }),
      );
    });

    it('should dispatch to wezterm and spawn correct command', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'wezterm',
      });
      expect(result.method).toBe('wezterm');
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'wezterm',
        ['start', '--cwd', '/tmp', '--', 'claude'],
        expect.objectContaining({ detached: true, stdio: 'ignore' }),
      );
    });

    it('should dispatch to gnome_terminal and spawn correct command', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'gnome_terminal',
      });
      expect(result.method).toBe('gnome_terminal');
      expect(mockSpawn).toHaveBeenCalledWith(
        'gnome-terminal',
        ['--working-directory=/tmp', '--', 'claude'],
        expect.objectContaining({ detached: true, stdio: 'ignore' }),
      );
    });

    it('should dispatch to windows_terminal with shell option', async () => {
      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'windows_terminal',
      });
      expect(result.method).toBe('windows_terminal');
      expect(mockSpawn).toHaveBeenCalledWith(
        'wt',
        ['-d', '/tmp', 'claude'],
        expect.objectContaining({ detached: true, stdio: 'ignore', shell: true }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle spawn ENOENT gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProcess(undefined as unknown as number);
        // Simulate ENOENT firing before the 100ms success timeout
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (proc.on as any).mockImplementation((event: string, cb: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('spawn kitty ENOENT')), 10);
          }
        });
        return proc;
      });

      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'kitty',
      });
      expect(result.method).toBe('kitty');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });

    it('should handle AppleScript rejection gracefully', async () => {
      mockRunAppleScript.mockRejectedValue(new Error('execution error: iTerm2 got an error'));

      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'iterm',
      });
      expect(result.method).toBe('iterm');
      expect(result.success).toBe(false);
      expect(result.error).toContain('execution error');
    });

    it('should return error when AppleScript not available', async () => {
      mockIsAppleScriptAvailable.mockReturnValue(false);

      const result = await launchTerminalSession({
        cwd: '/tmp',
        preferredTerminal: 'iterm',
      });
      expect(result.method).toBe('iterm');
      expect(result.success).toBe(false);
      expect(result.error).toContain('AppleScript not available');
    });
  });

  // Auto-detection uses real detection logic, but launch is mocked
  describe('auto-detection', () => {
    it('should auto-detect a terminal and attempt launch', async () => {
      const result = await launchTerminalSession({ cwd: '/tmp' });
      expect(result.method).not.toBe('unsupported');
      expect(typeof result.success).toBe('boolean');

      // Verify that either runAppleScript or spawn was called (not nothing)
      const applescriptCalled = mockRunAppleScript.mock.calls.length > 0;
      const spawnCalled = mockSpawn.mock.calls.length > 0;
      expect(applescriptCalled || spawnCalled).toBe(true);
    });
  });
});
