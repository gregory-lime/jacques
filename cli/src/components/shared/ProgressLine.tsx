/**
 * Context usage progress bar line with percentage and token counts.
 * Extracted from Dashboard.tsx. Previously duplicated in CompactHeader.tsx.
 */

import React from "react";
import { Text } from "ink";
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
      <Text color={MUTED_TEXT} wrap="truncate-end">{"\u2591".repeat(20)} N/A</Text>
    );
  }

  const metrics = session.context_metrics;
  const percentage = metrics.used_percentage;
  const maxTokens = metrics.context_window_size;
  const totalSessionTokens = metrics.total_input_tokens;
  const currentTokens = Math.round(maxTokens * (percentage / 100));
  const showSessionTotal = totalSessionTokens > currentTokens * 1.5;

  const barWidth = 20;
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  return (
    <Text wrap="truncate-end">
      <Text color={ACCENT_COLOR}>{"\u2588".repeat(filled)}</Text>
      <Text color={MUTED_TEXT}>{"\u2591".repeat(empty)}</Text>
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
          {"\u2022"} {formatTokens(totalSessionTokens)} session
        </Text>
      )}
    </Text>
  );
}
