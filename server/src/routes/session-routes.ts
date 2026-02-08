/**
 * Session API routes
 *
 * GET  /api/sessions                              — List all sessions
 * GET  /api/sessions/by-project                   — List sessions grouped by project
 * GET  /api/sessions/stats                        — Get session index statistics
 * POST /api/sessions/rebuild                      — Force rebuild session index (SSE)
 * POST /api/sessions/launch                       — Launch new terminal session
 * GET  /api/sessions/:id                          — Get session by ID
 * GET  /api/sessions/:id/badges                   — Get badge data for session
 * GET  /api/sessions/:id/subagents/:agentId       — Get subagent JSONL entries
 * GET  /api/sessions/:id/web-searches             — Get web search entries
 * GET  /api/sessions/:id/tasks                    — Get deduplicated tasks
 * GET  /api/sessions/:id/plans/:messageIndex      — Get plan content by message index
 */

import { promises as fsPromises } from 'fs';
import { basename, join } from 'path';
import type { RouteContext } from './types.js';
import { sendJson, parseBody, createSSEWriter } from './http-utils.js';
import type { CacheSessionEntry } from '@jacques/core';
import {
  getSessionIndex,
  buildSessionIndex,
  getSessionEntry,
  getSessionsByProject,
  getCacheIndexStats,
  parseJSONL,
  getEntryStatistics,
  listSubagentFiles,
  findSessionById,
  decodeProjectPath,
  detectModeAndPlans,
  extractTaskSignals,
} from '@jacques/core';

