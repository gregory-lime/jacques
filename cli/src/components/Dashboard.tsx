/**
 * Dashboard Component
 *
 * Thin view router that tracks terminal dimensions and delegates
 * rendering to the appropriate view component based on currentView.
 */

import React, { useState, useEffect } from "react";
import { Box, useStdout } from "ink";
import { MainMenuView } from "./MainMenuView.js";
import { SaveContextView } from "./SaveContextView.js";
import { ActiveSessionsView } from "./ActiveSessionsView.js";
import { PlaceholderView } from "./PlaceholderView.js";
import { LoadContextView } from "./LoadContextView.js";
import { SourceSelectionView } from "./SourceSelectionView.js";
import { ObsidianConfigView } from "./ObsidianConfigView.js";
import { ObsidianBrowserView } from "./ObsidianBrowserView.js";
import { AddContextConfirmView } from "./AddContextConfirmView.js";
import { SettingsView } from "./SettingsView.js";
import { HandoffBrowserView } from "./HandoffBrowserView.js";
import { GoogleDocsBrowserView } from "./GoogleDocsBrowserView.js";
import { NotionBrowserView } from "./NotionBrowserView.js";
import { LLMWorkingView } from "./LLMWorkingView.js";
import { ArchiveBrowserView } from "./ArchiveBrowserView.js";
import { ArchiveInitProgressView } from "./ArchiveInitProgressView.js";
import { ProjectDashboardView } from "./ProjectDashboardView.js";
import { PlanViewerView } from "./PlanViewerView.js";
import type { UseSaveFlowState } from "../hooks/useSaveFlow.js";
import type { UseLlmWorkingState } from "../hooks/useLlmWorking.js";
import type { UseClaudeTokenState } from "../hooks/useClaudeToken.js";
import type { UseHandoffBrowserState } from "../hooks/useHandoffBrowser.js";
import type { UseArchiveBrowserState } from "../hooks/useArchiveBrowser.js";
import type { UseSettingsState } from "../hooks/useSettings.js";
import type { UseProjectDashboardState } from "../hooks/useProjectDashboard.js";
import type { SourceItem } from "./SourceSelectionView.js";
import type {
  Session,
  ObsidianVault,
  ObsidianFile,
  FlatTreeItem,
} from "@jacques/core";

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
  currentView: DashboardView;
  selectedMenuIndex: number;
  sessionsScrollOffset: number;
  selectedSessionIndex: number;
  notification: string | null;
  save: UseSaveFlowState;
  loadContext: { index: number; sourceItems: SourceItem[]; selectedSourceIndex: number };
  obsidian: {
    vaults: ObsidianVault[];
    configIndex: number;
    manualPath: string;
    manualMode: boolean;
    configError: string | null;
    vaultName: string;
    treeItems: FlatTreeItem[];
    fileIndex: number;
    scrollOffset: number;
    browserLoading: boolean;
    browserError: string | null;
    selectedFile: ObsidianFile | null;
    contextDescription: string;
    contextSuccess: { name: string; path: string } | null;
    contextError: string | null;
  };
  settings: UseSettingsState;
  claudeToken: UseClaudeTokenState;
  handoff: UseHandoffBrowserState;
  googleDocs: { treeItems: FlatTreeItem[]; fileIndex: number; scrollOffset: number; loading: boolean; error: string | null };
  notion: { workspaceName: string; treeItems: FlatTreeItem[]; fileIndex: number; scrollOffset: number; loading: boolean; error: string | null };
  llmWorking: UseLlmWorkingState;
  archive: UseArchiveBrowserState;
  projectDashboard: UseProjectDashboardState;
}

