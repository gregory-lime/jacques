/**
 * Notification routes tests
 */

import { notificationRoutes } from '../notification-routes.js';
import { createMockContext, getSentJson } from './test-helpers.js';

// Mock notification service
function createMockNotificationService() {
  const settings = { enabled: true, threshold: 80 };
  const history = [{ id: '1', message: 'Test notification' }];

  return {
    getSettings: () => settings,
    updateSettings: (update: Record<string, unknown>) => ({ ...settings, ...update }),
    getHistory: () => history,
  };
}

describe('notificationRoutes', () => {
  describe('GET /api/notifications/settings', () => {
    it('returns notification settings', async () => {
      const notificationService = createMockNotificationService();
      const { ctx, res } = createMockContext({
        url: '/api/notifications/settings',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notificationService: notificationService as any,
      });

      const handled = await notificationRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect(data).toEqual({ enabled: true, threshold: 80 });
    });

    it('returns 503 when service unavailable', async () => {
      const { ctx, res } = createMockContext({ url: '/api/notifications/settings' });

      const handled = await notificationRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(503);
      expect(data).toEqual({ error: 'Notification service not available' });
    });
  });

  describe('PUT /api/notifications/settings', () => {
    it('updates notification settings', async () => {
      const notificationService = createMockNotificationService();
      const { ctx, res } = createMockContext({
        method: 'PUT',
        url: '/api/notifications/settings',
        body: { threshold: 90 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notificationService: notificationService as any,
      });

      const handled = await notificationRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as Record<string, unknown>).threshold).toBe(90);
    });

    it('returns 400 for missing body', async () => {
      const notificationService = createMockNotificationService();
      const { ctx, res } = createMockContext({
        method: 'PUT',
        url: '/api/notifications/settings',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notificationService: notificationService as any,
      });

      const handled = await notificationRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });
  });

  describe('GET /api/notifications', () => {
    it('returns notification history', async () => {
      const notificationService = createMockNotificationService();
      const { ctx, res } = createMockContext({
        url: '/api/notifications',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notificationService: notificationService as any,
      });

      const handled = await notificationRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { notifications: unknown[] }).notifications).toHaveLength(1);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await notificationRoutes(ctx);
    expect(handled).toBe(false);
  });
});
