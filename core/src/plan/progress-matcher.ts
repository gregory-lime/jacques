/**
 * Progress Matcher
 *
 * Matches task signals to plan items using multiple strategies:
 * 1. Exact text match (confidence 1.0)
 * 2. Keyword overlap via Jaccard similarity (confidence 0.5-0.9)
 * 3. File path match (confidence 0.6)
 * 4. Substring match (confidence 0.4)
 *
 * Confidence is also adjusted by signal source:
 * - task_list: High reliability (explicit task state snapshot)
 * - task_create/task_update: High reliability (direct task management)
 * - todo_write: High reliability (explicit todo tracking)
 * - agent_progress: Medium reliability (inferred from agent description)
 * - bash_progress: Low reliability (heuristic from command output)
 * - file_heuristic: Low reliability (inferred from file changes)
 */

import type { PlanItem, TaskSignal, PlanItemMatch, PlanItemStatus } from "./types.js";
import { calculateSimilarity } from "../archive/plan-extractor.js";
import { normalizeText, extractKeywords } from "./plan-parser.js";

/** Minimum Jaccard similarity for keyword overlap matching */
const MIN_KEYWORD_SIMILARITY = 0.3;

/** Confidence multipliers by signal source */
const SOURCE_CONFIDENCE_MULTIPLIERS: Record<TaskSignal["source"], number> = {
  task_list: 1.0,       // Explicit task state - highest confidence
  task_create: 1.0,     // Direct task management
  task_update: 1.0,     // Direct task management
  todo_write: 1.0,      // Explicit todo tracking
  agent_progress: 0.7,  // Inferred from agent description
  bash_progress: 0.5,   // Heuristic from command output
  file_heuristic: 0.6,  // Inferred from file changes
};

/**
 * Match task signals to plan items.
 * Returns the best match for each plan item (highest confidence).
 * Also matches headings to enable hierarchical propagation.
 */
export function matchSignalsToPlanItems(
  planItems: PlanItem[],
  signals: TaskSignal[]
): Map<string, PlanItemMatch> {
  const matches = new Map<string, PlanItemMatch>();

  // First pass: match all items including headings
  for (const item of planItems) {
    let bestMatch: PlanItemMatch | null = null;

    for (const signal of signals) {
      const match = tryMatch(item, signal);
      if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestMatch = match;
      }
    }

    if (bestMatch) {
      matches.set(item.id, bestMatch);
    }
  }

  // Second pass: propagate matches from parents to children
  propagateParentMatches(planItems, matches);

  return matches;
}

/**
 * Propagate matches from parent items to their children.
 * If a heading/parent is matched, its unmatched children inherit that match.
 */
function propagateParentMatches(
  planItems: PlanItem[],
  matches: Map<string, PlanItemMatch>
): void {
  // Build a map for quick lookup
  const itemMap = new Map<string, PlanItem>();
  for (const item of planItems) {
    itemMap.set(item.id, item);
  }

  // For each item without a match, check if any ancestor has a match
  for (const item of planItems) {
    if (matches.has(item.id)) {
      continue; // Already has a direct match
    }

    // Walk up the parent chain looking for a match
    let parentId = item.parentId;
    while (parentId) {
      const parentMatch = matches.get(parentId);
      if (parentMatch) {
        // Inherit the parent's match with reduced confidence
        matches.set(item.id, {
          ...parentMatch,
          planItemId: item.id,
          confidence: parentMatch.confidence * 0.8, // Reduce confidence for inherited matches
          matchMethod: "keyword_overlap", // Mark as inherited
        });
        break;
      }
      const parent = itemMap.get(parentId);
      parentId = parent?.parentId ?? null;
    }
  }
}

/**
 * Try to match a signal to a plan item using various strategies.
 * Returns the match if successful, null otherwise.
 * Applies source-based confidence multiplier.
 */
function tryMatch(item: PlanItem, signal: TaskSignal): PlanItemMatch | null {
  let match: PlanItemMatch | null = null;

  // Strategy 1: Exact text match
  match = tryExactMatch(item, signal);
  if (match) {
    return applySourceMultiplier(match);
  }

  // Strategy 2: Keyword overlap (Jaccard similarity)
  match = tryKeywordMatch(item, signal);
  if (match) {
    return applySourceMultiplier(match);
  }

  // Strategy 3: Identifier match (CamelCase, file names)
  match = tryIdentifierMatch(item, signal);
  if (match) {
    return applySourceMultiplier(match);
  }

  // Strategy 4: File path match
  if (signal.filePath) {
    match = tryFilePathMatch(item, signal);
    if (match) {
      return applySourceMultiplier(match);
    }
  }

  // Strategy 5: Substring match
  match = trySubstringMatch(item, signal);
  if (match) {
    return applySourceMultiplier(match);
  }

  return null;
}

/**
 * Apply source-based confidence multiplier to a match.
 */
function applySourceMultiplier(match: PlanItemMatch): PlanItemMatch {
  const multiplier = SOURCE_CONFIDENCE_MULTIPLIERS[match.signal.source] ?? 1.0;
  return {
    ...match,
    confidence: Math.min(1.0, match.confidence * multiplier),
  };
}

/**
 * Try exact text match (normalized).
 */
function tryExactMatch(
  item: PlanItem,
  signal: TaskSignal
): PlanItemMatch | null {
  const normalizedItem = normalizeText(item.text);
  const normalizedSignal = normalizeText(signal.text);

  if (normalizedItem === normalizedSignal) {
    return {
      planItemId: item.id,
      signal,
      confidence: 1.0,
      matchMethod: "exact_text",
    };
  }

  return null;
}

