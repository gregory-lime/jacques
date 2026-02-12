/**
 * HandoffBrowserView Component
 *
 * Browse and select handoff files from .jacques/handoffs/
 * Similar pattern to ObsidianBrowserView.
 */

import React from "react";
import { Box, Text } from "ink";
import type { HandoffEntry } from "@jacques-ai/core";
import { formatHandoffDate, formatTokenEstimate } from "@jacques-ai/core";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  ERROR_COLOR,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";

interface HandoffBrowserViewProps {
  entries: HandoffEntry[];
  selectedIndex: number;
  scrollOffset: number;
  terminalWidth: number;
  loading?: boolean;
  error?: string | null;
}

// Visible items in the scrollable area (reserve lines for header/footer)
const VISIBLE_ITEMS = 6;

export function HandoffBrowserView({
  entries,
  selectedIndex,
  scrollOffset,
  terminalWidth,
  loading = false,
  error = null,
}: HandoffBrowserViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Calculate visible window
  const totalItems = entries.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + VISIBLE_ITEMS < totalItems;

  // Get visible slice
  const visibleItems = entries.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title line with scroll indicator
  if (canScrollUp) {
    contentLines.push(
      <Text key="title">
        <Text bold color={ACCENT_COLOR}>
          Browse Handoffs{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more</Text>
      </Text>
    );
  } else {
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        Browse Handoffs
      </Text>
    );
  }

  // Separator
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"─".repeat(35)}
    </Text>
  );

  // Loading state
  if (loading) {
    contentLines.push(
      <Text key="loading" color={MUTED_TEXT}>
        Loading handoffs...
      </Text>
    );
  }
  // Error state
  else if (error) {
    contentLines.push(
      <Text key="error" color={ERROR_COLOR}>
        ✗ {error}
      </Text>
    );
  }
  // Empty state
  else if (entries.length === 0) {
    contentLines.push(
      <Text key="empty" color={MUTED_TEXT}>
        No handoffs found
      </Text>
    );
    contentLines.push(
      <Text key="hint" color={MUTED_TEXT}>
        Press [h] to generate one
      </Text>
    );
  }
  // Handoff list
  else {
    for (let i = 0; i < visibleItems.length; i++) {
      const entry = visibleItems[i];
      const actualIndex = scrollOffset + i;
      const isSelected = actualIndex === selectedIndex;
      const textColor = isSelected ? ACCENT_COLOR : "white";

      // Format: "2026-01-31 14:30 - Session Handoff (2.1k tokens)"
      const dateStr = formatHandoffDate(entry.timestamp);
      const tokenStr = formatTokenEstimate(entry.tokenEstimate);

      contentLines.push(
        <Text key={entry.filename} color={textColor} bold={isSelected}>
          {isSelected ? "> " : "  "}
          {dateStr}
          <Text color={MUTED_TEXT}> ({tokenStr} tokens)</Text>
        </Text>
      );
    }
  }

  // Scroll down indicator or footer
  if (canScrollDown) {
    contentLines.push(
      <Text key="more" color={MUTED_TEXT}>
        ▼ {totalItems - scrollOffset - VISIBLE_ITEMS} more
      </Text>
    );
  }

  // Pad to fixed height
  while (contentLines.length < FIXED_CONTENT_HEIGHT) {
    contentLines.push(<Box key={`pad-${contentLines.length}`} />);
  }

  const bottomControls = (
    <Text color={MUTED_TEXT}>[Enter] Copy [Esc] Back</Text>
  );

  // Render with layout
  return (
    <Box width={terminalWidth} flexDirection="column">
      {useHorizontalLayout ? (
        <HorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          title="Jacques"
          showVersion={showVersion}
          bottomControls={bottomControls}
        />
      ) : (
        <VerticalLayout
          content={contentLines}
          title="Jacques"
          showVersion={showVersion}
          bottomControls={bottomControls}
        />
      )}
    </Box>
  );
}

export { VISIBLE_ITEMS };
