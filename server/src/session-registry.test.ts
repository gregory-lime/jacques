/**
 * Session Registry Tests
 */

import { SessionRegistry } from './session-registry.js';
import type { SessionStartEvent, ActivityEvent, ContextUpdateEvent } from './types.js';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  describe('registerSession', () => {
    it('should register a new session', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: 'Test Session',
        transcript_path: '/path/to/transcript.jsonl',
        cwd: '/Users/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      const session = registry.registerSession(event);

      expect(session.session_id).toBe('test-session-1');
      expect(session.session_title).toBe('Test Session');
      expect(session.status).toBe('active');
      expect(registry.hasSession('test-session-1')).toBe(true);
    });

    it('should auto-focus new sessions', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      registry.registerSession(event);

      expect(registry.getFocusedSessionId()).toBe('test-session-1');
    });
  });

  describe('updateActivity', () => {
    it('should update session activity and set status to working', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: 'Initial Title',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      // Then send activity
      const activityEvent: ActivityEvent = {
        event: 'activity',
        timestamp: Date.now() + 1000,
        session_id: 'test-session-1',
        session_title: 'Updated Title',
        tool_name: 'Read',
        terminal_pid: 12345,
      };

      const session = registry.updateActivity(activityEvent);

      expect(session).not.toBeNull();
      expect(session!.status).toBe('working');
      expect(session!.session_title).toBe('Updated Title');
      expect(session!.last_tool_name).toBe('Read');
    });

    it('should return null for unknown session', () => {
      const activityEvent: ActivityEvent = {
        event: 'activity',
        timestamp: Date.now(),
        session_id: 'unknown-session',
        session_title: null,
        tool_name: 'Read',
        terminal_pid: 12345,
      };

      const session = registry.updateActivity(activityEvent);

      expect(session).toBeNull();
    });
  });

  describe('updateContext', () => {
    it('should update context metrics', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      // Then send context update
      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        used_percentage: 42.5,
        remaining_percentage: 57.5,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        model_display_name: 'Opus',
        cwd: '/test/project',
      };

      const session = registry.updateContext(contextEvent);

      expect(session).not.toBeNull();
      expect(session!.context_metrics).not.toBeNull();
      expect(session!.context_metrics!.used_percentage).toBe(42.5);
      expect(session!.context_metrics!.remaining_percentage).toBe(57.5);
      expect(session!.model!.display_name).toBe('Opus');
    });
  });

  describe('setSessionIdle', () => {
    it('should set session status to idle', () => {
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      const session = registry.setSessionIdle('test-session-1');

      expect(session).not.toBeNull();
      expect(session!.status).toBe('idle');
    });

    it('should preserve last_tool_name when session goes idle', () => {
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      // Send activity with tool_name
      const activityEvent: ActivityEvent = {
        event: 'activity',
        timestamp: Date.now() + 1000,
        session_id: 'test-session-1',
        session_title: null,
        tool_name: 'Write',
        terminal_pid: 12345,
      };
      registry.updateActivity(activityEvent);

      // Go idle — last_tool_name should be preserved
      const session = registry.setSessionIdle('test-session-1');

      expect(session).not.toBeNull();
      expect(session!.status).toBe('idle');
      expect(session!.last_tool_name).toBe('Write');
    });
  });

  describe('unregisterSession', () => {
    it('should remove session', () => {
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      registry.unregisterSession('test-session-1');

      expect(registry.hasSession('test-session-1')).toBe(false);
      expect(registry.getSessionCount()).toBe(0);
    });

    it('should prevent re-registration of recently ended session via context_update', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      // Then unregister it (simulating /clear command)
      registry.unregisterSession('test-session-1');
      expect(registry.hasSession('test-session-1')).toBe(false);

      // Now try to auto-register via stale context_update (simulating delayed statusLine)
      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now(),
        session_id: 'test-session-1', // Same session ID that was just ended
        used_percentage: 42.5,
        remaining_percentage: 57.5,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/test/project',
      };

      const result = registry.updateContext(contextEvent);

      // Should NOT re-register the session
      expect(result).toBeNull();
      expect(registry.hasSession('test-session-1')).toBe(false);
      expect(registry.getSessionCount()).toBe(0);
    });

    it('should shift focus to next most recent session', () => {
      // Register two sessions
      const event1: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const event2: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'session-2',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys002',
      };

      registry.registerSession(event1);
      registry.registerSession(event2);

      // Focus should be on session-2 (most recent)
      expect(registry.getFocusedSessionId()).toBe('session-2');

      // Remove session-2
      registry.unregisterSession('session-2');

      // Focus should shift to session-1
      expect(registry.getFocusedSessionId()).toBe('session-1');
    });
  });

  describe('verifyProcesses', () => {
    it('should remove sessions with CWD in Trash', async () => {
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session-trash',
        session_title: 'Test Session',
        transcript_path: null,
        cwd: '/Users/test/.Trash/old-project', // CWD in Trash
        project: 'old-project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);
      expect(registry.hasSession('test-session-trash')).toBe(true);

      await registry.verifyProcesses();

      // Session should be removed because CWD is in Trash
      expect(registry.hasSession('test-session-trash')).toBe(false);
    });

    it('should remove sessions idle beyond timeout', async () => {
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000 + 1000); // 4 hours + 1 second ago
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: fourHoursAgo,
        session_id: 'test-session-idle',
        session_title: 'Idle Session',
        transcript_path: null,
        cwd: '/Users/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);
      expect(registry.hasSession('test-session-idle')).toBe(true);

      await registry.verifyProcesses();

      // Session should be removed because it's been idle for more than 4 hours
      expect(registry.hasSession('test-session-idle')).toBe(false);
    });

    it('should not remove recently active sessions', async () => {
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(), // Just now
        session_id: 'test-session-active',
        session_title: 'Active Session',
        transcript_path: null,
        cwd: '/Users/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(startEvent);

      await registry.verifyProcesses();

      // Session should still exist because it's recently active
      expect(registry.hasSession('test-session-active')).toBe(true);
    });
  });

  describe('getAllSessions', () => {
    it('should return sessions sorted by last activity', () => {
      const event1: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'session-1',
        session_title: 'First',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const event2: SessionStartEvent = {
        event: 'session_start',
        timestamp: 2000,
        session_id: 'session-2',
        session_title: 'Second',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys002',
      };
      const event3: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1500,
        session_id: 'session-3',
        session_title: 'Third',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys003',
      };

      registry.registerSession(event1);
      registry.registerSession(event2);
      registry.registerSession(event3);

      const sessions = registry.getAllSessions();

      expect(sessions[0].session_id).toBe('session-2'); // Most recent
      expect(sessions[1].session_id).toBe('session-3');
      expect(sessions[2].session_id).toBe('session-1'); // Oldest
    });
  });
});
