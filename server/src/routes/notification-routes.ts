/**
 * Notification API routes
 *
 * GET  /api/notifications/settings — Get notification settings
 * PUT  /api/notifications/settings — Update notification settings
 * GET  /api/notifications           — List notification history
 */

import type { RouteContext } from './types.js';
import { sendJson, parseBody } from './http-utils.js';

export async function notificationRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res, notificationService } = ctx;

  if (!url.startsWith('/api/notifications')) return false;

  // Route: GET /api/notifications/settings
  if (method === 'GET' && url === '/api/notifications/settings') {
    if (!notificationService) {
      sendJson(res, 503, { error: 'Notification service not available' });
      return true;
    }
    sendJson(res, 200, notificationService.getSettings());
    return true;
  }

  // Route: PUT /api/notifications/settings
  if (method === 'PUT' && url === '/api/notifications/settings') {
    if (!notificationService) {
      sendJson(res, 503, { error: 'Notification service not available' });
      return true;
    }
    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) {
      sendJson(res, 400, { error: 'Invalid request body' });
      return true;
    }
    const updated = notificationService.updateSettings(body);
    sendJson(res, 200, updated);
    return true;
  }

  // Route: POST /api/notifications/test — Broadcast a test notification (dev only)
  if (method === 'POST' && url === '/api/notifications/test') {
    if (!notificationService) {
      sendJson(res, 503, { error: 'Notification service not available' });
      return true;
    }
    const body = await parseBody<{ category?: string; title?: string; body?: string; priority?: string; sessionId?: string }>(req);
    const category = (body?.category ?? 'context') as import('@jacques-ai/core/notifications').NotificationCategory;
    const title = body?.title ?? 'Test Notification';
    const notifBody = body?.body ?? 'This is a test notification from Jacques';
    const priority = (body?.priority ?? 'medium') as import('@jacques-ai/core/notifications').NotificationPriority;
    const sessionId = body?.sessionId ?? 'test-session';

    notificationService.fireTestNotification(category, title, notifBody, priority, sessionId);

    sendJson(res, 200, { ok: true, category, title });
    return true;
  }

  // Route: GET /api/notifications
  if (method === 'GET' && url === '/api/notifications') {
    if (!notificationService) {
      sendJson(res, 503, { error: 'Notification service not available' });
      return true;
    }
    sendJson(res, 200, { notifications: notificationService.getHistory() });
    return true;
  }

  return false;
}
