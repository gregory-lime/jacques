/**
 * Terminal Key Utilities Tests
 */

import {
  parseTerminalKey,
  buildTerminalKey,
  extractPid,
  extractItermUuid,
  matchTerminalKeys,
  describeTerminalKey,
} from './terminal-key.js';
import { TerminalKeyPrefix } from './constants.js';

describe('terminal-key', () => {
  describe('parseTerminalKey', () => {
    it('should parse ITERM key with w0t0p0:UUID format', () => {
      const result = parseTerminalKey('ITERM:w0t0p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
      expect(result.prefix).toBe(TerminalKeyPrefix.ITERM);
      expect(result.value).toBe('w0t0p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
      expect(result.uuid).toBe('8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
      expect(result.isDiscovered).toBe(false);
    });

    it('should parse ITERM key with UUID only', () => {
      const result = parseTerminalKey('ITERM:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
      expect(result.prefix).toBe(TerminalKeyPrefix.ITERM);
      expect(result.uuid).toBe('8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
    });

    it('should parse TTY key', () => {
      const result = parseTerminalKey('TTY:/dev/ttys001');
      expect(result.prefix).toBe(TerminalKeyPrefix.TTY);
      expect(result.tty).toBe('/dev/ttys001');
    });

    it('should parse PID key', () => {
      const result = parseTerminalKey('PID:12345');
      expect(result.prefix).toBe(TerminalKeyPrefix.PID);
      expect(result.pid).toBe(12345);
    });

    it('should parse KITTY key', () => {
      const result = parseTerminalKey('KITTY:42');
      expect(result.prefix).toBe(TerminalKeyPrefix.KITTY);
      expect(result.value).toBe('42');
    });

    it('should parse WEZTERM key', () => {
      const result = parseTerminalKey('WEZTERM:pane:0');
      expect(result.prefix).toBe(TerminalKeyPrefix.WEZTERM);
      expect(result.value).toBe('pane:0');
    });

    it('should parse AUTO key', () => {
      const result = parseTerminalKey('AUTO:abc-123-def');
      expect(result.prefix).toBe(TerminalKeyPrefix.AUTO);
      expect(result.value).toBe('abc-123-def');
    });

    it('should parse DISCOVERED:TTY key with PID', () => {
      const result = parseTerminalKey('DISCOVERED:TTY:ttys001:12345');
      expect(result.prefix).toBe(TerminalKeyPrefix.DISCOVERED);
      expect(result.isDiscovered).toBe(true);
      expect(result.innerKey?.prefix).toBe(TerminalKeyPrefix.TTY);
      expect(result.pid).toBe(12345);
      expect(result.tty).toBe('ttys001');
    });

    it('should parse DISCOVERED:PID key', () => {
      const result = parseTerminalKey('DISCOVERED:PID:54321');
      expect(result.prefix).toBe(TerminalKeyPrefix.DISCOVERED);
      expect(result.isDiscovered).toBe(true);
      expect(result.innerKey?.prefix).toBe(TerminalKeyPrefix.PID);
      expect(result.pid).toBe(54321);
    });

    it('should parse DISCOVERED:iTerm2 key with ITERM prefix normalization', () => {
      const result = parseTerminalKey('DISCOVERED:iTerm2:ABC123-DEF456');
      expect(result.prefix).toBe(TerminalKeyPrefix.DISCOVERED);
      expect(result.isDiscovered).toBe(true);
      // iTerm2 should normalize to ITERM prefix (not UNKNOWN)
      expect(result.innerKey?.prefix).toBe(TerminalKeyPrefix.ITERM);
      expect(result.innerKey?.uuid).toBe('ABC123-DEF456');
      expect(result.uuid).toBe('ABC123-DEF456');
    });

    it('should handle empty string', () => {
      const result = parseTerminalKey('');
      expect(result.prefix).toBe(TerminalKeyPrefix.UNKNOWN);
      expect(result.value).toBe('');
    });

    it('should handle key without colon', () => {
      const result = parseTerminalKey('invalid-key');
      expect(result.prefix).toBe(TerminalKeyPrefix.UNKNOWN);
      expect(result.value).toBe('invalid-key');
    });
  });

  describe('buildTerminalKey', () => {
    it('should build ITERM key', () => {
      const key = buildTerminalKey({ itermSessionId: 'w0t0p0:UUID-123' });
      expect(key).toBe('ITERM:w0t0p0:UUID-123');
    });

    it('should build TTY key', () => {
      const key = buildTerminalKey({ tty: '/dev/ttys001' });
      expect(key).toBe('TTY:/dev/ttys001');
    });

    it('should build PID key', () => {
      const key = buildTerminalKey({ pid: 12345 });
      expect(key).toBe('PID:12345');
    });

    it('should build KITTY key', () => {
      const key = buildTerminalKey({ kittyWindowId: '42' });
      expect(key).toBe('KITTY:42');
    });

    it('should build WEZTERM key', () => {
      const key = buildTerminalKey({ weztermPaneId: 'pane:0' });
      expect(key).toBe('WEZTERM:pane:0');
    });

    it('should prioritize iTerm over TTY', () => {
      const key = buildTerminalKey({ itermSessionId: 'UUID', tty: '/dev/ttys001' });
      expect(key).toBe('ITERM:UUID');
    });

    it('should prioritize TTY over PID', () => {
      const key = buildTerminalKey({ tty: '/dev/ttys001', pid: 12345 });
      expect(key).toBe('TTY:/dev/ttys001');
    });

    it('should return null for empty identity', () => {
      const key = buildTerminalKey({});
      expect(key).toBeNull();
    });

    it('should return null for zero PID', () => {
      const key = buildTerminalKey({ pid: 0 });
      expect(key).toBeNull();
    });
  });

  describe('extractPid', () => {
    it('should extract PID from PID:xxx format', () => {
      expect(extractPid('PID:12345')).toBe(12345);
    });

    it('should extract PID from DISCOVERED:PID:xxx format', () => {
      expect(extractPid('DISCOVERED:PID:54321')).toBe(54321);
    });

    it('should extract PID from DISCOVERED:TTY:xxx:pid format', () => {
      expect(extractPid('DISCOVERED:TTY:ttys001:68231')).toBe(68231);
    });

    it('should return null for TTY without PID', () => {
      expect(extractPid('TTY:/dev/ttys001')).toBeNull();
    });

    it('should return null for ITERM key', () => {
      expect(extractPid('ITERM:w0t0p0:UUID')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractPid('')).toBeNull();
    });

    it('should return null for null-ish input', () => {
      expect(extractPid(null as unknown as string)).toBeNull();
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

    it('should handle full ITERM: key', () => {
      expect(extractItermUuid('ITERM:w0t0p0:UUID-123'))
        .toBe('UUID-123');
    });

    it('should return empty string for empty input', () => {
      expect(extractItermUuid('')).toBe('');
    });
  });

  describe('matchTerminalKeys', () => {
    it('should match identical keys', () => {
      expect(matchTerminalKeys('ITERM:w0t0p0:UUID', 'ITERM:w0t0p0:UUID')).toBe(true);
    });

    it('should match iTerm keys with same UUID but different w/t/p prefix', () => {
      expect(matchTerminalKeys(
        'ITERM:w0t0p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512',
        'ITERM:w1t2p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512'
      )).toBe(true);
    });

    it('should match iTerm key with and without w/t/p prefix', () => {
      expect(matchTerminalKeys(
        'ITERM:w0t0p0:UUID-123',
        'ITERM:UUID-123'
      )).toBe(true);
    });

    it('should not match iTerm keys with different UUIDs', () => {
      expect(matchTerminalKeys('ITERM:UUID-A', 'ITERM:UUID-B')).toBe(false);
    });

    it('should match TTY keys', () => {
      expect(matchTerminalKeys('TTY:/dev/ttys001', 'TTY:/dev/ttys001')).toBe(true);
    });

    it('should not match different TTY keys', () => {
      expect(matchTerminalKeys('TTY:/dev/ttys001', 'TTY:/dev/ttys002')).toBe(false);
    });

    it('should match PID keys', () => {
      expect(matchTerminalKeys('PID:12345', 'PID:12345')).toBe(true);
    });

    it('should not match different types', () => {
      expect(matchTerminalKeys('ITERM:UUID', 'TTY:/dev/ttys001')).toBe(false);
    });

    it('should match DISCOVERED key with unwrapped key', () => {
      expect(matchTerminalKeys(
        'DISCOVERED:TTY:ttys001:12345',
        'TTY:ttys001'
      )).toBe(true);
    });

    it('should match DISCOVERED TTY (short) with hook TTY (/dev/ prefix)', () => {
      expect(matchTerminalKeys(
        'DISCOVERED:TTY:ttys001:12345',
        'TTY:/dev/ttys001'
      )).toBe(true);
    });

    it('should match TTY with /dev/ prefix vs without', () => {
      expect(matchTerminalKeys('TTY:ttys001', 'TTY:/dev/ttys001')).toBe(true);
    });

    it('should match DISCOVERED:iTerm2 with ITERM key (prefix normalization)', () => {
      expect(matchTerminalKeys(
        'DISCOVERED:iTerm2:ABC123-DEF456',
        'ITERM:w0t0p0:ABC123-DEF456'
      )).toBe(true);
    });

    it('should match DISCOVERED:iTerm2 with ITERM UUID-only key', () => {
      expect(matchTerminalKeys(
        'DISCOVERED:iTerm2:ABC123-DEF456',
        'ITERM:ABC123-DEF456'
      )).toBe(true);
    });

    it('should return false for empty keys', () => {
      expect(matchTerminalKeys('', 'ITERM:UUID')).toBe(false);
      expect(matchTerminalKeys('ITERM:UUID', '')).toBe(false);
    });
  });

  describe('describeTerminalKey', () => {
    it('should describe ITERM key', () => {
      const desc = describeTerminalKey('ITERM:w0t0p0:8A7D83CA-3FA0-4D00-B34E-08C4FFA1E512');
      expect(desc).toContain('ITERM');
      expect(desc).toContain('8A7D83CA');
    });

    it('should describe TTY key', () => {
      const desc = describeTerminalKey('TTY:/dev/ttys001');
      expect(desc).toContain('TTY');
      expect(desc).toContain('/dev/ttys001');
    });

    it('should describe PID key', () => {
      const desc = describeTerminalKey('PID:12345');
      expect(desc).toContain('PID');
      expect(desc).toContain('12345');
    });

    it('should describe DISCOVERED key', () => {
      const desc = describeTerminalKey('DISCOVERED:TTY:ttys001:12345');
      expect(desc).toContain('Discovered');
    });

    it('should describe AUTO key', () => {
      const desc = describeTerminalKey('AUTO:session-123');
      expect(desc).toContain('Auto-registered');
    });

    it('should describe unknown key', () => {
      const desc = describeTerminalKey('invalid');
      expect(desc).toContain('Unknown');
    });
  });
});
