/**
 * CompactHeader Component
 *
 * Combines mascot + title + progress + project into 3-line compact header
 */

import React from "react";
import { Text, Box } from "ink";
import { Mascot } from "./Mascot.js";
import { ProgressBar } from "./ProgressBar.js";
import { ACCENT_COLOR, WARNING_COLOR, ERROR_COLOR, SUCCESS_COLOR } from "./layout/theme.js";
import type { Session } from "@jacques/core";

interface CompactHeaderProps {
  version: string;
  session: Session | null;
  connected: boolean;
}

/**
 * Progress bar line with percentage and token counts
 */
function ProgressLine({ session }: { session: Session | null }): React.ReactElement {
  if (!session || !session.context_metrics) {
    return (
      <Box>
        <Text color="gray">{"░".repeat(20)} N/A</Text>
      </Box>
    );
  }

  const metrics = session.context_metrics;
  const percentage = metrics.used_percentage;
  const usedTokens = metrics.total_input_tokens;
  const maxTokens = metrics.context_window_size;

  // Format tokens with K suffix
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return tokens.toString();
  };

  // Color based on percentage (matching plan: green < 50%, yellow 50-70%, red >= 70%)
  let color: string;
  if (percentage >= 70) {
    color = ERROR_COLOR;
  } else if (percentage >= 50) {
    color = WARNING_COLOR;
  } else {
    color = SUCCESS_COLOR;
  }

  return (
    <Box>
      <ProgressBar
        percentage={percentage}
        width={20}
        showLabel={false}
        isEstimate={metrics.is_estimate}
      />
      <Text color={color}>
        {" "}
        {metrics.is_estimate ? "~" : ""}
        {percentage.toFixed(1)}%
      </Text>
      <Text color="gray">
        {" "}
        ({formatTokens(usedTokens)}/{formatTokens(maxTokens)})
      </Text>
    </Box>
  );
}

/**
 * Project and terminal line
 */
function ProjectLine({ session }: { session: Session | null }): React.ReactElement {
  if (!session) {
    return <Text color="gray">No active session</Text>;
  }

  const project = session.project || "unknown";
  const terminal = session.terminal?.term_program || "Terminal";

  // Truncate project name if too long
  const maxProjectLength = 30;
  const truncatedProject =
    project.length > maxProjectLength
      ? project.substring(0, maxProjectLength - 3) + "..."
      : project;

  return (
    <Text>
      {truncatedProject}
      <Text color="gray"> / </Text>
      {terminal}
    </Text>
  );
}

/**
 * Compact 3-line header with mascot on left, content on right
 * Line 1: Mascot hair + "JACQUES Context Manager v0.1.0"
 * Line 2: Mascot face + progress bar + percentage + tokens
 * Line 3: Mascot eyes + "project-name / Terminal"
 */
export function CompactHeader({ version, session, connected }: CompactHeaderProps): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Mascot variant="inline" />
      <Box flexDirection="column" marginLeft={3}>
        <Text bold color={ACCENT_COLOR}>
          JACQUES Context Manager{" "}
          <Text color="gray">v{version}</Text>
        </Text>
        <ProgressLine session={session} />
        <ProjectLine session={session} />
      </Box>
    </Box>
  );
}

export default CompactHeader;
