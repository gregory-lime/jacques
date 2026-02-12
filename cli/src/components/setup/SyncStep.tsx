/**
 * SyncStep — optional initial sync of existing conversations.
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
import type { SyncResult } from "@jacques/core";

export function buildSyncContent(
  phase: "ask" | "starting" | "running" | "done" | "error",
  selectedOption: number,
  progress: { current: number; total: number; phase: string } | null,
  result: SyncResult | null,
  errorMessage?: string,
): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  lines.push(<Text key="heading" color="white" bold>Initial Sync</Text>);
  lines.push(<Text key="spacer-1"> </Text>);

  if (phase === "ask") {
    lines.push(
      <Text key="desc-1" color={MUTED_TEXT}>
        Jacques can index your existing Claude Code
      </Text>,
    );
    lines.push(
      <Text key="desc-2" color={MUTED_TEXT}>
        conversations to populate session history.
      </Text>,
    );
    lines.push(<Text key="spacer-2"> </Text>);
    lines.push(
      <Text key="options">
        <Text color={selectedOption === 0 ? ACCENT_COLOR : MUTED_TEXT}>
          {selectedOption === 0 ? "› " : "  "}
        </Text>
        <Text color={selectedOption === 0 ? ACCENT_COLOR : "white"} bold={selectedOption === 0}>
          [Yes] Sync now
        </Text>
        {"     "}
        <Text color={selectedOption === 1 ? ACCENT_COLOR : MUTED_TEXT}>
          {selectedOption === 1 ? "› " : "  "}
        </Text>
        <Text color={selectedOption === 1 ? ACCENT_COLOR : "white"} bold={selectedOption === 1}>
          [No] Skip
        </Text>
      </Text>,
    );
  }

  if (phase === "starting") {
    lines.push(
      <Text key="starting">
        <Spinner />
        <Text color={MUTED_TEXT}> Starting server...</Text>
      </Text>,
    );
  }

  if (phase === "running" && progress) {
    const barWidth = 25;
    const percent = progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
    const filled = Math.round(
      (progress.current / Math.max(1, progress.total)) * barWidth,
    );
    const empty = barWidth - filled;

    lines.push(<Text key="syncing" color={MUTED_TEXT}>Syncing conversations...</Text>);
    lines.push(<Text key="spacer-r"> </Text>);
    lines.push(
      <Text key="progress">
        <Text color={ACCENT_COLOR}>{"█".repeat(filled)}</Text>
        <Text color={MUTED_TEXT}>{"░".repeat(empty)}</Text>
        <Text color={MUTED_TEXT}>
          {" "}{progress.current}/{progress.total} ({percent}%)
        </Text>
      </Text>,
    );
    lines.push(
      <Text key="phase" color={MUTED_TEXT}>
        {progress.phase === "extracting" ? "Extracting..." : "Indexing..."}
      </Text>,
    );
  }

  if (phase === "done" && result) {
    lines.push(<Text key="done" color={SUCCESS_COLOR}>✓ Sync complete</Text>);
    lines.push(
      <Text key="stats" color={MUTED_TEXT}>
        {"  "}{result.totalSessions} sessions found, {result.indexed} indexed
      </Text>,
    );
    if (result.errors > 0) {
      lines.push(
        <Text key="errors" color={ERROR_COLOR}>
          {"  "}{result.errors} errors
        </Text>,
      );
    }
  }

  if (phase === "error") {
    lines.push(
      <Text key="error" color={ERROR_COLOR}>
        ✗ {errorMessage || "Sync failed"}
      </Text>,
    );
    lines.push(
      <Text key="fallback" color={MUTED_TEXT}>
        You can sync later from the Jacques dashboard.
      </Text>,
    );
  }

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}