export function Dashboard(props: DashboardProps): React.ReactElement {
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  // Listen for terminal resize events
  useEffect(() => {
    const handleResize = () => {
      if (stdout && "write" in stdout && typeof stdout.write === "function") {
        stdout.write("\x1Bc");
      }
      if (stdout?.columns) setTerminalWidth(stdout.columns);
      if (stdout?.rows) setTerminalHeight(stdout.rows);
    };
    if (stdout && "on" in stdout && typeof stdout.on === "function") {
      stdout.on("resize", handleResize);
      return () => {
        if ("off" in stdout && typeof stdout.off === "function") {
          stdout.off("resize", handleResize);
        }
      };
    }
  }, [stdout]);

  const tw = terminalWidth;
  const th = terminalHeight;
  const focusedSession = props.sessions.find((s) => s.session_id === props.focusedSessionId);

  // View routing
  switch (props.currentView) {
    case "save":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <SaveContextView
            preview={props.save.preview}
            label={props.save.label}
            error={props.save.error}
            success={props.save.success}
            terminalWidth={tw}
            scrollOffset={props.save.scrollOffset}
          />
        </Box>
      );

    case "load":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <LoadContextView selectedIndex={props.loadContext.index} terminalWidth={tw} />
        </Box>
      );

    case "load-sources":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <SourceSelectionView
            sources={props.loadContext.sourceItems}
            selectedIndex={props.loadContext.selectedSourceIndex}
            terminalWidth={tw}
          />
        </Box>
      );

    case "obsidian-config":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ObsidianConfigView
            vaults={props.obsidian.vaults}
            selectedIndex={props.obsidian.configIndex}
            manualPath={props.obsidian.manualPath}
            isManualMode={props.obsidian.manualMode}
            error={props.obsidian.configError}
            terminalWidth={tw}
          />
        </Box>
      );

    case "obsidian-browser":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ObsidianBrowserView
            vaultName={props.obsidian.vaultName}
            items={props.obsidian.treeItems}
            selectedIndex={props.obsidian.fileIndex}
            scrollOffset={props.obsidian.scrollOffset}
            terminalWidth={tw}
            loading={props.obsidian.browserLoading}
            error={props.obsidian.browserError}
          />
        </Box>
      );

    case "google-docs-browser":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <GoogleDocsBrowserView
            items={props.googleDocs.treeItems}
            selectedIndex={props.googleDocs.fileIndex}
            scrollOffset={props.googleDocs.scrollOffset}
            terminalWidth={tw}
            loading={props.googleDocs.loading}
            error={props.googleDocs.error}
          />
        </Box>
      );

    case "notion-browser":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <NotionBrowserView
            workspaceName={props.notion.workspaceName}
            items={props.notion.treeItems}
            selectedIndex={props.notion.fileIndex}
            scrollOffset={props.notion.scrollOffset}
            terminalWidth={tw}
            loading={props.notion.loading}
            error={props.notion.error}
          />
        </Box>
      );

    case "add-context-confirm":
      if (!props.obsidian.selectedFile) break;
      return (
        <Box width={tw} height={th} flexDirection="column">
          <AddContextConfirmView
            file={props.obsidian.selectedFile}
            description={props.obsidian.contextDescription}
            terminalWidth={tw}
            success={props.obsidian.contextSuccess}
            error={props.obsidian.contextError}
          />
        </Box>
      );

    case "fetch":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <PlaceholderView
            title="Fetch context"
            feature="search and retrieve past contexts"
            terminalWidth={tw}
          />
        </Box>
      );

    case "settings":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <SettingsView
            terminalWidth={tw}
            selectedIndex={props.settings.index}
            autoArchive={props.settings.autoArchiveEnabled}
            stats={props.settings.archiveStats}
            loading={props.settings.archiveStatsLoading}
            scrollOffset={props.settings.scrollOffset}
            claudeConnected={props.claudeToken.connected}
            claudeTokenMasked={props.claudeToken.tokenMasked}
            claudeTokenInput={props.claudeToken.tokenInput}
            claudeTokenError={props.claudeToken.tokenError}
            isTokenInputMode={props.claudeToken.isInputMode}
            isTokenVerifying={props.claudeToken.isVerifying}
            showConnectionSuccess={props.claudeToken.showSuccess}
            notificationsEnabled={props.settings.notificationsEnabled}
            notificationsLoading={props.settings.notificationsLoading}
          />
        </Box>
      );

    case "sessions":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ActiveSessionsView
            sessions={props.sessions}
            focusedSessionId={props.focusedSessionId}
            terminalWidth={tw}
            scrollOffset={props.sessionsScrollOffset}
            selectedIndex={props.selectedSessionIndex}
          />
        </Box>
      );

    case "handoff-browser":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <HandoffBrowserView
            entries={props.handoff.entries}
            selectedIndex={props.handoff.selectedIndex}
            scrollOffset={props.handoff.scrollOffset}
            terminalWidth={tw}
            loading={props.handoff.loading}
            error={props.handoff.error}
          />
        </Box>
      );

    case "llm-working":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <LLMWorkingView
            title={props.llmWorking.title}
            description={props.llmWorking.description}
            elapsedSeconds={props.llmWorking.elapsedSeconds}
            streamingText={props.llmWorking.streamingText}
            inputTokens={props.llmWorking.inputTokens}
            outputTokens={props.llmWorking.outputTokens}
            currentStage={props.llmWorking.currentStage}
            terminalWidth={tw}
          />
        </Box>
      );

    case "archive-browser":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ArchiveBrowserView
            items={props.archive.items}
            selectedIndex={props.archive.selectedIndex}
            scrollOffset={props.archive.scrollOffset}
            terminalWidth={tw}
            loading={props.archive.loading}
            error={props.archive.error}
          />
        </Box>
      );

    case "archive-initializing":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ArchiveInitProgressView
            progress={props.archive.initProgress}
            result={props.archive.initResult}
            terminalWidth={tw}
          />
        </Box>
      );

    case "project-dashboard": {
      const projectSession = focusedSession || props.sessions[0];
      const projectName = projectSession?.project || "Unknown Project";
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ProjectDashboardView
            projectName={projectName}
            terminalWidth={tw}
            terminalHeight={th}
            statistics={props.projectDashboard.stats}
            sessions={props.projectDashboard.dashboardSessions}
            plans={props.projectDashboard.plans}
            activeSection={props.projectDashboard.section}
            selectedIndex={props.projectDashboard.selectedIndex}
            scrollOffset={props.projectDashboard.scrollOffset}
            loading={props.projectDashboard.loading}
            planProgress={props.projectDashboard.planProgressMap}
          />
        </Box>
      );
    }

    case "plan-viewer":
      if (!props.projectDashboard.planViewerPlan) break;
      return (
        <Box width={tw} height={th} flexDirection="column">
          <PlanViewerView
            plan={props.projectDashboard.planViewerPlan}
            content={props.projectDashboard.planViewerContent}
            terminalWidth={tw}
            terminalHeight={th}
            scrollOffset={props.projectDashboard.planViewerScrollOffset}
            progress={props.projectDashboard.planViewerProgress}
            progressLoading={props.projectDashboard.planViewerProgressLoading}
          />
        </Box>
      );
  }

  // Main menu view (default)
  return (
    <Box width={tw} height={th} flexDirection="column">
      <MainMenuView
        sessions={props.sessions}
        focusedSession={focusedSession ?? null}
        selectedMenuIndex={props.selectedMenuIndex}
        notification={props.notification}
        terminalWidth={tw}
      />
    </Box>
  );
}

export default Dashboard;
