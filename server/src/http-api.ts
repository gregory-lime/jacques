/**
 * HTTP API Server
 *
 * Provides REST endpoints for GUI to manage source configurations.
 * Also serves the built GUI static files.
 * Runs on port 4243 by default.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { homedir } from 'os';
import { join, extname, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import type { NotificationService } from './services/notification-service.js';
import {
  getArchiveStats,
  listAllManifests,
  listManifestsByProject,
  readManifest,
  searchConversations,
  ClaudeOperationLogger,
  readSubagent,
  listSubagentsForSession,
  createSubagentReference,
  // New cache module imports
  getSessionIndex,
  buildSessionIndex,
  getSessionEntry,
  getSessionsByProject,
  discoverProjects,
  hideProject,
  unhideProject,
  getCacheIndexStats,
  parseJSONL,
  getEntryStatistics,
  listSubagentFiles,
  // Direct file lookup for cache bypass
  findSessionById,
  // Project path decoding
  decodeProjectPath,
  // Mode detection from JSONL entries
  detectModeAndPlans,
} from '@jacques/core';
import type {
  ConversationManifest,
  SearchInput,
  CacheSessionEntry,
  CacheSessionIndex,
  ParsedEntry,
} from '@jacques/core';
import {
  initializeArchive,
  getProjectPlans,
  readLocalPlanContent,
  readProjectIndex,
  writeProjectIndex,
  extractAllCatalogs,
  extractProjectCatalog,
  addContextToIndex,
  removeContextFromIndex,
  extractTaskSignals,
  listHandoffs,
  getHandoffContent,
  findDuplicatePlan,
} from '@jacques/core';
import type { PlanEntry } from '@jacques/core';
import type { ContextFile } from '@jacques/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JACQUES_DIR = join(homedir(), '.jacques');
const JACQUES_CONFIG_PATH = join(JACQUES_DIR, 'config.json');

// GUI dist folder location (relative to server dist)
const GUI_DIST_PATH = join(__dirname, '..', '..', 'gui', 'dist');

/**
 * API log entry for broadcasting
 */
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
  /** Callback for broadcasting API logs to WebSocket clients */
  onApiLog?: (log: ApiLog) => void;
  /** Notification service for managing desktop notifications */
  notificationService?: NotificationService;
}

export interface HttpApiServer {
  stop: () => Promise<void>;
}

interface JacquesConfig {
  version: string;
  rootPath?: string;
  sources: {
    obsidian?: {
      enabled?: boolean;
      vaultPath?: string;
      configuredAt?: string;
    };
    googleDocs?: {
      enabled?: boolean;
      client_id?: string;
      client_secret?: string;
      tokens?: {
        access_token: string;
        refresh_token?: string;
        expires_at?: number;
      };
      connected_email?: string;
      configured_at?: string;
    };
    notion?: {
      enabled?: boolean;
      client_id?: string;
      client_secret?: string;
      tokens?: {
        access_token: string;
      };
      workspace_id?: string;
      workspace_name?: string;
      configured_at?: string;
    };
  };
}

function getDefaultConfig(): JacquesConfig {
  return {
    version: '1.0.0',
    sources: {
      obsidian: { enabled: false },
      googleDocs: { enabled: false },
      notion: { enabled: false },
    },
  };
}

function getJacquesConfig(): JacquesConfig {
  try {
    if (!existsSync(JACQUES_CONFIG_PATH)) {
      return getDefaultConfig();
    }
    const content = readFileSync(JACQUES_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      version: parsed.version || '1.0.0',
      sources: {
        obsidian: parsed.sources?.obsidian || { enabled: false },
        googleDocs: parsed.sources?.googleDocs || { enabled: false },
        notion: parsed.sources?.notion || { enabled: false },
      },
    };
  } catch {
    return getDefaultConfig();
  }
}

