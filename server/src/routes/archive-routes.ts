/**
 * Archive API routes
 *
 * GET  /api/archive/stats                          — Get archive statistics
 * GET  /api/archive/conversations                  — List all conversation manifests
 * GET  /api/archive/conversations/by-project       — List conversations grouped by project
 * GET  /api/archive/conversations/:id              — Get a single conversation with content
 * POST /api/archive/search                         — Search conversations
 * GET  /api/archive/subagents/:agentId             — Get subagent conversation
 * GET  /api/archive/sessions/:sessionId/subagents  — List subagents for a session
 * POST /api/archive/initialize                     — Initialize archive (SSE streaming)
 */

import { promises as fsPromises } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { RouteContext } from './types.js';
import { sendJson, parseBody, createSSEWriter } from './http-utils.js';
import {
  getArchiveStats,
  listAllManifests,
  listManifestsByProject,
  readManifest,
  searchConversations,
  readSubagent,
  listSubagentsForSession,
  createSubagentReference,
  initializeArchive,
} from '@jacques-ai/core';
import type { ConversationManifest, SearchInput } from '@jacques-ai/core';

export async function archiveRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res } = ctx;

  if (!url.startsWith('/api/archive/')) return false;

  // Route: GET /api/archive/stats
  if (method === 'GET' && url === '/api/archive/stats') {
    try {
      const stats = await getArchiveStats();
      sendJson(res, 200, stats);
    } catch {
      sendJson(res, 500, { error: 'Failed to get archive stats' });
    }
    return true;
  }

  // Route: GET /api/archive/conversations
  if (method === 'GET' && url === '/api/archive/conversations') {
    try {
      const manifests = await listAllManifests();
      sendJson(res, 200, { manifests });
    } catch {
      sendJson(res, 500, { error: 'Failed to list conversations' });
    }
    return true;
  }

  // Route: GET /api/archive/conversations/by-project
  if (method === 'GET' && url === '/api/archive/conversations/by-project') {
    try {
      const byProject = await listManifestsByProject();
      const result: Record<string, ConversationManifest[]> = {};
      byProject.forEach((manifests, project) => {
        result[project] = manifests;
      });
      sendJson(res, 200, { projects: result });
    } catch {
      sendJson(res, 500, { error: 'Failed to list conversations by project' });
    }
    return true;
  }

  // Route: GET /api/archive/conversations/:id
  if (method === 'GET' && url.startsWith('/api/archive/conversations/') && !url.includes('by-project')) {
    const id = url.replace('/api/archive/conversations/', '');
    if (!id || id.includes('/')) {
      sendJson(res, 400, { error: 'Invalid conversation ID' });
      return true;
    }

    try {
      const manifest = await readManifest(id);
      if (!manifest) {
        sendJson(res, 404, { error: 'Conversation not found' });
        return true;
      }

      const archivePath = join(
        homedir(),
        '.jacques',
        'archive',
        'conversations',
        manifest.projectId || manifest.projectSlug
      );

      try {
        const files = await fsPromises.readdir(archivePath);
        const convFile = files.find(f => f.includes(id.substring(0, 4)) && f.endsWith('.json'));

        if (!convFile) {
          sendJson(res, 404, { error: 'Conversation content not found' });
          return true;
        }

        const content = await fsPromises.readFile(join(archivePath, convFile), 'utf-8');
        const conversation = JSON.parse(content);

        let subagentRefs: unknown[] | undefined;
        if (manifest.subagents && manifest.subagents.ids && manifest.subagents.ids.length > 0) {
          subagentRefs = [];
          for (let i = 0; i < manifest.subagents.ids.length; i++) {
            const agentId = manifest.subagents.ids[i];
            const subagent = await readSubagent(agentId);
            if (subagent) {
              const ref = createSubagentReference(subagent, i);
              subagentRefs.push(ref);
            }
          }
        }

        sendJson(res, 200, { manifest, conversation, subagentRefs });
      } catch {
        sendJson(res, 404, { error: 'Conversation content not found' });
      }
    } catch {
      sendJson(res, 500, { error: 'Failed to get conversation' });
    }
    return true;
  }

  // Route: POST /api/archive/search
  if (method === 'POST' && url === '/api/archive/search') {
    const body = await parseBody<SearchInput>(req);
    if (!body || !body.query) {
      sendJson(res, 400, { error: 'Missing query' });
      return true;
    }

    try {
      const results = await searchConversations(body);
      sendJson(res, 200, results);
    } catch {
      sendJson(res, 500, { error: 'Search failed' });
    }
    return true;
  }

  // Route: GET /api/archive/subagents/:agentId
  if (method === 'GET' && url.match(/^\/api\/archive\/subagents\/[^/]+$/)) {
    const agentId = url.replace('/api/archive/subagents/', '');
    if (!agentId) {
      sendJson(res, 400, { error: 'Invalid agent ID' });
      return true;
    }

    try {
      const subagent = await readSubagent(agentId);
      if (!subagent) {
        sendJson(res, 404, { error: 'Subagent not found' });
        return true;
      }
      sendJson(res, 200, { subagent });
    } catch {
      sendJson(res, 500, { error: 'Failed to get subagent' });
    }
    return true;
  }

  // Route: GET /api/archive/sessions/:sessionId/subagents
  if (method === 'GET' && url.match(/^\/api\/archive\/sessions\/[^/]+\/subagents$/)) {
    const match = url.match(/^\/api\/archive\/sessions\/([^/]+)\/subagents$/);
    const sessionId = match?.[1];
    if (!sessionId) {
      sendJson(res, 400, { error: 'Invalid session ID' });
      return true;
    }

    try {
      const subagents = await listSubagentsForSession(sessionId);
      sendJson(res, 200, { subagents });
    } catch {
      sendJson(res, 500, { error: 'Failed to list subagents' });
    }
    return true;
  }

  // Route: POST /api/archive/initialize (SSE streaming)
  if (method === 'POST' && url.startsWith('/api/archive/initialize')) {
    const force = ctx.query.get('force') === 'true';

    const sse = createSSEWriter(res);

    try {
      const result = await initializeArchive({
        saveToLocal: false,
        force,
        onProgress: (progress) => {
          sse.send('progress', progress);
        },
      });
      sse.send('complete', result);
      sse.end();
    } catch (error) {
      sse.send('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      sse.end();
    }
    return true;
  }

  return false;
}
