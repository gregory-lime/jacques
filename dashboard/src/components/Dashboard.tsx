/**
 * Dashboard Component
 *
 * Responsive layout inspired by Claude Code:
 * - Horizontal with border on wide screens
 * - Vertical without border on narrow screens
 * - Soft coral/peach color palette
 * - Proper ANSI art handling
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import type { VerticalMenuItem } from "./VerticalMenu.js";
import { ProgressBar } from "./ProgressBar.js";
import type { Session, ObsidianVault, ObsidianFile, FlatTreeItem, HandoffEntry, ArchiveProgress, ArchiveInitResult, ConversationManifest, ProjectStatistics, ProjectSessionItem, PlanEntry, PlanProgress, PlanProgressListItem } from "@jacques/core";
import { LoadContextView } from "./LoadContextView.js";
import { SourceSelectionView } from "./SourceSelectionView.js";
import type { SourceItem } from "./SourceSelectionView.js";
import { ObsidianConfigView } from "./ObsidianConfigView.js";
import { ObsidianBrowserView } from "./ObsidianBrowserView.js";
import { AddContextConfirmView } from "./AddContextConfirmView.js";
import { SettingsView } from "./SettingsView.js";
import type { ArchiveStatsData } from "./SettingsView.js";
import { HandoffBrowserView } from "./HandoffBrowserView.js";
import { GoogleDocsBrowserView } from "./GoogleDocsBrowserView.js";
import { NotionBrowserView } from "./NotionBrowserView.js";
import { LLMWorkingView } from "./LLMWorkingView.js";
import type { LLMWorkingViewProps } from "./LLMWorkingView.js";
import { ArchiveBrowserView } from "./ArchiveBrowserView.js";
import type { ArchiveListItem } from "./ArchiveBrowserView.js";
import { ArchiveInitProgressView } from "./ArchiveInitProgressView.js";
import { ProjectDashboardView } from "./ProjectDashboardView.js";
import { PlanViewerView } from "./PlanViewerView.js";

// View types for the dashboard
export type DashboardView =
  | "main"
  | "save"
  | "load"
  | "load-sources"
  | "obsidian-config"
  | "obsidian-browser"
  | "google-docs-browser"
  | "notion-browser"
  | "add-context-confirm"
  | "fetch"
  | "settings"
  | "sessions"
  | "handoff-browser"
  | "llm-working"
  | "archive-browser"
  | "archive-initializing"
  | "project-dashboard"
  | "plan-viewer";

interface DashboardProps {
  sessions: Session[];
  focusedSessionId: string | null;
  connected: boolean;
  currentView: DashboardView;
  selectedMenuIndex: number;
  // Save flow props
  savePreview?: SavePreviewData | null;
  saveLabel?: string;
  saveError?: string | null;
  saveSuccess?: SaveSuccessData | null;
  saveScrollOffset?: number;
  // Scroll state for Active Sessions
  sessionsScrollOffset?: number;
  selectedSessionIndex?: number;
  // LoadContext flow props
  loadContextIndex?: number;
  sourceItems?: SourceItem[];
  selectedSourceIndex?: number;
  // Obsidian config props
  obsidianVaults?: ObsidianVault[];
  obsidianConfigIndex?: number;
  obsidianManualPath?: string;
  obsidianManualMode?: boolean;
  obsidianConfigError?: string | null;
  // Obsidian browser props
  obsidianVaultName?: string;
  obsidianTreeItems?: FlatTreeItem[];
  obsidianFileIndex?: number;
  obsidianScrollOffset?: number;
  obsidianBrowserLoading?: boolean;
  obsidianBrowserError?: string | null;
  // Add context confirm props
  selectedObsidianFile?: ObsidianFile | null;
  addContextDescription?: string;
  addContextSuccess?: { name: string; path: string } | null;
  addContextError?: string | null;
  // Settings props
  settingsIndex?: number;
  settingsScrollOffset?: number;
  autoArchiveEnabled?: boolean;
  archiveStats?: ArchiveStatsData | null;
  archiveStatsLoading?: boolean;
  // Claude token props
  claudeConnected?: boolean;
  claudeTokenMasked?: string | null;
  claudeTokenInput?: string;
  claudeTokenError?: string | null;
  isTokenInputMode?: boolean;
  isTokenVerifying?: boolean;
  showConnectionSuccess?: boolean;
  // Handoff browser props
  handoffEntries?: HandoffEntry[];
  handoffSelectedIndex?: number;
  handoffScrollOffset?: number;
  handoffBrowserLoading?: boolean;
  handoffBrowserError?: string | null;
  // Google Docs browser props
  googleDocsTreeItems?: FlatTreeItem[];
  googleDocsFileIndex?: number;
  googleDocsScrollOffset?: number;
  googleDocsBrowserLoading?: boolean;
  googleDocsBrowserError?: string | null;
  // Notion browser props
  notionWorkspaceName?: string;
  notionTreeItems?: FlatTreeItem[];
  notionFileIndex?: number;
  notionScrollOffset?: number;
  notionBrowserLoading?: boolean;
  notionBrowserError?: string | null;
  // LLM working props
  llmWorkingTitle?: string;
  llmWorkingDescription?: string;
  llmWorkingElapsedSeconds?: number;
  // LLM streaming props
  llmStreamingText?: string;
  llmInputTokens?: number;
  llmOutputTokens?: number;
  llmCurrentStage?: string;
  // Archive browser props
  archiveItems?: ArchiveListItem[];
  archiveSelectedIndex?: number;
  archiveScrollOffset?: number;
  archiveBrowserLoading?: boolean;
  archiveBrowserError?: string | null;
  // Archive initialization props
  archiveInitProgress?: ArchiveProgress | null;
  archiveInitResult?: ArchiveInitResult | null;
  // Project dashboard props
  projectDashboardStats?: ProjectStatistics | null;
  projectDashboardSessions?: ProjectSessionItem[];
  projectDashboardPlans?: PlanEntry[];
  projectDashboardSection?: "sessions" | "plans";
  projectDashboardSelectedIndex?: number;
  projectDashboardScrollOffset?: number;
  projectDashboardLoading?: boolean;
  planProgressMap?: Map<string, PlanProgressListItem>;
  // Plan viewer props
  planViewerPlan?: PlanEntry | null;
  planViewerContent?: string;
  planViewerScrollOffset?: number;
  planViewerProgress?: PlanProgress | null;
  planViewerProgressLoading?: boolean;
  // Notification (displayed in bottom border)
  notification?: string | null;
}

export interface SavePreviewData {
  sessionSlug: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  durationMinutes: number;
  filterLabel?: string;
}

export interface SaveSuccessData {
  filename: string;
  filePath: string;
  fileSize: string;
}

// Softer coral/peach color matching mascot skin tone
const BORDER_COLOR = "#E67E52";
const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";
const MASCOT_WIDTH = 14; // Actual mascot pixel width
const MIN_CONTENT_WIDTH = 42; // Reduced to allow narrower horizontal layout
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62; // Break to vertical only when really necessary
const FIXED_CONTENT_HEIGHT = 10; // Fixed height for consistent box size (reduced from 14)

/**
 * Progress bar line with percentage and token counts
 */
