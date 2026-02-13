/**
 * Window Handler Tests
 *
 * Tests validation/error paths for WindowHandler methods.
 * Success paths require dynamic imports and ESM mocking of window-manager, so are not covered here.
 */

import { WindowHandler } from './window-handler.js';
import { SessionRegistry } from '../session-registry.js';
import { createLogger } from '../logging/logger-factory.js';
import type { TileStateManager } from '../window-manager/tile-state.js';
import type { DashboardRegistry } from '../window-manager/dashboard-registry.js';
import type { WebSocket } from 'ws';
import type {
  SessionStartEvent,
  TileWindowsRequest,
  MaximizeWindowRequest,
  PositionBrowserLayoutRequest,
  SmartTileAddRequest,
} from '../types.js';

// ---------- helpers ----------

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

class MockTileStateManager {
  getAnyTileState() { return null; }
  getTileState() { return null; }
  setTileState() {}
  removeSession() {}
  buildFromManualTile() {}
}

function parseResponse(sent: string[]) {
  expect(sent.length).toBeGreaterThanOrEqual(1);
  return JSON.parse(sent[sent.length - 1]);
}

function createStartEvent(overrides: Partial<SessionStartEvent> = {}): SessionStartEvent {
  return {
    event: 'session_start',
    timestamp: Date.now(),
    session_id: 'test-session',
    session_title: 'Test Session',
    transcript_path: '/path/to/transcript.jsonl',
    cwd: '/Users/test/project',
    project: 'project',
    terminal: null,
    terminal_key: 'TTY:/dev/ttys001',
    ...overrides,
  };
}

// ---------- tests ----------

describe('WindowHandler', () => {
  let handler: WindowHandler;
  let registry: SessionRegistry;
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });
    handler = new WindowHandler({
      registry,
      tileStateManager: new MockTileStateManager() as unknown as TileStateManager,
      dashboardRegistry: { getTerminalKey: () => null, register: () => {}, unregister: () => {} } as unknown as DashboardRegistry,
      logger: silentLogger,
    });
  });

  // ---- handleTileWindows ----

  describe('handleTileWindows', () => {
    it('should return error when no session IDs provided (empty array)', async () => {
      const { ws, sent } = createMockWs();

      await handler.handleTileWindows(ws as unknown as WebSocket, {
        type: 'tile_windows',
        session_ids: [],
      } as TileWindowsRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('tile_windows_result');
      expect(response.success).toBe(false);
      expect(response.positioned).toBe(0);
      expect(response.total).toBe(0);
      expect(response.errors).toContain('No session IDs provided');
    });

    it('should return error when sessions not found', async () => {
      const { ws, sent } = createMockWs();

      await handler.handleTileWindows(ws as unknown as WebSocket, {
        type: 'tile_windows',
        session_ids: ['nonexistent-1', 'nonexistent-2'],
      } as TileWindowsRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('tile_windows_result');
      expect(response.success).toBe(false);
      expect(response.positioned).toBe(0);
      expect(response.total).toBe(2);
      expect(response.errors).toEqual(
        expect.arrayContaining([
          'Session not found: nonexistent-1',
          'Session not found: nonexistent-2',
        ]),
      );
    });

    it('should return error when mix of found and not-found sessions all fail', async () => {
      // Register one session so it exists but the other does not
      registry.registerSession(createStartEvent({
        session_id: 'found-session',
        terminal_key: 'TTY:/dev/ttys002',
      }));

      const { ws, sent } = createMockWs();

      await handler.handleTileWindows(ws as unknown as WebSocket, {
        type: 'tile_windows',
        session_ids: ['nonexistent-1'],
      } as TileWindowsRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('tile_windows_result');
      expect(response.success).toBe(false);
      expect(response.errors).toEqual(
        expect.arrayContaining(['Session not found: nonexistent-1']),
      );
    });
  });

  // ---- handleMaximizeWindow ----

  describe('handleMaximizeWindow', () => {
    it('should return error when session not found', async () => {
      const { ws, sent } = createMockWs();

      await handler.handleMaximizeWindow(ws as unknown as WebSocket, {
        type: 'maximize_window',
        session_id: 'nonexistent-session',
      } as MaximizeWindowRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('maximize_window_result');
      expect(response.session_id).toBe('nonexistent-session');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Session not found: nonexistent-session');
    });
  });

  // ---- handlePositionBrowserLayout ----

  describe('handlePositionBrowserLayout', () => {
    it('should return error when no session IDs provided (empty array)', async () => {
      const { ws, sent } = createMockWs();

      await handler.handlePositionBrowserLayout(ws as unknown as WebSocket, {
        type: 'position_browser_layout',
        session_ids: [],
        layout: 'browser-terminal',
      } as PositionBrowserLayoutRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('position_browser_layout_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('No session IDs provided');
    });

    it('should return error when all sessions not found', async () => {
      const { ws, sent } = createMockWs();

      await handler.handlePositionBrowserLayout(ws as unknown as WebSocket, {
        type: 'position_browser_layout',
        session_ids: ['missing-1', 'missing-2'],
        layout: 'browser-two-terminals',
      } as PositionBrowserLayoutRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('position_browser_layout_result');
      expect(response.success).toBe(false);
      expect(response.error).toContain('Session not found: missing-1');
      expect(response.error).toContain('Session not found: missing-2');
    });
  });

  // ---- handleSmartTileAdd ----

  describe('handleSmartTileAdd', () => {
    it('should return error when both launch_cwd and new_session_id are missing', async () => {
      const { ws, sent } = createMockWs();

      await handler.handleSmartTileAdd(ws as unknown as WebSocket, {
        type: 'smart_tile_add',
      } as SmartTileAddRequest);

      const response = parseResponse(sent);
      expect(response.type).toBe('smart_tile_add_result');
      expect(response.success).toBe(false);
      expect(response.repositioned).toBe(0);
      expect(response.total_tiled).toBe(0);
      expect(response.used_free_space).toBe(false);
      expect(response.error).toBe('Missing launch_cwd or new_session_id');
    });
  });
});
