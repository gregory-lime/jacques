/**
 * SessionDetails Component
 *
 * Displays detailed information about the focused session.
 * Shows title, model, project, context usage, auto-compact status, and warnings.
 */

import React from "react";
import { Box, Text } from "ink";
import { ProgressBar } from "./ProgressBar.js";
import { formatTokens } from "../utils/format.js";
import { ACCENT_COLOR, WARNING_COLOR, ERROR_COLOR, SUCCESS_COLOR } from "./layout/theme.js";
import { formatSessionTitle } from "@jacques-ai/core";
import type { Session, AutoCompactStatus } from "@jacques-ai/core";

interface SessionDetailsProps {
  session: Session | undefined;
}

export function SessionDetails({
  session,
}: SessionDetailsProps): React.ReactElement {
  if (!session) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text color="gray">No session focused</Text>
      </Box>
    );
  }

  const { displayTitle: title } = formatSessionTitle(session.session_title);
  const model = session.model?.display_name || session.model?.id || "Unknown";
  const statusIcon = getStatusIcon(session.status);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Title and Model */}
      <Text>
        <Text bold color="white">
          Active Session:{" "}
        </Text>
        <Text>{title}</Text>
      </Text>
      <Text>
        <Text bold color="white">
          Model:{" "}
        </Text>
        <Text>{model} </Text>
        <Text>{statusIcon} </Text>
        <Text color="gray">{session.status}</Text>
      </Text>
      <Text>
        <Text bold color="white">
          Project:{" "}
        </Text>
        <Text color={ACCENT_COLOR}>{session.project}</Text>
      </Text>

      {/* Context Metrics */}
      <Box marginTop={1}>
        <ContextMetricsDisplay session={session} />
      </Box>

      {/* Auto-Compact Status */}
      <Box marginTop={1}>
        <AutoCompactDisplay
          autocompact={session.autocompact}
          contextUsed={session.context_metrics?.used_percentage}
        />
      </Box>

      {/* Last Activity */}
      <Text color="gray">
        Last activity: {formatRelativeTime(session.last_activity)}
      </Text>
    </Box>
  );
}

interface ContextMetricsDisplayProps {
  session: Session;
}

function ContextMetricsDisplay({
  session,
}: ContextMetricsDisplayProps): React.ReactElement {
  const metrics = session.context_metrics;

  if (!metrics) {
    return <Text color="gray">Context metrics not yet available</Text>;
  }

  const pct = metrics.used_percentage;
  const total = formatTokens(metrics.context_window_size, { precise: true });
  const used = formatTokens(
    metrics.total_input_tokens + metrics.total_output_tokens,
    { precise: true },
  );
  const isEstimate = metrics.is_estimate ?? false;
  const estimatePrefix = isEstimate ? "~" : "";

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="white">
          Context Used:{" "}
        </Text>
        <Text>
          {estimatePrefix}
          {pct.toFixed(1)}%
        </Text>
      </Text>
      <Box>
        <ProgressBar
          percentage={pct}
          width={30}
          showLabel={false}
          isEstimate={isEstimate}
        />
        <Text color="gray">
          {" "}
          {estimatePrefix}
          {used} / {total}
        </Text>
      </Box>

      {/* Warnings */}
      {pct >= 80 && (
        <Text color={ERROR_COLOR} bold>
          ⚠️ Context nearly full! Consider compacting.
        </Text>
      )}
      {pct >= 60 && pct < 80 && (
        <Text color={WARNING_COLOR}>⚠️ Context usage is moderate</Text>
      )}
    </Box>
  );
}

interface AutoCompactDisplayProps {
  autocompact: AutoCompactStatus | null;
  contextUsed?: number;
}

function AutoCompactDisplay({
  autocompact,
  contextUsed,
}: AutoCompactDisplayProps): React.ReactElement {
  if (!autocompact) {
    return (
      <Text color="gray">
        <Text bold color="white">
          Auto-compact:{" "}
        </Text>
        <Text>Unknown (press [a] to toggle)</Text>
      </Text>
    );
  }

  const { enabled, threshold, bug_threshold } = autocompact;
  const pct = contextUsed ?? 0;

  // Determine warning level based on context usage and auto-compact settings
  let warningText: string | null = null;
  let warningColor: string = WARNING_COLOR;

  if (!enabled && bug_threshold) {
    // Auto-compact disabled but bug may trigger at 78%
    // IMPORTANT: Known bug #18264 - setting is IGNORED, triggers at ~78% anyway
    if (pct >= 70) {
      warningText = `⚠️ CRITICAL: Bug #18264 may trigger auto-compact at ~${bug_threshold}%!`;
      warningColor = ERROR_COLOR;
    } else if (pct >= 60) {
      warningText = `Warning: Bug #18264 may trigger at ~${bug_threshold}% despite setting`;
      warningColor = WARNING_COLOR;
    }
  } else if (enabled) {
    // Auto-compact enabled, warn when approaching threshold
    const warningThreshold = threshold - 15;
    if (pct >= warningThreshold) {
      warningText = `Approaching auto-compact at ${threshold}%`;
      warningColor = pct >= threshold - 5 ? ERROR_COLOR : WARNING_COLOR;
    }
  }

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="white">
          Auto-compact:{" "}
        </Text>
        <Text color={enabled ? SUCCESS_COLOR : WARNING_COLOR} bold>
          [{enabled ? "ON" : "OFF"}]
        </Text>
        {enabled ? (
          <Text color="gray"> at {threshold}%</Text>
        ) : (
          <Text color={ERROR_COLOR}> (BUG: still triggers at ~{bug_threshold}%!)</Text>
        )}
        <Text color="gray"> [a] toggle</Text>
      </Text>
      {warningText && <Text color={warningColor}>{warningText}</Text>}
    </Box>
  );
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "working":
      return "⚡";
    case "idle":
      return "💤";
    case "active":
      return "●";
    default:
      return "○";
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) {
    return `${Math.floor(diff)}s ago`;
  } else if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  } else if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  } else {
    return `${Math.floor(diff / 86400)}d ago`;
  }
}

export default SessionDetails;
