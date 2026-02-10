/**
 * StatusLine Component
 *
 * Shows session status, mode, and worktree/branch info in a compact line.
 * Replaces ProjectLine in the main view.
 */

import React from "react";
import { Text } from "ink";
import { ACCENT_COLOR, MUTED_TEXT } from "../layout/theme.js";
import { getCliActivity } from "../../utils/activity.js";
import type { Session } from "@jacques/core";

const MODE_COLORS: Record<string, string> = {
  plan: "green",
  planning: "green",
  acceptEdits: ACCENT_COLOR,
  execution: ACCENT_COLOR,
  default: MUTED_TEXT,
  bypass: "red",
};

export function getSessionStatus(session: Session): string {
  if (session.status === "working" || session.status === "tool_use") return "working";
  if (session.status === "waiting") return "awaiting";
  if (session.status === "idle") return "idle";
  return "active";
}

export function getSessionMode(session: Session): string {
  if (session.is_bypass) return "bypass";
  if (session.mode) return session.mode;
  return "default";
}

export function StatusLine({
  session,
}: {
  session: Session | null;
}): React.ReactElement {
  if (!session) {
    return <Text color={MUTED_TEXT}>{"\u25CB"} No active session</Text>;
  }

  const activity = getCliActivity(session.status, session.last_tool_name);
  const mode = getSessionMode(session);
  const modeColor = MODE_COLORS[mode] || MUTED_TEXT;
  const modeLabel = mode === "acceptEdits" ? "edit" : mode;
  const worktree = session.git_worktree || session.git_branch || "\u2014";

  return (
    <Text wrap="truncate-end">
      <Text color={activity.color}>{activity.icon} {activity.label}</Text>
      <Text color={MUTED_TEXT}>{" \u2502 "}</Text>
      <Text color={modeColor}>{modeLabel}</Text>
      <Text color={MUTED_TEXT}>{" \u2502 "}</Text>
      <Text color={MUTED_TEXT}>{worktree}</Text>
    </Text>
  );
}
