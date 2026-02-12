/**
 * Project and session title line.
 * Extracted from Dashboard.tsx. Previously duplicated in CompactHeader.tsx.
 */

import React from "react";
import { Text } from "ink";
import { MUTED_TEXT } from "../layout/theme.js";
import { formatSessionTitle } from "@jacques-ai/core";
import type { Session } from "@jacques-ai/core";

export function ProjectLine({
  session,
}: {
  session: Session | null;
}): React.ReactElement {
  if (!session) {
    return <Text color={MUTED_TEXT}>No active session</Text>;
  }

  const project = session.project || "unknown";
  const { displayTitle: truncatedTitle } = formatSessionTitle(session.session_title, 35);

  const maxLength = 35;
  const truncatedProject =
    project.length > maxLength
      ? project.substring(0, maxLength - 3) + "..."
      : project;

  return (
    <Text>
      {truncatedProject}
      <Text color={MUTED_TEXT}> / </Text>
      {truncatedTitle}
    </Text>
  );
}
