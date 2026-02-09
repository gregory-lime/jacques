/**
 * Active Sessions View
 *
 * Displays a scrollable list of active Claude sessions with focus controls.
 * Extracted from Dashboard.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";
import { formatTokens } from "../utils/format.js";
import type { Session } from "@jacques/core";

interface ActiveSessionsViewProps {
  sessions: Session[];
  focusedSessionId: string | null;
  terminalWidth: number;
  scrollOffset?: number;
  selectedIndex?: number;
}

export function ActiveSessionsView({
  sessions,
  focusedSessionId,
  terminalWidth,
  scrollOffset = 0,
  selectedIndex = 0,
}: ActiveSessionsViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  // Sort sessions: focused first, then by registration time
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.session_id === focusedSessionId) return -1;
    if (b.session_id === focusedSessionId) return 1;
    return a.registered_at - b.registered_at;
  });

  // Build all session items first
  const allSessionItems: React.ReactNode[] = [];

  if (sortedSessions.length === 0) {
    allSessionItems.push(<Text color={MUTED_TEXT}>No active sessions</Text>);
  } else {
    sortedSessions.forEach((session, index) => {
      const isSelected = index === selectedIndex;
      const isFocused = session.session_id === focusedSessionId;
      const cursor = isSelected ? "▸ " : "  ";
      allSessionItems.push(
        <Text>
          {cursor}
          {isFocused && <Text color={ACCENT_COLOR} bold>[FOCUS] </Text>}
          <Text bold={isFocused} inverse={isSelected}>
            {session.project || "unknown"}
          </Text>
          <Text color={MUTED_TEXT}>
            {" "}
            / {session.terminal?.term_program || "Terminal"}
          </Text>
        </Text>,
      );
      if (session.context_metrics) {
        const metrics = session.context_metrics;
        const maxTokens = metrics.context_window_size;
        const totalSessionTokens = metrics.total_input_tokens;
        const currentTokens = Math.round(maxTokens * (metrics.used_percentage / 100));
        const showSessionTotal = totalSessionTokens > currentTokens * 1.5;

        allSessionItems.push(
          <Text>
            {"  "}
            <Text color={ACCENT_COLOR}>
              {metrics.is_estimate ? "~" : ""}
              {metrics.used_percentage.toFixed(1)}%
            </Text>
            <Text color={MUTED_TEXT}>
              {" "}
              ({formatTokens(currentTokens)}/{formatTokens(maxTokens)})
              {showSessionTotal && ` • ${formatTokens(totalSessionTokens)} session`}
            </Text>
          </Text>,
        );
      }
      allSessionItems.push(<Box />); // Spacer between sessions
    });
  }

  // Calculate visible window (reserve lines for header and footer)
  const HEADER_LINES = 2; // title + separator
  const FOOTER_LINES = 1; // help text only
  const maxVisibleItems = FIXED_CONTENT_HEIGHT - HEADER_LINES - FOOTER_LINES;

  const totalItems = allSessionItems.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisibleItems < totalItems;

  // Get visible slice of items
  const visibleItems = allSessionItems.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems,
  );

  // Build final content - scroll indicators overlay first/last line
  const contentLines: React.ReactNode[] = [];

  // Title with scroll up indicator overlaid
  if (canScrollUp) {
    contentLines.push(
      <Text>
        <Text bold color={ACCENT_COLOR}>
          Active sessions{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more above</Text>
      </Text>,
    );
  } else {
    contentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Active sessions {sessions.length > 0 && `(${sessions.length})`}
      </Text>,
    );
  }

  contentLines.push(<Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>);

  // Add visible items
  contentLines.push(...visibleItems);

  // Footer with scroll down indicator overlaid
  if (canScrollDown) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▼ more below • [Enter] focus • [Esc] back</Text>,
    );
  } else {
    contentLines.push(<Text color={MUTED_TEXT}>[Enter] focus terminal • [Esc] back</Text>);
  }

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
    />
  );
}
