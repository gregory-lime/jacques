/**
 * Event Handler Tests
 */

import { EventHandler } from './event-handler.js';
import { SessionRegistry } from '../session-registry.js';
import { BroadcastService } from '../services/broadcast-service.js';
import { NotificationService } from '../services/notification-service.js';
import { HandoffWatcher } from '../watchers/handoff-watcher.js';
import { createLogger } from '../logging/logger-factory.js';
import type {
  Session,
  SessionStartEvent,
  ActivityEvent,
  ContextUpdateEvent,
  IdleEvent,
  SessionEndEvent,
} from '../types.js';

// Mock BroadcastService
class MockBroadcastService {
  public sessionWithFocusCalls: Session[] = [];
  public sessionRemovedWithFocusCalls: string[] = [];
  public sessionUpdateCalls: Session[] = [];
  public focusChangeCalls: number = 0;

  broadcastSessionWithFocus(session: Session): void {
    this.sessionWithFocusCalls.push(session);
  }

  broadcastSessionRemovedWithFocus(sessionId: string): void {
    this.sessionRemovedWithFocusCalls.push(sessionId);
  }

  broadcastSessionUpdate(session: Session): void {
    this.sessionUpdateCalls.push(session);
  }

  broadcastFocusChange(): void {
    this.focusChangeCalls++;
  }
}

// Mock HandoffWatcher
class MockHandoffWatcher {
  public startWatchingCalls: { sessionId: string; projectDir: string }[] = [];
  public stopWatchingCalls: string[] = [];

  startWatching(sessionId: string, projectDir: string): void {
    this.startWatchingCalls.push({ sessionId, projectDir });
  }

  stopWatching(sessionId: string): void {
    this.stopWatchingCalls.push(sessionId);
  }
}

// Mock NotificationService
class MockNotificationService {
  public contextUpdateCalls: Session[] = [];
  public sessionRemovedCalls: string[] = [];

  onContextUpdate(session: Session): void {
    this.contextUpdateCalls.push(session);
  }

  onSessionRemoved(sessionId: string): void {
    this.sessionRemovedCalls.push(sessionId);
  }
}

