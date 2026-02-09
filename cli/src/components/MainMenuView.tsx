/**
 * MainMenuView Component
 *
 * Renders the main menu with progress line, project line, and menu items.
 */

import React from "react";
import { Box, Text } from "ink";
import { ProgressLine } from "./shared/ProgressLine.js";
import { ProjectLine } from "./shared/ProjectLine.js";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "./layout/index.js";
import { MENU_ITEMS } from "../utils/constants.js";
import type { Session } from "@jacques/core";

interface MainMenuViewProps {
  sessions: Session[];
  focusedSession: Session | null;
  selectedMenuIndex: number;
  notification: string | null;
  terminalWidth: number;
}

export function MainMenuView({
  sessions,
  focusedSession,
  selectedMenuIndex,
  notification,
  terminalWidth,
}: MainMenuViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  const contentLines: React.ReactNode[] = [
    <Box />,
    <Text bold color={ACCENT_COLOR}>Context Manager</Text>,
    <ProgressLine session={focusedSession} />,
    <ProjectLine session={focusedSession} />,
    <Box />,
    ...MENU_ITEMS.map((item, index) => {
      const isSelected = index === selectedMenuIndex;
      const textColor = item.enabled
        ? isSelected ? ACCENT_COLOR : "white"
        : MUTED_TEXT;
      return (
        <Text key={item.key} color={textColor} bold={isSelected}>
          {isSelected ? "> " : "  "}{item.label}
        </Text>
      );
    }),
    <Box />,
  ];

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
