/**
 * App Component
 *
 * Root component for the Jacques dashboard.
 * Handles menu navigation and keyboard shortcuts.
 */

import React, { useCallback, useState, useEffect } from "react";
import { useInput, useApp, useStdin, Box, Text } from "ink";
import { useJacquesClient } from "../hooks/useJacquesClient.js";
import { Dashboard } from "./Dashboard.js";
import type {
  DashboardView,
  SavePreviewData,
  SaveSuccessData,
} from "./Dashboard.js";
import {
  detectCurrentSession,
  findSessionById,
  parseJSONL,
  getSessionPreview,
  transformToSavedContext,
  FilterType,
  applyFilter,
  FILTER_CONFIGS,
  saveToArchive,
  isObsidianConfigured,
  getObsidianVaultPath,
  detectObsidianVaults,
  validateVaultPath,
  configureObsidian,
  getVaultName,
  getVaultFileTree,
  flattenTree,
  addContext,
  getArchiveSettings,
  toggleAutoArchive,
  getArchivePath,
  getArchiveStats,
  // Handoff
  listHandoffs,
  getHandoffContent,
  getHandoffPrompt,
  generateHandoffFromTranscript,
  generateHandoffWithLLM,
  isSkillInstalled,
  ClaudeCodeError,
  // Google Docs
  isGoogleDocsConfigured,
  getGoogleDocsConfig,
  getGoogleDocsFileTree,
  flattenGoogleDocsTree,
  exportGoogleDoc,
  // Notion
  isNotionConfigured,
  getNotionConfig,
  getNotionPageTree,
  flattenNotionTree,
  getNotionPageContent,
  // Claude token management
  isClaudeConnected,
  getClaudeToken,
  saveClaudeToken,
  validateToken,
  verifyToken,
  maskToken,
  disconnectClaude,
  // Archive
  listManifestsByProject,
  initializeArchive,
  // Project dashboard
  aggregateProjectStatistics,
  buildProjectSessionList,
  getProjectPlans,
  readLocalPlanContent,
  // Plan progress
  computePlanProgress,
  computePlanProgressSummary,
} from "@jacques/core";
import type {
  SessionFile,
  ParsedEntry,
  ObsidianVault,
  ObsidianFile,
  FileTreeNode,
  FlatTreeItem,
  HandoffEntry,
  LLMHandoffResult,
  LLMStreamCallbacks,
  ArchiveProgress,
  ArchiveInitResult,
  ConversationManifest,
  ProjectStatistics,
  ProjectSessionItem,
  PlanEntry,
  PlanProgress,
  PlanProgressListItem,
} from "@jacques/core";
import { buildSourceItems } from "./SourceSelectionView.js";
import type { SourceItem } from "./SourceSelectionView.js";
import { LOAD_OPTIONS } from "./LoadContextView.js";
import { VISIBLE_ITEMS } from "./ObsidianBrowserView.js";
import { VISIBLE_ITEMS as HANDOFF_VISIBLE_ITEMS } from "./HandoffBrowserView.js";
import { ARCHIVE_VISIBLE_ITEMS, buildArchiveList } from "./ArchiveBrowserView.js";
import type { ArchiveListItem } from "./ArchiveBrowserView.js";
import { SETTINGS_TOTAL_ITEMS } from "./SettingsView.js";
import { GOOGLE_DOCS_VISIBLE_ITEMS } from "./GoogleDocsBrowserView.js";
import { NOTION_VISIBLE_ITEMS } from "./NotionBrowserView.js";
import { VISIBLE_SESSIONS, VISIBLE_PLANS } from "./ProjectDashboardView.js";
import { PLAN_VIEWER_VISIBLE_LINES } from "./PlanViewerView.js";
import type { ArchiveStatsData } from "./SettingsView.js";
import { spawn, exec } from "child_process";

// Copy text to clipboard using system command
function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = process.platform === "darwin"
      ? spawn("pbcopy")
      : spawn("xclip", ["-selection", "clipboard"]);

    proc.stdin.write(text);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clipboard command failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

