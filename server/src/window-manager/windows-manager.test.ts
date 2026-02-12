/**
 * Windows Window Manager Tests
 *
 * Tests terminal key parsing, PID extraction, result parsing, and tiling logic.
 * PowerShell execution is mocked to prevent real Win32 API calls during tests.
 */

import { jest } from '@jest/globals';

// ─── MOCKS (must be before module-under-test import) ──────────

const mockExecFile = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execFile: mockExecFile,
}));

// ─── IMPORTS (after mocks) ────────────────────────────────────

const { WindowsWindowManager } = await import('./windows-manager.js');

// ─── HELPERS ──────────────────────────────────────────────────

const GEOMETRY = { x: 100, y: 200, width: 800, height: 600 };

/**
 * Make mockExecFile call back with the given stdout value.
 * The callback is the last argument to execFile(cmd, args, opts, cb).
 */
function mockPowerShellResult(stdout: string) {
  mockExecFile.mockImplementation(
    (...args: unknown[]) => {
      // execFile with promisify: the callback is the last arg
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        (cb as (err: Error | null, result: { stdout: string }) => void)(null, { stdout });
      }
    }
  );
}

function mockPowerShellError(message: string) {
  mockExecFile.mockImplementation(
    (...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        (cb as (err: Error | null, result: { stdout: string }) => void)(new Error(message), { stdout: '' });
      }
    }
  );
}

// ─── TESTS ────────────────────────────────────────────────────

describe('WindowsWindowManager', () => {
  let manager: InstanceType<typeof WindowsWindowManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new WindowsWindowManager();
  });

  describe('getPlatform / isSupported', () => {
    it('returns win32 as platform', () => {
      expect(manager.getPlatform()).toBe('win32');
    });

    it('isSupported reflects current platform', () => {
      expect(manager.isSupported()).toBe(process.platform === 'win32');
    });
  });

  describe('positionWindow — terminal key parsing', () => {
    beforeEach(() => {
      mockPowerShellResult('ok');
    });

    it('extracts PID from PID:12345 format', async () => {
      const result = await manager.positionWindow('PID:12345', GEOMETRY);
      expect(result.success).toBe(true);
      // Verify PowerShell was called (meaning PID was extracted)
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('extracts PID from CONPTY:99999 format', async () => {
      const result = await manager.positionWindow('CONPTY:99999', GEOMETRY);
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('extracts PID from WINTERM:54321 format', async () => {
      const result = await manager.positionWindow('WINTERM:54321', GEOMETRY);
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('strips DISCOVERED: prefix before extracting PID', async () => {
      const result = await manager.positionWindow('DISCOVERED:PID:12345', GEOMETRY);
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('strips DISCOVERED: prefix for CONPTY keys', async () => {
      const result = await manager.positionWindow('DISCOVERED:CONPTY:99999', GEOMETRY);
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('extracts trailing PID from TTY:ttys001:12345 format', async () => {
      const result = await manager.positionWindow('TTY:ttys001:12345', GEOMETRY);
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('returns error for keys without extractable PID', async () => {
      const result = await manager.positionWindow('NOKEY', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot extract PID');
      // PowerShell should NOT be called
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('returns error for empty terminal key', async () => {
      const result = await manager.positionWindow('', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot extract PID');
    });
  });

  describe('positionWindow — PowerShell result parsing', () => {
    it('returns success for "ok" result', async () => {
      mockPowerShellResult('ok');
      const result = await manager.positionWindow('PID:1234', GEOMETRY);
      expect(result).toEqual({ success: true });
    });

    it('returns error for "no_window" result', async () => {
      mockPowerShellResult('no_window');
      const result = await manager.positionWindow('PID:1234', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Process has no main window');
    });

    it('returns error for "failed" result', async () => {
      mockPowerShellResult('failed');
      const result = await manager.positionWindow('PID:1234', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to position window');
    });

    it('returns error message from PowerShell errors', async () => {
      mockPowerShellResult('error: access denied');
      const result = await manager.positionWindow('PID:1234', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toBe('access denied');
    });

    it('handles PowerShell execution failure', async () => {
      mockPowerShellError('Command failed: timeout');
      const result = await manager.positionWindow('PID:1234', GEOMETRY);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Command failed: timeout');
    });
  });

  describe('positionWindow — script content', () => {
    beforeEach(() => {
      mockPowerShellResult('ok');
    });

    it('passes geometry values to PowerShell script', async () => {
      await manager.positionWindow('PID:5678', { x: 50, y: 100, width: 640, height: 480 });
      expect(mockExecFile).toHaveBeenCalled();
      // The script is Base64-encoded as the -EncodedCommand argument
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('-EncodedCommand');
      // Decode the Base64 to verify PID and geometry are embedded
      const encodedIdx = args.indexOf('-EncodedCommand');
      const encoded = args[encodedIdx + 1];
      const script = Buffer.from(encoded, 'base64').toString('utf16le');
      expect(script).toContain('5678');
      expect(script).toContain('50');
      expect(script).toContain('100');
      expect(script).toContain('640');
      expect(script).toContain('480');
    });

    it('uses EnumWindows approach (not MainWindowHandle)', async () => {
      await manager.positionWindow('PID:1234', GEOMETRY);
      const args = mockExecFile.mock.calls[0][1] as string[];
      const encodedIdx = args.indexOf('-EncodedCommand');
      const encoded = args[encodedIdx + 1];
      const script = Buffer.from(encoded, 'base64').toString('utf16le');
      expect(script).toContain('EnumWindows');
      expect(script).toContain('FindWindowsByPid');
      expect(script).toContain('GetWindowThreadProcessId');
      expect(script).toContain('IsWindowVisible');
      expect(script).not.toContain('MainWindowHandle');
    });

    it('includes parent PID traversal via Get-CimInstance', async () => {
      await manager.positionWindow('PID:1234', GEOMETRY);
      const args = mockExecFile.mock.calls[0][1] as string[];
      const encodedIdx = args.indexOf('-EncodedCommand');
      const encoded = args[encodedIdx + 1];
      const script = Buffer.from(encoded, 'base64').toString('utf16le');
      expect(script).toContain('Get-CimInstance');
      expect(script).toContain('ParentProcessId');
      expect(script).toContain('$maxDepth');
    });
  });

  describe('tileWindows', () => {
    it('returns success for empty key list', async () => {
      const result = await manager.tileWindows([], 'side-by-side');
      expect(result).toEqual({ success: true, positioned: 0, total: 0 });
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});
