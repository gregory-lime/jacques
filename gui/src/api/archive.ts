/**
 * Archive API
 *
 * Archived conversations, subagents, search.
 */

import { API_URL, streamSSE } from './client';

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
  return streamSSE<ArchiveProgress, ArchiveInitResult>(
    '/archive/initialize',
    callbacks,
    {
      queryParams: options.force ? { force: 'true' } : undefined,
      errorPrefix: 'Failed to initialize archive',
    }
  );
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
