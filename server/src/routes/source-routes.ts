/**
 * Source configuration API routes
 *
 * GET    /api/sources/status  — Get connection status for all sources
 * POST   /api/sources/google  — Configure Google Docs source
 * DELETE /api/sources/google  — Disconnect Google Docs
 * POST   /api/sources/notion  — Configure Notion source
 * DELETE /api/sources/notion  — Disconnect Notion
 */

import type { RouteContext } from './types.js';
import { sendJson, parseBody } from './http-utils.js';
import { getJacquesConfig, saveJacquesConfig } from './config-store.js';

export async function sourceRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res, log } = ctx;

  if (!url.startsWith('/api/sources/')) return false;

  // Route: GET /api/sources/status
  if (method === 'GET' && url === '/api/sources/status') {
    const config = getJacquesConfig();

    const status = {
      obsidian: {
        connected: config.sources.obsidian?.enabled === true &&
                   typeof config.sources.obsidian?.vaultPath === 'string' &&
                   config.sources.obsidian.vaultPath.length > 0,
        detail: config.sources.obsidian?.vaultPath,
      },
      googleDocs: {
        connected: config.sources.googleDocs?.enabled === true &&
                   typeof config.sources.googleDocs?.tokens?.access_token === 'string',
        detail: config.sources.googleDocs?.connected_email,
      },
      notion: {
        connected: config.sources.notion?.enabled === true &&
                   typeof config.sources.notion?.tokens?.access_token === 'string',
        detail: config.sources.notion?.workspace_name,
      },
    };

    sendJson(res, 200, status);
    return true;
  }

  // Route: POST /api/sources/google
  if (method === 'POST' && url === '/api/sources/google') {
    const body = await parseBody<{
      client_id: string;
      client_secret: string;
      tokens: {
        access_token: string;
        refresh_token?: string;
        expires_at?: number;
      };
      connected_email?: string;
    }>(req);

    if (!body || !body.client_id || !body.client_secret || !body.tokens?.access_token) {
      sendJson(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const config = getJacquesConfig();
    config.sources.googleDocs = {
      enabled: true,
      client_id: body.client_id,
      client_secret: body.client_secret,
      tokens: body.tokens,
      connected_email: body.connected_email,
      configured_at: new Date().toISOString(),
    };

    if (saveJacquesConfig(config)) {
      log('[HTTP API] Google Docs configured');
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 500, { error: 'Failed to save configuration' });
    }
    return true;
  }

  // Route: DELETE /api/sources/google
  if (method === 'DELETE' && url === '/api/sources/google') {
    const config = getJacquesConfig();
    config.sources.googleDocs = { enabled: false };

    if (saveJacquesConfig(config)) {
      log('[HTTP API] Google Docs disconnected');
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 500, { error: 'Failed to save configuration' });
    }
    return true;
  }

  // Route: POST /api/sources/notion
  if (method === 'POST' && url === '/api/sources/notion') {
    const body = await parseBody<{
      client_id: string;
      client_secret: string;
      tokens: {
        access_token: string;
      };
      workspace_id?: string;
      workspace_name?: string;
    }>(req);

    if (!body || !body.client_id || !body.client_secret || !body.tokens?.access_token) {
      sendJson(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const config = getJacquesConfig();
    config.sources.notion = {
      enabled: true,
      client_id: body.client_id,
      client_secret: body.client_secret,
      tokens: body.tokens,
      workspace_id: body.workspace_id,
      workspace_name: body.workspace_name,
      configured_at: new Date().toISOString(),
    };

    if (saveJacquesConfig(config)) {
      log('[HTTP API] Notion configured');
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 500, { error: 'Failed to save configuration' });
    }
    return true;
  }

  // Route: DELETE /api/sources/notion
  if (method === 'DELETE' && url === '/api/sources/notion') {
    const config = getJacquesConfig();
    config.sources.notion = { enabled: false };

    if (saveJacquesConfig(config)) {
      log('[HTTP API] Notion disconnected');
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 500, { error: 'Failed to save configuration' });
    }
    return true;
  }

  return false;
}
