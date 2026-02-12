/**
 * VerificationStep — post-installation validation.
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
import type { VerificationResult } from "@jacques-ai/core";

export function buildVerificationContent(
  results: VerificationResult[],
  checking: boolean,
): React.ReactNode[] {
  const allPassed = !checking && results.length > 0 && results.every((r) => r.status !== "fail");
  const lines: React.ReactNode[] = [];

  lines.push(<Text key="heading" color="white" bold>Verification</Text>);
  lines.push(<Text key="spacer-1"> </Text>);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(
      <Text key={`result-${i}`}>
        {result.status === "pass" && <Text color={SUCCESS_COLOR}>✓</Text>}
        {result.status === "fail" && <Text color={ERROR_COLOR}>✗</Text>}
        {result.status === "warn" && <Text color={WARNING_COLOR}>⚠</Text>}
        {" "}
        <Text color="white">{result.message}</Text>
      </Text>,
    );
  }

  if (checking) {
    lines.push(
      <Text key="checking">
        <Spinner />
        <Text color={MUTED_TEXT}> Verifying...</Text>
      </Text>,
    );
  }

  lines.push(<Text key="spacer-2"> </Text>);

  if (allPassed) {
    lines.push(<Text key="status" color={SUCCESS_COLOR} bold>All checks passed!</Text>);
  }

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}