function ProgressLine({
  session,
}: {
  session: Session | null;
}): React.ReactElement {
  if (!session || !session.context_metrics) {
    return (
      <Box>
        <Text color={MUTED_TEXT}>{"░".repeat(20)} N/A</Text>
      </Box>
    );
  }

  const metrics = session.context_metrics;
  const percentage = metrics.used_percentage;
  const maxTokens = metrics.context_window_size;
  const totalSessionTokens = metrics.total_input_tokens;

  // Calculate current context tokens from percentage
  // (total_input_tokens is cumulative across the session, not current context)
  const currentTokens = Math.round(maxTokens * (percentage / 100));

  // Format tokens with K suffix
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return tokens.toString();
  };

  // Show total session tokens if significantly different from current
  const showSessionTotal = totalSessionTokens > currentTokens * 1.5;

  return (
    <Box>
      <ProgressBar
        percentage={percentage}
        width={20}
        showLabel={false}
        isEstimate={metrics.is_estimate}
      />
      <Text color={ACCENT_COLOR}>
        {" "}
        {metrics.is_estimate ? "~" : ""}
        {percentage.toFixed(1)}%
      </Text>
      <Text color={MUTED_TEXT}>
        {" "}
        ({formatTokens(currentTokens)}/{formatTokens(maxTokens)})
      </Text>
      {showSessionTotal && (
        <Text color={MUTED_TEXT}>
          {" "}
          • {formatTokens(totalSessionTokens)} session
        </Text>
      )}
    </Box>
  );
}

/**
 * Project and session title line
 */
function ProjectLine({
  session,
}: {
  session: Session | null;
}): React.ReactElement {
  if (!session) {
    return <Text color={MUTED_TEXT}>No active session</Text>;
  }

  const project = session.project || "unknown";
  const title = session.session_title || "Untitled";

  // Truncate if too long
  const maxLength = 35;
  const truncatedProject =
    project.length > maxLength
      ? project.substring(0, maxLength - 3) + "..."
      : project;

  const truncatedTitle =
    title.length > maxLength
      ? title.substring(0, maxLength - 3) + "..."
      : title;

  return (
    <Text>
      {truncatedProject}
      <Text color={MUTED_TEXT}> / </Text>
      {truncatedTitle}
    </Text>
  );
}

/**
 * Vertical layout (no border) for narrow terminals
 */
interface VerticalLayoutProps {
  content: React.ReactNode[];
  title: string;
  showVersion: boolean;
  sessionCount?: number;
  notification?: string | null;
}

