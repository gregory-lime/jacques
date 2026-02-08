/**
 * Session Handler Tests
 */

import { SessionHandler } from './session-handler.js';
import { SessionRegistry } from '../session-registry.js';
import { createLogger } from '../logging/logger-factory.js';
import type { FocusTerminalRequest, LaunchSessionRequest } from '../types.js';

function createMockWs() {
  const sent: string[] = [];
  return {
    ws: {
      readyState: 1, // WebSocket.OPEN
      send: (data: string) => { sent.push(data); },
    },
    sent,
  };
}

describe('SessionHandler', () => {
  let handler: SessionHandler;
  let registry: SessionRegistry;
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });

    handler = new SessionHandler({
      registry,
      logger: silentLogger,
    });
  });

  describe('handleFocusTerminal', () => {
    it('should return error when session not found', async () => {
      const { ws, sent } = createMockWs();

      const request: FocusTerminalRequest = {
        type: 'focus_terminal',
        session_id: 'nonexistent-session',
      };

      await handler.handleFocusTerminal(ws as any, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('focus_terminal_result');
      expect(response.session_id).toBe('nonexistent-session');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Session not found: nonexistent-session');
    });

    it('should return error when session has no terminal_key', async () => {
      const { ws, sent } = createMockWs();

      // Register a session, then clear its terminal_key to simulate no terminal
      registry.registerSession({
        event: 'session_start',
        timestamp: Date.now(),
        session_id: 'no-terminal-session',
        session_title: null,
        transcript_path: null,
        cwd: '/test/project',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      });
      // Clear terminal_key to test the "no terminal key" path
      const session = registry.getSession('no-terminal-session')!;
      (session as any).terminal_key = '';

      const request: FocusTerminalRequest = {
        type: 'focus_terminal',
        session_id: 'no-terminal-session',
      };

      await handler.handleFocusTerminal(ws as any, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('focus_terminal_result');
      expect(response.session_id).toBe('no-terminal-session');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Session has no terminal key');
    });
  });

  describe('handleLaunchSession', () => {
    it('should return error when cwd is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'launch_session',
        cwd: '',
      } as LaunchSessionRequest;

      await handler.handleLaunchSession(ws as any, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('launch_session_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing cwd');
    });
  });
});
