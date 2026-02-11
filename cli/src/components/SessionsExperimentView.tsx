/**
 * SessionsExperimentView Component
 *
 * Active sessions grouped by worktree. Responsive layout:
 * - Wide (≥62): bordered box with mascot column + shortcuts
 * - Narrow (<62): flat vertical with mascot at top, no border
 *
 * Both layouts render at natural/minimum height and scroll
 * when the terminal is shorter than the content.
 */

import React, { useRef } from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import {
  BORDER_COLOR,
  ACCENT_COLOR,
  MUTED_TEXT,
  MASCOT_WIDTH,
  CONTENT_PADDING,
  FIXED_CONTENT_HEIGHT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "./layout/theme.js";
import { formatSessionTitle, APP_ENDEARMENT } from "@jacques/core";
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
  selectedIds: Set<string>;
  showHelp: boolean;
  scrollBias: number;
  notification: string | null;
  terminalWidth: number;
  terminalHeight: number;
  isCreatingWorktree: boolean;
  newWorktreeName: string;
  worktreeCreateError: string | null;
  repoRoot: string | null;
  creatingForRepoRoot: string | null;
  projectName: string | null;
  removeDeleteBranch: boolean;
  removeForce: boolean;
}

/**
 * Compute a follow-cursor scroll offset.
 * Adjusts the offset only when the selected line is outside the visible window.
 */
function computeScroll(
  prevOffset: number,
  selectedLine: number,
  visibleRows: number,
  totalRows: number,
): number {
  let offset = prevOffset;
  if (selectedLine < offset) offset = selectedLine;
  if (selectedLine >= offset + visibleRows) offset = selectedLine - visibleRows + 1;
  return Math.max(0, Math.min(offset, totalRows - visibleRows));
}

