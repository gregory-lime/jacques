/**
 * ArchiveInitProgressView Component
 *
 * Progress display during archive initialization.
 * Shows scanning/archiving phase, progress bar, and statistics.
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
import type { ArchiveProgress, ArchiveInitResult } from "@jacques/core";

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

  const bottomControls = result ? (
    <>
      <Text color={ACCENT_COLOR}>[Esc]</Text>
      <Text color={MUTED_TEXT}> Back</Text>
    </>
  ) : (
    <Text color={MUTED_TEXT}>Press Esc to cancel</Text>
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

export default ArchiveInitProgressView;
