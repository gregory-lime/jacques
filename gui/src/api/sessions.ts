/**
 * Sessions API
 *
 * Session listing, projects, tasks — hybrid architecture reads JSONL directly.
 */

import { API_URL } from './client';

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
  mode?: 'plan' | 'acceptEdits' | 'default' | 'p-less' | 'planning' | 'execution' | null;
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
    agentType?: string;
    agentDescription?: string;
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
    searchUrls?: Array<{ title: string; url: string }>;
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
      totalInput: number;
      totalOutput: number;
      freshInput?: number;
      cacheCreation?: number;
      cacheRead?: number;
    };
    durationMs?: number;
  };
}

/**
 * A discovered project, grouped by git repo root.
 * Canonical source: @jacques/core DiscoveredProject (core/src/cache/types.ts)
 * Duplicated here because GUI is a browser app and cannot import from core (Node.js APIs).
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

// SessionBadges is defined in ../types — imported for local use and re-exported for barrel consumers
import type { SessionBadges } from '../types';
export type { SessionBadges } from '../types';

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
