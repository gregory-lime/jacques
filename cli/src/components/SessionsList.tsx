/**
 * SessionsList Component
 *
 * Displays all active sessions with status icons and context usage
 */

import React from "react";
import { Text, Box } from "ink";
import type { Session } from "@jacques/core";

interface SessionsListProps {
  sessions: Session[];
  focusedSessionId: string | null;
}

/**
 * Format session name as "project / terminal"
 */
function formatSessionName(session: Session): string {
  const project = session.project || "unknown";
  const terminal = session.terminal?.term_program || "Terminal";
  const branch = session.git_branch;
  const maxLength = 50;

  let formatted: string;
  if (branch) {
    formatted = `${project} @${branch} / ${terminal}`;
  } else {
    formatted = `${project} / ${terminal}`;
  }

  if (formatted.length > maxLength) {
    return formatted.substring(0, maxLength - 3) + "...";
  }
  return formatted;
}

/**
 * Format percentage with fallback
 */
function formatPercentage(percentage: number | undefined): string {
  if (percentage === undefined || percentage === null) {
    return "N/A";
  }
  return `${percentage.toFixed(1)}%`;
}

/**
 * Get color for context percentage
 */
function getContextColor(percentage: number | undefined): string {
  if (percentage === undefined || percentage === null) {
    return "gray";
  }
  if (percentage < 50) return "green";
  if (percentage < 70) return "yellow";
  return "red";
}

/**
 * Map (status, tool_name) → short activity label for TUI
 */
function getActivityLabel(status: string, toolName?: string | null): { label: string; color: string } {
  if (status === 'idle') {
    return { label: 'Needs input', color: 'yellow' };
  }
  if (status === 'active') {
    return { label: 'Ready', color: 'green' };
  }
  if (status === 'working') {
    if (!toolName) return { label: 'Working...', color: 'cyan' };
    const map: Record<string, string> = {
      Bash: 'Running cmd',
      Read: 'Reading',
      Write: 'Writing',
      Edit: 'Editing',
      Task: 'Subagent',
      Grep: 'Searching',
      Glob: 'Finding files',
      WebSearch: 'Web search',
      WebFetch: 'Fetching',
    };
    if (map[toolName]) return { label: map[toolName], color: 'cyan' };
    if (toolName.startsWith('mcp__')) {
      const server = toolName.split('__')[1] || 'tool';
      return { label: `MCP:${server}`, color: 'cyan' };
    }
    return { label: toolName, color: 'cyan' };
  }
  return { label: status, color: 'gray' };
}

/**
 * Sessions list with status icons
 * - 🟢 for focused session
 * - 💤 for idle/background sessions
 * Sorted: focused first, then by last_activity
 */
export function SessionsList({ sessions, focusedSessionId }: SessionsListProps): React.ReactElement {
  // Sort sessions: focused first, then by last_activity (most recent)
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.session_id === focusedSessionId) return -1;
    if (b.session_id === focusedSessionId) return 1;
    return b.last_activity - a.last_activity;
  });

  // Limit to first 10 sessions
  const displaySessions = sortedSessions.slice(0, 10);
  const remainingCount = sortedSessions.length - displaySessions.length;

  return (
    <Box flexDirection="column">
      <Text color="gray">
        Active Sessions ({sessions.length}):
      </Text>
      {displaySessions.map((session) => {
        const isFocused = session.session_id === focusedSessionId;
        const icon = isFocused ? "🟢" : "💤";
        const percentage = session.context_metrics?.used_percentage;
        const activity = getActivityLabel(session.status, session.last_tool_name);

        return (
          <Box key={session.session_id} marginLeft={2}>
            <Text>
              {icon} {formatSessionName(session)}
              {"    "}
              <Text color={getContextColor(percentage)}>
                {formatPercentage(percentage)}
              </Text>
              {"  "}
              <Text color={activity.color}>
                {activity.label}
              </Text>
            </Text>
          </Box>
        );
      })}
      {remainingCount > 0 && (
        <Box marginLeft={2}>
          <Text color="gray">... and {remainingCount} more</Text>
        </Box>
      )}
    </Box>
  );
}

export default SessionsList;
