/**
 * Worktree Handler Tests
 *
 * Tests validation/error paths for WorktreeHandler.
 * Success paths require ESM mocking of git commands and are not covered here.
 */

import { WorktreeHandler } from './worktree-handler.js';
import { SessionRegistry } from '../session-registry.js';
import { createLogger } from '../logging/logger-factory.js';
import type { TileStateManager } from '../window-manager/tile-state.js';
import type { WebSocket } from 'ws';
import type {
  ListWorktreesRequest,
  RemoveWorktreeRequest,
  CreateWorktreeRequest,
} from '../types.js';

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

// Mock TileStateManager
class MockTileStateManager {
  getAnyTileState() { return null; }
  getTileState() { return null; }
  setTileState() {}
  removeSession() {}
  buildFromManualTile() {}
}

describe('WorktreeHandler', () => {
  let handler: WorktreeHandler;
  let registry: SessionRegistry;
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    registry = new SessionRegistry({ silent: true });
    const mockTileStateManager = new MockTileStateManager();

    handler = new WorktreeHandler({
      registry,
      tileStateManager: mockTileStateManager as unknown as TileStateManager,
      logger: silentLogger,
    });
  });

  describe('handleListWorktrees', () => {
    it('should return error when repo_root is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'list_worktrees',
        repo_root: '',
      } as ListWorktreesRequest;

      await handler.handleListWorktrees(ws as unknown as WebSocket, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('list_worktrees_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing repo_root');
    });
  });

  describe('handleRemoveWorktree', () => {
    it('should return error when repo_root is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'remove_worktree',
        repo_root: '',
        worktree_path: '/some/path',
      } as RemoveWorktreeRequest;

      await handler.handleRemoveWorktree(ws as unknown as WebSocket, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('remove_worktree_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing repo_root or worktree_path');
    });

    it('should return error when worktree_path is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'remove_worktree',
        repo_root: '/some/repo',
        worktree_path: '',
      } as RemoveWorktreeRequest;

      await handler.handleRemoveWorktree(ws as unknown as WebSocket, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('remove_worktree_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing repo_root or worktree_path');
    });
  });

  describe('handleCreateWorktree', () => {
    it('should return error when repo_root is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'create_worktree',
        repo_root: '',
        name: 'feature-branch',
      } as CreateWorktreeRequest;

      await handler.handleCreateWorktree(ws as unknown as WebSocket, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('create_worktree_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing repo_root or name');
    });

    it('should return error when name is missing', async () => {
      const { ws, sent } = createMockWs();

      const request = {
        type: 'create_worktree',
        repo_root: '/some/repo',
        name: '',
      } as CreateWorktreeRequest;

      await handler.handleCreateWorktree(ws as unknown as WebSocket, request);

      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]);
      expect(response.type).toBe('create_worktree_result');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Missing repo_root or name');
    });
  });
});
