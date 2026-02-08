/**
 * Configuration API routes
 *
 * GET  /api/config/root-path — Get current root path configuration
 * POST /api/config/root-path — Set root path
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { RouteContext } from './types.js';
import { sendJson, parseBody } from './http-utils.js';
import { getJacquesConfig, saveJacquesConfig } from './config-store.js';

export async function configRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res, log } = ctx;

  // Route: GET /api/config/root-path
  if (method === 'GET' && url === '/api/config/root-path') {
    const config = getJacquesConfig();
    const envDir = process.env.CLAUDE_CONFIG_DIR;
    const defaultPath = envDir || join(homedir(), '.claude');
    const currentPath = config.rootPath || defaultPath;
    const defaultExists = existsSync(defaultPath);
    const currentExists = existsSync(currentPath);

    sendJson(res, 200, {
      path: currentPath,
      isDefault: !config.rootPath,
      exists: currentExists,
      defaultPath,
      defaultExists,
    });
    return true;
  }

  // Route: POST /api/config/root-path
  if (method === 'POST' && url === '/api/config/root-path') {
    const body = await parseBody<{ path: string }>(req);

    if (!body || typeof body.path !== 'string') {
      sendJson(res, 400, { error: 'Missing path field' });
      return true;
    }

    // Validate path exists
    if (!existsSync(body.path)) {
      sendJson(res, 400, { error: 'Path does not exist' });
      return true;
    }

    const config = getJacquesConfig();
    config.rootPath = body.path;

    if (saveJacquesConfig(config)) {
      log(`[HTTP API] Root path set to: ${body.path}`);
      sendJson(res, 200, { success: true, path: body.path });
    } else {
      sendJson(res, 500, { error: 'Failed to save configuration' });
    }
    return true;
  }

  return false;
}