function saveJacquesConfig(config: JacquesConfig): boolean {
  try {
    if (!existsSync(JACQUES_DIR)) {
      mkdirSync(JACQUES_DIR, { recursive: true });
    }
    writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse request body as JSON
 */
async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle CORS preflight
 */
function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Serve static file
 */
function serveStaticFile(res: ServerResponse, filePath: string): boolean {
  try {
    if (!existsSync(filePath)) {
      return false;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    const content = readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    // HTML must revalidate so new builds load immediately
    // Hashed assets (in /assets/) can be cached indefinitely
    const isHtml = filePath.endsWith('.html');
    const cacheControl = isHtml ? 'no-cache' : 'public, max-age=31536000, immutable';
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': content.length,
      'Cache-Control': cacheControl,
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create and start the HTTP API server
 */
export async function createHttpApi(options: HttpApiOptions = {}): Promise<HttpApiServer> {
  const { port = 4243, silent = false, onApiLog, notificationService } = options;
  const log = silent ? () => {} : console.log.bind(console);

  // Check if GUI is built and up-to-date
  const guiIndexPath = join(GUI_DIST_PATH, 'index.html');
  const guiAvailable = existsSync(guiIndexPath);
  if (!guiAvailable && !silent) {
    log('[HTTP API] GUI not built. Run: npm run build:gui');
  } else if (guiAvailable && !silent) {
    const guiSrcApp = join(GUI_DIST_PATH, '..', 'src', 'App.tsx');
    try {
      const distMtime = statSync(guiIndexPath).mtimeMs;
      const srcMtime = statSync(guiSrcApp).mtimeMs;
      if (srcMtime > distMtime) {
        log('[HTTP API] GUI build is stale. Run: npm run build:gui');
      }
    } catch { /* ignore - source file may not exist in production */ }
  }

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const startTime = Date.now();

    // Helper to log API requests (only for /api/ routes)
    const logApiRequest = (status: number) => {
      if (onApiLog && url.startsWith('/api/')) {
        onApiLog({
          method,
          path: url.split('?')[0], // Remove query string
          status,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      }
    };

    // Wrap response methods to capture status
    const originalWriteHead = res.writeHead.bind(res);
    let responseStatus = 200;
    res.writeHead = (statusCode: number, ...args: unknown[]) => {
      responseStatus = statusCode;
      // @ts-expect-error - TypeScript doesn't handle rest args well here
      return originalWriteHead(statusCode, ...args);
    };

    // Log when response finishes
    res.on('finish', () => {
      logApiRequest(responseStatus);
    });

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      handleCors(res);
      return;
    }

    // === API Routes ===

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
      return;
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
        return;
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
      return;
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
      return;
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
        return;
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
      return;
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
      return;
    }

    // === Root Path Configuration API ===

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
      return;
    }

    // Route: POST /api/config/root-path
    if (method === 'POST' && url === '/api/config/root-path') {
      const body = await parseBody<{ path: string }>(req);

      if (!body || typeof body.path !== 'string') {
        sendJson(res, 400, { error: 'Missing path field' });
        return;
      }

      // Validate path exists
      if (!existsSync(body.path)) {
        sendJson(res, 400, { error: 'Path does not exist' });
        return;
      }

      const config = getJacquesConfig();
      config.rootPath = body.path;

      if (saveJacquesConfig(config)) {
        log(`[HTTP API] Root path set to: ${body.path}`);
        sendJson(res, 200, { success: true, path: body.path });
      } else {
        sendJson(res, 500, { error: 'Failed to save configuration' });
      }
      return;
    }

    // === Sessions API Routes (Hybrid Architecture) ===
    // These read directly from JSONL files - no content duplication

    // Route: GET /api/sessions
    // List all sessions from the lightweight index
    if (method === 'GET' && url === '/api/sessions') {
      try {
        const index = await getSessionIndex();
        sendJson(res, 200, {
          sessions: index.sessions,
          lastScanned: index.lastScanned,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list sessions' });
      }
      return;
    }

    // Route: GET /api/sessions/by-project
    // List sessions grouped by project
    if (method === 'GET' && url === '/api/sessions/by-project') {
      try {
        const byProject = await getSessionsByProject();
        // Convert Map to object for JSON serialization
        const result: Record<string, CacheSessionEntry[]> = {};
        byProject.forEach((sessions, project) => {
          result[project] = sessions;
        });
        sendJson(res, 200, { projects: result });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list sessions by project' });
      }
      return;
    }

    // Route: GET /api/projects
    // List all discovered projects, grouped by git repo root
    if (method === 'GET' && url === '/api/projects') {
      try {
        const projects = await discoverProjects();
        sendJson(res, 200, { projects });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to discover projects' });
      }
      return;
    }

    // Route: DELETE /api/projects/:name
    // Hide a project from the discovered list
    const hideMatch = url.match(/^\/api\/projects\/([^/]+)$/);
    if (method === 'DELETE' && hideMatch) {
      const projectName = decodeURIComponent(hideMatch[1]);
      try {
        await hideProject(projectName);
        sendJson(res, 200, { hidden: projectName });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to hide project' });
      }
      return;
    }

    // Route: GET /api/sessions/stats
    // Get session index statistics
    if (method === 'GET' && url === '/api/sessions/stats') {
      try {
        const stats = await getCacheIndexStats();
        // Format size for display
        const sizeFormatted = stats.totalSizeBytes < 1024 * 1024
          ? `${(stats.totalSizeBytes / 1024).toFixed(1)} KB`
          : `${(stats.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

        sendJson(res, 200, {
          ...stats,
          sizeFormatted,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get session stats' });
      }
      return;
    }

    // Route: POST /api/sessions/rebuild
    // Force rebuild the session index
    if (method === 'POST' && url === '/api/sessions/rebuild') {
      // Use SSE for progress streaming
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendSSE = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const index = await buildSessionIndex({
          onProgress: (progress) => {
            sendSSE('progress', progress);
          },
        });

        sendSSE('complete', {
          totalSessions: index.sessions.length,
          lastScanned: index.lastScanned,
        });
        res.end();
      } catch (error) {
        sendSSE('error', { error: error instanceof Error ? error.message : 'Unknown error' });
        res.end();
      }
      return;
    }

    // Route: POST /api/sessions/launch
    // Launch a new terminal session running claude in the given directory
    if (method === 'POST' && url === '/api/sessions/launch') {
      const body = await parseBody<{ cwd?: string; preferredTerminal?: string; dangerouslySkipPermissions?: boolean }>(req);

      if (!body || !body.cwd) {
        sendJson(res, 400, { error: 'Missing cwd field' });
        return;
      }

      const { cwd, preferredTerminal, dangerouslySkipPermissions } = body;

      try {
        const { launchTerminalSession } = await import('./terminal-launcher.js');
        const result = await launchTerminalSession({
          cwd,
          preferredTerminal,
          dangerouslySkipPermissions,
        });
        sendJson(res, result.success ? 200 : 500, result);
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to launch terminal session' });
      }
      return;
    }

    // Route: GET /api/sessions/:id
    // Get a single session by ID - reads JSONL directly
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+$/) && !url.includes('by-project') && !url.includes('stats') && !url.includes('rebuild')) {
      const id = url.replace('/api/sessions/', '');
      if (!id) {
        sendJson(res, 400, { error: 'Invalid session ID' });
        return;
      }

      try {
        // Get session metadata from index (fast, cached)
        let sessionEntry = await getSessionEntry(id);
        let jsonlPath: string;

        if (!sessionEntry) {
          // Session not in index - try direct file lookup (bypasses stale cache)
          // This handles new sessions that haven't been indexed yet
          const sessionFile = await findSessionById(id);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          jsonlPath = sessionFile.filePath;

          // Create a minimal session entry for new sessions
          // Extract project info from the path
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
        } else {
          jsonlPath = sessionEntry.jsonlPath;
        }

        // Parse JSONL directly from source
        const entries = await parseJSONL(jsonlPath);

        // Handle case where session file exists but has no content yet
        // (user just started session, waiting for first response)
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
          return;
        }

        const statistics = getEntryStatistics(entries);

        // Get user-visible subagent info (exclude internal agents)
        // Internal agents: aprompt_suggestion-*, acompact-*
        let userVisibleSubagents: Array<{ filePath: string; agentId: string }> = [];
        if (sessionEntry.hasSubagents) {
          const allSubagentFiles = await listSubagentFiles(sessionEntry.jsonlPath);
          userVisibleSubagents = allSubagentFiles.filter(f =>
            !f.agentId.startsWith('aprompt_suggestion-') &&
            !f.agentId.startsWith('acompact-')
          );
        }

        // Overlay deduplicated planRefs from catalog manifest if available.
        // The session index cache has raw plan detections; the catalog manifest
        // has them grouped and deduplicated with catalogId for content loading.
        try {
          const catalogManifestPath = join(sessionEntry.projectPath, '.jacques', 'sessions', `${id}.json`);
          const catalogContent = await fsPromises.readFile(catalogManifestPath, 'utf-8');
          const catalogManifest = JSON.parse(catalogContent);
          if (catalogManifest.planRefs) {
            sessionEntry = { ...sessionEntry, planRefs: catalogManifest.planRefs };
          }
        } catch {
          // No catalog manifest available, use session index planRefs as-is
        }

        sendJson(res, 200, {
          metadata: sessionEntry,
          entries,
          statistics: {
            ...statistics,
            // Add token totals
            totalTokens: statistics.totalInputTokens + statistics.totalOutputTokens,
          },
          subagents: userVisibleSubagents.map(f => ({
            id: f.agentId,
            sessionId: id,
          })),
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get session' });
      }
      return;
    }

    // Route: GET /api/sessions/:id/badges
    // Get badge data (plan count, agent count/types, file count, mcp count, web searches, mode, hadAutoCompact)
    // for display in the Dashboard active session cards
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+\/badges$/)) {
      const match = url.match(/^\/api\/sessions\/([^/]+)\/badges$/);
      const sessionId = match?.[1];

      if (!sessionId) {
        sendJson(res, 400, { error: 'Invalid session ID' });
        return;
      }

      try {
        // Get session metadata from index (fast, cached)
        let sessionEntry = await getSessionEntry(sessionId);
        let jsonlPath: string;

        if (!sessionEntry) {
          // Session not in index - try direct file lookup (bypasses stale cache)
          const sessionFile = await findSessionById(sessionId);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          jsonlPath = sessionFile.filePath;
        } else {
          jsonlPath = sessionEntry.jsonlPath;
        }

        // Parse JSONL directly from source
        const entries = await parseJSONL(jsonlPath);

        // Handle case where session file exists but has no content yet
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
          return;
        }

        const statistics = getEntryStatistics(entries);

        // Detect mode from fresh JSONL entries (not stale cache)
        const { mode, planRefs } = detectModeAndPlans(entries);

        // Count agent types from agent_progress entries
        const agentTypes = { explore: 0, plan: 0, general: 0 };
        const seenAgentIds = new Set<string>();

        for (const entry of entries) {
          if (entry.type === 'agent_progress' && entry.content.agentId) {
            // Deduplicate by agentId
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

        // Count unique files modified (Write/Edit tool calls)
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

        // Get user-visible subagent count (exclude internal agents)
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
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get session badges' });
      }
      return;
    }

    // Route: GET /api/sessions/:id/subagents/:agentId
    // Get a subagent's JSONL entries directly
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+\/subagents\/[^/]+$/)) {
      const match = url.match(/^\/api\/sessions\/([^/]+)\/subagents\/([^/]+)$/);
      const sessionId = match?.[1];
      const agentId = match?.[2];

      if (!sessionId || !agentId) {
        sendJson(res, 400, { error: 'Invalid session or agent ID' });
        return;
      }

      try {
        // Get session to find JSONL path (fast, cached)
        let sessionEntry = await getSessionEntry(sessionId);
        let jsonlPath: string;

        if (!sessionEntry) {
          // Session not in index - try direct file lookup
          const sessionFile = await findSessionById(sessionId);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          jsonlPath = sessionFile.filePath;
        } else {
          jsonlPath = sessionEntry.jsonlPath;
        }

        // Find subagent file
        const subagentFiles = await listSubagentFiles(jsonlPath);
        const subagentFile = subagentFiles.find(f => f.agentId === agentId);

        if (!subagentFile) {
          sendJson(res, 404, { error: 'Subagent not found' });
          return;
        }

        // Parse subagent JSONL directly
        const entries = await parseJSONL(subagentFile.filePath);
        const statistics = getEntryStatistics(entries);

        // Extract prompt from first user message
        const firstUserEntry = entries.find(e => e.type === 'user_message');
        const prompt = firstUserEntry?.content.text || 'Unknown task';

        // Extract model from first assistant entry
        const firstAssistant = entries.find(
          e => e.type === 'assistant_message' || e.type === 'tool_call'
        );
        const model = firstAssistant?.content.model;

        // Use LAST turn's input tokens for context window size
        // Each turn reports the FULL context, so summing would overcount
        // Total context = fresh input + cache read (cache_creation is subset of fresh, not additional)
        const totalInput = statistics.lastInputTokens + statistics.lastCacheRead;

        // Use tiktoken-estimated output tokens since JSONL values are inaccurate
        // Output is cumulative (each turn generates NEW output, so sum is correct)
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
              // Context window size (from last turn)
              totalInput: totalInput,
              // Output tokens (cumulative, estimated via tiktoken)
              totalOutput: totalOutput,
              // Breakdown of last turn's input tokens
              freshInput: statistics.lastInputTokens > 0 ? statistics.lastInputTokens : undefined,
              cacheCreation: statistics.lastCacheCreation > 0 ? statistics.lastCacheCreation : undefined,
              cacheRead: statistics.lastCacheRead > 0 ? statistics.lastCacheRead : undefined,
            },
            durationMs: statistics.totalDurationMs > 0 ? statistics.totalDurationMs : undefined,
          },
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get subagent' });
      }
      return;
    }

    // Route: GET /api/sessions/:id/web-searches
    // Get web search entries with URLs from JSONL (lightweight: only returns search data)
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+\/web-searches$/)) {
      const match = url.match(/^\/api\/sessions\/([^/]+)\/web-searches$/);
      const sessionId = match?.[1];

      if (!sessionId) {
        sendJson(res, 400, { error: 'Invalid session ID' });
        return;
      }

      try {
        let sessionEntry = await getSessionEntry(sessionId);

        if (!sessionEntry) {
          const sessionFile = await findSessionById(sessionId);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          sendJson(res, 200, { searches: [] });
          return;
        }

        // Parse JSONL and extract web search entries with URLs + following response
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
            // Deduplicate (query_update + search_results_received produce two entries)
            if (seenQueries.has(entry.content.searchQuery)) continue;
            seenQueries.add(entry.content.searchQuery);

            // Find the next substantial assistant response after this search
            // Skip short follow-up thoughts (<200 chars) to find the real synthesis
            let response = '';
            for (let j = i + 1; j < entries.length; j++) {
              const next = entries[j];
              if (next.type === 'assistant_message' && next.content.text) {
                // A substantial response (>=200 chars) is likely the real answer
                if (next.content.text.length >= 200) {
                  response = next.content.text;
                  break;
                }
              }
              // Stop looking if we hit another web search or user message (different turn)
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
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get web searches' });
      }
      return;
    }

    // Route: GET /api/sessions/:id/tasks
    // Get deduplicated tasks from the session (TaskCreate/TaskUpdate tool calls)
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+\/tasks$/)) {
      const match = url.match(/^\/api\/sessions\/([^/]+)\/tasks$/);
      const sessionId = match?.[1];

      if (!sessionId) {
        sendJson(res, 400, { error: 'Invalid session ID' });
        return;
      }

      try {
        let sessionEntry = await getSessionEntry(sessionId);
        let jsonlPath: string;

        if (!sessionEntry) {
          const sessionFile = await findSessionById(sessionId);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          jsonlPath = sessionFile.filePath;
        } else {
          jsonlPath = sessionEntry.jsonlPath;
        }

        // Parse JSONL and extract task signals
        const entries = await parseJSONL(jsonlPath);
        const signals = extractTaskSignals(entries, sessionId);

        // Filter to only TaskCreate/TaskUpdate signals (deduplicated by task ID in extractor)
        const tasks = signals
          .filter(s => s.source === 'task_create' || s.source === 'task_update')
          .map(s => ({
            id: s.taskId || `auto-${signals.indexOf(s)}`,
            subject: s.text,
            status: s.status,
            timestamp: s.timestamp,
          }));

        // Calculate summary
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
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get session tasks' });
      }
      return;
    }

    // Route: GET /api/sessions/:id/plans/:messageIndex
    // Get a plan's content from a specific message in the session
    if (method === 'GET' && url.match(/^\/api\/sessions\/[^/]+\/plans\/\d+$/)) {
      const match = url.match(/^\/api\/sessions\/([^/]+)\/plans\/(\d+)$/);
      const sessionId = match?.[1];
      const messageIndex = match?.[2] ? parseInt(match[2], 10) : -1;

      if (!sessionId || messageIndex < 0) {
        sendJson(res, 400, { error: 'Invalid session or message index' });
        return;
      }

      try {
        // Get session to find JSONL path (fast, cached)
        let sessionEntry = await getSessionEntry(sessionId);

        if (!sessionEntry) {
          // Session not in index - try direct file lookup
          const sessionFile = await findSessionById(sessionId);
          if (!sessionFile) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          // New sessions won't have plans in the index, so return early
          sendJson(res, 404, { error: 'No plans found in session' });
          return;
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
          // No catalog manifest, use session index planRefs as-is
        }

        // Check if session has plan refs
        if (!sessionEntry.planRefs || sessionEntry.planRefs.length === 0) {
          sendJson(res, 404, { error: 'No plans found in session' });
          return;
        }

        // Find plan ref with matching message index
        const planRef = sessionEntry.planRefs.find(p => p.messageIndex === messageIndex);
        if (!planRef) {
          sendJson(res, 404, { error: 'Plan not found at message index' });
          return;
        }

        if (planRef.source === 'embedded') {
          // For embedded plans, read from the JSONL entry
          const entries = await parseJSONL(sessionEntry.jsonlPath);
          const entry = entries[messageIndex];

          if (!entry || entry.type !== 'user_message' || !entry.content.text) {
            sendJson(res, 404, { error: 'Plan content not found' });
            return;
          }

          // Extract plan content from the message
          const text = entry.content.text;
          // Import the trigger patterns to strip them
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
          // For agent plans, read the subagent JSONL and extract the last assistant response
          const agentId = (planRef as { agentId?: string }).agentId;
          if (!agentId) {
            sendJson(res, 404, { error: 'Agent ID not found for plan' });
            return;
          }

          const subagentFiles = await listSubagentFiles(sessionEntry.jsonlPath);
          const subagentFile = subagentFiles.find(f => f.agentId === agentId);
          if (!subagentFile) {
            sendJson(res, 404, { error: 'Agent subagent file not found' });
            return;
          }

          const subEntries = await parseJSONL(subagentFile.filePath);
          // Find last substantial assistant text (the plan output)
          let planContent = '';
          for (let i = subEntries.length - 1; i >= 0; i--) {
            if (subEntries[i].type === 'assistant_message' && subEntries[i].content.text && subEntries[i].content.text!.length >= 100) {
              planContent = subEntries[i].content.text!;
              break;
            }
          }

          if (!planContent) {
            // Fallback: concatenate all assistant texts
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
          // For written plans, read from file
          if (!planRef.filePath) {
            sendJson(res, 404, { error: 'Plan file path not found' });
            return;
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
          } catch (readError) {
            sendJson(res, 404, { error: 'Plan file not found' });
          }
        }
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get plan' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/plans
    // Get plan catalog for a project from .jacques/index.json
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/plans$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/plans$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const plans = await getProjectPlans(projectPath);
        sendJson(res, 200, { plans });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get project plans' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/plans/:planId/content
    // Get a plan's content from the catalog
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/plans\/[^/]+\/content$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/content$/);
      const encodedPath = match?.[1];
      const planId = match?.[2];

      if (!encodedPath || !planId) {
        sendJson(res, 400, { error: 'Invalid project path or plan ID' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        const plan = index.plans.find(p => p.id === planId);

        if (!plan) {
          sendJson(res, 404, { error: 'Plan not found in catalog' });
          return;
        }

        const content = await readLocalPlanContent(projectPath, plan);
        if (!content) {
          sendJson(res, 404, { error: 'Plan file not found' });
          return;
        }

        sendJson(res, 200, {
          id: plan.id,
          title: plan.title,
          filename: plan.filename,
          contentHash: plan.contentHash,
          sessions: plan.sessions,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
          content,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get plan content' });
      }
      return;
    }

    // === Active Plans API Routes ===
    // Track which plans are currently being worked on across sessions

    // Route: POST /api/projects/:encodedPath/active-plans
    // Register a plan as active by providing its file path
    // Body: { planPath: string } - path to the plan file (e.g., "~/.claude/plans/xxx.md")
    if (method === 'POST' && url.match(/^\/api\/projects\/[^/]+\/active-plans$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/active-plans$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      const body = await parseBody<{ planPath: string }>(req);
      if (!body || !body.planPath) {
        sendJson(res, 400, { error: 'Missing planPath in request body' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));

        // Expand ~ to home directory
        const expandedPath = body.planPath.replace(/^~/, homedir());

        // Read plan content from the provided path
        let planContent: string;
        try {
          planContent = await fsPromises.readFile(expandedPath, 'utf-8');
        } catch (readError) {
          sendJson(res, 404, { error: 'Plan file not found at provided path' });
          return;
        }

        // Find matching plan in catalog using deduplication logic
        const matchedPlan = await findDuplicatePlan(planContent, projectPath);

        if (!matchedPlan) {
          sendJson(res, 404, { error: 'Plan not found in project catalog. Extract catalog first.' });
          return;
        }

        // Add plan ID to project's activePlanIds
        const index = await readProjectIndex(projectPath);
        const activePlanIds = index.activePlanIds || [];

        if (!activePlanIds.includes(matchedPlan.id)) {
          activePlanIds.push(matchedPlan.id);
          index.activePlanIds = activePlanIds;
          await writeProjectIndex(projectPath, index);
        }

        sendJson(res, 200, {
          success: true,
          plan: matchedPlan,
          activePlanIds: index.activePlanIds,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to register active plan' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/active-plans
    // Get all active plans for a project
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/active-plans$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/active-plans$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);

        // Get full plan entries for active plan IDs
        const activePlans: PlanEntry[] = [];
        for (const planId of index.activePlanIds || []) {
          const plan = index.plans.find(p => p.id === planId);
          if (plan) {
            activePlans.push(plan);
          }
        }

        sendJson(res, 200, {
          activePlanIds: index.activePlanIds || [],
          activePlans,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get active plans' });
      }
      return;
    }

    // Route: DELETE /api/projects/:encodedPath/active-plans/:planId
    // Remove a plan from active tracking
    if (method === 'DELETE' && url.match(/^\/api\/projects\/[^/]+\/active-plans\/[^/]+$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/active-plans\/([^/]+)$/);
      const encodedPath = match?.[1];
      const planId = match?.[2];

      if (!encodedPath || !planId) {
        sendJson(res, 400, { error: 'Invalid project path or plan ID' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);

        const activePlanIds = index.activePlanIds || [];
        const planIdDecoded = decodeURIComponent(planId);

        if (!activePlanIds.includes(planIdDecoded)) {
          sendJson(res, 404, { error: 'Plan not in active list' });
          return;
        }

        index.activePlanIds = activePlanIds.filter(id => id !== planIdDecoded);
        await writeProjectIndex(projectPath, index);

        sendJson(res, 200, {
          success: true,
          activePlanIds: index.activePlanIds,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to remove active plan' });
      }
      return;
    }

    // === Context Catalog API Routes ===

    // Route: GET /api/projects/:encodedPath/catalog
    // Get full catalog (context files, plans, sessions) for a project
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/catalog$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/catalog$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        sendJson(res, 200, {
          context: index.context,
          plans: index.plans,
          sessions: index.sessions,
          updatedAt: index.updatedAt,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get project catalog' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/context/:id/content
    // Get file content for a context file
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/context\/[^/]+\/content$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)\/content$/);
      const encodedPath = match?.[1];
      const contextId = match?.[2];

      if (!encodedPath || !contextId) {
        sendJson(res, 400, { error: 'Invalid project path or context ID' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        const contextFile = index.context.find(f => f.id === contextId);

        if (!contextFile) {
          sendJson(res, 404, { error: 'Context file not found' });
          return;
        }

        const filePath = join(projectPath, contextFile.path);
        const content = await fsPromises.readFile(filePath, 'utf-8');
        sendJson(res, 200, { content });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to read context file' });
      }
      return;
    }

    // Route: POST /api/projects/:encodedPath/context
    // Add a new context note (creates file + updates index)
    if (method === 'POST' && url.match(/^\/api\/projects\/[^/]+\/context$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/context$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      const body = await parseBody<{ name: string; content: string; description?: string }>(req);
      if (!body || !body.name || !body.content) {
        sendJson(res, 400, { error: 'Missing name or content' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));

        // Generate ID and write file
        const slug = body.name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30);
        const randomSuffix = Math.random().toString(16).substring(2, 8);
        const id = `${slug.toLowerCase()}-${randomSuffix}`;
        const filename = `${slug}.md`;
        const contextDir = join(projectPath, '.jacques', 'context');
        const filePath = join(contextDir, filename);
        const relativePath = join('.jacques', 'context', filename);

        await fsPromises.mkdir(contextDir, { recursive: true });
        await fsPromises.writeFile(filePath, body.content, 'utf-8');
        const stats = await fsPromises.stat(filePath);

        const contextFile: ContextFile = {
          id,
          name: body.name,
          path: relativePath,
          source: 'local',
          sourceFile: filePath,
          addedAt: new Date().toISOString(),
          description: body.description,
          sizeBytes: stats.size,
        };

        await addContextToIndex(projectPath, contextFile);
        sendJson(res, 201, contextFile);
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to add context note' });
      }
      return;
    }

    // Route: PUT /api/projects/:encodedPath/context/:id
    // Update context file content
    if (method === 'PUT' && url.match(/^\/api\/projects\/[^/]+\/context\/[^/]+$/) && !url.endsWith('/content')) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)$/);
      const encodedPath = match?.[1];
      const contextId = match?.[2];

      if (!encodedPath || !contextId) {
        sendJson(res, 400, { error: 'Invalid project path or context ID' });
        return;
      }

      const body = await parseBody<{ content: string }>(req);
      if (!body || typeof body.content !== 'string') {
        sendJson(res, 400, { error: 'Missing content' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        const contextFile = index.context.find(f => f.id === contextId);

        if (!contextFile) {
          sendJson(res, 404, { error: 'Context file not found' });
          return;
        }

        const filePath = join(projectPath, contextFile.path);
        await fsPromises.writeFile(filePath, body.content, 'utf-8');
        const stats = await fsPromises.stat(filePath);

        // Update size in index
        contextFile.sizeBytes = stats.size;
        await addContextToIndex(projectPath, contextFile);

        sendJson(res, 200, { success: true });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to update context file' });
      }
      return;
    }

    // Route: DELETE /api/projects/:encodedPath/context/:id
    // Delete a context file
    if (method === 'DELETE' && url.match(/^\/api\/projects\/[^/]+\/context\/[^/]+$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)$/);
      const encodedPath = match?.[1];
      const contextId = match?.[2];

      if (!encodedPath || !contextId) {
        sendJson(res, 400, { error: 'Invalid project path or context ID' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        const contextFile = index.context.find(f => f.id === contextId);

        if (!contextFile) {
          sendJson(res, 404, { error: 'Context file not found' });
          return;
        }

        // Delete the file
        const filePath = join(projectPath, contextFile.path);
        try {
          await fsPromises.unlink(filePath);
        } catch {
          // File may already be deleted
        }

        // Remove from index
        await removeContextFromIndex(projectPath, contextId);
        sendJson(res, 200, { success: true });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to delete context file' });
      }
      return;
    }

    // === Notification API Routes ===

    // Route: GET /api/notifications/settings
    if (method === 'GET' && url === '/api/notifications/settings') {
      if (!notificationService) {
        sendJson(res, 503, { error: 'Notification service not available' });
        return;
      }
      sendJson(res, 200, notificationService.getSettings());
      return;
    }

    // Route: PUT /api/notifications/settings
    if (method === 'PUT' && url === '/api/notifications/settings') {
      if (!notificationService) {
        sendJson(res, 503, { error: 'Notification service not available' });
        return;
      }
      const body = await parseBody<Record<string, unknown>>(req);
      if (!body) {
        sendJson(res, 400, { error: 'Invalid request body' });
        return;
      }
      const updated = notificationService.updateSettings(body);
      sendJson(res, 200, updated);
      return;
    }

    // Route: GET /api/notifications
    if (method === 'GET' && url === '/api/notifications') {
      if (!notificationService) {
        sendJson(res, 503, { error: 'Notification service not available' });
        return;
      }
      sendJson(res, 200, { notifications: notificationService.getHistory() });
      return;
    }

    // === Archive API Routes ===

    // Route: GET /api/archive/stats
    if (method === 'GET' && url === '/api/archive/stats') {
      try {
        const stats = await getArchiveStats();
        sendJson(res, 200, stats);
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get archive stats' });
      }
      return;
    }

    // Route: GET /api/archive/conversations
    if (method === 'GET' && url === '/api/archive/conversations') {
      try {
        const manifests = await listAllManifests();
        sendJson(res, 200, { manifests });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list conversations' });
      }
      return;
    }

    // Route: GET /api/archive/conversations/by-project
    if (method === 'GET' && url === '/api/archive/conversations/by-project') {
      try {
        const byProject = await listManifestsByProject();
        // Convert Map to object for JSON serialization
        const result: Record<string, ConversationManifest[]> = {};
        byProject.forEach((manifests, project) => {
          result[project] = manifests;
        });
        sendJson(res, 200, { projects: result });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list conversations by project' });
      }
      return;
    }

    // Route: GET /api/archive/conversations/:id
    if (method === 'GET' && url.startsWith('/api/archive/conversations/') && !url.includes('by-project')) {
      const id = url.replace('/api/archive/conversations/', '');
      if (!id || id.includes('/')) {
        sendJson(res, 400, { error: 'Invalid conversation ID' });
        return;
      }

      try {
        // First get the manifest to know the project
        const manifest = await readManifest(id);
        if (!manifest) {
          sendJson(res, 404, { error: 'Conversation not found' });
          return;
        }

        // Read the conversation content from the archive
        // Use projectId (encoded path) for storage, fallback to projectSlug for old data
        const archivePath = join(
          homedir(),
          '.jacques',
          'archive',
          'conversations',
          manifest.projectId || manifest.projectSlug
        );

        // Find the conversation file (it uses readable filename format)
        try {
          const files = await fsPromises.readdir(archivePath);
          const convFile = files.find(f => f.includes(id.substring(0, 4)) && f.endsWith('.json'));

          if (!convFile) {
            sendJson(res, 404, { error: 'Conversation content not found' });
            return;
          }

          const content = await fsPromises.readFile(join(archivePath, convFile), 'utf-8');
          const conversation = JSON.parse(content);

          // Load subagent references if available
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
        } catch (readError) {
          sendJson(res, 404, { error: 'Conversation content not found' });
        }
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get conversation' });
      }
      return;
    }

    // Route: POST /api/archive/search
    if (method === 'POST' && url === '/api/archive/search') {
      const body = await parseBody<SearchInput>(req);
      if (!body || !body.query) {
        sendJson(res, 400, { error: 'Missing query' });
        return;
      }

      try {
        const results = await searchConversations(body);
        sendJson(res, 200, results);
      } catch (error) {
        sendJson(res, 500, { error: 'Search failed' });
      }
      return;
    }

    // Route: GET /api/archive/subagents/:agentId
    // Get a single subagent's full conversation
    if (method === 'GET' && url.match(/^\/api\/archive\/subagents\/[^/]+$/)) {
      const agentId = url.replace('/api/archive/subagents/', '');
      if (!agentId) {
        sendJson(res, 400, { error: 'Invalid agent ID' });
        return;
      }

      try {
        const subagent = await readSubagent(agentId);
        if (!subagent) {
          sendJson(res, 404, { error: 'Subagent not found' });
          return;
        }
        sendJson(res, 200, { subagent });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get subagent' });
      }
      return;
    }

    // Route: GET /api/archive/sessions/:sessionId/subagents
    // List all subagents for a session
    if (method === 'GET' && url.match(/^\/api\/archive\/sessions\/[^/]+\/subagents$/)) {
      const match = url.match(/^\/api\/archive\/sessions\/([^/]+)\/subagents$/);
      const sessionId = match?.[1];
      if (!sessionId) {
        sendJson(res, 400, { error: 'Invalid session ID' });
        return;
      }

      try {
        const subagents = await listSubagentsForSession(sessionId);
        sendJson(res, 200, { subagents });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list subagents' });
      }
      return;
    }

    // Route: POST /api/archive/initialize
    // Uses Server-Sent Events for progress streaming
    // Query params:
    //   - force=true: Re-archive all sessions (skip already-archived check)
    if (method === 'POST' && url.startsWith('/api/archive/initialize')) {
      // Parse query parameters
      const urlObj = new URL(url, `http://${req.headers.host}`);
      const force = urlObj.searchParams.get('force') === 'true';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendSSE = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await initializeArchive({
          saveToLocal: false,
          force, // Pass force option to re-archive existing sessions
          // filterType defaults to EVERYTHING in the core function
          onProgress: (progress) => {
            sendSSE('progress', progress);
          },
        });
        sendSSE('complete', result);
        res.end();
      } catch (error) {
        sendSSE('error', { error: error instanceof Error ? error.message : 'Unknown error' });
        res.end();
      }
      return;
    }

    // === Sync API Route ===
    // Unified endpoint: catalog extraction → session index rebuild

    // Route: POST /api/sync
    // Runs catalog extraction then rebuilds the session index
    // Query params:
    //   - force=true: Re-extract all sessions (no skipping)
    if (method === 'POST' && url.startsWith('/api/sync')) {
      const urlObj = new URL(url, `http://${req.headers.host}`);
      const force = urlObj.searchParams.get('force') === 'true';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendSSE = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Phase 1: Catalog extraction
        const extractResult = await extractAllCatalogs({
          force,
          onProgress: (progress) => {
            sendSSE('progress', { ...progress, phase: 'extracting' });
          },
        });

        // Phase 2: Session index rebuild
        const index = await buildSessionIndex({
          onProgress: (progress) => {
            sendSSE('progress', { ...progress, phase: 'indexing' });
          },
        });

        sendSSE('complete', {
          totalSessions: extractResult.totalSessions,
          extracted: extractResult.extracted,
          skipped: extractResult.skipped,
          errors: extractResult.errors,
          indexed: index.sessions.length,
        });
        res.end();
      } catch (error) {
        sendSSE('error', { error: error instanceof Error ? error.message : 'Unknown error' });
        res.end();
      }
      return;
    }

    // === Catalog API Routes ===

    // Route: POST /api/catalog/extract
    // Triggers bulk catalog extraction with SSE progress
    // Query params:
    //   - force=true: Re-extract all sessions
    //   - project=<path>: Extract only for a specific project
    if (method === 'POST' && url.startsWith('/api/catalog/extract')) {
      const urlObj = new URL(url, `http://${req.headers.host}`);
      const force = urlObj.searchParams.get('force') === 'true';
      const projectParam = urlObj.searchParams.get('project');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendSSE = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        if (projectParam) {
          const result = await extractProjectCatalog(projectParam, {
            force,
            onProgress: (progress) => {
              sendSSE('progress', progress);
            },
          });
          sendSSE('complete', result);
        } else {
          const result = await extractAllCatalogs({
            force,
            onProgress: (progress) => {
              sendSSE('progress', progress);
            },
          });
          sendSSE('complete', result);
        }
        res.end();
      } catch (error) {
        sendSSE('error', { error: error instanceof Error ? error.message : 'Unknown error' });
        res.end();
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/catalog
    // Returns ProjectIndex from .jacques/index.json (instant)
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/catalog$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/catalog$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        sendJson(res, 200, { projectPath, index });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get project catalog' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/subagents/:id/content
    // Returns subagent markdown content
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/subagents\/[^/]+\/content$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/subagents\/([^/]+)\/content$/);
      const encodedPath = match?.[1];
      const subagentId = match?.[2];

      if (!encodedPath || !subagentId) {
        sendJson(res, 400, { error: 'Invalid project path or subagent ID' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const index = await readProjectIndex(projectPath);
        const entry = index.subagents.find(s => s.id === subagentId);

        if (!entry) {
          sendJson(res, 404, { error: 'Subagent not found in catalog' });
          return;
        }

        const filePath = join(projectPath, '.jacques', entry.path);
        const content = await fsPromises.readFile(filePath, 'utf-8');

        sendJson(res, 200, {
          ...entry,
          content,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get subagent content' });
      }
      return;
    }

    // === Handoff API Routes ===

    // Route: GET /api/projects/:encodedPath/handoffs
    // List all handoffs for a project
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/handoffs$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/handoffs$/);
      const encodedPath = match?.[1];

      if (!encodedPath) {
        sendJson(res, 400, { error: 'Invalid project path' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const catalog = await listHandoffs(projectPath);
        sendJson(res, 200, {
          directory: catalog.directory,
          handoffs: catalog.entries.map(e => ({
            filename: e.filename,
            timestamp: e.timestamp.toISOString(),
            path: e.path,
            tokenEstimate: e.tokenEstimate,
          })),
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to list handoffs' });
      }
      return;
    }

    // Route: GET /api/projects/:encodedPath/handoffs/:filename/content
    // Get handoff content
    if (method === 'GET' && url.match(/^\/api\/projects\/[^/]+\/handoffs\/[^/]+\/content$/)) {
      const match = url.match(/^\/api\/projects\/([^/]+)\/handoffs\/([^/]+)\/content$/);
      const encodedPath = match?.[1];
      const filename = match?.[2];

      if (!encodedPath || !filename) {
        sendJson(res, 400, { error: 'Invalid project path or filename' });
        return;
      }

      try {
        const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
        const catalog = await listHandoffs(projectPath);
        const entry = catalog.entries.find(e => e.filename === decodeURIComponent(filename));

        if (!entry) {
          sendJson(res, 404, { error: 'Handoff not found' });
          return;
        }

        const content = await getHandoffContent(entry.path);
        sendJson(res, 200, {
          filename: entry.filename,
          timestamp: entry.timestamp.toISOString(),
          tokenEstimate: entry.tokenEstimate,
          content,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get handoff content' });
      }
      return;
    }

    // === Claude Operations API Routes ===

    // Route: GET /api/claude/operations
    // Get recent Claude operations
    if (method === 'GET' && url === '/api/claude/operations') {
      try {
        const operations = await ClaudeOperationLogger.getRecentOperations(50);
        sendJson(res, 200, { operations });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get operations' });
      }
      return;
    }

    // Route: GET /api/claude/operations/:id/debug
    // Get debug data for a specific operation
    if (method === 'GET' && url.startsWith('/api/claude/operations/') && url.endsWith('/debug')) {
      const match = url.match(/\/api\/claude\/operations\/([^/]+)\/debug/);
      const operationId = match?.[1];

      if (!operationId) {
        sendJson(res, 400, { error: 'Invalid operation ID' });
        return;
      }

      try {
        const debugData = await ClaudeOperationLogger.readDebugData(operationId);
        if (!debugData) {
          sendJson(res, 404, { error: 'Debug data not found' });
          return;
        }
        sendJson(res, 200, debugData);
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get debug data' });
      }
      return;
    }

    // === Window Tiling API Routes ===

    // Route: GET /api/tile/displays
    // Get available displays for tiling
    if (method === 'GET' && url === '/api/tile/displays') {
      try {
        const { createWindowManager, isWindowManagementSupported, getPlatformNotes } = await import('./window-manager/index.js');

        if (!isWindowManagementSupported()) {
          sendJson(res, 501, { error: 'Window management not supported on this platform' });
          return;
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
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to get displays' });
      }
      return;
    }

    // Route: POST /api/tile/sessions
    // Tile multiple sessions side-by-side
    // Body: { sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2', displayId?: string }
    if (method === 'POST' && url === '/api/tile/sessions') {
      const body = await parseBody<{
        sessionIds: string[];
        layout?: 'side-by-side' | 'thirds' | '2x2';
        displayId?: string;
      }>(req);

      if (!body || !body.sessionIds || !Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
        sendJson(res, 400, { error: 'Missing or invalid sessionIds array' });
        return;
      }

      try {
        const { createWindowManager, isWindowManagementSupported, suggestLayout } = await import('./window-manager/index.js');

        if (!isWindowManagementSupported()) {
          sendJson(res, 501, { error: 'Window management not supported on this platform' });
          return;
        }

        // Get session terminal keys from the session index
        const terminalKeys: string[] = [];
        const missingKeys: string[] = [];

        for (const sessionId of body.sessionIds) {
          const entry = await getSessionEntry(sessionId);
          // Sessions have terminal_key in the live session registry, not in the cache
          // We need to get this from the WebSocket sessions
          // For now, try to find terminal_key from the session if available
          if (entry) {
            // The cache doesn't have terminal_key, so we'll need to get it from live sessions
            // This is a limitation - we can only tile live sessions that the server knows about
            missingKeys.push(sessionId);
          } else {
            missingKeys.push(sessionId);
          }
        }

        // Since we can't get terminal_keys from the cache, this endpoint needs to be called
        // with terminal_keys directly or from the live session registry
        // Return an error explaining this limitation
        sendJson(res, 400, {
          error: 'This endpoint requires terminal_keys. Use the WebSocket tile command or /api/tile/with-keys instead.',
          sessionIds: body.sessionIds,
        });
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to tile sessions' });
      }
      return;
    }

    // Route: POST /api/tile/with-keys
    // Tile windows using terminal keys directly
    // Body: { terminalKeys: string[], layout?: 'side-by-side' | 'thirds' | '2x2', displayId?: string }
    if (method === 'POST' && url === '/api/tile/with-keys') {
      const body = await parseBody<{
        terminalKeys: string[];
        layout?: 'side-by-side' | 'thirds' | '2x2';
        displayId?: string;
      }>(req);

      if (!body || !body.terminalKeys || !Array.isArray(body.terminalKeys) || body.terminalKeys.length === 0) {
        sendJson(res, 400, { error: 'Missing or invalid terminalKeys array' });
        return;
      }

      try {
        const { createWindowManager, isWindowManagementSupported, suggestLayout } = await import('./window-manager/index.js');

        if (!isWindowManagementSupported()) {
          sendJson(res, 501, { error: 'Window management not supported on this platform' });
          return;
        }

        const manager = createWindowManager();
        const layout = body.layout || suggestLayout(body.terminalKeys.length);

        // Get target display if specified
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
      } catch (error) {
        sendJson(res, 500, { error: 'Failed to tile windows' });
      }
      return;
    }

    // === Static File Serving (GUI) ===

    if (method === 'GET' && guiAvailable) {
      // Clean URL path
      let urlPath = url.split('?')[0]; // Remove query string

      // Try to serve the exact file
      let filePath = join(GUI_DIST_PATH, urlPath);
      if (serveStaticFile(res, filePath)) {
        return;
      }

      // For SPA routing, serve index.html for non-API, non-asset routes
      if (!url.startsWith('/api/') && !url.includes('.')) {
        filePath = join(GUI_DIST_PATH, 'index.html');
        if (serveStaticFile(res, filePath)) {
          return;
        }
      }
    }

    // 404 for unknown routes
    if (url.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
    } else if (guiAvailable) {
      // Serve index.html for unknown GUI routes (SPA fallback)
      const indexPath = join(GUI_DIST_PATH, 'index.html');
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
