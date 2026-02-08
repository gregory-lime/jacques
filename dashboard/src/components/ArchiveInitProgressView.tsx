/**
 * ArchiveInitProgressView Component
 *
 * Progress display during archive initialization.
 * Shows scanning/archiving phase, progress bar, and statistics.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import type { ArchiveProgress, ArchiveInitResult } from "@jacques/core";

const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";
const BORDER_COLOR = "#E67E52";
const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

interface ArchiveInitProgressViewProps {
  progress: ArchiveProgress | null;
  result: ArchiveInitResult | null;
  terminalWidth: number;
}

export function ArchiveInitProgressView({
  progress,
  result,
  terminalWidth,
}: ArchiveInitProgressViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      {result ? "Archive Initialized" : "Initializing Archive"}
    </Text>
  );
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"─".repeat(35)}
    </Text>
  );

  if (result) {
    // Show final results
    contentLines.push(<Box key="spacer1" />);
    contentLines.push(
      <Text key="total" color="white">
        Total sessions found: {result.totalSessions}
      </Text>
    );
    contentLines.push(
      <Text key="archived" color="green">
        Successfully archived: {result.archived}
      </Text>
    );
    if (result.skipped > 0) {
      contentLines.push(
        <Text key="skipped" color={MUTED_TEXT}>
          Already archived: {result.skipped}
        </Text>
      );
    }
    if (result.errors > 0) {
      contentLines.push(
        <Text key="errors" color="#EF4444">
          Errors: {result.errors}
        </Text>
      );
    }
    contentLines.push(<Box key="spacer2" />);
    contentLines.push(
      <Text key="done" color="green" bold>
        Done!
      </Text>
    );
  } else if (progress) {
    // Show progress
    contentLines.push(<Box key="spacer1" />);

    // Phase indicator
    const phaseLabel =
      progress.phase === "scanning" ? "Scanning projects..." : "Archiving...";
    contentLines.push(
      <Text key="phase" color="white">
        {phaseLabel}
      </Text>
    );

    // Progress bar
    if (progress.total > 0) {
      const percent = Math.round((progress.completed / progress.total) * 100);
      const barWidth = 25;
      const filled = Math.round((progress.completed / progress.total) * barWidth);
      const empty = barWidth - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);

      contentLines.push(
        <Text key="progress">
          <Text color={ACCENT_COLOR}>{bar}</Text>
          <Text color={MUTED_TEXT}>
            {" "}
            {progress.completed}/{progress.total} ({percent}%)
          </Text>
        </Text>
      );
    }

    // Current item
    contentLines.push(<Box key="spacer2" />);
    contentLines.push(
      <Text key="current" color={MUTED_TEXT} wrap="truncate">
        {progress.current}
      </Text>
    );

    // Statistics
    if (progress.skipped > 0 || progress.errors > 0) {
      contentLines.push(<Box key="spacer3" />);
      if (progress.skipped > 0) {
        contentLines.push(
          <Text key="skipped" color={MUTED_TEXT}>
            Skipped: {progress.skipped}
          </Text>
        );
      }
      if (progress.errors > 0) {
        contentLines.push(
          <Text key="errors" color="#EF4444">
            Errors: {progress.errors}
          </Text>
        );
      }
    }
  } else {
    // Starting state
    contentLines.push(<Box key="spacer1" />);
    contentLines.push(
      <Text key="starting" color={MUTED_TEXT}>
        Starting...
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
        <ProgressHorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          showVersion={showVersion}
          showEscHint={!!result}
        />
      ) : (
        <ProgressVerticalLayout
          content={contentLines}
          showVersion={showVersion}
          showEscHint={!!result}
        />
      )}
    </Box>
  );
}

interface ProgressLayoutProps {
  content: React.ReactNode[];
  terminalWidth?: number;
  showVersion: boolean;
  showEscHint: boolean;
}

function ProgressVerticalLayout({
  content,
  showVersion,
  showEscHint,
}: ProgressLayoutProps): React.ReactElement {
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
        {showEscHint ? (
          <Text color={MUTED_TEXT}>[Esc] Back</Text>
        ) : (
          <Text color={MUTED_TEXT}>Press Esc to cancel</Text>
        )}
      </Box>
    </Box>
  );
}

function ProgressHorizontalLayout({
  content,
  terminalWidth = 80,
  showVersion,
  showEscHint,
}: ProgressLayoutProps): React.ReactElement {
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

  // Bottom controls
  const bottomControlsText = showEscHint ? "[Esc] Back" : "Press Esc to cancel";
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
        {showEscHint ? (
          <>
            <Text color={ACCENT_COLOR}>[Esc]</Text>
            <Text color={MUTED_TEXT}> Back</Text>
          </>
        ) : (
          <Text color={MUTED_TEXT}>Press Esc to cancel</Text>
        )}
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}

export default ArchiveInitProgressView;
