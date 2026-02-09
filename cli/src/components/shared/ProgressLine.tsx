/**
 * Context usage progress bar line with percentage and token counts.
 * Extracted from Dashboard.tsx. Previously duplicated in CompactHeader.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import { ProgressBar } from "../ProgressBar.js";
import { ACCENT_COLOR, MUTED_TEXT } from "../layout/theme.js";
import { formatTokens } from "../../utils/format.js";
import type { Session } from "@jacques/core";

export function ProgressLine({
  session,
}: {
  session: Session | null;
}): React.ReactElement {
  if (!session || !session.context_metrics) {
    return (
      <Box>
        <Text color={MUTED_TEXT}>{"░".repeat(20)} N/A</Text>
      </Box>
    );
  }

  const metrics = session.context_metrics;
  const percentage = metrics.used_percentage;
  const maxTokens = metrics.context_window_size;
  const totalSessionTokens = metrics.total_input_tokens;
  const currentTokens = Math.round(maxTokens * (percentage / 100));
  const showSessionTotal = totalSessionTokens > currentTokens * 1.5;

  return (
    <Box>
      <ProgressBar
        percentage={percentage}
        width={20}
        showLabel={false}
        isEstimate={metrics.is_estimate}
      />
      <Text color={ACCENT_COLOR}>
        {" "}
        {metrics.is_estimate ? "~" : ""}
        {percentage.toFixed(1)}%
      </Text>
      <Text color={MUTED_TEXT}>
        {" "}
        ({formatTokens(currentTokens)}/{formatTokens(maxTokens)})
      </Text>
      {showSessionTotal && (
        <Text color={MUTED_TEXT}>
          {" "}
          • {formatTokens(totalSessionTokens)} session
        </Text>
      )}
    </Box>
  );
}
