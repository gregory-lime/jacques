/**
 * MainMenuView Component
 *
 * Renders the main menu with project name title, progress bar,
 * status line (mode/state/worktree), and navigation menu.
 */

import React from "react";
import { Text } from "ink";
import { ProgressLine } from "./shared/ProgressLine.js";
import { StatusLine } from "./shared/StatusLine.js";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "./layout/index.js";
import { MENU_ITEMS } from "../utils/constants.js";
import { getProjectGroupKey } from "@jacques/core";
import type { Session } from "@jacques/core";

interface MainMenuViewProps {
  sessions: Session[];
  focusedSession: Session | null;
  selectedMenuIndex: number;
  notification: string | null;
  terminalWidth: number;
  selectedProject?: string | null;
}

export function MainMenuView({
  sessions,
  focusedSession,
  selectedMenuIndex,
  notification,
  terminalWidth,
  selectedProject,
}: MainMenuViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Derive project name: selected project > git repo root name > session project > fallback
  const projectName = selectedProject
    || (focusedSession ? getProjectGroupKey(focusedSession) : null)
    || "Jacques";

  // Dynamic session count label for menu item 1
  const sessionLabel = `Sessions${sessions.length > 0 ? ` (${sessions.length})` : ""}`;

  const contentLines: React.ReactNode[] = [];

  contentLines.push(<Text key="spacer-top"> </Text>);
  contentLines.push(<Text key="title" bold color={ACCENT_COLOR}>{projectName}</Text>);

  if (focusedSession) {
    contentLines.push(<ProgressLine key="progress" session={focusedSession} />);
    contentLines.push(<StatusLine key="status" session={focusedSession} />);
  } else {
    contentLines.push(
      <Text key="no-session" color={MUTED_TEXT}>No active sessions</Text>
    );
  }

  contentLines.push(<Text key="spacer-mid"> </Text>);

  MENU_ITEMS.forEach((item, index) => {
    const isSelected = index === selectedMenuIndex;
    const textColor = item.enabled
      ? isSelected ? ACCENT_COLOR : "white"
      : MUTED_TEXT;
    const label = item.key === "1" ? sessionLabel : item.label;
    contentLines.push(
      <Text key={item.key} color={textColor} bold={isSelected}>
        {isSelected ? "\u25B8 " : "  "}{label}
      </Text>
    );
  });

  contentLines.push(<Text key="spacer-bot"> </Text>);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
      sessionCount={sessions.length}
      notification={notification}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
      sessionCount={sessions.length}
      notification={notification}
    />
  );
}
