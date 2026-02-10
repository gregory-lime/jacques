/**
 * App Component
 *
 * Root component for the Jacques dashboard.
 * Thin orchestrator that instantiates hooks, dispatches keyboard input,
 * and passes hook state down to Dashboard.
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useInput, useApp, useStdin, useStdout, Box } from "ink";
import type { Key } from "ink";
import { exec } from "child_process";
import { useJacquesClient } from "../hooks/useJacquesClient.js";
import { useNotification } from "../hooks/useNotification.js";
import { useClaudeToken } from "../hooks/useClaudeToken.js";
import { useArchiveBrowser } from "../hooks/useArchiveBrowser.js";
import { useSettings } from "../hooks/useSettings.js";
import { useProjectDashboard } from "../hooks/useProjectDashboard.js";
import { useProjectSelector } from "../hooks/useProjectSelector.js";
import { useSessions } from "../hooks/useSessions.js";
import { useWorktrees } from "../hooks/useWorktrees.js";
import { useSessionsExperiment } from "../hooks/useSessionsExperiment.js";
import { useUsageLimits } from "../hooks/useUsageLimits.js";
import { Dashboard } from "./Dashboard.js";
import type { DashboardView } from "./Dashboard.js";
import { MENU_ITEMS } from "../utils/constants.js";

export function App(): React.ReactElement {
  const jacques = useJacquesClient();
  const {
    sessions, focusedSessionId, connected,
    focusTerminal, focusTerminalResult,
    tileWindows, maximizeWindow, launchSession,
    listWorktrees: listWorktreesWs,
    createWorktree: createWorktreeWs,
    removeWorktree: removeWorktreeWs,
    listWorktreesResult, createWorktreeResult, removeWorktreeResult,
    launchSessionResult,
  } = jacques;
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  // ---- State ----
  const [currentView, setCurrentView] = useState<DashboardView>("main");
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);

  const focusedSession = sessions.find((s) => s.session_id === focusedSessionId);

  // ---- Ref-based pattern for circular dependencies ----
  const returnToMainRef = useRef<() => void>(() => {});

  // ---- Instantiate hooks ----
  const { notification, showNotification } = useNotification();
  const claudeToken = useClaudeToken({ showNotification });

  const archiveBrowser = useArchiveBrowser({
    setCurrentView,
    showNotification,
    onStatsReload: () => settings.reloadStats(),
  });

  const settings = useSettings({
    setCurrentView,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
    onInitArchive: (options) => archiveBrowser.initializeArchive(options),
    onBrowseArchive: () => {
      setCurrentView("archive-browser");
      archiveBrowser.loadBrowser();
    },
  });

  const projectDashboard = useProjectDashboard({
    setCurrentView,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
  });

  const projectSelector = useProjectSelector();

  const sessionsHook = useSessions({
    sessions,
    focusedSessionId,
    selectedProject: projectSelector.selectedProject,
    focusTerminal,
    maximizeWindow,
    tileWindows,
    launchSession,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
  });

  const worktreesHook = useWorktrees({
    listWorktreesWs,
    createWorktreeWs,
    removeWorktreeWs,
    launchSession,
    listWorktreesResult,
    createWorktreeResult,
    removeWorktreeResult,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
    sessions: sessions as Array<{ cwd?: string; git_worktree?: string }>,
  });

  // Track terminal height for experiment view viewport calculation
  const { stdout } = useStdout();
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);
  useEffect(() => {
    const handleResize = () => {
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

  const sessionsExpHook = useSessionsExperiment({
    sessions,
    worktrees: worktreesHook.worktrees,
    focusedSessionId,
    selectedProject: projectSelector.selectedProject,
    terminalHeight,
    focusTerminal,
    maximizeWindow,
    tileWindows,
    launchSession,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
    createWorktreeWs,
    repoRoot: worktreesHook.repoRoot,
    createWorktreeResult,
    skipPermissions: settings.state.skipPermissions,
  });

  const usageLimits = useUsageLimits(currentView === "settings");

  // ---- Define returnToMain ----
  const returnToMain = useCallback(() => {
    setCurrentView("main");
    setSelectedMenuIndex(0);
    claudeToken.reset();
    archiveBrowser.reset();
    settings.reset();
    projectDashboard.reset();
    projectSelector.reset();
    sessionsHook.reset();
    worktreesHook.reset();
    sessionsExpHook.reset();
  }, [
    claudeToken.reset,
    archiveBrowser.reset,
    settings.reset,
    projectDashboard.reset,
    projectSelector.reset,
    sessionsHook.reset,
    worktreesHook.reset,
    sessionsExpHook.reset,
  ]);

  returnToMainRef.current = returnToMain;

  // ---- Handle focus terminal result notifications ----
  useEffect(() => {
    if (focusTerminalResult) {
      if (focusTerminalResult.success) {
        showNotification("Terminal focused");
      } else if (focusTerminalResult.method === "unsupported") {
        showNotification("Not supported for this terminal");
      } else {
        showNotification(`Focus failed: ${focusTerminalResult.error || "unknown error"}`);
      }
    }
  }, [focusTerminalResult, showNotification]);

  // ---- Handle launch session result notifications ----
  useEffect(() => {
    if (launchSessionResult) {
      if (launchSessionResult.success) {
        showNotification("Session launched");
      } else {
        showNotification(`!Launch failed: ${launchSessionResult.error || "unknown"}`);
      }
    }
  }, [launchSessionResult, showNotification]);

  // ---- Eager-load projects on mount ----
  useEffect(() => {
    projectSelector.init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Resolve worktree repo root from project or session ----
  const getRepoRoot = useCallback((): string | null => {
    // From selected project's git repo root
    if (projectSelector.selectedProject) {
      const project = projectSelector.projects.find(
        (p) => p.name === projectSelector.selectedProject
      );
      if (project?.gitRepoRoot) return project.gitRepoRoot;
    }
    // From focused session
    if (focusedSession) {
      if (focusedSession.git_repo_root) return focusedSession.git_repo_root;
    }
    return null;
  }, [projectSelector.selectedProject, projectSelector.projects, focusedSession]);

  // ---- Handle menu selection ----
  const handleMenuSelect = useCallback((key: string) => {
    switch (key) {
      case "1": // Sessions
        setCurrentView("sessions");
        sessionsHook.reset();
        break;

      case "2": { // Worktrees
        const root = getRepoRoot();
        setCurrentView("worktrees");
        worktreesHook.open(root);
        break;
      }

      case "3": // Settings
        settings.open();
        claudeToken.loadStatus();
        break;

      case "4": { // Sessions Lab
        const root = getRepoRoot();
        worktreesHook.open(root);
        setCurrentView("sessions-experiment");
        break;
      }
    }
  }, [sessionsHook.reset, getRepoRoot, worktreesHook.open, settings.open, claudeToken.loadStatus]);

  // ---- Handler: main view input ----
  const handleMainViewInput = useCallback((input: string, key: Key) => {
    if (key.upArrow) {
      setSelectedMenuIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedMenuIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      const selectedItem = MENU_ITEMS[selectedMenuIndex];
      if (selectedItem?.enabled) {
        handleMenuSelect(selectedItem.key);
      }
      return;
    }
    if (input === "q" || input === "Q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (["1", "2", "3", "4"].includes(input)) {
      const index = parseInt(input) - 1;
      if (MENU_ITEMS[index]?.enabled) {
        handleMenuSelect(input);
      }
      return;
    }
    if (input === "p" || input === "P") {
      setCurrentView("projects");
      projectSelector.open();
      return;
    }
    if (input === "w" || input === "W") {
      const guiUrl = "http://localhost:4243";
      const openCmd = process.platform === "darwin" ? "open" :
                      process.platform === "win32" ? "start" : "xdg-open";
      exec(`${openCmd} ${guiUrl}`, (error) => {
        if (error) {
          showNotification("Failed to open browser");
        } else {
          showNotification("Opening web GUI...");
        }
      });
      return;
    }
  }, [selectedMenuIndex, handleMenuSelect, exit, showNotification, projectSelector.open]);

  // ---- Central keyboard dispatcher ----
  useInput(
    (input, key) => {
      switch (currentView) {
        case "main":
          handleMainViewInput(input, key);
          break;

        case "sessions":
          sessionsHook.handleInput(input, key);
          break;

        case "projects":
          projectSelector.handleInput(input, key, setCurrentView);
          break;

        case "worktrees":
          worktreesHook.handleInput(input, key);
          break;

        case "sessions-experiment":
          sessionsExpHook.handleInput(input, key);
          break;

        case "settings":
          settings.handleInput(input, key, {
            isInputMode: claudeToken.state.isInputMode,
            handleInput: claudeToken.handleInput,
            connected: claudeToken.state.connected,
            disconnect: claudeToken.disconnect,
            enterInputMode: claudeToken.enterInputMode,
          });
          break;

        case "archive-browser":
          if (key.escape) {
            returnToMain();
            return;
          }
          archiveBrowser.handleInput(input, key, "archive-browser");
          break;

        case "archive-initializing":
          archiveBrowser.handleInput(input, key, "archive-initializing");
          break;

        case "project-dashboard":
          projectDashboard.handleInput(input, key, "project-dashboard");
          break;

        case "plan-viewer":
          projectDashboard.handleInput(input, key, "plan-viewer");
          break;

        default:
          if (key.escape || key.return || input) {
            returnToMain();
          }
          break;
      }
    },
    { isActive: isRawModeSupported },
  );

  // ---- Render ----
  return (
    <Box flexDirection="column">
      <Dashboard
        sessions={sessions}
        focusedSessionId={focusedSessionId}
        currentView={currentView}
        selectedMenuIndex={selectedMenuIndex}
        notification={notification}
        selectedProject={projectSelector.selectedProject}
        // Sessions view
        sessionsSelectedIndex={sessionsHook.selectedIndex}
        sessionsScrollOffset={sessionsHook.scrollOffset}
        sessionsSelectedIds={sessionsHook.selectedIds}
        filteredSessions={sessionsHook.filteredSessions}
        // Projects view
        projects={projectSelector.projects}
        projectsSelectedIndex={projectSelector.selectedIndex}
        projectsScrollOffset={projectSelector.scrollOffset}
        projectsLoading={projectSelector.loading}
        projectsError={projectSelector.error}
        // Worktrees view
        worktrees={worktreesHook.worktrees}
        worktreesLoading={worktreesHook.loading}
        worktreesError={worktreesHook.error}
        worktreesSelectedIndex={worktreesHook.selectedIndex}
        worktreesScrollOffset={worktreesHook.scrollOffset}
        worktreesIsCreating={worktreesHook.isCreating}
        worktreesNewName={worktreesHook.newName}
        worktreesCreateError={worktreesHook.createError}
        worktreesIsConfirmingRemove={worktreesHook.isConfirmingRemove}
        worktreesIsGitProject={worktreesHook.isGitProject}
        worktreesRepoRoot={worktreesHook.repoRoot}
        // Settings
        settings={settings.state}
        claudeToken={claudeToken.state}
        usageLimits={usageLimits.limits}
        usageLoading={usageLimits.loading}
        // Archive
        archive={archiveBrowser.state}
        // Project dashboard
        projectDashboard={projectDashboard.state}
        // Sessions experiment
        sessionsExpItems={sessionsExpHook.items}
        sessionsExpSelectableIndices={sessionsExpHook.selectableIndices}
        sessionsExpSelectedIndex={sessionsExpHook.selectedIndex}
        sessionsExpScrollOffset={sessionsExpHook.scrollOffset}
        sessionsExpSelectedIds={sessionsExpHook.selectedIds}
        sessionsExpIsCreatingWorktree={sessionsExpHook.isCreatingWorktree}
        sessionsExpNewWorktreeName={sessionsExpHook.newWorktreeName}
        sessionsExpWorktreeCreateError={sessionsExpHook.worktreeCreateError}
        sessionsExpRepoRoot={worktreesHook.repoRoot}
      />
    </Box>
  );
}

export default App;
