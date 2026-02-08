/**
 * Plan Parser
 *
 * Parses plan markdown into structured trackable items.
 * Handles headings, numbered lists, bullets, and checkboxes.
 */

import type { PlanItem, ParsedPlan } from "./types.js";

/**
 * Parse plan markdown content into structured items.
 *
 * Trackable items:
 * - Numbered items (1., 2., etc.)
 * - Bullet items (-, *)
 * - Checkbox items (- [ ], - [x])
 * - Subsection headings (##, ###)
 *
 * Skipped:
 * - Top-level # title
 * - Code blocks (``` fences)
 * - Plain paragraphs
 * - Tables
 */
export function parsePlanMarkdown(content: string): ParsedPlan {
  const lines = content.split("\n");
  const items: PlanItem[] = [];
  const lineToItem = new Map<number, PlanItem>();

  let inCodeBlock = false;
  let itemCounter = 0;
  const depthStack: { id: string; depth: number }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1; // 1-indexed

    // Track code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip content inside code blocks
    if (inCodeBlock) {
      continue;
    }

    // Skip empty lines
    if (line.trim() === "") {
      continue;
    }

    // Try to parse the line as a trackable item
    const parsed = parseLine(line, lineNumber, ++itemCounter);
    if (!parsed) {
      continue;
    }

    // Skip top-level heading (depth 0) - it's just the title
    if (parsed.type === "heading" && parsed.depth === 0) {
      itemCounter--; // Don't count it
      continue;
    }

    // Determine parent based on depth
    while (
      depthStack.length > 0 &&
      depthStack[depthStack.length - 1].depth >= parsed.depth
    ) {
      depthStack.pop();
    }

    const parentId =
      depthStack.length > 0 ? depthStack[depthStack.length - 1].id : null;
    parsed.parentId = parentId;

    // Update parent's childIds
    if (parentId) {
      const parent = items.find((item) => item.id === parentId);
      if (parent) {
        parent.childIds.push(parsed.id);
      }
    }

    // Push to stack for nesting
    depthStack.push({ id: parsed.id, depth: parsed.depth });

    items.push(parsed);
    lineToItem.set(lineNumber, parsed);
  }

  // Count trackable items (items that represent actual work, not just structure)
  const trackableCount = items.filter((item) => isTrackableItem(item)).length;

  return {
    items,
    trackableCount,
    lineToItem,
  };
}

/**
 * Parse a single line into a PlanItem if it's a trackable item.
 * Returns null if the line is not a trackable item.
 */
function parseLine(
  line: string,
  lineNumber: number,
  itemNumber: number
): PlanItem | null {
  const trimmed = line.trim();

  // Skip table lines
  if (trimmed.startsWith("|") || /^[-:|]+$/.test(trimmed)) {
    return null;
  }

  // Skip blockquotes
  if (trimmed.startsWith(">")) {
    return null;
  }

  // Check for heading (## or deeper)
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const depth = headingMatch[1].length - 1; // # = 0, ## = 1, etc.
    const text = headingMatch[2].trim();

    return {
      id: `item-${itemNumber}`,
      text,
      depth,
      type: "heading",
      lineNumber,
      parentId: null,
      childIds: [],
      isCheckedInSource: false,
    };
  }

  // Calculate indentation for list items
  const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
  const indentDepth = Math.floor(leadingSpaces / 2); // 2 spaces per indent level

  // Check for checkbox (- [ ] or - [x] or * [ ] or * [x])
  const checkboxMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (checkboxMatch) {
    const isChecked = checkboxMatch[1].toLowerCase() === "x";
    const text = checkboxMatch[2].trim();

    return {
      id: `item-${itemNumber}`,
      text,
      depth: 3 + indentDepth, // Base depth 3 for list items
      type: "checkbox",
      lineNumber,
      parentId: null,
      childIds: [],
      isCheckedInSource: isChecked,
    };
  }

  // Check for numbered item (1., 2., etc.)
  const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numberedMatch) {
    const text = numberedMatch[2].trim();

    return {
      id: `item-${itemNumber}`,
      text,
      depth: 3 + indentDepth,
      type: "numbered",
      lineNumber,
      parentId: null,
      childIds: [],
      isCheckedInSource: false,
    };
  }

  // Check for bullet item (- or *)
  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) {
    const text = bulletMatch[1].trim();

    return {
      id: `item-${itemNumber}`,
      text,
      depth: 3 + indentDepth,
      type: "bullet",
      lineNumber,
      parentId: null,
      childIds: [],
      isCheckedInSource: false,
    };
  }

  // Not a trackable item
  return null;
}

/**
 * Determine if an item represents actual trackable work.
 * Headings are structural; lists and checkboxes are trackable.
 */
function isTrackableItem(item: PlanItem): boolean {
  return item.type !== "heading";
}

/**
 * Normalize text for comparison.
 * Lowercase, remove extra whitespace, remove punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract keywords from text (words > 3 chars).
 */
export function extractKeywords(text: string): Set<string> {
  const normalized = normalizeText(text);
  return new Set(normalized.split(" ").filter((w) => w.length > 3));
}
