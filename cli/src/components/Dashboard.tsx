/**
 * Dashboard Component
 *
 * Thin view router that tracks terminal dimensions and delegates
 * rendering to the appropriate view component based on currentView.
 */

import React, { useState, useEffect } from "react";
import { Box, useStdout } from "ink";
import { MainMenuView } from "./MainMenuView.js";
import { SessionsView } from "./SessionsView.js";
import { ProjectSelectorView } from "./ProjectSelectorView.js";
import { WorktreesView } from "./WorktreesView.js";
import { SettingsView } from "./SettingsView.js";
import { ArchiveBrowserView } from "./ArchiveBrowserView.js";
import { ArchiveInitProgressView } from "./ArchiveInitProgressView.js";
import { ProjectDashboardView } from "./ProjectDashboardView.js";
import { PlanViewerView } from "./PlanViewerView.js";
import { SessionsExperimentView } from "./SessionsExperimentView.js";
import type { UseSettingsState } from "../hooks/useSettings.js";
import type { UseArchiveBrowserState } from "../hooks/useArchiveBrowser.js";
import type { UseProjectDashboardState } from "../hooks/useProjectDashboard.js";
import type { UseClaudeTokenState } from "../hooks/useClaudeToken.js";
import type { WorktreeItem } from "../hooks/useWorktrees.js";
import type { ContentItem } from "../hooks/useSessionsExperiment.js";
import type { UsageLimits } from "../hooks/useUsageLimits.js";
import type { Session, DiscoveredProject } from "@jacques/core";
import { getProjectGroupKey } from "@jacques/core";

// View types for the dashboard
export type DashboardView =
  | "main"
  | "sessions"
  | "projects"
  | "worktrees"
  | "settings"
  | "archive-browser"
  | "archive-initializing"
  | "project-dashboard"
  | "plan-viewer"
  | "sessions-experiment"
  // Legacy view types (kept for hooks still on disk)
  | "save"
  | "load"
  | "load-sources"
  | "obsidian-config"
  | "obsidian-browser"
  | "google-docs-browser"
  | "notion-browser"
  | "add-context-confirm"
  | "fetch"
  | "handoff-browser"
  | "llm-working";

interface DashboardProps {
  sessions: Session[];
  focusedSessionId: string | null;
  currentView: DashboardView;
  selectedMenuIndex: number;
  notification: string | null;
  selectedProject: string | null;
  // Sessions view
  sessionsSelectedIndex: number;
  sessionsScrollOffset: number;
  sessionsSelectedIds: Set<string>;
  filteredSessions: Session[];
  // Projects view
  projects: DiscoveredProject[];
  projectsSelectedIndex: number;
  projectsScrollOffset: number;
  projectsLoading: boolean;
  projectsError: string | null;
  // Worktrees view
  worktrees: WorktreeItem[];
  worktreesLoading: boolean;
  worktreesError: string | null;
  worktreesSelectedIndex: number;
  worktreesScrollOffset: number;
  worktreesIsCreating: boolean;
  worktreesNewName: string;
  worktreesCreateError: string | null;
  worktreesIsConfirmingRemove: boolean;
  worktreesIsGitProject: boolean;
  worktreesRepoRoot: string | null;
  // Settings
  settings: UseSettingsState;
  claudeToken: UseClaudeTokenState;
  usageLimits: UsageLimits | null;
  usageLoading: boolean;
  // Archive
  archive: UseArchiveBrowserState;
  // Project dashboard
  projectDashboard: UseProjectDashboardState;
  // Sessions experiment
  sessionsExpItems: ContentItem[];
  sessionsExpSelectableIndices: number[];
  sessionsExpSelectedIndex: number;
  sessionsExpSelectedIds: Set<string>;
  sessionsExpShowHelp: boolean;
  sessionsExpScrollBias: number;
  sessionsExpIsCreatingWorktree: boolean;
  sessionsExpNewWorktreeName: string;
  sessionsExpWorktreeCreateError: string | null;
  sessionsExpRepoRoot: string | null;
  sessionsExpCreatingForRepoRoot: string | null;
  sessionsExpRemoveDeleteBranch: boolean;
  sessionsExpRemoveForce: boolean;
}

export function Dashboard(props: DashboardProps): React.ReactElement {
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

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

  switch (props.currentView) {
    case "sessions":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <SessionsView
            sessions={props.filteredSessions}
            focusedSessionId={props.focusedSessionId}
            selectedIndex={props.sessionsSelectedIndex}
            scrollOffset={props.sessionsScrollOffset}
            selectedIds={props.sessionsSelectedIds}
            terminalWidth={tw}
          />
        </Box>
      );

    case "projects":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <ProjectSelectorView
            projects={props.projects}
            selectedIndex={props.projectsSelectedIndex}
            scrollOffset={props.projectsScrollOffset}
            loading={props.projectsLoading}
            error={props.projectsError}
            terminalWidth={tw}
          />
        </Box>
      );

    case "worktrees":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <WorktreesView
            worktrees={props.worktrees}
            loading={props.worktreesLoading}
            error={props.worktreesError}
            selectedIndex={props.worktreesSelectedIndex}
            scrollOffset={props.worktreesScrollOffset}
            isCreating={props.worktreesIsCreating}
            newName={props.worktreesNewName}
            createError={props.worktreesCreateError}
            isConfirmingRemove={props.worktreesIsConfirmingRemove}
            isGitProject={props.worktreesIsGitProject}
            repoRoot={props.worktreesRepoRoot}
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
            skipPermissions={props.settings.skipPermissions}
            stats={props.settings.archiveStats}
            loading={props.settings.archiveStatsLoading}
            scrollOffset={props.settings.scrollOffset}
            syncProgress={props.settings.syncProgress}
            usageLimits={props.usageLimits}
            usageLoading={props.usageLoading}
            claudeConnected={props.claudeToken.connected}
            claudeTokenMasked={props.claudeToken.tokenMasked}
            claudeTokenInput={props.claudeToken.tokenInput}
            claudeTokenError={props.claudeToken.tokenError}
            isTokenInputMode={props.claudeToken.isInputMode}
            isTokenVerifying={props.claudeToken.isVerifying}
            showConnectionSuccess={props.claudeToken.showSuccess}
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
      const projectName = projectSession ? getProjectGroupKey(projectSession) : "Unknown Project";
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

    case "sessions-experiment":
      return (
        <Box width={tw} height={th} flexDirection="column">
          <SessionsExperimentView
            items={props.sessionsExpItems}
            selectableIndices={props.sessionsExpSelectableIndices}
            selectedIndex={props.sessionsExpSelectedIndex}
            selectedIds={props.sessionsExpSelectedIds}
            showHelp={props.sessionsExpShowHelp}
            scrollBias={props.sessionsExpScrollBias}
            notification={props.notification}
            terminalWidth={tw}
            terminalHeight={th}
            isCreatingWorktree={props.sessionsExpIsCreatingWorktree}
            newWorktreeName={props.sessionsExpNewWorktreeName}
            worktreeCreateError={props.sessionsExpWorktreeCreateError}
            repoRoot={props.sessionsExpRepoRoot}
            creatingForRepoRoot={props.sessionsExpCreatingForRepoRoot}
            projectName={props.selectedProject}
            removeDeleteBranch={props.sessionsExpRemoveDeleteBranch}
            removeForce={props.sessionsExpRemoveForce}
          />
        </Box>
      );

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
        selectedProject={props.selectedProject}
      />
    </Box>
  );
}

export default Dashboard;
