/**
 * Sync and catalog extraction API routes
 *
 * POST /api/sync             — Run catalog extraction + session index rebuild (SSE)
 * POST /api/catalog/extract  — Trigger bulk catalog extraction (SSE)
 */

import type { RouteContext } from './types.js';
import { createSSEWriter } from './http-utils.js';
import {
  buildSessionIndex,
  extractAllCatalogs,
  extractProjectCatalog,
} from '@jacques-ai/core';

export async function syncRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, res } = ctx;

  // Route: POST /api/sync
  if (method === 'POST' && url === '/api/sync') {
    const force = ctx.query.get('force') === 'true';

    const sse = createSSEWriter(res);

    try {
      // Phase 1: Catalog extraction
      const extractResult = await extractAllCatalogs({
        force,
        onProgress: (progress) => {
          sse.send('progress', { ...progress, phase: 'extracting' });
        },
      });

      // Phase 2: Session index rebuild
      const index = await buildSessionIndex({
        onProgress: (progress) => {
          sse.send('progress', { ...progress, phase: 'indexing' });
        },
      });

      sse.send('complete', {
        totalSessions: extractResult.totalSessions,
        extracted: extractResult.extracted,
        skipped: extractResult.skipped,
        errors: extractResult.errors,
        indexed: index.sessions.length,
      });
      sse.end();
    } catch (error) {
      sse.send('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      sse.end();
    }
    return true;
  }

  // Route: POST /api/catalog/extract
  if (method === 'POST' && url.startsWith('/api/catalog/extract')) {
    const force = ctx.query.get('force') === 'true';
    const projectParam = ctx.query.get('project');

    const sse = createSSEWriter(res);

    try {
      if (projectParam) {
        const result = await extractProjectCatalog(projectParam, {
          force,
          onProgress: (progress) => {
            sse.send('progress', progress);
          },
        });
        sse.send('complete', result);
      } else {
        const result = await extractAllCatalogs({
          force,
          onProgress: (progress) => {
            sse.send('progress', progress);
          },
        });
        sse.send('complete', result);
      }
      sse.end();
    } catch (error) {
      sse.send('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      sse.end();
    }
    return true;
  }

  return false;
}