/**
 * Try keyword overlap match using Jaccard similarity.
 */
function tryKeywordMatch(
  item: PlanItem,
  signal: TaskSignal
): PlanItemMatch | null {
  const similarity = calculateSimilarity(item.text, signal.text);

  if (similarity >= MIN_KEYWORD_SIMILARITY) {
    // Map similarity (0.3-1.0) to confidence (0.5-0.9)
    const confidence = 0.5 + (similarity - MIN_KEYWORD_SIMILARITY) * (0.4 / (1 - MIN_KEYWORD_SIMILARITY));

    return {
      planItemId: item.id,
      signal,
      confidence: Math.min(0.9, confidence),
      matchMethod: "keyword_overlap",
    };
  }

  return null;
}

/**
 * Try identifier match - match shared CamelCase names or file.ext names.
 * Catches component names (PlanViewerView), file names (index.ts), etc.
 */
function tryIdentifierMatch(
  item: PlanItem,
  signal: TaskSignal
): PlanItemMatch | null {
  const itemIdentifiers = extractIdentifiers(item.text);
  const signalIdentifiers = extractIdentifiers(signal.text);

  // Find shared identifiers
  const shared = itemIdentifiers.filter((id) => signalIdentifiers.includes(id));

  // Need at least one significant shared identifier
  if (shared.length > 0 && shared.some((id) => id.length >= 5)) {
    return {
      planItemId: item.id,
      signal,
      confidence: 0.55,
      matchMethod: "keyword_overlap", // Treat as keyword match type
    };
  }

  return null;
}

/**
 * Extract identifiers from text:
 * - CamelCase names (PlanViewerView, App, Dashboard)
 * - File names with extensions (index.ts, plan-parser.ts)
 * - Hyphenated names (plan-parser, progress-matcher)
 */
function extractIdentifiers(text: string): string[] {
  const identifiers: string[] = [];

  // CamelCase names (at least 2 capitals or one capital followed by lowercase)
  const camelCaseMatches = text.match(/[A-Z][a-zA-Z0-9]+/g) || [];
  identifiers.push(...camelCaseMatches.map((m) => m.toLowerCase()));

  // File names with extensions
  const fileMatches = text.match(/[\w-]+\.(ts|tsx|js|jsx|md|json)/g) || [];
  for (const file of fileMatches) {
    // Add both with and without extension
    identifiers.push(file.toLowerCase());
    identifiers.push(file.replace(/\.[^.]+$/, "").toLowerCase());
  }

  // Hyphenated names
  const hyphenMatches = text.match(/[a-z]+-[a-z]+(-[a-z]+)*/gi) || [];
  identifiers.push(...hyphenMatches.map((m) => m.toLowerCase()));

  return [...new Set(identifiers)]; // Dedupe
}

/**
 * Try file path match - check if file basename appears in plan item text.
 */
function tryFilePathMatch(
  item: PlanItem,
  signal: TaskSignal
): PlanItemMatch | null {
  if (!signal.filePath) {
    return null;
  }

  // Extract the file basename
  const basename = signal.filePath.split(/[/\\]/).pop() || "";
  if (!basename) {
    return null;
  }

  // Remove extension for matching
  const nameWithoutExt = basename.replace(/\.[^.]+$/, "");

  const normalizedItem = normalizeText(item.text);
  const normalizedBasename = normalizeText(nameWithoutExt);

  // Check if the filename (without extension) appears in the item text
  if (normalizedItem.includes(normalizedBasename) && normalizedBasename.length >= 3) {
    return {
      planItemId: item.id,
      signal,
      confidence: 0.6,
      matchMethod: "file_path",
    };
  }

  return null;
}

/**
 * Try substring match - check if core phrases from plan item are in signal.
 */
function trySubstringMatch(
  item: PlanItem,
  signal: TaskSignal
): PlanItemMatch | null {
  const normalizedItem = normalizeText(item.text);
  const normalizedSignal = normalizeText(signal.text);

  // Extract significant phrases (3+ words) from the item
  const words = normalizedItem.split(" ").filter((w) => w.length > 2);

  if (words.length < 2) {
    return null;
  }

  // Try matching consecutive word sequences
  for (let len = Math.min(4, words.length); len >= 2; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      if (phrase.length >= 8 && normalizedSignal.includes(phrase)) {
        return {
          planItemId: item.id,
          signal,
          confidence: 0.4,
          matchMethod: "substring",
        };
      }
    }
  }

  return null;
}

/**
 * Determine the status of a plan item based on its match.
 * Also considers checkboxes marked in the source markdown.
 */
export function determineItemStatus(
  item: PlanItem,
  match: PlanItemMatch | null
): PlanItemStatus {
  // Checkboxes marked in source are always completed
  if (item.isCheckedInSource) {
    return "completed";
  }

  // No match means not started
  if (!match) {
    return "not_started";
  }

  // Use the signal's status
  switch (match.signal.status) {
    case "completed":
      return "completed";
    case "in_progress":
      return "in_progress";
    case "pending":
      return "not_started";
    default:
      return "not_started";
  }
}

/**
 * Check if a plan item is considered trackable for progress.
 */
export function isTrackableForProgress(item: PlanItem): boolean {
  return item.type !== "heading";
}
