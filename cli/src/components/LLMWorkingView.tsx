/**
 * LLM Working View
 *
 * Displays LLM operation progress with spinner, streaming text preview,
 * and token counts. Handles its own layout (horizontal/vertical).
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "./layout/index.js";
import { formatTokens, formatElapsedTime } from "../utils/format.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface LLMWorkingViewProps {
  title: string;
  description?: string;
  elapsedSeconds?: number;
  streamingText?: string;
  inputTokens?: number;
  outputTokens?: number;
  currentStage?: string;
  terminalWidth: number;
}

export function LLMWorkingView({
  title,
  description,
  elapsedSeconds,
  streamingText = "",
  inputTokens = 0,
  outputTokens = 0,
  currentStage = "",
  terminalWidth,
}: LLMWorkingViewProps): React.ReactElement {
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const contentLines: React.ReactNode[] = [];

  // Line 1: Title with spinner and token counts
  const hasTokens = inputTokens > 0 || outputTokens > 0;
  contentLines.push(
    <Text key="title">
      <Text color={ACCENT_COLOR} bold>
        {SPINNER_FRAMES[spinnerIndex]} {title}
      </Text>
      {hasTokens && (
        <Text color={MUTED_TEXT}>
          {" "}| {formatTokens(inputTokens)} in / {formatTokens(outputTokens)} out
        </Text>
      )}
    </Text>
  );

  // Line 2: Empty spacer
  contentLines.push(<Text key="spacer1"> </Text>);

  // Line 3: Current stage or description
  const displayStage = currentStage || description || "";
  contentLines.push(
    <Text key="stage" color={displayStage ? MUTED_TEXT : undefined}>
      {displayStage || " "}
    </Text>
  );

  // Lines 4-6: Live streaming output preview (last 3 lines)
  if (streamingText.length > 0) {
    const streamLines = streamingText.split("\n").filter(l => l.trim());
    const lastLines = streamLines.slice(-3);
    const maxLineWidth = Math.min(50, terminalWidth - 20);

    lastLines.forEach((line, i) => {
      const truncatedLine = line.length > maxLineWidth
        ? line.substring(0, maxLineWidth - 3) + "..."
        : line;
      contentLines.push(
        <Text key={`stream${i}`} color={MUTED_TEXT}>
          {truncatedLine}
        </Text>
      );
    });

    // Pad to have 3 streaming lines
    while (contentLines.length < 6) {
      contentLines.push(<Text key={`streampad${contentLines.length}`}> </Text>);
    }
  } else {
    contentLines.push(<Text key="spacer2"> </Text>);
    contentLines.push(<Text key="spacer3"> </Text>);
    contentLines.push(<Text key="spacer4"> </Text>);
  }

  // Line 7: Stats line (elapsed time and char count)
  const statsLine = [];
  if (elapsedSeconds !== undefined) {
    statsLine.push(`Elapsed: ${formatElapsedTime(elapsedSeconds)}`);
  }
  if (streamingText.length > 0) {
    statsLine.push(`${streamingText.length.toLocaleString()} chars`);
  }
  contentLines.push(
    <Text key="stats" color={MUTED_TEXT}>
      {statsLine.join(" | ") || " "}
    </Text>
  );

  // Line 8: Empty spacer
  contentLines.push(<Text key="spacer6"> </Text>);

  // Line 9: Tip
  contentLines.push(
    <Text key="tip" color={MUTED_TEXT} dimColor>
      Press Esc to cancel
    </Text>
  );

  // Pad to 10 lines
  while (contentLines.length < 10) {
    contentLines.push(<Text key={`pad${contentLines.length}`}> </Text>);
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
