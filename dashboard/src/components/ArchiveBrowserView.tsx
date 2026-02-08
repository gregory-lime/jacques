/**
 * ArchiveBrowserView Component
 *
 * Browse archived conversations grouped by project.
 * Similar pattern to HandoffBrowserView with project expansion.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import type { ConversationManifest } from "@jacques/core";

const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";
const BORDER_COLOR = "#E67E52";
const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

// Visible items in the scrollable area (reserve lines for header/footer)
export const ARCHIVE_VISIBLE_ITEMS = 6;

/**
 * Item in the flattened archive list
 */
export interface ArchiveListItem {
  type: "project" | "conversation";
  key: string;
  /** Unique project identifier (encoded path) for grouping */
  projectId?: string;
  /** Human-readable project name for display */
  projectSlug?: string;
  manifest?: ConversationManifest;
  expanded?: boolean;
  conversationCount?: number;
}

interface ArchiveBrowserViewProps {
  items: ArchiveListItem[];
  selectedIndex: number;
  scrollOffset: number;
  terminalWidth: number;
  loading?: boolean;
  error?: string | null;
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format date as "Jan 31"
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Truncate text to fit within a width
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}

export function ArchiveBrowserView({
  items,
  selectedIndex,
  scrollOffset,
  terminalWidth,
  loading = false,
  error = null,
}: ArchiveBrowserViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Calculate visible window
  const totalItems = items.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + ARCHIVE_VISIBLE_ITEMS < totalItems;

  // Get visible slice
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + ARCHIVE_VISIBLE_ITEMS
  );

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title line with scroll indicator
  if (canScrollUp) {
    contentLines.push(
      <Text key="title">
        <Text bold color={ACCENT_COLOR}>
          Archive Browser{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more</Text>
      </Text>
    );
  } else {
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        Archive Browser
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
        Loading archive...
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
        No archived conversations
      </Text>
    );
    contentLines.push(
      <Text key="hint" color={MUTED_TEXT}>
        Use Settings &gt; Initialize Archive
      </Text>
    );
  }
  // Item list
  else {
    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const actualIndex = scrollOffset + i;
      const isSelected = actualIndex === selectedIndex;
      const textColor = isSelected ? ACCENT_COLOR : "white";

      if (item.type === "project") {
        // Project header
        const expandIcon = item.expanded ? "▼" : "▶";
        contentLines.push(
          <Text key={item.key} color={textColor} bold={isSelected}>
            {isSelected ? "> " : "  "}
            {expandIcon} {item.projectSlug}
            <Text color={MUTED_TEXT}> ({item.conversationCount})</Text>
          </Text>
        );
      } else if (item.manifest) {
        // Conversation entry (indented under project)
        const manifest = item.manifest;
        const date = formatDate(manifest.endedAt);
        const duration = formatDuration(manifest.durationMinutes);
        const title = truncate(manifest.title, 25);

        contentLines.push(
          <Text key={item.key} color={textColor}>
            {isSelected ? "  > " : "    "}
            {title}
            <Text color={MUTED_TEXT}>
              {" "}
              - {date} ({duration}, {manifest.messageCount} msgs)
            </Text>
          </Text>
        );
      }
    }
  }

  // Scroll down indicator or footer
  if (canScrollDown) {
    contentLines.push(
      <Text key="more" color={MUTED_TEXT}>
        ▼ {totalItems - scrollOffset - ARCHIVE_VISIBLE_ITEMS} more
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
        <BrowserVerticalLayout content={contentLines} showVersion={showVersion} />
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
        <Text color={MUTED_TEXT}>
          [↑↓] Navigate [Enter] Expand/View [Esc] Back
        </Text>
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

  // Bottom controls for archive browser
  const bottomControlsText = "[Enter] Expand/View [Esc] Back";
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
        <Text color={MUTED_TEXT}> Expand/View </Text>
        <Text color={ACCENT_COLOR}>[Esc]</Text>
        <Text color={MUTED_TEXT}> Back</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}

/**
 * Build flat list from manifests grouped by project.
 * Projects are collapsed by default.
 * Uses projectId for grouping and expansion tracking, projectSlug for display.
 */
export function buildArchiveList(
  manifestsByProject: Map<string, ConversationManifest[]>,
  expandedProjects: Set<string>
): ArchiveListItem[] {
  const items: ArchiveListItem[] = [];

  // Get entries and sort by projectSlug for display
  const entries = Array.from(manifestsByProject.entries());
  // Sort by projectSlug (derived from first manifest) for human-readable ordering
  entries.sort((a, b) => {
    const slugA = a[1][0]?.projectSlug || a[0];
    const slugB = b[1][0]?.projectSlug || b[0];
    return slugA.localeCompare(slugB);
  });

  for (const [projectId, manifests] of entries) {
    // Get display name from first manifest's projectSlug
    const projectSlug = manifests[0]?.projectSlug || projectId;
    const isExpanded = expandedProjects.has(projectId);

    // Add project header
    items.push({
      type: "project",
      key: `project-${projectId}`,
      projectId,
      projectSlug,
      expanded: isExpanded,
      conversationCount: manifests.length,
    });

    // Add conversations if expanded
    if (isExpanded) {
      for (const manifest of manifests) {
        items.push({
          type: "conversation",
          key: `conv-${manifest.id}`,
          projectId,
          projectSlug,
          manifest,
        });
      }
    }
  }

  return items;
}

export default ArchiveBrowserView;
