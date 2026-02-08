/**
 * HTTP API Server — Thin Orchestrator
 *
 * Creates an HTTP server and chains domain-specific route handlers.
 * Each handler returns true if it handled the request, false to pass.
 * Runs on port 4243 by default.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { statSync } from 'fs';
import { join } from 'path';
import type { NotificationService } from './services/notification-service.js';
import type { RouteContext, RouteHandler } from './routes/types.js';
import { sendJson, handleCors } from './routes/http-utils.js';
import { isGuiAvailable, getGuiDistPath } from './routes/static-routes.js';
import {
  usageRoutes,
  configRoutes,
  notificationRoutes,
  claudeRoutes,
  sourceRoutes,
  archiveRoutes,
  tileRoutes,
  syncRoutes,
  sessionRoutes,
  projectRoutes,
  staticRoutes,
} from './routes/index.js';

export interface ApiLog {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  timestamp: number;
}

export interface HttpApiOptions {
  port?: number;
  silent?: boolean;
  onApiLog?: (log: ApiLog) => void;
  notificationService?: NotificationService;
}

export interface HttpApiServer {
  stop: () => Promise<void>;
}

const handlers: RouteHandler[] = [
  usageRoutes,
  sourceRoutes,
  configRoutes,
  sessionRoutes,
  projectRoutes,
  archiveRoutes,
  notificationRoutes,
  syncRoutes,
  claudeRoutes,
  tileRoutes,
  staticRoutes,
];

export async function createHttpApi(options: HttpApiOptions = {}): Promise<HttpApiServer> {
  const { port = 4243, silent = false, onApiLog, notificationService } = options;
  const log = silent ? (() => {}) as (...args: unknown[]) => void : console.log.bind(console);

  const guiAvailable = isGuiAvailable();
  const guiDistPath = getGuiDistPath();

  if (!guiAvailable && !silent) {
    log('[HTTP API] GUI not built. Run: npm run build:gui');
  } else if (guiAvailable && !silent) {
    const guiIndexPath = join(guiDistPath, 'index.html');
    const guiSrcApp = join(guiDistPath, '..', 'src', 'App.tsx');
    try {
      const distMtime = statSync(guiIndexPath).mtimeMs;
      const srcMtime = statSync(guiSrcApp).mtimeMs;
      if (srcMtime > distMtime) {
        log('[HTTP API] GUI build is stale. Run: npm run build:gui');
      }
    } catch { /* ignore - source file may not exist in production */ }
  }

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url || '/';
    const method = req.method || 'GET';
    const startTime = Date.now();

    // API request logging
    const logApiRequest = (status: number) => {
      if (onApiLog && rawUrl.startsWith('/api/')) {
        onApiLog({
          method,
          path: rawUrl.split('?')[0],
          status,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      }
    };

    const originalWriteHead = res.writeHead.bind(res);
    let responseStatus = 200;
    res.writeHead = (statusCode: number, ...args: unknown[]) => {
      responseStatus = statusCode;
      // @ts-expect-error - TypeScript doesn't handle rest args well here
      return originalWriteHead(statusCode, ...args);
    };
    res.on('finish', () => logApiRequest(responseStatus));

    // CORS preflight
    if (method === 'OPTIONS') {
      handleCors(res);
      return;
    }

    // Parse URL for route context
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);

    const ctx: RouteContext = {
      req,
      res,
      url: parsedUrl.pathname,
      rawUrl,
      method,
      query: parsedUrl.searchParams,
      notificationService,
      log,
    };

    // Chain handlers — first match wins
    for (const handler of handlers) {
      if (await handler(ctx)) return;
    }

    // 404 fallback
    if (rawUrl.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
    } else if (guiAvailable) {
      // SPA fallback for unknown GUI routes
      const { serveStaticFile } = await import('./routes/http-utils.js');
      const indexPath = join(guiDistPath, 'index.html');
      if (!serveStaticFile(res, indexPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    } else {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Jacques GUI</title></head>
          <body style="font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #fff;">
            <h1>Jacques GUI Not Built</h1>
            <p>Run <code style="background: #333; padding: 4px 8px; border-radius: 4px;">npm run build:gui</code> to build the GUI.</p>
            <p>Then restart <code style="background: #333; padding: 4px 8px; border-radius: 4px;">jacques</code>.</p>
          </body>
        </html>
      `);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log(`[HTTP API] Port ${port} is already in use`);
      }
      reject(err);
    });

    server.listen(port, () => {
      log(`[HTTP API] Listening on http://localhost:${port}`);
      if (guiAvailable) {
        log(`[HTTP API] GUI available at http://localhost:${port}`);
      }
      resolve({
        stop: () => new Promise<void>((resolveStop, rejectStop) => {
          server.close((err) => {
            if (err) {
              rejectStop(err);
            } else {
              log('[HTTP API] Stopped');
              resolveStop();
            }
          });
        }),
      });
    });
  });
}
