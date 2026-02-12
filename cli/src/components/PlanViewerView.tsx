/**
 * Plan Viewer View Component
 *
 * Displays the full content of a plan file with:
 * - Scrollable markdown content
 * - Header showing plan title and metadata
 * - Progress header and per-item status indicators
 * - Simple controls
 */

import React from "react";
import { Box, Text } from "ink";
import type { PlanEntry, PlanProgress, PlanItemStatus } from "@jacques-ai/core";
import { dotLine, sectionLine, progressBar } from "./ascii-art/index.js";
import { ACCENT_COLOR, MUTED_TEXT, SUCCESS_COLOR } from "./layout/index.js";

// Number of content lines visible (excluding header/footer)
export const PLAN_VIEWER_VISIBLE_LINES = 15;

// Status indicators
const STATUS_COMPLETED = "✓";
const STATUS_IN_PROGRESS = "~";
const STATUS_NOT_STARTED = "·";

interface PlanViewerViewProps {
  plan: PlanEntry;
  content: string;
  terminalWidth: number;
  terminalHeight: number;
  scrollOffset: number;
  /** Full progress data for per-item status */
  progress?: PlanProgress | null;
  /** Whether progress is still loading */
  progressLoading?: boolean;
}

/**
 * Format a date for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build a map from line number to status based on progress data.
 * Uses heuristics to map plan items to source line numbers.
 */
function buildLineStatusMap(
  content: string,
  progress: PlanProgress | null | undefined
): Map<number, PlanItemStatus> {
  const lineStatusMap = new Map<number, PlanItemStatus>();

  if (!progress) {
    return lineStatusMap;
  }

  // Build a map from item ID to status
  const itemStatusMap = new Map<string, PlanItemStatus>();
  for (const item of progress.items) {
    itemStatusMap.set(item.planItemId, item.status);
  }

  // Parse content lines to find trackable items and match to progress
  const lines = content.split("\n");
  let itemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNumber = i + 1;

    // Skip empty lines, code blocks, tables
    if (trimmed === "" || trimmed.startsWith("```") || trimmed.startsWith("|")) {
      continue;
    }

    // Check for trackable items (lists, checkboxes, numbered items)
    // These correspond to the items tracked by plan-parser.ts
    const isCheckbox = /^[-*]\s+\[[ xX]\]\s+/.test(trimmed);
    const isNumbered = /^\d+\.\s+/.test(trimmed);
    const isBullet = /^[-*]\s+(?!\[)/.test(trimmed);
    const isHeading = /^#{2,6}\s+/.test(trimmed); // Skip top-level headings

    if (isCheckbox || isNumbered || isBullet) {
      // These are trackable - find matching item by index
      // Items are created in document order by plan-parser
      itemIndex++;
      const itemId = `item-${itemIndex}`;
      const status = itemStatusMap.get(itemId);
      if (status) {
        lineStatusMap.set(lineNumber, status);
      }
    } else if (isHeading) {
      // Subsection headings are tracked but not shown with status
      itemIndex++;
    }
  }

  return lineStatusMap;
}

/**
 * Split content into lines with line number tracking
 */
interface ContentLine {
  text: string;
  originalLineNumber: number;
}

function wrapContentWithLineNumbers(content: string, maxWidth: number): ContentLine[] {
  const result: ContentLine[] = [];
  const rawLines = content.split("\n");

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const lineNumber = i + 1;

    if (rawLine.length <= maxWidth) {
      result.push({ text: rawLine, originalLineNumber: lineNumber });
    } else {
      // Word wrap long lines - only first wrapped line gets the line number
      let remaining = rawLine;
      let isFirst = true;
      while (remaining.length > maxWidth) {
        let breakPoint = remaining.lastIndexOf(" ", maxWidth);
        if (breakPoint === -1 || breakPoint < maxWidth / 2) {
          breakPoint = maxWidth;
        }
        result.push({
          text: remaining.slice(0, breakPoint),
          originalLineNumber: isFirst ? lineNumber : -1, // -1 for continuation lines
        });
        remaining = remaining.slice(breakPoint).trimStart();
        isFirst = false;
      }
      if (remaining) {
        result.push({
          text: remaining,
          originalLineNumber: isFirst ? lineNumber : -1,
        });
      }
    }
  }

  return result;
}

/**
 * Render a line of markdown content with basic formatting and status indicator
 */
