/**
 * ContextProgress Component
 *
 * Simplified progress bar shown below header.
 * Displays context usage percentage and token counts.
 */

import React from "react";
import { Box, Text } from "ink";
import { MUTED_TEXT, ERROR_COLOR, WARNING_COLOR, SUCCESS_COLOR } from "./layout/theme.js";
import type { Session } from "@jacques/core";

interface ContextProgressProps {
  session: Session | null;
}

export function ContextProgress({
  session,
}: ContextProgressProps): React.ReactElement {
  if (!session) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color={MUTED_TEXT}> No active session</Text>
      </Box>
    );
  }

  const metrics = session.context_metrics;

  if (!metrics) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color={MUTED_TEXT}> Context: Waiting for data...</Text>
      </Box>
    );
  }

  const percentage = metrics.used_percentage;
  const usedTokens = metrics.total_input_tokens || 0;
  const windowSize = metrics.context_window_size || 200000;
  const isEstimate = metrics.is_estimate ?? false;

  // Format numbers with commas
  const formatNumber = (n: number): string => n.toLocaleString();

  // Determine color based on usage
  const getColor = (pct: number): string => {
    if (pct >= 70) return ERROR_COLOR;
    if (pct >= 50) return WARNING_COLOR;
    return SUCCESS_COLOR;
  };

  const color = getColor(percentage);

  // Build progress bar (50 chars wide)
  const barWidth = 50;
  const filledWidth = Math.round((percentage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const filledBar = "█".repeat(filledWidth);
  const emptyBar = "░".repeat(emptyWidth);

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Context label with percentage and tokens */}
      <Text>
        {"          "}
        <Text color={color}>Context: {percentage.toFixed(1)}%</Text>
        <Text color={MUTED_TEXT}>
          {" "}
          ({formatNumber(usedTokens)} / {formatNumber(windowSize)} tokens)
          {isEstimate ? " ~" : ""}
        </Text>
      </Text>

      {/* Progress bar */}
      <Text>
        {"          "}
        <Text color={color}>{filledBar}</Text>
        <Text color={MUTED_TEXT}>{emptyBar}</Text>
      </Text>
    </Box>
  );
}

export default ContextProgress;