function VerticalLayout({
  content,
  title,
  showVersion,
  sessionCount,
  notification,
}: VerticalLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Title */}
      <Text bold color={ACCENT_COLOR}>
        {title}
        {showVersion && <Text color={MUTED_TEXT}> v0.1.0</Text>}
      </Text>

      {/* Mascot - no width constraint, wrap=truncate-end for ANSI codes */}
      <Box marginTop={1}>
        <Text wrap="truncate-end">{MASCOT_ANSI}</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" marginTop={1}>
        {content.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </Box>

      {/* Bottom - notification or controls */}
      <Box marginTop={1}>
        {notification ? (
          (() => {
            const isError = notification.startsWith("!");
            const cleanMessage = isError ? notification.slice(1) : notification;
            return (
              <Text color={isError ? "red" : "green"}>
                {isError ? "✗" : "✓"} {cleanMessage}
              </Text>
            );
          })()
        ) : (
          <Text>
            <Text color={ACCENT_COLOR}>[Q]</Text>
            <Text color={MUTED_TEXT}>uit </Text>
            <Text color={ACCENT_COLOR}>[S]</Text>
            <Text color={MUTED_TEXT}>ettings</Text>
            {sessionCount !== undefined && (
              <>
                <Text color={ACCENT_COLOR}> [A]</Text>
                <Text color={MUTED_TEXT}>ctive ({sessionCount})</Text>
              </>
            )}
            <Text color={ACCENT_COLOR}> [P]</Text>
            <Text color={MUTED_TEXT}>roject</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Horizontal layout with border for wide terminals
 */
interface HorizontalLayoutProps {
  content: React.ReactNode[];
  terminalWidth: number;
  title: string;
  showVersion: boolean;
  sessionCount?: number;
  notification?: string | null;
}

function HorizontalLayout({
  content,
  terminalWidth,
  title,
  showVersion,
  sessionCount,
  notification,
}: HorizontalLayoutProps): React.ReactElement {
  // Calculate dimensions - make fully responsive to terminal width
  // Mascot visual width matches pixel width (14) - ANSI codes don't add visual width
  const mascotVisualWidth = MASCOT_WIDTH; // 14 chars
  const mascotPadding = 3; // Padding around mascot for spacing
  const mascotDisplayWidth = mascotVisualWidth + mascotPadding;

  // Calculate content width to fill remaining terminal width
  // Content row structure: │ (1) + mascot (mascotDisplayWidth) + │ (1) + content (contentWidth) + │ (1)
  // Total: 1 + mascotDisplayWidth + 1 + contentWidth + 1 = mascotDisplayWidth + contentWidth + 3
  // We want: mascotDisplayWidth + contentWidth + 3 = terminalWidth
  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    terminalWidth - mascotDisplayWidth - 3, // 3 = 2 borders + 1 separator
  );

  // Split mascot into individual lines for rendering
  const mascotLines = MASCOT_ANSI.split("\n").filter(
    (line) => line.trim().length > 0,
  );

  // Use fixed height for consistent box size
  const mascotHeight = mascotLines.length;
  const totalHeight = FIXED_CONTENT_HEIGHT;
  const mascotTopPadding = Math.floor((totalHeight - mascotHeight) / 2);

  // Limit content to visible area (for scrolling support later)
  const visibleContent = content.slice(0, totalHeight);

  // Title that crosses the border
  const titlePart = `─ ${title}`;
  const versionPart = showVersion ? ` v0.1.0` : "";
  const titleLength = titlePart.length + versionPart.length;

  // Top border: ╭ (1) + title + " " (1) + dashes + ╮ (1)
  // Total: 1 + titleLength + 1 + remainingBorder + 1 = terminalWidth
  // So: remainingBorder = terminalWidth - titleLength - 3
  const remainingBorder = Math.max(0, terminalWidth - titleLength - 3);

  // Bottom content - either notification or controls
  let bottomText: string;
  let bottomIsNotification = false;
  let bottomIsError = false;

  if (notification) {
    // Check if notification is an error (prefixed with !)
    const isError = notification.startsWith("!");
    const cleanMessage = isError ? notification.slice(1) : notification;

    // Show notification with icon - truncate if needed
    const maxNotificationLength = terminalWidth - 6; // Leave room for borders and padding
    const truncatedNotification = cleanMessage.length > maxNotificationLength
      ? cleanMessage.substring(0, maxNotificationLength - 3) + "..."
      : cleanMessage;
    bottomText = isError ? `✗ ${truncatedNotification}` : `✓ ${truncatedNotification}`;
    bottomIsNotification = true;
    bottomIsError = isError;
  } else {
    // Show controls
    const activeText = sessionCount !== undefined ? ` [A]ctive (${sessionCount})` : "";
    bottomText = `[Q]uit${activeText} [P]roject`;
  }

  const bottomTextLength = bottomText.length;
  const totalBottomDashes = terminalWidth - bottomTextLength - 2;
  const bottomLeftBorder = Math.max(0, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(0, totalBottomDashes - bottomLeftBorder);

  // Total box height: 1 (top border) + totalHeight (content rows) + 1 (bottom border)
  const boxHeight = totalHeight + 2;

  return (
    <Box flexDirection="column" height={boxHeight}>
      {/* Top border with title crossing */}
      <Box>
        <Text color={BORDER_COLOR}>╭</Text>
        <Text color={ACCENT_COLOR}>{titlePart}</Text>
        {showVersion && <Text color={MUTED_TEXT}>{versionPart}</Text>}
        <Text color={BORDER_COLOR}> {"─".repeat(remainingBorder)}╮</Text>
      </Box>

      {/* Content rows */}
      {Array.from({ length: totalHeight }).map((_, rowIndex) => {
        const mascotLineIndex = rowIndex - mascotTopPadding;
        const mascotLine =
          mascotLineIndex >= 0 && mascotLineIndex < mascotLines.length
            ? mascotLines[mascotLineIndex]
            : "";

        const contentLine = visibleContent[rowIndex];

        return (
          <Box key={rowIndex} flexDirection="row" height={1}>
            <Text color={BORDER_COLOR}>│</Text>
            {/* Mascot section - let ANSI art render naturally */}
            <Box
              width={mascotDisplayWidth}
              justifyContent="center"
              flexShrink={0}
            >
              <Text wrap="truncate-end">{mascotLine}</Text>
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
            {/* Content section */}
            <Box
              width={contentWidth}
              paddingLeft={CONTENT_PADDING}
              paddingRight={CONTENT_PADDING}
              flexShrink={0}
            >
              {contentLine || <Text> </Text>}
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
          </Box>
        );
      })}

      {/* Bottom border with notification or controls */}
      <Box>
        <Text color={BORDER_COLOR}>╰{"─".repeat(bottomLeftBorder)}</Text>
        {bottomIsNotification ? (
          <Text color={bottomIsError ? "red" : "green"}>{bottomText}</Text>
        ) : (
          <>
            <Text color={ACCENT_COLOR}>[Q]</Text>
            <Text color={MUTED_TEXT}>uit</Text>
            {sessionCount !== undefined && (
              <>
                <Text color={ACCENT_COLOR}> [A]</Text>
                <Text color={MUTED_TEXT}>ctive ({sessionCount})</Text>
              </>
            )}
            <Text color={ACCENT_COLOR}> [P]</Text>
            <Text color={MUTED_TEXT}>roj</Text>
          </>
        )}
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}

export function Dashboard({
  sessions,
  focusedSessionId,
  connected: _connected,
  currentView,
  selectedMenuIndex,
  savePreview,
  saveLabel,
  saveError,
  saveSuccess,
  saveScrollOffset = 0,
  sessionsScrollOffset = 0,
  selectedSessionIndex = 0,
  // LoadContext props
  loadContextIndex = 0,
  sourceItems = [],
  selectedSourceIndex = 0,
  // Obsidian config props
  obsidianVaults = [],
  obsidianConfigIndex = 0,
  obsidianManualPath = "",
  obsidianManualMode = false,
  obsidianConfigError = null,
  // Obsidian browser props
  obsidianVaultName = "",
  obsidianTreeItems = [],
  obsidianFileIndex = 0,
  obsidianScrollOffset = 0,
  obsidianBrowserLoading = false,
  obsidianBrowserError = null,
  // Add context confirm props
  selectedObsidianFile = null,
  addContextDescription = "",
  addContextSuccess = null,
  addContextError = null,
  // Settings props
  settingsIndex = 0,
  settingsScrollOffset = 0,
  autoArchiveEnabled = false,
  archiveStats = null,
  archiveStatsLoading = false,
  // Claude token props
  claudeConnected = false,
  claudeTokenMasked = null,
  claudeTokenInput = "",
  claudeTokenError = null,
  isTokenInputMode = false,
  isTokenVerifying = false,
  showConnectionSuccess = false,
  // Handoff browser props
  handoffEntries = [],
  handoffSelectedIndex = 0,
  handoffScrollOffset = 0,
  handoffBrowserLoading = false,
  handoffBrowserError = null,
  // Google Docs browser props
  googleDocsTreeItems = [],
  googleDocsFileIndex = 0,
  googleDocsScrollOffset = 0,
  googleDocsBrowserLoading = false,
  googleDocsBrowserError = null,
  // Notion browser props
  notionWorkspaceName = "",
  notionTreeItems = [],
  notionFileIndex = 0,
  notionScrollOffset = 0,
  notionBrowserLoading = false,
  notionBrowserError = null,
  // LLM working props
  llmWorkingTitle = "Working...",
  llmWorkingDescription,
  llmWorkingElapsedSeconds,
  // LLM streaming props
  llmStreamingText = "",
  llmInputTokens = 0,
  llmOutputTokens = 0,
  llmCurrentStage = "",
  // Archive browser props
  archiveItems = [],
  archiveSelectedIndex = 0,
  archiveScrollOffset = 0,
  archiveBrowserLoading = false,
  archiveBrowserError = null,
  // Archive initialization props
  archiveInitProgress = null,
  archiveInitResult = null,
  // Project dashboard props
  projectDashboardStats = null,
  projectDashboardSessions = [],
  projectDashboardPlans = [],
  projectDashboardSection = "sessions",
  projectDashboardSelectedIndex = 0,
  projectDashboardScrollOffset = 0,
  projectDashboardLoading = false,
  planProgressMap = new Map(),
  // Plan viewer props
  planViewerPlan = null,
  planViewerContent = "",
  planViewerScrollOffset = 0,
  planViewerProgress = null,
  planViewerProgressLoading = false,
  // Notification
  notification = null,
}: DashboardProps): React.ReactElement {
  const { stdout } = useStdout();

  // Track terminal dimensions manually
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  // Spinner animation for LLM working view
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  // Animate spinner when in llm-working view
  useEffect(() => {
    if (currentView !== "llm-working") return;
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [currentView]);

  // Listen for terminal resize events and clear screen to prevent ghosting
  useEffect(() => {
    const handleResize = () => {
      // Hard reset: Clear screen AND scrollback buffer to prevent ghosting
      if (stdout && "write" in stdout && typeof stdout.write === "function") {
        stdout.write("\x1Bc"); // Full terminal reset
      }

      // Update dimensions
      if (stdout?.columns) {
        setTerminalWidth(stdout.columns);
      }
      if (stdout?.rows) {
        setTerminalHeight(stdout.rows);
      }
    };

    // Listen for resize events
    if (stdout && "on" in stdout && typeof stdout.on === "function") {
      stdout.on("resize", handleResize);
      return () => {
        if ("off" in stdout && typeof stdout.off === "function") {
          stdout.off("resize", handleResize);
        }
      };
    }
  }, [stdout]);

  const focusedSession = sessions.find(
    (s) => s.session_id === focusedSessionId,
  );

  // Determine layout mode
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70; // Hide version earlier to save space

  // Menu items
  const MENU_ITEMS: VerticalMenuItem[] = [
    { key: "1", label: "Save Context", enabled: true },
    { key: "2", label: "Load Context", enabled: true },
    { key: "3", label: "Create Handoff", enabled: true },
    { key: "4", label: "Settings", enabled: true },
  ];

  // Render based on current view (all wrapped in full-screen container)
  if (currentView === "save") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <SaveContextView
          preview={savePreview}
          label={saveLabel}
          error={saveError}
          success={saveSuccess}
          terminalWidth={terminalWidth}
          scrollOffset={saveScrollOffset}
        />
      </Box>
    );
  }

  if (currentView === "load") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <LoadContextView
          selectedIndex={loadContextIndex}
          terminalWidth={terminalWidth}
        />
      </Box>
    );
  }

  if (currentView === "load-sources") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <SourceSelectionView
          sources={sourceItems}
          selectedIndex={selectedSourceIndex}
          terminalWidth={terminalWidth}
        />
      </Box>
    );
  }

  if (currentView === "obsidian-config") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ObsidianConfigView
          vaults={obsidianVaults}
          selectedIndex={obsidianConfigIndex}
          manualPath={obsidianManualPath}
          isManualMode={obsidianManualMode}
          error={obsidianConfigError}
          terminalWidth={terminalWidth}
        />
      </Box>
    );
  }

  if (currentView === "obsidian-browser") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ObsidianBrowserView
          vaultName={obsidianVaultName}
          items={obsidianTreeItems}
          selectedIndex={obsidianFileIndex}
          scrollOffset={obsidianScrollOffset}
          terminalWidth={terminalWidth}
          loading={obsidianBrowserLoading}
          error={obsidianBrowserError}
        />
      </Box>
    );
  }

  if (currentView === "google-docs-browser") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <GoogleDocsBrowserView
          items={googleDocsTreeItems}
          selectedIndex={googleDocsFileIndex}
          scrollOffset={googleDocsScrollOffset}
          terminalWidth={terminalWidth}
          loading={googleDocsBrowserLoading}
          error={googleDocsBrowserError}
        />
      </Box>
    );
  }

  if (currentView === "notion-browser") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <NotionBrowserView
          workspaceName={notionWorkspaceName}
          items={notionTreeItems}
          selectedIndex={notionFileIndex}
          scrollOffset={notionScrollOffset}
          terminalWidth={terminalWidth}
          loading={notionBrowserLoading}
          error={notionBrowserError}
        />
      </Box>
    );
  }

  if (currentView === "add-context-confirm" && selectedObsidianFile) {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <AddContextConfirmView
          file={selectedObsidianFile}
          description={addContextDescription}
          terminalWidth={terminalWidth}
          success={addContextSuccess}
          error={addContextError}
        />
      </Box>
    );
  }

  if (currentView === "fetch") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <PlaceholderView
          title="Fetch context"
          feature="search and retrieve past contexts"
          terminalWidth={terminalWidth}
        />
      </Box>
    );
  }

  if (currentView === "settings") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <SettingsView
          terminalWidth={terminalWidth}
          selectedIndex={settingsIndex}
          autoArchive={autoArchiveEnabled}
          stats={archiveStats}
          loading={archiveStatsLoading}
          scrollOffset={settingsScrollOffset}
          claudeConnected={claudeConnected}
          claudeTokenMasked={claudeTokenMasked}
          claudeTokenInput={claudeTokenInput}
          claudeTokenError={claudeTokenError}
          isTokenInputMode={isTokenInputMode}
          isTokenVerifying={isTokenVerifying}
          showConnectionSuccess={showConnectionSuccess}
        />
      </Box>
    );
  }

  if (currentView === "sessions") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ActiveSessionsView
          sessions={sessions}
          focusedSessionId={focusedSessionId}
          terminalWidth={terminalWidth}
          scrollOffset={sessionsScrollOffset}
          selectedIndex={selectedSessionIndex}
        />
      </Box>
    );
  }

  if (currentView === "handoff-browser") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <HandoffBrowserView
          entries={handoffEntries}
          selectedIndex={handoffSelectedIndex}
          scrollOffset={handoffScrollOffset}
          terminalWidth={terminalWidth}
          loading={handoffBrowserLoading}
          error={handoffBrowserError}
        />
      </Box>
    );
  }

  if (currentView === "llm-working") {
    // LLM Working view - build content lines directly for proper rendering
    const contentLines: React.ReactNode[] = [];

    // Helper to format token count
    const formatTokens = (tokens: number): string => {
      if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}k`;
      }
      return tokens.toString();
    };

    // Helper to format time
    const formatTime = (seconds: number): string => {
      if (seconds < 60) return `${seconds}s`;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    // Line 1: Title with spinner and token counts
    const hasTokens = llmInputTokens > 0 || llmOutputTokens > 0;
    contentLines.push(
      <Text key="title">
        <Text color={ACCENT_COLOR} bold>
          {SPINNER_FRAMES[spinnerIndex]} {llmWorkingTitle}
        </Text>
        {hasTokens && (
          <Text color={MUTED_TEXT}>
            {" "}| {formatTokens(llmInputTokens)} in / {formatTokens(llmOutputTokens)} out
          </Text>
        )}
      </Text>
    );

    // Line 2: Empty spacer
    contentLines.push(<Text key="spacer1"> </Text>);

    // Line 3: Current stage or description
    const displayStage = llmCurrentStage || llmWorkingDescription || "";
    contentLines.push(
      <Text key="stage" color={displayStage ? MUTED_TEXT : undefined}>
        {displayStage || " "}
      </Text>
    );

    // Lines 4-6: Live streaming output preview (last 3 lines)
    if (llmStreamingText.length > 0) {
      const streamLines = llmStreamingText.split("\n").filter(l => l.trim());
      const lastLines = streamLines.slice(-3);
      const maxLineWidth = Math.min(50, terminalWidth - 20); // Leave room for border

      lastLines.forEach((line, i) => {
        const truncatedLine = line.length > maxLineWidth
          ? line.substring(0, maxLineWidth - 3) + "..."
          : line;
        contentLines.push(
          <Text key={`stream${i}`} color="#6B7280">
            {truncatedLine}
          </Text>
        );
      });

      // Pad to have 3 streaming lines
      while (contentLines.length < 6) {
        contentLines.push(<Text key={`streampad${contentLines.length}`}> </Text>);
      }
    } else {
      // No streaming yet - show placeholders
      contentLines.push(<Text key="spacer2"> </Text>);
      contentLines.push(<Text key="spacer3"> </Text>);
      contentLines.push(<Text key="spacer4"> </Text>);
    }

    // Line 7: Stats line (elapsed time and char count)
    const statsLine = [];
    if (llmWorkingElapsedSeconds !== undefined) {
      statsLine.push(`Elapsed: ${formatTime(llmWorkingElapsedSeconds)}`);
    }
    if (llmStreamingText.length > 0) {
      statsLine.push(`${llmStreamingText.length.toLocaleString()} chars`);
    }
    contentLines.push(
      <Text key="stats" color={MUTED_TEXT}>
        {statsLine.join(" | ") || " "}
      </Text>
    );

    // Line 8: Empty spacer
    contentLines.push(<Text key="spacer6"> </Text>);

    // Line 9: Tip
    contentLines.push(
      <Text key="tip" color={MUTED_TEXT} dimColor>
        Press Esc to cancel
      </Text>
    );

    // Pad to 10 lines
    while (contentLines.length < 10) {
      contentLines.push(<Text key={`pad${contentLines.length}`}> </Text>);
    }

    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        {useHorizontalLayout ? (
          <HorizontalLayout
            content={contentLines}
            terminalWidth={terminalWidth}
            title="Jacques"
            showVersion={showVersion}
          />
        ) : (
          <VerticalLayout
            content={contentLines}
            title="Jacques"
            showVersion={showVersion}
          />
        )}
      </Box>
    );
  }

  if (currentView === "archive-browser") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ArchiveBrowserView
          items={archiveItems || []}
          selectedIndex={archiveSelectedIndex || 0}
          scrollOffset={archiveScrollOffset || 0}
          terminalWidth={terminalWidth}
          loading={archiveBrowserLoading}
          error={archiveBrowserError}
        />
      </Box>
    );
  }

  if (currentView === "archive-initializing") {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ArchiveInitProgressView
          progress={archiveInitProgress || null}
          result={archiveInitResult || null}
          terminalWidth={terminalWidth}
        />
      </Box>
    );
  }

  if (currentView === "project-dashboard") {
    // Get project name from focused session or first session
    const projectSession = focusedSession || sessions[0];
    const projectName = projectSession?.project || "Unknown Project";

    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <ProjectDashboardView
          projectName={projectName}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          statistics={projectDashboardStats}
          sessions={projectDashboardSessions}
          plans={projectDashboardPlans}
          activeSection={projectDashboardSection}
          selectedIndex={projectDashboardSelectedIndex}
          scrollOffset={projectDashboardScrollOffset}
          loading={projectDashboardLoading}
          planProgress={planProgressMap}
        />
      </Box>
    );
  }

  if (currentView === "plan-viewer" && planViewerPlan) {
    return (
      <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
        <PlanViewerView
          plan={planViewerPlan}
          content={planViewerContent}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          scrollOffset={planViewerScrollOffset}
          progress={planViewerProgress}
          progressLoading={planViewerProgressLoading}
        />
      </Box>
    );
  }

  // Main menu view content
  const contentLines: React.ReactNode[] = [
    <Box />, // One line from top
    <Text bold color={ACCENT_COLOR}>
      Context Manager
    </Text>,
    <ProgressLine session={focusedSession ?? null} />,
    <ProjectLine session={focusedSession ?? null} />,
    <Box />, // One line above menu
    ...MENU_ITEMS.map((item, index) => {
      const isSelected = index === selectedMenuIndex;
      const textColor = item.enabled
        ? isSelected
          ? ACCENT_COLOR
          : "white"
        : MUTED_TEXT;

      return (
        <Text key={item.key} color={textColor} bold={isSelected}>
          {isSelected ? "> " : "  "}
          {item.label}
        </Text>
      );
    }),
    <Box />, // One line below menu
  ];

  // Wrap in full-screen container
  return (
    <Box width={terminalWidth} height={terminalHeight} flexDirection="column">
      {useHorizontalLayout ? (
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
      )}
    </Box>
  );
}

// ============================================================
// Active Sessions View
// ============================================================

interface ActiveSessionsViewProps {
  sessions: Session[];
  focusedSessionId: string | null;
  terminalWidth: number;
  scrollOffset?: number;
  selectedIndex?: number;
}

function ActiveSessionsView({
  sessions,
  focusedSessionId,
  terminalWidth,
  scrollOffset = 0,
  selectedIndex = 0,
}: ActiveSessionsViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  // Sort sessions: focused first, then by registration time
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.session_id === focusedSessionId) return -1;
    if (b.session_id === focusedSessionId) return 1;
    return a.registered_at - b.registered_at;
  });

  // Build all session items first
  const allSessionItems: React.ReactNode[] = [];

  if (sortedSessions.length === 0) {
    allSessionItems.push(<Text color={MUTED_TEXT}>No active sessions</Text>);
  } else {
    sortedSessions.forEach((session, index) => {
      const isSelected = index === selectedIndex;
      const isFocused = session.session_id === focusedSessionId;
      const cursor = isSelected ? "▸ " : "  ";
      allSessionItems.push(
        <Text>
          {cursor}
          {isFocused && <Text color={ACCENT_COLOR} bold>[FOCUS] </Text>}
          <Text bold={isFocused} inverse={isSelected}>
            {session.project || "unknown"}
          </Text>
          <Text color={MUTED_TEXT}>
            {" "}
            / {session.terminal?.term_program || "Terminal"}
          </Text>
        </Text>,
      );
      if (session.context_metrics) {
        const metrics = session.context_metrics;
        const maxTokens = metrics.context_window_size;
        const totalSessionTokens = metrics.total_input_tokens;
        // Calculate current context tokens from percentage
        const currentTokens = Math.round(maxTokens * (metrics.used_percentage / 100));
        // Show session total if significantly different
        const showSessionTotal = totalSessionTokens > currentTokens * 1.5;

        const formatTokens = (tokens: number): string => {
          if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
          return tokens.toString();
        };

        allSessionItems.push(
          <Text>
            {"  "}
            <Text color={ACCENT_COLOR}>
              {metrics.is_estimate ? "~" : ""}
              {metrics.used_percentage.toFixed(1)}%
            </Text>
            <Text color={MUTED_TEXT}>
              {" "}
              ({formatTokens(currentTokens)}/{formatTokens(maxTokens)})
              {showSessionTotal && ` • ${formatTokens(totalSessionTokens)} session`}
            </Text>
          </Text>,
        );
      }
      allSessionItems.push(<Box />); // Spacer between sessions
    });
  }

  // Calculate visible window (reserve lines for header and footer)
  const HEADER_LINES = 2; // title + separator
  const FOOTER_LINES = 1; // help text only
  const maxVisibleItems = FIXED_CONTENT_HEIGHT - HEADER_LINES - FOOTER_LINES;

  const totalItems = allSessionItems.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisibleItems < totalItems;

  // Get visible slice of items
  const visibleItems = allSessionItems.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems,
  );

  // Build final content - scroll indicators overlay first/last line
  const contentLines: React.ReactNode[] = [];

  // Title with scroll up indicator overlaid
  if (canScrollUp) {
    contentLines.push(
      <Text>
        <Text bold color={ACCENT_COLOR}>
          Active sessions{" "}
        </Text>
        <Text color={MUTED_TEXT}>▲ more above</Text>
      </Text>,
    );
  } else {
    contentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Active sessions {sessions.length > 0 && `(${sessions.length})`}
      </Text>,
    );
  }

  contentLines.push(<Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>);

  // Add visible items
  contentLines.push(...visibleItems);

  // Footer with scroll down indicator overlaid
  if (canScrollDown) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▼ more below • [Enter] focus • [Esc] back</Text>,
    );
  } else {
    contentLines.push(<Text color={MUTED_TEXT}>[Enter] focus terminal • [Esc] back</Text>);
  }

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
    />
  );
}

// ============================================================
// Save Context View
// ============================================================

interface SaveContextViewProps {
  preview?: SavePreviewData | null;
  label?: string;
  error?: string | null;
  success?: SaveSuccessData | null;
  terminalWidth: number;
  scrollOffset?: number;
}

function SaveContextView({
  preview,
  label,
  error,
  success,
  terminalWidth,
  scrollOffset = 0,
}: SaveContextViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const allContentLines: React.ReactNode[] = [];

  if (success) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color="green">✓ Saved successfully!</Text>,
      <Box />,
      <Text bold>{success.filename}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Local: .jacques/sessions/</Text>,
      <Text color={MUTED_TEXT}>Global: ~/.jacques/archive/</Text>,
      <Text color={MUTED_TEXT}>Size: {success.fileSize}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>[Enter] or [Esc] to continue</Text>,
    );
  } else if (error) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color="red">✗ {error}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Text color={MUTED_TEXT}>[Esc] Back</Text>,
    );
  } else if (preview) {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text>
        <Text color={MUTED_TEXT}>Session: </Text>
        {preview.sessionSlug}
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Messages: </Text>
        {preview.userMessages} user, {preview.assistantMessages} assistant
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Tool calls: </Text>
        {preview.toolCalls}
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Duration: </Text>
        {preview.durationMinutes} min
      </Text>,
      <Text>
        <Text color={MUTED_TEXT}>Filter: </Text>
        {preview.filterLabel || "Without Tools"}
        <Text color={MUTED_TEXT}> (from Settings)</Text>
      </Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Saves to:</Text>,
      <Text color={MUTED_TEXT}>  • Local: .jacques/sessions/</Text>,
      <Text color={MUTED_TEXT}>  • Global: ~/.jacques/archive/</Text>,
      <Box />,
      <Text>
        <Text color={MUTED_TEXT}>Label (optional): </Text>
        {label || ""}_
      </Text>,
      <Box />,
      <Text color={MUTED_TEXT}>[Enter] Save [Esc] Back</Text>,
    );
  } else {
    allContentLines.push(
      <Text bold color={ACCENT_COLOR}>
        Save Context
      </Text>,
      <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
      <Box />,
      <Text color={MUTED_TEXT}>Loading session data...</Text>,
    );
  }

  // Apply scrolling - calculate visible window
  const HEADER_LINES = 2; // title + separator
  const maxVisibleItems = FIXED_CONTENT_HEIGHT - HEADER_LINES;

  const totalItems = allContentLines.length;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisibleItems < totalItems;

  // Get visible slice
  const visibleContent = allContentLines.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems
  );

  // Build final content with scroll indicators
  const contentLines: React.ReactNode[] = [];

  // Add scroll-up indicator if needed
  if (canScrollUp) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▲ scroll up</Text>
    );
  }

  contentLines.push(...visibleContent);

  // Add scroll-down indicator if needed
  if (canScrollDown) {
    contentLines.push(
      <Text color={MUTED_TEXT}>▼ scroll down</Text>
    );
  }

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
    />
  );
}

// ============================================================
// Placeholder Views
// ============================================================

interface PlaceholderViewProps {
  title: string;
  feature: string;
  terminalWidth: number;
}

function PlaceholderView({
  title,
  feature,
  terminalWidth,
}: PlaceholderViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const contentLines: React.ReactNode[] = [
    <Text bold color={ACCENT_COLOR}>
      {title}
    </Text>,
    <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
    <Box />,
    <Text color="#D4A574">Coming soon</Text>,
    <Box />,
    <Text color={MUTED_TEXT}>This feature will allow you to {feature}.</Text>,
    <Box />,
    <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
    <Text color={MUTED_TEXT}>Press any key to go back...</Text>,
  ];

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
    />
  );
}

export default Dashboard;
