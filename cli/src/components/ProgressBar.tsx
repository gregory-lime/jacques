/**
 * ProgressBar Component
 *
 * Visual progress bar for context usage with color coding.
 * Green < 60%, Yellow 60-80%, Red >= 80%
 */

import React from "react";
import { Text, Box } from "ink";

interface ProgressBarProps {
  percentage: number;
  width?: number;
  showLabel?: boolean;
  isEstimate?: boolean;
}

export function ProgressBar({
  percentage,
  width = 30,
  showLabel = true,
  isEstimate = false,
}: ProgressBarProps): React.ReactElement {
  // Clamp percentage to 0-100
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((clampedPct / 100) * width);
  const empty = width - filled;

  // Use softer coral color matching mascot (pastel design)
  const color = "#E67E52";
  const emptyColor = "#8B9296";

  const estimatePrefix = isEstimate ? "~" : "";

  return (
    <Box>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={emptyColor}>{"░".repeat(empty)}</Text>
      {showLabel && (
        <Text color={color}>
          {" "}
          {estimatePrefix}
          {clampedPct.toFixed(1)}%
        </Text>
      )}
    </Box>
  );
}

/**
 * Compact progress indicator for session list
 */
interface MiniProgressProps {
  percentage: number | null;
  isEstimate?: boolean;
}

export function MiniProgress({
  percentage,
  isEstimate = false,
}: MiniProgressProps): React.ReactElement {
  if (percentage === null) {
    return <Text color="gray">ctx:?%</Text>;
  }

  // Use softer coral color matching mascot (pastel design)
  const color = "#E67E52";

  const estimatePrefix = isEstimate ? "~" : "";

  return (
    <Text color={color}>
      ctx:{estimatePrefix}
      {percentage.toFixed(0)}%
    </Text>
  );
}

export default ProgressBar;
