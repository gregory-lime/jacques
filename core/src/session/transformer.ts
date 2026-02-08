/**
 * Session Transformer
 *
 * Transforms parsed JSONL entries to display-ready SavedContext JSON.
 */

import type { SessionFile } from "./detector.js";
import type { ParsedEntry } from "./parser.js";
import { getEntryStatistics } from "./parser.js";
import type { FilterType } from "./filters.js";

// ============================================================
// SavedContext Types
// ============================================================

export interface SavedContext {
  contextGuardian: {
    version: string;
    savedAt: string;
    sourceFile: string;
    filterApplied?: string;
  };
  session: SessionInfo;
  statistics: SessionStatistics;
  conversation: DisplayMessage[];
}

export interface SessionInfo {
  id: string;
  slug: string;
  startedAt: string;
  endedAt: string;
  claudeCodeVersion?: string;
  model?: string;
  gitBranch?: string;
  workingDirectory?: string;
  summary?: string;
}

export interface SessionStatistics {
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
  turnCount: number;
  tokens?: {
    totalInput: number;
    totalOutput: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  totalDurationMs?: number;
  estimatedCost?: number;
}

export interface DisplayMessage {
  id: string;
  type:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "tool_result"
    | "hook_progress"
    | "agent_progress"
    | "bash_progress"
    | "mcp_progress"
    | "web_search"
    | "turn_duration"
    | "system_event"
    | "error";
  timestamp: string;
  content: MessageContent;
  metadata: MessageMetadata;
}

export interface MessageContent {
  text?: string;
  thinking?: string; // Claude's extended thinking/reasoning
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  summary?: string;
  eventType?: string;
  // Hook progress
  hookEvent?: string;
  hookName?: string;
  hookCommand?: string;
  // Agent progress (subagent/explore calls)
  agentPrompt?: string;
  agentId?: string;
  agentMessageType?: "user" | "assistant";
  agentMessageContent?: unknown[];
  // Bash progress (streaming output)
  bashOutput?: string;
  bashFullOutput?: string;
  bashElapsedSeconds?: number;
  bashTotalLines?: number;
  // MCP progress
  mcpStatus?: string;
  mcpServerName?: string;
  mcpToolName?: string;
  // Web search
  searchType?: "query" | "results";
  searchQuery?: string;
  searchResultCount?: number;
}

export interface MessageMetadata {
  model?: string;
  tokens?: {
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  costUSD?: number;
  durationMs?: number;
  parentId?: string;
}

// ============================================================
// Transform Options
// ============================================================

export interface TransformOptions {
  /** Session file info */
  sessionFile: SessionFile;
  /** Session slug (human-readable name) */
  sessionSlug?: string;
  /** Working directory */
  workingDirectory?: string;
  /** Git branch */
  gitBranch?: string;
  /** User-provided label */
  label?: string;
  /** Filter type applied */
  filterType?: FilterType;
}

// ============================================================
// Transformer
// ============================================================

const CONTEXT_GUARDIAN_VERSION = "1.0.0";

/**
 * Transform parsed entries to SavedContext format.
 */
export function transformToSavedContext(
  entries: ParsedEntry[],
  options: TransformOptions
): SavedContext {
  const { sessionFile, sessionSlug, workingDirectory, gitBranch, filterType } =
    options;

  // Get statistics
  const stats = getEntryStatistics(entries);

  // Find session boundaries
  const timestamps = entries
    .map((e) => e.timestamp)
    .filter((t) => t)
    .sort();
  const startedAt = timestamps[0] || new Date().toISOString();
  const endedAt = timestamps[timestamps.length - 1] || startedAt;

  // Find model from first assistant entry
  const firstAssistant = entries.find(
    (e) => e.type === "assistant_message" || e.type === "tool_call"
  );
  const model = firstAssistant?.content.model;

  // Find summary from summary entries
  const summaryEntry = entries.find((e) => e.type === "summary");
  const summary = summaryEntry?.content.summary;

  // Transform entries to display messages
  const conversation = entries
    .filter((e) => e.type !== "skip" && e.type !== "system_event")
    .map((entry) => transformEntry(entry));

  return {
    contextGuardian: {
      version: CONTEXT_GUARDIAN_VERSION,
      savedAt: new Date().toISOString(),
      sourceFile: sessionFile.filePath,
      filterApplied: filterType,
    },
    session: {
      id: sessionFile.sessionId,
      slug: sessionSlug || sessionFile.sessionId.substring(0, 8),
      startedAt,
      endedAt,
      model,
      gitBranch,
      workingDirectory,
      summary,
    },
    statistics: {
      totalEntries: stats.totalEntries,
      userMessages: stats.userMessages,
      assistantMessages: stats.assistantMessages,
      toolCalls: stats.toolCalls,
      hookEvents: stats.hookEvents,
      agentCalls: stats.agentCalls,
      bashProgress: stats.bashProgress,
      mcpCalls: stats.mcpCalls,
      webSearches: stats.webSearches,
      systemEvents: stats.systemEvents,
      turnCount: stats.turnCount,
      tokens:
        stats.totalInputTokens > 0 || stats.totalOutputTokens > 0
          ? {
              totalInput: stats.totalInputTokens,
              totalOutput: stats.totalOutputTokens,
              cacheCreation: stats.totalCacheCreation > 0 ? stats.totalCacheCreation : undefined,
              cacheRead: stats.totalCacheRead > 0 ? stats.totalCacheRead : undefined,
            }
          : undefined,
      totalDurationMs:
        stats.totalDurationMs > 0 ? stats.totalDurationMs : undefined,
      estimatedCost: stats.totalCostUSD > 0 ? stats.totalCostUSD : undefined,
    },
    conversation,
  };
}

/**
 * Transform a single parsed entry to a display message.
 */
function transformEntry(entry: ParsedEntry): DisplayMessage {
  return {
    id: entry.uuid,
    type: entry.type as DisplayMessage["type"],
    timestamp: entry.timestamp,
    content: {
      text: entry.content.text,
      thinking: entry.content.thinking,
      toolName: entry.content.toolName,
      toolInput: entry.content.toolInput,
      toolResult: entry.content.toolResultContent,
      summary: entry.content.summary,
      eventType: entry.content.eventType,
      // Hook progress
      hookEvent: entry.content.hookEvent,
      hookName: entry.content.hookName,
      hookCommand: entry.content.hookCommand,
      // Agent progress
      agentPrompt: entry.content.agentPrompt,
      agentId: entry.content.agentId,
      agentMessageType: entry.content.agentMessageType,
      agentMessageContent: entry.content.agentMessageContent,
      // Bash progress
      bashOutput: entry.content.bashOutput,
      bashFullOutput: entry.content.bashFullOutput,
      bashElapsedSeconds: entry.content.bashElapsedSeconds,
      bashTotalLines: entry.content.bashTotalLines,
      // MCP progress
      mcpStatus: entry.content.mcpStatus,
      mcpServerName: entry.content.mcpServerName,
      mcpToolName: entry.content.mcpToolName,
      // Web search
      searchType: entry.content.searchType,
      searchQuery: entry.content.searchQuery,
      searchResultCount: entry.content.searchResultCount,
    },
    metadata: {
      model: entry.content.model,
      tokens: entry.content.usage
        ? {
            input: entry.content.usage.inputTokens,
            output: entry.content.usage.outputTokens,
            cacheCreation: entry.content.usage.cacheCreation,
            cacheRead: entry.content.usage.cacheRead,
          }
        : undefined,
      costUSD: entry.content.costUSD,
      durationMs: entry.content.durationMs,
      parentId: entry.parentUuid || undefined,
    },
  };
}

/**
 * Get a preview of the session for the save dialog.
 */
export function getSessionPreview(
  entries: ParsedEntry[],
  sessionSlug: string
): {
  sessionSlug: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  durationMinutes: number;
} {
  const stats = getEntryStatistics(entries);

  // Calculate duration from timestamps
  const timestamps = entries
    .map((e) => e.timestamp)
    .filter((t) => t)
    .sort();
  const startTime = timestamps[0] ? new Date(timestamps[0]).getTime() : 0;
  const endTime = timestamps[timestamps.length - 1]
    ? new Date(timestamps[timestamps.length - 1]).getTime()
    : startTime;
  const durationMs = endTime - startTime;
  const durationMinutes = Math.round(durationMs / 1000 / 60);

  return {
    sessionSlug,
    messageCount: stats.userMessages + stats.assistantMessages,
    userMessages: stats.userMessages,
    assistantMessages: stats.assistantMessages,
    toolCalls: stats.toolCalls,
    durationMinutes,
  };
}
