/**
 * Session Parser
 *
 * Parses Claude Code JSONL session files.
 * Entry types:
 *   - assistant: Main Claude response
 *   - progress: Sub-agent activity
 *   - queue-operation: User input queued
 *   - system: System events (turn duration)
 *   - summary: Auto-generated session summary
 *   - file-history-snapshot: File state tracking (skipped)
 */

import { promises as fs } from "fs";

// ============================================================
// Raw JSONL Entry Types (from Claude Code)
// ============================================================

export interface RawAssistantEntry {
  type: "assistant";
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  model?: string;
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: ContentBlock[];
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  costUSD?: number;
  durationMs?: number;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  thinking?: string;
  signature?: string; // Thinking signature
}

export interface RawProgressEntry {
  type: "progress";
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  event?: string;
  content?: Record<string, unknown>;
  data?: {
    type?: string; // "hook_progress"
    hookEvent?: string; // "SessionStart", "Stop", etc.
    hookName?: string;
    command?: string;
  };
}

export interface RawQueueOperationEntry {
  type: "queue-operation";
  uuid: string;
  timestamp: string;
  sessionId: string;
  operation?: string;
  message?: {
    role: "user";
    content: string | ContentBlock[];
  };
}

export interface RawUserEntry {
  type: "user";
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
}

export interface RawSystemEntry {
  type: "system";
  uuid: string;
  timestamp: string;
  sessionId: string;
  subtype?: string; // "turn_duration", "stop_hook_summary"
  event?: string;
  durationMs?: number; // For turn_duration
  data?: {
    turnDurationMs?: number;
    totalCostUSD?: number;
    [key: string]: unknown;
  };
}

export interface RawSummaryEntry {
  type: "summary";
  uuid: string;
  timestamp: string;
  sessionId: string;
  summary?: string;
  model?: string;
  version?: string;
}

export interface RawFileHistoryEntry {
  type: "file-history-snapshot";
  uuid: string;
  timestamp: string;
  [key: string]: unknown;
}

export type RawEntry =
  | RawAssistantEntry
  | RawProgressEntry
  | RawQueueOperationEntry
  | RawUserEntry
  | RawSystemEntry
  | RawSummaryEntry
  | RawFileHistoryEntry
  | { type: string; [key: string]: unknown };

// ============================================================
// Parsed Entry Types (normalized for display)
// ============================================================

export type ParsedEntryType =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "hook_progress"  // Hook execution logs (was "subagent_call")
  | "turn_duration"  // Turn timing info
  | "system_event"
  | "summary"
  | "skip";

export interface ParsedEntry {
  type: ParsedEntryType;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  content: ParsedContent;
}

export interface ParsedContent {
  // For user/assistant messages
  text?: string;
  thinking?: string; // Claude's extended thinking/reasoning
  // For tool calls
  toolName?: string;
  toolInput?: Record<string, unknown>;
  // For tool results
  toolResultId?: string;
  toolResultContent?: string;
  // For system events
  eventType?: string;
  eventData?: Record<string, unknown>;
  // For summaries
  summary?: string;
  // For hook progress
  hookEvent?: string;  // "SessionStart", "Stop", etc.
  hookName?: string;   // Full hook name
  hookCommand?: string; // Command that was executed
  // Token usage (from assistant entries)
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  // Cost and duration
  costUSD?: number;
  durationMs?: number;
  // Model info
  model?: string;
}

// ============================================================
// Parser Functions
// ============================================================

/**
 * Parse a JSONL file and return categorized entries.
 */
export async function parseJSONL(filePath: string): Promise<ParsedEntry[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    try {
      const rawEntry = JSON.parse(line) as RawEntry;
      const parsed = categorizeEntry(rawEntry);
      if (parsed.type !== "skip") {
        entries.push(parsed);
      }
    } catch (err) {
      // Skip invalid JSON lines
      console.error("Failed to parse JSONL line:", err);
    }
  }

  return entries;
}

/**
 * Categorize a raw entry into a normalized ParsedEntry.
 */
