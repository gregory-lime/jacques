/**
 * GUI API Client
 *
 * HTTP client for communicating with the Jacques server's REST API.
 * Replaces direct @jacques/core imports to avoid bundling Node.js modules.
 */

// When served from the same origin, use relative URL
// When in dev mode (Vite), use absolute URL
const API_URL = import.meta.env.DEV ? 'http://localhost:4243/api' : '/api';

export interface SourceStatus {
  connected: boolean;
  detail?: string;
}

export interface SourcesStatus {
  obsidian: SourceStatus;
  googleDocs: SourceStatus;
  notion: SourceStatus;
}

export interface GoogleDocsConfig {
  client_id: string;
  client_secret: string;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
  };
  connected_email?: string;
}

export interface NotionConfig {
  client_id: string;
  client_secret: string;
  tokens: {
    access_token: string;
  };
  workspace_id?: string;
  workspace_name?: string;
}

/**
 * Get the status of all configured sources
 */
export async function getSourcesStatus(): Promise<SourcesStatus> {
  const response = await fetch(`${API_URL}/sources/status`);
  if (!response.ok) {
    throw new Error(`Failed to get sources status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Configure Google Docs with OAuth tokens
 */
export async function configureGoogleDocs(config: GoogleDocsConfig): Promise<void> {
  const response = await fetch(`${API_URL}/sources/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to configure Google Docs: ${response.statusText}`);
  }
}

/**
 * Disconnect Google Docs
 */
export async function disconnectGoogleDocs(): Promise<void> {
  const response = await fetch(`${API_URL}/sources/google`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to disconnect Google Docs: ${response.statusText}`);
  }
}

/**
 * Configure Notion with OAuth tokens
 */
export async function configureNotion(config: NotionConfig): Promise<void> {
  const response = await fetch(`${API_URL}/sources/notion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to configure Notion: ${response.statusText}`);
  }
}

/**
 * Disconnect Notion
 */
