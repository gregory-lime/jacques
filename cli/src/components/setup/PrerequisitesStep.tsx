/**
 * PrerequisitesStep — animated prerequisite check results.
 */

import React from "react";
import { Text } from "ink";
import {
  MUTED_TEXT,
  SUCCESS_COLOR,
  WARNING_COLOR,
  ERROR_COLOR,
} from "../layout/theme.js";
import { Spinner } from "./Spinner.js";
import type { PrerequisiteResult } from "@jacques/core";

export function buildPrerequisitesContent(
  results: PrerequisiteResult[],
  checking: boolean,
  currentCheck: number,
): React.ReactNode[] {
  const allPassed = !checking && results.every((r) => r.status !== "fail");
  const hasFailed = !checking && results.some((r) => r.status === "fail");
  const lines: React.ReactNode[] = [];

  lines.push(<Text key="heading" color="white" bold>Checking prerequisites...</Text>);
  lines.push(<Text key="spacer-1"> </Text>);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(
      <Text key={`result-${i}`}>
        {result.status === "pass" && <Text color={SUCCESS_COLOR}>✓</Text>}
        {result.status === "fail" && <Text color={ERROR_COLOR}>✗</Text>}
        {result.status === "warn" && <Text color={WARNING_COLOR}>⚠</Text>}
        {" "}
        <Text color="white">{result.name}</Text>
        {result.version && <Text color={MUTED_TEXT}> — {result.version}</Text>}
        {result.message && result.status !== "pass" && (
          <Text color={MUTED_TEXT}> — {result.message}</Text>
        )}
      </Text>,
    );
  }

  if (checking && currentCheck >= results.length) {
    lines.push(
      <Text key="checking">
        <Spinner />
        <Text color={MUTED_TEXT}> Checking...</Text>
      </Text>,
    );
  }

  lines.push(<Text key="spacer-2"> </Text>);

  if (allPassed) {
    lines.push(<Text key="status" color={SUCCESS_COLOR} bold>All prerequisites met.</Text>);
  } else if (hasFailed) {
    lines.push(
      <Text key="status" color={ERROR_COLOR} bold>
        Some prerequisites failed. Install missing dependencies.
      </Text>,
    );
  }

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}
