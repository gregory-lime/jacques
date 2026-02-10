/**
 * SessionsExperimentView Component
 *
 * Active sessions grouped by worktree with mascot, scrollbar,
 * breathable layout, and vim-style orange footer bar.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import {
  BORDER_COLOR,
  ACCENT_COLOR,
  MUTED_TEXT,
  MASCOT_WIDTH,
  CONTENT_PADDING,
  FIXED_CONTENT_HEIGHT,
} from "./layout/theme.js";
import { formatSessionTitle } from "@jacques/core";
import type { ContentItem } from "../hooks/useSessionsExperiment.js";
import { getCliActivity } from "../utils/activity.js";
import { buildBottomControls } from "../utils/bottom-controls.js";

const MODE_COLORS: Record<string, string> = {
  plan: "green",
  planning: "green",
  acceptEdits: ACCENT_COLOR,
  execution: ACCENT_COLOR,
  default: MUTED_TEXT,
  bypass: "red",
};

interface SessionsExperimentViewProps {
  items: ContentItem[];
  selectableIndices: number[];
  selectedIndex: number;
  scrollOffset: number;
  selectedIds: Set<string>;
  notification: string | null;
  terminalWidth: number;
  terminalHeight: number;
  isCreatingWorktree: boolean;
  newWorktreeName: string;
  worktreeCreateError: string | null;
  repoRoot: string | null;
  projectName: string | null;
}

export function SessionsExperimentView({
  items,
  selectableIndices,
  selectedIndex,
  scrollOffset,
  selectedIds,
  notification,
  terminalWidth,
  terminalHeight,
  isCreatingWorktree,
  newWorktreeName,
  worktreeCreateError,
  repoRoot,
  projectName,
}: SessionsExperimentViewProps): React.ReactElement {
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;

  // --- Layout dimensions ---
  const mascotPadding = 3;
  const mascotDisplayWidth = MASCOT_WIDTH + mascotPadding;
  const contentWidth = Math.max(30, terminalWidth - mascotDisplayWidth - 3);
  const contentHeight = Math.max(8, terminalHeight - 3);

  // Mascot + shortcuts column
  const mascotLines = MASCOT_ANSI.split("\n").filter((l) => l.trim().length > 0);
  const shortcutRows = [
    { key: "\u2191\u2193", label: "nav" },
    { key: "\u23CE", label: "foc" },
    { key: "\u2423", label: "sel" },
    { key: "f", label: "full" },
    { key: "t", label: "tile" },
  ];
  // Match main view: mascot starts at row 1 (same as HorizontalLayout)
  const mascotTopPad = Math.floor((FIXED_CONTENT_HEIGHT - mascotLines.length) / 2);
  const shortcutsStart = mascotTopPad + mascotLines.length + 2;

  // --- Build content lines ---
  const allContentLines: React.ReactNode[] = [];

  // Content header
  const headerLabel = projectName ? `${projectName}/sessions` : "Sessions";
  allContentLines.push(<Text key="header" bold color={ACCENT_COLOR}>{headerLabel}</Text>);
  allContentLines.push(<Text key="header-spacer"> </Text>);

  if (items.length === 0) {
    allContentLines.push(
      <Text key="empty" color={MUTED_TEXT}>No active sessions</Text>
    );
  }

  items.forEach((item, idx) => {
    switch (item.kind) {
      case "worktree-header": {
        const dot = item.isMain ? "\u25CF " : "";
        const name = item.branch || item.name;
        allContentLines.push(
          <Text key={`wh-${idx}`} wrap="truncate-end">
            <Text color={ACCENT_COLOR}>{dot}</Text>
            <Text bold color="white">{name}</Text>
          </Text>
        );
        break;
      }

      case "session": {
        const session = item.session;
        const isSelected = idx === currentItemIndex;
        const isMultiSelected = selectedIds.has(session.session_id);

        // Tree branch: use ├ if next item is also a session or new-session-button, └ otherwise
        const nextItem = items[idx + 1];
        const isLastInGroup = !nextItem || (nextItem.kind !== "session" && nextItem.kind !== "new-session-button");
        const treeCh = isLastInGroup ? "\u2514" : "\u251C";

        const cursor = isSelected ? "\u25B6" : " ";

        // Colors: invert when multi-selected
        const fg = isMultiSelected ? "#1a1a1a" : undefined;

        // Status (uses last_tool_name for awaiting differentiation)
        const activity = getCliActivity(session.status, session.last_tool_name);

        // Mode
        const mode = session.is_bypass ? "bypass" : (session.mode || "default");
        const modeColor = MODE_COLORS[mode] || MUTED_TEXT;
        const modeLabel = mode === "acceptEdits" ? "edit" : mode;

        // Title (with plan detection)
        const maxTitleLen = Math.max(5, contentWidth - 40);
        const { isPlan, displayTitle } = formatSessionTitle(session.session_title, maxTitleLen);
        const titleColor = fg || "white";

        // Progress
        let progressNode: React.ReactNode;
        if (session.context_metrics) {
          const pct = session.context_metrics.used_percentage;
          const barW = 7;
          const filled = Math.round((pct / 100) * barW);
          const empty = barW - filled;
          progressNode = (
            <>
              <Text color={fg || (isSelected ? "white" : ACCENT_COLOR)}>{"\u2588".repeat(filled)}</Text>
              <Text color={fg || (isSelected ? "gray" : MUTED_TEXT)}>{"\u2591".repeat(empty)}</Text>
              <Text color={fg || (isSelected ? "white" : ACCENT_COLOR)}> {session.context_metrics.is_estimate ? "~" : ""}{pct.toFixed(0)}%</Text>
            </>
          );
        } else {
          progressNode = <Text color={fg || (isSelected ? "gray" : MUTED_TEXT)}>{"\u2591".repeat(7)} N/A</Text>;
        }

        allContentLines.push(
          <Text
            key={`s-${idx}`}
            wrap="truncate-end"
            backgroundColor={isMultiSelected ? ACCENT_COLOR : undefined}
            color={isMultiSelected ? "#1a1a1a" : undefined}
          >
            <Text color={fg || MUTED_TEXT}>{treeCh} </Text>
            <Text color={fg || (isSelected ? ACCENT_COLOR : "white")}>{cursor} </Text>
            <Text color={fg || activity.color}>{activity.icon}</Text>
            <Text color={fg || activity.color}> {activity.label.padEnd(9)}</Text>
            <Text color={fg || modeColor}>{modeLabel.padEnd(8)}</Text>
            <Text color={titleColor}>{displayTitle}</Text>
            <Text>  </Text>
            {progressNode}
          </Text>
        );
        break;
      }

      case "new-session-button": {
        const isSelected = idx === currentItemIndex;
        allContentLines.push(
          <Text key={`nsb-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>{"\u2514"} </Text>
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>{isSelected ? "\u25B6" : " "} </Text>
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>+ New Session</Text>
          </Text>
        );
        break;
      }

      case "new-worktree-button": {
        const isSelected = idx === currentItemIndex;
        allContentLines.push(
          <Text key={`nwb-${idx}`} wrap="truncate-end">
            <Text color={isSelected ? ACCENT_COLOR : "white"}>{isSelected ? "\u25B6" : " "} </Text>
            <Text bold color={isSelected ? ACCENT_COLOR : "white"}>+ New Worktree</Text>
          </Text>
        );
        break;
      }

      case "new-worktree-input": {
        allContentLines.push(
          <Text key={`nwi-${idx}`} wrap="truncate-end">
            <Text color={ACCENT_COLOR}>{"\u25B6"} New: </Text>
            <Text color="white">{newWorktreeName}</Text>
            <Text color={ACCENT_COLOR}>_</Text>
          </Text>
        );
        if (repoRoot) {
          allContentLines.push(
            <Text key={`nwi-path-${idx}`} color={MUTED_TEXT}>
              {"  "}{repoRoot}/{newWorktreeName || "..."}
            </Text>
          );
        }
        if (worktreeCreateError) {
          allContentLines.push(
            <Text key={`nwi-err-${idx}`} color="red">
              {"  "}{worktreeCreateError}
            </Text>
          );
        }
        break;
      }

      case "show-all-worktrees-button": {
        const isSelected = idx === currentItemIndex;
        const isShowingAll = item.hiddenCount === 0;
        const arrow = isShowingAll ? "\u25BE" : "\u25B8";
        const label = isShowingAll ? "Hide empty worktrees" : `Show ${item.hiddenCount} more worktree${item.hiddenCount === 1 ? "" : "s"}`;
        allContentLines.push(
          <Text key={`sawb-${idx}`} wrap="truncate-end">
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>{isSelected ? "\u25B6" : " "} </Text>
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>{arrow} {label}</Text>
          </Text>
        );
        break;
      }

      case "spacer": {
        allContentLines.push(<Text key={`sp-${idx}`}> </Text>);
        break;
      }
    }
  });

  // --- Scrollbar ---
  const totalLines = allContentLines.length;
  const needsScrollbar = totalLines > contentHeight;
  let thumbStart = 0;
  let thumbEnd = 0;
  if (needsScrollbar) {
    const thumbSize = Math.max(1, Math.round((contentHeight / totalLines) * contentHeight));
    const maxScroll = Math.max(1, totalLines - contentHeight);
    thumbStart = Math.round((scrollOffset / maxScroll) * (contentHeight - thumbSize));
    thumbEnd = Math.min(contentHeight, thumbStart + thumbSize);
  }

  // Visible slice
  const visibleLines = allContentLines.slice(scrollOffset, scrollOffset + contentHeight);

  // --- Top border ---
  const borderTitle = "\u2500 Jacques";
  const borderVersion = " v0.1.0 ";
  const topRemaining = Math.max(0, terminalWidth - borderTitle.length - borderVersion.length - 2);

  // --- Bottom border controls ---
  let bottomIsNotification = false;
  let bottomIsError = false;
  let bottomNotificationText = "";
  const { element: bottomControls, width: controlsWidth } = buildBottomControls([
    { key: "Esc", label: " back" },
  ]);
  let bottomTextWidth: number;

  if (notification) {
    const isError = notification.startsWith("!");
    const cleanMsg = isError ? notification.slice(1) : notification;
    const maxLen = terminalWidth - 6;
    const truncated = cleanMsg.length > maxLen ? cleanMsg.substring(0, maxLen - 3) + "..." : cleanMsg;
    bottomNotificationText = isError ? `\u2717 ${truncated}` : `\u2713 ${truncated}`;
    bottomTextWidth = bottomNotificationText.length;
    bottomIsNotification = true;
    bottomIsError = isError;
  } else {
    bottomTextWidth = controlsWidth;
  }

  const totalBottomDashes = Math.max(0, terminalWidth - bottomTextWidth - 2);
  const bottomLeftBorder = Math.max(1, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(1, totalBottomDashes - bottomLeftBorder);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Box>
        <Text color={BORDER_COLOR}>{"\u256D"}</Text>
        <Text color={ACCENT_COLOR}>{borderTitle}</Text>
        <Text color={MUTED_TEXT}>{borderVersion}</Text>
        <Text color={BORDER_COLOR}>{"\u2500".repeat(topRemaining)}{"\u256E"}</Text>
      </Box>

      {/* Content rows with mascot + scrollbar */}
      {Array.from({ length: contentHeight }).map((_, rowIndex) => {
        const mascotIdx = rowIndex - mascotTopPad;
        let leftCell: React.ReactNode = <Text> </Text>;
        if (mascotIdx >= 0 && mascotIdx < mascotLines.length) {
          leftCell = <Text wrap="truncate-end">{mascotLines[mascotIdx]}</Text>;
        } else {
          const scIdx = rowIndex - shortcutsStart;
          if (scIdx >= 0 && scIdx < shortcutRows.length) {
            const sc = shortcutRows[scIdx];
            leftCell = (
              <Text wrap="truncate-end">
                <Text color={MUTED_TEXT}> {sc.key.padEnd(3)}</Text>
                <Text color={MUTED_TEXT}> {sc.label}</Text>
              </Text>
            );
          }
        }

        const contentLine = visibleLines[rowIndex];

        const isThumb = needsScrollbar && rowIndex >= thumbStart && rowIndex < thumbEnd;
        const rightChar = isThumb ? "\u2503" : "\u2502";
        const rightColor = isThumb ? ACCENT_COLOR : BORDER_COLOR;

        return (
          <Box key={rowIndex} flexDirection="row" height={1}>
            <Text color={BORDER_COLOR}>{"\u2502"}</Text>
            <Box width={mascotDisplayWidth} justifyContent="center" flexShrink={0}>
              {leftCell}
            </Box>
            <Text color={BORDER_COLOR}>{"\u2502"}</Text>
            <Box
              width={contentWidth}
              paddingLeft={CONTENT_PADDING}
              paddingRight={CONTENT_PADDING}
              flexShrink={0}
            >
              {contentLine || <Text> </Text>}
            </Box>
            <Text color={rightColor}>{rightChar}</Text>
          </Box>
        );
      })}

      {/* Bottom border with controls */}
      <Box>
        <Text color={BORDER_COLOR}>
          {"\u2570"}{"\u2500".repeat(bottomLeftBorder)}
        </Text>
        {bottomIsNotification ? (
          <Text color={bottomIsError ? "red" : "green"}>{bottomNotificationText}</Text>
        ) : (
          bottomControls
        )}
        <Text color={BORDER_COLOR}>
          {"\u2500".repeat(bottomRightBorder)}{"\u256F"}
        </Text>
      </Box>
    </Box>
  );
}
