/**
 * NotionBrowserView Component
 *
 * Page explorer for Notion workspace with nested pages.
 * Uses the same bordered layout as the main dashboard.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import type { FlatTreeItem } from "@jacques/core";

const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";
const BORDER_COLOR = "#E67E52";
const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

interface NotionBrowserViewProps {
  workspaceName?: string;
  items: FlatTreeItem[];
  selectedIndex: number;
  scrollOffset: number;
  terminalWidth: number;
  loading?: boolean;
  error?: string | null;
}

// Visible items in the scrollable area (reserve lines for header/footer)
export const NOTION_VISIBLE_ITEMS = 6;

export function NotionBrowserView({
  workspaceName,
  items,
  selectedIndex,
  scrollOffset,
  terminalWidth,
  loading = false,
  error = null,
}: NotionBrowserViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Calculate visible window
  const totalItems = items.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + NOTION_VISIBLE_ITEMS < totalItems;

  // Get visible slice
  const visibleItems = items.slice(scrollOffset, scrollOffset + NOTION_VISIBLE_ITEMS);

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title line with workspace name
  const title = workspaceName ? `Notion: ${workspaceName}` : "Notion";
  if (canScrollUp) {
    contentLines.push(
      <Text key="title">
        <Text bold color={ACCENT_COLOR}>
          {title}{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more</Text>
      </Text>
    );
  } else {
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        {title}
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
        Loading pages...
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
        No pages found
      </Text>
    );
  }
  // Page list
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
        // Parent page with children
        icon = item.isExpanded ? "▼ " : "▶ ";
        suffix = ` (${item.fileCount})`;
      } else {
        // Regular page (the name may already include emoji)
        icon = item.name.match(/^[\p{Emoji}]/u) ? "" : "📄 ";
      }

      contentLines.push(
        <Text key={item.id} color={textColor} bold={isSelected}>
          {isSelected ? ">" : " "}
          {indent}
          {icon}
          {item.name}
          <Text color={MUTED_TEXT}>{suffix}</Text>
        </Text>
      );
    }
  }

  // Scroll down indicator or footer
  if (canScrollDown) {
    contentLines.push(
      <Text key="more" color={MUTED_TEXT}>
        ▼ {totalItems - scrollOffset - NOTION_VISIBLE_ITEMS} more
      </Text>
    );
  }

  // Pad to fixed height
  while (contentLines.length < FIXED_CONTENT_HEIGHT) {
    contentLines.push(<Box key={`pad-${contentLines.length}`} />);
  }

  // Render with layout
  return (
    <Box width={terminalWidth} flexDirection="column">
      {useHorizontalLayout ? (
        <BrowserHorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          showVersion={showVersion}
        />
      ) : (
        <BrowserVerticalLayout
          content={contentLines}
          showVersion={showVersion}
        />
      )}
    </Box>
  );
}

interface BrowserLayoutProps {
  content: React.ReactNode[];
  terminalWidth?: number;
  showVersion: boolean;
}

function BrowserVerticalLayout({
  content,
  showVersion,
}: BrowserLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_COLOR}>
        Jacques
        {showVersion && <Text color={MUTED_TEXT}> v0.1.0</Text>}
      </Text>

      <Box marginTop={1}>
        <Text wrap="truncate-end">{MASCOT_ANSI}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {content.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>[↑↓] Navigate [Enter] Select/Expand [Esc] Back</Text>
      </Box>
    </Box>
  );
}

function BrowserHorizontalLayout({
  content,
  terminalWidth = 80,
  showVersion,
}: BrowserLayoutProps): React.ReactElement {
  const mascotVisualWidth = MASCOT_WIDTH;
  const mascotPadding = 3;
  const mascotDisplayWidth = mascotVisualWidth + mascotPadding;

  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    terminalWidth - mascotDisplayWidth - 3
  );

  const mascotLines = MASCOT_ANSI.split("\n").filter(
    (line) => line.trim().length > 0
  );

  const mascotHeight = mascotLines.length;
  const totalHeight = FIXED_CONTENT_HEIGHT;
  const mascotTopPadding = Math.floor((totalHeight - mascotHeight) / 2);

  const visibleContent = content.slice(0, totalHeight);

  const titlePart = "─ Jacques";
  const versionPart = showVersion ? " v0.1.0" : "";
  const titleLength = titlePart.length + versionPart.length;
  const remainingBorder = Math.max(0, terminalWidth - titleLength - 3);

  // Bottom controls for file browser
  const bottomControlsText = "[Enter] Select [Esc] Back";
  const bottomControlsLength = bottomControlsText.length;
  const totalBottomDashes = terminalWidth - bottomControlsLength - 2;
  const bottomLeftBorder = Math.max(0, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(0, totalBottomDashes - bottomLeftBorder);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Box>
        <Text color={BORDER_COLOR}>╭</Text>
        <Text color={ACCENT_COLOR}>{titlePart}</Text>
        {showVersion && <Text color={MUTED_TEXT}>{versionPart}</Text>}
        <Text color={BORDER_COLOR}> {"─".repeat(remainingBorder)}╮</Text>
      </Box>

      {/* Content rows */}
      {Array.from({ length: totalHeight }).map((_, rowIndex) => {
        const mascotLineIndex = rowIndex - mascotTopPadding;
        const mascotLine =
          mascotLineIndex >= 0 && mascotLineIndex < mascotLines.length
            ? mascotLines[mascotLineIndex]
            : "";

        const contentLine = visibleContent[rowIndex];

        return (
          <Box key={rowIndex} flexDirection="row">
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={mascotDisplayWidth}
              justifyContent="center"
              flexShrink={0}
            >
              <Text wrap="truncate-end">{mascotLine}</Text>
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={contentWidth}
              paddingLeft={CONTENT_PADDING}
              paddingRight={CONTENT_PADDING}
              flexShrink={0}
            >
              {contentLine || <Text> </Text>}
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
          </Box>
        );
      })}

      {/* Bottom border with controls */}
      <Box>
        <Text color={BORDER_COLOR}>╰{"─".repeat(bottomLeftBorder)}</Text>
        <Text color={ACCENT_COLOR}>[Enter]</Text>
        <Text color={MUTED_TEXT}> Select </Text>
        <Text color={ACCENT_COLOR}>[Esc]</Text>
        <Text color={MUTED_TEXT}> Back</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}
