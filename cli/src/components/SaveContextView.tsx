/**
 * Save Context View
 *
 * Displays session preview, label input, and save result.
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

export interface SavePreviewData {
  sessionSlug: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  durationMinutes: number;
  filterLabel?: string;
}

export interface SaveSuccessData {
  filename: string;
  filePath: string;
  fileSize: string;
}

interface SaveContextViewProps {
  preview?: SavePreviewData | null;
  label?: string;
  error?: string | null;
  success?: SaveSuccessData | null;
  terminalWidth: number;
  scrollOffset?: number;
}

export function SaveContextView({
  preview,
  label,
  error,
  success,
  terminalWidth,
  scrollOffset = 0,
}: SaveContextViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const allContentLines: React.ReactNode[] = [];

  if (success) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color="green">✓ Saved successfully!</Text>,
      <Box />,
      <Text bold>{success.filename}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Local: .jacques/sessions/</Text>,
      <Text color={MUTED_TEXT}>Global: ~/.jacques/archive/</Text>,
      <Text color={MUTED_TEXT}>Size: {success.fileSize}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>[Enter] or [Esc] to continue</Text>,
    );
  } else if (error) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color="red">✗ {error}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Text color={MUTED_TEXT}>[Esc] Back</Text>,
    );
  } else if (preview) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text>
        <Text color={MUTED_TEXT}>Session: </Text>
        {preview.sessionSlug}
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Messages: </Text>
        {preview.userMessages} user, {preview.assistantMessages} assistant
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Tool calls: </Text>
        {preview.toolCalls}
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Duration: </Text>
        {preview.durationMinutes} min
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Filter: </Text>
        {preview.filterLabel || "Without Tools"}
        <Text color={MUTED_TEXT}> (from Settings)</Text>
      </Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Saves to:</Text>,
      <Text color={MUTED_TEXT}>  • Local: .jacques/sessions/</Text>,
      <Text color={MUTED_TEXT}>  • Global: ~/.jacques/archive/</Text>,
      <Box />,
      <Text>
        <Text color={MUTED_TEXT}>Label (optional): </Text>
        {label || ""}_
      </Text>,
      <Box />,
      <Text color={MUTED_TEXT}>[Enter] Save [Esc] Back</Text>,
    );
  } else {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Loading session data...</Text>,
    );
  }

  // Apply scrolling - calculate visible window
  const HEADER_LINES = 2; // title + separator
  const maxVisibleItems = FIXED_CONTENT_HEIGHT - HEADER_LINES;

  const totalItems = allContentLines.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisibleItems < totalItems;

  // Get visible slice
  const visibleContent = allContentLines.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems
  );

  // Build final content with scroll indicators
  const contentLines: React.ReactNode[] = [];

  // Add scroll-up indicator if needed
  if (canScrollUp) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▲ scroll up</Text>
    );
  }

  contentLines.push(...visibleContent);

  // Add scroll-down indicator if needed
  if (canScrollDown) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▼ scroll down</Text>
    );
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
