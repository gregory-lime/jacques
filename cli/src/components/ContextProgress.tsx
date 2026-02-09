/**
 * ContextProgress Component
 *
 * Simplified progress bar shown below header.
 * Displays context usage percentage and token counts.
 */

import React from "react";
import { Box, Text } from "ink";
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
        <Text color="gray"> No active session</Text>
      </Box>
    );
  }

  const metrics = session.context_metrics;

  if (!metrics) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="gray"> Context: Waiting for data...</Text>
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
    if (pct >= 70) return "red";
    if (pct >= 50) return "yellow";
    return "green";
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
        <Text color="gray">
          {" "}
          ({formatNumber(usedTokens)} / {formatNumber(windowSize)} tokens)
          {isEstimate ? " ~" : ""}
        </Text>
      </Text>

      {/* Progress bar */}
      <Text>
        {"          "}
        <Text color={color}>{filledBar}</Text>
        <Text color="gray">{emptyBar}</Text>
      </Text>
    </Box>
  );
}

export default ContextProgress;
