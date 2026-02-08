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
import { get_encoding, type Tiktoken } from "@dqbd/tiktoken";

// Lazy-loaded tiktoken encoder for cl100k_base (Claude's encoding)
let tiktokenEncoder: Tiktoken | null = null;

/**
 * Get or create the tiktoken encoder.
 * Uses cl100k_base which is the encoding used by Claude models.
 */
function getEncoder(): Tiktoken | null {
  if (tiktokenEncoder === null) {
    try {
      tiktokenEncoder = get_encoding("cl100k_base");
    } catch {
      // Tiktoken not available, will fall back to estimation
      return null;
    }
  }
  return tiktokenEncoder;
}

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
  toolUseID?: string;
  parentToolUseID?: string; // Links agent_progress to parent Task tool call
  data?: {
    type?: string; // "hook_progress", "agent_progress", "bash_progress", "mcp_progress", "query_update", "search_results_received"
    hookEvent?: string; // "SessionStart", "Stop", etc.
    hookName?: string;
    command?: string;
    // agent_progress fields
    message?: {
      type: "user" | "assistant";
      message: { role: string; content: unknown[] };
      uuid: string;
      timestamp: string;
    };
    prompt?: string;
    agentId?: string;
    // bash_progress fields
    output?: string;
    fullOutput?: string;
    elapsedTimeSeconds?: number;
    totalLines?: number;
    // mcp_progress fields
    status?: string;
    serverName?: string;
    toolName?: string;
    // web search fields
    query?: string;
    resultCount?: number;
  };
}

/**
 * Task tool call info for linking to agent_progress entries
 */