export function App(): React.ReactElement {
  const { sessions, focusedSessionId, connected, focusTerminal, focusTerminalResult } = useJacquesClient();
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  // UI state
  const [currentView, setCurrentView] = useState<DashboardView>("main");
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const [notification, setNotification] = useState<string | null>(null);

  // Save flow state
  const [savePreview, setSavePreview] = useState<SavePreviewData | null>(null);
  const [saveLabel, setSaveLabel] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<SaveSuccessData | null>(null);
  const [saveScrollOffset, setSaveScrollOffset] = useState<number>(0);

  // Selected filter type for save flow (loaded from settings)
  const [selectedFilterType, setSelectedFilterType] = useState<FilterType>(
    FilterType.WITHOUT_TOOLS
  );

  // Session data for save flow
  const [sessionFile, setSessionFile] = useState<SessionFile | null>(null);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);

  // Scroll state for Active Sessions view
  const [sessionsScrollOffset, setSessionsScrollOffset] = useState<number>(0);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);

  // LoadContext flow state
  const [loadContextIndex, setLoadContextIndex] = useState<number>(0);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);

  // Obsidian config state
  const [obsidianVaults, setObsidianVaults] = useState<ObsidianVault[]>([]);
  const [obsidianConfigIndex, setObsidianConfigIndex] = useState<number>(0);
  const [obsidianManualPath, setObsidianManualPath] = useState<string>("");
  const [obsidianManualMode, setObsidianManualMode] = useState<boolean>(false);
  const [obsidianConfigError, setObsidianConfigError] = useState<string | null>(null);

  // Obsidian browser state
  const [obsidianVaultName, setObsidianVaultName] = useState<string>("");
  const [obsidianFileTree, setObsidianFileTree] = useState<FileTreeNode[]>([]);
  const [obsidianExpandedFolders, setObsidianExpandedFolders] = useState<Set<string>>(new Set());
  const [obsidianTreeItems, setObsidianTreeItems] = useState<FlatTreeItem[]>([]);
  const [obsidianFileIndex, setObsidianFileIndex] = useState<number>(0);
  const [obsidianScrollOffset, setObsidianScrollOffset] = useState<number>(0);
  const [obsidianBrowserLoading, setObsidianBrowserLoading] = useState<boolean>(false);
  const [obsidianBrowserError, setObsidianBrowserError] = useState<string | null>(null);

  // Add context confirm state
  const [selectedObsidianFile, setSelectedObsidianFile] = useState<ObsidianFile | null>(null);
  const [addContextDescription, setAddContextDescription] = useState<string>("");
  const [addContextSuccess, setAddContextSuccess] = useState<{ name: string; path: string } | null>(null);
  const [addContextError, setAddContextError] = useState<string | null>(null);

  // Settings state
  const [settingsIndex, setSettingsIndex] = useState<number>(0);
  const [settingsScrollOffset, setSettingsScrollOffset] = useState<number>(0);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState<boolean>(false);
  const [archiveStats, setArchiveStats] = useState<ArchiveStatsData | null>(null);
  const [archiveStatsLoading, setArchiveStatsLoading] = useState<boolean>(false);

  // Claude token state
  const [claudeConnected, setClaudeConnected] = useState<boolean>(false);
  const [claudeTokenMasked, setClaudeTokenMasked] = useState<string | null>(null);
  const [claudeTokenInput, setClaudeTokenInput] = useState<string>("");
  const [claudeTokenError, setClaudeTokenError] = useState<string | null>(null);
  const [isTokenInputMode, setIsTokenInputMode] = useState<boolean>(false);
  const [isTokenVerifying, setIsTokenVerifying] = useState<boolean>(false);
  const [showConnectionSuccess, setShowConnectionSuccess] = useState<boolean>(false);

  // Handoff browser state
  const [handoffEntries, setHandoffEntries] = useState<HandoffEntry[]>([]);
  const [handoffSelectedIndex, setHandoffSelectedIndex] = useState<number>(0);
  const [handoffScrollOffset, setHandoffScrollOffset] = useState<number>(0);
  const [handoffBrowserLoading, setHandoffBrowserLoading] = useState<boolean>(false);
  const [handoffBrowserError, setHandoffBrowserError] = useState<string | null>(null);

  // Archive browser state
  const [archiveManifestsByProject, setArchiveManifestsByProject] = useState<Map<string, ConversationManifest[]>>(new Map());
  const [archiveExpandedProjects, setArchiveExpandedProjects] = useState<Set<string>>(new Set());
  const [archiveItems, setArchiveItems] = useState<ArchiveListItem[]>([]);
  const [archiveSelectedIndex, setArchiveSelectedIndex] = useState<number>(0);
  const [archiveScrollOffset, setArchiveScrollOffset] = useState<number>(0);
  const [archiveBrowserLoading, setArchiveBrowserLoading] = useState<boolean>(false);
  const [archiveBrowserError, setArchiveBrowserError] = useState<string | null>(null);

  // Archive initialization state
  const [archiveInitProgress, setArchiveInitProgress] = useState<ArchiveProgress | null>(null);
  const [archiveInitResult, setArchiveInitResult] = useState<ArchiveInitResult | null>(null);

  // Google Docs browser state
  const [googleDocsFileTree, setGoogleDocsFileTree] = useState<FileTreeNode[]>([]);
  const [googleDocsExpandedFolders, setGoogleDocsExpandedFolders] = useState<Set<string>>(new Set());
  const [googleDocsTreeItems, setGoogleDocsTreeItems] = useState<FlatTreeItem[]>([]);
  const [googleDocsFileIndex, setGoogleDocsFileIndex] = useState<number>(0);
  const [googleDocsScrollOffset, setGoogleDocsScrollOffset] = useState<number>(0);
  const [googleDocsBrowserLoading, setGoogleDocsBrowserLoading] = useState<boolean>(false);
  const [googleDocsBrowserError, setGoogleDocsBrowserError] = useState<string | null>(null);

  // Notion browser state
  const [notionWorkspaceName, setNotionWorkspaceName] = useState<string>("");
  const [notionFileTree, setNotionFileTree] = useState<FileTreeNode[]>([]);
  const [notionExpandedFolders, setNotionExpandedFolders] = useState<Set<string>>(new Set());
  const [notionTreeItems, setNotionTreeItems] = useState<FlatTreeItem[]>([]);
  const [notionFileIndex, setNotionFileIndex] = useState<number>(0);
  const [notionScrollOffset, setNotionScrollOffset] = useState<number>(0);
  const [notionBrowserLoading, setNotionBrowserLoading] = useState<boolean>(false);
  const [notionBrowserError, setNotionBrowserError] = useState<string | null>(null);

  // LLM working state (for Create Handoff and other LLM operations)
  const [llmWorkingActive, setLlmWorkingActive] = useState<boolean>(false);
  const [llmWorkingTitle, setLlmWorkingTitle] = useState<string>("Working...");
  const [llmWorkingDescription, setLlmWorkingDescription] = useState<string | undefined>(undefined);
  const [llmWorkingElapsedSeconds, setLlmWorkingElapsedSeconds] = useState<number>(0);
  const [llmWorkingStartTime, setLlmWorkingStartTime] = useState<number | null>(null);
  const [llmAbortController, setLlmAbortController] = useState<AbortController | null>(null);

  // LLM streaming state
  const [llmStreamingText, setLlmStreamingText] = useState<string>("");
  const [llmInputTokens, setLlmInputTokens] = useState<number>(0);
  const [llmOutputTokens, setLlmOutputTokens] = useState<number>(0);
  const [llmCurrentStage, setLlmCurrentStage] = useState<string>("");

  // Project dashboard state
  const [projectDashboardStats, setProjectDashboardStats] = useState<ProjectStatistics | null>(null);
  const [projectDashboardSessions, setProjectDashboardSessions] = useState<ProjectSessionItem[]>([]);
  const [projectDashboardPlans, setProjectDashboardPlans] = useState<PlanEntry[]>([]);
  const [projectDashboardSection, setProjectDashboardSection] = useState<"sessions" | "plans">("sessions");
  const [projectDashboardSelectedIndex, setProjectDashboardSelectedIndex] = useState<number>(0);
  const [projectDashboardScrollOffset, setProjectDashboardScrollOffset] = useState<number>(0);
  const [projectDashboardLoading, setProjectDashboardLoading] = useState<boolean>(false);

  // Plan viewer state
  const [planViewerPlan, setPlanViewerPlan] = useState<PlanEntry | null>(null);
  const [planViewerContent, setPlanViewerContent] = useState<string>("");
  const [planViewerScrollOffset, setPlanViewerScrollOffset] = useState<number>(0);

  // Plan progress state
  const [planProgressMap, setPlanProgressMap] = useState<Map<string, PlanProgressListItem>>(new Map());
  const [planViewerProgress, setPlanViewerProgress] = useState<PlanProgress | null>(null);
  const [planViewerProgressLoading, setPlanViewerProgressLoading] = useState<boolean>(false);

  // Get focused session
  const focusedSession = sessions.find(
    (s) => s.session_id === focusedSessionId,
  );

  // Timer for LLM working elapsed time
  useEffect(() => {
    if (!llmWorkingActive || !llmWorkingStartTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - llmWorkingStartTime) / 1000);
      setLlmWorkingElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [llmWorkingActive, llmWorkingStartTime]);

  // Show notification temporarily
  // Prefix with ! for errors (detected by keywords), otherwise treated as success
  const showNotification = useCallback((message: string, duration = 3000) => {
    // Detect error messages by common keywords
    const isError = /^(failed|error|no |not |invalid|cannot|couldn't)/i.test(message);
    const prefix = isError ? "!" : "";
    setNotification(prefix + message);
    setTimeout(() => setNotification(null), duration);
  }, []);

  // Handle focus terminal result notifications
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

  // Handle menu selection
  const handleMenuSelect = useCallback(
    async (key: string) => {
      // Note: key is still "1", "2", "3" for compatibility

      switch (key) {
        case "1": // Save Current Context
          if (!focusedSession) {
            showNotification("No active session to save");
            return;
          }

          // Start save flow - go directly to save view (filter is in settings)
          setCurrentView("save");
          setSaveError(null);
          setSaveSuccess(null);
          setSaveLabel("");
          setSavePreview(null);
          setSaveScrollOffset(0);
          setSessionFile(null);
          setParsedEntries([]);

          // Use WITHOUT_TOOLS as the default filter for saving
          const saveFilterType = FilterType.WITHOUT_TOOLS;
          setSelectedFilterType(saveFilterType);

          // Get working directory from focused session
          const cwd =
            focusedSession.workspace?.project_dir || focusedSession.cwd;

          try {
            let detected: SessionFile | null = null;

            // First, try to use transcript_path from the session if available
            if (focusedSession.transcript_path) {
              try {
                const { promises: fs } = await import("fs");
                const stats = await fs.stat(focusedSession.transcript_path);
                detected = {
                  filePath: focusedSession.transcript_path,
                  sessionId: focusedSession.session_id,
                  modifiedAt: stats.mtime,
                  sizeBytes: stats.size,
                };
              } catch {
                // transcript_path doesn't exist or isn't accessible
                detected = null;
              }
            }

            // Fall back to detecting from Claude projects directory by cwd
            if (!detected) {
              detected = await detectCurrentSession({ cwd });
            }

            // Last resort: search by session ID across all projects
            if (!detected) {
              detected = await findSessionById(focusedSession.session_id);
            }

            if (!detected) {
              setSaveError(
                "No session file found. Cursor native AI sessions may not have JSONL files - this feature requires Claude Code CLI.",
              );
              return;
            }

            setSessionFile(detected);

            // Parse the JSONL file
            const entries = await parseJSONL(detected.filePath);
            setParsedEntries(entries);

            // Apply filter and get preview
            const filteredEntries = applyFilter(entries, saveFilterType);
            const sessionSlug =
              focusedSession.session_title || detected.sessionId.substring(0, 8);
            const preview = getSessionPreview(filteredEntries, sessionSlug);
            // Add filter label from config
            const filterConfig = FILTER_CONFIGS[saveFilterType];
            setSavePreview({
              ...preview,
              filterLabel: filterConfig.label,
            });
          } catch (err) {
            setSaveError(
              `Failed to load session: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          break;

        case "2": // Load Context
          setCurrentView("load");
          setLoadContextIndex(0);
          break;

        case "3": // Create Handoff (LLM-powered)
          if (!focusedSession) {
            showNotification("No active session");
            return;
          }

          // Resolve transcript path with fallbacks (same logic as Save Context)
          const handoffCwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
          let handoffTranscriptPath: string | null = null;

          // 1. Try session's transcript_path
          if (focusedSession.transcript_path) {
            try {
              const { promises: fs } = await import("fs");
              await fs.access(focusedSession.transcript_path);
              handoffTranscriptPath = focusedSession.transcript_path;
            } catch { /* continue to fallbacks */ }
          }

          // 2. Detect by working directory
          if (!handoffTranscriptPath) {
            const detected = await detectCurrentSession({ cwd: handoffCwd });
            if (detected) handoffTranscriptPath = detected.filePath;
          }

          // 3. Search by session ID
          if (!handoffTranscriptPath) {
            const found = await findSessionById(focusedSession.session_id);
            if (found) handoffTranscriptPath = found.filePath;
          }

          if (!handoffTranscriptPath) {
            showNotification("No transcript available for this session");
            return;
          }

          // Check if skill is installed
          const skillInstalled = await isSkillInstalled();
          if (!skillInstalled) {
            showNotification("Skill not installed: ~/.claude/skills/jacques-handoff/");
            return;
          }

          // Create abort controller for cancellation
          const abortController = new AbortController();
          setLlmAbortController(abortController);

          // Show LLM working view
          setCurrentView("llm-working");
          setLlmWorkingActive(true);
          setLlmWorkingTitle("Creating Handoff");
          setLlmWorkingDescription("Analyzing conversation and generating summary...");
          setLlmWorkingElapsedSeconds(0);
          setLlmWorkingStartTime(Date.now());

          // Reset streaming state
          setLlmStreamingText("");
          setLlmInputTokens(0);
          setLlmOutputTokens(0);
          setLlmCurrentStage("");

          try {
            const result = await generateHandoffWithLLM(
              handoffTranscriptPath,
              handoffCwd,
              {
                signal: abortController.signal,
                stream: {
                  onTextDelta: (text) => {
                    setLlmStreamingText((prev) => prev + text);
                  },
                  onTokenUpdate: (input, output) => {
                    setLlmInputTokens(input);
                    setLlmOutputTokens(output);
                  },
                  onStage: (stage) => {
                    setLlmCurrentStage(stage);
                  },
                },
              }
            );

            // Clear working state
            setLlmWorkingActive(false);
            setLlmAbortController(null);
            setCurrentView("main");

            // Show success notification with token count
            const tokenDisplay = result.totalTokens.toLocaleString();
            showNotification(
              `Handoff saved: ${result.filename} (${tokenDisplay} tokens)`,
              5000
            );
          } catch (error) {
            // Clear working state
            setLlmWorkingActive(false);
            setLlmAbortController(null);
            setCurrentView("main");

            // Show error notification
            if (error instanceof ClaudeCodeError && error.message === "Cancelled by user") {
              showNotification("Handoff creation cancelled");
            } else {
              showNotification(
                `Failed: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
          break;

        case "4": // Settings
          // Load current settings
          const settings = getArchiveSettings();
          setAutoArchiveEnabled(settings.autoArchive);
          setSettingsIndex(0);
          setSettingsScrollOffset(0);
          setCurrentView("settings");

          // Load Claude connection status
          const connectedStatus = isClaudeConnected();
          setClaudeConnected(connectedStatus);
          if (connectedStatus) {
            const token = getClaudeToken();
            setClaudeTokenMasked(token ? maskToken(token) : null);
          } else {
            setClaudeTokenMasked(null);
          }
          setClaudeTokenInput("");
          setClaudeTokenError(null);
          setIsTokenInputMode(false);

          // Load archive stats asynchronously
          setArchiveStatsLoading(true);
          getArchiveStats().then((stats) => {
            setArchiveStats({
              totalConversations: stats.totalConversations,
              totalProjects: stats.totalProjects,
              totalSize: stats.sizeFormatted,
              archivePath: getArchivePath(),
            });
            setArchiveStatsLoading(false);
          }).catch(() => {
            setArchiveStats(null);
            setArchiveStatsLoading(false);
          });
          break;

        case "5": // Quit
          exit();
          break;
      }
    },
    [focusedSession, showNotification, exit],
  );

  // Handle returning to main menu
  const returnToMain = useCallback(() => {
    setCurrentView("main");
    setSelectedMenuIndex(0);
    setSavePreview(null);
    setSaveLabel("");
    setSaveError(null);
    setSaveSuccess(null);
    setSaveScrollOffset(0);
    setSessionFile(null);
    setParsedEntries([]);
    setSelectedFilterType(FilterType.WITHOUT_TOOLS);
    setSessionsScrollOffset(0);
    setSelectedSessionIndex(0);
    // Reset LoadContext state
    setLoadContextIndex(0);
    setSourceItems([]);
    setSelectedSourceIndex(0);
    setObsidianVaults([]);
    setObsidianConfigIndex(0);
    setObsidianManualPath("");
    setObsidianManualMode(false);
    setObsidianConfigError(null);
    setObsidianVaultName("");
    setObsidianFileTree([]);
    setObsidianExpandedFolders(new Set());
    setObsidianTreeItems([]);
    setObsidianFileIndex(0);
    setObsidianScrollOffset(0);
    setObsidianBrowserLoading(false);
    setObsidianBrowserError(null);
    setSelectedObsidianFile(null);
    setAddContextDescription("");
    setAddContextSuccess(null);
    setAddContextError(null);
    // Reset handoff state
    setHandoffEntries([]);
    setHandoffSelectedIndex(0);
    setHandoffScrollOffset(0);
    setHandoffBrowserLoading(false);
    setHandoffBrowserError(null);
    // Reset Google Docs state
    setGoogleDocsFileTree([]);
    setGoogleDocsExpandedFolders(new Set());
    setGoogleDocsTreeItems([]);
    setGoogleDocsFileIndex(0);
    setGoogleDocsScrollOffset(0);
    setGoogleDocsBrowserLoading(false);
    setGoogleDocsBrowserError(null);
    // Reset Notion state
    setNotionWorkspaceName("");
    setNotionFileTree([]);
    setNotionExpandedFolders(new Set());
    setNotionTreeItems([]);
    setNotionFileIndex(0);
    setNotionScrollOffset(0);
    setNotionBrowserLoading(false);
    setNotionBrowserError(null);
    // Reset Settings state
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
    // Reset Archive state
    setArchiveManifestsByProject(new Map());
    setArchiveExpandedProjects(new Set());
    setArchiveItems([]);
    setArchiveSelectedIndex(0);
    setArchiveScrollOffset(0);
    setArchiveBrowserLoading(false);
    setArchiveBrowserError(null);
    setArchiveInitProgress(null);
    setArchiveInitResult(null);
  }, []);

  // Handle load context option selection
  const handleLoadContextSelect = useCallback(async (index: number) => {
    const option = LOAD_OPTIONS[index];
    if (!option.enabled) return;

    if (option.key === "sources") {
      // Build source items and check status for all sources
      const obsidianConnected = isObsidianConfigured();
      const googleDocsConnected = isGoogleDocsConfigured();
      const notionConnected = isNotionConfigured();
      setSourceItems(buildSourceItems(obsidianConnected, googleDocsConnected, notionConnected));
      setSelectedSourceIndex(0);
      setCurrentView("load-sources");
    }
    // "saved" option not implemented yet
  }, []);

  // Helper to load Google Docs files as tree
  const loadGoogleDocsTree = useCallback(async () => {
    setGoogleDocsBrowserLoading(true);
    setGoogleDocsBrowserError(null);
    setGoogleDocsFileTree([]);
    setGoogleDocsExpandedFolders(new Set());
    setGoogleDocsTreeItems([]);
    setGoogleDocsFileIndex(0);
    setGoogleDocsScrollOffset(0);

    try {
      const tree = await getGoogleDocsFileTree();
      setGoogleDocsFileTree(tree);
      const items = flattenGoogleDocsTree(tree, new Set());
      setGoogleDocsTreeItems(items);
    } catch (err) {
      setGoogleDocsBrowserError(
        `Failed to list files: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setGoogleDocsBrowserLoading(false);
    }
  }, []);

  // Helper to load Notion pages as tree
  const loadNotionTree = useCallback(async () => {
    setNotionBrowserLoading(true);
    setNotionBrowserError(null);
    setNotionFileTree([]);
    setNotionExpandedFolders(new Set());
    setNotionTreeItems([]);
    setNotionFileIndex(0);
    setNotionScrollOffset(0);

    try {
      // Get workspace name from config
      const config = getNotionConfig();
      if (config?.workspace_name) {
        setNotionWorkspaceName(config.workspace_name);
      }

      const tree = await getNotionPageTree();
      setNotionFileTree(tree);
      const items = flattenNotionTree(tree, new Set());
      setNotionTreeItems(items);
    } catch (err) {
      setNotionBrowserError(
        `Failed to list pages: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setNotionBrowserLoading(false);
    }
  }, []);

  // Helper to load vault files as tree
  const loadVaultTree = useCallback(async (vaultPath: string) => {
    setObsidianBrowserLoading(true);
    setObsidianBrowserError(null);
    setObsidianFileTree([]);
    setObsidianExpandedFolders(new Set());
    setObsidianTreeItems([]);
    setObsidianFileIndex(0);
    setObsidianScrollOffset(0);

    try {
      const tree = await getVaultFileTree(vaultPath);
      setObsidianFileTree(tree);
      // Start with empty expanded set - all folders collapsed
      const items = flattenTree(tree, new Set());
      setObsidianTreeItems(items);
    } catch (err) {
      setObsidianBrowserError(
        `Failed to list files: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setObsidianBrowserLoading(false);
    }
  }, []);

  // Helper to load archive browser
  const loadArchiveBrowser = useCallback(async () => {
    setArchiveBrowserLoading(true);
    setArchiveBrowserError(null);
    setArchiveManifestsByProject(new Map());
    setArchiveExpandedProjects(new Set());
    setArchiveItems([]);
    setArchiveSelectedIndex(0);
    setArchiveScrollOffset(0);

    try {
      const byProject = await listManifestsByProject();
      setArchiveManifestsByProject(byProject);
      const items = buildArchiveList(byProject, new Set());
      setArchiveItems(items);
    } catch (err) {
      setArchiveBrowserError(
        `Failed to load archive: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setArchiveBrowserLoading(false);
    }
  }, []);

  // Handle archive initialization
  // force=true re-archives all sessions (for picking up new content types)
  // filterType defaults to EVERYTHING to preserve all content types
  const handleInitializeArchive = useCallback(async (options: { force?: boolean } = {}) => {
    setCurrentView("archive-initializing");
    setArchiveInitProgress(null);
    setArchiveInitResult(null);

    try {
      const result = await initializeArchive({
        saveToLocal: false,
        force: options.force ?? false,
        filterType: FilterType.EVERYTHING, // Preserve all content types
        onProgress: (progress) => {
          setArchiveInitProgress(progress);
        },
      });
      setArchiveInitResult(result);

      // Reload archive stats
      getArchiveStats().then((stats) => {
        setArchiveStats({
          totalConversations: stats.totalConversations,
          totalProjects: stats.totalProjects,
          totalSize: stats.sizeFormatted,
          archivePath: getArchivePath(),
        });
      });
    } catch (err) {
      setArchiveInitResult({
        totalSessions: 0,
        archived: 0,
        skipped: 0,
        errors: 1,
      });
    }
  }, []);

  // Toggle archive project expand/collapse (uses projectId for uniqueness)
  const toggleArchiveProject = useCallback((projectId: string) => {
    setArchiveExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      // Rebuild flat list with new expanded state
      const items = buildArchiveList(archiveManifestsByProject, next);
      setArchiveItems(items);
      return next;
    });
  }, [archiveManifestsByProject]);

  // Handle source selection
  const handleSourceSelect = useCallback(async (index: number) => {
    const source = sourceItems[index];
    if (!source?.enabled) return;

    if (source.key === "obsidian") {
      if (source.connected) {
        // Already connected - go to file browser
        const vaultPath = getObsidianVaultPath();
        if (vaultPath) {
          setObsidianVaultName(getVaultName(vaultPath));
          setCurrentView("obsidian-browser");
          await loadVaultTree(vaultPath);
        }
      } else {
        // Not connected - go to config
        setObsidianConfigError(null);
        setObsidianManualPath("");
        setObsidianManualMode(false);
        setCurrentView("obsidian-config");

        // Detect vaults
        const vaults = await detectObsidianVaults();
        setObsidianVaults(vaults);
        setObsidianConfigIndex(0);
      }
    } else if (source.key === "google_docs") {
      if (source.connected) {
        // Connected - go to file browser
        setCurrentView("google-docs-browser");
        await loadGoogleDocsTree();
      } else {
        // Not connected - show message (connect via GUI)
        showNotification("Connect Google Docs via GUI (localhost:5173)");
      }
    } else if (source.key === "notion") {
      if (source.connected) {
        // Connected - go to page browser
        setCurrentView("notion-browser");
        await loadNotionTree();
      } else {
        // Not connected - show message (connect via GUI)
        showNotification("Connect Notion via GUI (localhost:5173)");
      }
    }
  }, [sourceItems, loadVaultTree, loadGoogleDocsTree, loadNotionTree, showNotification]);

  // Handle Obsidian vault selection in config
  const handleObsidianVaultSelect = useCallback(async (index: number) => {
    const manualEntryIndex = obsidianVaults.length;

    if (index === manualEntryIndex) {
      // Manual entry mode
      if (!obsidianManualMode) {
        // Enter manual mode
        setObsidianManualMode(true);
        setObsidianManualPath("");
        setObsidianConfigError(null);
      } else if (obsidianManualPath.trim()) {
        // Validate and save manual path
        const path = obsidianManualPath.trim();
        if (!validateVaultPath(path)) {
          setObsidianConfigError("Invalid vault path (missing .obsidian folder)");
          return;
        }

        if (configureObsidian(path)) {
          // Successfully configured - update source items and go to browser
          setSourceItems(buildSourceItems(true));
          setObsidianVaultName(getVaultName(path));
          setCurrentView("obsidian-browser");
          await loadVaultTree(path);
        } else {
          setObsidianConfigError("Failed to save configuration");
        }
      }
    } else {
      // Select detected vault
      const vault = obsidianVaults[index];
      if (!vault) return;

      if (!validateVaultPath(vault.path)) {
        setObsidianConfigError("Invalid vault path (missing .obsidian folder)");
        return;
      }

      if (configureObsidian(vault.path)) {
        // Successfully configured - update source items and go to browser
        setSourceItems(buildSourceItems(true));
        setObsidianVaultName(vault.name);
        setCurrentView("obsidian-browser");
        await loadVaultTree(vault.path);
      } else {
        setObsidianConfigError("Failed to save configuration");
      }
    }
  }, [obsidianVaults, obsidianManualMode, obsidianManualPath, loadVaultTree]);

  // Toggle folder expand/collapse
  const toggleObsidianFolder = useCallback((folderId: string) => {
    setObsidianExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      // Re-flatten the tree with new expanded state
      const items = flattenTree(obsidianFileTree, next);
      setObsidianTreeItems(items);
      return next;
    });
  }, [obsidianFileTree]);

  // Toggle Google Docs folder expand/collapse
  const toggleGoogleDocsFolder = useCallback((folderId: string) => {
    setGoogleDocsExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      const items = flattenGoogleDocsTree(googleDocsFileTree, next);
      setGoogleDocsTreeItems(items);
      return next;
    });
  }, [googleDocsFileTree]);

  // Toggle Notion folder expand/collapse
  const toggleNotionFolder = useCallback((folderId: string) => {
    setNotionExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      const items = flattenNotionTree(notionFileTree, next);
      setNotionTreeItems(items);
      return next;
    });
  }, [notionFileTree]);

  // Handle Obsidian item selection (file or folder)
  const handleObsidianItemSelect = useCallback((index: number) => {
    const item = obsidianTreeItems[index];
    if (!item) return;

    if (item.type === "folder") {
      // Toggle folder expand/collapse
      toggleObsidianFolder(item.id);
    } else {
      // File selected - go to confirm view
      setSelectedObsidianFile({
        path: item.path,
        relativePath: item.relativePath,
        name: item.name,
        sizeBytes: item.sizeBytes || 0,
        modifiedAt: item.modifiedAt || new Date(),
      });
      setAddContextDescription("");
      setAddContextSuccess(null);
      setAddContextError(null);
      setCurrentView("add-context-confirm");
    }
  }, [obsidianTreeItems, toggleObsidianFolder]);

  // Handle add context confirmation
  const handleAddContextConfirm = useCallback(async () => {
    if (!selectedObsidianFile || !focusedSession) return;

    const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;

    try {
      const result = await addContext({
        cwd,
        sourceFile: selectedObsidianFile.path,
        name: selectedObsidianFile.name,
        source: "obsidian",
        description: addContextDescription || undefined,
      });

      setAddContextSuccess({
        name: result.name,
        path: result.path,
      });
    } catch (err) {
      setAddContextError(
        `Failed to add context: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [selectedObsidianFile, focusedSession, addContextDescription]);

  // Handle save confirmation
  const handleSaveConfirm = useCallback(async () => {
    if (!focusedSession || !sessionFile || parsedEntries.length === 0) {
      setSaveError("No session data to save");
      return;
    }

    try {
      // Get working directory
      const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
      const sessionSlug =
        focusedSession.session_title || sessionFile.sessionId.substring(0, 8);

      // Apply selected filter to entries
      const filteredEntries = applyFilter(parsedEntries, selectedFilterType);

      // Transform to SavedContext format with filter type
      const savedContext = transformToSavedContext(filteredEntries, {
        sessionFile,
        sessionSlug,
        workingDirectory: cwd,
        filterType: selectedFilterType,
      });

      // Save to both local and global archive
      const result = await saveToArchive(savedContext, {
        cwd,
        label: saveLabel || undefined,
        filterType: selectedFilterType,
        jsonlPath: sessionFile.filePath,
        entries: parsedEntries,
      });

      // Show success - reset scroll to top
      setSavePreview(null);
      setSaveScrollOffset(0);
      setSaveSuccess({
        filename: result.filename,
        filePath: result.localPath,
        fileSize: result.sizeFormatted,
      });
    } catch (err) {
      setSaveScrollOffset(0); // Reset scroll to top on error
      setSaveError(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [focusedSession, sessionFile, parsedEntries, saveLabel, selectedFilterType]);

  // Menu items constant for reference
  const MENU_ITEMS = [
    { key: "1", label: "Save Context", enabled: true },
    { key: "2", label: "Load Context", enabled: true },
    { key: "3", label: "Create Handoff", enabled: true },
    { key: "4", label: "Settings", enabled: true },
  ];

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Handle based on current view
      if (currentView === "main") {
        // Arrow key navigation (Up/Down for vertical menu)
        if (key.upArrow) {
          setSelectedMenuIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow) {
          const maxIndex = MENU_ITEMS.length - 1;
          setSelectedMenuIndex((prev) => Math.min(maxIndex, prev + 1));
          return;
        }

        // Enter to select
        if (key.return) {
          const selectedItem = MENU_ITEMS[selectedMenuIndex];
          if (selectedItem.enabled) {
            handleMenuSelect(selectedItem.key);
          }
          return;
        }

        // Q shortcut
        if (input === "q" || input === "Q" || (key.ctrl && input === "c")) {
          exit();
          return;
        }

        // A shortcut for Active Sessions
        if (input === "a" || input === "A") {
          setCurrentView("sessions");
          return;
        }

        // Number key support for convenience
        if (["1", "2", "3", "4"].includes(input)) {
          const index = parseInt(input) - 1;
          if (MENU_ITEMS[index]?.enabled) {
            handleMenuSelect(input);
          }
          return;
        }

        // h shortcut - copy handoff prompt to clipboard
        if (input === "h") {
          const prompt = getHandoffPrompt();
          copyToClipboard(prompt).then(() => {
            showNotification("Handoff prompt copied to clipboard!");
          }).catch(() => {
            showNotification("Failed to copy to clipboard");
          });
          return;
        }

        // H shortcut - browse handoffs
        if (input === "H") {
          if (!focusedSession) {
            showNotification("No active session");
            return;
          }
          const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
          setHandoffBrowserLoading(true);
          setHandoffBrowserError(null);
          setHandoffEntries([]);
          setHandoffSelectedIndex(0);
          setHandoffScrollOffset(0);
          setCurrentView("handoff-browser");

          listHandoffs(cwd).then((catalog) => {
            setHandoffEntries(catalog.entries);
            setHandoffBrowserLoading(false);
          }).catch((err) => {
            setHandoffBrowserError(
              `Failed to list handoffs: ${err instanceof Error ? err.message : String(err)}`
            );
            setHandoffBrowserLoading(false);
          });
          return;
        }

        // c shortcut - create handoff from transcript
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

        // W shortcut - open web GUI in browser
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

        // P shortcut - open project dashboard
        if (input === "p" || input === "P") {
          if (!focusedSession) {
            showNotification("No active session");
            return;
          }
          const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;

          // Initialize dashboard state
          setProjectDashboardLoading(true);
          setProjectDashboardSection("sessions");
          setProjectDashboardSelectedIndex(0);
          setProjectDashboardScrollOffset(0);
          setCurrentView("project-dashboard");

          // Load dashboard data
          Promise.all([
            aggregateProjectStatistics(cwd, sessions),
            buildProjectSessionList(cwd, sessions, focusedSessionId),
            getProjectPlans(cwd),
          ]).then(async ([stats, sessionList, plans]) => {
            setProjectDashboardStats(stats);
            setProjectDashboardSessions(sessionList);
            setProjectDashboardPlans(plans);
            setProjectDashboardLoading(false);

            // Compute plan progress asynchronously (don't block dashboard load)
            setPlanProgressMap(new Map()); // Reset progress map
            for (const plan of plans) {
              try {
                const content = await readLocalPlanContent(cwd, plan);
                if (content) {
                  const summary = await computePlanProgressSummary(plan, content, cwd);
                  setPlanProgressMap((prev) => {
                    const next = new Map(prev);
                    next.set(plan.id, summary);
                    return next;
                  });
                }
              } catch {
                // Skip failed progress computation for individual plans
              }
            }
          }).catch((err) => {
            showNotification(`Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`);
            setProjectDashboardLoading(false);
          });
          return;
        }
      } else if (currentView === "save") {
        // Save view handling

        // Arrow keys for scrolling (works in all save states)
        if (key.upArrow) {
          setSaveScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          setSaveScrollOffset((prev) => prev + 1);
          return;
        }

        if (saveSuccess || saveError) {
          // Only Enter or Escape closes success/error view
          if (key.return || key.escape) {
            returnToMain();
          }
          return;
        }

        if (key.escape) {
          returnToMain();
          return;
        }

        if (key.return && savePreview) {
          handleSaveConfirm();
          return;
        }

        // Handle label input (only printable characters)
        if (savePreview && !saveError) {
          if (key.backspace || key.delete) {
            setSaveLabel((prev) => prev.slice(0, -1));
            return;
          }

          // Add character to label (alphanumeric, dash, underscore only)
          if (/^[a-zA-Z0-9_-]$/.test(input)) {
            setSaveLabel((prev) => prev + input);
            return;
          }
        }
      } else if (currentView === "sessions") {
        // Active Sessions view - handle navigation and terminal focus
        if (key.escape) {
          returnToMain();
          setSessionsScrollOffset(0);
          setSelectedSessionIndex(0);
          return;
        }

        if (key.upArrow) {
          setSelectedSessionIndex((prev) => {
            const newIndex = Math.max(0, prev - 1);
            // Each session takes 3 lines (name, metrics, spacer)
            const itemLine = newIndex * 3;
            // Scroll up if needed (7 visible lines in content area)
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
            // Each session takes 3 lines (name, metrics, spacer)
            const itemLine = newIndex * 3;
            const maxVisibleItems = 7; // FIXED_CONTENT_HEIGHT(10) - HEADER(2) - FOOTER(1)
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
      } else if (currentView === "load") {
        // Load Context view - navigate options
        if (key.escape) {
          returnToMain();
          return;
        }

        if (key.upArrow) {
          setLoadContextIndex((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          setLoadContextIndex((prev) => Math.min(LOAD_OPTIONS.length - 1, prev + 1));
          return;
        }

        if (key.return) {
          handleLoadContextSelect(loadContextIndex);
          return;
        }
      } else if (currentView === "load-sources") {
        // Source selection view
        if (key.escape) {
          setCurrentView("load");
          return;
        }

        if (key.upArrow) {
          setSelectedSourceIndex((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          setSelectedSourceIndex((prev) => Math.min(sourceItems.length - 1, prev + 1));
          return;
        }

        if (key.return) {
          handleSourceSelect(selectedSourceIndex);
          return;
        }
      } else if (currentView === "obsidian-config") {
        // Obsidian config view
        if (key.escape) {
          if (obsidianManualMode) {
            // Exit manual mode
            setObsidianManualMode(false);
            setObsidianManualPath("");
            setObsidianConfigError(null);
          } else {
            setCurrentView("load-sources");
          }
          return;
        }

        if (obsidianManualMode) {
          // Text input mode
          if (key.return) {
            handleObsidianVaultSelect(obsidianVaults.length); // Manual entry index
            return;
          }

          if (key.backspace || key.delete) {
            setObsidianManualPath((prev) => prev.slice(0, -1));
            return;
          }

          // Add character to path
          if (input && input.length === 1) {
            setObsidianManualPath((prev) => prev + input);
            return;
          }
        } else {
          // Navigation mode
          const maxIndex = obsidianVaults.length; // +1 for manual entry

          if (key.upArrow) {
            setObsidianConfigIndex((prev) => Math.max(0, prev - 1));
            return;
          }

          if (key.downArrow) {
            setObsidianConfigIndex((prev) => Math.min(maxIndex, prev + 1));
            return;
          }

          if (key.return) {
            handleObsidianVaultSelect(obsidianConfigIndex);
            return;
          }
        }
      } else if (currentView === "obsidian-browser") {
        // Obsidian file browser view
        if (key.escape) {
          setCurrentView("load-sources");
          return;
        }

        if (key.upArrow) {
          const newIndex = Math.max(0, obsidianFileIndex - 1);
          setObsidianFileIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex < obsidianScrollOffset) {
            setObsidianScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(obsidianTreeItems.length - 1, obsidianFileIndex + 1);
          setObsidianFileIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex >= obsidianScrollOffset + VISIBLE_ITEMS) {
            setObsidianScrollOffset(newIndex - VISIBLE_ITEMS + 1);
          }
          return;
        }

        if (key.return && obsidianTreeItems.length > 0) {
          handleObsidianItemSelect(obsidianFileIndex);
          return;
        }
      } else if (currentView === "google-docs-browser") {
        // Google Docs file browser view
        if (key.escape) {
          setCurrentView("load-sources");
          return;
        }

        if (key.upArrow) {
          const newIndex = Math.max(0, googleDocsFileIndex - 1);
          setGoogleDocsFileIndex(newIndex);
          if (newIndex < googleDocsScrollOffset) {
            setGoogleDocsScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(googleDocsTreeItems.length - 1, googleDocsFileIndex + 1);
          setGoogleDocsFileIndex(newIndex);
          if (newIndex >= googleDocsScrollOffset + GOOGLE_DOCS_VISIBLE_ITEMS) {
            setGoogleDocsScrollOffset(newIndex - GOOGLE_DOCS_VISIBLE_ITEMS + 1);
          }
          return;
        }

        if (key.return && googleDocsTreeItems.length > 0) {
          const item = googleDocsTreeItems[googleDocsFileIndex];
          if (item) {
            if (item.type === "folder") {
              toggleGoogleDocsFolder(item.id);
            } else {
              // Export and add to context
              showNotification("Exporting document...");
              exportGoogleDoc(item.id).then(async (content) => {
                if (!content) {
                  showNotification("Failed to export document");
                  return;
                }
                if (!focusedSession) {
                  showNotification("No active session");
                  return;
                }
                const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
                try {
                  // Write content to temp file and add to context
                  const { promises: fs } = await import("fs");
                  const { join } = await import("path");
                  const { tmpdir } = await import("os");
                  const tempFile = join(tmpdir(), `${item.id}.md`);
                  await fs.writeFile(tempFile, content, "utf-8");

                  const result = await addContext({
                    cwd,
                    sourceFile: tempFile,
                    name: item.name,
                    source: "google_docs",
                  });
                  showNotification(`Added: ${result.name}`, 3000);
                  returnToMain();
                } catch (err) {
                  showNotification(`Failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              });
            }
          }
          return;
        }
      } else if (currentView === "notion-browser") {
        // Notion page browser view
        if (key.escape) {
          setCurrentView("load-sources");
          return;
        }

        if (key.upArrow) {
          const newIndex = Math.max(0, notionFileIndex - 1);
          setNotionFileIndex(newIndex);
          if (newIndex < notionScrollOffset) {
            setNotionScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(notionTreeItems.length - 1, notionFileIndex + 1);
          setNotionFileIndex(newIndex);
          if (newIndex >= notionScrollOffset + NOTION_VISIBLE_ITEMS) {
            setNotionScrollOffset(newIndex - NOTION_VISIBLE_ITEMS + 1);
          }
          return;
        }

        if (key.return && notionTreeItems.length > 0) {
          const item = notionTreeItems[notionFileIndex];
          if (item) {
            if (item.type === "folder") {
              toggleNotionFolder(item.id);
            } else {
              // Get page content and add to context
              showNotification("Fetching page content...");
              getNotionPageContent(item.id).then(async (content) => {
                if (!content) {
                  showNotification("Failed to fetch page content");
                  return;
                }
                if (!focusedSession) {
                  showNotification("No active session");
                  return;
                }
                const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
                try {
                  // Write content to temp file and add to context
                  const { promises: fs } = await import("fs");
                  const { join } = await import("path");
                  const { tmpdir } = await import("os");
                  const tempFile = join(tmpdir(), `${item.id}.md`);
                  await fs.writeFile(tempFile, content, "utf-8");

                  const result = await addContext({
                    cwd,
                    sourceFile: tempFile,
                    name: item.name.replace(/^[\p{Emoji}]\s*/u, ""), // Remove emoji prefix
                    source: "notion",
                  });
                  showNotification(`Added: ${result.name}`, 3000);
                  returnToMain();
                } catch (err) {
                  showNotification(`Failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              });
            }
          }
          return;
        }
      } else if (currentView === "add-context-confirm") {
        // Add context confirm view
        if (addContextSuccess) {
          // Any key returns to main after success
          returnToMain();
          return;
        }

        if (key.escape) {
          setCurrentView("obsidian-browser");
          setSelectedObsidianFile(null);
          setAddContextDescription("");
          setAddContextError(null);
          return;
        }

        if (key.return && selectedObsidianFile && !addContextError) {
          handleAddContextConfirm();
          return;
        }

        // Handle description input
        if (!addContextError) {
          if (key.backspace || key.delete) {
            setAddContextDescription((prev) => prev.slice(0, -1));
            return;
          }

          // Add character to description
          if (input && input.length === 1) {
            setAddContextDescription((prev) => prev + input);
            return;
          }
        }
      } else if (currentView === "settings") {
        // Settings view
        // Index 0: Claude Connection
        // Index 1: Auto-archive toggle
        // Index 2: Extract Catalog
        // Index 3: Re-extract All
        // Index 4: Browse Archive

        // Handle token input mode
        if (isTokenInputMode) {
          if (key.escape) {
            // Cancel token input
            setIsTokenInputMode(false);
            setClaudeTokenInput("");
            setClaudeTokenError(null);
            return;
          }

          if (key.backspace || key.delete) {
            setClaudeTokenInput((prev) => prev.slice(0, -1));
            setClaudeTokenError(null);
            return;
          }

          // Handle input BEFORE return key - paste includes newlines which trigger key.return
          // If there's multi-char input (paste), process it first
          if (input && input.length >= 1) {
            const cleanInput = input.replace(/[\r\n\t]/g, '').trim();
            if (cleanInput.length > 0) {
              // If pasting what looks like a complete token, set it and auto-verify
              if (cleanInput.startsWith('sk-') && cleanInput.length > 20) {
                // Complete token paste - set and verify
                setClaudeTokenInput(cleanInput);
                setClaudeTokenError(null);

                // Auto-verify after paste
                setIsTokenVerifying(true);
                verifyToken(cleanInput).then((result) => {
                  setIsTokenVerifying(false);

                  if (!result.valid) {
                    setClaudeTokenError(result.error || "Invalid or expired token");
                    return;
                  }

                  try {
                    saveClaudeToken(cleanInput);
                    setClaudeConnected(true);
                    setClaudeTokenMasked(maskToken(cleanInput));
                    setIsTokenInputMode(false);
                    setClaudeTokenInput("");
                    setClaudeTokenError(null);
                    // Show temporary success message
                    setShowConnectionSuccess(true);
                    setTimeout(() => setShowConnectionSuccess(false), 3000);
                  } catch (err) {
                    setClaudeTokenError(err instanceof Error ? err.message : "Failed to save token");
                  }
                }).catch((err) => {
                  setIsTokenVerifying(false);
                  setClaudeTokenError(err instanceof Error ? err.message : "Failed to verify token");
                });
                return;
              }

              // Regular typing - append to input
              setClaudeTokenInput((prev) => prev + cleanInput);
              setClaudeTokenError(null);
              return;
            }
          }

          // Handle return key (only if no input text, meaning user pressed Enter)
          if (key.return && (!input || input.length === 0 || input === '\r' || input === '\n')) {
            // Try to save the token
            const validation = validateToken(claudeTokenInput);
            if (!validation.valid) {
              setClaudeTokenError(validation.error || "Invalid token");
              return;
            }

            // Verify token with API call
            setIsTokenVerifying(true);
            setClaudeTokenError(null);

            verifyToken(claudeTokenInput).then((result) => {
              setIsTokenVerifying(false);

              if (!result.valid) {
                setClaudeTokenError(result.error || "Invalid or expired token");
                return;
              }

              try {
                saveClaudeToken(claudeTokenInput);
                setClaudeConnected(true);
                setClaudeTokenMasked(maskToken(claudeTokenInput));
                setIsTokenInputMode(false);
                setClaudeTokenInput("");
                setClaudeTokenError(null);
                // Show temporary success message
                setShowConnectionSuccess(true);
                setTimeout(() => setShowConnectionSuccess(false), 3000);
              } catch (err) {
                setClaudeTokenError(err instanceof Error ? err.message : "Failed to save token");
              }
            }).catch((err) => {
              setIsTokenVerifying(false);
              setClaudeTokenError(err instanceof Error ? err.message : "Failed to verify token");
            });
            return;
          }
          return;
        }

        // Normal settings navigation
        if (key.escape) {
          returnToMain();
          return;
        }

        // Settings has ~20 content lines, visible height is 10
        // Map settings index to approximate content row for scrolling
        // Row positions: Claude ~4, Auto-archive ~8, Extract ~11, Re-extract ~12, Browse ~13
        const SETTINGS_ROW_MAP = [4, 8, 11, 12, 13];
        const VISIBLE_HEIGHT = 10;
        const TOTAL_CONTENT_LINES = 20; // Approximate total content lines

        if (key.upArrow) {
          const newIndex = Math.max(0, settingsIndex - 1);
          setSettingsIndex(newIndex);
          // Adjust scroll to keep selection visible
          const targetRow = SETTINGS_ROW_MAP[newIndex];
          // When moving to first item, scroll to top to show title
          if (newIndex === 0) {
            setSettingsScrollOffset(0);
          } else if (targetRow < settingsScrollOffset + 2) {
            // Keep some context above
            setSettingsScrollOffset(Math.max(0, targetRow - 2));
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(SETTINGS_TOTAL_ITEMS - 1, settingsIndex + 1);
          setSettingsIndex(newIndex);
          // Adjust scroll to keep selection visible
          const targetRow = SETTINGS_ROW_MAP[newIndex];
          if (targetRow >= settingsScrollOffset + VISIBLE_HEIGHT - 2) {
            // Keep some context below, but don't scroll past content
            const maxScroll = Math.max(0, TOTAL_CONTENT_LINES - VISIBLE_HEIGHT);
            setSettingsScrollOffset(Math.min(maxScroll, targetRow - VISIBLE_HEIGHT + 4));
          }
          return;
        }

        if (key.return || input === " ") {
          if (settingsIndex === 0) {
            // Claude Connection - enter token input mode or disconnect
            if (claudeConnected) {
              // Already connected - disconnect
              disconnectClaude();
              setClaudeConnected(false);
              setClaudeTokenMasked(null);
              showNotification("Claude disconnected");
            } else {
              // Not connected - enter token input mode
              setIsTokenInputMode(true);
              setClaudeTokenInput("");
              setClaudeTokenError(null);
            }
          } else if (settingsIndex === 1) {
            // Auto-archive toggle
            const newValue = toggleAutoArchive();
            setAutoArchiveEnabled(newValue);
          } else if (settingsIndex === 2) {
            // Extract Catalog (skip already extracted)
            handleInitializeArchive({ force: false });
          } else if (settingsIndex === 3) {
            // Re-extract All (force re-extract everything)
            handleInitializeArchive({ force: true });
          } else if (settingsIndex === 4) {
            // Browse Archive
            setCurrentView("archive-browser");
            loadArchiveBrowser();
          }
          return;
        }
      } else if (currentView === "archive-browser") {
        // Archive browser view
        if (key.escape) {
          returnToMain();
          return;
        }

        if (key.upArrow) {
          const newIndex = Math.max(0, archiveSelectedIndex - 1);
          setArchiveSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex < archiveScrollOffset) {
            setArchiveScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(archiveItems.length - 1, archiveSelectedIndex + 1);
          setArchiveSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex >= archiveScrollOffset + ARCHIVE_VISIBLE_ITEMS) {
            setArchiveScrollOffset(newIndex - ARCHIVE_VISIBLE_ITEMS + 1);
          }
          return;
        }

        if (key.return && archiveItems.length > 0) {
          const selectedItem = archiveItems[archiveSelectedIndex];
          if (selectedItem?.type === "project" && selectedItem.projectId) {
            // Toggle project expansion using projectId for uniqueness
            toggleArchiveProject(selectedItem.projectId);
          } else if (selectedItem?.type === "conversation" && selectedItem.manifest) {
            // For now, just show notification - could open viewer in future
            showNotification(`Selected: ${selectedItem.manifest.title.substring(0, 30)}...`);
          }
          return;
        }
      } else if (currentView === "archive-initializing") {
        // Archive initializing view - only Escape when complete
        if (key.escape) {
          if (archiveInitResult) {
            // Initialization complete - return to settings
            setCurrentView("settings");
            // Reload stats
            getArchiveStats().then((stats) => {
              setArchiveStats({
                totalConversations: stats.totalConversations,
                totalProjects: stats.totalProjects,
                totalSize: stats.sizeFormatted,
                archivePath: getArchivePath(),
              });
            });
          }
          return;
        }
      } else if (currentView === "handoff-browser") {
        // Handoff browser view
        if (key.escape) {
          returnToMain();
          return;
        }

        if (key.upArrow) {
          const newIndex = Math.max(0, handoffSelectedIndex - 1);
          setHandoffSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex < handoffScrollOffset) {
            setHandoffScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const newIndex = Math.min(handoffEntries.length - 1, handoffSelectedIndex + 1);
          setHandoffSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex >= handoffScrollOffset + HANDOFF_VISIBLE_ITEMS) {
            setHandoffScrollOffset(newIndex - HANDOFF_VISIBLE_ITEMS + 1);
          }
          return;
        }

        if (key.return && handoffEntries.length > 0) {
          // Copy selected handoff content to clipboard
          const selectedEntry = handoffEntries[handoffSelectedIndex];
          if (selectedEntry) {
            getHandoffContent(selectedEntry.path).then((content) => {
              return copyToClipboard(content).then(() => {
                showNotification("Handoff copied to clipboard!");
                returnToMain();
              });
            }).catch(() => {
              showNotification("Failed to read or copy handoff");
            });
          }
          return;
        }
      } else if (currentView === "llm-working") {
        // LLM working view - only Escape to cancel
        if (key.escape) {
          if (llmAbortController) {
            llmAbortController.abort();
          }
          setLlmWorkingActive(false);
          setLlmAbortController(null);
          setCurrentView("main");
          showNotification("Cancelled");
          return;
        }
      } else if (currentView === "project-dashboard") {
        // Project dashboard view
        if (key.escape) {
          returnToMain();
          return;
        }

        // Tab to switch between sessions and plans
        if (key.tab) {
          setProjectDashboardSection((prev) =>
            prev === "sessions" ? "plans" : "sessions"
          );
          setProjectDashboardSelectedIndex(0);
          setProjectDashboardScrollOffset(0);
          return;
        }

        // Arrow key navigation
        if (key.upArrow) {
          const items = projectDashboardSection === "sessions"
            ? projectDashboardSessions
            : projectDashboardPlans;
          const visibleCount = projectDashboardSection === "sessions"
            ? VISIBLE_SESSIONS
            : VISIBLE_PLANS;

          const newIndex = Math.max(0, projectDashboardSelectedIndex - 1);
          setProjectDashboardSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex < projectDashboardScrollOffset) {
            setProjectDashboardScrollOffset(newIndex);
          }
          return;
        }

        if (key.downArrow) {
          const items = projectDashboardSection === "sessions"
            ? projectDashboardSessions
            : projectDashboardPlans;
          const visibleCount = projectDashboardSection === "sessions"
            ? VISIBLE_SESSIONS
            : VISIBLE_PLANS;

          const newIndex = Math.min(items.length - 1, projectDashboardSelectedIndex + 1);
          setProjectDashboardSelectedIndex(newIndex);
          // Adjust scroll if needed
          if (newIndex >= projectDashboardScrollOffset + visibleCount) {
            setProjectDashboardScrollOffset(newIndex - visibleCount + 1);
          }
          return;
        }

        // Enter to view plan content (only in plans section)
        if (key.return && projectDashboardSection === "plans" && projectDashboardPlans.length > 0) {
          const selectedPlan = projectDashboardPlans[projectDashboardSelectedIndex];
          if (selectedPlan && focusedSession) {
            const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
            setPlanViewerPlan(selectedPlan);
            setPlanViewerScrollOffset(0);
            setPlanViewerProgress(null);
            setPlanViewerProgressLoading(true);
            setCurrentView("plan-viewer");

            // Load plan content and compute progress
            readLocalPlanContent(cwd, selectedPlan).then(async (content) => {
              const planContent = content || "Failed to load plan content";
              setPlanViewerContent(planContent);

              // Compute full progress for detailed view
              if (content) {
                try {
                  const progress = await computePlanProgress(selectedPlan, content, cwd);
                  setPlanViewerProgress(progress);
                } catch {
                  // Progress computation failed - that's okay
                }
              }
              setPlanViewerProgressLoading(false);
            }).catch(() => {
              setPlanViewerContent("Failed to load plan content");
              setPlanViewerProgressLoading(false);
            });
          }
          return;
        }
      } else if (currentView === "plan-viewer") {
        // Plan viewer - scrolling and exit
        if (key.escape) {
          setCurrentView("project-dashboard");
          return;
        }

        // Scroll content
        if (key.upArrow) {
          setPlanViewerScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          setPlanViewerScrollOffset((prev) => prev + 1);
          return;
        }

        // Page up/down
        if (key.pageUp) {
          setPlanViewerScrollOffset((prev) =>
            Math.max(0, prev - PLAN_VIEWER_VISIBLE_LINES)
          );
          return;
        }

        if (key.pageDown) {
          setPlanViewerScrollOffset((prev) => prev + PLAN_VIEWER_VISIBLE_LINES);
          return;
        }
      } else {
        // Placeholder views - any key returns to main
        if (key.escape || key.return || input) {
          returnToMain();
          return;
        }
      }
    },
    {
      isActive: isRawModeSupported,
    },
  );

  return (
    <Box flexDirection="column">
      <Dashboard
        sessions={sessions}
        focusedSessionId={focusedSessionId}
        connected={connected}
        currentView={currentView}
        selectedMenuIndex={selectedMenuIndex}
        savePreview={savePreview}
        saveLabel={saveLabel}
        saveError={saveError}
        saveSuccess={saveSuccess}
        saveScrollOffset={saveScrollOffset}
        sessionsScrollOffset={sessionsScrollOffset}
        selectedSessionIndex={selectedSessionIndex}
        // LoadContext props
        loadContextIndex={loadContextIndex}
        sourceItems={sourceItems}
        selectedSourceIndex={selectedSourceIndex}
        // Obsidian config props
        obsidianVaults={obsidianVaults}
        obsidianConfigIndex={obsidianConfigIndex}
        obsidianManualPath={obsidianManualPath}
        obsidianManualMode={obsidianManualMode}
        obsidianConfigError={obsidianConfigError}
        // Obsidian browser props
        obsidianVaultName={obsidianVaultName}
        obsidianTreeItems={obsidianTreeItems}
        obsidianFileIndex={obsidianFileIndex}
        obsidianScrollOffset={obsidianScrollOffset}
        obsidianBrowserLoading={obsidianBrowserLoading}
        obsidianBrowserError={obsidianBrowserError}
        // Add context confirm props
        selectedObsidianFile={selectedObsidianFile}
        addContextDescription={addContextDescription}
        addContextSuccess={addContextSuccess}
        addContextError={addContextError}
        // Settings props
        settingsIndex={settingsIndex}
        settingsScrollOffset={settingsScrollOffset}
        autoArchiveEnabled={autoArchiveEnabled}
        archiveStats={archiveStats}
        archiveStatsLoading={archiveStatsLoading}
        // Claude token props
        claudeConnected={claudeConnected}
        claudeTokenMasked={claudeTokenMasked}
        claudeTokenInput={claudeTokenInput}
        claudeTokenError={claudeTokenError}
        isTokenInputMode={isTokenInputMode}
        isTokenVerifying={isTokenVerifying}
        showConnectionSuccess={showConnectionSuccess}
        // Handoff browser props
        handoffEntries={handoffEntries}
        handoffSelectedIndex={handoffSelectedIndex}
        handoffScrollOffset={handoffScrollOffset}
        handoffBrowserLoading={handoffBrowserLoading}
        handoffBrowserError={handoffBrowserError}
        // Google Docs browser props
        googleDocsTreeItems={googleDocsTreeItems}
        googleDocsFileIndex={googleDocsFileIndex}
        googleDocsScrollOffset={googleDocsScrollOffset}
        googleDocsBrowserLoading={googleDocsBrowserLoading}
        googleDocsBrowserError={googleDocsBrowserError}
        // Notion browser props
        notionWorkspaceName={notionWorkspaceName}
        notionTreeItems={notionTreeItems}
        notionFileIndex={notionFileIndex}
        notionScrollOffset={notionScrollOffset}
        notionBrowserLoading={notionBrowserLoading}
        notionBrowserError={notionBrowserError}
        // LLM working props
        llmWorkingTitle={llmWorkingTitle}
        llmWorkingDescription={llmWorkingDescription}
        llmWorkingElapsedSeconds={llmWorkingElapsedSeconds}
        // LLM streaming props
        llmStreamingText={llmStreamingText}
        llmInputTokens={llmInputTokens}
        llmOutputTokens={llmOutputTokens}
        llmCurrentStage={llmCurrentStage}
        // Archive browser props
        archiveItems={archiveItems}
        archiveSelectedIndex={archiveSelectedIndex}
        archiveScrollOffset={archiveScrollOffset}
        archiveBrowserLoading={archiveBrowserLoading}
        archiveBrowserError={archiveBrowserError}
        // Archive initialization props
        archiveInitProgress={archiveInitProgress}
        archiveInitResult={archiveInitResult}
        // Project dashboard props
        projectDashboardStats={projectDashboardStats}
        projectDashboardSessions={projectDashboardSessions}
        projectDashboardPlans={projectDashboardPlans}
        projectDashboardSection={projectDashboardSection}
        projectDashboardSelectedIndex={projectDashboardSelectedIndex}
        projectDashboardScrollOffset={projectDashboardScrollOffset}
        projectDashboardLoading={projectDashboardLoading}
        planProgressMap={planProgressMap}
        // Plan viewer props
        planViewerPlan={planViewerPlan}
        planViewerContent={planViewerContent}
        planViewerScrollOffset={planViewerScrollOffset}
        planViewerProgress={planViewerProgress}
        planViewerProgressLoading={planViewerProgressLoading}
        // Notification (displayed in bottom border)
        notification={notification}
      />
    </Box>
  );
}

export default App;
