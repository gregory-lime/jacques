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
}

export interface MessageMetadata {
  model?: string;
  tokens?: {
    input: number;
    output: number;
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
      systemEvents: stats.systemEvents,
      turnCount: stats.turnCount,
      tokens:
        stats.totalInputTokens > 0 || stats.totalOutputTokens > 0
          ? {
              totalInput: stats.totalInputTokens,
              totalOutput: stats.totalOutputTokens,
            }
          : undefined,
      totalDurationMs: stats.totalDurationMs > 0 ? stats.totalDurationMs : undefined,
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
      hookEvent: entry.content.hookEvent,
      hookName: entry.content.hookName,
      hookCommand: entry.content.hookCommand,
    },
    metadata: {
      model: entry.content.model,
      tokens: entry.content.usage
        ? {
            input: entry.content.usage.inputTokens,
            output: entry.content.usage.outputTokens,
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
