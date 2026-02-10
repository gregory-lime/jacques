/**
 * SessionsView Component
 *
 * Enhanced session list with status dots, mode pills, context progress,
 * multi-select for tiling, and window management shortcuts.
 */

import React from "react";
import { Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";
import { buildBottomControls } from "../utils/bottom-controls.js";
import { formatTokens } from "../utils/format.js";
import type { Session } from "@jacques/core";

const STATUS_DOTS: Record<string, { icon: string; color: string }> = {
  working: { icon: "\u25C9", color: ACCENT_COLOR },
  tool_use: { icon: "\u25C9", color: ACCENT_COLOR },
  idle: { icon: "\u25CB", color: MUTED_TEXT },
  waiting: { icon: "\u25CE", color: "yellow" },
};

const MODE_COLORS: Record<string, string> = {
  plan: "green",
  planning: "green",
  acceptEdits: ACCENT_COLOR,
  execution: ACCENT_COLOR,
  default: MUTED_TEXT,
  bypass: "red",
};

interface SessionsViewProps {
  sessions: Session[];
  focusedSessionId: string | null;
  selectedIndex: number;
  scrollOffset: number;
  selectedIds: Set<string>;
  terminalWidth: number;
}

export function SessionsView({
  sessions,
  focusedSessionId,
  selectedIndex,
  scrollOffset,
  selectedIds,
  terminalWidth,
}: SessionsViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const allItems: React.ReactNode[] = [];

  if (sessions.length === 0) {
    allItems.push(
      <Text key="empty" color={MUTED_TEXT}>No sessions</Text>
    );
  } else {
    sessions.forEach((session, index) => {
      const isSelected = index === selectedIndex;
      const isFocused = session.session_id === focusedSessionId;
      const isMultiSelected = selectedIds.has(session.session_id);

      // Status
      const statusKey = session.status || "idle";
      const { icon: statusIcon, color: statusColor } = STATUS_DOTS[statusKey] || STATUS_DOTS.idle;

      // Mode
      const mode = session.is_bypass ? "bypass" : (session.mode || "default");
      const modeColor = MODE_COLORS[mode] || MUTED_TEXT;
      const modeLabel = mode === "acceptEdits" ? "edit" : mode;

      // Title
      const project = session.project || "unknown";
      const title = session.session_title;

      // Cursor and selection markers
      const cursor = isSelected ? "\u25B8" : " ";
      const multiMark = isMultiSelected ? "\u2611" : " ";

      // Line 1: cursor + select mark + status dot + status + mode + project/title
      allItems.push(
        <Text key={`s-${index}-line1`} wrap="truncate-end">
          <Text color={isSelected ? ACCENT_COLOR : "white"}>{cursor}</Text>
          <Text color={isMultiSelected ? ACCENT_COLOR : MUTED_TEXT}>{multiMark}</Text>
          <Text> </Text>
          <Text color={statusColor}>{statusIcon}</Text>
          <Text color={statusColor}> {statusKey === "tool_use" ? "working" : statusKey}</Text>
          <Text color={MUTED_TEXT}> </Text>
          <Text color={modeColor}>{modeLabel}</Text>
          <Text color={MUTED_TEXT}> </Text>
          <Text bold={isFocused} color={isSelected ? ACCENT_COLOR : "white"}>
            {project}
          </Text>
          {title && (
            <Text color={MUTED_TEXT}> / {title.length > 20 ? title.substring(0, 17) + "..." : title}</Text>
          )}
        </Text>
      );

      // Line 2: progress bar
      if (session.context_metrics) {
        const m = session.context_metrics;
        const pct = m.used_percentage;
        const maxT = m.context_window_size;
        const curT = Math.round(maxT * (pct / 100));
        const barWidth = 16;
        const filled = Math.round((pct / 100) * barWidth);
        const empty = barWidth - filled;

        allItems.push(
          <Text key={`s-${index}-line2`} wrap="truncate-end">
            {"   "}
            <Text color={ACCENT_COLOR}>{"\u2588".repeat(filled)}</Text>
            <Text color={MUTED_TEXT}>{"\u2591".repeat(empty)}</Text>
            <Text color={ACCENT_COLOR}> {m.is_estimate ? "~" : ""}{pct.toFixed(1)}%</Text>
            <Text color={MUTED_TEXT}> ({formatTokens(curT)}/{formatTokens(maxT)})</Text>
          </Text>
        );
      } else {
        allItems.push(
          <Text key={`s-${index}-line2`} color={MUTED_TEXT} wrap="truncate-end">
            {"   "}{"\u2591".repeat(16)} N/A
          </Text>
        );
      }

      // Spacer between sessions
      allItems.push(<Text key={`s-${index}-spacer`}> </Text>);
    });
  }

  // Layout — controls are in the bottom border only, not in content
  const HEADER_LINES = 2;
  const maxVisibleItems = FIXED_CONTENT_HEIGHT - HEADER_LINES;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisibleItems < allItems.length;

  const visibleItems = allItems.slice(scrollOffset, scrollOffset + maxVisibleItems);

  const contentLines: React.ReactNode[] = [];

  // Header with scroll indicator
  if (canScrollUp) {
    contentLines.push(
      <Text key="header">
        <Text bold color={ACCENT_COLOR}>Sessions ({sessions.length})</Text>
        <Text color={MUTED_TEXT}> \u25B2</Text>
      </Text>
    );
  } else {
    contentLines.push(
      <Text key="header" bold color={ACCENT_COLOR}>
        Sessions{sessions.length > 0 ? ` (${sessions.length})` : ""}
      </Text>
    );
  }
  contentLines.push(<Text key="sep" color={MUTED_TEXT}>{"\u2500".repeat(30)}</Text>);

  contentLines.push(...visibleItems);

  // Scroll down indicator as last content line if needed
  if (canScrollDown) {
    contentLines.push(
      <Text key="scroll-down" color={MUTED_TEXT}>{"\u25BC"} more</Text>
    );
  }

  const { element: bottomControls, width: controlsWidth } = buildBottomControls([
    { key: "Enter", label: " focus " },
    { key: "f", label: " max " },
    { key: "t", label: " tile " },
    { key: "n", label: " new " },
    { key: "Esc", label: "" },
  ]);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
      bottomControlsWidth={controlsWidth}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
    />
  );
}
