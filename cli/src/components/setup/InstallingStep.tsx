/**
 * InstallingStep — animated progress through installation substeps.
 */

import React from "react";
import { Text } from "ink";
import {
  ACCENT_COLOR,
  MUTED_TEXT,
  SUCCESS_COLOR,
  ERROR_COLOR,
} from "../layout/theme.js";
import { Spinner } from "./Spinner.js";

export interface InstallSubstep {
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  message?: string;
}

export function buildInstallingContent(
  substeps: InstallSubstep[],
  currentIndex: number,
): React.ReactNode[] {
  const completed = substeps.filter((s) => s.status === "done").length;
  const total = substeps.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const barWidth = 25;
  const filled = Math.round((completed / Math.max(1, total)) * barWidth);
  const empty = barWidth - filled;

  const lines: React.ReactNode[] = [];

  lines.push(<Text key="heading" color="white" bold>Installing...</Text>);
  lines.push(<Text key="spacer-1"> </Text>);

  for (let i = 0; i < substeps.length; i++) {
    const step = substeps[i];
    lines.push(
      <Text key={`step-${i}`}>
        {step.status === "done" && <Text color={SUCCESS_COLOR}>✓</Text>}
        {step.status === "failed" && <Text color={ERROR_COLOR}>✗</Text>}
        {step.status === "skipped" && <Text color={MUTED_TEXT}>○</Text>}
        {step.status === "running" && <Spinner />}
        {step.status === "pending" && <Text color={MUTED_TEXT}> </Text>}
        {" "}
        <Text color={step.status === "pending" ? MUTED_TEXT : "white"}>
          {step.label}
        </Text>
        {step.message && step.status === "failed" && (
          <Text color={ERROR_COLOR}> — {step.message}</Text>
        )}
      </Text>,
    );
  }

  lines.push(<Text key="spacer-2"> </Text>);
  lines.push(
    <Text key="progress">
      <Text color={ACCENT_COLOR}>{"█".repeat(filled)}</Text>
      <Text color={MUTED_TEXT}>{"░".repeat(empty)}</Text>
      <Text color={MUTED_TEXT}> {percent}%</Text>
    </Text>,
  );

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}
