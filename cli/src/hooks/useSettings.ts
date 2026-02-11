/**
 * useSettings Hook
 *
 * Manages settings view state: navigation, auto-archive toggle,
 * skip-permissions toggle, sync operations, archive stats loading,
 * and Claude token input delegation.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  getArchiveSettings,
  toggleAutoArchive,
  getArchiveStats,
  getArchivePath,
  getSkipPermissions,
  toggleSkipPermissions,
} from "@jacques/core";
import { SETTINGS_TOTAL_ITEMS } from "../components/SettingsView.js";
import type { ArchiveStatsData } from "../components/SettingsView.js";

export interface ClaudeTokenActions {
  isInputMode: boolean;
  handleInput: (input: string, key: Key) => void;
  connected: boolean;
  disconnect: () => void;
  enterInputMode: () => void;
}

export interface UseSettingsParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  returnToMain: () => void;
  onInitArchive: (options: { force: boolean }) => Promise<void>;
  onBrowseArchive: () => void;
}

export interface UseSettingsState {
  index: number;
  scrollOffset: number;
  autoArchiveEnabled: boolean;
  skipPermissions: boolean;
  syncProgress: string | null;
  archiveStats: ArchiveStatsData | null;
  archiveStatsLoading: boolean;
  notificationsEnabled: boolean;
  notificationsLoading: boolean;
}

export interface UseSettingsReturn {
  state: UseSettingsState;
  open: () => void;
  reloadStats: () => void;
  handleInput: (input: string, key: Key, claudeToken: ClaudeTokenActions) => void;
  reset: () => void;
}

const API_BASE = "http://localhost:4243";

export function useSettings({
  setCurrentView,
  showNotification,
  returnToMain,
  onInitArchive,
  onBrowseArchive,
}: UseSettingsParams): UseSettingsReturn {
  const [settingsIndex, setSettingsIndex] = useState<number>(0);
  const [settingsScrollOffset, setSettingsScrollOffset] = useState<number>(0);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState<boolean>(false);
  const [skipPermissions, setSkipPermissions] = useState<boolean>(getSkipPermissions());
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [archiveStats, setArchiveStats] = useState<ArchiveStatsData | null>(null);
  const [archiveStatsLoading, setArchiveStatsLoading] = useState<boolean>(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notificationsLoading, setNotificationsLoading] = useState<boolean>(false);

  const open = useCallback(() => {
    const settings = getArchiveSettings();
    setAutoArchiveEnabled(settings.autoArchive);
    setSkipPermissions(getSkipPermissions());
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
    setCurrentView("settings");

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
  }, [setCurrentView]);

  const reloadStats = useCallback(() => {
    getArchiveStats().then((stats) => {
      setArchiveStats({
        totalConversations: stats.totalConversations,
        totalProjects: stats.totalProjects,
        totalSize: stats.sizeFormatted,
        archivePath: getArchivePath(),
      });
    });
  }, []);

  // Sync via SSE
  const startSync = useCallback((force: boolean) => {
    setSyncProgress("Starting sync...");
    const url = `${API_BASE}/api/sync${force ? "?force=true" : ""}`;

    fetch(url, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) {
          setSyncProgress(null);
          showNotification("Sync complete");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "progress") {
                  setSyncProgress(`Extracting: ${data.current}/${data.total}...`);
                } else if (data.type === "complete") {
                  setSyncProgress(null);
                  showNotification(`Sync complete: ${data.extracted || 0} extracted`);
                  reloadStats();
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
        setSyncProgress(null);
      })
      .catch((err) => {
        setSyncProgress(null);
        showNotification(`!Sync failed: ${err instanceof Error ? err.message : "unknown"}`);
      });
  }, [showNotification, reloadStats]);

  const handleInput = useCallback((input: string, key: Key, claudeToken: ClaudeTokenActions) => {
    if (claudeToken.isInputMode) {
      claudeToken.handleInput(input, key);
      return;
    }

    if (key.escape) {
      returnToMain();
      return;
    }

    // Row positions for scrolling: Claude ~4, AutoArchive ~8, Skip ~9, SyncNew ~12, Resync ~13, Browse ~16
    const SETTINGS_ROW_MAP = [4, 8, 9, 12, 13, 16];
    const VISIBLE_HEIGHT = 10;
    const TOTAL_CONTENT_LINES = 22;

    if (key.upArrow) {
      const newIndex = Math.max(0, settingsIndex - 1);
      setSettingsIndex(newIndex);
      if (newIndex === 0) {
        setSettingsScrollOffset(0);
      } else {
        const targetRow = SETTINGS_ROW_MAP[newIndex];
        if (targetRow < settingsScrollOffset + 2) {
          setSettingsScrollOffset(Math.max(0, targetRow - 2));
        }
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(SETTINGS_TOTAL_ITEMS - 1, settingsIndex + 1);
      setSettingsIndex(newIndex);
      const targetRow = SETTINGS_ROW_MAP[newIndex];
      if (targetRow >= settingsScrollOffset + VISIBLE_HEIGHT - 2) {
        const maxScroll = Math.max(0, TOTAL_CONTENT_LINES - VISIBLE_HEIGHT);
        setSettingsScrollOffset(Math.min(maxScroll, targetRow - VISIBLE_HEIGHT + 4));
      }
      return;
    }

    if (key.return || input === " ") {
      if (settingsIndex === 0) {
        if (claudeToken.connected) {
          claudeToken.disconnect();
          showNotification("Claude disconnected");
        } else {
          claudeToken.enterInputMode();
        }
      } else if (settingsIndex === 1) {
        const newValue = toggleAutoArchive();
        setAutoArchiveEnabled(newValue);
      } else if (settingsIndex === 2) {
        const newValue = toggleSkipPermissions();
        setSkipPermissions(newValue);
      } else if (settingsIndex === 3) {
        startSync(false);
      } else if (settingsIndex === 4) {
        startSync(true);
      } else if (settingsIndex === 5) {
        onBrowseArchive();
      }
      return;
    }
  }, [settingsIndex, settingsScrollOffset, returnToMain, showNotification, onBrowseArchive, startSync]);

  const reset = useCallback(() => {
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
    setSyncProgress(null);
  }, []);

  return {
    state: {
      index: settingsIndex,
      scrollOffset: settingsScrollOffset,
      autoArchiveEnabled,
      skipPermissions,
      syncProgress,
      archiveStats,
      archiveStatsLoading,
      notificationsEnabled,
      notificationsLoading,
    },
    open,
    reloadStats,
    handleInput,
    reset,
  };
}
