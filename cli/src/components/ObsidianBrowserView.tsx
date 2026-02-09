/**
 * ObsidianBrowserView Component
 *
 * File explorer for Obsidian vault with expandable folders.
 * Uses the same bordered layout as the main dashboard.
 */

import React from "react";
import { Box, Text } from "ink";
import type { FlatTreeItem } from "@jacques/core";
import { formatContextFileSize as formatFileSize } from "@jacques/core";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";

interface ObsidianBrowserViewProps {
  vaultName: string;
  items: FlatTreeItem[];
  selectedIndex: number;
  scrollOffset: number;
  terminalWidth: number;
  loading?: boolean;
  error?: string | null;
}

// Visible items in the scrollable area (reserve lines for header/footer)
const VISIBLE_ITEMS = 6;

export function ObsidianBrowserView({
  vaultName,
  items,
  selectedIndex,
  scrollOffset,
  terminalWidth,
  loading = false,
  error = null,
}: ObsidianBrowserViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Calculate visible window
  const totalItems = items.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + VISIBLE_ITEMS < totalItems;

  // Get visible slice
  const visibleItems = items.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title line with vault name
  if (canScrollUp) {
    contentLines.push(
      <Text key="title">
        <Text bold color={ACCENT_COLOR}>
          {vaultName}{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more</Text>
      </Text>
    );
  } else {
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        {vaultName}
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
        Loading files...
      </Text>
    );
  }
  // Error state
  else if (error) {
    contentLines.push(
      <Text key="error" color="#EF4444">
        ✗ {error}
      </Text>
    );
  }
  // Empty state
  else if (items.length === 0) {
    contentLines.push(
      <Text key="empty" color={MUTED_TEXT}>
        No markdown files found
      </Text>
    );
  }
  // File list
  else {
    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const actualIndex = scrollOffset + i;
      const isSelected = actualIndex === selectedIndex;
      const textColor = isSelected ? ACCENT_COLOR : "white";

      // Indentation based on depth
      const indent = "  ".repeat(item.depth);

      // Icon and name
      let icon: string;
      let suffix = "";

      if (item.type === "folder") {
        icon = item.isExpanded ? "▼ " : "▶ ";
        suffix = ` (${item.fileCount})`;
      } else {
        icon = "  ";
      }

      contentLines.push(
        <Text key={item.id} color={textColor} bold={isSelected}>
          {isSelected ? ">" : " "}
          {indent}
          {icon}
          {item.name}
          <Text color={MUTED_TEXT}>{suffix}</Text>
          {item.type === "file" && item.sizeBytes && (
            <Text color={MUTED_TEXT}> • {formatFileSize(item.sizeBytes)}</Text>
          )}
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
    <Text color={MUTED_TEXT}>[Enter] Select [Esc] Back</Text>
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
