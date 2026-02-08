/**
 * Handoff Watcher Tests
 *
 * Tests the HandoffWatcher using actual file system directories.
 * Creates temporary directories for testing that will exist.
 */

import { HandoffWatcher } from './handoff-watcher.js';
import type { ServerMessage, HandoffReadyMessage } from '../types.js';
import { createLogger } from '../logging/logger-factory.js';
import { mkdtempSync, rmdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('HandoffWatcher', () => {
  let watcher: HandoffWatcher;
  let broadcastedMessages: ServerMessage[];
  let mockBroadcast: (msg: ServerMessage) => void;
  let tempDirs: string[] = [];

  // Helper to create a temporary directory that actually exists
  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'jacques-test-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    broadcastedMessages = [];
    mockBroadcast = (msg) => broadcastedMessages.push(msg);
    watcher = new HandoffWatcher({
      handoffFilename: '.jacques-handoff.md',
      broadcast: mockBroadcast,
      logger: createLogger({ silent: true }),
    });
    tempDirs = [];
  });

  afterEach(() => {
    watcher.stopAll();
    // Clean up temp directories
    for (const dir of tempDirs) {
      try {
        rmdirSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('startWatching', () => {
    it('should track watched sessions by sessionId', () => {
      const dir1 = createTempDir();
      const dir2 = createTempDir();

      // Start watching two sessions in different projects
      watcher.startWatching('session-1', dir1);
      watcher.startWatching('session-2', dir2);

      expect(watcher.getWatcherCount()).toBe(2);
      expect(watcher.isWatching('session-1')).toBe(true);
      expect(watcher.isWatching('session-2')).toBe(true);
    });

    it('should not create duplicate watchers for the same session', () => {
      const dir = createTempDir();

      watcher.startWatching('session-1', dir);
      watcher.startWatching('session-1', dir);

      expect(watcher.getWatcherCount()).toBe(1);
    });

    it('should handle empty projectDir gracefully', () => {
      watcher.startWatching('session-1', '');

      expect(watcher.getWatcherCount()).toBe(0);
      expect(watcher.isWatching('session-1')).toBe(false);
    });

    it('should broadcast handoff_ready if file already exists', () => {
      const dir = createTempDir();
      const handoffPath = join(dir, '.jacques-handoff.md');
      writeFileSync(handoffPath, '# Test Handoff');

      watcher.startWatching('session-1', dir);

      // Should immediately broadcast since file exists
      expect(broadcastedMessages.length).toBe(1);
      const msg = broadcastedMessages[0] as HandoffReadyMessage;
      expect(msg.type).toBe('handoff_ready');
      expect(msg.session_id).toBe('session-1');
      expect(msg.path).toBe(handoffPath);

      unlinkSync(handoffPath);
    });
  });

  describe('stopWatching', () => {
    it('should stop watching a specific session', () => {
      const dir1 = createTempDir();
      const dir2 = createTempDir();

      watcher.startWatching('session-1', dir1);
      watcher.startWatching('session-2', dir2);

      expect(watcher.getWatcherCount()).toBe(2);

      watcher.stopWatching('session-1');

      expect(watcher.getWatcherCount()).toBe(1);
      expect(watcher.isWatching('session-1')).toBe(false);
      expect(watcher.isWatching('session-2')).toBe(true);
    });

    it('should handle stopping a non-existent session', () => {
      watcher.stopWatching('non-existent');
      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe('stopAll', () => {
    it('should stop all watchers', () => {
      const dir1 = createTempDir();
      const dir2 = createTempDir();
      const dir3 = createTempDir();

      watcher.startWatching('session-1', dir1);
      watcher.startWatching('session-2', dir2);
      watcher.startWatching('session-3', dir3);

      expect(watcher.getWatcherCount()).toBe(3);

      watcher.stopAll();

      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe('getWatchedSessionIds', () => {
    it('should return all watched session IDs', () => {
      const dir1 = createTempDir();
      const dir2 = createTempDir();

      watcher.startWatching('session-a', dir1);
      watcher.startWatching('session-b', dir2);

      const ids = watcher.getWatchedSessionIds();

      expect(ids).toContain('session-a');
      expect(ids).toContain('session-b');
      expect(ids.length).toBe(2);
    });
  });

  describe('bug fix: multiple sessions in same project', () => {
    it('should allow multiple sessions in the same project directory', () => {
      // This was the bug: using projectDir as key caused collision
      // when two sessions were in the same project
      const projectDir = createTempDir();

      watcher.startWatching('session-1', projectDir);
      watcher.startWatching('session-2', projectDir);

      // Both sessions should be tracked independently
      expect(watcher.isWatching('session-1')).toBe(true);
      expect(watcher.isWatching('session-2')).toBe(true);
      expect(watcher.getWatcherCount()).toBe(2);

      // Stopping one should not affect the other
      watcher.stopWatching('session-1');

      expect(watcher.isWatching('session-1')).toBe(false);
      expect(watcher.isWatching('session-2')).toBe(true);
      expect(watcher.getWatcherCount()).toBe(1);
    });
  });
});
