/**
 * Claude operations API routes
 *
 * GET /api/claude/operations            — List recent Claude operations
 * GET /api/claude/operations/:id/debug  — Get debug data for a specific operation
 */

import type { RouteContext } from './types.js';
import { sendJson } from './http-utils.js';
import { ClaudeOperationLogger } from '@jacques/core';

export async function claudeRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, res } = ctx;

  if (!url.startsWith('/api/claude/')) return false;

  // Route: GET /api/claude/operations
  if (method === 'GET' && url === '/api/claude/operations') {
    try {
      const operations = await ClaudeOperationLogger.getRecentOperations(50);
      sendJson(res, 200, { operations });
    } catch {
      sendJson(res, 500, { error: 'Failed to get operations' });
    }
    return true;
  }

  // Route: GET /api/claude/operations/:id/debug
  if (method === 'GET' && url.startsWith('/api/claude/operations/') && url.endsWith('/debug')) {
    const match = url.match(/\/api\/claude\/operations\/([^/]+)\/debug/);
    const operationId = match?.[1];

    if (!operationId) {
      sendJson(res, 400, { error: 'Invalid operation ID' });
      return true;
    }

    try {
      const debugData = await ClaudeOperationLogger.readDebugData(operationId);
      if (!debugData) {
        sendJson(res, 404, { error: 'Debug data not found' });
        return true;
      }
      sendJson(res, 200, debugData);
    } catch {
      sendJson(res, 500, { error: 'Failed to get debug data' });
    }
    return true;
  }

  return false;
}
