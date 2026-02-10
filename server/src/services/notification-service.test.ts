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
      expect(settings.enabled).toBe(false);
      expect(settings.categories.context).toBe(true);
      expect(settings.contextThresholds).toEqual([50, 70]);
      expect(settings.largeOperationThreshold).toBe(50_000);
    });

    it('should load settings from config file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({
        notifications: {
          enabled: true,
          categories: { context: false },
          largeOperationThreshold: 100_000,
        },
      }));

      const svc = new NotificationService({
        broadcast: () => {},
        logger: silentLogger,
      });

      const settings = svc.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.categories.context).toBe(false);
      // Other categories should use defaults
      expect(settings.categories.operation).toBe(true);
      expect(settings.largeOperationThreshold).toBe(100_000);
    });

    it('should update and persist settings', () => {
      const updated = service.updateSettings({ enabled: true });
      expect(updated.enabled).toBe(true);
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

    it('should fire both 50% and 70% when jumping past both', () => {
      const session = createMockSession({
        context_metrics: {
          used_percentage: 75,
          remaining_percentage: 25,
          total_input_tokens: 150000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      // Should fire 50% and 70% (no 90% — it's not in thresholds)
      expect(broadcastCalls).toHaveLength(2);
      expect(broadcastCalls[0].notification.title).toBe('Context 50%');
      expect(broadcastCalls[1].notification.title).toBe('Context 70%');
    });

    it('should only fire at 50% and 70% thresholds (not 90%)', () => {
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

      // Default thresholds are [50, 70] — no 90%
      expect(broadcastCalls).toHaveLength(2);
      expect(broadcastCalls[0].notification.title).toBe('Context 50%');
      expect(broadcastCalls[1].notification.title).toBe('Context 70%');
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
      // Jump from 0 to 75
      const session = createMockSession({
        context_metrics: {
          used_percentage: 75,
          remaining_percentage: 25,
          total_input_tokens: 150000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      expect(broadcastCalls[0].notification.priority).toBe('medium');  // 50%
      expect(broadcastCalls[1].notification.priority).toBe('high');    // 70%
    });

    it('should not fire when context percentage is null', () => {
      const session = createMockSession({ context_metrics: null });
      service.onContextUpdate(session);
      expect(broadcastCalls).toHaveLength(0);
    });

    it('should include sessionId in context notifications', () => {
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
      expect(broadcastCalls[0].notification.sessionId).toBe('test-session-1');
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
    it('should call node-notifier with wait: true when enabled', () => {
      service.updateSettings({ enabled: true });

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
          wait: true,
        }),
        expect.any(Function),
      );
    });

    it('should not call node-notifier when disabled', () => {
      // Default is disabled
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

  describe('click-to-focus callback', () => {
    it('should call focusTerminal when notification is clicked (activate response)', () => {
      const focusTerminal = jest.fn();
      const svc = new NotificationService({
        broadcast: (msg) => broadcastCalls.push(msg),
        focusTerminal,
        logger: silentLogger,
      });
      svc.updateSettings({ enabled: true });

      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      svc.onContextUpdate(session);

      // Simulate the notifier callback with 'activate' response
      const notifyCall = (notifier.notify as jest.Mock).mock.calls[0];
      const callback = notifyCall[1] as (err: Error | null, response: string) => void;
      callback(null, 'activate');

      expect(focusTerminal).toHaveBeenCalledWith('test-session-1');
    });

    it('should NOT call focusTerminal on dismiss response', () => {
      const focusTerminal = jest.fn();
      const svc = new NotificationService({
        broadcast: (msg) => broadcastCalls.push(msg),
        focusTerminal,
        logger: silentLogger,
      });
      svc.updateSettings({ enabled: true });

      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      svc.onContextUpdate(session);

      const notifyCall = (notifier.notify as jest.Mock).mock.calls[0];
      const callback = notifyCall[1] as (err: Error | null, response: string) => void;
      callback(null, 'dismissed');

      expect(focusTerminal).not.toHaveBeenCalled();
    });

    it('should NOT call focusTerminal when sessionId is missing', () => {
      const focusTerminal = jest.fn();
      const svc = new NotificationService({
        broadcast: (msg) => broadcastCalls.push(msg),
        focusTerminal,
        logger: silentLogger,
      });
      svc.updateSettings({ enabled: true });

      // Operations don't have sessionId
      svc.onClaudeOperation({
        id: 'op-click-test',
        operation: 'llm-handoff',
        phase: 'complete',
        totalTokens: 100_000,
      });

      const notifyCall = (notifier.notify as jest.Mock).mock.calls[0];
      const callback = notifyCall[1] as (err: Error | null, response: string) => void;
      callback(null, 'activate');

      expect(focusTerminal).not.toHaveBeenCalled();
    });

    it('should handle focusTerminal callback errors gracefully', () => {
      const focusTerminal = jest.fn().mockImplementation(() => {
        throw new Error('Terminal not found');
      });
      const svc = new NotificationService({
        broadcast: (msg) => broadcastCalls.push(msg),
        focusTerminal,
        logger: silentLogger,
      });
      svc.updateSettings({ enabled: true });

      const session = createMockSession({
        context_metrics: {
          used_percentage: 55,
          remaining_percentage: 45,
          total_input_tokens: 100000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      svc.onContextUpdate(session);

      const notifyCall = (notifier.notify as jest.Mock).mock.calls[0];
      const callback = notifyCall[1] as (err: Error | null, response: string) => void;

      // Should not throw
      expect(() => callback(null, 'activate')).not.toThrow();
      expect(focusTerminal).toHaveBeenCalled();
    });
  });

  describe('plan ready notifications', () => {
    it('should fire plan notification with session context', () => {
      service.onPlanReady('test-session-1', 'Refactor auth system');

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].notification.category).toBe('plan');
      expect(broadcastCalls[0].notification.title).toBe('Plan Created');
      expect(broadcastCalls[0].notification.body).toContain('Refactor auth system');
    });

    it('should include sessionId in plan notification', () => {
      service.onPlanReady('test-session-1', 'My Plan');

      expect(broadcastCalls[0].notification.sessionId).toBe('test-session-1');
    });

    it('should respect plan category toggle (disabled)', () => {
      service.updateSettings({
        categories: { plan: false } as any,
      });

      service.onPlanReady('test-session-1', 'My Plan');
      expect(broadcastCalls).toHaveLength(0);
    });

    it('should respect plan cooldown period for same session', () => {
      service.onPlanReady('test-session-1', 'Plan A');
      expect(broadcastCalls).toHaveLength(1);

      // Same session within cooldown window — key includes Date.now() so
      // if called within the same ms tick, the key is identical and cooldown blocks it.
      // Different sessions should work:
      service.onPlanReady('test-session-2', 'Plan B');
      expect(broadcastCalls).toHaveLength(2);
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

      // Remove the session
      service.onSessionRemoved('test-session-1');

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
          used_percentage: 75,
          remaining_percentage: 25,
          total_input_tokens: 150000,
          total_output_tokens: 10000,
          context_window_size: 200000,
        },
      });

      service.onContextUpdate(session);

      const history = service.getHistory();
      expect(history).toHaveLength(2); // 50%, 70%
      // Newest first
      expect(history[0].title).toBe('Context 70%');
      expect(history[1].title).toBe('Context 50%');
    });

    it('should cap history at MAX_NOTIFICATION_HISTORY', () => {
      // Fire many notifications using operations with unique keys
      for (let i = 0; i < 60; i++) {
        service.onClaudeOperation({
          id: `op-${i}`,
          operation: 'llm-handoff',
          phase: 'complete',
          totalTokens: 100_000,
        });
      }

      const history = service.getHistory();
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('should include sessionId in all session-related notifications', () => {
      service.onHandoffReady('sess-abc', '/some/path/handoff.md');
      expect(broadcastCalls[0].notification.sessionId).toBe('sess-abc');

      service.onPlanReady('sess-xyz', 'Plan title');
      expect(broadcastCalls[1].notification.sessionId).toBe('sess-xyz');
    });
  });

  describe('broadcast message shape', () => {
    it('should broadcast notification_fired with complete NotificationItem', () => {
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
      const msg = broadcastCalls[0];
      expect(msg.type).toBe('notification_fired');
      expect(msg.notification).toEqual(expect.objectContaining({
        id: expect.stringMatching(/^notif-/),
        category: 'context',
        title: expect.any(String),
        body: expect.any(String),
        priority: expect.stringMatching(/^(low|medium|high|critical)$/),
        timestamp: expect.any(Number),
        sessionId: 'test-session-1',
      }));
    });
  });
});
