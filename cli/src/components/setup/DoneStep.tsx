/**
 * DoneStep — final summary and next steps (condensed for 9-line budget).
 */

import React from "react";
import { Text } from "ink";
import {
  ACCENT_COLOR,
  MUTED_TEXT,
  SUCCESS_COLOR,
} from "../layout/theme.js";
import type { SetupOptions, SyncResult } from "@jacques/core";

export function buildDoneContent(
  options: SetupOptions,
  syncResult: SyncResult | null,
): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  lines.push(<Text key="spacer-1"> </Text>);
  lines.push(<Text key="heading" color={SUCCESS_COLOR} bold>Setup Complete!</Text>);

  // Installed items — one per line for clarity
  lines.push(
    <Text key="hooks">
      {"  "}<Text color={SUCCESS_COLOR}>✓</Text>
      <Text color="white"> Hooks installed (5 hooks configured)</Text>
    </Text>,
  );

  if (options.installStatusLine || options.installSkills) {
    const parts: string[] = [];
    if (options.installStatusLine) parts.push("StatusLine");
    if (options.installSkills) parts.push("Skills");
    lines.push(
      <Text key="optional">
        {"  "}<Text color={SUCCESS_COLOR}>✓</Text>
        <Text color="white"> {parts.join(" · ")} enabled</Text>
      </Text>,
    );
  }

  if (syncResult) {
    lines.push(
      <Text key="sync">
        {"  "}<Text color={SUCCESS_COLOR}>✓</Text>
        <Text color="white"> {syncResult.indexed} sessions indexed</Text>
      </Text>,
    );
  }

  lines.push(<Text key="spacer-2"> </Text>);
  lines.push(<Text key="next-label" color={ACCENT_COLOR} bold>Next steps:</Text>);
  lines.push(
    <Text key="next-1">
      <Text color={ACCENT_COLOR}>  1.</Text>
      <Text color="white"> Run </Text>
      <Text color={MUTED_TEXT}>jacques</Text>
      <Text color="white"> to start the dashboard</Text>
    </Text>,
  );
  lines.push(
    <Text key="next-2">
      <Text color={ACCENT_COLOR}>  2.</Text>
      <Text color="white"> Web GUI at </Text>
      <Text color={MUTED_TEXT}>http://localhost:4243</Text>
    </Text>,
  );

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}
