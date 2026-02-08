/**
 * Context Filters
 *
 * Filtering logic for saving contexts with different levels of detail.
 */

import type { ParsedEntry } from "./parser.js";

export enum FilterType {
  EVERYTHING = "everything",
  WITHOUT_TOOLS = "without_tools",
  MESSAGES_ONLY = "messages_only",
}

export interface FilterConfig {
  type: FilterType;
  label: string;
  suffix: string;
  description: string;
}

export const FILTER_CONFIGS: Record<FilterType, FilterConfig> = {
  [FilterType.EVERYTHING]: {
    type: FilterType.EVERYTHING,
    label: "Everything",
    suffix: "_full",
    description: "Full context with all data",
  },
  [FilterType.WITHOUT_TOOLS]: {
    type: FilterType.WITHOUT_TOOLS,
    label: "Without Tools",
    suffix: "_no-tools",
    description: "Remove tool calls and results",
  },
  [FilterType.MESSAGES_ONLY]: {
    type: FilterType.MESSAGES_ONLY,
    label: "Messages Only",
    suffix: "_messages",
    description: "Just conversational text, no code/tools/thinking",
  },
};

/**
 * Check if an entry should be included based on filter type.
 */
export function shouldIncludeEntry(
  entry: ParsedEntry,
  filterType: FilterType
): boolean {
  switch (filterType) {
    case FilterType.EVERYTHING:
      // Include everything
      return true;

    case FilterType.WITHOUT_TOOLS:
      // Exclude tool calls and tool results
      if (entry.type === "tool_call" || entry.type === "tool_result") {
        return false;
      }
      return true;

    case FilterType.MESSAGES_ONLY:
      // Only include user and assistant messages
      return (
        entry.type === "user_message" || entry.type === "assistant_message"
      );

    default:
      return true;
  }
}

/**
 * Strip markdown code blocks from text.
 * Removes ```language...``` blocks but keeps inline `code`.
 */
function stripCodeBlocks(text: string): string {
  if (!text) return text;

  // Remove fenced code blocks (```...```)
  // This regex matches:
  // - ``` followed by optional language
  // - Any content (non-greedy)
  // - Closing ```
  return text.replace(/```[\s\S]*?```/g, "[code removed]");
}

/**
 * Clean an entry for "Messages Only" filter.
 * Removes thinking blocks and code blocks from text.
 */
export function cleanForMessagesOnly(entry: ParsedEntry): ParsedEntry {
  // Clone the entry to avoid mutation
  const cloned: ParsedEntry = {
    ...entry,
    content: { ...entry.content },
  };

  // Remove thinking field
  delete cloned.content.thinking;

  // Strip code blocks from text
  if (cloned.content.text) {
    cloned.content.text = stripCodeBlocks(cloned.content.text);
  }

  return cloned;
}

/**
 * Apply a filter to a list of entries.
 */
export function applyFilter(
  entries: ParsedEntry[],
  filterType: FilterType
): ParsedEntry[] {
  // Filter entries based on type
  let filtered = entries.filter((entry) =>
    shouldIncludeEntry(entry, filterType)
  );

  // Clean entries for "Messages Only" filter
  if (filterType === FilterType.MESSAGES_ONLY) {
    filtered = filtered.map((entry) => cleanForMessagesOnly(entry));
  }

  return filtered;
}