function renderLineWithStatus(
  line: ContentLine,
  maxWidth: number,
  lineStatusMap: Map<number, PlanItemStatus>,
  statusWidth: number
): React.ReactElement {
  const trimmed = line.text.trimStart();
  const status = line.originalLineNumber > 0 ? lineStatusMap.get(line.originalLineNumber) : undefined;

  // Determine content width (leave space for status if applicable)
  const contentWidth = status ? maxWidth - statusWidth : maxWidth;

  // Render status indicator
  let statusElement: React.ReactElement | null = null;
  if (status) {
    const padding = " ".repeat(statusWidth - 2);
    switch (status) {
      case "completed":
        statusElement = <Text color={SUCCESS_COLOR}>{padding}{STATUS_COMPLETED}</Text>;
        break;
      case "in_progress":
        statusElement = <Text color={ACCENT_COLOR}>{padding}{STATUS_IN_PROGRESS}</Text>;
        break;
      case "not_started":
        statusElement = <Text color={MUTED_TEXT}>{padding}{STATUS_NOT_STARTED}</Text>;
        break;
    }
  }

  // Render content based on type
  let contentElement: React.ReactElement;

  // Heading detection
  if (trimmed.startsWith("# ")) {
    contentElement = (
      <Text bold color={ACCENT_COLOR}>
        {line.text.slice(0, contentWidth)}
      </Text>
    );
  } else if (trimmed.startsWith("## ")) {
    contentElement = (
      <Text bold color="white">
        {line.text.slice(0, contentWidth)}
      </Text>
    );
  } else if (trimmed.startsWith("### ")) {
    contentElement = (
      <Text bold>
        {line.text.slice(0, contentWidth)}
      </Text>
    );
  } else if (trimmed.startsWith("```")) {
    // Code blocks
    contentElement = <Text color={MUTED_TEXT}>{line.text.slice(0, contentWidth)}</Text>;
  } else {
    // Regular text, list items
    contentElement = <Text>{line.text.slice(0, contentWidth)}</Text>;
  }

  return (
    <Box>
      {contentElement}
      {statusElement}
    </Box>
  );
}

export function PlanViewerView({
  plan,
  content,
  terminalWidth,
  terminalHeight,
  scrollOffset,
  progress,
  progressLoading,
}: PlanViewerViewProps): React.ReactElement {
  // Build line status map
  const lineStatusMap = buildLineStatusMap(content, progress);
  const hasProgress = progress !== null && progress !== undefined;
  const statusWidth = hasProgress ? 3 : 0;

  // Wrap content to terminal width
  const contentWidth = Math.min(terminalWidth - 4 - statusWidth, 80);
  const wrappedLines = wrapContentWithLineNumbers(content, contentWidth);
  const totalLines = wrappedLines.length;

  // Calculate visible window
  const visibleLines = Math.min(PLAN_VIEWER_VISIBLE_LINES, terminalHeight - 10);
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + visibleLines < totalLines;

  // Get visible content
  const visibleContent = wrappedLines.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Top border */}
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      {/* Header */}
      <Box marginTop={1} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width={terminalWidth - 2}>
          <Text bold color={ACCENT_COLOR}>
            {plan.title.length > terminalWidth - 20
              ? plan.title.slice(0, terminalWidth - 23) + "..."
              : plan.title}
          </Text>
          <Text color={MUTED_TEXT}>{formatDate(plan.updatedAt)}</Text>
        </Box>

        {/* Progress header */}
        {progressLoading && (
          <Text color={MUTED_TEXT}>Progress: Loading...</Text>
        )}
        {hasProgress && !progressLoading && (
          <Box flexDirection="row">
            <Text color={MUTED_TEXT}>Progress: </Text>
            <Text color={progress.summary.percentage === 100 ? SUCCESS_COLOR : ACCENT_COLOR}>
              {progressBar(progress.summary.percentage, 10)}
            </Text>
            <Text color={MUTED_TEXT}>
              {" "}{progress.summary.completed}/{progress.summary.total} ({progress.summary.percentage}%)
            </Text>
          </Box>
        )}

        <Text color={MUTED_TEXT}>{sectionLine(terminalWidth - 2)}</Text>
      </Box>

      {/* Scroll indicator (up) */}
      {canScrollUp && (
        <Text color={MUTED_TEXT}>
          {"  "}▲ {scrollOffset} lines above
        </Text>
      )}

      {/* Content */}
      <Box flexDirection="column" marginLeft={2} marginTop={canScrollUp ? 0 : 1}>
        {visibleContent.map((line, i) => (
          <Box key={scrollOffset + i}>
            {renderLineWithStatus(line, contentWidth + statusWidth, lineStatusMap, statusWidth)}
          </Box>
        ))}
      </Box>

      {/* Scroll indicator (down) */}
      {canScrollDown && (
        <Text color={MUTED_TEXT}>
          {"  "}▼ {totalLines - scrollOffset - visibleLines} lines below
        </Text>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
      </Box>
      <Text color={MUTED_TEXT}>
        {" "}[↑↓] Scroll   [Esc] Back to Dashboard
      </Text>
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
    </Box>
  );
}
