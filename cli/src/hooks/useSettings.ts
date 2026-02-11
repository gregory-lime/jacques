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
import type { NotificationSettings, NotificationCategory } from "@jacques/core/notifications";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@jacques/core/notifications";
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
  notificationSettings: NotificationSettings;
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
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationsLoading, setNotificationsLoading] = useState<boolean>(false);

  const open = useCallback(() => {
    const settings = getArchiveSettings();
    setAutoArchiveEnabled(settings.autoArchive);
    setSkipPermissions(getSkipPermissions());
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
    setCurrentView("settings");

    // Load notification settings from server
    setNotificationsLoading(true);
    fetch(`${API_BASE}/api/notifications/settings`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((settings) => {
        setNotificationSettings(settings as NotificationSettings);
        setNotificationsLoading(false);
      })
      .catch(() => {
        setNotificationsLoading(false);
      });

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

    // Row positions for scrolling (approximate row in contentLines for each selectable item)
    // 0-5: existing items, 6: master toggle, 7-12: category toggles, 13-14: thresholds
    const SETTINGS_ROW_MAP = [4, 8, 9, 12, 13, 16, 19, 20, 21, 22, 23, 24, 25, 27, 28];
    const VISIBLE_HEIGHT = 10;
    const TOTAL_CONTENT_LINES = 30;

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

    // Left/right arrows for threshold adjustment
    if (key.leftArrow || key.rightArrow) {
      if (settingsIndex === 13) {
        const step = key.rightArrow ? 5000 : -5000;
        const newVal = Math.max(5000, Math.min(500_000, notificationSettings.largeOperationThreshold + step));
        if (newVal !== notificationSettings.largeOperationThreshold) {
          setNotificationSettings(prev => ({ ...prev, largeOperationThreshold: newVal }));
          fetch(`${API_BASE}/api/notifications/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ largeOperationThreshold: newVal }),
          }).catch(() => {});
        }
      } else if (settingsIndex === 14) {
        const step = key.rightArrow ? 1 : -1;
        const newVal = Math.max(1, Math.min(50, notificationSettings.bugAlertThreshold + step));
        if (newVal !== notificationSettings.bugAlertThreshold) {
          setNotificationSettings(prev => ({ ...prev, bugAlertThreshold: newVal }));
          fetch(`${API_BASE}/api/notifications/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bugAlertThreshold: newVal }),
          }).catch(() => {});
        }
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
      } else if (settingsIndex === 6) {
        // Master notifications toggle
        const newEnabled = !notificationSettings.enabled;
        setNotificationSettings(prev => ({ ...prev, enabled: newEnabled }));
        fetch(`${API_BASE}/api/notifications/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: newEnabled }),
        }).catch(() => {
          setNotificationSettings(prev => ({ ...prev, enabled: !newEnabled }));
          showNotification("!Failed to update notifications");
        });
      } else if (settingsIndex >= 7 && settingsIndex <= 12) {
        // Category toggles
        const categories: NotificationCategory[] = ["context", "operation", "plan", "auto-compact", "handoff", "bug-alert"];
        const cat = categories[settingsIndex - 7];
        const newValue = !notificationSettings.categories[cat];
        const newCategories = { ...notificationSettings.categories, [cat]: newValue };
        setNotificationSettings(prev => ({ ...prev, categories: newCategories }));
        fetch(`${API_BASE}/api/notifications/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categories: newCategories }),
        }).catch(() => {
          setNotificationSettings(prev => ({
            ...prev,
            categories: { ...prev.categories, [cat]: !newValue },
          }));
          showNotification("!Failed to update category");
        });
      }
      return;
    }
  }, [settingsIndex, settingsScrollOffset, returnToMain, showNotification, onBrowseArchive, startSync, notificationSettings]);

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
      notificationSettings,
      notificationsLoading,
    },
    open,
    reloadStats,
    handleInput,
    reset,
  };
}