export async function sessionRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res } = ctx;

  if (!url.startsWith('/api/sessions')) return false;

  // Route: GET /api/sessions
  if (method === 'GET' && url === '/api/sessions') {
    try {
      const index = await getSessionIndex();
      sendJson(res, 200, {
        sessions: index.sessions,
        lastScanned: index.lastScanned,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to list sessions' });
    }
    return true;
  }

  // Route: GET /api/sessions/by-project
  if (method === 'GET' && url === '/api/sessions/by-project') {
    try {
      const byProject = await getSessionsByProject();
      const result: Record<string, CacheSessionEntry[]> = {};
      byProject.forEach((sessions, project) => {
        result[project] = sessions;
      });
      sendJson(res, 200, { projects: result });
    } catch {
      sendJson(res, 500, { error: 'Failed to list sessions by project' });
    }
    return true;
  }

  // Route: GET /api/sessions/stats
  if (method === 'GET' && url === '/api/sessions/stats') {
    try {
      const stats = await getCacheIndexStats();
      const sizeFormatted = stats.totalSizeBytes < 1024 * 1024
        ? `${(stats.totalSizeBytes / 1024).toFixed(1)} KB`
        : `${(stats.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

      sendJson(res, 200, {
        ...stats,
        sizeFormatted,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get session stats' });
    }
    return true;
  }

  // Route: POST /api/sessions/rebuild (SSE streaming)
  if (method === 'POST' && url === '/api/sessions/rebuild') {
    const sse = createSSEWriter(res);

    try {
      const index = await buildSessionIndex({
        onProgress: (progress) => {
          sse.send('progress', progress);
        },
      });

      sse.send('complete', {
        totalSessions: index.sessions.length,
        lastScanned: index.lastScanned,
      });
      sse.end();
    } catch (error) {
      sse.send('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      sse.end();
    }
    return true;
  }

  // Route: POST /api/sessions/launch
  if (method === 'POST' && url === '/api/sessions/launch') {
    const body = await parseBody<{ cwd?: string; preferredTerminal?: string; dangerouslySkipPermissions?: boolean }>(req);

    if (!body || !body.cwd) {
      sendJson(res, 400, { error: 'Missing cwd field' });
      return true;
    }

    const { cwd, preferredTerminal, dangerouslySkipPermissions } = body;

    try {
      const { launchTerminalSession } = await import('../terminal-launcher.js');
      const result = await launchTerminalSession({
        cwd,
        preferredTerminal,
        dangerouslySkipPermissions,
      });
      sendJson(res, result.success ? 200 : 500, result);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to launch terminal session' });
    }
    return true;
  }

  // Route: GET /api/sessions/:id/badges
  const badgesMatch = url.match(/^\/api\/sessions\/([^/]+)\/badges$/);
  if (method === 'GET' && badgesMatch) {
    const sessionId = badgesMatch[1];
    return handleBadges(ctx, sessionId);
  }

  // Route: GET /api/sessions/:id/subagents/:agentId
  const subagentMatch = url.match(/^\/api\/sessions\/([^/]+)\/subagents\/([^/]+)$/);
  if (method === 'GET' && subagentMatch) {
    const sessionId = subagentMatch[1];
    const agentId = subagentMatch[2];
    return handleSubagentDetail(ctx, sessionId, agentId);
  }

  // Route: GET /api/sessions/:id/web-searches
  const webSearchMatch = url.match(/^\/api\/sessions\/([^/]+)\/web-searches$/);
  if (method === 'GET' && webSearchMatch) {
    const sessionId = webSearchMatch[1];
    return handleWebSearches(ctx, sessionId);
  }

  // Route: GET /api/sessions/:id/tasks
  const tasksMatch = url.match(/^\/api\/sessions\/([^/]+)\/tasks$/);
  if (method === 'GET' && tasksMatch) {
    const sessionId = tasksMatch[1];
    return handleTasks(ctx, sessionId);
  }

  // Route: GET /api/sessions/:id/plans/:messageIndex
  const plansMatch = url.match(/^\/api\/sessions\/([^/]+)\/plans\/(\d+)$/);
  if (method === 'GET' && plansMatch) {
    const sessionId = plansMatch[1];
    const messageIndex = parseInt(plansMatch[2], 10);
    return handlePlanByMessageIndex(ctx, sessionId, messageIndex);
  }

  // Route: GET /api/sessions/:id (must be after all sub-routes)
  const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
  if (method === 'GET' && sessionMatch) {
    const id = sessionMatch[1];
    // Exclude known sub-paths that are matched as exact routes
    if (id === 'by-project' || id === 'stats' || id === 'rebuild' || id === 'launch') {
      return false;
    }
    return handleGetSession(ctx, id);
  }

  return false;
}

/**
 * Resolve a session's JSONL path from index or direct lookup
 */
async function resolveSession(sessionId: string): Promise<{ entry: CacheSessionEntry | null; jsonlPath: string } | null> {
  const entry = await getSessionEntry(sessionId);
  if (entry) {
    return { entry, jsonlPath: entry.jsonlPath };
  }

  const sessionFile = await findSessionById(sessionId);
  if (!sessionFile) return null;

  return { entry: null, jsonlPath: sessionFile.filePath };
}

async function handleGetSession(ctx: RouteContext, id: string): Promise<boolean> {
  const { res } = ctx;

  try {
    const resolved = await resolveSession(id);
    if (!resolved) {
      sendJson(res, 404, { error: 'Session not found' });
      return true;
    }

    let { entry: sessionEntry } = resolved;
    const { jsonlPath } = resolved;

    if (!sessionEntry) {
      // Create a minimal session entry for sessions not yet indexed
      const sessionFile = (await findSessionById(id))!;
      const pathParts = sessionFile.filePath.split('/');
      const projectsIdx = pathParts.indexOf('projects');
      const encodedPath = projectsIdx >= 0 ? pathParts[projectsIdx + 1] : '';
      const projectPath = await decodeProjectPath(encodedPath);
      const projectSlug = basename(projectPath);

      sessionEntry = {
        id,
        jsonlPath: sessionFile.filePath,
        projectPath,
        projectSlug,
        title: 'New session',
        startedAt: sessionFile.modifiedAt.toISOString(),
        endedAt: sessionFile.modifiedAt.toISOString(),
        messageCount: 0,
        toolCallCount: 0,
        hasSubagents: false,
        fileSizeBytes: sessionFile.sizeBytes,
        modifiedAt: sessionFile.modifiedAt.toISOString(),
      };
    }

    const entries = await parseJSONL(jsonlPath);

    if (entries.length === 0) {
      sendJson(res, 200, {
        metadata: sessionEntry,
        entries: [],
        statistics: {
          userMessageCount: 0,
          assistantMessageCount: 0,
          toolCallCount: 0,
          agentProgressCount: 0,
          hookProgressCount: 0,
          systemEntryCount: 0,
          summaryCount: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalOutputTokensEstimated: 0,
          totalTokens: 0,
        },
        subagents: [],
        awaitingFirstResponse: true,
      });
      return true;
    }

    const statistics = getEntryStatistics(entries);

    let userVisibleSubagents: Array<{ filePath: string; agentId: string }> = [];
    if (sessionEntry.hasSubagents) {
      const allSubagentFiles = await listSubagentFiles(sessionEntry.jsonlPath);
      userVisibleSubagents = allSubagentFiles.filter(f =>
        !f.agentId.startsWith('aprompt_suggestion-') &&
        !f.agentId.startsWith('acompact-')
      );
    }

    // Overlay deduplicated planRefs from catalog manifest if available
    try {
      const catalogManifestPath = join(sessionEntry.projectPath, '.jacques', 'sessions', `${id}.json`);
      const catalogContent = await fsPromises.readFile(catalogManifestPath, 'utf-8');
      const catalogManifest = JSON.parse(catalogContent);
      if (catalogManifest.planRefs) {
        sessionEntry = { ...sessionEntry, planRefs: catalogManifest.planRefs };
      }
    } catch {
      // No catalog manifest available
    }

    sendJson(res, 200, {
      metadata: sessionEntry,
      entries,
      statistics: {
        ...statistics,
        totalTokens: statistics.totalInputTokens + statistics.totalOutputTokens,
      },
      subagents: userVisibleSubagents.map(f => ({
        id: f.agentId,
        sessionId: id,
      })),
    });
  } catch {
    sendJson(res, 500, { error: 'Failed to get session' });
  }
  return true;
}

async function handleBadges(ctx: RouteContext, sessionId: string): Promise<boolean> {
  const { res } = ctx;

  try {
    const resolved = await resolveSession(sessionId);
    if (!resolved) {
      sendJson(res, 404, { error: 'Session not found' });
      return true;
    }

    const sessionEntry = resolved.entry;
    const entries = await parseJSONL(resolved.jsonlPath);

    if (entries.length === 0) {
      sendJson(res, 200, {
        planCount: 0,
        agentCount: 0,
        agentTypes: { explore: 0, plan: 0, general: 0 },
        fileCount: 0,
        mcpCount: 0,
        webSearchCount: 0,
        mode: null,
        hadAutoCompact: false,
        awaitingFirstResponse: true,
      });
      return true;
    }

    const statistics = getEntryStatistics(entries);
    const { mode, planRefs } = detectModeAndPlans(entries);

    const agentTypes = { explore: 0, plan: 0, general: 0 };
    const seenAgentIds = new Set<string>();

    for (const entry of entries) {
      if (entry.type === 'agent_progress' && entry.content.agentId) {
        if (seenAgentIds.has(entry.content.agentId)) continue;
        seenAgentIds.add(entry.content.agentId);

        const agentType = entry.content.agentType?.toLowerCase() || '';
        if (agentType === 'explore') {
          agentTypes.explore++;
        } else if (agentType === 'plan') {
          agentTypes.plan++;
        } else if (agentType) {
          agentTypes.general++;
        }
      }
    }

    const filesModified = new Set<string>();
    for (const entry of entries) {
      if (entry.type === 'tool_call') {
        const toolName = entry.content.toolName;
        const input = entry.content.toolInput as { file_path?: string } | undefined;
        if ((toolName === 'Write' || toolName === 'Edit') && input?.file_path) {
          filesModified.add(input.file_path);
        }
      }
    }

    let agentCount = 0;
    if (sessionEntry?.hasSubagents && sessionEntry?.subagentIds) {
      agentCount = sessionEntry.subagentIds.length;
    }

    sendJson(res, 200, {
      planCount: planRefs.length || sessionEntry?.planCount || 0,
      agentCount,
      agentTypes,
      fileCount: filesModified.size,
      mcpCount: statistics.mcpCalls,
      webSearchCount: statistics.webSearches,
      mode,
      hadAutoCompact: sessionEntry?.hadAutoCompact || false,
    });
  } catch {
    sendJson(res, 500, { error: 'Failed to get session badges' });
  }
  return true;
}

async function handleSubagentDetail(ctx: RouteContext, sessionId: string, agentId: string): Promise<boolean> {
  const { res } = ctx;

  try {
    const resolved = await resolveSession(sessionId);
    if (!resolved) {
      sendJson(res, 404, { error: 'Session not found' });
      return true;
    }

    const subagentFiles = await listSubagentFiles(resolved.jsonlPath);
    const subagentFile = subagentFiles.find(f => f.agentId === agentId);

    if (!subagentFile) {
      sendJson(res, 404, { error: 'Subagent not found' });
      return true;
    }

    const entries = await parseJSONL(subagentFile.filePath);
    const statistics = getEntryStatistics(entries);

    const firstUserEntry = entries.find(e => e.type === 'user_message');
    const prompt = firstUserEntry?.content.text || 'Unknown task';

    const firstAssistant = entries.find(
      e => e.type === 'assistant_message' || e.type === 'tool_call'
    );
    const model = firstAssistant?.content.model;

    // Use LAST turn's input tokens for context window size
    const totalInput = statistics.lastInputTokens + statistics.lastCacheRead;
    const totalOutput = statistics.totalOutputTokensEstimated;

    sendJson(res, 200, {
      id: agentId,
      sessionId,
      prompt,
      model,
      entries,
      statistics: {
        messageCount: statistics.userMessages + statistics.assistantMessages,
        toolCallCount: statistics.toolCalls,
        tokens: {
          totalInput,
          totalOutput,
          freshInput: statistics.lastInputTokens > 0 ? statistics.lastInputTokens : undefined,
          cacheCreation: statistics.lastCacheCreation > 0 ? statistics.lastCacheCreation : undefined,
          cacheRead: statistics.lastCacheRead > 0 ? statistics.lastCacheRead : undefined,
        },
        durationMs: statistics.totalDurationMs > 0 ? statistics.totalDurationMs : undefined,
      },
    });
  } catch {
    sendJson(res, 500, { error: 'Failed to get subagent' });
  }
  return true;
}

async function handleWebSearches(ctx: RouteContext, sessionId: string): Promise<boolean> {
  const { res } = ctx;

  try {
    let sessionEntry = await getSessionEntry(sessionId);

    if (!sessionEntry) {
      const sessionFile = await findSessionById(sessionId);
      if (!sessionFile) {
        sendJson(res, 404, { error: 'Session not found' });
        return true;
      }
      sendJson(res, 200, { searches: [] });
      return true;
    }

    const entries = await parseJSONL(sessionEntry.jsonlPath);
    const searches: Array<{
      query: string;
      resultCount: number;
      urls: Array<{ title: string; url: string }>;
      response: string;
      timestamp: string;
    }> = [];

    const seenQueries = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'web_search' && entry.content.searchType === 'results' && entry.content.searchQuery) {
        if (seenQueries.has(entry.content.searchQuery)) continue;
        seenQueries.add(entry.content.searchQuery);

        let response = '';
        for (let j = i + 1; j < entries.length; j++) {
          const next = entries[j];
          if (next.type === 'assistant_message' && next.content.text) {
            if (next.content.text.length >= 200) {
              response = next.content.text;
              break;
            }
          }
          if (next.type === 'user_message' || (next.type === 'web_search' && next.content.searchType === 'results')) {
            break;
          }
        }

        searches.push({
          query: entry.content.searchQuery,
          resultCount: entry.content.searchResultCount || 0,
          urls: entry.content.searchUrls || [],
          response,
          timestamp: entry.timestamp,
        });
      }
    }

    sendJson(res, 200, { searches });
  } catch {
    sendJson(res, 500, { error: 'Failed to get web searches' });
  }
  return true;
}

async function handleTasks(ctx: RouteContext, sessionId: string): Promise<boolean> {
  const { res } = ctx;

  try {
    const resolved = await resolveSession(sessionId);
    if (!resolved) {
      sendJson(res, 404, { error: 'Session not found' });
      return true;
    }

    const entries = await parseJSONL(resolved.jsonlPath);
    const signals = extractTaskSignals(entries, sessionId);

    const tasks = signals
      .filter(s => s.source === 'task_create' || s.source === 'task_update')
      .map(s => ({
        id: s.taskId || `auto-${signals.indexOf(s)}`,
        subject: s.text,
        status: s.status,
        timestamp: s.timestamp,
      }));

    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const total = tasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    sendJson(res, 200, {
      tasks,
      summary: {
        total,
        completed,
        inProgress,
        pending,
        percentage,
      },
    });
  } catch {
    sendJson(res, 500, { error: 'Failed to get session tasks' });
  }
  return true;
}

async function handlePlanByMessageIndex(ctx: RouteContext, sessionId: string, messageIndex: number): Promise<boolean> {
  const { res } = ctx;

  if (messageIndex < 0) {
    sendJson(res, 400, { error: 'Invalid session or message index' });
    return true;
  }

  try {
    let sessionEntry = await getSessionEntry(sessionId);

    if (!sessionEntry) {
      const sessionFile = await findSessionById(sessionId);
      if (!sessionFile) {
        sendJson(res, 404, { error: 'Session not found' });
        return true;
      }
      sendJson(res, 404, { error: 'No plans found in session' });
      return true;
    }

    // Overlay deduplicated planRefs from catalog manifest if available
    try {
      const catalogManifestPath = join(sessionEntry.projectPath, '.jacques', 'sessions', `${sessionId}.json`);
      const catalogContent = await fsPromises.readFile(catalogManifestPath, 'utf-8');
      const catalogManifest = JSON.parse(catalogContent);
      if (catalogManifest.planRefs) {
        sessionEntry = { ...sessionEntry, planRefs: catalogManifest.planRefs };
      }
    } catch {
      // No catalog manifest
    }

    if (!sessionEntry.planRefs || sessionEntry.planRefs.length === 0) {
      sendJson(res, 404, { error: 'No plans found in session' });
      return true;
    }

    const planRef = sessionEntry.planRefs.find(p => p.messageIndex === messageIndex);
    if (!planRef) {
      sendJson(res, 404, { error: 'Plan not found at message index' });
      return true;
    }

    if (planRef.source === 'embedded') {
      const entries = await parseJSONL(sessionEntry.jsonlPath);
      const entry = entries[messageIndex];

      if (!entry || entry.type !== 'user_message' || !entry.content.text) {
        sendJson(res, 404, { error: 'Plan content not found' });
        return true;
      }

      const text = entry.content.text;
      const { PLAN_TRIGGER_PATTERNS } = await import('@jacques/core');
      let planContent = text;
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          planContent = text.substring(match[0].length).trim();
          break;
        }
      }

      sendJson(res, 200, {
        title: planRef.title,
        source: planRef.source,
        messageIndex: planRef.messageIndex,
        content: planContent,
      });
    } else if (planRef.source === 'agent') {
      const agentId = (planRef as { agentId?: string }).agentId;
      if (!agentId) {
        sendJson(res, 404, { error: 'Agent ID not found for plan' });
        return true;
      }

      const subagentFiles = await listSubagentFiles(sessionEntry.jsonlPath);
      const subagentFile = subagentFiles.find(f => f.agentId === agentId);
      if (!subagentFile) {
        sendJson(res, 404, { error: 'Agent subagent file not found' });
        return true;
      }

      const subEntries = await parseJSONL(subagentFile.filePath);
      let planContent = '';
      for (let i = subEntries.length - 1; i >= 0; i--) {
        if (subEntries[i].type === 'assistant_message' && subEntries[i].content.text && subEntries[i].content.text!.length >= 100) {
          planContent = subEntries[i].content.text!;
          break;
        }
      }

      if (!planContent) {
        planContent = subEntries
          .filter(e => e.type === 'assistant_message' && e.content.text)
          .map(e => e.content.text!)
          .join('\n\n') || 'No plan content found in agent response.';
      }

      sendJson(res, 200, {
        title: planRef.title,
        source: planRef.source,
        messageIndex: planRef.messageIndex,
        agentId,
        content: planContent,
      });
    } else {
      // Written plans — read from file
      if (!planRef.filePath) {
        sendJson(res, 404, { error: 'Plan file path not found' });
        return true;
      }

      try {
        const content = await fsPromises.readFile(planRef.filePath, 'utf-8');
        sendJson(res, 200, {
          title: planRef.title,
          source: planRef.source,
          messageIndex: planRef.messageIndex,
          filePath: planRef.filePath,
          content,
        });
      } catch {
        sendJson(res, 404, { error: 'Plan file not found' });
      }
    }
  } catch {
    sendJson(res, 500, { error: 'Failed to get plan' });
  }
  return true;
}
