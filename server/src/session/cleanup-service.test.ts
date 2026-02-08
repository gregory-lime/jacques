/**
 * Cleanup Service Tests
 */

import { jest } from '@jest/globals';
import { CleanupService, type CleanupServiceCallbacks } from './cleanup-service.js';
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
  let service: CleanupService;
  let sessions: Map<string, Session>;
  let removedSessionIds: string[];
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    sessions = new Map();
    removedSessionIds = [];
    jest.useFakeTimers();

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
    it('should remove idle sessions past cutoff', () => {
      const oneHourAgo = Date.now() - (61 * 60 * 1000);
      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: oneHourAgo,
      }));

      service.startCleanup(60);

      // Advance to trigger cleanup interval (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(removedSessionIds).toContain('idle-sess');
    });

    it('should not remove active sessions', () => {
      sessions.set('active-sess', makeSession({
        session_id: 'active-sess',
        status: 'working',
        last_activity: Date.now() - (2 * 60 * 60 * 1000),
      }));

      service.startCleanup(60);
      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(removedSessionIds).toHaveLength(0);
    });

    it('should not start twice', () => {
      service.startCleanup(60);
      service.startCleanup(60); // Should be a no-op

      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: Date.now() - (61 * 60 * 1000),
      }));

      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(removedSessionIds).toContain('idle-sess');
    });
  });

  describe('stopCleanup', () => {
    it('should stop cleanup interval', () => {
      sessions.set('idle-sess', makeSession({
        session_id: 'idle-sess',
        status: 'idle',
        last_activity: Date.now() - (61 * 60 * 1000),
      }));

      service.startCleanup(60);
      service.stopCleanup();

      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should NOT have been removed since cleanup was stopped
      expect(removedSessionIds).toHaveLength(0);
    });
  });
});
