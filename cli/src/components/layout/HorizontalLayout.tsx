/**
 * Horizontal layout with border for wide terminals.
 * Extracted from Dashboard.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../../assets/mascot-ansi.js";
import {
  BORDER_COLOR,
  ACCENT_COLOR,
  MUTED_TEXT,
  MASCOT_WIDTH,
  MIN_CONTENT_WIDTH,
  CONTENT_PADDING,
  FIXED_CONTENT_HEIGHT,
} from "./theme.js";
import { buildBottomControls, MAIN_CONTROLS } from "../../utils/bottom-controls.js";

export interface HorizontalLayoutProps {
  content: React.ReactNode[];
  terminalWidth: number;
  title: string;
  showVersion: boolean;
  sessionCount?: number;
  notification?: string | null;
  /** Custom bottom controls. If omitted, default [Q]uit [P]rojects [W]eb shown. */
  bottomControls?: React.ReactNode;
  /** Character width of bottomControls text for border calculation. */
  bottomControlsWidth?: number;
}

export function HorizontalLayout({
  content,
  terminalWidth,
  title,
  showVersion,
  sessionCount,
  notification,
  bottomControls,
  bottomControlsWidth,
}: HorizontalLayoutProps): React.ReactElement {
  // Calculate dimensions - make fully responsive to terminal width
  const mascotVisualWidth = MASCOT_WIDTH;
  const mascotPadding = 3;
  const mascotDisplayWidth = mascotVisualWidth + mascotPadding;

  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    terminalWidth - mascotDisplayWidth - 3,
  );

  // Split mascot into individual lines for rendering
  const mascotLines = MASCOT_ANSI.split("\n").filter(
    (line) => line.trim().length > 0,
  );

  const mascotHeight = mascotLines.length;
  const totalHeight = FIXED_CONTENT_HEIGHT;
  const mascotTopPadding = Math.floor((totalHeight - mascotHeight) / 2);

  const visibleContent = content.slice(0, totalHeight);

  // Title that crosses the border
  const titlePart = `─ ${title}`;
  const versionPart = showVersion ? ` v0.1.0` : "";
  const titleLength = titlePart.length + versionPart.length;
  const remainingBorder = Math.max(0, terminalWidth - titleLength - 3);

  // Bottom content - either notification or controls
  let bottomTextWidth: number;
  let bottomIsNotification = false;
  let bottomIsError = false;
  let bottomNotificationText = "";

  const { element: defaultControlsElement, width: defaultControlsWidth } = buildBottomControls(MAIN_CONTROLS);

  if (notification) {
    const isError = notification.startsWith("!");
    const cleanMessage = isError ? notification.slice(1) : notification;
    const maxNotificationLength = terminalWidth - 6;
    const truncatedNotification =
      cleanMessage.length > maxNotificationLength
        ? cleanMessage.substring(0, maxNotificationLength - 3) + "..."
        : cleanMessage;
    bottomNotificationText = isError
      ? `✗ ${truncatedNotification}`
      : `✓ ${truncatedNotification}`;
    bottomTextWidth = bottomNotificationText.length;
    bottomIsNotification = true;
    bottomIsError = isError;
  } else if (bottomControls && bottomControlsWidth) {
    bottomTextWidth = bottomControlsWidth;
  } else {
    bottomTextWidth = defaultControlsWidth;
  }

  const totalBottomDashes = Math.max(0, terminalWidth - bottomTextWidth - 2);
  const bottomLeftBorder = Math.max(1, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(1, totalBottomDashes - bottomLeftBorder);

  const boxHeight = totalHeight + 2;

  return (
    <Box flexDirection="column" height={boxHeight} flexShrink={0}>
      {/* Top border with title crossing */}
      <Box>
        <Text color={BORDER_COLOR}>╭</Text>
        <Text color={ACCENT_COLOR}>{titlePart}</Text>
        {showVersion && <Text color={MUTED_TEXT}>{versionPart}</Text>}
        <Text color={BORDER_COLOR}>
          {" "}
          {"─".repeat(remainingBorder)}╮
        </Text>
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
          <Box key={rowIndex} flexDirection="row" height={1}>
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

      {/* Bottom border with notification or controls */}
      <Box>
        <Text color={BORDER_COLOR}>
          ╰{"─".repeat(bottomLeftBorder)}
        </Text>
        {bottomIsNotification ? (
          <Text color={bottomIsError ? "red" : "green"}>{bottomNotificationText}</Text>
        ) : bottomControls ? (
          bottomControls
        ) : (
          defaultControlsElement
        )}
        <Text color={BORDER_COLOR}>
          {"─".repeat(bottomRightBorder)}╯
        </Text>
      </Box>
    </Box>
  );
}