export async function disconnectNotion(): Promise<void> {
  const response = await fetch(`${API_URL}/sources/notion`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to disconnect Notion: ${response.statusText}`);
  }
}

// ============================================================
// Root Path Configuration API
// ============================================================

export interface RootPathConfig {
  path: string;
  isDefault: boolean;
  exists: boolean;
  defaultPath: string;
  defaultExists: boolean;
}

/**
 * Get the current root catalog path configuration
 */
export async function getRootPath(): Promise<RootPathConfig> {
  const response = await fetch(`${API_URL}/config/root-path`);
  if (!response.ok) {
    throw new Error(`Failed to get root path: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Set the root catalog path
 */
export async function setRootPath(path: string): Promise<void> {
  const response = await fetch(`${API_URL}/config/root-path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to set root path: ${response.statusText}`);
  }
}

// ============================================================
// Archive API
// ============================================================

export interface ArchiveStats {
  totalConversations: number;
  totalProjects: number;
  totalSizeBytes: number;
  sizeFormatted: string;
}

export interface ConversationManifest {
  id: string;
  projectId: string;
  projectSlug: string;
  projectPath: string;
  archivedAt: string;
  autoArchived: boolean;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  userQuestions: string[];
  filesModified: string[];
  toolsUsed: string[];
  technologies: string[];
  messageCount: number;
  toolCallCount: number;
  userLabel?: string;
  subagents?: SubagentSummary;
}

export interface ArchiveProgress {
  phase: 'scanning' | 'archiving';
  total: number;
  completed: number;
  current: string;
  skipped: number;
  errors: number;
}

export interface ArchiveInitResult {
  totalSessions: number;
  archived: number;
  skipped: number;
  errors: number;
}

// Subagent types

/**
 * Summary of subagents used in a conversation
 */
export interface SubagentSummary {
  count: number;
  totalTokens: number;
  ids: string[];
}

/**
 * Token statistics for a subagent conversation
 */
export interface SubagentTokenStats {
  totalInput: number;
  totalOutput: number;
  cacheCreation?: number;
  cacheRead?: number;
}

/**
 * Reference to a subagent stored in the archive
 */
export interface SubagentReference {
  id: string;
  sessionId: string;
  promptPreview: string;
  model?: string;
  tokenCount: number;
  messageCount: number;
  position: {
    afterMessageUuid?: string;
    index: number;
  };
}

/**
 * Archived subagent conversation
 */
export interface ArchivedSubagent {
  id: string;
  sessionId: string;
  projectSlug: string;
  archivedAt: string;
  prompt: string;
  model?: string;
  conversation: Array<{
    id: string;
    type: string;
    timestamp: string;
    content: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>;
  statistics: {
    messageCount: number;
    toolCallCount: number;
    tokens: SubagentTokenStats;
    durationMs?: number;
  };
}

export interface ArchivedConversation {
  id: string;
  title: string;
  project: string;
  messages: Array<{
    role: 'user' | 'assistant';
    timestamp: number;
    content: unknown[];
  }>;
  metadata: {
    filterType: string;
    savedAt: string;
    originalFile: string;
  };
}

/**
 * Get archive statistics
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  const response = await fetch(`${API_URL}/archive/stats`);
  if (!response.ok) {
    throw new Error(`Failed to get archive stats: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List all archived conversations
 */
export async function listArchivedConversations(): Promise<{ manifests: ConversationManifest[] }> {
  const response = await fetch(`${API_URL}/archive/conversations`);
  if (!response.ok) {
    throw new Error(`Failed to list conversations: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List archived conversations grouped by project
 */
export async function listConversationsByProject(): Promise<{ projects: Record<string, ConversationManifest[]> }> {
  const response = await fetch(`${API_URL}/archive/conversations/by-project`);
  if (!response.ok) {
    throw new Error(`Failed to list conversations: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get a single archived conversation by ID
 */
export async function getArchivedConversation(id: string): Promise<{
  manifest: ConversationManifest;
  conversation: ArchivedConversation;
  subagentRefs?: SubagentReference[];
}> {
  const response = await fetch(`${API_URL}/archive/conversations/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Conversation not found');
    }
    throw new Error(`Failed to get conversation: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Search archived conversations
 */
export async function searchArchivedConversations(query: string, options?: {
  project?: string;
  technologies?: string[];
  limit?: number;
  offset?: number;
}): Promise<{
  query: string;
  totalMatches: number;
  results: Array<{
    id: string;
    title: string;
    project: string;
    date: string;
    preview: string;
    messageCount: number;
    durationMinutes: number;
    technologies: string[];
  }>;
}> {
  const response = await fetch(`${API_URL}/archive/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...options }),
  });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Initialize archive (bulk scan and archive all sessions)
 * Returns an EventSource for SSE progress updates
 *
 * @param options.force - If true, re-archives all sessions (ignores already-archived check)
 */
export function initializeArchive(
  callbacks: {
    onProgress?: (progress: ArchiveProgress) => void;
    onComplete?: (result: ArchiveInitResult) => void;
    onError?: (error: string) => void;
  },
  options: { force?: boolean } = {}
): { abort: () => void } {
  // Create abort controller for cleanup
  let aborted = false;

  // Build URL with query params
  const url = new URL(`${API_URL}/archive/initialize`, window.location.origin);
  if (options.force) {
    url.searchParams.set('force', 'true');
  }

  // Use fetch with streaming for SSE
  fetch(url.toString(), {
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      callbacks.onError?.(`Failed to initialize archive: ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'progress') {
            callbacks.onProgress?.(data);
          } else if (currentEvent === 'complete') {
            callbacks.onComplete?.(data);
          } else if (currentEvent === 'error') {
            callbacks.onError?.(data.error);
          }
        }
      }
    }
  }).catch((error) => {
    if (!aborted) {
      callbacks.onError?.(error.message);
    }
  });

  return {
    abort: () => {
      aborted = true;
    },
  };
}

/**
 * Get a single subagent's full conversation by agent ID
 */
export async function getSubagent(agentId: string): Promise<{
  subagent: ArchivedSubagent;
}> {
  const response = await fetch(`${API_URL}/archive/subagents/${agentId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Subagent not found');
    }
    throw new Error(`Failed to get subagent: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List all subagents for a session
 */
export async function listSessionSubagents(sessionId: string): Promise<{
  subagents: ArchivedSubagent[];
}> {
  const response = await fetch(`${API_URL}/archive/sessions/${sessionId}/subagents`);
  if (!response.ok) {
    throw new Error(`Failed to list subagents: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================
// Sessions API (Hybrid Architecture - reads JSONL directly)
// ============================================================

/**
 * Session entry from the lightweight index
 * Contains only metadata - content is read directly from JSONL
 */
export interface SessionEntry {
  /** Session UUID */
  id: string;
  /** Full path to JSONL file */
  jsonlPath: string;
  /** Decoded project path */
  projectPath: string;
  /** Project name (basename) */
  projectSlug: string;
  /** Session title */
  title: string;
  /** First timestamp */
  startedAt: string;
  /** Last timestamp */
  endedAt: string;
  /** Count of user + assistant messages */
  messageCount: number;
  /** Count of tool calls */
  toolCallCount: number;
  /** Whether user-visible subagents exist (excludes internal agents) */
  hasSubagents: boolean;
  /** User-visible subagent IDs (excludes prompt_suggestion, acompact) */
  subagentIds?: string[];
  /** Whether auto-compact occurred during this session */
  hadAutoCompact?: boolean;
  /** Timestamp when auto-compact occurred (ISO string) */
  autoCompactAt?: string;
  /** Token usage stats */
  tokens?: {
    /** Fresh input tokens (non-cached) */
    input: number;
    /** Output tokens generated */
    output: number;
    /** Tokens written to cache */
    cacheCreation: number;
    /** Tokens read from cache */
    cacheRead: number;
  };
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  gitRepoRoot?: string;
  /** Git branch name at time of indexing */
  gitBranch?: string;
  /** Git worktree name (basename of project dir, only set for worktrees) */
  gitWorktree?: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** File modification time */
  modifiedAt: string;
  /** Session mode from permission_mode or JSONL detection */
  mode?: 'plan' | 'acceptEdits' | 'default' | 'bypass' | 'planning' | 'execution' | null;
  /** Number of plans detected in this session */
  planCount?: number;
  /** Plan references for display */
  planRefs?: Array<{
    /** Plan title extracted from content */
    title: string;
    /** Source: 'embedded' for inline plans, 'write' for Write tool plans, 'agent' for Plan subagent */
    source: 'embedded' | 'write' | 'agent';
    /** Index of the message containing this plan */
    messageIndex: number;
    /** File path if plan was written to disk */
    filePath?: string;
    /** Agent ID for Plan subagent source */
    agentId?: string;
    /** Links to PlanEntry.id in catalog (.jacques/index.json) */
    catalogId?: string;
  }>;
  /** Explore agent references */
  exploreAgents?: Array<{
    /** Agent ID from agent_progress */
    id: string;
    /** Short description from Task tool call */
    description: string;
    /** Timestamp when agent was called */
    timestamp: string;
    /** Estimated total token cost (input + output) from subagent JSONL */
    tokenCost?: number;
  }>;
  /** Web search references */
  webSearches?: Array<{
    /** Search query */
    query: string;
    /** Number of results returned */
    resultCount: number;
    /** Timestamp of search */
    timestamp: string;
  }>;
}

/**
 * Session index statistics
 */
export interface SessionStats {
  totalSessions: number;
  totalProjects: number;
  totalSizeBytes: number;
  sizeFormatted: string;
  lastScanned: string;
}

/**
 * Parsed entry from JSONL
 */
export interface ParsedEntry {
  type: string;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  content: {
    text?: string;
    thinking?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResultContent?: string;
    // Agent progress
    agentPrompt?: string;
    agentId?: string;
    agentMessageType?: 'user' | 'assistant';
    agentMessageContent?: unknown[];
    agentType?: string; // "Explore", "Plan", "general-purpose", etc.
    agentDescription?: string; // Short description of the task
    // Bash progress
    bashOutput?: string;
    bashFullOutput?: string;
    bashElapsedSeconds?: number;
    bashTotalLines?: number;
    // MCP progress
    mcpStatus?: string;
    mcpServerName?: string;
    mcpToolName?: string;
    // Web search
    searchType?: 'query' | 'results';
    searchQuery?: string;
    searchResultCount?: number;
    searchUrls?: Array<{ title: string; url: string }>; // URLs from search results
    // Token usage
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cacheCreation?: number;
      cacheRead?: number;
    };
    costUSD?: number;
    durationMs?: number;
    model?: string;
  };
}

/**
 * Entry statistics from JSONL
 */
export interface EntryStatistics {
  totalEntries: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  hookEvents: number;
  agentCalls: number;
  bashProgress: number;
  mcpCalls: number;
  webSearches: number;
  systemEvents: number;
  summaries: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCostUSD: number;
  totalDurationMs: number;
  turnCount: number;
  totalTokens: number;
}

/**
 * Full session data including parsed entries
 */
export interface SessionData {
  metadata: SessionEntry;
  entries: ParsedEntry[];
  statistics: EntryStatistics;
  subagents: Array<{ id: string; sessionId: string }>;
  /** True if session exists but hasn't received first response yet */
  awaitingFirstResponse?: boolean;
}

/**
 * Subagent data from JSONL
 */
export interface SubagentData {
  id: string;
  sessionId: string;
  prompt: string;
  model?: string;
  entries: ParsedEntry[];
  statistics: {
    messageCount: number;
    toolCallCount: number;
    tokens: {
      /** Total input tokens (freshInput + cacheRead, cumulative across all turns) */
      totalInput: number;
      /** Total output tokens (cumulative across all turns) */
      totalOutput: number;
      /** Fresh (non-cached) input tokens, cumulative */
      freshInput?: number;
      /** Tokens written to cache (subset of freshInput), cumulative */
      cacheCreation?: number;
      /** Tokens read from cache, cumulative */
      cacheRead?: number;
    };
    durationMs?: number;
  };
}

/**
 * Get session index statistics
 */
export async function getSessionStats(): Promise<SessionStats> {
  const response = await fetch(`${API_URL}/sessions/stats`);
  if (!response.ok) {
    throw new Error(`Failed to get session stats: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List all sessions from the lightweight index
 */
export async function listSessions(): Promise<{
  sessions: SessionEntry[];
  lastScanned: string;
}> {
  const response = await fetch(`${API_URL}/sessions`);
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List sessions grouped by project
 */
export async function listSessionsByProject(): Promise<{
  projects: Record<string, SessionEntry[]>;
}> {
  const response = await fetch(`${API_URL}/sessions/by-project`);
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.statusText}`);
  }
  return response.json();
}

/**
 * A discovered project, grouped by git repo root
 */
export interface DiscoveredProject {
  name: string;
  gitRepoRoot: string | null;
  isGitProject: boolean;
  projectPaths: string[];
  encodedPaths: string[];
  sessionCount: number;
  lastActivity: string | null;
}

/**
 * List all discovered projects (grouped by git repo root)
 */
export async function listProjects(): Promise<{ projects: DiscoveredProject[] }> {
  const response = await fetch(`${API_URL}/projects`);
  if (!response.ok) {
    throw new Error(`Failed to list projects: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Hide a project from the discovered list
 */
export async function hideProject(name: string): Promise<void> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to hide project: ${response.statusText}`);
  }
}

/**
 * Get a single session with parsed JSONL entries
 */
export async function getSession(id: string): Promise<SessionData> {
  const response = await fetch(`${API_URL}/sessions/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session not found');
    }
    throw new Error(`Failed to get session: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get subagent data from JSONL directly
 */
export async function getSubagentFromSession(
  sessionId: string,
  agentId: string
): Promise<SubagentData> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/subagents/${agentId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Subagent not found');
    }
    throw new Error(`Failed to get subagent: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Plan content response from session plan endpoint
 */
export interface SessionPlanContent {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  messageIndex: number;
  content: string;
  filePath?: string;
  agentId?: string;
}

/**
 * Get plan content from a specific message in a session
 */
export async function getSessionPlanContent(
  sessionId: string,
  messageIndex: number,
): Promise<SessionPlanContent> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/plans/${messageIndex}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Plan not found');
    }
    throw new Error(`Failed to get plan: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Web search with URLs from JSONL parsing
 */
export interface SessionWebSearch {
  query: string;
  resultCount: number;
  urls: Array<{ title: string; url: string }>;
  /** Assistant's synthesized response based on search findings */
  response: string;
  timestamp: string;
}

/**
 * Get web search entries with URLs for a session.
 * Parses the JSONL to extract full URL data (not available in cached index).
 */
export async function getSessionWebSearches(
  sessionId: string,
): Promise<{ searches: SessionWebSearch[] }> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/web-searches`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session not found');
    }
    throw new Error(`Failed to get web searches: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Session badges for display in Dashboard session cards
 */
export interface SessionBadges {
  planCount: number;
  agentCount: number;
  agentTypes: {
    explore: number;
    plan: number;
    general: number;
  };
  fileCount: number;
  mcpCount: number;
  webSearchCount: number;
  mode: 'plan' | 'acceptEdits' | 'default' | 'bypass' | 'planning' | 'execution' | null;
  hadAutoCompact: boolean;
}

/**
 * Get badge data for an active session
 * Extracts metadata from the session transcript for display in session cards
 */
export async function getSessionBadges(sessionId: string): Promise<SessionBadges> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/badges`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session not found');
    }
    throw new Error(`Failed to get session badges: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================
// Plan Catalog API
// ============================================================

/**
 * Plan catalog entry from .jacques/index.json
 */
export interface PlanCatalogEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  sessions: string[];
}

/**
 * Plan content response from catalog
 */
export interface PlanCatalogContent {
  id: string;
  title: string;
  filename: string;
  contentHash?: string;
  sessions: string[];
  createdAt: string;
  updatedAt: string;
  content: string;
}

/**
 * Get plan catalog for a project (deduplicated plans from .jacques/index.json)
 */
export async function getProjectPlanCatalog(encodedPath: string): Promise<{
  plans: PlanCatalogEntry[];
}> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/plans`);
  if (!response.ok) {
    throw new Error(`Failed to get project plans: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get a plan's content from the catalog
 */
export async function getPlanCatalogContent(
  encodedPath: string,
  planId: string
): Promise<PlanCatalogContent> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/plans/${encodeURIComponent(planId)}/content`
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Plan not found');
    }
    throw new Error(`Failed to get plan content: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================
// Context Catalog API
// ============================================================

import type { ProjectCatalog, CatalogItem } from '../types';

/**
 * Get full project catalog (context files, plans, sessions)
 */
export async function getProjectCatalog(encodedPath: string): Promise<ProjectCatalog> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/catalog`);
  if (!response.ok) {
    throw new Error(`Failed to get catalog: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get context file content
 */
export async function getContextFileContent(encodedPath: string, id: string): Promise<{ content: string }> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}/content`
  );
  if (!response.ok) {
    throw new Error(`Failed to get context file: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Add a new context note
 */
export async function addContextNote(
  encodedPath: string,
  name: string,
  content: string,
  description?: string,
): Promise<CatalogItem> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content, description }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add context note: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Update context file content
 */
export async function updateContextContent(encodedPath: string, id: string, content: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update context file: ${response.statusText}`);
  }
}

/**
 * Delete a context file
 */
export async function deleteContextFile(encodedPath: string, id: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error(`Failed to delete context file: ${response.statusText}`);
  }
}

/**
 * Task from a session
 */
export interface SessionTask {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  timestamp: string;
}

/**
 * Task summary for a session
 */
export interface SessionTaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentage: number;
}

/**
 * Response from getSessionTasks
 */
export interface SessionTasksResponse {
  tasks: SessionTask[];
  summary: SessionTaskSummary;
}

/**
 * Get tasks from a session (deduplicated TaskCreate/TaskUpdate calls)
 */
export async function getSessionTasks(sessionId: string): Promise<SessionTasksResponse> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/tasks`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session not found');
    }
    throw new Error(`Failed to get session tasks: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================
// Sync API (unified catalog extraction + session index rebuild)
// ============================================================

export interface SyncProgress {
  phase: 'extracting' | 'indexing';
  total: number;
  completed: number;
  current: string;
  skipped?: number;
  errors?: number;
}

export interface SyncResult {
  totalSessions: number;
  extracted: number;
  skipped: number;
  errors: number;
  indexed: number;
}

/**
 * Sync sessions: extract catalogs then rebuild the session index
 * Returns an SSE stream for progress updates
 *
 * @param options.force - If true, re-extract all sessions (no skipping)
 */
export function syncSessions(
  callbacks: {
    onProgress?: (progress: SyncProgress) => void;
    onComplete?: (result: SyncResult) => void;
    onError?: (error: string) => void;
  },
  options: { force?: boolean } = {}
): { abort: () => void } {
  let aborted = false;

  const url = new URL(`${API_URL}/sync`, window.location.origin);
  if (options.force) {
    url.searchParams.set('force', 'true');
  }

  fetch(url.toString(), {
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      callbacks.onError?.(`Failed to sync: ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'progress') {
            callbacks.onProgress?.(data);
          } else if (currentEvent === 'complete') {
            callbacks.onComplete?.(data);
          } else if (currentEvent === 'error') {
            callbacks.onError?.(data.error);
          }
        }
      }
    }
  }).catch((error) => {
    if (!aborted) {
      callbacks.onError?.(error.message);
    }
  });

  return {
    abort: () => {
      aborted = true;
    },
  };
}

// ============================================================
// Handoff API
// ============================================================

/**
 * Handoff entry from the catalog
 */
export interface HandoffEntry {
  filename: string;
  timestamp: string;
  path: string;
  tokenEstimate: number;
}

/**
 * Handoff content response
 */
export interface HandoffContent {
  filename: string;
  timestamp: string;
  tokenEstimate: number;
  content: string;
}

/**
 * List all handoffs for a project
 */
export async function getProjectHandoffs(encodedPath: string): Promise<{
  directory: string;
  handoffs: HandoffEntry[];
}> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/handoffs`);
  if (!response.ok) {
    throw new Error(`Failed to list handoffs: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get handoff content
 */
export async function getHandoffContent(
  encodedPath: string,
  filename: string
): Promise<HandoffContent> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/handoffs/${encodeURIComponent(filename)}/content`
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Handoff not found');
    }
    throw new Error(`Failed to get handoff content: ${response.statusText}`);
  }
  return response.json();
}
