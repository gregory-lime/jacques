/**
 * ProjectSelectorView Component
 *
 * Displays a list of discovered projects with session counts.
 * Selecting a project scopes the main view to that project.
 */

import React from "react";
import { Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";
import { buildBottomControls } from "../utils/bottom-controls.js";
import type { DiscoveredProject } from "../hooks/useProjectSelector.js";

interface ProjectSelectorViewProps {
  projects: DiscoveredProject[];
  selectedIndex: number;
  scrollOffset: number;
  loading: boolean;
  error: string | null;
  terminalWidth: number;
}

export function ProjectSelectorView({
  projects,
  selectedIndex,
  scrollOffset,
  loading,
  error,
  terminalWidth,
}: ProjectSelectorViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  const HEADER_LINES = 2;
  const maxVisible = FIXED_CONTENT_HEIGHT - HEADER_LINES;

  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      Projects
    </Text>
  );
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"\u2500".repeat(30)}
    </Text>
  );

  if (loading) {
    contentLines.push(
      <Text key="loading" color={MUTED_TEXT}>
        Loading projects...
      </Text>
    );
  } else if (error) {
    contentLines.push(
      <Text key="error" color="red">
        Error: {error}
      </Text>
    );
  } else if (projects.length === 0) {
    contentLines.push(
      <Text key="empty" color={MUTED_TEXT}>
        No projects found
      </Text>
    );
  } else {
    const visibleProjects = projects.slice(scrollOffset, scrollOffset + maxVisible);

    if (scrollOffset > 0) {
      contentLines.push(
        <Text key="scroll-up" color={MUTED_TEXT}>
          {"\u25B2"} more above
        </Text>
      );
    }

    visibleProjects.forEach((project, i) => {
      const actualIndex = scrollOffset + i;
      const isSelected = actualIndex === selectedIndex;
      const cursor = isSelected ? "\u25B8 " : "  ";
      const nameColor = isSelected ? ACCENT_COLOR : "white";
      const sessions = project.sessionCount;
      const countText = sessions === 1 ? "1 session" : `${sessions} sessions`;

      contentLines.push(
        <Text key={`proj-${actualIndex}`} wrap="truncate-end">
          <Text color={nameColor} bold={isSelected}>
            {cursor}{project.displayName}
          </Text>
          <Text color={MUTED_TEXT}>
            {"  "}{countText}
          </Text>
        </Text>
      );
    });

    if (scrollOffset + maxVisible < projects.length) {
      contentLines.push(
        <Text key="scroll-down" color={MUTED_TEXT}>
          {"\u25BC"} more below
        </Text>
      );
    }
  }

  const { element: bottomControls, width: controlsWidth } = buildBottomControls([
    { key: "Enter", label: " select " },
    { key: "Esc", label: " back" },
  ]);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
      bottomControlsWidth={controlsWidth}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
    />
  );
}
