/**
 * Broadcast Service Tests
 */

import { BroadcastService } from './broadcast-service.js';
import { SessionRegistry } from '../session-registry.js';
import { JacquesWebSocketServer } from '../websocket.js';
import { createLogger } from '../logging/logger-factory.js';
import type { Session, SessionStartEvent } from '../types.js';

// Mock WebSocket server
class MockWebSocketServer {
  public sessionUpdates: Session[] = [];
  public sessionRemovals: string[] = [];
  public focusChanges: { sessionId: string | null; session: Session | null }[] = [];

  broadcastSessionUpdate(session: Session): void {
    this.sessionUpdates.push(session);
  }

  broadcastSessionRemoved(sessionId: string): void {
    this.sessionRemovals.push(sessionId);
  }

  broadcastFocusChange(sessionId: string | null, session: Session | null): void {
    this.focusChanges.push({ sessionId, session });
  }
}

describe('BroadcastService', () => {
  let broadcastService: BroadcastService;
  let registry: SessionRegistry;
  let mockWsServer: MockWebSocketServer;

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });
    mockWsServer = new MockWebSocketServer();
    broadcastService = new BroadcastService({
      wsServer: mockWsServer as unknown as JacquesWebSocketServer,
      registry,
      logger: createLogger({ silent: true }),
    });
  });

  describe('broadcastSessionWithFocus', () => {
    it('should broadcast session update and focus change', () => {
      // Register a session first
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: 'Test Session',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };
      const session = registry.registerSession(event);

      // Broadcast
      broadcastService.broadcastSessionWithFocus(session);

      // Verify both broadcasts occurred
      expect(mockWsServer.sessionUpdates).toHaveLength(1);
      expect(mockWsServer.sessionUpdates[0].session_id).toBe('test-session');
      expect(mockWsServer.focusChanges).toHaveLength(1);
      expect(mockWsServer.focusChanges[0].sessionId).toBe('test-session');
    });
  });

  describe('broadcastSessionRemovedWithFocus', () => {
    it('should broadcast session removal and focus change', () => {
      // Register and then remove
      const event: SessionStartEvent = {
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
      registry.registerSession(event);

      // Broadcast removal
      broadcastService.broadcastSessionRemovedWithFocus('test-session');

      // Verify
      expect(mockWsServer.sessionRemovals).toHaveLength(1);
      expect(mockWsServer.sessionRemovals[0]).toBe('test-session');
      expect(mockWsServer.focusChanges).toHaveLength(1);
    });
  });

  describe('broadcastSessionUpdate', () => {
    it('should broadcast only session update without focus change', () => {
      const event: SessionStartEvent = {
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
      const session = registry.registerSession(event);

      // Broadcast only session update
      broadcastService.broadcastSessionUpdate(session);

      expect(mockWsServer.sessionUpdates).toHaveLength(1);
      expect(mockWsServer.focusChanges).toHaveLength(0);
    });
  });

  describe('broadcastFocusChange', () => {
    it('should broadcast only focus change', () => {
      const event: SessionStartEvent = {
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
      registry.registerSession(event);

      // Broadcast only focus
      broadcastService.broadcastFocusChange();

      expect(mockWsServer.sessionUpdates).toHaveLength(0);
      expect(mockWsServer.focusChanges).toHaveLength(1);
      expect(mockWsServer.focusChanges[0].sessionId).toBe('test-session');
    });

    it('should handle null focus when no sessions', () => {
      broadcastService.broadcastFocusChange();

      expect(mockWsServer.focusChanges).toHaveLength(1);
      expect(mockWsServer.focusChanges[0].sessionId).toBeNull();
      expect(mockWsServer.focusChanges[0].session).toBeNull();
    });
  });
});
