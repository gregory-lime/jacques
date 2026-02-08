/**
 * Token Estimator
 *
 * Estimates token counts for different filter types using tiktoken.
 * Falls back to character-based estimation if tiktoken unavailable.
 */

import type { ParsedEntry } from "./parser.js";
import type { FilterType } from "./filters.js";

// Lazy-load tiktoken to avoid import errors if unavailable
let tiktokenModule: typeof import("@dqbd/tiktoken") | null = null;
let encoder: any = null;

export interface TokenEstimate {
  current: number; // Tokens in current (full) context
  filtered: number; // Tokens after applying filter
  savings: number; // Difference (current - filtered)
  savingsPercent: number; // (savings / current) * 100
}

export interface FilterTokenEstimates {
  everything: TokenEstimate;
  without_tools: TokenEstimate;
  messages_only: TokenEstimate;
}

/**
 * Initialize tiktoken encoder (lazy-loaded).
 * Returns null if tiktoken unavailable.
 */
async function getEncoder(): Promise<any> {
  if (encoder) return encoder;

  try {
    if (!tiktokenModule) {
      tiktokenModule = await import("@dqbd/tiktoken");
    }
    // Claude uses cl100k_base encoding (same as GPT-4)
    // This is the correct tokenizer for Claude Sonnet/Opus models
    encoder = tiktokenModule.get_encoding("cl100k_base");
    return encoder;
  } catch (err) {
    console.warn("tiktoken unavailable, using character-based estimation:", err);
    return null;
  }
}

/**
 * Count tokens in a string using tiktoken or fallback.
 */
function countTokens(text: string, encoder: any): number {
  if (!text) return 0;

  if (encoder) {
    try {
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (err) {
      console.warn("tiktoken encoding failed, falling back:", err);
    }
  }

  // Fallback: character-based estimation (4 chars per token)
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in a single parsed entry.
 */
export function countEntryTokens(entry: ParsedEntry, encoder: any): number {
  let tokens = 0;

  const { content } = entry;

  // Count text content
  if (content.text) {
    tokens += countTokens(content.text, encoder);
  }

  // Count thinking blocks
  if (content.thinking) {
    tokens += countTokens(content.thinking, encoder);
  }

  // Count tool input (as JSON string)
  if (content.toolInput) {
    const toolInputStr = JSON.stringify(content.toolInput);
    tokens += countTokens(toolInputStr, encoder);
  }

  // Count tool name
  if (content.toolName) {
    tokens += countTokens(content.toolName, encoder);
  }

  // Count tool result content
  if (content.toolResultContent) {
    tokens += countTokens(content.toolResultContent, encoder);
  }

  // Count hook command
  if (content.hookCommand) {
    tokens += countTokens(content.hookCommand, encoder);
  }

  // Count hook event
  if (content.hookEvent) {
    tokens += countTokens(content.hookEvent, encoder);
  }

  // Count event data (as JSON)
  if (content.eventData) {
    const eventDataStr = JSON.stringify(content.eventData);
    tokens += countTokens(eventDataStr, encoder);
  }

  // Count summary
  if (content.summary) {
    tokens += countTokens(content.summary, encoder);
  }

  return tokens;
}

/**
 * Estimate tokens for all filter types.
 */
export async function estimateTokensForFilters(
  entries: ParsedEntry[]
): Promise<FilterTokenEstimates> {
  const encoder = await getEncoder();

  // Import filters dynamically to avoid circular dependency
  const { applyFilter, FilterType } = await import("./filters.js");

  // Count tokens for each filter type
  const countForFilter = (filterType: FilterType): number => {
    const filtered = applyFilter(entries, filterType);
    return filtered.reduce(
      (sum, entry) => sum + countEntryTokens(entry, encoder),
      0
    );
  };

  const currentTokens = countForFilter(FilterType.EVERYTHING);
  const withoutToolsTokens = countForFilter(FilterType.WITHOUT_TOOLS);
  const messagesOnlyTokens = countForFilter(FilterType.MESSAGES_ONLY);

  // Calculate estimates
  const createEstimate = (filteredTokens: number): TokenEstimate => {
    const savings = currentTokens - filteredTokens;
    const savingsPercent =
      currentTokens > 0 ? (savings / currentTokens) * 100 : 0;

    return {
      current: currentTokens,
      filtered: filteredTokens,
      savings,
      savingsPercent,
    };
  };

  return {
    everything: createEstimate(currentTokens),
    without_tools: createEstimate(withoutToolsTokens),
    messages_only: createEstimate(messagesOnlyTokens),
  };
}

/**
 * Format token count as human-readable string.
 * Examples: "1.2k", "45.2k", "123.4k"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}