export function categorizeEntry(entry: RawEntry): ParsedEntry {
  // Extract base fields with explicit string types
  const uuid: string = (entry as { uuid?: string }).uuid || "";
  const parentUuid: string | null = (entry as RawAssistantEntry).parentUuid ?? null;
  const timestamp: string = (entry as { timestamp?: string }).timestamp || "";
  const sessionId: string = (entry as RawAssistantEntry).sessionId || "";

  switch (entry.type) {
    case "user": {
      // Claude Code CLI user message format
      const userEntry = entry as RawUserEntry;
      const messageContent = userEntry.message?.content;
      const text =
        typeof messageContent === "string"
          ? messageContent
          : extractTextFromBlocks(messageContent as ContentBlock[] | undefined);

      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "user_message",
        content: { text },
      };
    }

    case "queue-operation": {
      // Queue management operations - only treat as user message if has actual message
      const queueEntry = entry as RawQueueOperationEntry;
      if (!queueEntry.message) {
        // Skip queue operations without messages (enqueue/popAll)
        return { uuid, parentUuid, timestamp, sessionId, type: "skip", content: {} };
      }
      const messageContent = queueEntry.message.content;
      const text =
        typeof messageContent === "string"
          ? messageContent
          : extractTextFromBlocks(messageContent as ContentBlock[] | undefined);

      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "user_message",
        content: { text },
      };
    }

    case "assistant": {
      const assistantEntry = entry as RawAssistantEntry;
      const message = assistantEntry.message;
      const contentBlocks = message?.content || [];

      // Check if this is a tool call or regular message
      const hasToolUse = contentBlocks.some(
        (block) => block.type === "tool_use"
      );

      if (hasToolUse) {
        // Extract tool call info
        const toolBlock = contentBlocks.find(
          (block) => block.type === "tool_use"
        );
        return {
          uuid,
          parentUuid,
          timestamp,
          sessionId,
          type: "tool_call",
          content: {
            toolName: toolBlock?.name,
            toolInput: toolBlock?.input,
            model: assistantEntry.model || message?.model,
            usage: message?.usage
              ? {
                  inputTokens: message.usage.input_tokens,
                  outputTokens: message.usage.output_tokens,
                  cacheCreation: message.usage.cache_creation_input_tokens,
                  cacheRead: message.usage.cache_read_input_tokens,
                }
              : undefined,
            costUSD: assistantEntry.costUSD,
            durationMs: assistantEntry.durationMs,
          },
        };
      }

      // Regular assistant message - extract text and thinking
      const text = extractTextFromBlocks(contentBlocks);
      const thinking = extractThinkingFromBlocks(contentBlocks);
      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "assistant_message",
        content: {
          text,
          thinking,
          model: assistantEntry.model || message?.model,
          usage: message?.usage
            ? {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                cacheCreation: message.usage.cache_creation_input_tokens,
                cacheRead: message.usage.cache_read_input_tokens,
              }
            : undefined,
          costUSD: assistantEntry.costUSD,
          durationMs: assistantEntry.durationMs,
        },
      };
    }

    case "progress": {
      const progressEntry = entry as RawProgressEntry;
      // Check if this is a hook progress event
      if (progressEntry.data?.type === "hook_progress") {
        return {
          uuid,
          parentUuid,
          timestamp,
          sessionId,
          type: "hook_progress",
          content: {
            hookEvent: progressEntry.data.hookEvent,
            hookName: progressEntry.data.hookName,
            hookCommand: progressEntry.data.command,
          },
        };
      }
      // Other progress types (actual subagent activity)
      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "system_event",
        content: {
          eventType: "progress",
          eventData: progressEntry.content || progressEntry.data,
        },
      };
    }

    case "system": {
      const systemEntry = entry as RawSystemEntry;
      // Handle turn_duration subtype specially
      if (systemEntry.subtype === "turn_duration") {
        return {
          uuid,
          parentUuid,
          timestamp,
          sessionId,
          type: "turn_duration",
          content: {
            durationMs: systemEntry.durationMs,
          },
        };
      }
      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "system_event",
        content: {
          eventType: systemEntry.subtype || systemEntry.event,
          eventData: systemEntry.data,
          durationMs: systemEntry.data?.turnDurationMs,
          costUSD: systemEntry.data?.totalCostUSD,
        },
      };
    }

    case "summary": {
      const summaryEntry = entry as RawSummaryEntry;
      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        type: "summary",
        content: {
          summary: summaryEntry.summary,
          model: summaryEntry.model,
        },
      };
    }

    case "file-history-snapshot":
      return { uuid, parentUuid, timestamp, sessionId, type: "skip", content: {} };

    default:
      // Unknown entry type - skip
      return { uuid, parentUuid, timestamp, sessionId, type: "skip", content: {} };
  }
}

/**
 * Extract text content from content blocks.
 */
function extractTextFromBlocks(blocks?: ContentBlock[]): string {
  if (!blocks) return "";

  return blocks
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Extract thinking content from content blocks.
 */
function extractThinkingFromBlocks(blocks?: ContentBlock[]): string | undefined {
  if (!blocks) return undefined;

  const thinkingBlocks = blocks
    .filter((block) => block.type === "thinking" && block.thinking)
    .map((block) => block.thinking);

  return thinkingBlocks.length > 0 ? thinkingBlocks.join("\n") : undefined;
}

/**
 * Get statistics from parsed entries.
 */
export function getEntryStatistics(entries: ParsedEntry[]): {
  totalEntries: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  hookEvents: number;
  systemEvents: number;
  summaries: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  totalDurationMs: number;
  turnCount: number;
} {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let hookEvents = 0;
  let systemEvents = 0;
  let summaries = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUSD = 0;
  let totalDurationMs = 0;
  let turnCount = 0;

  for (const entry of entries) {
    switch (entry.type) {
      case "user_message":
        userMessages++;
        break;
      case "assistant_message":
        assistantMessages++;
        break;
      case "tool_call":
        toolCalls++;
        break;
      case "hook_progress":
        hookEvents++;
        break;
      case "turn_duration":
        turnCount++;
        if (entry.content.durationMs) {
          totalDurationMs += entry.content.durationMs;
        }
        break;
      case "system_event":
        systemEvents++;
        break;
      case "summary":
        summaries++;
        break;
    }

    // Aggregate usage stats
    if (entry.content.usage) {
      totalInputTokens += entry.content.usage.inputTokens || 0;
      totalOutputTokens += entry.content.usage.outputTokens || 0;
    }
    if (entry.content.costUSD) {
      totalCostUSD += entry.content.costUSD;
    }
  }

  return {
    totalEntries: entries.length,
    userMessages,
    assistantMessages,
    toolCalls,
    hookEvents,
    systemEvents,
    summaries,
    totalInputTokens,
    totalOutputTokens,
    totalCostUSD,
    totalDurationMs,
    turnCount,
  };
}
