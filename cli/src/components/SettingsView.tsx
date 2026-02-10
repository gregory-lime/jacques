/**
 * Settings View Component
 *
 * Displays and allows configuration of settings:
 * - Claude Code connection
 * - Auto-archive toggle
 * - Catalog extraction
 * - Archive browsing
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import { BORDER_COLOR, ACCENT_COLOR, MUTED_TEXT } from "./layout/index.js";

const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

export interface ArchiveStatsData {
  totalConversations: number;
  totalProjects: number;
  totalSize: string;
  archivePath: string;
}

interface SettingsViewProps {
  terminalWidth: number;
  selectedIndex: number;
  autoArchive: boolean;
  stats: ArchiveStatsData | null;
  loading?: boolean;
  scrollOffset?: number;
  // Claude Connection props
  claudeConnected?: boolean;
  claudeTokenMasked?: string | null;
  claudeTokenInput?: string;
  claudeTokenError?: string | null;
  isTokenInputMode?: boolean;
  isTokenVerifying?: boolean;
  showConnectionSuccess?: boolean;
  // Notification props
  notificationsEnabled?: boolean;
  notificationsLoading?: boolean;
}

// Settings items:
// Index 0: Claude Connection (input/status)
// Index 1: Auto-archive toggle
// Index 2: Notifications toggle
// Index 3: Extract Catalog button
// Index 4: Re-extract All button
// Index 5: Browse Archive button
const TOTAL_ITEMS = 6;

export { TOTAL_ITEMS as SETTINGS_TOTAL_ITEMS };

export function SettingsView({
  terminalWidth,
  selectedIndex,
  autoArchive,
  stats,
  loading = false,
  scrollOffset = 0,
  // Claude Connection props
  claudeConnected = false,
  claudeTokenMasked = null,
  claudeTokenInput = "",
  claudeTokenError = null,
  isTokenInputMode = false,
  isTokenVerifying = false,
  showConnectionSuccess = false,
  notificationsEnabled = false,
  notificationsLoading = false,
}: SettingsViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text bold color={ACCENT_COLOR}>
      Settings
    </Text>
  );
  contentLines.push(<Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>);

  // Claude Code Connection section
  contentLines.push(<Box />);
  contentLines.push(<Text color={MUTED_TEXT}>Claude Code Connection:</Text>);

  const claudeSelected = selectedIndex === 0;

  if (claudeConnected && claudeTokenMasked) {
    // Connected state
    contentLines.push(
      <Text color={claudeSelected ? ACCENT_COLOR : "white"}>
        {claudeSelected ? "> " : "  "}
        <Text color="green">●</Text> Connected
        <Text color={MUTED_TEXT}> ({claudeTokenMasked})</Text>
      </Text>
    );
  } else if (isTokenInputMode) {
    // Token input mode - show two-step instructions
    contentLines.push(
      <Text color={MUTED_TEXT} wrap="truncate">
        {"  "}1. Run: <Text color="white">claude setup-token</Text>
      </Text>
    );
    contentLines.push(
      <Text color={MUTED_TEXT} wrap="truncate">
        {"  "}2. Paste token here:
      </Text>
    );
    // Truncate long token input - show last 20 chars with "..." prefix
    const maxDisplayLength = 20;
    let displayToken = claudeTokenInput || "";
    if (displayToken.length > maxDisplayLength) {
      displayToken = "..." + displayToken.slice(-maxDisplayLength);
    }
    if (isTokenVerifying) {
      contentLines.push(
        <Text color={ACCENT_COLOR} wrap="truncate">
          {"     "}Verifying...
        </Text>
      );
    } else {
      contentLines.push(
        <Text color={ACCENT_COLOR} wrap="truncate">
          {"     "}{displayToken}_
        </Text>
      );
    }
    if (claudeTokenError) {
      contentLines.push(
        <Text color="red" wrap="truncate">{"     "}{claudeTokenError}</Text>
      );
    }
  } else {
    // Not connected state
    contentLines.push(
      <Text color={claudeSelected ? ACCENT_COLOR : "white"}>
        {claudeSelected ? "> " : "  "}
        <Text color={MUTED_TEXT}>○</Text> Not connected
        <Text color={MUTED_TEXT}> (press Enter to connect)</Text>
      </Text>
    );
  }

  // Auto-archive toggle (index 1)
  contentLines.push(<Box />);
  contentLines.push(<Text color={MUTED_TEXT}>Auto-Archive:</Text>);

  const autoArchiveSelected = selectedIndex === 1;
  const checkIcon = autoArchive ? "[x]" : "[ ]";
  contentLines.push(
    <Text color={autoArchiveSelected ? ACCENT_COLOR : "white"}>
      {autoArchiveSelected ? "> " : "  "}
      {checkIcon} Auto-archive on session end
    </Text>
  );

  // Notifications toggle (index 2)
  contentLines.push(<Box />);
  contentLines.push(<Text color={MUTED_TEXT}>Notifications:</Text>);

  const notifSelected = selectedIndex === 2;
  const notifIcon = notificationsLoading ? "..." : notificationsEnabled ? "[x]" : "[ ]";
  contentLines.push(
    <Text color={notifSelected ? ACCENT_COLOR : "white"}>
      {notifSelected ? "> " : "  "}
      {notifIcon} Desktop notifications
    </Text>
  );

  // Catalog Actions section (indices 3-5)
  contentLines.push(<Box />);
  contentLines.push(<Text color={MUTED_TEXT}>Catalog Actions:</Text>);

  const extractSelected = selectedIndex === 3;
  contentLines.push(
    <Text color={extractSelected ? ACCENT_COLOR : "white"}>
      {extractSelected ? "> " : "  "}
      Extract Catalog
      <Text color={MUTED_TEXT}> (extract sessions, plans, subagents)</Text>
    </Text>
  );

  const reextractSelected = selectedIndex === 4;
  contentLines.push(
    <Text color={reextractSelected ? ACCENT_COLOR : "white"}>
      {reextractSelected ? "> " : "  "}
      Re-extract All
      <Text color={MUTED_TEXT}> (force re-extract everything)</Text>
    </Text>
  );

  const browseSelected = selectedIndex === 5;
  contentLines.push(
    <Text color={browseSelected ? ACCENT_COLOR : "white"}>
      {browseSelected ? "> " : "  "}
      Browse Archive
      <Text color={MUTED_TEXT}> (view conversations)</Text>
    </Text>
  );

  // Archive stats section
  contentLines.push(<Box />);
  contentLines.push(<Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>);
  contentLines.push(<Text color={MUTED_TEXT}>Archive Stats</Text>);

  if (loading) {
    contentLines.push(<Text color={MUTED_TEXT}>Loading...</Text>);
  } else if (stats) {
    contentLines.push(
      <Text color={MUTED_TEXT}>
        Location: {stats.archivePath}
      </Text>
    );
    contentLines.push(
      <Text color={MUTED_TEXT}>
        Total: {stats.totalConversations} conversations | {stats.totalProjects}{" "}
        projects | {stats.totalSize}
      </Text>
    );
  } else {
    contentLines.push(
      <Text color={MUTED_TEXT}>No archive yet - save a conversation first</Text>
    );
  }

  // Footer
  contentLines.push(<Box />);
  contentLines.push(
    <Text color={MUTED_TEXT}>
      [↑↓] Navigate [Space/Enter] Select [Esc] Back
    </Text>
  );

  // Calculate scroll indicators
  const totalLines = contentLines.length;
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + FIXED_CONTENT_HEIGHT < totalLines;

  if (useHorizontalLayout) {
    return (
      <SettingsHorizontalLayout
        content={contentLines}
        terminalWidth={terminalWidth}
        showVersion={showVersion}
        showConnectionSuccess={showConnectionSuccess}
        scrollOffset={scrollOffset}
        hasMoreAbove={hasMoreAbove}
        hasMoreBelow={hasMoreBelow}
      />
    );
  }

  return (
    <SettingsVerticalLayout
      content={contentLines}
      showVersion={showVersion}
      showConnectionSuccess={showConnectionSuccess}
      scrollOffset={scrollOffset}
    />
  );
}

// Horizontal layout (matching Dashboard.tsx pattern)
interface SettingsHorizontalLayoutProps {
  content: React.ReactNode[];
  terminalWidth: number;
  showVersion: boolean;
  showConnectionSuccess?: boolean;
  scrollOffset?: number;
  hasMoreAbove?: boolean;
  hasMoreBelow?: boolean;
}

function SettingsHorizontalLayout({
  content,
  terminalWidth,
  showVersion,
  showConnectionSuccess = false,
  scrollOffset = 0,
  hasMoreAbove = false,
  hasMoreBelow = false,
}: SettingsHorizontalLayoutProps): React.ReactElement {
  const mascotVisualWidth = MASCOT_WIDTH;
  const mascotPadding = 3;
  const mascotDisplayWidth = mascotVisualWidth + mascotPadding;
  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    terminalWidth - mascotDisplayWidth - 3
  );

  const mascotLines = MASCOT_ANSI.split("\n").filter(
    (line) => line.trim().length > 0
  );
  const mascotHeight = mascotLines.length;
  // Add 1 to height when showing success message for extra breathing room
  const totalHeight = showConnectionSuccess ? FIXED_CONTENT_HEIGHT + 1 : FIXED_CONTENT_HEIGHT;
  const mascotTopPadding = Math.floor((totalHeight - mascotHeight) / 2);

  // Apply scroll offset to content
  const visibleContent = content.slice(scrollOffset, scrollOffset + totalHeight);

  const titlePart = "─ Jacques";
  const versionPart = showVersion ? " v0.1.0" : "";
  const titleLength = titlePart.length + versionPart.length;
  const remainingBorder = Math.max(0, terminalWidth - titleLength - 3);

  const bottomControlsText = "[Esc] Back";
  const bottomControlsLength = bottomControlsText.length;
  const totalBottomDashes = terminalWidth - bottomControlsLength - 2;
  const bottomLeftBorder = Math.max(0, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(0, totalBottomDashes - bottomLeftBorder);

  // Total box height: 1 (top border) + totalHeight (content rows) + 1 (bottom border)
  const boxHeight = totalHeight + 2;

  return (
    <Box flexDirection="column" height={boxHeight}>
      <Box>
        <Text color={BORDER_COLOR}>╭</Text>
        <Text color={ACCENT_COLOR}>{titlePart}</Text>
        {showVersion && <Text color={MUTED_TEXT}>{versionPart}</Text>}
        <Text color={BORDER_COLOR}> {"─".repeat(remainingBorder)}╮</Text>
      </Box>

      {Array.from({ length: totalHeight }).map((_, rowIndex) => {
        const mascotLineIndex = rowIndex - mascotTopPadding;
        const mascotLine =
          mascotLineIndex >= 0 && mascotLineIndex < mascotLines.length
            ? mascotLines[mascotLineIndex]
            : "";

        // Show "Connected!" below the mascot when success flag is set
        const successMessageRow = mascotTopPadding + mascotHeight;
        const showSuccessOnThisRow = showConnectionSuccess && rowIndex === successMessageRow;

        const contentLine = visibleContent[rowIndex];

        // Show scroll indicators on first/last row of content area
        let scrollIndicator = "";
        if (rowIndex === 0 && hasMoreAbove) {
          scrollIndicator = " ▲";
        } else if (rowIndex === totalHeight - 1 && hasMoreBelow) {
          scrollIndicator = " ▼";
        }

        return (
          <Box key={rowIndex} flexDirection="row" height={1}>
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={mascotDisplayWidth}
              justifyContent="center"
              flexShrink={0}
            >
              {showSuccessOnThisRow ? (
                <Text color="green" bold>Connected!</Text>
              ) : (
                <Text wrap="truncate-end">{mascotLine}</Text>
              )}
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={contentWidth}
              paddingLeft={CONTENT_PADDING}
              paddingRight={CONTENT_PADDING}
              flexShrink={0}
            >
              {contentLine || <Text> </Text>}
              {scrollIndicator && <Text color={MUTED_TEXT}>{scrollIndicator}</Text>}
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
          </Box>
        );
      })}

      <Box>
        <Text color={BORDER_COLOR}>╰{"─".repeat(bottomLeftBorder)}</Text>
        <Text color={ACCENT_COLOR}>[Esc]</Text>
        <Text color={MUTED_TEXT}> Back</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}

// Vertical layout (matching Dashboard.tsx pattern)
interface SettingsVerticalLayoutProps {
  content: React.ReactNode[];
  showVersion: boolean;
  showConnectionSuccess?: boolean;
  scrollOffset?: number;
}

function SettingsVerticalLayout({
  content,
  showVersion,
  showConnectionSuccess = false,
  scrollOffset = 0,
}: SettingsVerticalLayoutProps): React.ReactElement {
  // Apply scroll offset for vertical layout too
  const visibleContent = content.slice(scrollOffset, scrollOffset + FIXED_CONTENT_HEIGHT);

  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_COLOR}>
        Jacques
        {showVersion && <Text color={MUTED_TEXT}> v0.1.0</Text>}
      </Text>

      <Box marginTop={1}>
        <Text wrap="truncate-end">{MASCOT_ANSI}</Text>
      </Box>

      {showConnectionSuccess && (
        <Box>
          <Text color="green" bold>Connected!</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        {visibleContent.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color={ACCENT_COLOR}>[Esc]</Text>
          <Text color={MUTED_TEXT}> Back</Text>
        </Text>
      </Box>
    </Box>
  );
}

export default SettingsView;
