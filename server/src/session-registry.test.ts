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

  describe('auto-registration from context_update', () => {
    it('should auto-register session from context_update when session does not exist', () => {
      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now(),
        session_id: 'auto-session-1',
        used_percentage: 25.0,
        remaining_percentage: 75.0,
        context_window_size: 200000,
        model: 'claude-sonnet-4-5-20250929',
        cwd: '/Users/test/my-project',
      };

      const session = registry.updateContext(contextEvent);

      expect(session).not.toBeNull();
      expect(session!.session_id).toBe('auto-session-1');
      expect(session!.terminal_key).toMatch(/^AUTO:/);
      expect(session!.context_metrics!.used_percentage).toBe(25.0);
      expect(session!.cwd).toBe('/Users/test/my-project');
      expect(registry.hasSession('auto-session-1')).toBe(true);
    });

    it('should upgrade AUTO: terminal key when hook fires after auto-registration', () => {
      // Auto-register via context_update first
      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now(),
        session_id: 'upgrade-session',
        used_percentage: 30.0,
        remaining_percentage: 70.0,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/Users/test/project',
      };
      registry.updateContext(contextEvent);

      const session = registry.getSession('upgrade-session');
      expect(session!.terminal_key).toMatch(/^AUTO:/);

      // Now hook fires with real terminal key
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'upgrade-session',
        session_title: 'My Session',
        transcript_path: '/path/to/transcript.jsonl',
        cwd: '/Users/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys005',
      };
      const updated = registry.registerSession(startEvent);

      // Terminal key should be upgraded from AUTO: to TTY:
      expect(updated.terminal_key).toBe('TTY:/dev/ttys005');
      expect(updated.session_title).toBe('My Session');
      expect(updated.transcript_path).toBe('/path/to/transcript.jsonl');
    });
  });

  describe('terminal key conflict resolution', () => {
    it('should remove old session when new session starts in same terminal', () => {
      // Register first session
      const event1: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'old-session',
        session_title: 'Old Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(event1);

      expect(registry.hasSession('old-session')).toBe(true);

      // Register new session with same terminal key but different session_id
      const event2: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'new-session',
        session_title: 'New Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001', // Same terminal key!
      };
      registry.registerSession(event2);

      // Old session should be removed
      expect(registry.hasSession('old-session')).toBe(false);
      // New session should exist
      expect(registry.hasSession('new-session')).toBe(true);
      expect(registry.getSessionCount()).toBe(1);
    });
  });

  describe('bypass mode', () => {
    it('should mark session as bypass when pending bypass CWD matches', () => {
      // Mark CWD as pending bypass
      registry.markPendingBypass('/Users/test/bypass-project');

      // Register session with matching CWD
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'bypass-session',
        session_title: 'Bypass Session',
        transcript_path: null,
        cwd: '/Users/test/bypass-project',
        project: 'bypass-project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const session = registry.registerSession(event);

      expect(session.is_bypass).toBe(true);
    });

    it('should not mark session as bypass when no pending bypass', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'normal-session',
        session_title: 'Normal Session',
        transcript_path: null,
        cwd: '/Users/test/normal-project',
        project: 'normal-project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const session = registry.registerSession(event);

      expect(session.is_bypass).toBeFalsy();
    });

    it('should consume pending bypass so it only works once', () => {
      registry.markPendingBypass('/Users/test/bypass-project');

      // First session consumes the bypass
      const event1: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'session-1',
        session_title: null,
        transcript_path: null,
        cwd: '/Users/test/bypass-project',
        project: 'bypass-project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const session1 = registry.registerSession(event1);
      expect(session1.is_bypass).toBe(true);

      // Second session in same CWD should NOT be bypass
      const event2: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'session-2',
        session_title: null,
        transcript_path: null,
        cwd: '/Users/test/bypass-project',
        project: 'bypass-project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys002',
      };
      const session2 = registry.registerSession(event2);
      expect(session2.is_bypass).toBeFalsy();
    });
  });

  describe('stale session cleanup on /clear', () => {
    it('should remove DISCOVERED:TTY session when hook session starts with /dev/ TTY', () => {
      // Simulate a session discovered at startup (short TTY from ps)
      const discovered = registry.registerDiscoveredSession({
        sessionId: 'old-discovered',
        cwd: '/test',
        transcriptPath: '/path/to/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: Date.now(),
        title: 'Old Session',
        pid: 12345,
        tty: 'ttys001',
        project: 'test',
      });
      expect(discovered.terminal_key).toBe('DISCOVERED:TTY:ttys001:12345');
      expect(registry.hasSession('old-discovered')).toBe(true);

      // New session starts with /dev/ TTY (from hook after /clear)
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'new-session',
        session_title: 'After Clear',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: { tty: '/dev/ttys001', terminal_pid: 12345, term_program: null, iterm_session_id: null, term_session_id: null, kitty_window_id: null, wezterm_pane: null, vscode_injection: null, windowid: null, term: null },
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(event);

      expect(registry.hasSession('old-discovered')).toBe(false);
      expect(registry.hasSession('new-session')).toBe(true);
      expect(registry.getSessionCount()).toBe(1);
    });

    it('should remove AUTO session when hook session starts with same PID', () => {
      // Auto-register via context_update (gets AUTO: key)
      registry.updateContext({
        event: 'context_update',
        timestamp: Date.now(),
        session_id: 'auto-session',
        used_percentage: 50,
        remaining_percentage: 50,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/test',
        terminal_pid: 12345,
      });
      expect(registry.hasSession('auto-session')).toBe(true);
      expect(registry.getSession('auto-session')!.terminal_key).toMatch(/^AUTO:/);

      // New session starts with same PID (after /clear, same process)
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'new-session',
        session_title: 'After Clear',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: { tty: '/dev/ttys001', terminal_pid: 12345, term_program: null, iterm_session_id: null, term_session_id: null, kitty_window_id: null, wezterm_pane: null, vscode_injection: null, windowid: null, term: null },
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(event);

      expect(registry.hasSession('auto-session')).toBe(false);
      expect(registry.hasSession('new-session')).toBe(true);
      expect(registry.getSessionCount()).toBe(1);
    });

    it('should remove DISCOVERED:iTerm2 session when ITERM hook session starts', () => {
      // Simulate discovered iTerm2 session
      const discovered = registry.registerDiscoveredSession({
        sessionId: 'old-iterm',
        cwd: '/test',
        transcriptPath: '/path/to/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: Date.now(),
        title: 'Old iTerm Session',
        pid: 12345,
        tty: '?',
        project: 'test',
        terminalType: 'iTerm2',
        terminalSessionId: 'ABC123-DEF456',
      });
      expect(discovered.terminal_key).toBe('DISCOVERED:iTerm2:ABC123-DEF456');
      expect(registry.hasSession('old-iterm')).toBe(true);

      // New session starts with ITERM key (from hook)
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'new-iterm',
        session_title: 'After Clear',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: { tty: null, terminal_pid: 12345, term_program: 'iTerm2', iterm_session_id: 'w0t0p0:ABC123-DEF456', term_session_id: null, kitty_window_id: null, wezterm_pane: null, vscode_injection: null, windowid: null, term: null },
        terminal_key: 'ITERM:w0t0p0:ABC123-DEF456',
      };
      registry.registerSession(event);

      expect(registry.hasSession('old-iterm')).toBe(false);
      expect(registry.hasSession('new-iterm')).toBe(true);
      expect(registry.getSessionCount()).toBe(1);
    });

    it('should not remove sessions from different terminals', () => {
      // Register session in terminal 1
      const event1: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'session-terminal-1',
        session_title: 'Terminal 1',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: { tty: '/dev/ttys001', terminal_pid: 11111, term_program: null, iterm_session_id: null, term_session_id: null, kitty_window_id: null, wezterm_pane: null, vscode_injection: null, windowid: null, term: null },
        terminal_key: 'TTY:/dev/ttys001',
      };
      registry.registerSession(event1);

      // New session in terminal 2 (different TTY & PID)
      const event2: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now() + 1000,
        session_id: 'session-terminal-2',
        session_title: 'Terminal 2',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: { tty: '/dev/ttys002', terminal_pid: 22222, term_program: null, iterm_session_id: null, term_session_id: null, kitty_window_id: null, wezterm_pane: null, vscode_injection: null, windowid: null, term: null },
        terminal_key: 'TTY:/dev/ttys002',
      };
      registry.registerSession(event2);

      // Both sessions should coexist
      expect(registry.hasSession('session-terminal-1')).toBe(true);
      expect(registry.hasSession('session-terminal-2')).toBe(true);
      expect(registry.getSessionCount()).toBe(2);
    });
  });

  describe('mode detection from permission_mode', () => {
    it('should set mode to plan from plan permission', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'plan-session',
        session_title: 'Plan Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
        permission_mode: 'plan',
      };
      const session = registry.registerSession(event);

      expect(session.mode).toBe('plan');
    });

    it('should set mode to acceptEdits from acceptEdits permission', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'code-session',
        session_title: 'Code Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
        permission_mode: 'acceptEdits',
      };
      const session = registry.registerSession(event);

      expect(session.mode).toBe('acceptEdits');
    });

    it('should mark as bypass from bypassPermissions (mode not set, is_bypass set)', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'bypass-perm-session',
        session_title: 'Bypass Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
        permission_mode: 'bypassPermissions',
      };
      const session = registry.registerSession(event);

      // bypassPermissions sets is_bypass but does NOT set mode
      expect(session.is_bypass).toBe(true);
      expect(session.mode).toBeUndefined();
    });

    it('should set mode to default from default permission', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'default-session',
        session_title: 'Default Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
        permission_mode: 'default',
      };
      const session = registry.registerSession(event);

      expect(session.mode).toBe('default');
    });
  });
});