describe('EventHandler', () => {
  let eventHandler: EventHandler;
  let registry: SessionRegistry;
  let mockBroadcastService: MockBroadcastService;
  let mockHandoffWatcher: MockHandoffWatcher;
  let mockNotificationService: MockNotificationService;
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });
    mockBroadcastService = new MockBroadcastService();
    mockHandoffWatcher = new MockHandoffWatcher();
    mockNotificationService = new MockNotificationService();

    eventHandler = new EventHandler({
      registry,
      broadcastService: mockBroadcastService as unknown as BroadcastService,
      handoffWatcher: mockHandoffWatcher as unknown as HandoffWatcher,
      notificationService: mockNotificationService as unknown as NotificationService,
      logger: silentLogger,
    });
  });

  describe('handleEvent - session_start', () => {
    it('should register session, broadcast, and start handoff watcher', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: 'Test Session',
        transcript_path: '/path/to/transcript.jsonl',
        cwd: '/Users/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      eventHandler.handleEvent(event);

      // Verify session was registered
      expect(registry.hasSession('test-session')).toBe(true);

      // Verify broadcast was called
      expect(mockBroadcastService.sessionWithFocusCalls).toHaveLength(1);
      expect(mockBroadcastService.sessionWithFocusCalls[0].session_id).toBe('test-session');

      // Verify handoff watcher was started
      expect(mockHandoffWatcher.startWatchingCalls).toHaveLength(1);
      expect(mockHandoffWatcher.startWatchingCalls[0].sessionId).toBe('test-session');
      expect(mockHandoffWatcher.startWatchingCalls[0].projectDir).toBe('/Users/test/project');
    });
  });

  describe('handleEvent - activity', () => {
    it('should update session activity and broadcast', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      // Clear the mocks
      mockBroadcastService.sessionWithFocusCalls = [];

      // Send activity event
      const activityEvent: ActivityEvent = {
        event: 'activity',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        session_title: 'Updated Title',
        tool_name: 'Read',
        terminal_pid: 12345,
      };

      eventHandler.handleEvent(activityEvent);

      // Verify session was updated
      const session = registry.getSession('test-session');
      expect(session?.status).toBe('working');
      expect(session?.session_title).toBe('Updated Title');

      // Verify broadcast was called (activity uses broadcastSessionUpdate, not broadcastSessionWithFocus)
      expect(mockBroadcastService.sessionUpdateCalls).toHaveLength(1);
    });
  });

  describe('handleEvent - context_update', () => {
    it('should update context metrics and broadcast', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      // Clear the mocks
      mockBroadcastService.sessionWithFocusCalls = [];

      // Send context update
      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        used_percentage: 42.5,
        remaining_percentage: 57.5,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/test/project',
      };

      eventHandler.handleEvent(contextEvent);

      // Verify context was updated
      const session = registry.getSession('test-session');
      expect(session?.context_metrics?.used_percentage).toBe(42.5);

      // Verify broadcast was called (context_update uses broadcastSessionUpdate, not broadcastSessionWithFocus)
      expect(mockBroadcastService.sessionUpdateCalls).toHaveLength(1);
    });
  });

  describe('handleEvent - idle', () => {
    it('should mark session as idle and broadcast (without focus change)', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      // Clear the mocks
      mockBroadcastService.sessionWithFocusCalls = [];
      mockBroadcastService.sessionUpdateCalls = [];

      // Send idle event
      const idleEvent: IdleEvent = {
        event: 'idle',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        terminal_pid: 12345,
      };

      eventHandler.handleEvent(idleEvent);

      // Verify session was marked idle
      const session = registry.getSession('test-session');
      expect(session?.status).toBe('idle');

      // Verify only session update was called (no focus change)
      expect(mockBroadcastService.sessionUpdateCalls).toHaveLength(1);
      expect(mockBroadcastService.sessionWithFocusCalls).toHaveLength(0);
    });
  });

  describe('handleEvent - session_end', () => {
    it('should stop handoff watcher, unregister session, and broadcast removal', () => {
      // First register a session
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test/project',
        project: 'project',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      // Clear the mocks
      mockHandoffWatcher.stopWatchingCalls = [];

      // Send session end event
      const endEvent: SessionEndEvent = {
        event: 'session_end',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        terminal_pid: 12345,
      };

      eventHandler.handleEvent(endEvent);

      // Verify handoff watcher was stopped
      expect(mockHandoffWatcher.stopWatchingCalls).toContain('test-session');

      // Verify session was unregistered
      expect(registry.hasSession('test-session')).toBe(false);

      // Verify removal was broadcast
      expect(mockBroadcastService.sessionRemovedWithFocusCalls).toContain('test-session');
    });
  });

  describe('notification service integration', () => {
    it('should call notificationService.onContextUpdate on context_update', () => {
      // Register session first
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      const contextEvent: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        used_percentage: 55,
        remaining_percentage: 45,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/test',
      };
      eventHandler.handleEvent(contextEvent);

      expect(mockNotificationService.contextUpdateCalls).toHaveLength(1);
      expect(mockNotificationService.contextUpdateCalls[0].session_id).toBe('test-session');
    });

    it('should call notificationService.onSessionRemoved on session_end', () => {
      // Register session first
      const startEvent: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      eventHandler.handleEvent(startEvent);

      const endEvent: SessionEndEvent = {
        event: 'session_end',
        timestamp: Date.now() + 1000,
        session_id: 'test-session',
        terminal_pid: 12345,
      };
      eventHandler.handleEvent(endEvent);

      expect(mockNotificationService.sessionRemovedCalls).toContain('test-session');
    });
  });

  describe('handleEvent - unknown event', () => {
    it('should handle unknown event types gracefully', () => {
      const unknownEvent = {
        event: 'unknown_event',
        timestamp: Date.now(),
        session_id: 'test-session',
      };

      // Should not throw
      expect(() => eventHandler.handleEvent(unknownEvent as any)).not.toThrow();
    });
  });
});
