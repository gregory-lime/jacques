/**
 * Cleanup Service Tests
 */

import { jest } from '@jest/globals';

// Mock process-detection module before importing the module under test
const mockIsProcessRunning = jest.fn<(pid: number) => Promise<boolean>>();

jest.unstable_mockModule('../connection/process-detection.js', () => ({
  isProcessRunning: mockIsProcessRunning,
}));

// Import after mocking
const { CleanupService } = await import('./cleanup-service.js');
import type { CleanupServiceCallbacks } from './cleanup-service.js';
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

describe('CleanupService', () => {
  let service: InstanceType<typeof CleanupService>;
  let sessions: Map<string, Session>;
  let removedSessionIds: string[];
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    sessions = new Map();
    removedSessionIds = [];
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsProcessRunning.mockResolvedValue(false);

    const callbacks: CleanupServiceCallbacks = {
      getAllSessions: () => Array.from(sessions.entries()),
      removeSession: (id) => {
        sessions.delete(id);
        removedSessionIds.push(id);
      },
    };

    service = new CleanupService({ callbacks, logger: silentLogger });
  });

  afterEach(() => {
    service.stopCleanup();
    jest.useRealTimers();
  });

  describe('recently ended tracking', () => {
    it('should report recently ended session within TTL', () => {
      service.markRecentlyEnded('sess-1');

      expect(service.wasRecentlyEnded('sess-1')).toBe(true);
    });

    it('should report false for unknown session', () => {
      expect(service.wasRecentlyEnded('unknown')).toBe(false);
    });

    it('should expire after TTL', () => {
      service.markRecentlyEnded('sess-1');

      // Advance past the 30-second TTL
      jest.advanceTimersByTime(31_000);

      expect(service.wasRecentlyEnded('sess-1')).toBe(false);
    });

    it('should clear all entries on clear()', () => {
      service.markRecentlyEnded('sess-1');
      service.markRecentlyEnded('sess-2');

      service.clear();

      expect(service.wasRecentlyEnded('sess-1')).toBe(false);
      expect(service.wasRecentlyEnded('sess-2')).toBe(false);
    });
  });

  describe('startCleanup', () => {
    it('should remove idle sessions past cutoff', async () => {
      const oneHourAgo = Date.now() - (61 * 60 * 1000);
      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: oneHourAgo,
      }));

      service.startCleanup(60);

      // Advance to trigger cleanup interval (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);
      // Allow async runCleanup to complete
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toContain('idle-sess');
    });

    it('should not remove active sessions', async () => {
      sessions.set('active-sess', makeSession({
        session_id: 'active-sess',
        status: 'working',
        last_activity: Date.now() - (2 * 60 * 60 * 1000),
      }));

      service.startCleanup(60);
      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toHaveLength(0);
    });

    it('should not start twice', async () => {
      service.startCleanup(60);
      service.startCleanup(60); // Should be a no-op

      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: Date.now() - (61 * 60 * 1000),
      }));

      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toContain('idle-sess');
    });

    it('should NOT remove idle session with alive PID', async () => {
      mockIsProcessRunning.mockResolvedValue(true);
      const oneHourAgo = Date.now() - (61 * 60 * 1000);
      sessions.set('idle-alive', makeSession({
        session_id: 'idle-alive',
        status: 'idle',
        last_activity: oneHourAgo,
        terminal_key: 'DISCOVERED:PID:12345',
      }));

      service.startCleanup(60);
      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toHaveLength(0);
      expect(mockIsProcessRunning).toHaveBeenCalledWith(12345);
    });

    it('should remove idle session with dead PID', async () => {
      mockIsProcessRunning.mockResolvedValue(false);
      const oneHourAgo = Date.now() - (61 * 60 * 1000);
      sessions.set('idle-dead', makeSession({
        session_id: 'idle-dead',
        status: 'idle',
        last_activity: oneHourAgo,
        terminal_key: 'DISCOVERED:PID:99999',
      }));

      service.startCleanup(60);
      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toContain('idle-dead');
      expect(mockIsProcessRunning).toHaveBeenCalledWith(99999);
    });

    it('should remove idle session without PID (no process to check)', async () => {
      const oneHourAgo = Date.now() - (61 * 60 * 1000);
      sessions.set('idle-no-pid', makeSession({
        session_id: 'idle-no-pid',
        status: 'idle',
        last_activity: oneHourAgo,
        terminal_key: 'AUTO:some-uuid',
      }));

      service.startCleanup(60);
      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      expect(removedSessionIds).toContain('idle-no-pid');
      // No PID to check, so isProcessRunning should not be called
      expect(mockIsProcessRunning).not.toHaveBeenCalled();
    });
  });

  describe('stopCleanup', () => {
    it('should stop cleanup interval', async () => {
      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: Date.now() - (61 * 60 * 1000),
      }));

      service.startCleanup(60);
      service.stopCleanup();

      jest.advanceTimersByTime(5 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(0);

      // Should NOT have been removed since cleanup was stopped
      expect(removedSessionIds).toHaveLength(0);
    });
  });
});
