/**
 * App Component
 *
 * Root component for the Jacques dashboard.
 * Thin orchestrator that instantiates hooks, dispatches keyboard input,
 * and passes hook state down to Dashboard.
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useInput, useApp, useStdin, Box } from "ink";
import type { Key } from "ink";
import { exec } from "child_process";
import { useJacquesClient } from "../hooks/useJacquesClient.js";
import { useNotification } from "../hooks/useNotification.js";
import { useLlmWorking } from "../hooks/useLlmWorking.js";
import { useClaudeToken } from "../hooks/useClaudeToken.js";
import { useHandoffBrowser } from "../hooks/useHandoffBrowser.js";
import { useArchiveBrowser } from "../hooks/useArchiveBrowser.js";
import { useGoogleDocsBrowser } from "../hooks/useGoogleDocsBrowser.js";
import { useNotionBrowser } from "../hooks/useNotionBrowser.js";
import { useObsidianBrowser } from "../hooks/useObsidianBrowser.js";
import { useLoadContext } from "../hooks/useLoadContext.js";
import { useSaveFlow } from "../hooks/useSaveFlow.js";
import { useSettings } from "../hooks/useSettings.js";
import { useProjectDashboard } from "../hooks/useProjectDashboard.js";
import { Dashboard } from "./Dashboard.js";
import type { DashboardView } from "./Dashboard.js";
import { copyToClipboard } from "../utils/clipboard.js";
import { MENU_ITEMS } from "../utils/constants.js";
import {
  detectCurrentSession,
  findSessionById,
  getHandoffPrompt,
  getObsidianVaultPath,
  generateHandoffFromTranscript,
  isSkillInstalled,
} from "@jacques/core";

export function App(): React.ReactElement {
  const { client, sessions, focusedSessionId, connected, focusTerminal, focusTerminalResult } = useJacquesClient();
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  // ---- State that stays in App.tsx ----
  const [currentView, setCurrentView] = useState<DashboardView>("main");
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const [sessionsScrollOffset, setSessionsScrollOffset] = useState<number>(0);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);

  // Focused session derived from sessions array
  const focusedSession = sessions.find((s) => s.session_id === focusedSessionId);

  // ---- Ref-based pattern for circular dependencies ----
  // returnToMain and handleSourceSelect depend on hooks that depend on them.
  const returnToMainRef = useRef<() => void>(() => {});
  const handleSourceSelectRef = useRef<(source: string, connected: boolean) => void>(() => {});

  // ---- Instantiate hooks ----
  const { notification, showNotification } = useNotification(client);

  const llmWorking = useLlmWorking({ setCurrentView, showNotification });

  const claudeToken = useClaudeToken({ showNotification });

  const handoffBrowser = useHandoffBrowser({
    returnToMain: () => returnToMainRef.current(),
    showNotification,
  });

  const archiveBrowser = useArchiveBrowser({
    setCurrentView,
    showNotification,
    onStatsReload: () => settings.reloadStats(),
  });

  const googleDocs = useGoogleDocsBrowser({
    setCurrentView,
    showNotification,
    focusedSession,
    returnToMain: () => returnToMainRef.current(),
  });

  const notion = useNotionBrowser({
    setCurrentView,
    showNotification,
    focusedSession,
    returnToMain: () => returnToMainRef.current(),
  });

  const obsidian = useObsidianBrowser({
    setCurrentView,
    showNotification,
    focusedSession,
    updateSourceItems: (obsidianConnected: boolean) => {
      // When obsidian config changes, rebuild source items in loadContext
      // This is handled by the obsidian hook calling buildSourceItems directly
      // The loadContext hook stores sourceItems independently
    },
  });

  const loadContext = useLoadContext({
    setCurrentView,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
    onSourceSelect: (source: string, isConnected: boolean) => handleSourceSelectRef.current(source, isConnected),
  });

  const saveFlow = useSaveFlow({
    focusedSession,
    showNotification,
    returnToMain: () => returnToMainRef.current(),
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

  // ---- Define returnToMain (resets all hooks) ----
  const returnToMain = useCallback(() => {
    setCurrentView("main");
    setSelectedMenuIndex(0);
    setSessionsScrollOffset(0);
    setSelectedSessionIndex(0);
    llmWorking.reset();
    claudeToken.reset();
    handoffBrowser.reset();
    archiveBrowser.reset();
    googleDocs.reset();
    notion.reset();
    obsidian.reset();
    loadContext.reset();
    saveFlow.reset();
    settings.reset();
    projectDashboard.reset();
  }, [
    llmWorking.reset,
    claudeToken.reset,
    handoffBrowser.reset,
    archiveBrowser.reset,
    googleDocs.reset,
    notion.reset,
    obsidian.reset,
    loadContext.reset,
    saveFlow.reset,
    settings.reset,
    projectDashboard.reset,
  ]);

  // Keep the ref in sync
  returnToMainRef.current = returnToMain;

  // ---- Define handleSourceSelect ----
  const handleSourceSelect = useCallback((source: string, isConnected: boolean) => {
    if (source === "obsidian") {
      if (isConnected) {
        const vaultPath = getObsidianVaultPath();
        if (vaultPath) {
          obsidian.openBrowser(vaultPath);
        }
      } else {
        obsidian.openConfig();
      }
    } else if (source === "google_docs") {
      if (isConnected) {
        setCurrentView("google-docs-browser");
        googleDocs.loadTree();
      } else {
        showNotification("Connect Google Docs via GUI (localhost:5173)");
      }
    } else if (source === "notion") {
      if (isConnected) {
        setCurrentView("notion-browser");
        notion.loadTree();
      } else {
        showNotification("Connect Notion via GUI (localhost:5173)");
      }
    }
  }, [obsidian.openBrowser, obsidian.openConfig, googleDocs.loadTree, notion.loadTree, showNotification, setCurrentView]);

  // Keep the ref in sync
  handleSourceSelectRef.current = handleSourceSelect;

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

  // ---- Menu items (imported from shared constants) ----

  // ---- Resolve transcript path (shared by Create Handoff) ----
  const resolveTranscriptPath = useCallback(async (): Promise<string | null> => {
    if (!focusedSession) return null;

    // 1. Try session's transcript_path
    if (focusedSession.transcript_path) {
      try {
        const { promises: fs } = await import("fs");
        await fs.access(focusedSession.transcript_path);
        return focusedSession.transcript_path;
      } catch { /* continue to fallbacks */ }
    }

    // 2. Detect by working directory
    const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
    const detected = await detectCurrentSession({ cwd });
    if (detected) return detected.filePath;

    // 3. Search by session ID
    const found = await findSessionById(focusedSession.session_id);
    if (found) return found.filePath;

    return null;
  }, [focusedSession]);

  // ---- Handle menu selection ----
  const handleMenuSelect = useCallback(async (key: string) => {
    switch (key) {
      case "1": // Save Current Context
        setCurrentView("save");
        saveFlow.start();
        break;

      case "2": // Load Context
        loadContext.open();
        break;

      case "3": { // Create Handoff (LLM-powered)
        if (!focusedSession) {
          showNotification("No active session");
          return;
        }

        const transcriptPath = await resolveTranscriptPath();
        if (!transcriptPath) {
          showNotification("No transcript available for this session");
          return;
        }

        const skillInstalled = await isSkillInstalled();
        if (!skillInstalled) {
          showNotification("Skill not installed: ~/.claude/skills/jacques-handoff/");
          return;
        }

        const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
        llmWorking.startHandoff(transcriptPath, cwd);
        break;
      }

      case "4": // Settings
        settings.open();
        claudeToken.loadStatus();
        break;

      case "5": // Quit
        exit();
        break;
    }
  }, [focusedSession, resolveTranscriptPath, showNotification, exit, saveFlow.start, loadContext.open, llmWorking.startHandoff, settings.open, claudeToken.loadStatus]);

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
      if (selectedItem.enabled) {
        handleMenuSelect(selectedItem.key);
      }
      return;
    }
    if (input === "q" || input === "Q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (input === "a" || input === "A") {
      setCurrentView("sessions");
      return;
    }
    if (["1", "2", "3", "4"].includes(input)) {
      const index = parseInt(input) - 1;
      if (MENU_ITEMS[index]?.enabled) {
        handleMenuSelect(input);
      }
      return;
    }
    if (input === "h") {
      const prompt = getHandoffPrompt();
      copyToClipboard(prompt).then(() => {
        showNotification("Handoff prompt copied to clipboard!");
      }).catch(() => {
        showNotification("Failed to copy to clipboard");
      });
      return;
    }
    if (input === "H") {
      if (!focusedSession) {
        showNotification("No active session");
        return;
      }
      const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
      setCurrentView("handoff-browser");
      handoffBrowser.open(cwd);
      return;
    }
    if (input === "c") {
      if (!focusedSession) {
        showNotification("No active session");
        return;
      }
      const transcriptPath = focusedSession.transcript_path;
      if (!transcriptPath) {
        showNotification("No transcript available");
        return;
      }
      const projectDir = focusedSession.workspace?.project_dir || focusedSession.cwd;
      showNotification("Creating handoff...");
      generateHandoffFromTranscript(transcriptPath, projectDir)
        .then((result) => {
          showNotification(`Handoff created: ${result.filename}`, 5000);
        })
        .catch((err) => {
          showNotification(
            `Failed to create handoff: ${err instanceof Error ? err.message : String(err)}`
          );
        });
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
    if (input === "p" || input === "P") {
      if (!focusedSession) {
        showNotification("No active session");
        return;
      }
      const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
      projectDashboard.open(cwd, sessions, focusedSessionId);
      return;
    }
  }, [selectedMenuIndex, handleMenuSelect, exit, focusedSession, showNotification, handoffBrowser.open, projectDashboard.open, sessions, focusedSessionId]);

  // ---- Handler: sessions view input ----
  const handleSessionsInput = useCallback((input: string, key: Key) => {
    if (key.escape) {
      returnToMain();
      return;
    }
    if (key.upArrow) {
      setSelectedSessionIndex((prev) => {
        const newIndex = Math.max(0, prev - 1);
        const itemLine = newIndex * 3;
        if (itemLine < sessionsScrollOffset) {
          setSessionsScrollOffset(itemLine);
        }
        return newIndex;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedSessionIndex((prev) => {
        const maxIndex = Math.max(0, sessions.length - 1);
        const newIndex = Math.min(maxIndex, prev + 1);
        const itemLine = newIndex * 3;
        const maxVisibleItems = 7;
        if (itemLine >= sessionsScrollOffset + maxVisibleItems) {
          setSessionsScrollOffset(itemLine - maxVisibleItems + 3);
        }
        return newIndex;
      });
      return;
    }
    if (key.return && sessions.length > 0) {
      const selectedSession = sessions[selectedSessionIndex];
      if (selectedSession) {
        showNotification("Focusing terminal...");
        focusTerminal(selectedSession.session_id);
      }
      return;
    }
  }, [returnToMain, sessions, selectedSessionIndex, sessionsScrollOffset, showNotification, focusTerminal]);

  // ---- Central keyboard dispatcher ----
  useInput(
    (input, key) => {
      switch (currentView) {
        case "main":
          handleMainViewInput(input, key);
          break;

        case "save":
          saveFlow.handleInput(input, key);
          break;

        case "sessions":
          handleSessionsInput(input, key);
          break;

        case "load":
          loadContext.handleInput(input, key, "load");
          break;

        case "load-sources":
          loadContext.handleInput(input, key, "load-sources");
          break;

        case "obsidian-config":
        case "obsidian-browser":
        case "add-context-confirm":
          obsidian.handleInput(input, key, currentView);
          break;

        case "google-docs-browser":
          googleDocs.handleInput(input, key);
          break;

        case "notion-browser":
          notion.handleInput(input, key);
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

        case "handoff-browser":
          handoffBrowser.handleInput(input, key);
          break;

        case "llm-working":
          llmWorking.handleInput(input, key);
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
        sessionsScrollOffset={sessionsScrollOffset}
        selectedSessionIndex={selectedSessionIndex}
        notification={notification}
        save={saveFlow.state}
        loadContext={loadContext.state}
        obsidian={obsidian.state}
        settings={settings.state}
        claudeToken={claudeToken.state}
        handoff={handoffBrowser.state}
        googleDocs={googleDocs.state}
        notion={notion.state}
        llmWorking={llmWorking.state}
        archive={archiveBrowser.state}
        projectDashboard={projectDashboard.state}
      />
    </Box>
  );
}

export default App;
