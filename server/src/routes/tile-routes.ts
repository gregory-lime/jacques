/**
 * Window tiling API routes
 *
 * GET  /api/tile/displays   — Get available displays for tiling
 * POST /api/tile/sessions   — Tile sessions (requires terminal keys)
 * POST /api/tile/with-keys  — Tile windows using terminal keys directly
 */

import type { RouteContext } from './types.js';
import { sendJson, parseBody } from './http-utils.js';
import { getSessionEntry } from '@jacques-ai/core';

export async function tileRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res } = ctx;

  if (!url.startsWith('/api/tile/')) return false;

  // Route: GET /api/tile/displays
  if (method === 'GET' && url === '/api/tile/displays') {
    try {
      const { createWindowManager, isWindowManagementSupported, getPlatformNotes } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        sendJson(res, 501, { error: 'Window management not supported on this platform' });
        return true;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();
      const platformNote = getPlatformNotes();

      sendJson(res, 200, {
        displays,
        platform: manager.getPlatform(),
        supported: manager.isSupported(),
        note: platformNote,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get displays' });
    }
    return true;
  }

  // Route: POST /api/tile/sessions
  if (method === 'POST' && url === '/api/tile/sessions') {
    const body = await parseBody<{
      sessionIds: string[];
      layout?: 'side-by-side' | 'thirds' | '2x2';
      displayId?: string;
    }>(req);

    if (!body || !body.sessionIds || !Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
      sendJson(res, 400, { error: 'Missing or invalid sessionIds array' });
      return true;
    }

    try {
      const { isWindowManagementSupported } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        sendJson(res, 501, { error: 'Window management not supported on this platform' });
        return true;
      }

      // Get session terminal keys from the session index
      const missingKeys: string[] = [];

      for (const sessionId of body.sessionIds) {
        const entry = await getSessionEntry(sessionId);
        // The cache doesn't have terminal_key, so we can only tile live sessions
        if (entry) {
          missingKeys.push(sessionId);
        } else {
          missingKeys.push(sessionId);
        }
      }

      sendJson(res, 400, {
        error: 'This endpoint requires terminal_keys. Use the WebSocket tile command or /api/tile/with-keys instead.',
        sessionIds: body.sessionIds,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to tile sessions' });
    }
    return true;
  }

  // Route: POST /api/tile/with-keys
  if (method === 'POST' && url === '/api/tile/with-keys') {
    const body = await parseBody<{
      terminalKeys: string[];
      layout?: 'side-by-side' | 'thirds' | '2x2';
      displayId?: string;
    }>(req);

    if (!body || !body.terminalKeys || !Array.isArray(body.terminalKeys) || body.terminalKeys.length === 0) {
      sendJson(res, 400, { error: 'Missing or invalid terminalKeys array' });
      return true;
    }

    try {
      const { createWindowManager, isWindowManagementSupported, suggestLayout } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        sendJson(res, 501, { error: 'Window management not supported on this platform' });
        return true;
      }

      const manager = createWindowManager();
      const layout = body.layout || suggestLayout(body.terminalKeys.length);

      let targetDisplay;
      if (body.displayId) {
        const displays = await manager.getDisplays();
        targetDisplay = displays.find(d => d.id === body.displayId);
      }

      const result = await manager.tileWindows(body.terminalKeys, layout, targetDisplay);

      sendJson(res, result.success ? 200 : 207, {
        success: result.success,
        positioned: result.positioned,
        total: result.total,
        layout,
        errors: result.errors,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to tile windows' });
    }
    return true;
  }

  return false;
}
