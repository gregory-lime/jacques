/**
 * Terminal Activator Tests
 *
 * Tests prefix parsing and unsupported terminal handling.
 * The actual exec calls (osascript, kitten, wezterm) are platform-specific
 * and tested via manual verification.
 */

import { activateTerminal, extractItermUuid } from './terminal-activator.js';

describe('activateTerminal', () => {
  describe('prefix parsing', () => {
    it('should return unsupported for invalid key format (no colon)', async () => {
      const result = await activateTerminal('invalid-key');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Invalid terminal key format');
    });

    it('should return unsupported for empty string', async () => {
      const result = await activateTerminal('');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Invalid terminal key format');
    });

    it('should return unsupported for AUTO prefix', async () => {
      const result = await activateTerminal('AUTO:12345');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('does not support remote activation');
    });

    it('should return unsupported for UNKNOWN prefix', async () => {
      const result = await activateTerminal('UNKNOWN:something');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('does not support remote activation');
    });

    it('should return unsupported for unrecognized prefix', async () => {
      const result = await activateTerminal('VSCODE:1234');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Unknown terminal key prefix');
    });

    it('should return unsupported for ALACRITTY prefix', async () => {
      const result = await activateTerminal('ALACRITTY:window1');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('Unknown terminal key prefix');
    });

    it('should return unsupported for TERM prefix', async () => {
      const result = await activateTerminal('TERM:123.456');
      expect(result.success).toBe(false);
      expect(result.method).toBe('unsupported');
      expect(result.error).toContain('does not support remote activation');
    });
  });

  describe('extractItermUuid', () => {
    it('should extract UUID from w0t0p0:UUID format', () => {
      expect(extractItermUuid('w0t0p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512'))
        .toBe('8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
    });

    it('should extract UUID from w1t2p0:UUID format', () => {
      expect(extractItermUuid('w1t2p0:ABCDEF12-3456-7890-ABCD-EF1234567890'))
        .toBe('ABCDEF12-3456-7890-ABCD-EF1234567890');
    });

    it('should return value as-is if no colon present', () => {
      expect(extractItermUuid('8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512'))
        .toBe('8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
    });
  });

  // Integration-style tests that actually call exec.
  // These will fail in CI but verify correct method dispatch.
  // Use short timeout since these may hang on some platforms.
  describe('method dispatch', () => {
    it('should dispatch to iterm for ITERM prefix', async () => {
      const result = await activateTerminal('ITERM:12345678-1234-1234-1234-123456789abc');
      expect(result.method).toBe('iterm');
    }, 3000);

    it('should dispatch to kitty for KITTY prefix', async () => {
      const result = await activateTerminal('KITTY:42');
      expect(result.method).toBe('kitty');
    }, 3000);

    it('should dispatch to wezterm for WEZTERM prefix', async () => {
      const result = await activateTerminal('WEZTERM:7');
      expect(result.method).toBe('wezterm');
    }, 3000);

    it('should dispatch to iterm or terminal_app for TTY prefix', async () => {
      const result = await activateTerminal('TTY:/dev/ttys003');
      // activateByTTY tries iTerm2 first, then Terminal.app
      expect(['iterm', 'terminal_app']).toContain(result.method);
    }, 10000);

    it('should dispatch to pid for PID prefix', async () => {
      const result = await activateTerminal('PID:99999');
      expect(result.method).toBe('pid');
    }, 3000);
  });
});
