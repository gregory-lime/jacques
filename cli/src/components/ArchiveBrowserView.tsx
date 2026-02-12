/**
 * ArchiveBrowserView Component
 *
 * Browse archived conversations grouped by project.
 * Similar pattern to HandoffBrowserView with project expansion.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ConversationManifest } from "@jacques/core";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  ERROR_COLOR,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";
import { buildBottomControls } from "../utils/bottom-controls.js";

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
      <Text key="error" color={ERROR_COLOR}>
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
    contentLines.push(<Text key={`pad-${contentLines.length}`}> </Text>);
  }

  const { element: bottomControls, width: bottomControlsWidth } = buildBottomControls([
    { key: "Enter", label: " Expand/View " },
    { key: "Esc", label: " Back" },
  ]);

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
          bottomControlsWidth={bottomControlsWidth}
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