export function SessionsExperimentView({
  items,
  selectableIndices,
  selectedIndex,
  selectedIds,
  showHelp,
  scrollBias,
  notification,
  terminalWidth,
  terminalHeight,
  isCreatingWorktree,
  newWorktreeName,
  worktreeCreateError,
  repoRoot,
  creatingForRepoRoot,
  projectName,
  removeDeleteBranch,
  removeForce,
}: SessionsExperimentViewProps): React.ReactElement {
  const isWide = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;
  const scrollRef = useRef(0);

  // --- Layout dimensions ---
  const mascotPadding = 3;
  const mascotDisplayWidth = MASCOT_WIDTH + mascotPadding;
  const wideContentWidth = Math.max(30, terminalWidth - mascotDisplayWidth - 3);
  const availableWidth = isWide
    ? wideContentWidth - CONTENT_PADDING * 2
    : terminalWidth;

  // Responsive column visibility
  const showBar = availableWidth >= 45;
  const showActivityLabel = availableWidth >= 30;

  // Mascot
  const mascotLines = MASCOT_ANSI.split("\n").filter((l) => l.trim().length > 0);

  // Shortcut legend (wide layout only)
  const shortcutRows = [
    { key: "\u2191\u2193", label: "nav" },
    { key: "\u23CE", label: "foc" },
    { key: "\u2423", label: "sel" },
    { key: "f", label: "full" },
    { key: "t", label: "tile" },
  ];

  // --- Header ---
  const headerLabel = "Sessions";

  // --- Build session content lines with position tracking ---
  const contentLines: React.ReactNode[] = [];
  const itemToContentLine = new Map<number, number>();

  if (items.length === 0) {
    contentLines.push(
      <Text key="empty" color={MUTED_TEXT}>No active sessions</Text>
    );
  }

  items.forEach((item, idx) => {
    itemToContentLine.set(idx, contentLines.length);
    switch (item.kind) {
      case "project-header": {
        contentLines.push(
          <Text key={`ph-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>~/</Text>
            <Text bold color={ACCENT_COLOR}>{item.projectName}</Text>
            <Text color={MUTED_TEXT}>/</Text>
          </Text>
        );
        break;
      }

      case "worktree-header": {
        const dot = item.isMain ? "\u25CF " : "";
        const branchName = item.branch || item.name;
        const { ahead, behind, dirty } = item;
        contentLines.push(
          <Text key={`wh-${idx}`} wrap="truncate-end">
            <Text color={ACCENT_COLOR}>{dot}</Text>
            <Text bold color="white">{branchName}</Text>
            {!item.isMain && ahead != null && ahead > 0 && <Text color="green">{` \u2191${ahead}`}</Text>}
            {!item.isMain && behind != null && behind > 0 && <Text color="yellow">{` \u2193${behind}`}</Text>}
            {dirty && <Text color="red">{" *"}</Text>}
          </Text>
        );
        break;
      }

      case "session": {
        const session = item.session;
        const isSelected = idx === currentItemIndex;
        const isMultiSelected = selectedIds.has(session.session_id);

        const nextItem = items[idx + 1];
        const isLastInGroup = !nextItem || (nextItem.kind !== "session" && nextItem.kind !== "new-session-button");
        const treeCh = isLastInGroup ? "\u2514" : "\u251C";
        const cursor = isSelected ? "\u25B6" : " ";
        const fg = isMultiSelected ? "#1a1a1a" : undefined;

        const activity = getCliActivity(session.status, session.last_tool_name);

        const mode = session.is_bypass ? "bypass" : (session.mode || "default");
        const modeColor = MODE_COLORS[mode] || MUTED_TEXT;
        const modeLabel = mode === "acceptEdits" ? "edit" : mode;

        // Responsive fixed columns budget
        // tree(2) + cursor(2) + icon(1) + activityLabel(10 or 1) + mode(8) + progress(varies)
        const fixedWidth = showBar ? 38 : showActivityLabel ? 29 : 20;
        const maxTitleLen = Math.max(0, availableWidth - fixedWidth);
        const { displayTitle } = formatSessionTitle(session.session_title, maxTitleLen);

        // Progress
        const pct = session.context_metrics?.used_percentage;
        const pctStr = pct != null
          ? `${session.context_metrics!.is_estimate ? "~" : ""}${pct.toFixed(0)}%`
          : "N/A";

        let progressNode: React.ReactNode;
        if (showBar && session.context_metrics) {
          const barW = 7;
          const filled = Math.round((pct! / 100) * barW);
          const empty = barW - filled;
          progressNode = (
            <>
              <Text color={fg || (isSelected ? "white" : ACCENT_COLOR)}>{"\u2588".repeat(filled)}</Text>
              <Text color={fg || (isSelected ? "gray" : MUTED_TEXT)}>{"\u2591".repeat(empty)}</Text>
              <Text color={fg || (isSelected ? "white" : ACCENT_COLOR)}> {pctStr}</Text>
            </>
          );
        } else if (showBar) {
          progressNode = <Text color={fg || (isSelected ? "gray" : MUTED_TEXT)}>{"\u2591".repeat(7)} {pctStr}</Text>;
        } else {
          progressNode = <Text color={fg || (isSelected ? "white" : ACCENT_COLOR)}> {pctStr}</Text>;
        }

        contentLines.push(
          <Text
            key={`s-${idx}`}
            wrap="truncate-end"
            backgroundColor={isMultiSelected ? ACCENT_COLOR : undefined}
            color={isMultiSelected ? "#1a1a1a" : undefined}
          >
            <Text color={fg || MUTED_TEXT}>{treeCh} </Text>
            <Text color={fg || (isSelected ? ACCENT_COLOR : "white")}>{cursor} </Text>
            <Text color={fg || activity.color}>{activity.icon}</Text>
            {showActivityLabel ? (
              <Text color={fg || activity.color}> {activity.label.padEnd(9)}</Text>
            ) : (
              <Text> </Text>
            )}
            <Text color={fg || modeColor}>{modeLabel.padStart(Math.ceil((8 + modeLabel.length) / 2)).padEnd(8)}</Text>
            {maxTitleLen > 0 && <Text color={fg || "white"}>{displayTitle}</Text>}
            {showBar && <Text>  </Text>}
            {progressNode}
          </Text>
        );
        break;
      }

      case "new-session-button": {
        const isSelected = idx === currentItemIndex;
        const nsbNext = items[idx + 1];
        const nsbIsLast = !nsbNext || nsbNext.kind === "spacer" || nsbNext.kind === "project-header" || nsbNext.kind === "worktree-header" || nsbNext.kind === "new-worktree-button";
        const nsbTree = nsbIsLast ? "\u2514" : "\u251C";
        contentLines.push(
          <Text key={`nsb-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>{nsbTree} </Text>
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>{isSelected ? "\u25B6" : " "} </Text>
            <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>+ New Session</Text>
          </Text>
        );
        break;
      }

      case "remove-worktree-button": {
        const isSelected = idx === currentItemIndex;
        contentLines.push(
          <Text key={`rwb-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>{"\u2514"} </Text>
            <Text color={isSelected ? "red" : MUTED_TEXT}>{isSelected ? "\u25B6" : " "} </Text>
            <Text color={isSelected ? "red" : MUTED_TEXT}>{"\u2717"} Remove worktree</Text>
          </Text>
        );
        break;
      }

      case "remove-worktree-confirm": {
        // Line 1: Confirmation header
        contentLines.push(
          <Text key={`rwc-title-${idx}`} wrap="truncate-end">
            <Text color="red" bold>{"\u25B6"} Remove &quot;{item.worktreeName}&quot;?</Text>
          </Text>
        );

        // Line 2: Status badges
        const badges: React.ReactNode[] = [];
        if (item.hasUncommittedChanges) {
          badges.push(<Text key="uc" color="yellow">{"\u26A0"} uncommitted changes</Text>);
        }
        if (item.isMergedToMain) {
          badges.push(<Text key="mg" color="green">{"\u2713"} merged</Text>);
        } else {
          badges.push(<Text key="um" color="red">{"\u2717"} unmerged</Text>);
        }
        if (item.sessionCount > 0) {
          badges.push(
            <Text key="sc" color={ACCENT_COLOR}>
              {item.sessionCount} active {item.sessionCount === 1 ? "session" : "sessions"}
            </Text>
          );
        }
        contentLines.push(
          <Text key={`rwc-status-${idx}`} wrap="truncate-end">
            <Text>{"  "}</Text>
            {badges.map((badge, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Text color={MUTED_TEXT}>{"  "}</Text>}
                {badge}
              </React.Fragment>
            ))}
          </Text>
        );

        // Line 3: Toggles
        const branchLabel = item.branch || item.worktreeName;
        contentLines.push(
          <Text key={`rwc-toggles-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>{"  "}</Text>
            <Text color={ACCENT_COLOR}>[b]</Text>
            <Text color={removeDeleteBranch ? "white" : MUTED_TEXT}>
              {removeDeleteBranch ? " \u2611" : " \u2610"} delete branch {branchLabel}
            </Text>
            {item.hasUncommittedChanges && (
              <>
                <Text color={MUTED_TEXT}>{"  "}</Text>
                <Text color={ACCENT_COLOR}>[f]</Text>
                <Text color={removeForce ? "red" : MUTED_TEXT}>
                  {removeForce ? " \u2611" : " \u2610"} force
                </Text>
              </>
            )}
          </Text>
        );

        // Line 4: Action hints
        const canConfirm = !item.hasUncommittedChanges || removeForce;
        contentLines.push(
          <Text key={`rwc-actions-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>{"  "}</Text>
            <Text color={canConfirm ? ACCENT_COLOR : MUTED_TEXT}>[Enter]</Text>
            <Text color={canConfirm ? "white" : MUTED_TEXT}> confirm</Text>
            <Text color={MUTED_TEXT}>{"  "}</Text>
            <Text color={ACCENT_COLOR}>[Esc]</Text>
            <Text color="white"> cancel</Text>
          </Text>
        );
        break;
      }

      case "new-worktree-button": {
        const isSelected = idx === currentItemIndex;
        contentLines.push(
          <Text key={`nwb-${idx}`} wrap="truncate-end">
            <Text color={isSelected ? ACCENT_COLOR : "white"}>{isSelected ? "\u25B6" : " "} </Text>
            <Text bold color={isSelected ? ACCENT_COLOR : "white"}>+ New Worktree</Text>
          </Text>
        );
        break;
      }

      case "new-worktree-input": {
        const inputRoot = creatingForRepoRoot || repoRoot;
        contentLines.push(
          <Text key={`nwi-${idx}`} wrap="truncate-end">
            <Text color={ACCENT_COLOR}>{"\u25B6"} New: </Text>
            <Text color="white">{newWorktreeName}</Text>
            <Text color={ACCENT_COLOR}>_</Text>
          </Text>
        );
        if (inputRoot) {
          contentLines.push(
            <Text key={`nwi-path-${idx}`} color={MUTED_TEXT}>
              {"  "}{inputRoot}/{newWorktreeName || "..."}
            </Text>
          );
        }
        if (worktreeCreateError) {
          contentLines.push(
            <Text key={`nwi-err-${idx}`} color="red">
              {"  "}{worktreeCreateError}
            </Text>
          );
        }
        break;
      }

      case "show-all-worktrees-button": {
        const label = `${item.hiddenCount} more worktree${item.hiddenCount === 1 ? "" : "s"} [d]`;
        contentLines.push(
          <Text key={`sawb-${idx}`} wrap="truncate-end">
            <Text color={MUTED_TEXT}>  {label}</Text>
          </Text>
        );
        break;
      }

      case "spacer": {
        contentLines.push(<Text key={`sp-${idx}`}> </Text>);
        break;
      }
    }
  });

  // --- Bottom controls ---
  const { element: bottomControlsElement, width: controlsWidth } = buildBottomControls([
    { key: "Esc", label: "back " },
    { key: "d", label: "etails " },
    { key: "h", label: "elp" },
  ]);

  // --- Notification ---
  let bottomNotificationText = "";
  let bottomIsNotification = false;
  let bottomIsError = false;
  if (notification) {
    const isError = notification.startsWith("!");
    const cleanMsg = isError ? notification.slice(1) : notification;
    const maxLen = terminalWidth - 6;
    const truncated = cleanMsg.length > maxLen ? cleanMsg.substring(0, maxLen - 3) + "..." : cleanMsg;
    bottomNotificationText = isError ? `\u2717 ${truncated}` : `\u2713 ${truncated}`;
    bottomIsNotification = true;
    bottomIsError = isError;
  }

  // ========== WIDE LAYOUT (≥62) ==========
  if (isWide) {
    const showVersion = terminalWidth >= 70;

    // Right column: header + spacer + session content
    const allLines: React.ReactNode[] = [
      <Text key="header" bold color={ACCENT_COLOR}>{headerLabel}</Text>,
      <Text key="header-spacer"> </Text>,
      ...contentLines,
    ];

    const mascotTopPad = Math.floor((FIXED_CONTENT_HEIGHT - mascotLines.length) / 2);
    const shortcutsStart = mascotTopPad + mascotLines.length + 1;
    const minMascotColumnHeight = showHelp
      ? shortcutsStart + shortcutRows.length
      : mascotTopPad + mascotLines.length;
    const totalRows = Math.max(minMascotColumnHeight, allLines.length);

    // --- Scroll ---
    const totalWideHeight = totalRows + 2; // +2 for top/bottom borders
    const needsScroll = totalWideHeight > terminalHeight;
    const visibleRows = needsScroll ? Math.max(1, terminalHeight - 2) : totalRows;

    // Find which row the selected item is at in allLines (offset by 2 for header + spacer)
    const selContentIdx = itemToContentLine.get(currentItemIndex);
    const selRow = selContentIdx != null ? selContentIdx + 2 : 0;

    if (needsScroll) {
      scrollRef.current = computeScroll(scrollRef.current, selRow, visibleRows, totalRows);
    } else {
      scrollRef.current = 0;
    }

    // Apply scroll bias for rendering (positive = scroll up toward top, negative = scroll down)
    // scrollRef tracks pure cursor-follow; bias is only for display
    const scrollStart = needsScroll
      ? Math.max(0, Math.min(scrollRef.current - scrollBias, totalRows - visibleRows))
      : 0;
    const canScrollUp = needsScroll && scrollStart > 0;
    const canScrollDown = needsScroll && scrollStart + visibleRows < totalRows;

    // Top border
    const borderTitle = "\u2500 Jacques";
    const borderVersion = showVersion ? " v0.1.0 " : " ";
    const scrollUpInd = canScrollUp ? " \u25B2" : "";
    const topRemaining = Math.max(0, terminalWidth - borderTitle.length - borderVersion.length - scrollUpInd.length - 2);

    // Bottom border
    const scrollDownInd = canScrollDown ? "\u25BC " : "";
    const bottomTextWidth = bottomIsNotification ? bottomNotificationText.length : controlsWidth;
    const totalBottomDashes = Math.max(0, terminalWidth - bottomTextWidth - scrollDownInd.length - 2);
    const bottomLeftBorder = Math.max(1, Math.floor(totalBottomDashes / 2));
    const bottomRightBorder = Math.max(1, totalBottomDashes - bottomLeftBorder);

    return (
      <Box flexDirection="column">
        {/* Top border */}
        <Box>
          <Text color={BORDER_COLOR}>{"\u256D"}</Text>
          <Text color={ACCENT_COLOR}>{borderTitle}</Text>
          <Text color={MUTED_TEXT}>{borderVersion}</Text>
          <Text color={BORDER_COLOR}>{"\u2500".repeat(topRemaining)}</Text>
          {canScrollUp && <Text color={MUTED_TEXT}>{scrollUpInd}</Text>}
          <Text color={BORDER_COLOR}>{"\u256E"}</Text>
        </Box>

        {/* Content rows with mascot */}
        {Array.from({ length: visibleRows }).map((_, i) => {
          const rowIndex = scrollStart + i;
          const mascotIdx = rowIndex - mascotTopPad;
          let leftCell: React.ReactNode = <Text> </Text>;
          if (mascotIdx >= 0 && mascotIdx < mascotLines.length) {
            leftCell = <Text wrap="truncate-end">{mascotLines[mascotIdx]}</Text>;
          } else if (showHelp) {
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

          const contentLine = allLines[rowIndex];

          return (
            <Box key={rowIndex} flexDirection="row" height={1}>
              <Text color={BORDER_COLOR}>{"\u2502"}</Text>
              <Box width={mascotDisplayWidth} justifyContent="center" flexShrink={0}>
                {leftCell}
              </Box>
              <Text color={BORDER_COLOR}>{"\u2502"}</Text>
              <Box
                width={wideContentWidth}
                paddingLeft={CONTENT_PADDING}
                paddingRight={CONTENT_PADDING}
                flexShrink={0}
              >
                {contentLine || <Text> </Text>}
              </Box>
              <Text color={BORDER_COLOR}>{"\u2502"}</Text>
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
            bottomControlsElement
          )}
          <Text color={BORDER_COLOR}>
            {"\u2500".repeat(bottomRightBorder)}
          </Text>
          {canScrollDown && <Text color={MUTED_TEXT}>{scrollDownInd}</Text>}
          <Text color={BORDER_COLOR}>{"\u256F"}</Text>
        </Box>
      </Box>
    );
  }

  // ========== NARROW LAYOUT (<62) ==========
  // Build flat line array for scroll support
  const showNarrowVersion = terminalWidth >= 30;
  const narrowLines: React.ReactNode[] = [];

  // Spacer (marginTop=1)
  narrowLines.push(<Text key="n-mt"> </Text>);

  // Mascot + name rendered line-by-line (ANSI mascot must be per-line in row contexts)
  const mascotCenter = Math.floor((mascotLines.length - 1) / 2);
  for (let mi = 0; mi < mascotLines.length; mi++) {
    const textLineIndex = mi - mascotCenter;
    if (textLineIndex >= 0 && textLineIndex <= 2) {
      let textContent: React.ReactNode;
      if (textLineIndex === 0) {
        textContent = <Text color={MUTED_TEXT}>{APP_ENDEARMENT}</Text>;
      } else if (textLineIndex === 1) {
        textContent = <Text bold color={ACCENT_COLOR}>Jacques{showNarrowVersion ? <Text color={MUTED_TEXT}> v0.1.0</Text> : ""}</Text>;
      } else {
        textContent = <Text color="white">Sessions Manager</Text>;
      }
      narrowLines.push(
        <Box key={`n-m-${mi}`} flexDirection="row">
          <Box flexDirection="column" flexShrink={0}>
            <Text wrap="truncate-end">{mascotLines[mi]}</Text>
          </Box>
          <Box marginLeft={2}>
            {textContent}
          </Box>
        </Box>
      );
    } else {
      narrowLines.push(<Text key={`n-m-${mi}`} wrap="truncate-end">{mascotLines[mi]}</Text>);
    }
  }

  // Spacer (marginBottom=1)
  narrowLines.push(<Text key="n-mb"> </Text>);

  // Shortcuts (toggled with h)
  if (showHelp) {
    shortcutRows.forEach((sc, i) => {
      narrowLines.push(
        <Text key={`n-sc-${i}`} color={MUTED_TEXT}>  {sc.key.padEnd(3)} {sc.label}</Text>
      );
    });
  }

  // Spacer before header
  narrowLines.push(<Text key="n-hs"> </Text>);

  // Header
  narrowLines.push(<Text key="n-hdr" bold color={ACCENT_COLOR}>{headerLabel}</Text>);

  // Spacer before content
  narrowLines.push(<Text key="n-cs"> </Text>);

  // Content lines start index (for mapping selected item to line number)
  const narrowContentStart = narrowLines.length;

  contentLines.forEach((line, i) => {
    narrowLines.push(<Box key={`n-cl-${i}`}>{line}</Box>);
  });

  // Spacer before controls
  narrowLines.push(<Text key="n-bs"> </Text>);

  // Controls
  narrowLines.push(
    <Box key="n-ctrl">
      {bottomIsNotification ? (
        <Text color={bottomIsError ? "red" : "green"}>{bottomNotificationText}</Text>
      ) : (
        bottomControlsElement
      )}
    </Box>
  );

  // --- Narrow scroll ---
  const narrowTotal = narrowLines.length;
  const narrowNeedsScroll = narrowTotal > terminalHeight;
  const narrowVisible = narrowNeedsScroll ? terminalHeight : narrowTotal;

  const narrowSelIdx = itemToContentLine.get(currentItemIndex);
  const narrowSelLine = narrowSelIdx != null ? narrowContentStart + narrowSelIdx : 0;

  if (narrowNeedsScroll) {
    scrollRef.current = computeScroll(scrollRef.current, narrowSelLine, narrowVisible, narrowTotal);
  } else {
    scrollRef.current = 0;
  }

  // Apply scroll bias for rendering
  const narrowStart = narrowNeedsScroll
    ? Math.max(0, Math.min(scrollRef.current - scrollBias, narrowTotal - narrowVisible))
    : 0;
  const narrowSlice = narrowLines.slice(narrowStart, narrowStart + narrowVisible);

  return (
    <Box flexDirection="column">
      {narrowSlice}
    </Box>
  );
}
