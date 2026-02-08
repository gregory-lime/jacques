/**
 * LLMWorkingView Component
 *
 * Reusable component for displaying LLM working state.
 * Follows Jacques UI patterns: 10-row height, coral borders, mascot integration.
 *
 * Use this anywhere in the app when an LLM operation is in progress.
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

// Consistent colors from Dashboard
const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";

// Spinner frames for animation
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface LLMWorkingViewProps {
  /** What operation is being performed */
  title: string;
  /** Detailed description of the current step */
  description?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Elapsed time in seconds */
  elapsedSeconds?: number;
  /** Custom status message */
  statusMessage?: string;
}

export function LLMWorkingView({
  title,
  description,
  progress,
  elapsedSeconds,
  statusMessage,
}: LLMWorkingViewProps): React.ReactElement {
  // Animated spinner
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const spinner = SPINNER_FRAMES[spinnerIndex];

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Build content lines (max 10 rows to fit in standard box)
  const contentLines: React.ReactNode[] = [];

  // Line 1: Title with spinner
  contentLines.push(
    <Text key="title" color={ACCENT_COLOR} bold>
      {spinner} {title}
    </Text>
  );

  // Line 2: Empty spacer
  contentLines.push(<Text key="spacer1"> </Text>);

  // Line 3: Description (if provided)
  if (description) {
    contentLines.push(
      <Text key="desc" color={MUTED_TEXT}>
        {description}
      </Text>
    );
  }

  // Line 4: Progress bar (if provided)
  if (progress !== undefined) {
    const filled = Math.round(progress / 5); // 20 chars total
    const empty = 20 - filled;
    contentLines.push(
      <Text key="progress">
        <Text color={ACCENT_COLOR}>{"█".repeat(filled)}</Text>
        <Text color={MUTED_TEXT}>{"░".repeat(empty)}</Text>
        <Text color={MUTED_TEXT}> {progress}%</Text>
      </Text>
    );
  }

  // Line 5: Status message or elapsed time
  if (statusMessage) {
    contentLines.push(
      <Text key="status" color="cyan">
        {statusMessage}
      </Text>
    );
  } else if (elapsedSeconds !== undefined) {
    contentLines.push(
      <Text key="time" color={MUTED_TEXT}>
        Elapsed: {formatTime(elapsedSeconds)}
      </Text>
    );
  }

  // Line 6: Empty spacer
  contentLines.push(<Text key="spacer2"> </Text>);

  // Line 7: Tip
  contentLines.push(
    <Text key="tip" color={MUTED_TEXT} dimColor>
      Press Esc to cancel
    </Text>
  );

  // Pad to 10 lines
  while (contentLines.length < 10) {
    contentLines.push(<Text key={`pad${contentLines.length}`}> </Text>);
  }

  return (
    <Box flexDirection="column">
      {contentLines.map((line, i) => (
        <Box key={i}>{line}</Box>
      ))}
    </Box>
  );
}

export default LLMWorkingView;
