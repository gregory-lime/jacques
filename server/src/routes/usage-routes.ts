/**
 * Usage API routes
 *
 * GET /api/usage — Fetch Anthropic account usage limits
 */

import type { RouteContext } from './types.js';
import { sendJson } from './http-utils.js';
import { fetchUsageLimits } from '../usage-limits.js';

export async function usageRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, res } = ctx;

  // Route: GET /api/usage
  if (method === 'GET' && url === '/api/usage') {
    const limits = await fetchUsageLimits();
    sendJson(res, 200, limits ?? null);
    return true;
  }

  return false;
}
