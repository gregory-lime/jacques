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

const STATUS_DOTS: Record<string, { icon: string; color: string }> = {
  working: { icon: "\u25C9", color: ACCENT_COLOR },
  tool_use: { icon: "\u25C9", color: ACCENT_COLOR },
  idle: { icon: "\u25CB", color: MUTED_TEXT },
  waiting: { icon: "\u25CE", color: "yellow" },
};

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
}: SessionsExperimentViewProps): React.ReactElement {
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;

  // --- Layout dimensions ---
  const mascotPadding = 3;
  const mascotDisplayWidth = MASCOT_WIDTH + mascotPadding;
  const contentWidth = Math.max(30, terminalWidth - mascotDisplayWidth - 3);
  const contentHeight = Math.max(8, terminalHeight - 3);

  // Mascot
  const mascotLines = MASCOT_ANSI.split("\n").filter((l) => l.trim().length > 0);
  const mascotTopPad = Math.floor((FIXED_CONTENT_HEIGHT - mascotLines.length) / 2);

  // --- Build content lines ---
  const allContentLines: React.ReactNode[] = [];

  // Content header
  allContentLines.push(<Text key="header" bold color={ACCENT_COLOR}>Sessions</Text>);
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
        // Breathing space after header
        allContentLines.push(<Text key={`whsp-${idx}`}> </Text>);
        break;
      }

      case "session": {
        const session = item.session;
        const isSelected = idx === currentItemIndex;
        const isMultiSelected = selectedIds.has(session.session_id);

        // Tree branch: └ for last session in group, ├ for others
        const nextItem = items[idx + 1];
        const isLastInGroup = !nextItem || nextItem.kind !== "session";
        const treeCh = isLastInGroup ? "\u2514" : "\u251C";

        const cursor = isSelected ? "\u25B6" : " ";

        // Colors: invert when multi-selected
        const fg = isMultiSelected ? "#1a1a1a" : undefined;

        // Status
        const statusKey = session.status || "idle";
        const { icon, color: statusColor } = STATUS_DOTS[statusKey] || STATUS_DOTS.idle;
        const displayStatus = statusKey === "tool_use" ? "working" : statusKey;

        // Mode
        const mode = session.is_bypass ? "bypass" : (session.mode || "default");
        const modeColor = MODE_COLORS[mode] || MUTED_TEXT;
        const modeLabel = mode === "acceptEdits" ? "edit" : mode;

        // Title (with plan detection)
        const maxTitleLen = Math.max(5, contentWidth - 40);
        const { isPlan, displayTitle } = formatSessionTitle(session.session_title, maxTitleLen);
        const titleColor = fg || (isPlan ? "green" : (isSelected ? ACCENT_COLOR : "white"));

        // Progress
        let progressNode: React.ReactNode;
        if (session.context_metrics) {
          const pct = session.context_metrics.used_percentage;
          const barW = 7;
          const filled = Math.round((pct / 100) * barW);
          const empty = barW - filled;
          progressNode = (
            <>
              <Text color={fg || ACCENT_COLOR}>{"\u2588".repeat(filled)}</Text>
              <Text color={fg || MUTED_TEXT}>{"\u2591".repeat(empty)}</Text>
              <Text color={fg || ACCENT_COLOR}> {session.context_metrics.is_estimate ? "~" : ""}{pct.toFixed(0)}%</Text>
            </>
          );
        } else {
          progressNode = <Text color={fg || MUTED_TEXT}>{"\u2591".repeat(7)} N/A</Text>;
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
            <Text color={fg || statusColor}>{icon}</Text>
            <Text color={fg || statusColor}> {displayStatus.padEnd(8)}</Text>
            <Text color={fg || modeColor}>{modeLabel.padEnd(8)}</Text>
            <Text color={titleColor}>{displayTitle}</Text>
            <Text>  </Text>
            {progressNode}
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

  // --- Vim footer ---
  const selectedCount = selectedIds.size;
  let footerText: string;
  if (notification) {
    const isError = notification.startsWith("!");
    const cleanMsg = isError ? notification.slice(1) : notification;
    footerText = isError ? ` \u2717 ${cleanMsg} ` : ` \u2713 ${cleanMsg} `;
  } else if (selectedCount > 0) {
    footerText = ` ${selectedCount} selected  \u2191\u2193 navigate  \u2423 toggle  a all  x clear  t tile  Esc back `;
  } else {
    footerText = ` \u2191\u2193 navigate  \u23CE focus  \u2423 select  f max  t tile  n new  Esc back `;
  }
  const footerPad = Math.max(0, terminalWidth - footerText.length);

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
        const mascotLineIndex = rowIndex - mascotTopPad;
        const mascotLine =
          mascotLineIndex >= 0 && mascotLineIndex < mascotLines.length
            ? mascotLines[mascotLineIndex]
            : "";

        const contentLine = visibleLines[rowIndex];

        const isThumb = needsScrollbar && rowIndex >= thumbStart && rowIndex < thumbEnd;
        const rightChar = isThumb ? "\u2503" : "\u2502";
        const rightColor = isThumb ? ACCENT_COLOR : BORDER_COLOR;

        return (
          <Box key={rowIndex} flexDirection="row" height={1}>
            <Text color={BORDER_COLOR}>{"\u2502"}</Text>
            <Box width={mascotDisplayWidth} justifyContent="center" flexShrink={0}>
              <Text wrap="truncate-end">{mascotLine}</Text>
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

      {/* Bottom border */}
      <Box>
        <Text color={BORDER_COLOR}>{"\u2570"}{"\u2500".repeat(Math.max(0, terminalWidth - 2))}{"\u256F"}</Text>
      </Box>

      {/* Vim-style footer */}
      <Box>
        <Text backgroundColor={ACCENT_COLOR} color="#1a1a1a">
          {footerText}{" ".repeat(footerPad)}
        </Text>
      </Box>
    </Box>
  );
}
