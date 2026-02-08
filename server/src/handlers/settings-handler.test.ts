/**
 * Settings Handler Tests
 */

import { SettingsHandler } from './settings-handler.js';
import { SessionRegistry } from '../session-registry.js';
import { createLogger } from '../logging/logger-factory.js';
import type { JacquesWebSocketServer } from '../websocket.js';
import type { NotificationService } from '../services/notification-service.js';
import type { WebSocket } from 'ws';

// Mock WebSocket
function createMockWs() {
  const sent: string[] = [];
  return {
    ws: {
      readyState: 1,
      send: (data: string) => { sent.push(data); },
    },
    sent,
  };
}

// Mock NotificationService
class MockNotificationService {
  public lastSettings: any = null;
  updateSettings(settings: any) {
    this.lastSettings = settings;
    return { enabled: settings.enabled ?? true, ...settings };
  }
}

// Mock JacquesWebSocketServer
class MockWsServer {
  public broadcasts: any[] = [];
  public sessionUpdates: any[] = [];
  broadcastSessionUpdate(session: any) { this.sessionUpdates.push(session); }
  broadcast(msg: any) { this.broadcasts.push(msg); }
}

describe('SettingsHandler', () => {
  let handler: SettingsHandler;
  let registry: SessionRegistry;
  let mockWsServer: MockWsServer;
  let mockNotificationService: MockNotificationService;
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });
    mockWsServer = new MockWsServer();
    mockNotificationService = new MockNotificationService();

    handler = new SettingsHandler({
      registry,
      wsServer: mockWsServer as unknown as JacquesWebSocketServer,
      notificationService: mockNotificationService as unknown as NotificationService,
      logger: silentLogger,
    });
  });

  describe('handleUpdateNotificationSettings', () => {
    it('should update settings and send response back', () => {
      const { ws, sent } = createMockWs();

      handler.handleUpdateNotificationSettings(ws as unknown as WebSocket, {
        type: 'update_notification_settings',
        settings: { enabled: false },
      });

      // Verify notification service was called with the settings
      expect(mockNotificationService.lastSettings).toEqual({ enabled: false });

      // Verify response was sent back to the client
      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('notification_settings');
      expect(response.settings.enabled).toBe(false);
    });
  });

  describe('handleGetHandoffContext', () => {
    it('should return error when session not found', async () => {
      const { ws, sent } = createMockWs();

      await handler.handleGetHandoffContext(ws as unknown as WebSocket, {
        type: 'get_handoff_context',
        session_id: 'nonexistent-session',
      });

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('handoff_context_error');
      expect(response.session_id).toBe('nonexistent-session');
      expect(response.error).toContain('Session not found');
    });

    it('should return error when session has no transcript_path', async () => {
      const { ws, sent } = createMockWs();

      // Register a session without a transcript_path
      registry.registerSession({
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'test-session',
        session_title: 'Test',
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      });

      await handler.handleGetHandoffContext(ws as unknown as WebSocket, {
        type: 'get_handoff_context',
        session_id: 'test-session',
      });

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('handoff_context_error');
      expect(response.session_id).toBe('test-session');
      expect(response.error).toContain('no transcript path');
    });
  });
});
