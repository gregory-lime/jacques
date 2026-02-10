/**
 * Process Monitor Tests
 */

import { jest } from '@jest/globals';

// Mock process-detection module before importing the module under test
const mockIsProcessRunning = jest.fn<(pid: number) => Promise<boolean>>();
const mockIsProcessBypass = jest.fn<(pid: number) => Promise<boolean>>();
const mockGetClaudeProcesses = jest.fn<() => Promise<Array<{ pid: number; tty: string; cwd: string }>>>();

jest.unstable_mockModule('../connection/process-detection.js', () => ({
  isProcessRunning: mockIsProcessRunning,
  isProcessBypass: mockIsProcessBypass,
  getClaudeProcesses: mockGetClaudeProcesses,
}));

// Import after mocking
const { ProcessMonitor } = await import('./process-monitor.js');
import type { ProcessMonitorCallbacks } from './process-monitor.js';
import type { Session } from '../types.js';
import { createLogger } from '../logging/logger-factory.js';

function makeSession(overrides: Partial<Session> & { session_id: string }): Session {
  return {
    source: 'claude_code',
    session_title: null,
    transcript_path: null,
    cwd: '/test',
    project: 'test',
    model: null,
    workspace: null,
    terminal: null,
    terminal_key: 'TTY:/dev/ttys001',
    status: 'active',
    last_activity: Date.now(),
    registered_at: Date.now(),
    context_metrics: null,
    autocompact: null,
    last_tool_name: null,
    ...overrides,
  };
}