export interface TaskToolInfo {
  toolUseId: string;
  subagentType: string; // "Explore", "Plan", "general-purpose", etc.
  description?: string; // Short description
  prompt?: string; // Full prompt given to the agent
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
  | "hook_progress" // Hook execution logs
  | "agent_progress" // Subagent/explore agent calls
  | "bash_progress" // Bash command streaming output
  | "mcp_progress" // MCP tool executions
  | "web_search" // Web search queries and results
  | "turn_duration" // Turn timing info
  | "system_event"
  | "summary"
  | "skip";

export interface ParsedEntry {
  type: ParsedEntryType;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  slug?: string; // Session slug for plan mode (e.g., "transient-hugging-sprout")
  content: ParsedContent;
}

export interface ParsedContent {
  // For user/assistant messages
  text?: string;
  thinking?: string; // Claude's extended thinking/reasoning
  // For tool calls
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string; // Tool use ID for linking to results
  // For tool results
  toolResultId?: string;
  toolResultContent?: string;
  toolUseResult?: Record<string, unknown>; // Structured tool result data (e.g., task.id from TaskCreate)
  // For system events
  eventType?: string;
  eventData?: Record<string, unknown>;
  // For summaries
  summary?: string;
  // For hook progress
  hookEvent?: string; // "SessionStart", "Stop", etc.
  hookName?: string; // Full hook name
  hookCommand?: string; // Command that was executed
  // For agent_progress (subagent/explore calls)
  agentPrompt?: string;
  agentId?: string;
  agentMessageType?: "user" | "assistant";
  agentMessageContent?: unknown[];
  agentType?: string; // Subagent type: "Explore", "Plan", "general-purpose", etc.
  agentDescription?: string; // Short description from Task tool call
  // For bash_progress (streaming output)
  bashOutput?: string;
  bashFullOutput?: string;
  bashElapsedSeconds?: number;
  bashTotalLines?: number;
  // For mcp_progress
  mcpStatus?: string;
  mcpServerName?: string;
  mcpToolName?: string;
  // For web_search (query_update and search_results_received)
  searchType?: "query" | "results";
  searchQuery?: string;
  searchResultCount?: number;
  searchUrls?: Array<{ title: string; url: string }>; // URLs from search results
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
 * Context for parsing - tracks Task tool calls for linking to agent_progress
 */
export interface ParseContext {
  /** Map of tool_use ID to Task tool info */
  taskCalls: Map<string, TaskToolInfo>;
  /** Map of WebSearch tool_use ID to search URLs from results */
  webSearchResults: Map<string, Array<{ title: string; url: string }>>;
}

/**
 * Create empty parse context
 */
function createParseContext(): ParseContext {
  return {
    taskCalls: new Map(),
    webSearchResults: new Map(),
  };
}

/**
 * Parse a JSONL file and return categorized entries.
 */
export async function parseJSONL(filePath: string): Promise<ParsedEntry[]> {
  const content = await fs.readFile(filePath, "utf-8");
  return parseJSONLContent(content);
}

/**
 * Parse JSONL content string and return categorized entries.
 */
export function parseJSONLContent(content: string): ParsedEntry[] {
  const lines = content.split("\n").filter((line) => line.trim());

  const entries: ParsedEntry[] = [];
  const context = createParseContext();
  // Track indices of web_search entries by their toolUseID for post-processing
  const webSearchEntriesByToolId = new Map<string, number>();

  // First pass: categorize all entries
  for (const line of lines) {
    try {
      const rawEntry = JSON.parse(line) as RawEntry;
      // Extract context from this entry (Task calls, WebSearch results)
      extractContextFromEntry(rawEntry, context);
      // Categorize the entry using the context
      const parsed = categorizeEntry(rawEntry, context);
      if (parsed.type !== "skip") {
        // Track web_search entries for post-processing
        // Use parentToolUseID because that links to the original WebSearch tool call
        if (parsed.type === "web_search" && parsed.content.searchType === "results") {
          const rawProgress = rawEntry as RawProgressEntry;
          // parentToolUseID links to the original WebSearch tool call
          // toolUseID is the internal server ID which won't match
          if (rawProgress.parentToolUseID) {
            webSearchEntriesByToolId.set(rawProgress.parentToolUseID, entries.length);
          }
        }
        entries.push(parsed);
      }
    } catch (err) {
      // Skip invalid JSON lines
      console.error("Failed to parse JSONL line:", err);
    }
  }

  // Second pass: link WebSearch URLs to their search_results_received entries
  for (const [toolUseId, urls] of context.webSearchResults) {
    const entryIndex = webSearchEntriesByToolId.get(toolUseId);
    if (entryIndex !== undefined && entries[entryIndex]) {
      entries[entryIndex].content.searchUrls = urls;
    }
  }

  return entries;
}

/**
 * Extract context info from an entry (Task tool calls, WebSearch results)
 */
function extractContextFromEntry(entry: RawEntry, context: ParseContext): void {
  // Extract Task tool calls from assistant entries
  if (entry.type === "assistant") {
    const assistantEntry = entry as RawAssistantEntry;
    const contentBlocks = assistantEntry.message?.content || [];
    for (const block of contentBlocks) {
      if (block.type === "tool_use" && block.name === "Task" && block.id && block.input) {
        const input = block.input as Record<string, unknown>;
        context.taskCalls.set(block.id, {
          toolUseId: block.id,
          subagentType: (input.subagent_type as string) || "unknown",
          description: input.description as string | undefined,
          prompt: input.prompt as string | undefined,
        });
      }
    }
  }

  // Extract WebSearch results from user entries (tool_result with toolUseResult)
  if (entry.type === "user") {
    const userEntry = entry as RawUserEntry & { toolUseResult?: { results?: Array<{ content?: Array<{ title: string; url: string }> }> } };
    if (userEntry.toolUseResult?.results) {
      for (const result of userEntry.toolUseResult.results) {
        if (result.content && Array.isArray(result.content)) {
          // Find the matching tool_result in the message content
          const messageContent = userEntry.message?.content;
          if (Array.isArray(messageContent)) {
            for (const block of messageContent) {
              if (typeof block === "object" && block !== null && "type" in block && block.type === "tool_result" && "tool_use_id" in block) {
                const toolUseId = (block as { tool_use_id: string }).tool_use_id;
                context.webSearchResults.set(toolUseId, result.content);
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Categorize a raw entry into a normalized ParsedEntry.
 * @param entry Raw entry from JSONL
 * @param context Optional parse context with Task calls and WebSearch results
 */
export function categorizeEntry(entry: RawEntry, context?: ParseContext): ParsedEntry {
  // Extract base fields with explicit string types
  const uuid: string = (entry as { uuid?: string }).uuid || "";
  const parentUuid: string | null =
    (entry as RawAssistantEntry).parentUuid ?? null;
  const timestamp: string = (entry as { timestamp?: string }).timestamp || "";
  const sessionId: string = (entry as RawAssistantEntry).sessionId || "";
  const slug: string | undefined = (entry as { slug?: string }).slug;

  switch (entry.type) {
    case "user": {
      // Claude Code CLI user message format
      const userEntry = entry as RawUserEntry;
      const messageContent = userEntry.message?.content;
      const text =
        typeof messageContent === "string"
          ? messageContent
          : extractTextFromBlocks(messageContent as ContentBlock[] | undefined);

      // Preserve toolUseResult for task tracking
      const userEntryWithResult = entry as RawUserEntry & { toolUseResult?: Record<string, unknown> };
      const toolUseResult = userEntryWithResult.toolUseResult;

      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        slug,
        type: "user_message",
        content: { text, toolUseResult },
      };
    }

    case "queue-operation": {
      // Queue management operations - only treat as user message if has actual message
      const queueEntry = entry as RawQueueOperationEntry;
      if (!queueEntry.message) {
        // Skip queue operations without messages (enqueue/popAll)
        return {
          uuid,
          parentUuid,
          timestamp,
          sessionId,
          type: "skip",
          content: {},
        };
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
      const hasToolUse = contentBlocks.some((block) => block.type === "tool_use");

      if (hasToolUse) {
        // Extract tool call info
        const toolBlock = contentBlocks.find((block) => block.type === "tool_use");
        return {
          uuid,
          parentUuid,
          timestamp,
          sessionId,
          type: "tool_call",
          content: {
            toolName: toolBlock?.name,
            toolInput: toolBlock?.input,
            toolUseId: toolBlock?.id, // For linking to tool results
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
      const dataType = progressEntry.data?.type;

      switch (dataType) {
        case "hook_progress":
          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "hook_progress",
            content: {
              hookEvent: progressEntry.data?.hookEvent,
              hookName: progressEntry.data?.hookName,
              hookCommand: progressEntry.data?.command,
            },
          };

        case "agent_progress": {
          // Look up agent type from parent Task tool call
          const parentToolUseId = progressEntry.parentToolUseID;
          const taskInfo = parentToolUseId ? context?.taskCalls.get(parentToolUseId) : undefined;

          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "agent_progress",
            content: {
              agentPrompt: progressEntry.data?.prompt,
              agentId: progressEntry.data?.agentId,
              agentMessageType: progressEntry.data?.message?.type,
              agentMessageContent: progressEntry.data?.message?.message?.content,
              agentType: taskInfo?.subagentType,
              agentDescription: taskInfo?.description,
            },
          };
        }

        case "bash_progress":
          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "bash_progress",
            content: {
              bashOutput: progressEntry.data?.output,
              bashFullOutput: progressEntry.data?.fullOutput,
              bashElapsedSeconds: progressEntry.data?.elapsedTimeSeconds,
              bashTotalLines: progressEntry.data?.totalLines,
            },
          };

        case "mcp_progress":
          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "mcp_progress",
            content: {
              mcpStatus: progressEntry.data?.status,
              mcpServerName: progressEntry.data?.serverName,
              mcpToolName: progressEntry.data?.toolName,
            },
          };

        case "query_update":
          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "web_search",
            content: {
              searchType: "query",
              searchQuery: progressEntry.data?.query,
            },
          };

        case "search_results_received": {
          // URLs are linked in post-processing (see parseJSONLContent)
          return {
            uuid,
            parentUuid,
            timestamp,
            sessionId,
            type: "web_search",
            content: {
              searchType: "results",
              searchQuery: progressEntry.data?.query,
              searchResultCount: progressEntry.data?.resultCount,
            },
          };
        }

        default:
          // Other progress types
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
      return {
        uuid,
        parentUuid,
        timestamp,
        sessionId,
        slug,
        type: "skip",
        content: {},
      };

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
 * Count tokens in text using tiktoken (cl100k_base encoding).
 * Falls back to ~4 characters per token if tiktoken is unavailable.
 *
 * Note: Claude Code JSONL files do NOT accurately record output_tokens
 * (they show 1-4 tokens per entry regardless of actual content).
 * We use tiktoken to get accurate counts from the actual text content.
 */
function countTokens(text: string | undefined): number {
  if (!text) return 0;

  const encoder = getEncoder();
  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch {
      // Fall back to estimation if encoding fails
    }
  }

  // Fallback: ~4 characters per token (rough average for English)
  return Math.ceil(text.length / 4);
}

/**
 * Get statistics from parsed entries.
 *
 * Token stats have two perspectives:
 * - Cumulative totals (totalInputTokens, etc.): Sum across all turns - useful for billing/cost
 * - Last turn tokens (lastInputTokens, etc.): From the final turn - represents actual context window size
 *
 * Note: Claude Code JSONL files do NOT accurately record output_tokens (always shows 1-4).
 * We estimate output tokens from actual text content length using ~4 chars/token.
 */
export function getEntryStatistics(entries: ParsedEntry[]): {
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
  // Cumulative token stats (sum across all turns - for billing)
  totalInputTokens: number;
  totalOutputTokens: number;
  totalOutputTokensEstimated: number; // Estimated from text content
  totalCacheCreation: number;
  totalCacheRead: number;
  // Last turn token stats (actual context window size)
  lastInputTokens: number;
  lastOutputTokens: number;
  lastCacheCreation: number;
  lastCacheRead: number;
  totalCostUSD: number;
  totalDurationMs: number;
  turnCount: number;
} {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let hookEvents = 0;
  let agentCalls = 0;
  let bashProgress = 0;
  let mcpCalls = 0;
  let webSearches = 0;
  let systemEvents = 0;
  let summaries = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalOutputTokensEstimated = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let lastInputTokens = 0;
  let lastOutputTokens = 0;
  let lastCacheCreation = 0;
  let lastCacheRead = 0;
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
        // Estimate output tokens from text content
        // Claude Code JSONL doesn't accurately record output_tokens
        totalOutputTokensEstimated += countTokens(entry.content.text);
        totalOutputTokensEstimated += countTokens(entry.content.thinking);
        break;
      case "tool_call":
        toolCalls++;
        // Tool calls also generate output tokens (tool name + input JSON)
        if (entry.content.toolInput) {
          totalOutputTokensEstimated += countTokens(
            JSON.stringify(entry.content.toolInput)
          );
        }
        break;
      case "hook_progress":
        hookEvents++;
        break;
      case "agent_progress":
        agentCalls++;
        break;
      case "bash_progress":
        bashProgress++;
        break;
      case "mcp_progress":
        mcpCalls++;
        break;
      case "web_search":
        webSearches++;
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

    // Aggregate usage stats from JSONL (input tokens are accurate, output tokens are not)
    if (entry.content.usage) {
      // Cumulative totals
      totalInputTokens += entry.content.usage.inputTokens || 0;
      totalOutputTokens += entry.content.usage.outputTokens || 0;
      totalCacheCreation += entry.content.usage.cacheCreation || 0;
      totalCacheRead += entry.content.usage.cacheRead || 0;

      // Track last turn's tokens (overwrite each time - last one wins)
      lastInputTokens = entry.content.usage.inputTokens || 0;
      lastOutputTokens = entry.content.usage.outputTokens || 0;
      lastCacheCreation = entry.content.usage.cacheCreation || 0;
      lastCacheRead = entry.content.usage.cacheRead || 0;
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
    agentCalls,
    bashProgress,
    mcpCalls,
    webSearches,
    systemEvents,
    summaries,
    totalInputTokens,
    totalOutputTokens,
    totalOutputTokensEstimated,
    totalCacheCreation,
    totalCacheRead,
    lastInputTokens,
    lastOutputTokens,
    lastCacheCreation,
    lastCacheRead,
    totalCostUSD,
    totalDurationMs,
    turnCount,
  };
}
