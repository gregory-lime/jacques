/**
 * WorktreesView Component
 *
 * ASCII tree visualization of git worktrees with status badges,
 * inline creation, and removal confirmation.
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
import type { WorktreeItem } from "../hooks/useWorktrees.js";

interface WorktreesViewProps {
  worktrees: WorktreeItem[];
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  scrollOffset: number;
  isCreating: boolean;
  newName: string;
  createError: string | null;
  isConfirmingRemove: boolean;
  isGitProject: boolean;
  repoRoot: string | null;
  terminalWidth: number;
}

export function WorktreesView({
  worktrees,
  loading,
  error,
  selectedIndex,
  scrollOffset,
  isCreating,
  newName,
  createError,
  isConfirmingRemove,
  isGitProject,
  repoRoot,
  terminalWidth,
}: WorktreesViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      Worktrees
    </Text>
  );
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"\u2500".repeat(30)}
    </Text>
  );

  // Non-git project or no project selected
  if (!isGitProject || !repoRoot) {
    contentLines.push(
      <Text key="no-git" color={MUTED_TEXT}>
        {!repoRoot ? "Select a project first" : "Not a git project"}
      </Text>
    );
  } else if (loading) {
    contentLines.push(
      <Text key="loading" color={MUTED_TEXT}>
        Loading worktrees...
      </Text>
    );
  } else if (error) {
    contentLines.push(
      <Text key="error" color="red">
        {error}
      </Text>
    );
  } else if (isConfirmingRemove && worktrees[selectedIndex]) {
    // Remove confirmation overlay
    const wt = worktrees[selectedIndex];
    contentLines.push(
      <Text key="confirm-title" color={ACCENT_COLOR} bold>
        Remove "{wt.name}"?
      </Text>
    );
    if (wt.status.hasUncommittedChanges) {
      contentLines.push(
        <Text key="confirm-warn" color="yellow">
          {"\u2717"} Has uncommitted changes
        </Text>
      );
    }
    contentLines.push(<Text key="confirm-spacer"> </Text>);
    contentLines.push(
      <Text key="confirm-opts" color={MUTED_TEXT}>
        <Text color={ACCENT_COLOR}>[y]</Text> confirm  <Text color={ACCENT_COLOR}>[n]</Text> cancel  <Text color={ACCENT_COLOR}>[f]</Text> force
      </Text>
    );
  } else {
    // Render worktree tree
    worktrees.forEach((wt, index) => {
      const isSelected = index === selectedIndex;
      const isLast = index === worktrees.length - 1 && !isCreating;

      // Tree connector
      let connector: string;
      if (wt.isMain) {
        connector = "\u25CF";
      } else if (isLast) {
        connector = "\u2514\u2500";
      } else {
        connector = "\u251C\u2500";
      }

      const nodeColor = wt.isMain ? "green" : (isSelected ? ACCENT_COLOR : "white");
      const branchText = wt.branch ? ` \u2192 ${wt.branch}` : "";
      const sessionText = wt.sessionCount === 1
        ? "1 session"
        : `${wt.sessionCount} sessions`;

      // Line 1: tree + name + branch + sessions
      contentLines.push(
        <Text key={`wt-${index}-main`} wrap="truncate-end">
          <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>
            {isSelected ? "\u25B8" : " "} {connector}
          </Text>
          <Text color={nodeColor} bold={isSelected}>
            {" "}{wt.name}
          </Text>
          <Text color={MUTED_TEXT}>{branchText}</Text>
          <Text color={MUTED_TEXT}>{"  "}{sessionText}</Text>
        </Text>
      );

      // Line 2: status badges
      const mergedIcon = wt.status.isMergedToMain ? "\u2713" : "\u2717";
      const mergedColor = wt.status.isMergedToMain ? "green" : ACCENT_COLOR;
      const mergedText = wt.status.isMergedToMain ? "merged" : "unmerged";
      const cleanIcon = wt.status.hasUncommittedChanges ? "\u25CF" : "\u25CB";
      const cleanColor = wt.status.hasUncommittedChanges ? "yellow" : MUTED_TEXT;
      const cleanText = wt.status.hasUncommittedChanges ? "uncommitted" : "clean";

      // Trunk continuation
      const trunkChar = (wt.isMain && worktrees.length > 1) ? "\u2502" : (isLast ? " " : "\u2502");

      contentLines.push(
        <Text key={`wt-${index}-status`} wrap="truncate-end">
          <Text color={MUTED_TEXT}>  {trunkChar}  </Text>
          <Text color={mergedColor}>{mergedIcon} {mergedText}</Text>
          <Text color={MUTED_TEXT}>  </Text>
          <Text color={cleanColor}>{cleanIcon} {cleanText}</Text>
        </Text>
      );
    });

    // Inline creation
    if (isCreating) {
      const connector = worktrees.length > 0 ? "\u2514\u2500" : "\u25CF";
      contentLines.push(
        <Text key="create-input">
          <Text color={ACCENT_COLOR}>  {connector} New: </Text>
          <Text color="white">{newName}</Text>
          <Text color={ACCENT_COLOR}>_</Text>
        </Text>
      );
      if (repoRoot) {
        const previewPath = `${repoRoot}-${newName || "..."}`;
        const shortPath = previewPath.length > 30
          ? "..." + previewPath.slice(-27)
          : previewPath;
        contentLines.push(
          <Text key="create-preview" color={MUTED_TEXT}>
            {"     "}{"\u2192"} {shortPath}
          </Text>
        );
      }
      if (createError) {
        contentLines.push(
          <Text key="create-error" color="red">
            {"     "}{createError}
          </Text>
        );
      }
    } else if (worktrees.length === 0) {
      contentLines.push(
        <Text key="no-wt" color={MUTED_TEXT}>
          No worktrees yet
        </Text>
      );
    }

    // Add worktree hint
    if (!isCreating) {
      contentLines.push(
        <Text key="add-hint" color={MUTED_TEXT}>
          {worktrees.length > 0 ? "\u2514\u2500" : ""} <Text color={ACCENT_COLOR}>[a]</Text> Add worktree...
        </Text>
      );
    }
  }

  // Apply scroll
  const HEADER_LINES = 2;
  const maxVisible = FIXED_CONTENT_HEIGHT - HEADER_LINES;
  const itemLines = contentLines.slice(HEADER_LINES);
  const visibleItems = itemLines.slice(scrollOffset, scrollOffset + maxVisible);
  const finalContent = [...contentLines.slice(0, HEADER_LINES), ...visibleItems];

  const { element: bottomControls, width: controlsWidth } = isCreating
    ? buildBottomControls([
        { key: "Enter", label: " create " },
        { key: "Esc", label: " cancel" },
      ])
    : buildBottomControls([
        { key: "Enter", label: " launch " },
        { key: "a", label: "dd " },
        { key: "d", label: "el " },
        { key: "Esc", label: "" },
      ]);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={finalContent}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
      bottomControlsWidth={controlsWidth}
    />
  ) : (
    <VerticalLayout
      content={finalContent}
      title="Jacques"
      showVersion={showVersion}
      bottomControls={bottomControls}
    />
  );
}