describe('ProcessMonitor', () => {
  let monitor: InstanceType<typeof ProcessMonitor>;
  let sessions: Map<string, Session>;
  let removedSessionIds: string[];
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    sessions = new Map();
    removedSessionIds = [];
    jest.clearAllMocks();
    mockGetClaudeProcesses.mockResolvedValue([]);

    const callbacks: ProcessMonitorCallbacks = {
      getSession: (id) => sessions.get(id),
      getAllSessions: () => Array.from(sessions.entries()),
      removeSession: (id) => {
        sessions.delete(id);
        removedSessionIds.push(id);
      },
    };

    monitor = new ProcessMonitor({ callbacks, logger: silentLogger });
  });

  describe('getSessionPid', () => {
    it('should extract PID from DISCOVERED:PID: key', () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
      });
      expect(monitor.getSessionPid(session)).toBe(12345);
    });

    it('should extract PID from DISCOVERED:TTY: key', () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:TTY:ttys001:67890',
      });
      expect(monitor.getSessionPid(session)).toBe(67890);
    });

    it('should fall back to terminal.terminal_pid', () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'TTY:/dev/ttys001',
        terminal: {
          tty: '/dev/ttys001',
          terminal_pid: 99999,
          term_program: null,
          iterm_session_id: null,
          term_session_id: null,
          kitty_window_id: null,
          wezterm_pane: null,
          vscode_injection: null,
          windowid: null,
          term: null,
        },
      });
      expect(monitor.getSessionPid(session)).toBe(99999);
    });

    it('should return null when no PID available', () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:some-uuid',
      });
      expect(monitor.getSessionPid(session)).toBeNull();
    });
  });

  describe('storeTerminalPid', () => {
    it('should create terminal object when none exists', () => {
      mockIsProcessBypass.mockResolvedValue(false);
      const session = makeSession({ session_id: 's1', terminal_key: 'AUTO:uuid' });

      monitor.storeTerminalPid(session, 12345);

      expect(session.terminal).not.toBeNull();
      expect(session.terminal!.terminal_pid).toBe(12345);
    });

    it('should set terminal_pid on existing terminal object', () => {
      mockIsProcessBypass.mockResolvedValue(false);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid',
        terminal: {
          tty: '/dev/ttys001',
          terminal_pid: 0,
          term_program: 'iTerm2',
          iterm_session_id: null,
          term_session_id: null,
          kitty_window_id: null,
          wezterm_pane: null,
          vscode_injection: null,
          windowid: null,
          term: null,
        },
      });

      monitor.storeTerminalPid(session, 54321);

      expect(session.terminal!.terminal_pid).toBe(54321);
    });

    it('should not overwrite existing PID', () => {
      mockIsProcessBypass.mockResolvedValue(false);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:11111',
      });

      monitor.storeTerminalPid(session, 22222);

      // PID comes from terminal_key, should not create terminal object
      expect(session.terminal).toBeNull();
    });

    it('should skip invalid PIDs', () => {
      const session = makeSession({ session_id: 's1', terminal_key: 'AUTO:uuid' });

      monitor.storeTerminalPid(session, 0);
      monitor.storeTerminalPid(session, -1);

      expect(session.terminal).toBeNull();
    });
  });

  describe('verifyProcesses', () => {
    it('should remove sessions with dead processes', async () => {
      mockIsProcessRunning.mockResolvedValue(false);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toContain('s1');
    });

    it('should keep sessions with running processes', async () => {
      mockIsProcessRunning.mockResolvedValue(true);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toHaveLength(0);
    });

    it('should remove sessions with CWD in Trash', async () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid',
        cwd: '/Users/test/.Trash/old-project',
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toContain('s1');
    });

    it('should remove sessions idle beyond timeout', async () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid',
        last_activity: Date.now() - (5 * 60 * 60 * 1000), // 5 hours ago
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toContain('s1');
    });

    it('should not remove recently active sessions without PID', async () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid',
        last_activity: Date.now(),
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toHaveLength(0);
    });
  });

  describe('detectBypassSessions', () => {
    it('should mark sessions as bypass when process has flag', async () => {
      mockIsProcessBypass.mockResolvedValue(true);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
      });
      sessions.set('s1', session);

      const updated = await monitor.detectBypassSessions();

      expect(updated).toContain('s1');
      expect(session.is_bypass).toBe(true);
    });

    it('should skip already-bypass sessions', async () => {
      mockIsProcessBypass.mockResolvedValue(true);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
        is_bypass: true,
      });
      sessions.set('s1', session);

      const updated = await monitor.detectBypassSessions();

      expect(updated).toHaveLength(0);
      expect(mockIsProcessBypass).not.toHaveBeenCalled();
    });

    it('should skip sessions without PID', async () => {
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid',
      });
      sessions.set('s1', session);

      const updated = await monitor.detectBypassSessions();

      expect(updated).toHaveLength(0);
      expect(mockIsProcessBypass).not.toHaveBeenCalled();
    });
  });

  describe('verifyProcesses - PID-less session verification', () => {
    it('should remove PID-less session when no Claude processes running', async () => {
      mockGetClaudeProcesses.mockResolvedValue([]);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:some-uuid',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000, // 2 min ago, past grace period
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toContain('s1');
      expect(mockGetClaudeProcesses).toHaveBeenCalledTimes(1);
    });

    it('should keep PID-less session when matching process found by CWD', async () => {
      mockIsProcessBypass.mockResolvedValue(false);
      mockGetClaudeProcesses.mockResolvedValue([
        { pid: 55555, tty: 'ttys001', cwd: '/Users/test/project' },
      ]);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:some-uuid',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000,
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toHaveLength(0);
      // Verify PID was enriched
      expect(monitor.getSessionPid(session)).toBe(55555);
    });

    it('should not remove PID-less session within grace period', async () => {
      mockGetClaudeProcesses.mockResolvedValue([]); // No matching processes
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:some-uuid',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 10_000, // 10s ago, within grace period
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toHaveLength(0);
    });

    it('should not claim processes already owned by PID-bearing sessions', async () => {
      mockIsProcessRunning.mockResolvedValue(true);
      mockGetClaudeProcesses.mockResolvedValue([
        { pid: 11111, tty: 'ttys001', cwd: '/Users/test/project' },
      ]);

      // Session with PID (already claims PID 11111)
      const sessionWithPid = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:11111',
        cwd: '/Users/test/project',
      });

      // PID-less session in same CWD
      const sessionWithoutPid = makeSession({
        session_id: 's2',
        terminal_key: 'AUTO:uuid2',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000,
      });

      sessions.set('s1', sessionWithPid);
      sessions.set('s2', sessionWithoutPid);

      await monitor.verifyProcesses();

      // s2 should be removed because the only process (PID 11111) is claimed by s1
      expect(removedSessionIds).toContain('s2');
      expect(removedSessionIds).not.toContain('s1');
    });

    it('should handle getClaudeProcesses failure gracefully', async () => {
      mockGetClaudeProcesses.mockRejectedValue(new Error('pgrep failed'));
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:some-uuid',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000,
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      // Should NOT remove the session (fail-safe)
      expect(removedSessionIds).toHaveLength(0);
    });

    it('should match multiple PID-less sessions to multiple processes in same CWD', async () => {
      mockIsProcessBypass.mockResolvedValue(false);
      mockGetClaudeProcesses.mockResolvedValue([
        { pid: 111, tty: 'ttys001', cwd: '/Users/test/project' },
        { pid: 222, tty: 'ttys002', cwd: '/Users/test/project' },
      ]);

      const s1 = makeSession({
        session_id: 's1',
        terminal_key: 'AUTO:uuid1',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000,
      });
      const s2 = makeSession({
        session_id: 's2',
        terminal_key: 'AUTO:uuid2',
        cwd: '/Users/test/project',
        registered_at: Date.now() - 120_000,
      });

      sessions.set('s1', s1);
      sessions.set('s2', s2);

      await monitor.verifyProcesses();

      expect(removedSessionIds).toHaveLength(0);
      // Both sessions should be enriched with PIDs
      expect(monitor.getSessionPid(s1)).not.toBeNull();
      expect(monitor.getSessionPid(s2)).not.toBeNull();
    });

    it('should skip process scan when no PID-less sessions exist', async () => {
      mockIsProcessRunning.mockResolvedValue(true);
      const session = makeSession({
        session_id: 's1',
        terminal_key: 'DISCOVERED:PID:12345',
      });
      sessions.set('s1', session);

      await monitor.verifyProcesses();

      expect(mockGetClaudeProcesses).not.toHaveBeenCalled();
    });
  });

  describe('pendingBypass', () => {
    it('should consume pending bypass for matching CWD', () => {
      monitor.markPendingBypass('/Users/test/project');

      expect(monitor.consumePendingBypass('/Users/test/project')).toBe(true);
      // Second consume should return false (already consumed)
      expect(monitor.consumePendingBypass('/Users/test/project')).toBe(false);
    });

    it('should normalize trailing slashes', () => {
      monitor.markPendingBypass('/Users/test/project/');

      expect(monitor.consumePendingBypass('/Users/test/project')).toBe(true);
    });

    it('should return false for non-matching CWD', () => {
      monitor.markPendingBypass('/Users/test/project-a');

      expect(monitor.consumePendingBypass('/Users/test/project-b')).toBe(false);
    });
  });
});
