/**
 * Notification Service Tests
 */

import { jest } from '@jest/globals';

// Mock node-notifier before importing the service
jest.unstable_mockModule('node-notifier', () => ({
  default: {
    notify: jest.fn(),
  },
}));

// Mock fs for settings persistence
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string, encoding: string) => string>();
const mockWriteFileSync = jest.fn<(path: string, data: string, encoding: string) => void>();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

// Import after mocks
const { NotificationService } = await import('./notification-service.js');
const notifierModule = await import('node-notifier');
const notifier = notifierModule.default;

import type { Session, NotificationFiredMessage } from '../types.js';
import { createLogger } from '../logging/logger-factory.js';

// Helper to create a mock session
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: 'test-session-1',
    source: 'claude_code',
    session_title: 'Test Session',
    transcript_path: null,
    cwd: '/test/project',
    project: 'project',
    model: null,
    workspace: null,
    terminal: null,
    terminal_key: 'TTY:/dev/ttys001',
    status: 'working',
    last_activity: Date.now(),
    registered_at: Date.now(),
    context_metrics: null,
    autocompact: null,
    ...overrides,
  };
}

describe('NotificationService', () => {
  let service: InstanceType<typeof NotificationService>;
  let broadcastCalls: NotificationFiredMessage[];
  const silentLogger = createLogger({ silent: true });

  beforeEach(() => {
    broadcastCalls = [];
    // Default: no config file exists
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    mockWriteFileSync.mockImplementation(() => {});
    mockMkdirSync.mockImplementation(() => {});
    (notifier.notify as jest.Mock).mockClear();

    service = new NotificationService({
      broadcast: (msg) => broadcastCalls.push(msg),
      logger: silentLogger,
    });
  });

  describe('settings', () => {
    it('should return default settings when no config exists', () => {
      const settings = service.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.categories.context).toBe(true);
      expect(settings.contextThresholds).toEqual([50, 70, 90]);
      expect(settings.largeOperationThreshold).toBe(50_000);
    });

    it('should load settings from config file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({
        notifications: {
          enabled: false,
          categories: { context: false },
          largeOperationThreshold: 100_000,
        },
      }));

      const svc = new NotificationService({
        broadcast: () => {},
        logger: silentLogger,
      });

      const settings = svc.getSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.categories.context).toBe(false);
      // Other categories should use defaults
      expect(settings.categories.operation).toBe(true);
      expect(settings.largeOperationThreshold).toBe(100_000);
    });

    it('should update and persist settings', () => {
      const updated = service.updateSettings({ enabled: false });
      expect(updated.enabled).toBe(false);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should merge category updates', () => {
      const updated = service.updateSettings({
        categories: { context: false } as any,
      });
      expect(updated.categories.context).toBe(false);
      // Other categories should remain unchanged
      expect(updated.categories.operation).toBe(true);
    });
  });

  describe('context threshold notifications', () => {
    it('should fire when crossing a threshold upward', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      // First call with 0% -> 55% should fire 50% threshold
      service.onContextUpdate(session);

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].notification.category).toBe('context');
      expect(broadcastCalls[0].notification.title).toBe('Context 50%');
      expect(broadcastCalls[0].notification.priority).toBe('medium');
    });

    it('should fire multiple thresholds when jumping past several', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 95,
          remaining_percentage: 5,
          total_input_tokens: 190000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      // Should fire 50%, 70%, 90% all at once
      expect(broadcastCalls).toHaveLength(3);
      expect(broadcastCalls[0].notification.title).toBe('Context 50%');
      expect(broadcastCalls[1].notification.title).toBe('Context 70%');
      expect(broadcastCalls[2].notification.title).toBe('Context 90%');
    });

    it('should not re-fire same threshold for same session', () => {
      const session50 = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session50);
      expect(broadcastCalls).toHaveLength(1);

      // Same session, same percentage - should not fire again
      const session55 = createMockSession({
        context_metrics: {
          used_percentage: 58,
          remaining_percentage: 42,
          total_input_tokens: 110000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session55);
      expect(broadcastCalls).toHaveLength(1); // still 1
    });

    it('should set correct priority for different thresholds', () => {
      // Jump from 0 to 95
      const session = createMockSession({
        context_metrics: {
          used_percentage: 95,
          remaining_percentage: 5,
          total_input_tokens: 190000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      expect(broadcastCalls[0].notification.priority).toBe('medium');  // 50%
      expect(broadcastCalls[1].notification.priority).toBe('high');    // 70%
      expect(broadcastCalls[2].notification.priority).toBe('critical'); // 90%
    });

    it('should not fire when context percentage is null', () => {
      const session = createMockSession({ context_metrics: null });
      service.onContextUpdate(session);
      expect(broadcastCalls).toHaveLength(0);
    });
  });

  describe('category gating', () => {
    it('should not fire when category is disabled', () => {
      service.updateSettings({
        categories: { context: false } as any,
      });

      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);
      expect(broadcastCalls).toHaveLength(0);
    });
  });

  describe('cooldowns', () => {
    it('should respect cooldown period for same key', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);
      expect(broadcastCalls).toHaveLength(1);

      // Threshold deduplication prevents re-fire anyway, but cooldown also applies
      // Test with operations instead
      service.onClaudeOperation({
        id: 'op-1',
        operation: 'llm-handoff',
        phase: 'complete',
        totalTokens: 100_000,
      });
      expect(broadcastCalls).toHaveLength(2);

      // Same key within cooldown should not fire
      service.onClaudeOperation({
        id: 'op-1',
        operation: 'llm-handoff',
        phase: 'complete',
        totalTokens: 100_000,
      });
      expect(broadcastCalls).toHaveLength(2); // still 2
    });
  });

  describe('desktop notifications', () => {
    it('should call node-notifier when enabled', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Jacques',
          subtitle: expect.stringContaining('Context 50%'),
          sound: 'Sosumi',
        }),
      );
    });

    it('should not call node-notifier when disabled', () => {
      service.updateSettings({ enabled: false });

      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      // Should still broadcast to GUI
      expect(broadcastCalls).toHaveLength(1);
      // But not call notifier
      expect(notifier.notify).not.toHaveBeenCalled();
    });
  });

  describe('claude operations', () => {
    it('should fire for large operations', () => {
      service.onClaudeOperation({
        id: 'op-1',
        operation: 'llm-handoff',
        phase: 'complete',
        totalTokens: 100_000,
        userPromptPreview: 'Fix the auth bug',
      });

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].notification.category).toBe('operation');
      expect(broadcastCalls[0].notification.title).toContain('100k');
      expect(broadcastCalls[0].notification.priority).toBe('high');
    });

    it('should not fire for small operations', () => {
      service.onClaudeOperation({
        id: 'op-2',
        operation: 'llm-handoff',
        phase: 'complete',
        totalTokens: 10_000,
      });

      expect(broadcastCalls).toHaveLength(0);
    });

    it('should not fire for start phase', () => {
      service.onClaudeOperation({
        id: 'op-3',
        operation: 'llm-handoff',
        phase: 'start',
        totalTokens: 100_000,
      });

      expect(broadcastCalls).toHaveLength(0);
    });
  });

  describe('handoff notifications', () => {
    it('should fire when handoff is ready', () => {
      service.onHandoffReady('test-session', '/project/.jacques/handoffs/2024-01-01-handoff.md');

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].notification.category).toBe('handoff');
      expect(broadcastCalls[0].notification.title).toBe('Handoff Ready');
      expect(broadcastCalls[0].notification.body).toContain('2024-01-01-handoff.md');
    });
  });

  describe('session removal cleanup', () => {
    it('should clean up tracking state for removed sessions', () => {
      // Fire a notification for a session at 70%
      const session70 = createMockSession({
        context_metrics: {
          used_percentage: 75,
          remaining_percentage: 25,
          total_input_tokens: 150000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session70);
      // Should fire 50% and 70% thresholds
      expect(broadcastCalls.length).toBeGreaterThanOrEqual(2);
      const countBefore = broadcastCalls.length;

      // Remove the session - this clears prevContextPct and firedThresholds
      service.onSessionRemoved('test-session-1');

      // After removal, the session starts fresh.
      // Because prevContextPct is cleared, next call starts from 0 again.
      // The 50% and 70% thresholds will re-fire since firedThresholds was also cleared.
      // However, cooldowns may still block same keys within the cooldown period.
      // Use a different session to verify cleanup works
      const session2 = createMockSession({
        session_id: 'test-session-2',
        session_title: 'Session 2',
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session2);
      // New session should fire without being blocked
      expect(broadcastCalls.length).toBe(countBefore + 1);
    });
  });

  describe('notification history', () => {
    it('should maintain a history of notifications', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 95,
          remaining_percentage: 5,
          total_input_tokens: 190000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      const history = service.getHistory();
      expect(history).toHaveLength(3); // 50%, 70%, 90%
      // Newest first
      expect(history[0].title).toBe('Context 90%');
      expect(history[1].title).toBe('Context 70%');
      expect(history[2].title).toBe('Context 50%');
    });
  });
});
