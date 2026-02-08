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
